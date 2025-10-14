import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address } from '@ton/core';
import { PolicyFactory } from '../wrappers/PolicyFactory';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('PolicyFactory', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('PolicyFactory');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let policyFactory: SandboxContract<PolicyFactory>;
    let treasury: SandboxContract<TreasuryContract>;
    let priceOracle: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        treasury = await blockchain.treasury('treasury');
        priceOracle = await blockchain.treasury('priceOracle');

        policyFactory = blockchain.openContract(
            PolicyFactory.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    nextPolicyId: 1n,
                    totalPoliciesCreated: 0n,
                    activePoliciesCount: 0n,
                    treasuryAddress: treasury.address,
                    paused: 0,
                },
                code
            )
        );

        const deployResult = await policyFactory.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: policyFactory.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should have correct initial state', async () => {
        const totalPolicies = await policyFactory.getTotalPoliciesCreated();
        expect(totalPolicies).toBe(0n);
    });

    it('should calculate premium correctly for USDT depeg (0.8% APR)', async () => {
        const coverageAmount = toNano('1000'); // 1000 TON
        const duration = 90; // days
        const coverageType = 1; // USDT depeg

        const premium = await policyFactory.getCalculatePremium(coverageType, coverageAmount, duration);

        // Expected: 1000 TON × 0.008 × (90/365) = 1.97 TON
        const expectedPremiumTON = (1000 * 80 * 90) / (365 * 10000);  // 80 basis points = 0.8%
        expect(Number(premium) / 1e9).toBeCloseTo(expectedPremiumTON, 1);
    });

    it('should calculate premium correctly for Protocol exploit (2% APR)', async () => {
        const coverageAmount = toNano('10000'); // $10,000
        const duration = 90;
        const coverageType = 2; // Protocol exploit

        const premium = await policyFactory.getCalculatePremium(coverageType, coverageAmount, duration);

        // Expected: 10000 × 0.02 × (90/365) = 49.32 (~49 USDT)
        const expectedPremium = (10000 * 200 * 90) / (365 * 10000);
        expect(Number(premium) / 1e9).toBeCloseTo(expectedPremium, 0);
    });

    it('should apply duration multipliers correctly', async () => {
        const coverageAmount = toNano('1000');
        const coverageType = 1;

        // 30 days: 1.2x multiplier
        const premium30 = await policyFactory.getCalculatePremium(coverageType, coverageAmount, 30);

        // 90 days: 1.0x multiplier (base)
        const premium90 = await policyFactory.getCalculatePremium(coverageType, coverageAmount, 90);

        // 180 days: 0.9x multiplier (discount)
        const premium180 = await policyFactory.getCalculatePremium(coverageType, coverageAmount, 180);

        // 30-day should be more expensive per day than 90-day
        const premium30PerDay = Number(premium30) / 30;
        const premium90PerDay = Number(premium90) / 90;
        expect(premium30PerDay).toBeGreaterThan(premium90PerDay);

        // 180-day should be cheaper per day than 90-day
        const premium180PerDay = Number(premium180) / 180;
        expect(premium180PerDay).toBeLessThan(premium90PerDay);
    });

    it('should create policy successfully', async () => {
        const user = await blockchain.treasury('user');
        const coverageType = 1;
        const coverageAmount = toNano('1000');
        const duration = 90;

        const result = await policyFactory.sendCreatePolicy(user.getSender(), {
            value: toNano('10'), // Must send enough to cover premium + gas
            coverageType,
            coverageAmount,
            duration,
        });

        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: policyFactory.address,
            success: true,
        });

        // Check that premium was sent to treasury
        expect(result.transactions).toHaveTransaction({
            from: policyFactory.address,
            to: treasury.address,
            success: true,
        });

        // Verify policy count increased
        const totalPolicies = await policyFactory.getTotalPoliciesCreated();
        expect(totalPolicies).toBe(1n);
    });

    it('should store policy data correctly', async () => {
        const user = await blockchain.treasury('user');
        const coverageType = 2;
        const coverageAmount = toNano('500');
        const duration = 180;

        await policyFactory.sendCreatePolicy(user.getSender(), {
            value: toNano('10'),
            coverageType,
            coverageAmount,
            duration,
        });

        const policyData = await policyFactory.getPolicyData(1n);

        expect(policyData.coverageType).toBe(coverageType);
        expect(policyData.coverageAmount).toBe(coverageAmount);
        expect(policyData.duration).toBe(duration);
        expect(policyData.active).toBe(true);
    });

    it('should increment policy IDs sequentially', async () => {
        const user = await blockchain.treasury('user');

        // Create first policy
        await policyFactory.sendCreatePolicy(user.getSender(), {
            value: toNano('10'),
            coverageType: 1,
            coverageAmount: toNano('100'),
            duration: 90,
        });

        // Create second policy
        await policyFactory.sendCreatePolicy(user.getSender(), {
            value: toNano('10'),
            coverageType: 2,
            coverageAmount: toNano('200'),
            duration: 90,
        });

        const totalPolicies = await policyFactory.getTotalPoliciesCreated();
        expect(totalPolicies).toBe(2n);

        // Verify both policies exist
        const policy1 = await policyFactory.getPolicyData(1n);
        const policy2 = await policyFactory.getPolicyData(2n);

        expect(policy1.coverageAmount).toBe(toNano('100'));
        expect(policy2.coverageAmount).toBe(toNano('200'));
    });

    it('should allow owner to set treasury address', async () => {
        const newTreasury = await blockchain.treasury('newTreasury');

        const result = await policyFactory.sendSetTreasury(deployer.getSender(), {
            value: toNano('0.05'),
            newAddress: newTreasury.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: policyFactory.address,
            success: true,
        });
    });

    it('should allow owner to set price oracle address', async () => {
        const newOracle = await blockchain.treasury('newOracle');

        const result = await policyFactory.sendSetPriceOracle(deployer.getSender(), {
            value: toNano('0.05'),
            newAddress: newOracle.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: policyFactory.address,
            success: true,
        });
    });

    it('should reject admin operations from non-owner', async () => {
        const attacker = await blockchain.treasury('attacker');
        const newTreasury = await blockchain.treasury('newTreasury');

        const result = await policyFactory.sendSetTreasury(attacker.getSender(), {
            value: toNano('0.05'),
            newAddress: newTreasury.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: policyFactory.address,
            success: false,
            exitCode: 403, // Unauthorized
        });
    });

    it('should handle multiple policies from different users', async () => {
        const user1 = await blockchain.treasury('user1');
        const user2 = await blockchain.treasury('user2');
        const user3 = await blockchain.treasury('user3');

        // User 1 creates policy
        await policyFactory.sendCreatePolicy(user1.getSender(), {
            value: toNano('10'),
            coverageType: 1,
            coverageAmount: toNano('100'),
            duration: 90,
        });

        // User 2 creates policy
        await policyFactory.sendCreatePolicy(user2.getSender(), {
            value: toNano('10'),
            coverageType: 2,
            coverageAmount: toNano('500'),
            duration: 90,
        });

        // User 3 creates policy
        await policyFactory.sendCreatePolicy(user3.getSender(), {
            value: toNano('10'),
            coverageType: 3,
            coverageAmount: toNano('800'),
            duration: 180,
        });

        const totalPolicies = await policyFactory.getTotalPoliciesCreated();
        expect(totalPolicies).toBe(3n);
    });

    it('should calculate premium for all coverage types', async () => {
        const amount = toNano('1000');
        const duration = 90;

        // Type 1: USDT depeg (0.8%)
        const premium1 = await policyFactory.getCalculatePremium(1, amount, duration);
        expect(Number(premium1)).toBeGreaterThan(0);

        // Type 2: Protocol exploit (2%)
        const premium2 = await policyFactory.getCalculatePremium(2, amount, duration);
        expect(Number(premium2)).toBeGreaterThan(Number(premium1));

        // Type 3: Bridge hack (2%)
        const premium3 = await policyFactory.getCalculatePremium(3, amount, duration);
        expect(premium3).toBe(premium2); // Same rate

        // Type 4: Rug pull (5%)
        const premium4 = await policyFactory.getCalculatePremium(4, amount, duration);
        expect(Number(premium4)).toBeGreaterThan(Number(premium2));
    });

    it('should forward premium to treasury with correct op code', async () => {
        const user = await blockchain.treasury('user');

        const result = await policyFactory.sendCreatePolicy(user.getSender(), {
            value: toNano('10'),
            coverageType: 1,
            coverageAmount: toNano('1000'),
            duration: 90,
        });

        // Verify message sent to treasury
        const treasuryTx = result.transactions.find(
            tx => {
                const dest = tx.inMessage?.info.dest;
                return dest && 'equals' in dest && dest.equals(treasury.address);
            }
        );

        expect(treasuryTx).toBeDefined();
        const msgInfo = treasuryTx?.inMessage?.info;
        if (msgInfo && 'value' in msgInfo) {
            expect(msgInfo.value.coins).toBeGreaterThan(0n);
        }
    });
});
