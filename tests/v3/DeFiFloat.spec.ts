import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address } from '@ton/core';
import {
    DeFiFloat,
    calculateDailyYield,
    calculateVenueAllocation,
    TARGET_APY_BPS
} from '../../wrappers/v3/DeFiFloat';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('DeFiFloat', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('DeFiFloat');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let floatMaster: SandboxContract<TreasuryContract>;
    let dedustRouter: SandboxContract<TreasuryContract>;
    let stonRouter: SandboxContract<TreasuryContract>;
    let evaaMarket: SandboxContract<TreasuryContract>;
    let defiFloat: SandboxContract<DeFiFloat>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        floatMaster = await blockchain.treasury('float_master');
        dedustRouter = await blockchain.treasury('dedust_router');
        stonRouter = await blockchain.treasury('ston_router');
        evaaMarket = await blockchain.treasury('evaa_market');

        defiFloat = blockchain.openContract(
            DeFiFloat.createFromConfig(
                {
                    adminAddress: admin.address,
                    floatMasterAddress: floatMaster.address,
                    dedustRouterAddress: dedustRouter.address,
                    stonRouterAddress: stonRouter.address,
                    evaaMarketAddress: evaaMarket.address,
                    totalDeployed: 0n,
                    totalWithdrawn: 0n,
                    dedustLiquidity: 0n,
                    stonLiquidity: 0n,
                    evaaSupplied: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await defiFloat.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: defiFloat.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const adminAddr = await defiFloat.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const floatMasterAddr = await defiFloat.getFloatMaster();
            expect(floatMasterAddr.toString()).toEqual(floatMaster.address.toString());

            const version = await defiFloat.getVersion();
            expect(version).toEqual(3);
        });

        it('should start with zero balances', async () => {
            const totalDeployed = await defiFloat.getTotalDeployed();
            expect(totalDeployed).toEqual(0n);

            const dedustLiquidity = await defiFloat.getDedustLiquidity();
            expect(dedustLiquidity).toEqual(0n);

            const stonLiquidity = await defiFloat.getStonLiquidity();
            expect(stonLiquidity).toEqual(0n);

            const evaaSupplied = await defiFloat.getEvaaSupplied();
            expect(evaaSupplied).toEqual(0n);

            const totalBalance = await defiFloat.getTotalBalance();
            expect(totalBalance).toEqual(0n);
        });
    });

    describe('DeFi Deployment', () => {
        it('should deploy capital across 3 venues (40/30/30)', async () => {
            const deployAmount = toNano('300');

            const result = await defiFloat.sendDeployDeFi(
                floatMaster.getSender(),
                {
                    value: deployAmount + toNano('1'),
                    amount: deployAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: defiFloat.address,
                success: true,
            });

            // Should send to DeDust (40%)
            expect(result.transactions).toHaveTransaction({
                from: defiFloat.address,
                to: dedustRouter.address,
                success: true,
            });

            // Should send to STON (30%)
            expect(result.transactions).toHaveTransaction({
                from: defiFloat.address,
                to: stonRouter.address,
                success: true,
            });

            // Should send to Evaa (30%)
            expect(result.transactions).toHaveTransaction({
                from: defiFloat.address,
                to: evaaMarket.address,
                success: true,
            });

            const totalDeployed = await defiFloat.getTotalDeployed();
            expect(totalDeployed).toEqual(deployAmount);

            const dedustLiquidity = await defiFloat.getDedustLiquidity();
            expect(dedustLiquidity).toBeGreaterThan(0n);

            const stonLiquidity = await defiFloat.getStonLiquidity();
            expect(stonLiquidity).toBeGreaterThan(0n);

            const evaaSupplied = await defiFloat.getEvaaSupplied();
            expect(evaaSupplied).toBeGreaterThan(0n);

            const totalBalance = await defiFloat.getTotalBalance();
            expect(totalBalance).toEqual(deployAmount);
        });

        it('should reject deployment from non-FloatMaster', async () => {
            const nonFloatMaster = await blockchain.treasury('non_float_master');

            const result = await defiFloat.sendDeployDeFi(
                nonFloatMaster.getSender(),
                {
                    value: toNano('300.5'),
                    amount: toNano('300'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonFloatMaster.address,
                to: defiFloat.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('DeFi Withdrawal', () => {
        beforeEach(async () => {
            // Deploy first
            await defiFloat.sendDeployDeFi(
                floatMaster.getSender(),
                {
                    value: toNano('300.5'),
                    amount: toNano('300'),
                }
            );
        });

        it('should withdraw proportionally from all venues', async () => {
            const withdrawAmount = toNano('150');

            const result = await defiFloat.sendWithdrawDeFi(
                admin.getSender(),
                {
                    value: toNano('0.3'),
                    amount: withdrawAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });

            // Should return funds to FloatMaster
            expect(result.transactions).toHaveTransaction({
                from: defiFloat.address,
                to: floatMaster.address,
                success: true,
            });

            const totalBalance = await defiFloat.getTotalBalance();
            expect(totalBalance).toEqual(toNano('150'));
        });

        it('should allow FloatMaster to withdraw', async () => {
            const result = await defiFloat.sendWithdrawDeFi(
                floatMaster.getSender(),
                {
                    value: toNano('0.3'),
                    amount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: defiFloat.address,
                success: true,
            });
        });

        it('should reject withdrawal from non-admin/non-FloatMaster', async () => {
            const nonAuth = await blockchain.treasury('non_auth');

            const result = await defiFloat.sendWithdrawDeFi(
                nonAuth.getSender(),
                {
                    value: toNano('0.3'),
                    amount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAuth.address,
                to: defiFloat.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Venue-Specific Operations', () => {
        it('should add liquidity to DeDust', async () => {
            const result = await defiFloat.sendAddLiquidityDedust(
                admin.getSender(),
                {
                    value: toNano('100.1'),
                    amount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });
        });

        it('should remove liquidity from DeDust', async () => {
            // Add first
            await defiFloat.sendAddLiquidityDedust(
                admin.getSender(),
                {
                    value: toNano('100.1'),
                    amount: toNano('100'),
                }
            );

            const result = await defiFloat.sendRemoveLiquidityDedust(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    amount: toNano('50'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });
        });

        it('should supply to Evaa lending', async () => {
            const result = await defiFloat.sendSupplyEvaa(
                admin.getSender(),
                {
                    value: toNano('100.1'),
                    amount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });
        });

        it('should withdraw from Evaa', async () => {
            // Supply first
            await defiFloat.sendSupplyEvaa(
                admin.getSender(),
                {
                    value: toNano('100.1'),
                    amount: toNano('100'),
                }
            );

            const result = await defiFloat.sendWithdrawEvaa(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    amount: toNano('50'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });
        });

        it('should swap on STON', async () => {
            const result = await defiFloat.sendSwapSton(
                admin.getSender(),
                {
                    value: toNano('100.1'),
                    amount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });
        });
    });

    describe('Yield Calculations', () => {
        it('should calculate daily yield correctly (7% APY)', () => {
            const balance = toNano('1000');
            const dailyYield = calculateDailyYield(balance, TARGET_APY_BPS);

            // Expected: 1000 * 0.07 / 365 = 0.1918 TON per day
            const expected = (balance * 7n) / 36500n;
            expect(dailyYield).toEqual(expected);
        });

        it('should provide daily yield via getter', async () => {
            await defiFloat.sendDeployDeFi(
                floatMaster.getSender(),
                {
                    value: toNano('1000.5'),
                    amount: toNano('1000'),
                }
            );

            const dailyYield = await defiFloat.getDailyYield();
            const expectedYield = calculateDailyYield(toNano('1000'), TARGET_APY_BPS);

            expect(dailyYield).toEqual(expectedYield);
        });

        it('should calculate venue allocation correctly', () => {
            const amount = toNano('300');
            const allocation = calculateVenueAllocation(amount);

            expect(allocation.dedust).toEqual(toNano('120')); // 40%
            expect(allocation.ston).toEqual(toNano('90')); // 30%
            expect(allocation.evaa).toEqual(toNano('90')); // 30%
            expect(allocation.dedust + allocation.ston + allocation.evaa).toEqual(amount);
        });
    });

    describe('Admin Functions', () => {
        it('should allow admin to update DeDust router', async () => {
            const newRouter = await blockchain.treasury('new_dedust');

            const result = await defiFloat.sendSetDedust(admin.getSender(), {
                value: toNano('0.05'),
                routerAddress: newRouter.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });
        });

        it('should allow admin to update STON router', async () => {
            const newRouter = await blockchain.treasury('new_ston');

            const result = await defiFloat.sendSetSton(admin.getSender(), {
                value: toNano('0.05'),
                routerAddress: newRouter.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });
        });

        it('should allow admin to update Evaa market', async () => {
            const newMarket = await blockchain.treasury('new_evaa');

            const result = await defiFloat.sendSetEvaa(admin.getSender(), {
                value: toNano('0.05'),
                marketAddress: newMarket.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });
        });

        it('should allow admin to update FloatMaster', async () => {
            const newFloatMaster = await blockchain.treasury('new_float_master');

            const result = await defiFloat.sendSetFloatMaster(admin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newFloatMaster.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });
        });

        it('should allow admin to pause', async () => {
            const result = await defiFloat.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });

            const paused = await defiFloat.getPaused();
            expect(paused).toBe(true);
        });

        it('should allow admin to unpause', async () => {
            await defiFloat.sendPause(admin.getSender(), toNano('0.05'));

            const result = await defiFloat.sendUnpause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: true,
            });

            const paused = await defiFloat.getPaused();
            expect(paused).toBe(false);
        });

        it('should reject deployment when paused', async () => {
            await defiFloat.sendPause(admin.getSender(), toNano('0.05'));

            const result = await defiFloat.sendDeployDeFi(
                floatMaster.getSender(),
                {
                    value: toNano('300.5'),
                    amount: toNano('300'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: defiFloat.address,
                success: false,
                exitCode: 402,
            });
        });

        it('should reject withdrawal when paused', async () => {
            await defiFloat.sendDeployDeFi(
                floatMaster.getSender(),
                {
                    value: toNano('300.5'),
                    amount: toNano('300'),
                }
            );

            await defiFloat.sendPause(admin.getSender(), toNano('0.05'));

            const result = await defiFloat.sendWithdrawDeFi(
                admin.getSender(),
                {
                    value: toNano('0.3'),
                    amount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: defiFloat.address,
                success: false,
                exitCode: 402,
            });
        });
    });

    describe('Balance Tracking', () => {
        it('should track total balance across all venues', async () => {
            await defiFloat.sendDeployDeFi(
                floatMaster.getSender(),
                {
                    value: toNano('300.5'),
                    amount: toNano('300'),
                }
            );

            const totalBalance = await defiFloat.getTotalBalance();
            expect(totalBalance).toEqual(toNano('300'));

            const dedustLiquidity = await defiFloat.getDedustLiquidity();
            const stonLiquidity = await defiFloat.getStonLiquidity();
            const evaaSupplied = await defiFloat.getEvaaSupplied();

            expect(totalBalance).toEqual(dedustLiquidity + stonLiquidity + evaaSupplied);
        });

        it('should update balance after withdrawal', async () => {
            await defiFloat.sendDeployDeFi(
                floatMaster.getSender(),
                {
                    value: toNano('300.5'),
                    amount: toNano('300'),
                }
            );

            await defiFloat.sendWithdrawDeFi(
                admin.getSender(),
                {
                    value: toNano('0.3'),
                    amount: toNano('100'),
                }
            );

            const totalBalance = await defiFloat.getTotalBalance();
            expect(totalBalance).toEqual(toNano('200'));
        });
    });

    describe('Security', () => {
        it('should reject admin operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newAddr = await blockchain.treasury('new_addr');

            // Test sendSetDedust from non-admin
            const result1 = await defiFloat.sendSetDedust(nonAdmin.getSender(), {
                value: toNano('0.05'),
                routerAddress: newAddr.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: defiFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetSton from non-admin
            const result2 = await defiFloat.sendSetSton(nonAdmin.getSender(), {
                value: toNano('0.05'),
                routerAddress: newAddr.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: defiFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetEvaa from non-admin
            const result3 = await defiFloat.sendSetEvaa(nonAdmin.getSender(), {
                value: toNano('0.05'),
                marketAddress: newAddr.address,
            });

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: defiFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetFloatMaster from non-admin
            const result4 = await defiFloat.sendSetFloatMaster(nonAdmin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newAddr.address,
            });

            expect(result4.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: defiFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendPause from non-admin
            const result5 = await defiFloat.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result5.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: defiFloat.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Constants', () => {
        it('should have correct APY target', () => {
            expect(TARGET_APY_BPS).toEqual(700); // 7%
        });
    });
});
