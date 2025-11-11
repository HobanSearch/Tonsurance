import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import {
    HedgeFloat,
    calculateDailyCost,
    calculateHedgeAllocation,
    calculateRequiredHedge,
    HEDGE_COST_APY_BPS,
    INSTRUMENT_SHORT,
    INSTRUMENT_PUT,
    INSTRUMENT_VOL,
    INSTRUMENT_STABLE,
} from '../../wrappers/v3/HedgeFloat';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('HedgeFloat', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('HedgeFloat');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let floatMaster: SandboxContract<TreasuryContract>;
    let stormTrade: SandboxContract<TreasuryContract>;
    let gmxRouter: SandboxContract<TreasuryContract>;
    let hedgeFloat: SandboxContract<HedgeFloat>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        floatMaster = await blockchain.treasury('float_master');
        stormTrade = await blockchain.treasury('storm_trade');
        gmxRouter = await blockchain.treasury('gmx_router');

        hedgeFloat = blockchain.openContract(
            HedgeFloat.createFromConfig(
                {
                    adminAddress: admin.address,
                    floatMasterAddress: floatMaster.address,
                    stormTradeAddress: stormTrade.address,
                    gmxRouterAddress: gmxRouter.address,
                    totalHedgeCapital: 0n,
                    activeCapitalDeployed: 0n,
                    unrealizedPnL: 0n,
                    activePositions: Dictionary.empty(),
                    nextPositionId: 1n,
                    coverageExposure: Dictionary.empty(),
                    paused: false,
                },
                code
            )
        );

        const deployResult = await hedgeFloat.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: hedgeFloat.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const adminAddr = await hedgeFloat.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const floatMasterAddr = await hedgeFloat.getFloatMaster();
            expect(floatMasterAddr.toString()).toEqual(floatMaster.address.toString());

            const version = await hedgeFloat.getVersion();
            expect(version).toEqual(3);
        });

        it('should start with zero balances', async () => {
            const totalCapital = await hedgeFloat.getTotalHedgeCapital();
            expect(totalCapital).toEqual(0n);

            const activeCapital = await hedgeFloat.getActiveCapitalDeployed();
            expect(activeCapital).toEqual(0n);

            const pnl = await hedgeFloat.getUnrealizedPnL();
            expect(pnl).toEqual(0n);

            const totalBalance = await hedgeFloat.getTotalBalance();
            expect(totalBalance).toEqual(0n);
        });
    });

    describe('Capital Management', () => {
        it('should add hedge capital and track coverage exposure', async () => {
            const amount = toNano('100');
            const coverageAmount = toNano('500');
            const productType = 1; // USDT Depeg
            const assetId = 1; // USDT

            const result = await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: amount + toNano('0.5'),
                    amount: amount,
                    productType: productType,
                    assetId: assetId,
                    coverageAmount: coverageAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: hedgeFloat.address,
                success: true,
            });

            const totalCapital = await hedgeFloat.getTotalHedgeCapital();
            expect(totalCapital).toEqual(amount);

            const exposure = await hedgeFloat.getCoverageExposure(assetId);
            expect(exposure).toEqual(coverageAmount);
        });

        it('should reject capital from non-FloatMaster', async () => {
            const nonFloatMaster = await blockchain.treasury('non_float_master');

            const result = await hedgeFloat.sendAddHedgeCapital(
                nonFloatMaster.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    productType: 1,
                    assetId: 1,
                    coverageAmount: toNano('500'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonFloatMaster.address,
                to: hedgeFloat.address,
                success: false,
                exitCode: 401,
            });
        });

        it('should accumulate coverage exposure for same asset', async () => {
            const assetId = 1;

            // First coverage
            await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: toNano('50.5'),
                    amount: toNano('50'),
                    productType: 1,
                    assetId: assetId,
                    coverageAmount: toNano('250'),
                }
            );

            // Second coverage for same asset
            await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: toNano('50.5'),
                    amount: toNano('50'),
                    productType: 1,
                    assetId: assetId,
                    coverageAmount: toNano('250'),
                }
            );

            const exposure = await hedgeFloat.getCoverageExposure(assetId);
            expect(exposure).toEqual(toNano('500'));
        });
    });

    describe('Short Position Management', () => {
        beforeEach(async () => {
            // Add capital first
            await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    productType: 1,
                    assetId: 1,
                    coverageAmount: toNano('500'),
                }
            );
        });

        it('should close short position', async () => {
            const positionId = 1n;

            const result = await hedgeFloat.sendCloseShort(
                admin.getSender(),
                {
                    value: toNano('0.2'),
                    positionId: positionId,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: hedgeFloat.address,
                success: true,
            });
        });

        it('should reject close from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const result = await hedgeFloat.sendCloseShort(
                nonAdmin.getSender(),
                {
                    value: toNano('0.2'),
                    positionId: 1n,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: hedgeFloat.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Coverage Exposure Tracking', () => {
        it('should track exposure per asset', async () => {
            const assetId1 = 1; // USDT
            const assetId2 = 2; // USDC

            await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: toNano('50.5'),
                    amount: toNano('50'),
                    productType: 1,
                    assetId: assetId1,
                    coverageAmount: toNano('250'),
                }
            );

            await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: toNano('50.5'),
                    amount: toNano('50'),
                    productType: 1,
                    assetId: assetId2,
                    coverageAmount: toNano('300'),
                }
            );

            const exposure1 = await hedgeFloat.getCoverageExposure(assetId1);
            expect(exposure1).toEqual(toNano('250'));

            const exposure2 = await hedgeFloat.getCoverageExposure(assetId2);
            expect(exposure2).toEqual(toNano('300'));
        });

        it('should return zero for asset with no exposure', async () => {
            const exposure = await hedgeFloat.getCoverageExposure(999);
            expect(exposure).toEqual(0n);
        });
    });

    describe('Hedge Allocation', () => {
        it('should calculate correct instrument allocation (40/30/20/10)', () => {
            const coverageAmount = toNano('1000');
            const allocation = calculateHedgeAllocation(coverageAmount);

            // Total hedge size is 20% of coverage
            const totalHedge = toNano('200');

            expect(allocation.short).toEqual(toNano('80'));   // 40% of 200
            expect(allocation.put).toEqual(toNano('60'));     // 30% of 200
            expect(allocation.vol).toEqual(toNano('40'));     // 20% of 200
            expect(allocation.stable).toEqual(toNano('20'));  // 10% of 200

            const total = allocation.short + allocation.put + allocation.vol + allocation.stable;
            expect(total).toEqual(totalHedge);
        });

        it('should calculate required hedge size', () => {
            const exposure = toNano('1000');
            const requiredHedge = calculateRequiredHedge(exposure);

            // Default: 20% of exposure
            expect(requiredHedge).toEqual(toNano('200'));
        });

        it('should support custom hedge ratio', () => {
            const exposure = toNano('1000');
            const requiredHedge = calculateRequiredHedge(exposure, 30); // 30% ratio

            expect(requiredHedge).toEqual(toNano('300'));
        });
    });

    describe('Cost Calculations', () => {
        it('should calculate daily cost correctly (-2% APY)', () => {
            const capital = toNano('1000');
            const dailyCost = calculateDailyCost(capital, HEDGE_COST_APY_BPS);

            // Expected: 1000 * -0.02 / 365 = -0.0548 TON per day
            const expected = (capital * -2n) / 36500n;
            expect(dailyCost).toEqual(expected);
            expect(dailyCost).toBeLessThan(0n);
        });

        it('should provide daily cost via getter', async () => {
            await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: toNano('1000.5'),
                    amount: toNano('1000'),
                    productType: 1,
                    assetId: 1,
                    coverageAmount: toNano('5000'),
                }
            );

            const dailyCost = await hedgeFloat.getDailyYield();
            const expectedCost = calculateDailyCost(toNano('1000'), HEDGE_COST_APY_BPS);

            expect(dailyCost).toEqual(expectedCost);
            expect(dailyCost).toBeLessThan(0n); // Negative (cost)
        });

        it('should have negative APY (cost center)', () => {
            expect(HEDGE_COST_APY_BPS).toEqual(-200); // -2%
        });
    });

    describe('Admin Functions', () => {
        it('should allow admin to update Storm Trade address', async () => {
            const newStormTrade = await blockchain.treasury('new_storm_trade');

            const result = await hedgeFloat.sendSetStormTrade(admin.getSender(), {
                value: toNano('0.05'),
                address: newStormTrade.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: hedgeFloat.address,
                success: true,
            });
        });

        it('should allow admin to update GMX router', async () => {
            const newGMX = await blockchain.treasury('new_gmx');

            const result = await hedgeFloat.sendSetGMXRouter(admin.getSender(), {
                value: toNano('0.05'),
                address: newGMX.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: hedgeFloat.address,
                success: true,
            });
        });

        it('should allow admin to update FloatMaster', async () => {
            const newFloatMaster = await blockchain.treasury('new_float_master');

            const result = await hedgeFloat.sendSetFloatMaster(admin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newFloatMaster.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: hedgeFloat.address,
                success: true,
            });
        });

        it('should allow admin to pause', async () => {
            const result = await hedgeFloat.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: hedgeFloat.address,
                success: true,
            });

            const paused = await hedgeFloat.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow admin to unpause', async () => {
            await hedgeFloat.sendPause(admin.getSender(), toNano('0.05'));

            const result = await hedgeFloat.sendUnpause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: hedgeFloat.address,
                success: true,
            });

            const paused = await hedgeFloat.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject capital when paused', async () => {
            await hedgeFloat.sendPause(admin.getSender(), toNano('0.05'));

            const result = await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    productType: 1,
                    assetId: 1,
                    coverageAmount: toNano('500'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: hedgeFloat.address,
                success: false,
                exitCode: 402,
            });
        });

        it('should reject close when paused', async () => {
            await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: toNano('100.5'),
                    amount: toNano('100'),
                    productType: 1,
                    assetId: 1,
                    coverageAmount: toNano('500'),
                }
            );

            await hedgeFloat.sendPause(admin.getSender(), toNano('0.05'));

            const result = await hedgeFloat.sendCloseShort(
                admin.getSender(),
                {
                    value: toNano('0.2'),
                    positionId: 1n,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: hedgeFloat.address,
                success: false,
                exitCode: 402,
            });
        });
    });

    describe('Security', () => {
        it('should reject admin operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newAddr = await blockchain.treasury('new_addr');

            // Test sendSetStormTrade from non-admin
            const result1 = await hedgeFloat.sendSetStormTrade(nonAdmin.getSender(), {
                value: toNano('0.05'),
                address: newAddr.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: hedgeFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetGMXRouter from non-admin
            const result2 = await hedgeFloat.sendSetGMXRouter(nonAdmin.getSender(), {
                value: toNano('0.05'),
                address: newAddr.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: hedgeFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetFloatMaster from non-admin
            const result3 = await hedgeFloat.sendSetFloatMaster(nonAdmin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newAddr.address,
            });

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: hedgeFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendPause from non-admin
            const result4 = await hedgeFloat.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result4.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: hedgeFloat.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Instrument Types', () => {
        it('should have correct instrument type constants', () => {
            expect(INSTRUMENT_SHORT).toEqual(1);
            expect(INSTRUMENT_PUT).toEqual(2);
            expect(INSTRUMENT_VOL).toEqual(3);
            expect(INSTRUMENT_STABLE).toEqual(4);
        });
    });

    describe('Balance Tracking', () => {
        it('should track total balance', async () => {
            await hedgeFloat.sendAddHedgeCapital(
                floatMaster.getSender(),
                {
                    value: toNano('200.5'),
                    amount: toNano('200'),
                    productType: 1,
                    assetId: 1,
                    coverageAmount: toNano('1000'),
                }
            );

            const totalBalance = await hedgeFloat.getTotalBalance();
            expect(totalBalance).toEqual(toNano('200'));
        });
    });
});
