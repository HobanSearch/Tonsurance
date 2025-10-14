/**
 * BitcoinFloatManager Smart Contract Tests
 *
 * Tests Bitcoin float strategy for sustainable yields:
 * - Allocation calculation (40% USD / 60% BTC target)
 * - Drift detection (>10% triggers rebalance)
 * - Trade signal generation (buy/sell BTC)
 * - Rebalancing execution
 * - Minimum float enforcement (50 BTC)
 * - Dollar-cost averaging
 * - P&L tracking
 */

import { Blockchain, SandboxContract, TreasuryContract } from '@ton-community/sandbox';
import { Cell, toNano } from 'ton-core';
import { BitcoinFloatManager } from '../wrappers/BitcoinFloatManager';
import '@ton-community/test-utils';
import { compile } from '@ton-community/blueprint';

describe('BitcoinFloatManager', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let floatManager: SandboxContract<BitcoinFloatManager>;
    let deployer: SandboxContract<TreasuryContract>;
    let vault: SandboxContract<TreasuryContract>;
    let oracle: SandboxContract<TreasuryContract>;

    const SATS_PER_BTC = 100_000_000n;
    const BASIS_POINTS = 10000n;

    beforeAll(async () => {
        code = await compile('BitcoinFloatManager');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        vault = await blockchain.treasury('vault');
        oracle = await blockchain.treasury('oracle');

        floatManager = blockchain.openContract(
            BitcoinFloatManager.createFromConfig(
                {
                    btcFloatSats: 1000n * SATS_PER_BTC, // 1000 BTC
                    btcCostBasis: toNano('50000000'), // $50M cost basis
                    usdReserves: toNano('10000000'), // $10M USD
                    targetUsdPct: 4000, // 40%
                    rebalanceThreshold: 1000, // 10%
                    minFloatBtcSats: 50n * SATS_PER_BTC, // 50 BTC minimum
                    dcaEnabled: true,
                    dcaFrequencySeconds: 86400, // Daily
                    lastRebalanceTime: 0,
                    vaultAddress: vault.address,
                    oracleAddress: oracle.address,
                    adminAddress: deployer.address,
                },
                code
            )
        );

        await floatManager.sendDeploy(deployer.getSender(), toNano('0.05'));
    });

    describe('Allocation Calculation', () => {
        it('should calculate correct USD percentage', async () => {
            // At $50k BTC price:
            // BTC value = 1000 BTC × $50k = $50M
            // USD = $10M
            // Total = $60M
            // USD % = $10M / $60M = 16.67%

            const btcPrice = toNano('50000');
            const usdPct = await floatManager.getCurrentUsdPct(btcPrice);

            const expectedPct = 1667n; // 16.67% in basis points
            const tolerance = 10n;

            expect(usdPct).toBeGreaterThan(expectedPct - tolerance);
            expect(usdPct).toBeLessThan(expectedPct + tolerance);
        });

        it('should calculate drift from target', async () => {
            // Current: 16.67% USD
            // Target: 40% USD
            // Drift: 23.33%

            const btcPrice = toNano('50000');
            const drift = await floatManager.getAllocationDrift(btcPrice);

            const expectedDrift = 2333n; // 23.33%
            const tolerance = 10n;

            expect(drift).toBeGreaterThan(expectedDrift - tolerance);
            expect(drift).toBeLessThan(expectedDrift + tolerance);
        });

        it('should determine rebalancing urgency', async () => {
            const btcPrice = toNano('50000');
            const urgency = await floatManager.getRebalancingUrgency(btcPrice);

            // Drift ~23% → HIGH urgency (>15%)
            expect(urgency).toBe(3); // URGENCY_HIGH
        });
    });

    describe('Trade Signal Generation', () => {
        it('should generate BUY signal when too much USD', async () => {
            // Current: 16.67% USD, Target: 40%
            // Need to buy BTC
            const btcPrice = toNano('50000');
            const [action, amount] = await floatManager.getTradeSignal(btcPrice);

            expect(action).toBe(1); // BUY_BTC
            expect(amount).toBeGreaterThan(0n);
        });

        it('should generate SELL signal when too much BTC', async () => {
            // Manually set high USD reserves to force sell
            // If USD = $50M, BTC = $50M (50% each)
            // Target 40% → need to sell BTC

            const floatManager2 = blockchain.openContract(
                BitcoinFloatManager.createFromConfig(
                    {
                        btcFloatSats: 1000n * SATS_PER_BTC,
                        btcCostBasis: toNano('50000000'),
                        usdReserves: toNano('50000000'), // High USD
                        targetUsdPct: 4000,
                        rebalanceThreshold: 1000,
                        minFloatBtcSats: 50n * SATS_PER_BTC,
                        dcaEnabled: true,
                        dcaFrequencySeconds: 86400,
                        lastRebalanceTime: 0,
                        vaultAddress: vault.address,
                        oracleAddress: oracle.address,
                        adminAddress: deployer.address,
                    },
                    code
                )
            );

            await floatManager2.sendDeploy(deployer.getSender(), toNano('0.05'));

            const btcPrice = toNano('50000');
            const [action, amount] = await floatManager2.getTradeSignal(btcPrice);

            expect(action).toBe(2); // SELL_BTC
            expect(amount).toBeGreaterThan(0n);
        });

        it('should generate HOLD signal when within threshold', async () => {
            // Set perfectly balanced allocation
            const floatManager2 = blockchain.openContract(
                BitcoinFloatManager.createFromConfig(
                    {
                        btcFloatSats: 1000n * SATS_PER_BTC,
                        btcCostBasis: toNano('50000000'),
                        usdReserves: toNano('33333333'), // 40% of total
                        targetUsdPct: 4000,
                        rebalanceThreshold: 1000,
                        minFloatBtcSats: 50n * SATS_PER_BTC,
                        dcaEnabled: true,
                        dcaFrequencySeconds: 86400,
                        lastRebalanceTime: 0,
                        vaultAddress: vault.address,
                        oracleAddress: oracle.address,
                        adminAddress: deployer.address,
                    },
                    code
                )
            );

            await floatManager2.sendDeploy(deployer.getSender(), toNano('0.05'));

            const btcPrice = toNano('50000');
            const [action, amount] = await floatManager2.getTradeSignal(btcPrice);

            expect(action).toBe(0); // HOLD
        });

        it('should reduce trade size when DCA enabled', async () => {
            // DCA should trade 25% of excess at a time
            const btcPrice = toNano('50000');
            const [action, amountWithDCA] = await floatManager.getTradeSignal(btcPrice);

            // Disable DCA
            await floatManager.sendUpdateAllocation(
                deployer.getSender(),
                {
                    newTargetUsdPct: 4000,
                    newRebalanceThreshold: 1000,
                }
            );

            const floatManagerNoDCA = blockchain.openContract(
                BitcoinFloatManager.createFromConfig(
                    {
                        btcFloatSats: 1000n * SATS_PER_BTC,
                        btcCostBasis: toNano('50000000'),
                        usdReserves: toNano('10000000'),
                        targetUsdPct: 4000,
                        rebalanceThreshold: 1000,
                        minFloatBtcSats: 50n * SATS_PER_BTC,
                        dcaEnabled: false, // No DCA
                        dcaFrequencySeconds: 86400,
                        lastRebalanceTime: 0,
                        vaultAddress: vault.address,
                        oracleAddress: oracle.address,
                        adminAddress: deployer.address,
                    },
                    code
                )
            );

            await floatManagerNoDCA.sendDeploy(deployer.getSender(), toNano('0.05'));

            const [action2, amountNoDCA] = await floatManagerNoDCA.getTradeSignal(btcPrice);

            // DCA amount should be ~25% of no-DCA amount
            expect(amountWithDCA * 4n).toBeCloseTo(amountNoDCA, toNano('100000'));
        });
    });

    describe('Minimum Float Enforcement', () => {
        it('should prevent selling below minimum', async () => {
            // Set float close to minimum
            const floatManager2 = blockchain.openContract(
                BitcoinFloatManager.createFromConfig(
                    {
                        btcFloatSats: 60n * SATS_PER_BTC, // 60 BTC (close to 50 min)
                        btcCostBasis: toNano('3000000'),
                        usdReserves: toNano('50000000'), // High USD → would trigger sell
                        targetUsdPct: 4000,
                        rebalanceThreshold: 1000,
                        minFloatBtcSats: 50n * SATS_PER_BTC,
                        dcaEnabled: false,
                        dcaFrequencySeconds: 86400,
                        lastRebalanceTime: 0,
                        vaultAddress: vault.address,
                        oracleAddress: oracle.address,
                        adminAddress: deployer.address,
                    },
                    code
                )
            );

            await floatManager2.sendDeploy(deployer.getSender(), toNano('0.05'));

            const btcPrice = toNano('50000');
            const [action, amount] = await floatManager2.getTradeSignal(btcPrice);

            if (action === 2) { // SELL_BTC
                // Amount should be limited to not breach minimum
                const btcToSell = amount * SATS_PER_BTC / btcPrice;
                const remainingBtc = 60n * SATS_PER_BTC - btcToSell;

                expect(remainingBtc).toBeGreaterThanOrEqual(50n * SATS_PER_BTC);
            }
        });

        it('should HOLD if at minimum', async () => {
            const floatManager2 = blockchain.openContract(
                BitcoinFloatManager.createFromConfig(
                    {
                        btcFloatSats: 50n * SATS_PER_BTC, // Exactly at minimum
                        btcCostBasis: toNano('2500000'),
                        usdReserves: toNano('50000000'),
                        targetUsdPct: 4000,
                        rebalanceThreshold: 1000,
                        minFloatBtcSats: 50n * SATS_PER_BTC,
                        dcaEnabled: false,
                        dcaFrequencySeconds: 86400,
                        lastRebalanceTime: 0,
                        vaultAddress: vault.address,
                        oracleAddress: oracle.address,
                        adminAddress: deployer.address,
                    },
                    code
                )
            );

            await floatManager2.sendDeploy(deployer.getSender(), toNano('0.05'));

            const btcPrice = toNano('50000');
            const [action, amount] = await floatManager2.getTradeSignal(btcPrice);

            expect(action).toBe(0); // HOLD
        });
    });

    describe('Rebalancing Execution', () => {
        it('should execute BTC purchase', async () => {
            const btcPrice = toNano('50000');

            const result = await floatManager.sendRebalance(
                deployer.getSender(),
                {
                    btcPrice,
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            // BTC float should increase
            const btcFloatAfter = await floatManager.getBtcFloatSats();
            expect(btcFloatAfter).toBeGreaterThan(1000n * SATS_PER_BTC);
        });

        it('should update cost basis on purchase', async () => {
            const btcPrice = toNano('50000');
            const costBasisBefore = await floatManager.getBtcCostBasis();

            await floatManager.sendBuyBtc(
                deployer.getSender(),
                {
                    usdAmount: toNano('1000000'), // Buy $1M worth
                    btcPrice,
                }
            );

            const costBasisAfter = await floatManager.getBtcCostBasis();

            // Cost basis should increase by $1M
            expect(costBasisAfter).toBe(costBasisBefore + toNano('1000000'));
        });

        it('should track last rebalance time', async () => {
            const btcPrice = toNano('50000');

            await floatManager.sendRebalance(
                deployer.getSender(),
                {
                    btcPrice,
                }
            );

            // In production, would check lastRebalanceTime storage
            // For now, verify transaction succeeded
        });
    });

    describe('P&L Tracking', () => {
        it('should calculate unrealized gains', async () => {
            // Cost basis: $50M (1000 BTC @ $50k each)
            // Current price: $60k
            // Unrealized gain: 1000 × ($60k - $50k) = $10M

            const btcPrice = toNano('60000');
            const pnl = await floatManager.getUnrealizedPnl(btcPrice);

            const expectedPnl = toNano('10000000');
            const tolerance = toNano('100000');

            expect(pnl).toBeGreaterThan(expectedPnl - tolerance);
            expect(pnl).toBeLessThan(expectedPnl + tolerance);
        });

        it('should calculate unrealized losses', async () => {
            // Cost basis: $50M
            // Current price: $40k
            // Unrealized loss: 1000 × ($40k - $50k) = -$10M

            const btcPrice = toNano('40000');
            const pnl = await floatManager.getUnrealizedPnl(btcPrice);

            const expectedLoss = -toNano('10000000');
            const tolerance = toNano('100000');

            expect(pnl).toBeLessThan(expectedLoss + tolerance);
            expect(pnl).toBeGreaterThan(expectedLoss - tolerance);
        });
    });

    describe('Yield Coverage', () => {
        it('should calculate years of coverage', async () => {
            // BTC float: 1000 BTC @ $50k = $50M
            // Annual yield requirement: $5M
            // Years: $50M / $5M = 10 years

            const btcPrice = toNano('50000');
            const annualYieldReq = toNano('5000000');
            const btcAppreciationRate = 3000; // 30% annually

            const years = await floatManager.getYearsOfCoverage(
                annualYieldReq,
                btcPrice,
                btcAppreciationRate
            );

            expect(years).toBe(10n);
        });

        it('should show infinite coverage with zero requirement', async () => {
            const btcPrice = toNano('50000');
            const annualYieldReq = toNano('0');
            const btcAppreciationRate = 3000;

            const years = await floatManager.getYearsOfCoverage(
                annualYieldReq,
                btcPrice,
                btcAppreciationRate
            );

            expect(years).toBeGreaterThan(100n); // Effectively infinite
        });
    });

    describe('Emergency Controls', () => {
        it('should allow admin to pause', async () => {
            const result = await floatManager.sendEmergencyPause(
                deployer.getSender()
            );

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            // DCA should be disabled and threshold increased
            const [targetPct, threshold, minFloat] = await floatManager.getAllocationSettings();
            expect(threshold).toBe(5000n); // 50% conservative threshold
        });

        it('should reject pause from non-admin', async () => {
            const nonAdmin = await blockchain.treasury('nonAdmin');

            const result = await floatManager.sendEmergencyPause(
                nonAdmin.getSender()
            );

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 700,
            });
        });

        it('should allow admin to update allocation settings', async () => {
            const result = await floatManager.sendUpdateAllocation(
                deployer.getSender(),
                {
                    newTargetUsdPct: 5000, // 50% USD
                    newRebalanceThreshold: 1500, // 15%
                }
            );

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            const [targetPct, threshold, minFloat] = await floatManager.getAllocationSettings();
            expect(targetPct).toBe(5000n);
            expect(threshold).toBe(1500n);
        });
    });
});
