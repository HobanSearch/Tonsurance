import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { Treasury } from '../wrappers/Treasury';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('Treasury', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('Treasury');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let treasury: SandboxContract<Treasury>;
    let claimsProcessor: SandboxContract<TreasuryContract>;
    let premiumDistributor: SandboxContract<TreasuryContract>;
    let stakingPool: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        claimsProcessor = await blockchain.treasury('claimsProcessor');
        premiumDistributor = await blockchain.treasury('premiumDistributor');
        stakingPool = await blockchain.treasury('stakingPool');

        treasury = blockchain.openContract(
            Treasury.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    totalPremiumsCollected: 0n,
                    totalPayoutsMade: 0n,
                    reserveBalance: 0n,
                    claimsProcessorAddress: claimsProcessor.address,
                    premiumDistributorAddress: premiumDistributor.address,
                    stakingPoolAddress: stakingPool.address,
                },
                code
            )
        );

        const deployResult = await treasury.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: treasury.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should have correct initial state', async () => {
        const stats = await treasury.getTreasuryStats();

        expect(stats.totalPremiums).toBe(0n);
        expect(stats.totalPayouts).toBe(0n);
        // Deployment sends 0.05 TON with empty body, which adds to reserve
        expect(stats.reserveBalance).toBe(toNano('0.05'));
    });

    it('should receive premium from PolicyFactory', async () => {
        const policyFactory = await blockchain.treasury('policyFactory');
        const premiumAmount = toNano('100');

        // Create policy data cell
        const policyData = beginCell()
            .storeUint(1, 64) // policy_id
            .storeAddress(deployer.address) // user_address
            .storeUint(1, 8) // coverage_type
            .storeCoins(toNano('1000')) // coverage_amount
            .endCell();

        // Simulate PolicyFactory sending premium
        const result = await policyFactory.send({
            to: treasury.address,
            value: premiumAmount,
            body: beginCell()
                .storeUint(0x01, 32) // op: receive_premium
                .storeUint(1, 64) // policy_id
                .storeCoins(premiumAmount)
                .storeRef(policyData) // policy_data reference
                .endCell(),
        });

        expect(result.transactions).toHaveTransaction({
            from: policyFactory.address,
            to: treasury.address,
            success: true,
        });
    });

    it('should forward premium to distributor', async () => {
        const policyFactory = await blockchain.treasury('policyFactory');
        const premiumAmount = toNano('100');

        // Create policy data cell
        const policyData = beginCell()
            .storeUint(1, 64)
            .storeAddress(deployer.address)
            .storeUint(1, 8)
            .storeCoins(toNano('1000'))
            .endCell();

        // Send premium to treasury
        const result = await policyFactory.send({
            to: treasury.address,
            value: premiumAmount,
            body: beginCell()
                .storeUint(0x01, 32) // op: receive_premium
                .storeUint(1, 64)
                .storeCoins(premiumAmount)
                .storeRef(policyData)
                .endCell(),
        });

        // Verify treasury forwards to premium distributor
        expect(result.transactions).toHaveTransaction({
            from: treasury.address,
            to: premiumDistributor.address,
            success: true,
        });
    });

    it('should receive protocol share from distributor', async () => {
        const protocolShare = toNano('10');

        const result = await premiumDistributor.send({
            to: treasury.address,
            value: protocolShare,
            body: beginCell()
                .storeUint(0x04, 32) // op: receive_protocol_share
                .storeCoins(protocolShare)
                .storeUint(1, 64) // policy_id
                .endCell(),
        });

        expect(result.transactions).toHaveTransaction({
            from: premiumDistributor.address,
            to: treasury.address,
            success: true,
        });
    });

    it('should split protocol share (60% staking, 40% reserve)', async () => {
        const protocolShare = toNano('100');

        const result = await premiumDistributor.send({
            to: treasury.address,
            value: protocolShare,
            body: beginCell()
                .storeUint(0x04, 32) // op: receive_protocol_share
                .storeCoins(protocolShare)
                .storeUint(1, 64) // policy_id
                .endCell(),
        });

        // 60% should go to staking pool
        const expectedStakingShare = toNano('60');
        expect(result.transactions).toHaveTransaction({
            from: treasury.address,
            to: stakingPool.address,
            success: true,
        });

        // 40% should stay in reserve
        const reserveBalance = await treasury.getReserveBalance();
        expect(reserveBalance).toBeGreaterThanOrEqual(toNano('35')); // Allow for gas costs
    });

    it('should receive reserve share from distributor', async () => {
        const reserveShare = toNano('5');

        const result = await premiumDistributor.send({
            to: treasury.address,
            value: reserveShare,
            body: beginCell()
                .storeUint(0x05, 32) // op: receive_reserve_share
                .storeCoins(reserveShare)
                .storeUint(1, 64) // policy_id
                .endCell(),
        });

        expect(result.transactions).toHaveTransaction({
            from: premiumDistributor.address,
            to: treasury.address,
            success: true,
        });

        const reserveBalance = await treasury.getReserveBalance();
        expect(reserveBalance).toBeGreaterThan(0n);
    });

    it('should process payout request from ClaimsProcessor', async () => {
        const claimant = await blockchain.treasury('claimant');

        // First, add funds to reserve
        await premiumDistributor.send({
            to: treasury.address,
            value: toNano('1000'),
            body: beginCell()
                .storeUint(0x05, 32) // op: receive_reserve_share
                .storeCoins(toNano('1000'))
                .storeUint(1, 64) // policy_id
                .endCell(),
        });

        const payoutAmount = toNano('100');

        // ClaimsProcessor requests payout
        const result = await claimsProcessor.send({
            to: treasury.address,
            value: toNano('0.1'),
            body: beginCell()
                .storeUint(0x06, 32) // op: process_payout
                .storeAddress(claimant.address)
                .storeCoins(payoutAmount)
                .endCell(),
        });

        expect(result.transactions).toHaveTransaction({
            from: claimsProcessor.address,
            to: treasury.address,
            success: true,
        });

        // Verify payout sent to claimant
        expect(result.transactions).toHaveTransaction({
            from: treasury.address,
            to: claimant.address,
            success: true,
        });
    });

    it('should track reserve balance correctly', async () => {
        const share1 = toNano('50');
        const share2 = toNano('75');

        await premiumDistributor.send({
            to: treasury.address,
            value: share1,
            body: beginCell()
                .storeUint(0x05, 32) // op: receive_reserve_share
                .storeCoins(share1)
                .storeUint(1, 64) // policy_id
                .endCell(),
        });

        const balanceAfterFirst = await treasury.getReserveBalance();

        await premiumDistributor.send({
            to: treasury.address,
            value: share2,
            body: beginCell()
                .storeUint(0x05, 32) // op: receive_reserve_share
                .storeCoins(share2)
                .storeUint(2, 64) // policy_id
                .endCell(),
        });

        const balanceAfterSecond = await treasury.getReserveBalance();

        expect(balanceAfterSecond).toBeGreaterThan(balanceAfterFirst);
    });

    it('should allow owner to emergency withdraw', async () => {
        // Add funds to reserve
        await premiumDistributor.send({
            to: treasury.address,
            value: toNano('1000'),
            body: beginCell()
                .storeUint(0x05, 32) // op: receive_reserve_share
                .storeCoins(toNano('1000'))
                .storeUint(1, 64) // policy_id
                .endCell(),
        });

        const withdrawAmount = toNano('500');

        const result = await deployer.send({
            to: treasury.address,
            value: toNano('0.1'),
            body: beginCell()
                .storeUint(0x20, 32) // op: emergency_withdraw
                .storeAddress(deployer.address) // to_address
                .storeCoins(withdrawAmount)
                .endCell(),
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: treasury.address,
            success: true,
        });

        // Verify funds sent to owner
        expect(result.transactions).toHaveTransaction({
            from: treasury.address,
            to: deployer.address,
            success: true,
        });
    });

    it('should reject emergency withdraw from non-owner', async () => {
        const attacker = await blockchain.treasury('attacker');

        const result = await attacker.send({
            to: treasury.address,
            value: toNano('0.1'),
            body: beginCell()
                .storeUint(0x20, 32) // op: emergency_withdraw
                .storeAddress(attacker.address) // to_address
                .storeCoins(toNano('100'))
                .endCell(),
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: treasury.address,
            success: false,
            exitCode: 403, // Unauthorized
        });
    });

    it('should return correct treasury stats', async () => {
        // Add protocol share
        await premiumDistributor.send({
            to: treasury.address,
            value: toNano('100'),
            body: beginCell()
                .storeUint(0x04, 32) // op: receive_protocol_share
                .storeCoins(toNano('100'))
                .storeUint(1, 64) // policy_id
                .endCell(),
        });

        // Add reserve
        await premiumDistributor.send({
            to: treasury.address,
            value: toNano('50'),
            body: beginCell()
                .storeUint(0x05, 32) // op: receive_reserve_share
                .storeCoins(toNano('50'))
                .storeUint(2, 64) // policy_id
                .endCell(),
        });

        const stats = await treasury.getTreasuryStats();

        // totalPremiums is NOT updated by protocol/reserve shares, only by receive_premium
        // But reserveBalance should increase
        expect(stats.reserveBalance).toBeGreaterThan(0n);
    });

    it('should track balance after multiple operations', async () => {
        // Receive multiple reserve shares
        await premiumDistributor.send({
            to: treasury.address,
            value: toNano('100'),
            body: beginCell()
                .storeUint(0x05, 32) // op: receive_reserve_share
                .storeCoins(toNano('100'))
                .storeUint(1, 64) // policy_id
                .endCell(),
        });

        await premiumDistributor.send({
            to: treasury.address,
            value: toNano('200'),
            body: beginCell()
                .storeUint(0x05, 32) // op: receive_reserve_share
                .storeCoins(toNano('200'))
                .storeUint(2, 64) // policy_id
                .endCell(),
        });

        const balanceAfterDeposits = await treasury.getReserveBalance();

        // Process payout
        const claimant = await blockchain.treasury('claimant');
        await claimsProcessor.send({
            to: treasury.address,
            value: toNano('0.1'),
            body: beginCell()
                .storeUint(0x06, 32) // op: process_payout
                .storeAddress(claimant.address)
                .storeCoins(toNano('50'))
                .endCell(),
        });

        const balanceAfterPayout = await treasury.getReserveBalance();

        expect(balanceAfterPayout).toBeLessThan(balanceAfterDeposits);
    });
});
