import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano, Address } from '@ton/core';
import { HedgeCoordinator, VenueType, HedgeStatus } from '../../../wrappers/HedgeCoordinator';
import { RiskCalculator } from '../../../hedging/services/RiskCalculator';
import { HedgeOptimizer } from '../../../hedging/services/HedgeOptimizer';
import { PolymarketConnector } from '../../../hedging/services/PolymarketConnector';
import { TonClient } from '@ton/ton';
import nock from 'nock';
import '@ton/test-utils';

describe('Rebalancing Flow Integration', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let keeper1: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<TreasuryContract>;

    let hedgeCoordinator: SandboxContract<HedgeCoordinator>;
    let riskCalculator: RiskCalculator;
    let hedgeOptimizer: HedgeOptimizer;
    let polymarketConnector: PolymarketConnector;

    const API_URL = 'https://clob.polymarket.com';

    // Mock TonClient
    const mockTonClient = {
        provider: jest.fn(),
    } as unknown as TonClient;

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        keeper1 = await blockchain.treasury('keeper1');
        factory = await blockchain.treasury('factory');

        // Deploy HedgeCoordinator
        hedgeCoordinator = blockchain.openContract(
            await HedgeCoordinator.fromInit(deployer.address, factory.address)
        );
        await hedgeCoordinator.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Deploy', queryId: 0n }
        );

        await hedgeCoordinator.sendAddKeeper(deployer.getSender(), {
            value: toNano('0.05'),
            keeper: keeper1.address,
        });

        // Initialize services
        riskCalculator = new RiskCalculator({
            tonClient: mockTonClient,
            factoryAddress: factory.address,
        });

        hedgeOptimizer = new HedgeOptimizer();

        polymarketConnector = new PolymarketConnector({
            apiUrl: API_URL,
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
        });

        // Reset nock
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    describe('Full Rebalancing Flow', () => {
        it('should complete full flow: calculate exposure → detect deficit → rebalance', async () => {
            // Step 1: Set up mock policies (simulate multiple active policies)
            const mockProvider = {
                get: jest.fn(),
            };

            (mockTonClient.provider as jest.Mock).mockReturnValue(mockProvider);

            // Mock factory returning 3 active policies
            mockProvider.get.mockImplementation((method, args) => {
                if (method === 'get_next_policy_id') {
                    return { stack: { readBigNumber: () => 4n } };
                }

                if (method === 'get_policy') {
                    const policyId = args[0];

                    if (policyId === 1n) {
                        return {
                            stack: {
                                readAddress: () => Address.parse('EQC' + '1'.repeat(64)),
                                readBigNumber: jest.fn()
                                    .mockReturnValueOnce(1n) // DEPEG
                                    .mockReturnValueOnce(toNano('10000'))
                                    .mockReturnValueOnce(toNano('175'))
                                    .mockReturnValueOnce(Math.floor(Date.now() / 1000))
                                    .mockReturnValueOnce(30)
                                    .mockReturnValueOnce(Math.floor(Date.now() / 1000) + 30 * 86400)
                                    .mockReturnValueOnce(1n), // ACTIVE
                            },
                        };
                    }

                    if (policyId === 2n) {
                        return {
                            stack: {
                                readAddress: () => Address.parse('EQC' + '2'.repeat(64)),
                                readBigNumber: jest.fn()
                                    .mockReturnValueOnce(1n) // DEPEG
                                    .mockReturnValueOnce(toNano('15000'))
                                    .mockReturnValueOnce(toNano('262'))
                                    .mockReturnValueOnce(Math.floor(Date.now() / 1000))
                                    .mockReturnValueOnce(30)
                                    .mockReturnValueOnce(Math.floor(Date.now() / 1000) + 30 * 86400)
                                    .mockReturnValueOnce(1n), // ACTIVE
                            },
                        };
                    }

                    if (policyId === 3n) {
                        return {
                            stack: {
                                readAddress: () => Address.parse('EQC' + '3'.repeat(64)),
                                readBigNumber: jest.fn()
                                    .mockReturnValueOnce(2n) // EXPLOIT
                                    .mockReturnValueOnce(toNano('20000'))
                                    .mockReturnValueOnce(toNano('350'))
                                    .mockReturnValueOnce(Math.floor(Date.now() / 1000))
                                    .mockReturnValueOnce(30)
                                    .mockReturnValueOnce(Math.floor(Date.now() / 1000) + 30 * 86400)
                                    .mockReturnValueOnce(1n), // ACTIVE
                            },
                        };
                    }

                    throw new Error('Policy not found');
                }

                throw new Error('Unknown method');
            });

            // Step 2: Calculate exposure
            const exposures = await riskCalculator.calculateExposure();

            expect(exposures).toHaveLength(2); // DEPEG and EXPLOIT

            const depegExposure = exposures.find((e) => e.coverageType === 'depeg');
            const exploitExposure = exposures.find((e) => e.coverageType === 'exploit');

            expect(depegExposure).toBeDefined();
            expect(depegExposure!.totalCoverage).toBe(toNano('25000')); // 10000 + 15000
            expect(depegExposure!.requiredHedge).toBe(toNano('5000')); // 20% of 25000

            expect(exploitExposure).toBeDefined();
            expect(exploitExposure!.totalCoverage).toBe(toNano('20000'));
            expect(exploitExposure!.requiredHedge).toBe(toNano('4000')); // 20% of 20000

            // Step 3: Mock current hedge positions (under-hedged)
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId: 1n,
                venueId: VenueType.POLYMARKET,
                amount: toNano('1500'), // Only 1500 vs needed 2000 (40% of 5000)
                externalId: 'pm-order-1',
                status: HedgeStatus.ACTIVE,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId: 1n,
                venueId: VenueType.PERPETUALS,
                amount: toNano('1500'), // Only 1500 vs needed 2000
                externalId: 'perp-position-1',
                status: HedgeStatus.ACTIVE,
            });

            // Step 4: Detect rebalancing need
            const needsRebalancing = await riskCalculator.needsRebalancing();
            expect(needsRebalancing).toBe(true);

            // Step 5: Calculate rebalance orders
            const rebalanceOrders = await riskCalculator.calculateRebalanceOrders();

            expect(rebalanceOrders.length).toBeGreaterThan(0);

            // Should include orders to increase hedges
            const increaseOrders = rebalanceOrders.filter((order) => order.action === 'increase');
            expect(increaseOrders.length).toBeGreaterThan(0);

            // Step 6: Optimize allocation for new hedges
            const marketData = {
                polymarket: { cost: 0.025, capacity: 100000, confidence: 0.9 },
                perpetuals: { cost: 0.018, capacity: 100000, confidence: 0.85 },
                allianz: { cost: 0.040, capacity: 50000, confidence: 1.0 },
            };

            const allocation = hedgeOptimizer.optimizeAllocation({
                totalHedgeNeeded: 2000, // Deficit to fill
                marketData,
            });

            expect(allocation.polymarket).toBeGreaterThan(0);
            expect(allocation.perpetuals).toBeGreaterThan(0);
            expect(allocation.allianz).toBeGreaterThan(0);

            // Total should equal deficit
            const total = allocation.polymarket + allocation.perpetuals + allocation.allianz;
            expect(total).toBe(2000);

            // Step 7: Execute rebalance orders
            nock(API_URL)
                .post('/order')
                .reply(200, {
                    orderId: 'pm-rebalance-order-1',
                    status: 'FILLED',
                    fillPrice: 0.025,
                    size: allocation.polymarket,
                });

            const polymarketOrder = await polymarketConnector.placeOrder({
                coverageType: 'depeg',
                amount: allocation.polymarket,
            });

            expect(polymarketOrder.status).toBe('FILLED');

            // Step 8: Register new hedge positions
            const registerResult = await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId: 1n,
                venueId: VenueType.POLYMARKET,
                amount: toNano(String(allocation.polymarket)),
                externalId: polymarketOrder.externalId,
                status: HedgeStatus.ACTIVE,
            });

            expect(registerResult.transactions).toHaveTransaction({
                from: keeper1.address,
                to: hedgeCoordinator.address,
                success: true,
            });
        });

        it('should handle decrease orders when over-hedged', async () => {
            const marketData = {
                polymarket: { cost: 0.025, capacity: 100000, confidence: 0.9 },
                perpetuals: { cost: 0.018, capacity: 100000, confidence: 0.85 },
                allianz: { cost: 0.040, capacity: 50000, confidence: 1.0 },
            };

            // Current allocation: over-hedged
            const currentAllocation = {
                polymarket: 5000,
                perpetuals: 5000,
                allianz: 2500,
                totalCost: 0,
                score: 0,
            };

            // Target allocation: reduce exposure
            const targetAllocation = {
                polymarket: 4000,
                perpetuals: 4000,
                allianz: 2000,
                totalCost: 0,
                score: 0,
            };

            const rebalance = hedgeOptimizer.calculateRebalance({
                currentAllocation,
                targetAllocation,
            });

            expect(rebalance.polymarket.action).toBe('decrease');
            expect(rebalance.polymarket.amount).toBe(1000);

            // Execute decrease order (liquidate excess)
            nock(API_URL)
                .post('/order', (body) => body.side === 'NO')
                .reply(200, {
                    proceeds: 980,
                    fillPrice: 0.98,
                    size: 1000,
                });

            const liquidationResult = await polymarketConnector.liquidatePosition({
                externalId: 'pm-order-excess',
                amount: 1000,
            });

            expect(liquidationResult.proceeds).toBe(980);
        });

        it('should maintain hold when allocation within 1% threshold', async () => {
            const currentAllocation = {
                polymarket: 4000,
                perpetuals: 4020, // 0.5% difference
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

            const rebalance = hedgeOptimizer.calculateRebalance({
                currentAllocation,
                targetAllocation,
            });

            expect(rebalance.polymarket.action).toBe('hold');
            expect(rebalance.perpetuals.action).toBe('hold');
            expect(rebalance.allianz.action).toBe('hold');
        });

        it('should execute multi-venue rebalance orders in parallel', async () => {
            const marketData = {
                polymarket: { cost: 0.025, capacity: 100000, confidence: 0.9 },
                perpetuals: { cost: 0.018, capacity: 100000, confidence: 0.85 },
                allianz: { cost: 0.040, capacity: 50000, confidence: 1.0 },
            };

            const allocation = hedgeOptimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData,
            });

            // Mock API responses for all three venues
            nock(API_URL)
                .post('/order', (body) => body.market === 'usdt-depeg-q1-2025')
                .reply(200, {
                    orderId: 'pm-rebalance-1',
                    status: 'FILLED',
                    fillPrice: 0.025,
                    size: allocation.polymarket,
                });

            // Execute orders in parallel
            const polymarketPromise = polymarketConnector.placeOrder({
                coverageType: 'depeg',
                amount: allocation.polymarket,
            });

            // Simulate perp and allianz orders (would use their respective connectors)
            const perpPromise = Promise.resolve({
                externalId: 'perp-rebalance-1',
                status: 'FILLED' as const,
                fillPrice: 0.018,
                size: allocation.perpetuals,
                cost: allocation.perpetuals * 0.018,
                venue: 'perpetuals' as const,
            });

            const allianzPromise = Promise.resolve({
                externalId: 'allianz-rebalance-1',
                status: 'FILLED' as const,
                fillPrice: 0.040,
                size: allocation.allianz,
                cost: allocation.allianz * 0.040,
                venue: 'allianz' as const,
            });

            const [polymarketResult, perpResult, allianzResult] = await Promise.all([
                polymarketPromise,
                perpPromise,
                allianzPromise,
            ]);

            expect(polymarketResult.status).toBe('FILLED');
            expect(perpResult.status).toBe('FILLED');
            expect(allianzResult.status).toBe('FILLED');
        });

        it('should handle mixed actions (some increase, some decrease)', async () => {
            const currentAllocation = {
                polymarket: 5000, // Over-allocated
                perpetuals: 3000, // Under-allocated
                allianz: 2000,    // On target
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

            const rebalance = hedgeOptimizer.calculateRebalance({
                currentAllocation,
                targetAllocation,
            });

            expect(rebalance.polymarket.action).toBe('decrease');
            expect(rebalance.polymarket.amount).toBe(1000);

            expect(rebalance.perpetuals.action).toBe('increase');
            expect(rebalance.perpetuals.amount).toBe(1000);

            expect(rebalance.allianz.action).toBe('hold');

            // Execute decrease order
            nock(API_URL)
                .post('/order', (body) => body.side === 'NO')
                .reply(200, {
                    proceeds: 4950,
                    fillPrice: 0.99,
                    size: 5000,
                });

            const decreaseResult = await polymarketConnector.liquidatePosition({
                externalId: 'pm-order-excess',
                amount: 1000,
            });

            expect(decreaseResult.proceeds).toBeGreaterThan(0);

            // Execute increase order
            nock(API_URL)
                .post('/order', (body) => body.side === 'YES')
                .reply(200, {
                    orderId: 'pm-order-increase',
                    status: 'FILLED',
                    fillPrice: 0.025,
                    size: 1000,
                });

            const increaseResult = await polymarketConnector.placeOrder({
                coverageType: 'depeg',
                amount: 1000,
            });

            expect(increaseResult.status).toBe('FILLED');
        });

        it('should respect capacity constraints during rebalancing', async () => {
            const marketData = {
                polymarket: { cost: 0.020, capacity: 2000, confidence: 0.9 }, // Low capacity
                perpetuals: { cost: 0.018, capacity: 100000, confidence: 0.85 },
                allianz: { cost: 0.040, capacity: 30000, confidence: 1.0 },
            };

            const allocation = hedgeOptimizer.optimizeAllocation({
                totalHedgeNeeded: 10000,
                marketData,
            });

            // Should not exceed Polymarket capacity
            expect(allocation.polymarket).toBeLessThanOrEqual(2000);

            // Remaining should go to other venues
            expect(allocation.perpetuals + allocation.allianz).toBeGreaterThanOrEqual(8000);
        });

        it('should calculate rebalance deficit correctly with 5% threshold', async () => {
            const mockProvider = {
                get: jest.fn(),
            };

            (mockTonClient.provider as jest.Mock).mockReturnValue(mockProvider);

            mockProvider.get.mockImplementation((method, args) => {
                if (method === 'get_next_policy_id') {
                    return { stack: { readBigNumber: () => 2n } };
                }

                if (method === 'get_policy') {
                    return {
                        stack: {
                            readAddress: () => Address.parse('EQC' + '1'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('10000'))
                                .mockReturnValueOnce(toNano('175'))
                                .mockReturnValueOnce(Math.floor(Date.now() / 1000))
                                .mockReturnValueOnce(30)
                                .mockReturnValueOnce(Math.floor(Date.now() / 1000) + 30 * 86400)
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                throw new Error('Unknown method');
            });

            // Required hedge: 20% of 10000 = 2000
            // Current hedge: 1900 (95% of required)
            // Deficit: 100 (5% of required) - should NOT trigger rebalancing

            // Mock current hedges at 95% of target
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId: 1n,
                venueId: VenueType.POLYMARKET,
                amount: toNano('760'), // 40% of 1900
                externalId: 'pm-1',
                status: HedgeStatus.ACTIVE,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId: 1n,
                venueId: VenueType.PERPETUALS,
                amount: toNano('760'), // 40% of 1900
                externalId: 'perp-1',
                status: HedgeStatus.ACTIVE,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId: 1n,
                venueId: VenueType.ALLIANZ,
                amount: toNano('380'), // 20% of 1900
                externalId: 'allianz-1',
                status: HedgeStatus.ACTIVE,
            });

            const needsRebalancing = await riskCalculator.needsRebalancing();

            // Should NOT trigger rebalancing (within 5% threshold)
            expect(needsRebalancing).toBe(false);
        });
    });
});
