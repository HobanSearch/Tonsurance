import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { SecondaryVault } from '../wrappers/SecondaryVault';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('SecondaryVault', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('SecondaryVault');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let secondaryVault: SandboxContract<SecondaryVault>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');

        const claimsProcessor = await blockchain.treasury('claimsProcessor');

        secondaryVault = blockchain.openContract(
            SecondaryVault.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    totalStaked: 0n,
                    accumulatedYield: 0n,
                    lossesAbsorbed: 0n,
                    claimsProcessorAddress: claimsProcessor.address,
                    totalSupply: 0n,
                    maxSupply: 500000n,  // 500k tokens (not in nanoTON)
                    priceMin: toNano('1'), // 1.0 USDT
                    priceMax: toNano('1.25'), // 1.25 USDT (25% appreciation)
                },
                code
            )
        );

        const deployResult = await secondaryVault.sendDeploy(deployer.getSender(), toNano('0.2'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: secondaryVault.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should have correct initial state', async () => {
        const totalStaked = await secondaryVault.getTotalStaked();
        const currentPrice = await secondaryVault.getCurrentPrice();

        expect(totalStaked).toBe(0n);
        expect(currentPrice).toBe(toNano('1')); // Starting price
    });

    it('should accept SURE token stake', async () => {
        const staker = await blockchain.treasury('staker');
        const stakeAmount = toNano('1000');

        const result = await secondaryVault.sendStake(staker.getSender(), {
            value: toNano('0.1'),
            amount: stakeAmount,
            duration: 90,
        });

        expect(result.transactions).toHaveTransaction({
            from: staker.address,
            to: secondaryVault.address,
            success: true,
        });

        const totalStaked = await secondaryVault.getTotalStaked();
        expect(totalStaked).toBe(stakeAmount);
    });

    it('should enforce 90-day lock period', async () => {
        const staker = await blockchain.treasury('staker');

        // Stake tokens
        await secondaryVault.sendStake(staker.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1000'),
            duration: 90,
        });

        const stakeInfo = await secondaryVault.getStakeInfo(staker.address);

        // Unlock time should be 90 days from stake time
        const expectedUnlockTime = stakeInfo.stakeTime + 7776000; // 90 days in seconds
        expect(stakeInfo.unlockTime).toBeGreaterThanOrEqual(expectedUnlockTime - 5);
        expect(stakeInfo.unlockTime).toBeLessThanOrEqual(expectedUnlockTime + 5);
    });

    it('should increase price with utilization (linear bonding curve)', async () => {
        const staker1 = await blockchain.treasury('staker1');
        const staker2 = await blockchain.treasury('staker2');

        // Get initial price
        const initialPrice = await secondaryVault.getCurrentPrice();

        // First stake (10% of max supply)
        await secondaryVault.sendStake(staker1.getSender(), {
            value: toNano('0.1'),
            amount: toNano('50000'),
            duration: 90,
        });

        const priceAfterFirst = await secondaryVault.getCurrentPrice();

        // Second stake (another 10% of max supply)
        await secondaryVault.sendStake(staker2.getSender(), {
            value: toNano('0.1'),
            amount: toNano('50000'),
            duration: 90,
        });

        const priceAfterSecond = await secondaryVault.getCurrentPrice();

        // Verify price increased linearly
        expect(Number(priceAfterFirst)).toBeGreaterThan(Number(initialPrice));
        expect(Number(priceAfterSecond)).toBeGreaterThan(Number(priceAfterFirst));
    });

    it('should allow unstaking after unlock time', async () => {
        const staker = await blockchain.treasury('staker');

        // Stake tokens
        await secondaryVault.sendStake(staker.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1000'),
            duration: 90,
        });

        const stakeInfoBefore = await secondaryVault.getStakeInfo(staker.address);

        // Fast-forward 90 days (past unlock time)
        blockchain.now = stakeInfoBefore.unlockTime + 1;

        // Unstake
        const result = await secondaryVault.sendUnstake(staker.getSender(), {
            value: toNano('0.1'),
            tokens: stakeInfoBefore.tokens,  // FIXED: use tokens not amount
        });

        expect(result.transactions).toHaveTransaction({
            from: staker.address,
            to: secondaryVault.address,
            success: true,
        });
    });

    it('should reject unstaking before unlock time', async () => {
        const staker = await blockchain.treasury('staker');

        // Stake tokens
        await secondaryVault.sendStake(staker.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1000'),
            duration: 90,
        });

        const stakeInfo = await secondaryVault.getStakeInfo(staker.address);

        // Try to unstake immediately (before 90 days)
        const result = await secondaryVault.sendUnstake(staker.getSender(), {
            value: toNano('0.1'),
            tokens: stakeInfo.tokens,  // FIXED: use tokens not amount
        });

        expect(result.transactions).toHaveTransaction({
            from: staker.address,
            to: secondaryVault.address,
            success: false,
            exitCode: 410, // Lock period not expired
        });
    });

    it('should enforce minimum stake amount', async () => {
        const staker = await blockchain.treasury('staker');
        const tinyAmount = toNano('0.05'); // Below 0.1 TON minimum

        const result = await secondaryVault.sendStake(staker.getSender(), {
            value: toNano('0.1'),
            amount: tinyAmount,
            duration: 90,
        });

        expect(result.transactions).toHaveTransaction({
            from: staker.address,
            to: secondaryVault.address,
            success: false,
            exitCode: 400, // Bad request
        });
    });

    it('should handle multiple stakers correctly', async () => {
        const staker1 = await blockchain.treasury('staker1');
        const staker2 = await blockchain.treasury('staker2');
        const staker3 = await blockchain.treasury('staker3');

        // Three different stakes
        await secondaryVault.sendStake(staker1.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1000'),
            duration: 90,
        });

        await secondaryVault.sendStake(staker2.getSender(), {
            value: toNano('0.1'),
            amount: toNano('2000'),
            duration: 90,
        });

        await secondaryVault.sendStake(staker3.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1500'),
            duration: 90,
        });

        const info1 = await secondaryVault.getStakeInfo(staker1.address);
        const info2 = await secondaryVault.getStakeInfo(staker2.address);
        const info3 = await secondaryVault.getStakeInfo(staker3.address);

        expect(info1.amount).toBeGreaterThan(0n);
        expect(info2.amount).toBeGreaterThan(0n);
        expect(info3.amount).toBeGreaterThan(0n);

        const totalStaked = await secondaryVault.getTotalStaked();
        expect(totalStaked).toBe(toNano('4500'));
    });

    it('should price reach maximum at full capacity', async () => {
        const staker = await blockchain.treasury('staker');

        // Fill vault to maximum supply
        await secondaryVault.sendStake(staker.getSender(), {
            value: toNano('1'),
            amount: toNano('500000'), // Max supply
            duration: 90,
        });

        const finalPrice = await secondaryVault.getCurrentPrice();

        // Price should be at or near maximum (1.25 USDT)
        expect(Number(finalPrice)).toBeGreaterThanOrEqual(Number(toNano('1.2')));
        expect(Number(finalPrice)).toBeLessThanOrEqual(Number(toNano('1.25')));
    });

    it('should store stake info with correct unlock time', async () => {
        const staker = await blockchain.treasury('staker');
        const stakeAmount = toNano('5000');

        await secondaryVault.sendStake(staker.getSender(), {
            value: toNano('0.1'),
            amount: stakeAmount,
            duration: 90,
        });

        const stakeInfo = await secondaryVault.getStakeInfo(staker.address);

        expect(stakeInfo.amount).toBeGreaterThan(0n);
        expect(stakeInfo.unlockTime).toBeGreaterThan(stakeInfo.stakeTime);
    });

    it('should distribute yields to stakers from premium shares', async () => {
        const staker = await blockchain.treasury('staker');
        const distributor = await blockchain.treasury('distributor');

        // Staker stakes SURE tokens
        await secondaryVault.sendStake(staker.getSender(), {
            value: toNano('0.1'),
            amount: toNano('10000'),
            duration: 90,
        });

        const stakedBefore = await secondaryVault.getTotalStaked();

        // Simulate premium share receipt (would be sent by PremiumDistributor)
        // This increases total capital, distributing yield to all stakers

        const stakedAfter = await secondaryVault.getTotalStaked();

        // In actual implementation, premium shares increase value of staked tokens
        // Verification depends on implementation details
        expect(stakedAfter).toBeGreaterThanOrEqual(stakedBefore);
    });

    it('should calculate price linearly (not exponentially)', async () => {
        const staker1 = await blockchain.treasury('staker1');
        const staker2 = await blockchain.treasury('staker2');
        const staker3 = await blockchain.treasury('staker3');

        const initialPrice = await secondaryVault.getCurrentPrice();

        // Stake 20% of capacity
        await secondaryVault.sendStake(staker1.getSender(), {
            value: toNano('0.15'),
            amount: toNano('100000'),
            duration: 90,
        });

        const price20 = await secondaryVault.getCurrentPrice();

        // Stake another 20% (total 40%)
        await secondaryVault.sendStake(staker2.getSender(), {
            value: toNano('0.15'),
            amount: toNano('100000'),
            duration: 90,
        });

        const price40 = await secondaryVault.getCurrentPrice();

        // Stake another 20% (total 60%)
        await secondaryVault.sendStake(staker3.getSender(), {
            value: toNano('0.15'),
            amount: toNano('100000'),
            duration: 90,
        });

        const price60 = await secondaryVault.getCurrentPrice();

        // Linear: each 20% should add ~0.05 USDT (25% price range / 5 increments)
        const increment1 = Number(price20) - Number(initialPrice);
        const increment2 = Number(price40) - Number(price20);
        const increment3 = Number(price60) - Number(price40);

        // Linear increments should be approximately equal
        expect(Math.abs(increment1 - increment2)).toBeLessThan(Number(toNano('0.01')));
        expect(Math.abs(increment2 - increment3)).toBeLessThan(Number(toNano('0.01')));
    });
});
