import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import {
    EQTBuybackManager,
    calculateMaturityRatio,
    calculateHedgeCoverage,
    isEligibleForBuyback,
    MIN_PROTOCOL_RESERVE,
    MIN_MATURITY_RATIO_FP,
    MIN_HEDGE_COVERAGE_BPS,
} from '../../wrappers/v3/EQTBuybackManager';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('EQTBuybackManager', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('EQTBuybackManager');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let floatMaster: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let hedgeFloat: SandboxContract<TreasuryContract>;
    let eqtToken: SandboxContract<TreasuryContract>;
    let dexRouter: SandboxContract<TreasuryContract>;
    let eqtBuybackManager: SandboxContract<EQTBuybackManager>;

    // Valid buyback parameters (all conditions met)
    const validParams = {
        maturityRatioFp: 5000000000n, // 5.0 > 4.0 threshold
        protocolReserve: 12000000000000n, // $12M > $10M threshold
        vaultYieldsSufficient: true,
        totalExposure: toNano('1000'),
        hedgedExposure: toNano('960'), // 96% > 95% threshold
    };

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        floatMaster = await blockchain.treasury('float_master');
        vault = await blockchain.treasury('vault');
        hedgeFloat = await blockchain.treasury('hedge_float');
        eqtToken = await blockchain.treasury('eqt_token');
        dexRouter = await blockchain.treasury('dex_router');

        eqtBuybackManager = blockchain.openContract(
            EQTBuybackManager.createFromConfig(
                {
                    adminAddress: admin.address,
                    floatMasterAddress: floatMaster.address,
                    vaultAddress: vault.address,
                    hedgeFloatAddress: hedgeFloat.address,
                    eqtTokenAddress: eqtToken.address,
                    dexRouterAddress: dexRouter.address,
                    totalBuybacksExecuted: 0,
                    totalEqtBought: 0n,
                    totalSpent: 0n,
                    buybackHistory: Dictionary.empty(Dictionary.Keys.Uint(64), Dictionary.Values.Cell()),
                    nextBuybackId: 1n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await eqtBuybackManager.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: eqtBuybackManager.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const adminAddr = await eqtBuybackManager.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const floatMasterAddr = await eqtBuybackManager.getFloatMaster();
            expect(floatMasterAddr.toString()).toEqual(floatMaster.address.toString());

            const version = await eqtBuybackManager.getVersion();
            expect(version).toEqual(3);
        });

        it('should start with zero totals', async () => {
            const count = await eqtBuybackManager.getTotalBuybacksExecuted();
            expect(count).toEqual(0);

            const eqtBought = await eqtBuybackManager.getTotalEqtBought();
            expect(eqtBought).toEqual(0n);

            const spent = await eqtBuybackManager.getTotalSpent();
            expect(spent).toEqual(0n);
        });
    });

    describe('Buyback Execution', () => {
        it('should execute buyback when all 4 conditions met', async () => {
            const buybackAmount = toNano('100');

            const result = await eqtBuybackManager.sendExecuteBuyback(
                admin.getSender(),
                {
                    value: buybackAmount + toNano('0.5'),
                    amount: buybackAmount,
                    ...validParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: eqtBuybackManager.address,
                success: true,
            });

            // Should send to DEX router
            expect(result.transactions).toHaveTransaction({
                from: eqtBuybackManager.address,
                to: dexRouter.address,
                success: true,
            });

            const count = await eqtBuybackManager.getTotalBuybacksExecuted();
            expect(count).toEqual(1);

            const spent = await eqtBuybackManager.getTotalSpent();
            expect(spent).toEqual(buybackAmount);
        });

        it('should reject buyback with low maturity ratio', async () => {
            const result = await eqtBuybackManager.sendExecuteBuyback(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    maturityRatioFp: 3000000000n, // 3.0 < 4.0 threshold
                    ...validParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: eqtBuybackManager.address,
                success: false,
                exitCode: 404, // maturity_too_low
            });
        });

        it('should reject buyback with low protocol reserve', async () => {
            const result = await eqtBuybackManager.sendExecuteBuyback(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    protocolReserve: 8000000000000n, // $8M < $10M threshold
                    ...validParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: eqtBuybackManager.address,
                success: false,
                exitCode: 405, // reserve_too_low
            });
        });

        it('should reject buyback with insufficient vault yields', async () => {
            const result = await eqtBuybackManager.sendExecuteBuyback(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    vaultYieldsSufficient: false,
                    ...validParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: eqtBuybackManager.address,
                success: false,
                exitCode: 406, // vaults_underfunded
            });
        });

        it('should reject buyback with inadequate hedges', async () => {
            const result = await eqtBuybackManager.sendExecuteBuyback(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    totalExposure: toNano('1000'),
                    hedgedExposure: toNano('900'), // 90% < 95% threshold
                    ...validParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: eqtBuybackManager.address,
                success: false,
                exitCode: 407, // hedges_inadequate
            });
        });

        it('should reject buyback from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const result = await eqtBuybackManager.sendExecuteBuyback(
                nonAdmin.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    ...validParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: eqtBuybackManager.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Eligibility Check', () => {
        it('should confirm eligibility when all conditions met', async () => {
            const result = await eqtBuybackManager.sendCheckBuybackEligibility(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    ...validParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: eqtBuybackManager.address,
                success: true,
            });
        });

        it('should reject eligibility check when conditions not met', async () => {
            const result = await eqtBuybackManager.sendCheckBuybackEligibility(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    maturityRatioFp: 2000000000n, // Too low
                    ...validParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: eqtBuybackManager.address,
                success: false,
                exitCode: 404,
            });
        });
    });

    describe('Helper Functions', () => {
        it('should calculate maturity ratio correctly', () => {
            const totalFloat = toNano('40000');
            const activeCoverage = toNano('10000');

            const ratio = calculateMaturityRatio(totalFloat, activeCoverage);
            expect(ratio).toEqual(4000000000n); // 4.0 in fixed-point
        });

        it('should calculate hedge coverage correctly', () => {
            const totalExposure = toNano('1000');
            const hedgedExposure = toNano('960');

            const coverage = calculateHedgeCoverage(totalExposure, hedgedExposure);
            expect(coverage).toEqual(9600); // 96% in basis points
        });

        it('should validate eligibility correctly', () => {
            const check1 = isEligibleForBuyback(
                validParams.maturityRatioFp,
                validParams.protocolReserve,
                validParams.vaultYieldsSufficient,
                validParams.totalExposure,
                validParams.hedgedExposure
            );
            expect(check1.eligible).toBe(true);
            expect(check1.reasons.length).toBe(0);

            const check2 = isEligibleForBuyback(
                3000000000n, // Low maturity
                validParams.protocolReserve,
                validParams.vaultYieldsSufficient,
                validParams.totalExposure,
                validParams.hedgedExposure
            );
            expect(check2.eligible).toBe(false);
            expect(check2.reasons.length).toBeGreaterThan(0);
        });
    });

    describe('Buyback History', () => {
        it('should record buyback details', async () => {
            await eqtBuybackManager.sendExecuteBuyback(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    ...validParams,
                }
            );

            const buyback = await eqtBuybackManager.getBuyback(1n);
            expect(buyback).not.toBeNull();
            expect(buyback!.amount).toEqual(toNano('100'));
            expect(buyback!.maturityRatioFp).toEqual(validParams.maturityRatioFp);
        });

        it('should return null for non-existent buyback', async () => {
            const buyback = await eqtBuybackManager.getBuyback(999n);
            expect(buyback).toBeNull();
        });
    });

    describe('Admin Functions', () => {
        it('should allow admin to update addresses', async () => {
            const newFloatMaster = await blockchain.treasury('new_float_master');
            const newVault = await blockchain.treasury('new_vault');
            const newHedgeFloat = await blockchain.treasury('new_hedge_float');
            const newEqtToken = await blockchain.treasury('new_eqt_token');
            const newDexRouter = await blockchain.treasury('new_dex_router');

            const results = await Promise.all([
                eqtBuybackManager.sendSetFloatMaster(admin.getSender(), {
                    value: toNano('0.05'),
                    floatMasterAddress: newFloatMaster.address,
                }),
                eqtBuybackManager.sendSetVault(admin.getSender(), {
                    value: toNano('0.05'),
                    vaultAddress: newVault.address,
                }),
                eqtBuybackManager.sendSetHedgeFloat(admin.getSender(), {
                    value: toNano('0.05'),
                    hedgeFloatAddress: newHedgeFloat.address,
                }),
                eqtBuybackManager.sendSetEqtToken(admin.getSender(), {
                    value: toNano('0.05'),
                    eqtTokenAddress: newEqtToken.address,
                }),
                eqtBuybackManager.sendSetDexRouter(admin.getSender(), {
                    value: toNano('0.05'),
                    dexRouterAddress: newDexRouter.address,
                }),
            ]);

            results.forEach((result) => {
                expect(result.transactions).toHaveTransaction({
                    from: admin.address,
                    to: eqtBuybackManager.address,
                    success: true,
                });
            });
        });

        it('should allow admin to pause and unpause', async () => {
            await eqtBuybackManager.sendPause(admin.getSender(), toNano('0.05'));
            let paused = await eqtBuybackManager.getPaused();
            expect(paused).toBe(true);

            await eqtBuybackManager.sendUnpause(admin.getSender(), toNano('0.05'));
            paused = await eqtBuybackManager.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject buyback when paused', async () => {
            await eqtBuybackManager.sendPause(admin.getSender(), toNano('0.05'));

            const result = await eqtBuybackManager.sendExecuteBuyback(
                admin.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    ...validParams,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: eqtBuybackManager.address,
                success: false,
                exitCode: 402,
            });
        });

        it('should reject admin operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newAddr = await blockchain.treasury('new_addr');

            const results = await Promise.all([
                eqtBuybackManager.sendSetFloatMaster(nonAdmin.getSender(), {
                    value: toNano('0.05'),
                    floatMasterAddress: newAddr.address,
                }),
                eqtBuybackManager.sendPause(nonAdmin.getSender(), toNano('0.05')),
            ]);

            results.forEach((result) => {
                expect(result.transactions).toHaveTransaction({
                    from: nonAdmin.address,
                    to: eqtBuybackManager.address,
                    success: false,
                    exitCode: 401,
                });
            });
        });
    });

    describe('Constants', () => {
        it('should have correct thresholds', () => {
            expect(MIN_PROTOCOL_RESERVE).toEqual(10000000000000n); // $10M
            expect(MIN_MATURITY_RATIO_FP).toEqual(4000000000n); // 4.0
            expect(MIN_HEDGE_COVERAGE_BPS).toEqual(9500); // 95%
        });
    });
});
