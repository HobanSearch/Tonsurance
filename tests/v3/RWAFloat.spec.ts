import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import {
    RWAFloat,
    calculateDailyYield,
    calculateRedemptionUnlockTime,
    TARGET_APY_BPS,
    REDEMPTION_PERIOD_SECONDS
} from '../../wrappers/v3/RWAFloat';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('RWAFloat', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('RWAFloat');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let floatMaster: SandboxContract<TreasuryContract>;
    let tonBridge: SandboxContract<TreasuryContract>;
    let plumeNestCredit: SandboxContract<TreasuryContract>;
    let rwaFloat: SandboxContract<RWAFloat>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        floatMaster = await blockchain.treasury('float_master');
        tonBridge = await blockchain.treasury('ton_bridge');
        plumeNestCredit = await blockchain.treasury('plume_nest_credit');

        rwaFloat = blockchain.openContract(
            RWAFloat.createFromConfig(
                {
                    adminAddress: admin.address,
                    floatMasterAddress: floatMaster.address,
                    tonBridgeAddress: tonBridge.address,
                    plumeNestCreditAddress: plumeNestCredit.address,
                    totalInvested: 0n,
                    totalRedeemed: 0n,
                    plumeHoldings: 0n,
                    pendingRedemptions: 0n,
                    redemptionQueue: Dictionary.empty(Dictionary.Keys.Uint(64), Dictionary.Values.Cell()),
                    nextRedemptionId: 1n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await rwaFloat.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: rwaFloat.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const adminAddr = await rwaFloat.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const floatMasterAddr = await rwaFloat.getFloatMaster();
            expect(floatMasterAddr.toString()).toEqual(floatMaster.address.toString());

            const bridgeAddr = await rwaFloat.getTonBridge();
            expect(bridgeAddr.toString()).toEqual(tonBridge.address.toString());

            const plumeAddr = await rwaFloat.getPlumeNestCredit();
            expect(plumeAddr.toString()).toEqual(plumeNestCredit.address.toString());

            const version = await rwaFloat.getVersion();
            expect(version).toEqual(3);
        });

        it('should start with zero balances', async () => {
            const totalInvested = await rwaFloat.getTotalInvested();
            expect(totalInvested).toEqual(0n);

            const holdings = await rwaFloat.getPlumeHoldings();
            expect(holdings).toEqual(0n);

            const pending = await rwaFloat.getPendingRedemptions();
            expect(pending).toEqual(0n);
        });
    });

    describe('RWA Investment', () => {
        it('should invest to Plume via TON Bridge', async () => {
            const investAmount = toNano('500');

            const result = await rwaFloat.sendInvestRWA(
                floatMaster.getSender(),
                {
                    value: investAmount + toNano('0.3'),
                    amount: investAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: rwaFloat.address,
                success: true,
            });

            // Should send to TON Bridge
            expect(result.transactions).toHaveTransaction({
                from: rwaFloat.address,
                to: tonBridge.address,
                success: true,
            });

            const totalInvested = await rwaFloat.getTotalInvested();
            expect(totalInvested).toEqual(investAmount);

            const holdings = await rwaFloat.getPlumeHoldings();
            expect(holdings).toEqual(investAmount);
        });

        it('should reject investment from non-FloatMaster', async () => {
            const nonFloatMaster = await blockchain.treasury('non_float_master');

            const result = await rwaFloat.sendInvestRWA(
                nonFloatMaster.getSender(),
                {
                    value: toNano('500.3'),
                    amount: toNano('500'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonFloatMaster.address,
                to: rwaFloat.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('RWA Redemption', () => {
        beforeEach(async () => {
            // Invest first
            await rwaFloat.sendInvestRWA(
                floatMaster.getSender(),
                {
                    value: toNano('500.3'),
                    amount: toNano('500'),
                }
            );
        });

        it('should initiate redemption with 7-day queue', async () => {
            const redeemAmount = toNano('200');

            const result = await rwaFloat.sendRedeemRWA(
                admin.getSender(),
                {
                    value: toNano('0.2'),
                    amount: redeemAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: rwaFloat.address,
                success: true,
            });

            // Should send to TON Bridge
            expect(result.transactions).toHaveTransaction({
                from: rwaFloat.address,
                to: tonBridge.address,
                success: true,
            });

            const holdings = await rwaFloat.getPlumeHoldings();
            expect(holdings).toEqual(toNano('300'));

            const pending = await rwaFloat.getPendingRedemptions();
            expect(pending).toEqual(redeemAmount);
        });

        it('should calculate correct unlock time', () => {
            const requestTime = Math.floor(Date.now() / 1000);
            const unlockTime = calculateRedemptionUnlockTime(requestTime);

            expect(unlockTime).toEqual(requestTime + REDEMPTION_PERIOD_SECONDS);
            expect(unlockTime - requestTime).toEqual(604800); // 7 days
        });
    });

    describe('Yield Calculations', () => {
        it('should calculate daily yield correctly', () => {
            const holdings = toNano('1000');
            const dailyYield = calculateDailyYield(holdings, TARGET_APY_BPS);

            // Expected: 1000 * 0.10 / 365 = 0.2740 TON per day
            const expected = (holdings * 10n) / 36500n;
            expect(dailyYield).toEqual(expected);
        });

        it('should provide daily yield via getter', async () => {
            await rwaFloat.sendInvestRWA(
                floatMaster.getSender(),
                {
                    value: toNano('1000.3'),
                    amount: toNano('1000'),
                }
            );

            const dailyYield = await rwaFloat.getDailyYield();
            const expectedYield = calculateDailyYield(toNano('1000'), TARGET_APY_BPS);

            expect(dailyYield).toEqual(expectedYield);
        });
    });

    describe('Admin Functions', () => {
        it('should allow admin to update TON Bridge', async () => {
            const newBridge = await blockchain.treasury('new_bridge');

            const result = await rwaFloat.sendSetTonBridge(admin.getSender(), {
                value: toNano('0.05'),
                bridgeAddress: newBridge.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: rwaFloat.address,
                success: true,
            });

            const updatedBridge = await rwaFloat.getTonBridge();
            expect(updatedBridge.toString()).toEqual(newBridge.address.toString());
        });

        it('should allow admin to pause', async () => {
            const result = await rwaFloat.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: rwaFloat.address,
                success: true,
            });

            const paused = await rwaFloat.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject investment when paused', async () => {
            await rwaFloat.sendPause(admin.getSender(), toNano('0.05'));

            const result = await rwaFloat.sendInvestRWA(
                floatMaster.getSender(),
                {
                    value: toNano('500.3'),
                    amount: toNano('500'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: rwaFloat.address,
                success: false,
                exitCode: 402,
            });
        });
    });

    describe('Balance Tracking', () => {
        it('should track total balance correctly', async () => {
            await rwaFloat.sendInvestRWA(
                floatMaster.getSender(),
                {
                    value: toNano('500.3'),
                    amount: toNano('500'),
                }
            );

            const totalBalance = await rwaFloat.getTotalBalance();
            expect(totalBalance).toEqual(toNano('500'));
        });

        it('should separate holdings and pending redemptions', async () => {
            await rwaFloat.sendInvestRWA(
                floatMaster.getSender(),
                {
                    value: toNano('500.3'),
                    amount: toNano('500'),
                }
            );

            await rwaFloat.sendRedeemRWA(
                admin.getSender(),
                {
                    value: toNano('0.2'),
                    amount: toNano('200'),
                }
            );

            const holdings = await rwaFloat.getPlumeHoldings();
            expect(holdings).toEqual(toNano('300'));

            const pending = await rwaFloat.getPendingRedemptions();
            expect(pending).toEqual(toNano('200'));

            const totalBalance = await rwaFloat.getTotalBalance();
            expect(totalBalance).toEqual(toNano('500'));
        });
    });

    describe('Security', () => {
        it('should reject admin operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newAddr = await blockchain.treasury('new_addr');

            // Test sendSetTonBridge from non-admin
            const result1 = await rwaFloat.sendSetTonBridge(nonAdmin.getSender(), {
                value: toNano('0.05'),
                bridgeAddress: newAddr.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: rwaFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetFloatMaster from non-admin
            const result2 = await rwaFloat.sendSetFloatMaster(nonAdmin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newAddr.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: rwaFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendPause from non-admin
            const result3 = await rwaFloat.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: rwaFloat.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Constants', () => {
        it('should have correct APY target', () => {
            expect(TARGET_APY_BPS).toEqual(1000); // 10%
        });

        it('should have 7-day redemption period', () => {
            expect(REDEMPTION_PERIOD_SECONDS).toEqual(604800); // 7 days
        });
    });
});
