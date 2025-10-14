import { Address, toNano } from '@ton/core';
import { RiskCalculator } from '../../../hedging/services/RiskCalculator';
import { TonClient } from '@ton/ton';

// Mock TonClient and contracts
jest.mock('@ton/ton');

describe('RiskCalculator', () => {
    let calculator: RiskCalculator;
    let mockTonClient: jest.Mocked<TonClient>;
    let mockProvider: any;

    beforeEach(() => {
        // Setup mock TonClient
        mockTonClient = {
            provider: jest.fn(),
        } as any;

        mockProvider = {
            get: jest.fn(),
        };

        mockTonClient.provider.mockReturnValue(mockProvider);

        // Create valid test addresses using parseRaw
        const factoryAddress = Address.parseRaw('0:' + '0'.repeat(64));
        const coordinatorAddress = Address.parseRaw('0:' + '1'.repeat(64));

        calculator = new RiskCalculator({
            tonClient: mockTonClient as any,
            factoryAddress,
            coordinatorAddress,
        });
    });

    describe('calculateExposure', () => {
        it('should calculate exposure for single active policy', async () => {
            // Mock factory.getNextPolicyId() returns 2 (meaning policy 1 exists)
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: {
                            readBigNumber: () => 2n,
                        },
                    };
                }

                if (method === 'get_policy') {
                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n) // coverageType = DEPEG
                                .mockReturnValueOnce(toNano('10000')) // coverageAmount
                                .mockReturnValueOnce(30n) // durationDays
                                .mockReturnValueOnce(toNano('200')) // totalPremium
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000))) // createdAt
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30)) // expiryTime
                                .mockReturnValueOnce(1n), // isActive
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n) // polymarket status
                                .mockReturnValueOnce(toNano('800')) // polymarket amount
                                .mockReturnValueOnce(1n) // perp status
                                .mockReturnValueOnce(toNano('800')) // perp amount
                                .mockReturnValueOnce(1n) // allianz status
                                .mockReturnValueOnce(toNano('400')), // allianz amount
                        },
                    };
                }
            });

            const exposures = await calculator.calculateExposure();

            expect(exposures).toHaveLength(1);
            expect(exposures[0]).toMatchObject({
                coverageType: 'depeg',
                totalCoverage: toNano('10000'),
                requiredHedge: toNano('2000'), // 20% of 10000
                currentHedge: toNano('2000'), // 800 + 800 + 400
                hedgeDeficit: 0n,
            });
        });

        it('should aggregate multiple policies of same coverage type', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 4n }, // 3 policies exist
                    };
                }

                if (method === 'get_policy') {
                    const policyId = args[0].value;

                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n) // All DEPEG
                                .mockReturnValueOnce(toNano('5000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('100'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('400'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('400'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('200')),
                        },
                    };
                }
            });

            const exposures = await calculator.calculateExposure();

            expect(exposures).toHaveLength(1);
            expect(exposures[0]).toMatchObject({
                coverageType: 'depeg',
                totalCoverage: toNano('15000'), // 3 × 5000
                requiredHedge: toNano('3000'), // 20% of 15000
                currentHedge: toNano('3000'), // 3 × (400 + 400 + 200)
                hedgeDeficit: 0n,
            });
        });

        it('should separate different coverage types', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 4n },
                    };
                }

                if (method === 'get_policy') {
                    const policyId = args[0].value;

                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(policyId === 1n ? 1n : policyId === 2n ? 2n : 3n) // Different types
                                .mockReturnValueOnce(toNano('5000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('100'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('400'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('400'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('200')),
                        },
                    };
                }
            });

            const exposures = await calculator.calculateExposure();

            expect(exposures).toHaveLength(3);
            expect(exposures.map(e => e.coverageType).sort()).toEqual(['bridge', 'depeg', 'exploit']);
        });

        it('should skip expired policies', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 3n },
                    };
                }

                if (method === 'get_policy') {
                    const policyId = args[0].value;
                    const isExpired = policyId === 1n;
                    const expiryTime = isExpired
                        ? BigInt(Math.floor(Date.now() / 1000) - 86400 * 30) // Expired 30 days ago
                        : BigInt(Math.floor(Date.now() / 1000) + 86400 * 30); // Expires in 30 days

                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('5000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('100'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) - 86400 * 60))
                                .mockReturnValueOnce(expiryTime)
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('400'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('400'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('200')),
                        },
                    };
                }
            });

            const exposures = await calculator.calculateExposure();

            // Policy 1 is expired, policy 2 is active
            expect(exposures).toHaveLength(1);
            expect(exposures[0].totalCoverage).toBe(toNano('5000')); // Only policy 2
        });

        it('should skip inactive policies', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 2n },
                    };
                }

                if (method === 'get_policy') {
                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('5000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('100'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(0n), // isActive = false
                        },
                    };
                }
            });

            const exposures = await calculator.calculateExposure();

            expect(exposures).toHaveLength(0);
        });

        it('should handle policies without hedge positions', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 2n },
                    };
                }

                if (method === 'get_policy') {
                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('10000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('200'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    throw new Error('Policy not found'); // No hedge position yet
                }
            });

            const exposures = await calculator.calculateExposure();

            expect(exposures).toHaveLength(1);
            expect(exposures[0]).toMatchObject({
                coverageType: 'depeg',
                totalCoverage: toNano('10000'),
                requiredHedge: toNano('2000'),
                currentHedge: 0n, // No hedges registered
                hedgeDeficit: toNano('2000'),
            });
        });

        it('should return empty array when no policies exist', async () => {
            mockProvider.get.mockImplementation((method: string) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 1n }, // No policies
                    };
                }
            });

            const exposures = await calculator.calculateExposure();

            expect(exposures).toHaveLength(0);
        });
    });

    describe('needsRebalancing', () => {
        it('should return true when deficit exceeds 5% threshold', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 2n },
                    };
                }

                if (method === 'get_policy') {
                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('100000')) // Large coverage
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('2000'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    // Current hedge is 8% below required (20000 required, 18400 current)
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('7360')) // 40% of 18400
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('7360'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('3680')), // 20% of 18400
                        },
                    };
                }
            });

            const needsRebalancing = await calculator.needsRebalancing();

            expect(needsRebalancing).toBe(true);
        });

        it('should return false when deficit within 5% tolerance', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 2n },
                    };
                }

                if (method === 'get_policy') {
                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('100000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('2000'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    // Current hedge is 2.5% below required (within tolerance)
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('7800'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('7800'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('3900')),
                        },
                    };
                }
            });

            const needsRebalancing = await calculator.needsRebalancing();

            expect(needsRebalancing).toBe(false);
        });

        it('should return false when no exposure', async () => {
            mockProvider.get.mockImplementation((method: string) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 1n },
                    };
                }
            });

            const needsRebalancing = await calculator.needsRebalancing();

            expect(needsRebalancing).toBe(false);
        });
    });

    describe('calculateRebalanceOrders', () => {
        it('should distribute deficit across venues with 40/40/20 split', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 2n },
                    };
                }

                if (method === 'get_policy') {
                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('100000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('2000'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    // Deficit of 2000 (required 20000, current 18000)
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('7200'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('7200'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('3600')),
                        },
                    };
                }
            });

            const orders = await calculator.calculateRebalanceOrders();

            expect(orders).toHaveLength(3);

            const polymarketOrder = orders.find(o => o.venue === 'polymarket');
            expect(polymarketOrder).toMatchObject({
                coverageType: 'depeg',
                venue: 'polymarket',
                action: 'increase',
                amount: toNano('800'), // 40% of 2000
            });

            const perpetualsOrder = orders.find(o => o.venue === 'perpetuals');
            expect(perpetualsOrder).toMatchObject({
                coverageType: 'depeg',
                venue: 'perpetuals',
                action: 'increase',
                amount: toNano('800'), // 40% of 2000
            });

            const allianzOrder = orders.find(o => o.venue === 'allianz');
            expect(allianzOrder).toMatchObject({
                coverageType: 'depeg',
                venue: 'allianz',
                action: 'increase',
                amount: toNano('400'), // 20% of 2000
            });
        });

        it('should generate decrease orders when over-hedged', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 2n },
                    };
                }

                if (method === 'get_policy') {
                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('100000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('2000'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    // Surplus of 2000 (required 20000, current 22000)
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('8800'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('8800'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('4400')),
                        },
                    };
                }
            });

            const orders = await calculator.calculateRebalanceOrders();

            expect(orders).toHaveLength(3);
            expect(orders.every(o => o.action === 'decrease')).toBe(true);
        });

        it('should return empty array when no deficit', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 2n },
                    };
                }

                if (method === 'get_policy') {
                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('100000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('2000'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    // Perfect hedge (required 20000, current 20000)
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('8000'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('8000'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('4000')),
                        },
                    };
                }
            });

            const orders = await calculator.calculateRebalanceOrders();

            expect(orders).toHaveLength(0);
        });
    });

    describe('getExposureSummary', () => {
        it('should aggregate total exposure across all coverage types', async () => {
            mockProvider.get.mockImplementation((method: string, args: any[]) => {
                if (method === 'get_next_policy_id') {
                    return {
                        stack: { readBigNumber: () => 4n },
                    };
                }

                if (method === 'get_policy') {
                    const policyId = args[0].value;

                    return {
                        stack: {
                            readAddress: () => Address.parseRaw('0:' + '2'.repeat(64)),
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(policyId === 1n ? 1n : policyId === 2n ? 2n : 3n)
                                .mockReturnValueOnce(toNano('10000'))
                                .mockReturnValueOnce(30n)
                                .mockReturnValueOnce(toNano('200'))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000)))
                                .mockReturnValueOnce(BigInt(Math.floor(Date.now() / 1000) + 86400 * 30))
                                .mockReturnValueOnce(1n),
                        },
                    };
                }

                if (method === 'get_hedge_position') {
                    return {
                        stack: {
                            readBigNumber: jest.fn()
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('800'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('800'))
                                .mockReturnValueOnce(1n)
                                .mockReturnValueOnce(toNano('400')),
                        },
                    };
                }
            });

            const summary = await calculator.getExposureSummary();

            expect(summary.totalCoverage).toBe(toNano('30000')); // 3 policies × 10000
            expect(summary.totalRequiredHedge).toBe(toNano('6000')); // 20% of 30000
            expect(summary.totalCurrentHedge).toBe(toNano('6000')); // 3 × 2000
            expect(summary.totalDeficit).toBe(0n);
            expect(summary.exposuresByType).toHaveLength(3);
        });
    });
});
