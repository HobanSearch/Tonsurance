import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address } from '@ton/core';
import {
    BTCFloat,
    calculateDailyYield,
    calculateAnnualRewards,
    TARGET_APY_BPS
} from '../../wrappers/v3/BTCFloat';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('BTCFloat', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('BTCFloat');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let floatMaster: SandboxContract<TreasuryContract>;
    let tonstakers: SandboxContract<TreasuryContract>;
    let btcFloat: SandboxContract<BTCFloat>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        floatMaster = await blockchain.treasury('float_master');
        tonstakers = await blockchain.treasury('tonstakers');

        btcFloat = blockchain.openContract(
            BTCFloat.createFromConfig(
                {
                    adminAddress: admin.address,
                    floatMasterAddress: floatMaster.address,
                    tonstakersAddress: tonstakers.address,
                    totalStaked: 0n,
                    totalUnstaked: 0n,
                    tsTONHoldings: 0n,
                    accumulatedRewards: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await btcFloat.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: btcFloat.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const adminAddr = await btcFloat.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const floatMasterAddr = await btcFloat.getFloatMaster();
            expect(floatMasterAddr.toString()).toEqual(floatMaster.address.toString());

            const tonstakersAddr = await btcFloat.getTonstakers();
            expect(tonstakersAddr.toString()).toEqual(tonstakers.address.toString());

            const version = await btcFloat.getVersion();
            expect(version).toEqual(3);
        });

        it('should start with zero balances', async () => {
            const totalStaked = await btcFloat.getTotalStaked();
            expect(totalStaked).toEqual(0n);

            const holdings = await btcFloat.getTsTONHoldings();
            expect(holdings).toEqual(0n);

            const rewards = await btcFloat.getAccumulatedRewards();
            expect(rewards).toEqual(0n);
        });
    });

    describe('Staking Operations', () => {
        it('should stake TON to Tonstakers', async () => {
            const stakeAmount = toNano('100');

            const result = await btcFloat.sendStakeBTC(
                floatMaster.getSender(),
                {
                    value: stakeAmount + toNano('0.1'),
                    amount: stakeAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: btcFloat.address,
                success: true,
            });

            // Should send to Tonstakers
            expect(result.transactions).toHaveTransaction({
                from: btcFloat.address,
                to: tonstakers.address,
                success: true,
            });

            const totalStaked = await btcFloat.getTotalStaked();
            expect(totalStaked).toEqual(stakeAmount);

            const holdings = await btcFloat.getTsTONHoldings();
            expect(holdings).toEqual(stakeAmount);
        });

        it('should reject staking from non-FloatMaster', async () => {
            const nonFloatMaster = await blockchain.treasury('non_float_master');
            const stakeAmount = toNano('100');

            const result = await btcFloat.sendStakeBTC(
                nonFloatMaster.getSender(),
                {
                    value: stakeAmount + toNano('0.1'),
                    amount: stakeAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonFloatMaster.address,
                to: btcFloat.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should accumulate multiple stakes', async () => {
            const stake1 = toNano('50');
            const stake2 = toNano('75');

            await btcFloat.sendStakeBTC(
                floatMaster.getSender(),
                {
                    value: stake1 + toNano('0.1'),
                    amount: stake1,
                }
            );

            await btcFloat.sendStakeBTC(
                floatMaster.getSender(),
                {
                    value: stake2 + toNano('0.1'),
                    amount: stake2,
                }
            );

            const totalStaked = await btcFloat.getTotalStaked();
            expect(totalStaked).toEqual(stake1 + stake2);

            const holdings = await btcFloat.getTsTONHoldings();
            expect(holdings).toEqual(stake1 + stake2);
        });
    });

    describe('Unstaking Operations', () => {
        beforeEach(async () => {
            // Stake some TON first
            await btcFloat.sendStakeBTC(
                floatMaster.getSender(),
                {
                    value: toNano('100.1'),
                    amount: toNano('100'),
                }
            );
        });

        it('should unstake TON from Tonstakers', async () => {
            const unstakeAmount = toNano('50');

            const result = await btcFloat.sendUnstakeBTC(
                admin.getSender(),
                {
                    value: toNano('0.15'),
                    amount: unstakeAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: btcFloat.address,
                success: true,
            });

            // Should send to Tonstakers
            expect(result.transactions).toHaveTransaction({
                from: btcFloat.address,
                to: tonstakers.address,
                success: true,
            });

            // Should return funds to FloatMaster
            expect(result.transactions).toHaveTransaction({
                from: btcFloat.address,
                to: floatMaster.address,
            });

            const holdings = await btcFloat.getTsTONHoldings();
            expect(holdings).toEqual(toNano('50'));
        });

        it('should allow FloatMaster to unstake', async () => {
            const unstakeAmount = toNano('30');

            const result = await btcFloat.sendUnstakeBTC(
                floatMaster.getSender(),
                {
                    value: toNano('0.15'),
                    amount: unstakeAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: btcFloat.address,
                success: true,
            });
        });

        it('should reject unstaking from unauthorized address', async () => {
            const nonAuthorized = await blockchain.treasury('non_authorized');
            const unstakeAmount = toNano('50');

            const result = await btcFloat.sendUnstakeBTC(
                nonAuthorized.getSender(),
                {
                    value: toNano('0.1'),
                    amount: unstakeAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAuthorized.address,
                to: btcFloat.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });

        it('should reject unstaking more than holdings', async () => {
            const unstakeAmount = toNano('150'); // More than staked

            const result = await btcFloat.sendUnstakeBTC(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    amount: unstakeAmount,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: btcFloat.address,
                success: false,
                exitCode: 405, // err::insufficient_balance
            });
        });
    });

    describe('Yield Calculations', () => {
        it('should calculate daily yield correctly', () => {
            const holdings = toNano('1000');
            const dailyYield = calculateDailyYield(holdings, TARGET_APY_BPS);

            // Expected: 1000 * 2000 / 3650000 = 0.5479 TON per day (2000 bps = 20%)
            const expected = (holdings * BigInt(TARGET_APY_BPS)) / (365n * 10000n);
            expect(dailyYield).toEqual(expected);
        });

        it('should calculate annual rewards correctly', () => {
            const holdings = toNano('1000');
            const annualRewards = calculateAnnualRewards(holdings, TARGET_APY_BPS);

            // Expected: 1000 * 2000 / 10000 = 200 TON per year (2000 bps = 20%)
            const expected = (holdings * BigInt(TARGET_APY_BPS)) / 10000n;
            expect(annualRewards).toEqual(expected);
        });

        it('should provide daily yield via getter', async () => {
            // Stake some TON
            await btcFloat.sendStakeBTC(
                floatMaster.getSender(),
                {
                    value: toNano('1000.1'),
                    amount: toNano('1000'),
                }
            );

            const dailyYield = await btcFloat.getDailyYield();
            const expectedYield = calculateDailyYield(toNano('1000'), TARGET_APY_BPS);

            expect(dailyYield).toEqual(expectedYield);
        });

        it('should have correct APY target', () => {
            expect(TARGET_APY_BPS).toEqual(2000); // 20%
        });
    });

    describe('Admin Functions', () => {
        it('should allow admin to update Tonstakers address', async () => {
            const newTonstakers = await blockchain.treasury('new_tonstakers');

            const result = await btcFloat.sendSetTonstakers(admin.getSender(), {
                value: toNano('0.05'),
                tonstakersAddress: newTonstakers.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: btcFloat.address,
                success: true,
            });

            const updatedTonstakers = await btcFloat.getTonstakers();
            expect(updatedTonstakers.toString()).toEqual(newTonstakers.address.toString());
        });

        it('should allow admin to update FloatMaster address', async () => {
            const newFloatMaster = await blockchain.treasury('new_float_master');

            const result = await btcFloat.sendSetFloatMaster(admin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newFloatMaster.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: btcFloat.address,
                success: true,
            });

            const updatedFloatMaster = await btcFloat.getFloatMaster();
            expect(updatedFloatMaster.toString()).toEqual(newFloatMaster.address.toString());
        });

        it('should allow admin to pause', async () => {
            const result = await btcFloat.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: btcFloat.address,
                success: true,
            });

            const paused = await btcFloat.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject staking when paused', async () => {
            await btcFloat.sendPause(admin.getSender(), toNano('0.05'));

            const result = await btcFloat.sendStakeBTC(
                floatMaster.getSender(),
                {
                    value: toNano('100.1'),
                    amount: toNano('100'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: btcFloat.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('Balance Tracking', () => {
        it('should track total balance correctly', async () => {
            const stakeAmount = toNano('100');

            await btcFloat.sendStakeBTC(
                floatMaster.getSender(),
                {
                    value: stakeAmount + toNano('0.1'),
                    amount: stakeAmount,
                }
            );

            const totalBalance = await btcFloat.getTotalBalance();
            expect(totalBalance).toEqual(stakeAmount);
        });

        it('should update balance after unstaking', async () => {
            await btcFloat.sendStakeBTC(
                floatMaster.getSender(),
                {
                    value: toNano('100.1'),
                    amount: toNano('100'),
                }
            );

            await btcFloat.sendUnstakeBTC(
                admin.getSender(),
                {
                    value: toNano('0.15'),
                    amount: toNano('30'),
                }
            );

            const totalBalance = await btcFloat.getTotalBalance();
            expect(totalBalance).toEqual(toNano('70'));
        });
    });

    describe('Security', () => {
        it('should reject admin operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newAddr = await blockchain.treasury('new_addr');

            // Test sendSetTonstakers from non-admin
            const result1 = await btcFloat.sendSetTonstakers(nonAdmin.getSender(), {
                value: toNano('0.05'),
                tonstakersAddress: newAddr.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: btcFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetFloatMaster from non-admin
            const result2 = await btcFloat.sendSetFloatMaster(nonAdmin.getSender(), {
                value: toNano('0.05'),
                floatMasterAddress: newAddr.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: btcFloat.address,
                success: false,
                exitCode: 401,
            });

            // Test sendPause from non-admin
            const result3 = await btcFloat.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: btcFloat.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Constants', () => {
        it('should have correct APY target', () => {
            expect(TARGET_APY_BPS).toEqual(2000); // 20%
        });
    });
});
