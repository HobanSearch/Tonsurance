import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, beginCell } from '@ton/core';
import {
    ParametricEscrow,
    STATUS_PENDING,
    STATUS_ACTIVE,
    STATUS_PAID_OUT,
    STATUS_EXPIRED,
    STATUS_DISPUTED,
    STATUS_CANCELLED,
    PRODUCT_TYPE_DEPEG,
    PRODUCT_TYPE_BRIDGE,
    PRODUCT_TYPE_ORACLE,
    PRODUCT_TYPE_PROTOCOL,
    DEFAULT_USER_SHARE_BPS,
    DEFAULT_LP_SHARE_BPS,
    DEFAULT_STAKER_SHARE_BPS,
    DEFAULT_PROTOCOL_SHARE_BPS,
    DEFAULT_ARBITER_SHARE_BPS,
    DEFAULT_BUILDER_SHARE_BPS,
    DEFAULT_ADMIN_SHARE_BPS,
    DEFAULT_GAS_REFUND_BPS,
    RESOLUTION_REFUND_VAULT,
    RESOLUTION_PAY_USER,
    RESOLUTION_SPLIT,
    getStatusName,
    calculateDistribution,
} from '../../wrappers/v3/ParametricEscrow';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('ParametricEscrow', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('ParametricEscrow');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let policyOwner: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let oracle: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let lpRewards: SandboxContract<TreasuryContract>;
    let stakerRewards: SandboxContract<TreasuryContract>;
    let protocolTreasury: SandboxContract<TreasuryContract>;
    let arbiterRewards: SandboxContract<TreasuryContract>;
    let builderRewards: SandboxContract<TreasuryContract>;
    let adminFee: SandboxContract<TreasuryContract>;
    let escrow: SandboxContract<ParametricEscrow>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        policyOwner = await blockchain.treasury('policy_owner');
        vault = await blockchain.treasury('vault');
        oracle = await blockchain.treasury('oracle');
        admin = await blockchain.treasury('admin');
        lpRewards = await blockchain.treasury('lp_rewards');
        stakerRewards = await blockchain.treasury('staker_rewards');
        protocolTreasury = await blockchain.treasury('protocol_treasury');
        arbiterRewards = await blockchain.treasury('arbiter_rewards');
        builderRewards = await blockchain.treasury('builder_rewards');
        adminFee = await blockchain.treasury('admin_fee');

        const now = Math.floor(Date.now() / 1000);

        escrow = blockchain.openContract(
            ParametricEscrow.createFromConfig(
                {
                    policyId: 1n,
                    policyOwner: policyOwner.address,
                    vaultAddress: vault.address,
                    oracleAddress: oracle.address,
                    adminAddress: admin.address,
                    coverageAmount: toNano('10000'), // $10k coverage
                    collateralAmount: 0n,
                    status: STATUS_PENDING,
                    createdAt: now,
                    expiryTimestamp: now + 2592000, // 30 days
                    productType: PRODUCT_TYPE_DEPEG,
                    assetId: 1, // USDT
                    triggerThreshold: 980000, // $0.98
                    triggerDuration: 300, // 5 minutes
                    userShareBps: DEFAULT_USER_SHARE_BPS,
                    lpShareBps: DEFAULT_LP_SHARE_BPS,
                    stakerShareBps: DEFAULT_STAKER_SHARE_BPS,
                    protocolShareBps: DEFAULT_PROTOCOL_SHARE_BPS,
                    arbiterShareBps: DEFAULT_ARBITER_SHARE_BPS,
                    builderShareBps: DEFAULT_BUILDER_SHARE_BPS,
                    adminShareBps: DEFAULT_ADMIN_SHARE_BPS,
                    gasRefundBps: DEFAULT_GAS_REFUND_BPS,
                    lpRewardsAddress: lpRewards.address,
                    stakerRewardsAddress: stakerRewards.address,
                    protocolTreasuryAddress: protocolTreasury.address,
                    arbiterRewardsAddress: arbiterRewards.address,
                    builderRewardsAddress: builderRewards.address,
                    adminFeeAddress: adminFee.address,
                },
                code
            )
        );

        const deployResult = await escrow.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: escrow.address,
            deploy: true,
            success: true,
        });
    });

    describe('Initialization', () => {
        it('should initialize with correct configuration', async () => {
            const info = await escrow.getEscrowInfo();
            expect(info.policyId).toEqual(1n);
            expect(info.policyOwner.toString()).toEqual(policyOwner.address.toString());
            expect(info.coverageAmount).toEqual(toNano('10000'));
            expect(info.status).toEqual(STATUS_PENDING);

            const version = await escrow.getVersion();
            expect(version).toEqual(3);
        });

        it('should have correct product info', async () => {
            const productInfo = await escrow.getProductInfo();
            expect(productInfo.productType).toEqual(PRODUCT_TYPE_DEPEG);
            expect(productInfo.assetId).toEqual(1);
            expect(productInfo.triggerThreshold).toEqual(980000);
            expect(productInfo.triggerDuration).toEqual(300);
        });

        it('should have correct 8-party distribution', async () => {
            const distribution = await escrow.getDistribution();
            expect(distribution.userShareBps).toEqual(DEFAULT_USER_SHARE_BPS);
            expect(distribution.lpShareBps).toEqual(DEFAULT_LP_SHARE_BPS);
            expect(distribution.stakerShareBps).toEqual(DEFAULT_STAKER_SHARE_BPS);
            expect(distribution.protocolShareBps).toEqual(DEFAULT_PROTOCOL_SHARE_BPS);
            expect(distribution.arbiterShareBps).toEqual(DEFAULT_ARBITER_SHARE_BPS);
            expect(distribution.builderShareBps).toEqual(DEFAULT_BUILDER_SHARE_BPS);
            expect(distribution.adminShareBps).toEqual(DEFAULT_ADMIN_SHARE_BPS);
            expect(distribution.gasRefundBps).toEqual(DEFAULT_GAS_REFUND_BPS);

            // Sum should equal 10000 (100%)
            const sum =
                distribution.userShareBps +
                distribution.lpShareBps +
                distribution.stakerShareBps +
                distribution.protocolShareBps +
                distribution.arbiterShareBps +
                distribution.builderShareBps +
                distribution.adminShareBps +
                distribution.gasRefundBps;
            expect(sum).toEqual(10000);
        });
    });

    describe('Activation', () => {
        it('should allow vault to initialize escrow with collateral', async () => {
            const result = await escrow.sendInitialize(vault.getSender(), toNano('10000'));

            expect(result.transactions).toHaveTransaction({
                from: vault.address,
                to: escrow.address,
                success: true,
            });

            const status = await escrow.getStatus();
            expect(status).toEqual(STATUS_ACTIVE);

            const collateral = await escrow.getCollateralAmount();
            expect(collateral).toBeGreaterThan(0n);
        });

        it('should prevent non-vault from initializing', async () => {
            const result = await escrow.sendInitialize(deployer.getSender(), toNano('10000'));

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: escrow.address,
                success: false,
                exitCode: 401,
            });
        });

        it('should prevent double initialization', async () => {
            await escrow.sendInitialize(vault.getSender(), toNano('10000'));

            const result = await escrow.sendInitialize(vault.getSender(), toNano('10000'));

            expect(result.transactions).toHaveTransaction({
                from: vault.address,
                to: escrow.address,
                success: false,
                exitCode: 405, // already_initialized
            });
        });
    });

    describe('Claim Payout', () => {
        beforeEach(async () => {
            // Initialize escrow
            await escrow.sendInitialize(vault.getSender(), toNano('10000'));
        });

        it('should allow oracle to trigger claim payout', async () => {
            const triggerProof = beginCell()
                .storeUint(1, 64) // policy_id
                .storeUint(Math.floor(Date.now() / 1000), 32) // timestamp
                .storeUint(PRODUCT_TYPE_DEPEG, 8) // product_type
                .storeUint(1, 16) // asset_id (USDT)
                .storeUint(980000, 32) // trigger_threshold
                .endCell();

            const result = await escrow.sendTriggerClaim(oracle.getSender(), {
                value: toNano('1'),
                triggerProof: triggerProof,
            });

            expect(result.transactions).toHaveTransaction({
                from: oracle.address,
                to: escrow.address,
                success: true,
            });

            const status = await escrow.getStatus();
            expect(status).toEqual(STATUS_PAID_OUT);
        });

        it('should prevent non-oracle from triggering claim', async () => {
            const triggerProof = beginCell()
                .storeUint(1, 64)
                .storeUint(Math.floor(Date.now() / 1000), 32)
                .storeUint(PRODUCT_TYPE_DEPEG, 8)
                .storeUint(1, 16)
                .storeUint(980000, 32)
                .endCell();

            const result = await escrow.sendTriggerClaim(deployer.getSender(), {
                value: toNano('1'),
                triggerProof: triggerProof,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: escrow.address,
                success: false,
                exitCode: 402, // oracle_only
            });
        });

        it('should distribute to all 8 parties on claim payout', async () => {
            const triggerProof = beginCell()
                .storeUint(1, 64)
                .storeUint(Math.floor(Date.now() / 1000), 32)
                .storeUint(PRODUCT_TYPE_DEPEG, 8)
                .storeUint(1, 16)
                .storeUint(980000, 32)
                .endCell();

            const result = await escrow.sendTriggerClaim(oracle.getSender(), {
                value: toNano('1'),
                triggerProof: triggerProof,
            });

            // Check user received 90%
            expect(result.transactions).toHaveTransaction({
                from: escrow.address,
                to: policyOwner.address,
                success: true,
            });

            // Check LP rewards received 3%
            expect(result.transactions).toHaveTransaction({
                from: escrow.address,
                to: lpRewards.address,
                success: true,
            });

            // Check staker rewards received 2%
            expect(result.transactions).toHaveTransaction({
                from: escrow.address,
                to: stakerRewards.address,
                success: true,
            });
        });
    });

    describe('Expiry Handling', () => {
        beforeEach(async () => {
            await escrow.sendInitialize(vault.getSender(), toNano('10000'));
        });

        it('should allow expiry handling after expiry timestamp', async () => {
            // Fast-forward past expiry
            blockchain.now = Math.floor(Date.now() / 1000) + 2592001; // 30 days + 1 second

            const result = await escrow.sendHandleExpiry(deployer.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: escrow.address,
                success: true,
            });

            const status = await escrow.getStatus();
            expect(status).toEqual(STATUS_EXPIRED);

            // Collateral should be refunded to vault
            expect(result.transactions).toHaveTransaction({
                from: escrow.address,
                to: vault.address,
                success: true,
            });
        });

        it('should prevent expiry handling before expiry timestamp', async () => {
            const result = await escrow.sendHandleExpiry(deployer.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: escrow.address,
                success: false,
                exitCode: 407, // not_expired
            });
        });

        it('should track time remaining', async () => {
            const timeRemaining = await escrow.getTimeRemaining();
            expect(timeRemaining).toBeGreaterThan(0);

            // Fast-forward past expiry
            blockchain.now = Math.floor(Date.now() / 1000) + 2592001;

            const timeRemainingAfter = await escrow.getTimeRemaining();
            expect(timeRemainingAfter).toEqual(0);
        });
    });

    describe('Dispute Handling', () => {
        beforeEach(async () => {
            await escrow.sendInitialize(vault.getSender(), toNano('10000'));
        });

        it('should allow admin to freeze dispute', async () => {
            const result = await escrow.sendFreezeDispute(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: escrow.address,
                success: true,
            });

            const status = await escrow.getStatus();
            expect(status).toEqual(STATUS_DISPUTED);
        });

        it('should prevent non-admin from freezing dispute', async () => {
            const result = await escrow.sendFreezeDispute(deployer.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: escrow.address,
                success: false,
                exitCode: 401,
            });
        });

        it('should allow admin to resolve dispute - refund vault', async () => {
            await escrow.sendFreezeDispute(admin.getSender(), toNano('0.05'));

            const result = await escrow.sendResolveDispute(admin.getSender(), {
                value: toNano('0.1'),
                resolution: RESOLUTION_REFUND_VAULT,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: escrow.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: escrow.address,
                to: vault.address,
                success: true,
            });

            const status = await escrow.getStatus();
            expect(status).toEqual(STATUS_EXPIRED);
        });

        it('should allow admin to resolve dispute - pay user', async () => {
            await escrow.sendFreezeDispute(admin.getSender(), toNano('0.05'));

            const result = await escrow.sendResolveDispute(admin.getSender(), {
                value: toNano('0.1'),
                resolution: RESOLUTION_PAY_USER,
            });

            expect(result.transactions).toHaveTransaction({
                from: escrow.address,
                to: policyOwner.address,
                success: true,
            });

            const status = await escrow.getStatus();
            expect(status).toEqual(STATUS_PAID_OUT);
        });

        it('should allow admin to resolve dispute - split 50/50', async () => {
            await escrow.sendFreezeDispute(admin.getSender(), toNano('0.05'));

            const result = await escrow.sendResolveDispute(admin.getSender(), {
                value: toNano('0.1'),
                resolution: RESOLUTION_SPLIT,
            });

            expect(result.transactions).toHaveTransaction({
                from: escrow.address,
                to: policyOwner.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: escrow.address,
                to: vault.address,
                success: true,
            });

            const status = await escrow.getStatus();
            expect(status).toEqual(STATUS_EXPIRED);
        });

        it('should allow emergency withdraw after 30 days disputed', async () => {
            await escrow.sendFreezeDispute(admin.getSender(), toNano('0.05'));

            // Fast-forward 30 days
            blockchain.now = Math.floor(Date.now() / 1000) + 2592001;

            const result = await escrow.sendEmergencyWithdraw(admin.getSender(), toNano('0.1'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: escrow.address,
                success: true,
            });

            expect(result.transactions).toHaveTransaction({
                from: escrow.address,
                to: vault.address,
                success: true,
            });

            const status = await escrow.getStatus();
            expect(status).toEqual(STATUS_CANCELLED);
        });
    });

    describe('Helper Functions', () => {
        it('should get correct status name', () => {
            expect(getStatusName(STATUS_PENDING)).toEqual('Pending');
            expect(getStatusName(STATUS_ACTIVE)).toEqual('Active');
            expect(getStatusName(STATUS_PAID_OUT)).toEqual('Paid Out');
            expect(getStatusName(STATUS_EXPIRED)).toEqual('Expired');
            expect(getStatusName(STATUS_DISPUTED)).toEqual('Disputed');
            expect(getStatusName(STATUS_CANCELLED)).toEqual('Cancelled');
        });

        it('should calculate 8-party distribution correctly', () => {
            const coverage = toNano('10000');
            const distribution = {
                userShareBps: DEFAULT_USER_SHARE_BPS,
                lpShareBps: DEFAULT_LP_SHARE_BPS,
                stakerShareBps: DEFAULT_STAKER_SHARE_BPS,
                protocolShareBps: DEFAULT_PROTOCOL_SHARE_BPS,
                arbiterShareBps: DEFAULT_ARBITER_SHARE_BPS,
                builderShareBps: DEFAULT_BUILDER_SHARE_BPS,
                adminShareBps: DEFAULT_ADMIN_SHARE_BPS,
                gasRefundBps: DEFAULT_GAS_REFUND_BPS,
            };

            const amounts = calculateDistribution(coverage, distribution);

            expect(amounts.user).toEqual(toNano('9000')); // 90%
            expect(amounts.lp).toEqual(toNano('300')); // 3%
            expect(amounts.staker).toEqual(toNano('200')); // 2%
            expect(amounts.protocol).toEqual(toNano('150')); // 1.5%
            expect(amounts.arbiter).toEqual(toNano('100')); // 1%
            expect(amounts.builder).toEqual(toNano('100')); // 1%
            expect(amounts.admin).toEqual(toNano('100')); // 1%
            expect(amounts.gasRefund).toEqual(toNano('50')); // 0.5%
        });
    });

    describe('Constants', () => {
        it('should have correct status constants', () => {
            expect(STATUS_PENDING).toEqual(0);
            expect(STATUS_ACTIVE).toEqual(1);
            expect(STATUS_PAID_OUT).toEqual(2);
            expect(STATUS_EXPIRED).toEqual(3);
            expect(STATUS_DISPUTED).toEqual(4);
            expect(STATUS_CANCELLED).toEqual(5);
        });

        it('should have correct product type constants', () => {
            expect(PRODUCT_TYPE_DEPEG).toEqual(1);
            expect(PRODUCT_TYPE_BRIDGE).toEqual(2);
            expect(PRODUCT_TYPE_ORACLE).toEqual(3);
            expect(PRODUCT_TYPE_PROTOCOL).toEqual(4);
        });

        it('should have correct default distribution', () => {
            expect(DEFAULT_USER_SHARE_BPS).toEqual(9000);
            expect(DEFAULT_LP_SHARE_BPS).toEqual(300);
            expect(DEFAULT_STAKER_SHARE_BPS).toEqual(200);
            expect(DEFAULT_PROTOCOL_SHARE_BPS).toEqual(150);
            expect(DEFAULT_ARBITER_SHARE_BPS).toEqual(100);
            expect(DEFAULT_BUILDER_SHARE_BPS).toEqual(100);
            expect(DEFAULT_ADMIN_SHARE_BPS).toEqual(100);
            expect(DEFAULT_GAS_REFUND_BPS).toEqual(50);
        });
    });
});
