import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import {
    LiquidityManager,
    calculatePoolShare,
    isValidFeeApy,
    isValidPoolShare,
    calculateEstimatedFeeIncome,
    MIN_FEE_APY_BPS,
    MAX_POOL_SHARE_BPS,
} from '../../wrappers/v3/LiquidityManager';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('LiquidityManager', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('LiquidityManager');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let floatMaster: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let dedustRouter: SandboxContract<TreasuryContract>;
    let liquidityManager: SandboxContract<LiquidityManager>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        floatMaster = await blockchain.treasury('float_master');
        vault = await blockchain.treasury('vault');
        dedustRouter = await blockchain.treasury('dedust_router');

        liquidityManager = blockchain.openContract(
            LiquidityManager.createFromConfig(
                {
                    adminAddress: admin.address,
                    floatMasterAddress: floatMaster.address,
                    vaultAddress: vault.address,
                    dedustRouterAddress: dedustRouter.address,
                    totalLpDeployed: 0n,
                    accumulatedFees: 0n,
                    lpPositions: Dictionary.empty(Dictionary.Keys.Uint(64), Dictionary.Values.Cell()),
                    nextPositionId: 1n,
                    detectedCrossovers: Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.Cell()),
                    paused: false,
                },
                code
            )
        );

        const deployResult = await liquidityManager.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: liquidityManager.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const adminAddr = await liquidityManager.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const floatMasterAddr = await liquidityManager.getFloatMaster();
            expect(floatMasterAddr.toString()).toEqual(floatMaster.address.toString());

            const version = await liquidityManager.getVersion();
            expect(version).toEqual(3);
        });

        it('should start with zero balances', async () => {
            const totalLp = await liquidityManager.getTotalLpDeployed();
            expect(totalLp).toEqual(0n);

            const fees = await liquidityManager.getAccumulatedFees();
            expect(fees).toEqual(0n);

            const count = await liquidityManager.getActiveLpCount();
            expect(count).toEqual(0);
        });
    });

    describe('Crossover LP Deployment', () => {
        it('should deploy crossover LP position', async () => {
            const amount = toNano('100');
            const feeApyBps = 1800; // 18% APY
            const poolLiquidity = toNano('500');

            const result = await liquidityManager.sendDeployCrossoverLP(
                admin.getSender(),
                {
                    value: amount + toNano('0.5'),
                    tranche1Id: 1, // Senior
                    tranche2Id: 2, // Mezzanine
                    amount: amount,
                    estimatedFeeApyBps: feeApyBps,
                    poolTotalLiquidity: poolLiquidity,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: true,
            });

            // Should send to DeDust router
            expect(result.transactions).toHaveTransaction({
                from: liquidityManager.address,
                to: dedustRouter.address,
                success: true,
            });

            const totalLp = await liquidityManager.getTotalLpDeployed();
            expect(totalLp).toEqual(amount);

            const count = await liquidityManager.getActiveLpCount();
            expect(count).toEqual(1);
        });

        it('should allow FloatMaster to deploy LP', async () => {
            const result = await liquidityManager.sendDeployCrossoverLP(
                floatMaster.getSender(),
                {
                    value: toNano('100.5'),
                    tranche1Id: 1,
                    tranche2Id: 2,
                    amount: toNano('100'),
                    estimatedFeeApyBps: 2000,
                    poolTotalLiquidity: toNano('500'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: liquidityManager.address,
                success: true,
            });
        });

        it('should reject deployment with low fee APY', async () => {
            const result = await liquidityManager.sendDeployCrossoverLP(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    tranche1Id: 1,
                    tranche2Id: 2,
                    amount: toNano('100'),
                    estimatedFeeApyBps: 1000, // 10% - below 15% threshold
                    poolTotalLiquidity: toNano('500'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 405, // fee_apy_too_low
            });
        });

        it('should reject deployment with high pool share', async () => {
            const amount = toNano('400');
            const poolLiquidity = toNano('1000');
            // Pool share: 400/1000 = 40% > 30% limit

            const result = await liquidityManager.sendDeployCrossoverLP(
                admin.getSender(),
                {
                    value: amount + toNano('0.5'),
                    tranche1Id: 1,
                    tranche2Id: 2,
                    amount: amount,
                    estimatedFeeApyBps: 1800,
                    poolTotalLiquidity: poolLiquidity,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 406, // pool_share_too_high
            });
        });

        it('should reject deployment from unauthorized sender', async () => {
            const nonAuth = await blockchain.treasury('non_auth');

            const result = await liquidityManager.sendDeployCrossoverLP(
                nonAuth.getSender(),
                {
                    value: toNano('100.5'),
                    tranche1Id: 1,
                    tranche2Id: 2,
                    amount: toNano('100'),
                    estimatedFeeApyBps: 1800,
                    poolTotalLiquidity: toNano('500'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAuth.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('LP Withdrawal', () => {
        beforeEach(async () => {
            // Deploy LP first
            await liquidityManager.sendDeployCrossoverLP(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    tranche1Id: 1,
                    tranche2Id: 2,
                    amount: toNano('100'),
                    estimatedFeeApyBps: 1800,
                    poolTotalLiquidity: toNano('500'),
                }
            );
        });

        it('should withdraw LP position', async () => {
            const positionId = 1n;

            const result = await liquidityManager.sendWithdrawCrossoverLP(
                admin.getSender(),
                {
                    value: toNano('0.2'),
                    positionId: positionId,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: true,
            });

            // Should send to DeDust router
            expect(result.transactions).toHaveTransaction({
                from: liquidityManager.address,
                to: dedustRouter.address,
                success: true,
            });

            const count = await liquidityManager.getActiveLpCount();
            expect(count).toEqual(0);
        });

        it('should allow FloatMaster to withdraw', async () => {
            const result = await liquidityManager.sendWithdrawCrossoverLP(
                floatMaster.getSender(),
                {
                    value: toNano('0.2'),
                    positionId: 1n,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: liquidityManager.address,
                success: true,
            });
        });

        it('should reject withdrawal from unauthorized sender', async () => {
            const nonAuth = await blockchain.treasury('non_auth');

            const result = await liquidityManager.sendWithdrawCrossoverLP(
                nonAuth.getSender(),
                {
                    value: toNano('0.2'),
                    positionId: 1n,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAuth.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Fee Claiming', () => {
        beforeEach(async () => {
            // Deploy LP first
            await liquidityManager.sendDeployCrossoverLP(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    tranche1Id: 1,
                    tranche2Id: 2,
                    amount: toNano('100'),
                    estimatedFeeApyBps: 1800,
                    poolTotalLiquidity: toNano('500'),
                }
            );
        });

        it('should claim LP fees from DeDust router', async () => {
            const feesEarned = toNano('5');

            const result = await liquidityManager.sendClaimLPFees(
                dedustRouter.getSender(),
                {
                    value: toNano('0.1'),
                    positionId: 1n,
                    feesEarned: feesEarned,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: dedustRouter.address,
                to: liquidityManager.address,
                success: true,
            });

            const accumulatedFees = await liquidityManager.getAccumulatedFees();
            expect(accumulatedFees).toEqual(feesEarned);
        });

        it('should reject fee claim from non-router', async () => {
            const nonRouter = await blockchain.treasury('non_router');

            const result = await liquidityManager.sendClaimLPFees(
                nonRouter.getSender(),
                {
                    value: toNano('0.1'),
                    positionId: 1n,
                    feesEarned: toNano('5'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonRouter.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 401,
            });
        });

        it('should accumulate fees across multiple claims', async () => {
            await liquidityManager.sendClaimLPFees(
                dedustRouter.getSender(),
                {
                    value: toNano('0.1'),
                    positionId: 1n,
                    feesEarned: toNano('3'),
                }
            );

            await liquidityManager.sendClaimLPFees(
                dedustRouter.getSender(),
                {
                    value: toNano('0.1'),
                    positionId: 1n,
                    feesEarned: toNano('2'),
                }
            );

            const accumulatedFees = await liquidityManager.getAccumulatedFees();
            expect(accumulatedFees).toEqual(toNano('5'));
        });
    });

    describe('Validation Functions', () => {
        it('should calculate pool share correctly', () => {
            const lpAmount = toNano('200');
            const poolLiquidity = toNano('1000');

            const shareBps = calculatePoolShare(lpAmount, poolLiquidity);
            expect(shareBps).toEqual(2000); // 20%
        });

        it('should validate fee APY threshold', () => {
            expect(isValidFeeApy(1500)).toBe(true); // 15% - at threshold
            expect(isValidFeeApy(2000)).toBe(true); // 20% - above threshold
            expect(isValidFeeApy(1000)).toBe(false); // 10% - below threshold
        });

        it('should validate pool share limit', () => {
            expect(isValidPoolShare(3000)).toBe(true); // 30% - at limit
            expect(isValidPoolShare(2500)).toBe(true); // 25% - below limit
            expect(isValidPoolShare(3500)).toBe(false); // 35% - above limit
        });

        it('should calculate estimated fee income', () => {
            const lpAmount = toNano('1000');
            const feeApyBps = 1800; // 18%
            const durationYears = 1.0;

            const feeIncome = calculateEstimatedFeeIncome(lpAmount, feeApyBps, durationYears);

            // Expected: 1000 * 0.18 * 1 = 180 TON
            expect(feeIncome).toBeGreaterThan(toNano('179'));
            expect(feeIncome).toBeLessThan(toNano('181'));
        });
    });

    describe('Admin Functions', () => {
        it('should allow admin to update DeDust router', async () => {
            const newRouter = await blockchain.treasury('new_router');

            const result = await liquidityManager.sendSetDedustRouter(admin.getSender(), {
                value: toNano('0.05'),
                routerAddress: newRouter.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: true,
            });
        });

        it('should allow admin to update FloatMaster', async () => {
            const newFloatMaster = await blockchain.treasury('new_float_master');

            const result = await liquidityManager.sendSetFloatMaster(admin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newFloatMaster.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: true,
            });
        });

        it('should allow admin to update Vault', async () => {
            const newVault = await blockchain.treasury('new_vault');

            const result = await liquidityManager.sendSetVault(admin.getSender(), {
                value: toNano('0.05'),
                vaultAddress: newVault.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: true,
            });
        });

        it('should allow admin to pause', async () => {
            const result = await liquidityManager.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: true,
            });

            const paused = await liquidityManager.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow admin to unpause', async () => {
            await liquidityManager.sendPause(admin.getSender(), toNano('0.05'));

            const result = await liquidityManager.sendUnpause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: true,
            });

            const paused = await liquidityManager.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject deployment when paused', async () => {
            await liquidityManager.sendPause(admin.getSender(), toNano('0.05'));

            const result = await liquidityManager.sendDeployCrossoverLP(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    tranche1Id: 1,
                    tranche2Id: 2,
                    amount: toNano('100'),
                    estimatedFeeApyBps: 1800,
                    poolTotalLiquidity: toNano('500'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 402,
            });
        });
    });

    describe('Security', () => {
        it('should reject admin operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newAddr = await blockchain.treasury('new_addr');

            // Test sendSetDedustRouter from non-admin
            const result1 = await liquidityManager.sendSetDedustRouter(nonAdmin.getSender(), {
                value: toNano('0.05'),
                routerAddress: newAddr.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetFloatMaster from non-admin
            const result2 = await liquidityManager.sendSetFloatMaster(nonAdmin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newAddr.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetVault from non-admin
            const result3 = await liquidityManager.sendSetVault(nonAdmin.getSender(), {
                value: toNano('0.05'),
                vaultAddress: newAddr.address,
            });

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 401,
            });

            // Test sendPause from non-admin
            const result4 = await liquidityManager.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result4.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: liquidityManager.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Constants', () => {
        it('should have correct minimum fee APY', () => {
            expect(MIN_FEE_APY_BPS).toEqual(1500); // 15%
        });

        it('should have correct maximum pool share', () => {
            expect(MAX_POOL_SHARE_BPS).toEqual(3000); // 30%
        });
    });
});
