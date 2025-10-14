import { HedgeOptimizer } from '../../../hedging/services/HedgeOptimizer';
import { NORMAL_MARKET, BULL_MARKET, BEAR_MARKET } from '../../fixtures/market-data';

describe('HedgeOptimizer', () => {
    let optimizer: HedgeOptimizer;

    beforeEach(() => {
        optimizer = new HedgeOptimizer();
    });

    describe('optimizeAllocation', () => {
        it('should allocate based on cost efficiency (cheapest first)', async () => {
            const marketData = {
                polymarket: { cost: 0.025, capacity: 50000, confidence: 0.9 },
                perpetuals: { cost: 0.018, capacity: 100000, confidence: 0.85 }, // Cheapest
                allianz: { cost: 0.040, capacity: 30000, confidence: 1.0 },
            };

            const allocation = optimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData,
            });

            // Should prioritize perpetuals (cheapest)
            expect(allocation.perpetuals).toBeGreaterThan(allocation.polymarket);
            expect(allocation.perpetuals).toBeGreaterThan(allocation.allianz);
            expect(allocation.polymarket).toBeGreaterThan(allocation.allianz);

            // Total should equal hedge needed
            const total = allocation.polymarket + allocation.perpetuals + allocation.allianz;
            expect(total).toBe(10000);
        });

        it('should respect max per venue constraint (50%)', async () => {
            const marketData = {
                polymarket: { cost: 0.025, capacity: 100000, confidence: 0.9 },
                perpetuals: { cost: 0.001, capacity: 100000, confidence: 0.85 }, // Super cheap
                allianz: { cost: 0.040, capacity: 100000, confidence: 1.0 },
            };

            const allocation = optimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData,
                constraints: {
                    maxPerVenue: 0.5, // Max 50%
                },
            });

            // Even though perpetuals is cheapest, should cap at 50%
            expect(allocation.perpetuals).toBeLessThanOrEqual(5000);
        });

        it('should respect capacity constraints', async () => {
            const marketData = {
                polymarket: { cost: 0.020, capacity: 2000, confidence: 0.9 }, // Low capacity
                perpetuals: { cost: 0.018, capacity: 100000, confidence: 0.85 },
                allianz: { cost: 0.040, capacity: 30000, confidence: 1.0 },
            };

            const allocation = optimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData,
            });

            // Should not exceed Polymarket capacity
            expect(allocation.polymarket).toBeLessThanOrEqual(2000);

            // Remaining should go to other venues
            expect(allocation.perpetuals + allocation.allianz).toBeGreaterThanOrEqual(8000);
        });

        it('should enforce minimum per venue when diversification required', async () => {
            const marketData = {
                polymarket: { cost: 0.025, capacity: 50000, confidence: 0.9 },
                perpetuals: { cost: 0.001, capacity: 100000, confidence: 0.85 }, // Super cheap
                allianz: { cost: 0.040, capacity: 30000, confidence: 1.0 },
            };

            const allocation = optimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData,
                constraints: {
                    minPerVenue: 0.15,
                    requireDiversification: true,
                },
            });

            // Each venue should have at least 15%
            expect(allocation.polymarket).toBeGreaterThanOrEqual(1500);
            expect(allocation.perpetuals).toBeGreaterThanOrEqual(1500);
            expect(allocation.allianz).toBeGreaterThanOrEqual(1500);
        });

        it('should calculate total cost correctly', async () => {
            const marketData = {
                polymarket: { cost: 0.025, capacity: 50000, confidence: 0.9 },
                perpetuals: { cost: 0.018, capacity: 100000, confidence: 0.85 },
                allianz: { cost: 0.040, capacity: 30000, confidence: 1.0 },
            };

            const allocation = optimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData,
            });

            const expectedCost =
                allocation.polymarket * 0.025 +
                allocation.perpetuals * 0.018 +
                allocation.allianz * 0.040;

            expect(allocation.totalCost).toBeCloseTo(expectedCost, 2);
        });

        it('should handle zero capacity gracefully', async () => {
            const marketData = {
                polymarket: { cost: 0.025, capacity: 0, confidence: 0.9 }, // No capacity
                perpetuals: { cost: 0.018, capacity: 100000, confidence: 0.85 },
                allianz: { cost: 0.040, capacity: 30000, confidence: 1.0 },
            };

            const allocation = optimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData,
            });

            expect(allocation.polymarket).toBe(0);
            expect(allocation.perpetuals + allocation.allianz).toBe(10000);
        });

        it('should work with realistic market scenarios', async () => {
            const allocation = optimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData: NORMAL_MARKET.data,
            });

            expect(allocation.polymarket).toBeGreaterThan(0);
            expect(allocation.perpetuals).toBeGreaterThan(0);
            expect(allocation.allianz).toBeGreaterThan(0);

            const total = allocation.polymarket + allocation.perpetuals + allocation.allianz;
            expect(total).toBe(10000);
        });

        it('should generate higher score for better allocations', async () => {
            const cheapMarket = {
                polymarket: { cost: 0.010, capacity: 100000, confidence: 0.95 },
                perpetuals: { cost: 0.005, capacity: 100000, confidence: 0.95 },
                allianz: { cost: 0.020, capacity: 100000, confidence: 1.0 },
            };

            const expensiveMarket = {
                polymarket: { cost: 0.050, capacity: 100000, confidence: 0.7 },
                perpetuals: { cost: 0.040, capacity: 100000, confidence: 0.7 },
                allianz: { cost: 0.060, capacity: 100000, confidence: 1.0 },
            };

            const cheapAllocation = optimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData: cheapMarket,
            });

            const expensiveAllocation = optimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData: expensiveMarket,
            });

            expect(cheapAllocation.score).toBeGreaterThan(expensiveAllocation.score);
        });
    });

    describe('calculateHedgeROI', () => {
        it('should calculate ROI for Polymarket hedge', async () => {
            const roi = optimizer.calculateHedgeROI({
                venue: 'polymarket',
                coverageType: 'depeg',
                amount: 10000,
                duration: 30,
                marketData: { cost: 0.025, capacity: 100000, confidence: 0.9 },
            });

            expect(roi).toMatchObject({
                venue: 'polymarket',
                coverageType: 'depeg',
                expectedPayout: 10000,
                totalCost: 250, // 10000 * 0.025
                netROI: 9750,
                probability: 0.025,
                expectedValue: 243.75, // 9750 * 0.025
            });
        });

        it('should calculate ROI for Perpetuals hedge', async () => {
            const roi = optimizer.calculateHedgeROI({
                venue: 'perpetuals',
                coverageType: 'depeg',
                amount: 10000,
                duration: 30,
                marketData: { cost: 0.005, capacity: 100000, confidence: 0.85 },
            });

            expect(roi).toMatchObject({
                venue: 'perpetuals',
                coverageType: 'depeg',
                expectedPayout: 10000,
                totalCost: 1500, // 10000 * 0.005 * 30
                netROI: 8500,
            });
        });

        it('should handle negative funding rate (we earn)', async () => {
            const roi = optimizer.calculateHedgeROI({
                venue: 'perpetuals',
                coverageType: 'depeg',
                amount: 10000,
                duration: 30,
                marketData: { cost: -0.005, capacity: 100000, confidence: 0.85 }, // Negative
            });

            // Should use absolute value
            expect(roi.totalCost).toBe(1500); // Same as positive
        });

        it('should calculate ROI for Allianz hedge', async () => {
            const roi = optimizer.calculateHedgeROI({
                venue: 'allianz',
                coverageType: 'depeg',
                amount: 10000,
                duration: 30,
                marketData: { cost: 0.0045, capacity: 100000, confidence: 1.0 },
            });

            expect(roi).toMatchObject({
                venue: 'allianz',
                coverageType: 'depeg',
                expectedPayout: 10000,
                totalCost: 45, // 10000 * 0.0045
                netROI: 9955,
            });
        });

        it('should use default probability for non-Polymarket venues', async () => {
            const perpetualsROI = optimizer.calculateHedgeROI({
                venue: 'perpetuals',
                coverageType: 'depeg',
                amount: 10000,
                duration: 30,
            });

            const allianzROI = optimizer.calculateHedgeROI({
                venue: 'allianz',
                coverageType: 'depeg',
                amount: 10000,
                duration: 30,
            });

            // Should use default 2.5% for depeg
            expect(perpetualsROI.probability).toBe(0.025);
            expect(allianzROI.probability).toBe(0.025);
        });

        it('should use different default probabilities for different coverage types', async () => {
            const depegROI = optimizer.calculateHedgeROI({
                venue: 'allianz',
                coverageType: 'depeg',
                amount: 10000,
                duration: 30,
            });

            const exploitROI = optimizer.calculateHedgeROI({
                venue: 'allianz',
                coverageType: 'exploit',
                amount: 10000,
                duration: 30,
            });

            const bridgeROI = optimizer.calculateHedgeROI({
                venue: 'allianz',
                coverageType: 'bridge',
                amount: 10000,
                duration: 30,
            });

            expect(depegROI.probability).toBe(0.025);  // 2.5%
            expect(exploitROI.probability).toBe(0.030); // 3%
            expect(bridgeROI.probability).toBe(0.015);  // 1.5%
        });
    });

    describe('compareStrategies', () => {
        it('should compare multiple allocation strategies', async () => {
            const strategies = [
                {
                    maxPerVenue: 0.5,
                    minPerVenue: 0.1,
                    requireDiversification: true,
                },
                {
                    maxPerVenue: 0.7,
                    minPerVenue: 0.05,
                    requireDiversification: true,
                },
                {
                    maxPerVenue: 0.9,
                    minPerVenue: 0.0,
                    requireDiversification: false,
                },
            ];

            const results = optimizer.compareStrategies({
                totalHedgeNeeded: 10000,
                marketData: NORMAL_MARKET.data,
                strategies,
            });

            expect(results).toHaveLength(3);

            // Results should be sorted by score (descending)
            for (let i = 0; i < results.length - 1; i++) {
                expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
            }

            // All should total to 10000
            results.forEach(result => {
                const total = result.polymarket + result.perpetuals + result.allianz;
                expect(total).toBe(10000);
            });
        });

        it('should rank bull market strategy highest in bull market', async () => {
            const strategies = [
                { maxPerVenue: 0.5 },  // Diversified
                { maxPerVenue: 0.9 },  // Concentrated (good for bull)
            ];

            const results = optimizer.compareStrategies({
                totalHedgeNeeded: 10000,
                marketData: BULL_MARKET.data,
                strategies,
            });

            // In bull market, concentrated strategy (lower costs) should win
            expect(results[0].totalCost).toBeLessThanOrEqual(results[1].totalCost);
        });
    });

    describe('calculateRebalance', () => {
        it('should identify increase actions when under-allocated', async () => {
            const currentAllocation = {
                polymarket: 3000,
                perpetuals: 3000,
                allianz: 1500,
                totalCost: 0,
                score: 0,
            };

            const targetAllocation = {
                polymarket: 4000,
                perpetuals: 4000,
                allianz: 2000,
                totalCost: 0,
                score: 0,
            };

            const rebalance = optimizer.calculateRebalance({
                currentAllocation,
                targetAllocation,
            });

            expect(rebalance.polymarket.action).toBe('increase');
            expect(rebalance.polymarket.amount).toBe(1000);

            expect(rebalance.perpetuals.action).toBe('increase');
            expect(rebalance.perpetuals.amount).toBe(1000);

            expect(rebalance.allianz.action).toBe('increase');
            expect(rebalance.allianz.amount).toBe(500);
        });

        it('should identify decrease actions when over-allocated', async () => {
            const currentAllocation = {
                polymarket: 5000,
                perpetuals: 5000,
                allianz: 2500,
                totalCost: 0,
                score: 0,
            };

            const targetAllocation = {
                polymarket: 4000,
                perpetuals: 4000,
                allianz: 2000,
                totalCost: 0,
                score: 0,
            };

            const rebalance = optimizer.calculateRebalance({
                currentAllocation,
                targetAllocation,
            });

            expect(rebalance.polymarket.action).toBe('decrease');
            expect(rebalance.polymarket.amount).toBe(1000);

            expect(rebalance.perpetuals.action).toBe('decrease');
            expect(rebalance.perpetuals.amount).toBe(1000);

            expect(rebalance.allianz.action).toBe('decrease');
            expect(rebalance.allianz.amount).toBe(500);
        });

        it('should identify hold actions when allocation within 1% threshold', async () => {
            const currentAllocation = {
                polymarket: 4000,
                perpetuals: 4020, // 0.5% diff
                allianz: 2000,
                totalCost: 0,
                score: 0,
            };

            const targetAllocation = {
                polymarket: 4000,
                perpetuals: 4000,
                allianz: 2000,
                totalCost: 0,
                score: 0,
            };

            const rebalance = optimizer.calculateRebalance({
                currentAllocation,
                targetAllocation,
            });

            expect(rebalance.polymarket.action).toBe('hold');
            expect(rebalance.perpetuals.action).toBe('hold'); // Within 1%
            expect(rebalance.allianz.action).toBe('hold');
        });

        it('should handle mixed actions (some increase, some decrease)', async () => {
            const currentAllocation = {
                polymarket: 5000,
                perpetuals: 3000,
                allianz: 2000,
                totalCost: 0,
                score: 0,
            };

            const targetAllocation = {
                polymarket: 4000,
                perpetuals: 4000,
                allianz: 2000,
                totalCost: 0,
                score: 0,
            };

            const rebalance = optimizer.calculateRebalance({
                currentAllocation,
                targetAllocation,
            });

            expect(rebalance.polymarket.action).toBe('decrease');
            expect(rebalance.perpetuals.action).toBe('increase');
            expect(rebalance.allianz.action).toBe('hold');
        });
    });
});
