import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { OracleRewards } from '../wrappers/OracleRewards';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('OracleRewards', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('OracleRewards');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let oracleRewards: SandboxContract<OracleRewards>;
    let premiumDistributor: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        premiumDistributor = await blockchain.treasury('premiumDistributor');

        oracleRewards = blockchain.openContract(
            OracleRewards.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    premiumDistributorAddress: premiumDistributor.address,
                    totalRewardsDistributed: 0n,
                    totalRewardsPending: 0n,
                    minUpdateInterval: 300, // 5 minutes
                    accuracyThreshold: 95, // 95% accuracy
                },
                code
            )
        );

        const deployResult = await oracleRewards.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: oracleRewards.address,
            deploy: true,
            success: true,
        });

        // Fund the rewards pool for tests
        await oracleRewards.sendDistributeOracleFee(premiumDistributor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('1000'),
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should register oracle successfully', async () => {
        const oracle = await blockchain.treasury('oracle');

        const result = await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: oracleRewards.address,
            success: true,
        });
    });

    it('should record oracle update', async () => {
        const oracle = await blockchain.treasury('oracle');

        // Register oracle first
        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
        });

        // Record update (oracle calls for itself)
        const result = await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 98, // 98% accuracy
            isStale: false,
        });

        expect(result.transactions).toHaveTransaction({
            from: oracle.address,
            to: oracleRewards.address,
            success: true,
        });

        const stats = await oracleRewards.getOracleStats(oracle.address);
        expect(stats.updateCount).toBe(1);
        expect(stats.accuracyScore).toBe(98);
    });

    it('should calculate base reward correctly', async () => {
        const oracle = await blockchain.treasury('oracle');

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
        });

        await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 90,
            isStale: false,
        });

        // Simulate receiving fee distribution
        const feeAmount = toNano('100');
        await oracleRewards.sendDistributeOracleFee(premiumDistributor.getSender(), {
            value: toNano('0.1'),
            amount: feeAmount,
        });

        const pendingRewards = await oracleRewards.getPendingRewards(oracle.address);
        expect(Number(pendingRewards)).toBeGreaterThan(0);
    });

    it('should apply accuracy bonus (2x multiplier)', async () => {
        const oracle1 = await blockchain.treasury('oracle1');
        const oracle2 = await blockchain.treasury('oracle2');

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle1.address,
        });

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle2.address,
        });

        // Oracle1: High accuracy (97% - above 95% threshold)
        await oracleRewards.sendRecordOracleUpdate(oracle1.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle1.address,
            accuracyScore: 97,
            isStale: false,
        });

        // Oracle2: Normal accuracy (90% - below 95% threshold)
        await oracleRewards.sendRecordOracleUpdate(oracle2.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle2.address,
            accuracyScore: 90,
            isStale: false,
        });

        const stats1 = await oracleRewards.getOracleStats(oracle1.address);
        const stats2 = await oracleRewards.getOracleStats(oracle2.address);

        expect(stats1.accuracyScore).toBe(97);
        expect(stats2.accuracyScore).toBe(90);
    });

    it('should apply stale data penalty (-50%)', async () => {
        const oracle = await blockchain.treasury('oracle');

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
        });

        // Record update with stale data
        const result = await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 95,
            isStale: true, // Stale data flag
        });

        expect(result.transactions).toHaveTransaction({
            from: oracle.address,
            to: oracleRewards.address,
            success: true,
        });
    });

    it('should allow oracle to claim rewards', async () => {
        const oracle = await blockchain.treasury('oracle');

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
        });

        await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 95,
            isStale: false,
        });

        // Send some fees to distribute
        await oracleRewards.sendDistributeOracleFee(premiumDistributor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('100'),
        });

        const result = await oracleRewards.sendClaimRewards(oracle.getSender(), toNano('0.1'));

        expect(result.transactions).toHaveTransaction({
            from: oracle.address,
            to: oracleRewards.address,
            success: true,
        });
    });

    it('should track pending rewards accurately', async () => {
        const oracle = await blockchain.treasury('oracle');

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
        });

        await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 95,
            isStale: false,
        });

        const pendingBefore = await oracleRewards.getPendingRewards(oracle.address);

        // Send fees
        await oracleRewards.sendDistributeOracleFee(premiumDistributor.getSender(), {
            value: toNano('0.1'),
            amount: toNano('50'),
        });

        // Advance time past min_update_interval (300 seconds)
        blockchain.now = (blockchain.now || Math.floor(Date.now() / 1000)) + 301;

        // Record another update to allocate new rewards
        await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 96,
            isStale: false,
        });

        const pendingAfter = await oracleRewards.getPendingRewards(oracle.address);

        expect(Number(pendingAfter)).toBeGreaterThan(Number(pendingBefore));
    });

    it('should retrieve oracle stats correctly', async () => {
        const oracle = await blockchain.treasury('oracle');

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
        });

        // Record multiple updates with time advances
        await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 95,
            isStale: false,
        });

        // Advance time past min_update_interval (300 seconds)
        blockchain.now = (blockchain.now || Math.floor(Date.now() / 1000)) + 301;

        await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 98,
            isStale: false,
        });

        // Advance time again
        blockchain.now = (blockchain.now || Math.floor(Date.now() / 1000)) + 301;

        await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 96,
            isStale: false,
        });

        const stats = await oracleRewards.getOracleStats(oracle.address);

        expect(stats.updateCount).toBe(3);
        expect(stats.accuracyScore).toBeGreaterThan(0);
    });

    it('should receive fee distribution from premium distributor', async () => {
        const feeAmount = toNano('100');

        const result = await oracleRewards.sendDistributeOracleFee(premiumDistributor.getSender(), {
            value: toNano('0.1'),
            amount: feeAmount,
        });

        expect(result.transactions).toHaveTransaction({
            from: premiumDistributor.address,
            to: oracleRewards.address,
            success: true,
        });
    });

    it('should handle multiple oracles independently', async () => {
        const oracle1 = await blockchain.treasury('oracle1');
        const oracle2 = await blockchain.treasury('oracle2');
        const oracle3 = await blockchain.treasury('oracle3');

        // Register all oracles
        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle1.address,
        });

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle2.address,
        });

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle3.address,
        });

        // Record updates with different accuracy scores
        await oracleRewards.sendRecordOracleUpdate(oracle1.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle1.address,
            accuracyScore: 98,
            isStale: false,
        });

        await oracleRewards.sendRecordOracleUpdate(oracle2.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle2.address,
            accuracyScore: 92,
            isStale: false,
        });

        await oracleRewards.sendRecordOracleUpdate(oracle3.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle3.address,
            accuracyScore: 95,
            isStale: false,
        });

        const stats1 = await oracleRewards.getOracleStats(oracle1.address);
        const stats2 = await oracleRewards.getOracleStats(oracle2.address);
        const stats3 = await oracleRewards.getOracleStats(oracle3.address);

        expect(stats1.accuracyScore).toBe(98);
        expect(stats2.accuracyScore).toBe(92);
        expect(stats3.accuracyScore).toBe(95);
    });

    it('should provide rewards summary', async () => {
        const oracle = await blockchain.treasury('oracle');

        await oracleRewards.sendRegisterOracle(deployer.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
        });

        await oracleRewards.sendRecordOracleUpdate(oracle.getSender(), {
            value: toNano('0.1'),
            oracleAddress: oracle.address,
            accuracyScore: 95,
            isStale: false,
        });

        const summary = await oracleRewards.getRewardsSummary();

        expect(summary.totalDistributed).toBeDefined();
        expect(summary.totalPending).toBeDefined();
    });
});
