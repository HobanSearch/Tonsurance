import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary } from '@ton/core';
import {
    FloatMaster,
    calculateAllocation,
    ALLOCATION_RWA,
    ALLOCATION_BTC,
    ALLOCATION_DEFI,
    ALLOCATION_HEDGES
} from '../../wrappers/v3/FloatMaster';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('FloatMaster', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('FloatMaster');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let rwaFloat: SandboxContract<TreasuryContract>;
    let btcFloat: SandboxContract<TreasuryContract>;
    let defiFloat: SandboxContract<TreasuryContract>;
    let hedgeFloat: SandboxContract<TreasuryContract>;
    let floatMaster: SandboxContract<FloatMaster>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        vault = await blockchain.treasury('vault');
        rwaFloat = await blockchain.treasury('rwa_float');
        btcFloat = await blockchain.treasury('btc_float');
        defiFloat = await blockchain.treasury('defi_float');
        hedgeFloat = await blockchain.treasury('hedge_float');

        floatMaster = blockchain.openContract(
            FloatMaster.createFromConfig(
                {
                    adminAddress: admin.address,
                    vaultAddress: vault.address,
                    rwaFloatAddress: rwaFloat.address,
                    btcFloatAddress: btcFloat.address,
                    defiFloatAddress: defiFloat.address,
                    hedgeFloatAddress: hedgeFloat.address,
                    totalPremiumsCollected: 0n,
                    totalClaimsPaid: 0n,
                    protocolEarnedCapital: 0n,
                    activePolicies: Dictionary.empty(Dictionary.Keys.Uint(64), Dictionary.Values.Cell()),
                    totalActiveCoverage: 0n,
                    activeCoverageCapital: 0n,
                    expiredCoverageCapital: 0n,
                    coverageMaturities: Dictionary.empty(Dictionary.Keys.Uint(32), Dictionary.Values.BigUint(64)),
                    rwaAllocated: 0n,
                    btcAllocated: 0n,
                    defiAllocated: 0n,
                    hedgeAllocated: 0n,
                    illiquidDeployment: 0n,
                    paused: false,
                },
                code
            )
        );

        const deployResult = await floatMaster.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: floatMaster.address,
            deploy: true,
            success: true,
        });
    });

    describe('Storage and Initialization', () => {
        it('should load configuration correctly', async () => {
            const adminAddr = await floatMaster.getAdmin();
            expect(adminAddr.toString()).toEqual(admin.address.toString());

            const vaultAddr = await floatMaster.getVault();
            expect(vaultAddr.toString()).toEqual(vault.address.toString());

            const version = await floatMaster.getVersion();
            expect(version).toEqual(3);
        });

        it('should have correct float addresses', async () => {
            const rwaAddr = await floatMaster.getRWAFloat();
            expect(rwaAddr.toString()).toEqual(rwaFloat.address.toString());

            const btcAddr = await floatMaster.getBTCFloat();
            expect(btcAddr.toString()).toEqual(btcFloat.address.toString());

            const defiAddr = await floatMaster.getDeFiFloat();
            expect(defiAddr.toString()).toEqual(defiFloat.address.toString());

            const hedgeAddr = await floatMaster.getHedgeFloat();
            expect(hedgeAddr.toString()).toEqual(hedgeFloat.address.toString());
        });

        it('should start with zero balances', async () => {
            const totalPremiums = await floatMaster.getTotalPremiumsCollected();
            expect(totalPremiums).toEqual(0n);

            const activeCoverage = await floatMaster.getTotalActiveCoverage();
            expect(activeCoverage).toEqual(0n);

            const floatBalance = await floatMaster.getTotalFloatBalance();
            expect(floatBalance).toEqual(0n);
        });
    });

    describe('Premium Allocation', () => {
        it('should receive and allocate premium to 4 floats', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const premiumAmount = toNano('100');
            const policyId = 1n;
            const coverageAmount = toNano('10000');
            const expiryTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30;

            const result = await floatMaster.sendReceivePremium(
                childContract.getSender(),
                {
                    value: premiumAmount + toNano('0.5'),
                    policyId: policyId,
                    premiumAmount: premiumAmount,
                    productType: 1,
                    assetId: 1,
                    coverageAmount: coverageAmount,
                    expiryTimestamp: expiryTimestamp,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: childContract.address,
                to: floatMaster.address,
                success: true,
            });

            // Should send to RWA Float (50%)
            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: rwaFloat.address,
                success: true,
            });

            // Should send to BTC Float (15%)
            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: btcFloat.address,
                success: true,
            });

            // Should send to DeFi Float (15%)
            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: defiFloat.address,
                success: true,
            });

            // Should send to Hedge Float (20%)
            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: hedgeFloat.address,
                success: true,
            });

            // Verify allocation tracking
            const allocations = await floatMaster.getFloatAllocations();
            const expectedRWA = calculateAllocation(premiumAmount, ALLOCATION_RWA);
            const expectedBTC = calculateAllocation(premiumAmount, ALLOCATION_BTC);
            const expectedDeFi = calculateAllocation(premiumAmount, ALLOCATION_DEFI);
            const expectedHedge = calculateAllocation(premiumAmount, ALLOCATION_HEDGES);

            expect(allocations.rwa).toEqual(expectedRWA);
            expect(allocations.btc).toEqual(expectedBTC);
            expect(allocations.defi).toEqual(expectedDeFi);
            expect(allocations.hedge).toEqual(expectedHedge);
        });

        it('should track total premiums collected', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const premiumAmount = toNano('100');

            await floatMaster.sendReceivePremium(
                childContract.getSender(),
                {
                    value: premiumAmount + toNano('0.5'),
                    policyId: 1n,
                    premiumAmount: premiumAmount,
                    productType: 1,
                    assetId: 1,
                    coverageAmount: toNano('10000'),
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 30,
                }
            );

            const totalPremiums = await floatMaster.getTotalPremiumsCollected();
            expect(totalPremiums).toEqual(premiumAmount);
        });

        it('should calculate correct 4-pillar allocation percentages', () => {
            const premium = toNano('100');

            const rwaAlloc = calculateAllocation(premium, ALLOCATION_RWA);
            const btcAlloc = calculateAllocation(premium, ALLOCATION_BTC);
            const defiAlloc = calculateAllocation(premium, ALLOCATION_DEFI);
            const hedgeAlloc = calculateAllocation(premium, ALLOCATION_HEDGES);

            // RWA: 50% of 100 = 50 TON
            expect(rwaAlloc).toEqual(toNano('50'));
            // BTC: 15% of 100 = 15 TON
            expect(btcAlloc).toEqual(toNano('15'));
            // DeFi: 15% of 100 = 15 TON
            expect(defiAlloc).toEqual(toNano('15'));
            // Hedge: 20% of 100 = 20 TON
            expect(hedgeAlloc).toEqual(toNano('20'));

            // Total should equal premium
            expect(rwaAlloc + btcAlloc + defiAlloc + hedgeAlloc).toEqual(premium);
        });
    });

    describe('Capital Maturity Tracking', () => {
        it('should track active coverage capital', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const coverageAmount = toNano('10000');
            const premiumAmount = toNano('100');

            await floatMaster.sendReceivePremium(
                childContract.getSender(),
                {
                    value: premiumAmount + toNano('0.5'),
                    policyId: 1n,
                    premiumAmount: premiumAmount,
                    productType: 1,
                    assetId: 1,
                    coverageAmount: coverageAmount,
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 30,
                }
            );

            const activeCoverage = await floatMaster.getTotalActiveCoverage();
            expect(activeCoverage).toEqual(coverageAmount);

            const activeCapital = await floatMaster.getActiveCoverageCapital();
            expect(activeCapital).toEqual(coverageAmount);
        });

        it('should release expired coverage capital', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const coverageAmount = toNano('10000');
            const premiumAmount = toNano('100');
            const expiryTimestamp = Math.floor(Date.now() / 1000) + 86400 * 30;

            await floatMaster.sendReceivePremium(
                childContract.getSender(),
                {
                    value: premiumAmount + toNano('0.5'),
                    policyId: 1n,
                    premiumAmount: premiumAmount,
                    productType: 1,
                    assetId: 1,
                    coverageAmount: coverageAmount,
                    expiryTimestamp: expiryTimestamp,
                }
            );

            const result = await floatMaster.sendReleaseExpiredCoverage(
                admin.getSender(),
                {
                    value: toNano('0.1'),
                    expiryTimestamp: expiryTimestamp,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: floatMaster.address,
                success: true,
            });

            const expiredCapital = await floatMaster.getExpiredCoverageCapital();
            expect(expiredCapital).toEqual(coverageAmount);
        });
    });

    describe('Daily Yield Aggregation', () => {
        it('should aggregate yields from 4 floats', async () => {
            const rwaYield = toNano('10');
            const btcYield = toNano('5');
            const defiYield = toNano('8');
            const hedgePnL = toNano('2');

            const result = await floatMaster.sendAggregateDailyYield(
                admin.getSender(),
                {
                    value: toNano('0.2'),
                    rwaYield: rwaYield,
                    btcYield: btcYield,
                    defiYield: defiYield,
                    hedgePnL: hedgePnL,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: floatMaster.address,
                success: true,
            });

            // Should send yield to vault
            expect(result.transactions).toHaveTransaction({
                from: floatMaster.address,
                to: vault.address,
                success: true,
            });
        });

        it('should reject yield aggregation from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');

            const result = await floatMaster.sendAggregateDailyYield(
                nonAdmin.getSender(),
                {
                    value: toNano('0.2'),
                    rwaYield: toNano('10'),
                    btcYield: toNano('5'),
                    defiYield: toNano('8'),
                    hedgePnL: toNano('2'),
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: floatMaster.address,
                success: false,
                exitCode: 401, // err::unauthorized
            });
        });
    });

    describe('Admin Functions', () => {
        it('should allow admin to update RWA float', async () => {
            const newFloat = await blockchain.treasury('new_rwa_float');

            const result = await floatMaster.sendSetRWAFloat(admin.getSender(), {
                value: toNano('0.05'),
                floatAddress: newFloat.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: floatMaster.address,
                success: true,
            });

            const updatedFloat = await floatMaster.getRWAFloat();
            expect(updatedFloat.toString()).toEqual(newFloat.address.toString());
        });

        it('should allow admin to update all float addresses', async () => {
            const newRWA = await blockchain.treasury('new_rwa');
            const newBTC = await blockchain.treasury('new_btc');
            const newDeFi = await blockchain.treasury('new_defi');
            const newHedge = await blockchain.treasury('new_hedge');

            await Promise.all([
                floatMaster.sendSetRWAFloat(admin.getSender(), {
                    value: toNano('0.05'),
                    floatAddress: newRWA.address,
                }),
                floatMaster.sendSetBTCFloat(admin.getSender(), {
                    value: toNano('0.05'),
                    floatAddress: newBTC.address,
                }),
                floatMaster.sendSetDeFiFloat(admin.getSender(), {
                    value: toNano('0.05'),
                    floatAddress: newDeFi.address,
                }),
                floatMaster.sendSetHedgeFloat(admin.getSender(), {
                    value: toNano('0.05'),
                    floatAddress: newHedge.address,
                }),
            ]);

            const rwaAddr = await floatMaster.getRWAFloat();
            const btcAddr = await floatMaster.getBTCFloat();
            const defiAddr = await floatMaster.getDeFiFloat();
            const hedgeAddr = await floatMaster.getHedgeFloat();

            expect(rwaAddr.toString()).toEqual(newRWA.address.toString());
            expect(btcAddr.toString()).toEqual(newBTC.address.toString());
            expect(defiAddr.toString()).toEqual(newDeFi.address.toString());
            expect(hedgeAddr.toString()).toEqual(newHedge.address.toString());
        });

        it('should allow admin to pause', async () => {
            const result = await floatMaster.sendPause(admin.getSender(), toNano('0.05'));

            expect(result.transactions).toHaveTransaction({
                from: admin.address,
                to: floatMaster.address,
                success: true,
            });

            const paused = await floatMaster.getPaused();
            expect(paused).toBe(true);
        });

        it('should reject premium when paused', async () => {
            await floatMaster.sendPause(admin.getSender(), toNano('0.05'));

            const childContract = await blockchain.treasury('child_contract');
            const result = await floatMaster.sendReceivePremium(
                childContract.getSender(),
                {
                    value: toNano('100.5'),
                    policyId: 1n,
                    premiumAmount: toNano('100'),
                    productType: 1,
                    assetId: 1,
                    coverageAmount: toNano('10000'),
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 30,
                }
            );

            expect(result.transactions).toHaveTransaction({
                from: childContract.address,
                to: floatMaster.address,
                success: false,
                exitCode: 402, // err::paused
            });
        });
    });

    describe('Maturity Ratio', () => {
        it('should calculate maturity ratio correctly', async () => {
            const childContract = await blockchain.treasury('child_contract');
            const premiumAmount = toNano('100');
            const coverageAmount = toNano('10000');

            await floatMaster.sendReceivePremium(
                childContract.getSender(),
                {
                    value: premiumAmount + toNano('0.5'),
                    policyId: 1n,
                    premiumAmount: premiumAmount,
                    productType: 1,
                    assetId: 1,
                    coverageAmount: coverageAmount,
                    expiryTimestamp: Math.floor(Date.now() / 1000) + 86400 * 30,
                }
            );

            const maturityRatio = await floatMaster.getMaturityRatio();
            // Ratio = total_float / active_coverage
            // total_float = 100 TON (premium)
            // active_coverage = 10000 TON
            // ratio = 100 / 10000 = 0.01 = 10000000 (fixed point with 9 decimals)
            expect(maturityRatio).toBeGreaterThan(0n);
        });

        it('should return 0 maturity ratio when no active coverage', async () => {
            const maturityRatio = await floatMaster.getMaturityRatio();
            expect(maturityRatio).toEqual(0n);
        });
    });

    describe('Security', () => {
        it('should reject admin operations from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('non_admin');
            const newAddr = await blockchain.treasury('new_addr');

            // Test sendSetRWAFloat from non-admin
            const result1 = await floatMaster.sendSetRWAFloat(nonAdmin.getSender(), {
                value: toNano('0.05'),
                floatAddress: newAddr.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: floatMaster.address,
                success: false,
                exitCode: 401,
            });

            // Test sendSetVault from non-admin
            const result2 = await floatMaster.sendSetVault(nonAdmin.getSender(), {
                value: toNano('0.05'),
                vaultAddress: newAddr.address,
            });

            expect(result2.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: floatMaster.address,
                success: false,
                exitCode: 401,
            });

            // Test sendPause from non-admin
            const result3 = await floatMaster.sendPause(nonAdmin.getSender(), toNano('0.05'));

            expect(result3.transactions).toHaveTransaction({
                from: nonAdmin.address,
                to: floatMaster.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Constants', () => {
        it('should have correct allocation percentages', () => {
            expect(ALLOCATION_RWA).toEqual(5000);    // 50%
            expect(ALLOCATION_BTC).toEqual(1500);    // 15%
            expect(ALLOCATION_DEFI).toEqual(1500);   // 15%
            expect(ALLOCATION_HEDGES).toEqual(2000); // 20%

            // Total should equal 100%
            expect(ALLOCATION_RWA + ALLOCATION_BTC + ALLOCATION_DEFI + ALLOCATION_HEDGES).toEqual(10000);
        });
    });
});
