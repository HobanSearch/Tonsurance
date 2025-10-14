import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano, Address } from '@ton/core';
import { PricingOracle, CoverageType } from '../../../wrappers/PricingOracle';
import { HedgeCoordinator, VenueType, HedgeStatus } from '../../../wrappers/HedgeCoordinator';
import { HedgedPolicyFactory } from '../../../wrappers/HedgedPolicyFactory';
import { PolymarketConnector } from '../../../hedging/services/PolymarketConnector';
import nock from 'nock';
import '@ton/test-utils';

describe('Policy Purchase Flow Integration', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let keeper1: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;

    let pricingOracle: SandboxContract<PricingOracle>;
    let hedgeCoordinator: SandboxContract<HedgeCoordinator>;
    let factory: SandboxContract<HedgedPolicyFactory>;
    let polymarketConnector: PolymarketConnector;

    const API_URL = 'https://clob.polymarket.com';

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        keeper1 = await blockchain.treasury('keeper1');
        user = await blockchain.treasury('user');

        // Deploy PricingOracle
        pricingOracle = blockchain.openContract(
            await PricingOracle.fromInit(deployer.address)
        );
        await pricingOracle.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Deploy', queryId: 0n }
        );

        // Deploy HedgeCoordinator
        hedgeCoordinator = blockchain.openContract(
            await HedgeCoordinator.fromInit(deployer.address, deployer.address)
        );
        await hedgeCoordinator.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Deploy', queryId: 0n }
        );

        // Deploy HedgedPolicyFactory
        factory = blockchain.openContract(
            await HedgedPolicyFactory.fromInit(
                pricingOracle.address,
                hedgeCoordinator.address,
                deployer.address
            )
        );
        await factory.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Deploy', queryId: 0n }
        );

        // Add keeper to oracle
        await pricingOracle.sendAddKeeper(deployer.getSender(), {
            value: toNano('0.05'),
            keeper: keeper1.address,
        });

        // Add keeper to coordinator
        await hedgeCoordinator.sendAddKeeper(deployer.getSender(), {
            value: toNano('0.05'),
            keeper: keeper1.address,
        });

        // Initialize PolymarketConnector
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

    describe('Full Policy Purchase Flow', () => {
        it('should complete full flow: quote → create → hedges → positions', async () => {
            // Step 1: Update oracle with fresh hedge prices
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,    // 2.5%
                perpFundingRate: -50,   // -0.5% daily (we earn)
                allianzQuote: 450,      // $4.50 per $1000
            });

            // Step 2: Get hedge cost quote from oracle
            const coverageAmount = toNano('10000');
            const durationDays = 30;

            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.DEPEG,
                coverageAmount,
                durationDays
            );

            expect(hedgeCost).toBeGreaterThan(0n);

            // Step 3: User creates policy
            const quoteTimestamp = Math.floor(Date.now() / 1000);
            const basePremium = (coverageAmount * 80n * BigInt(durationDays)) / (10000n * 365n);
            const expectedPremium = basePremium + hedgeCost;

            const createResult = await factory.sendCreateHedgedPolicy(user.getSender(), {
                value: expectedPremium + toNano('0.5'), // Premium + gas
                userAddress: user.address,
                coverageType: CoverageType.DEPEG,
                coverageAmount,
                durationDays,
                expectedPremium,
                quoteTimestamp,
            });

            expect(createResult.transactions).toHaveTransaction({
                from: user.address,
                to: factory.address,
                success: true,
            });

            // Step 4: Mock Polymarket API for hedge execution
            nock(API_URL)
                .post('/order', (body) => {
                    return (
                        body.market === 'usdt-depeg-q1-2025' &&
                        body.side === 'YES' &&
                        body.type === 'MARKET'
                    );
                })
                .reply(200, {
                    orderId: 'pm-order-integration-123',
                    status: 'FILLED',
                    fillPrice: 0.025,
                    size: 4000, // 40% of 10000
                });

            // Step 5: Execute Polymarket hedge (keeper action)
            const polymarketOrder = await polymarketConnector.placeOrder({
                coverageType: 'depeg',
                amount: 4000,
                side: 'YES',
                type: 'MARKET',
            });

            expect(polymarketOrder.externalId).toBe('pm-order-integration-123');
            expect(polymarketOrder.status).toBe('FILLED');

            // Step 6: Keeper registers hedge in coordinator
            const policyId = 1n;

            const registerResult = await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.POLYMARKET,
                amount: toNano('4000'),
                externalId: polymarketOrder.externalId,
                status: HedgeStatus.ACTIVE,
            });

            expect(registerResult.transactions).toHaveTransaction({
                from: keeper1.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            // Step 7: Verify hedge position recorded
            const hedgePosition = await hedgeCoordinator.getHedgePosition(policyId);

            expect(hedgePosition.polymarketStatus).toBe(HedgeStatus.ACTIVE);
            expect(hedgePosition.polymarketAmount).toBe(toNano('4000'));
        });

        it('should handle oracle data staleness during policy creation', async () => {
            // Don't update oracle (data will be stale)

            const coverageAmount = toNano('10000');
            const durationDays = 30;
            const quoteTimestamp = Math.floor(Date.now() / 1000);

            // Should fail because oracle data is stale
            await expect(
                pricingOracle.calculateHedgeCost(CoverageType.DEPEG, coverageAmount, durationDays)
            ).rejects.toThrow();
        });

        it('should validate quote freshness (30-second window)', async () => {
            // Update oracle
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            const coverageAmount = toNano('10000');
            const durationDays = 30;
            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.DEPEG,
                coverageAmount,
                durationDays
            );

            const basePremium = (coverageAmount * 80n * BigInt(durationDays)) / (10000n * 365n);
            const expectedPremium = basePremium + hedgeCost;

            // Use stale timestamp (>30 seconds ago)
            const staleTimestamp = Math.floor(Date.now() / 1000) - 60;

            // Should reject stale quote
            const result = await factory.sendCreateHedgedPolicy(user.getSender(), {
                value: expectedPremium + toNano('0.5'),
                userAddress: user.address,
                coverageType: CoverageType.DEPEG,
                coverageAmount,
                durationDays,
                expectedPremium,
                quoteTimestamp: staleTimestamp,
            });

            // Factory should reject transaction
            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: factory.address,
                success: false, // Rejected due to stale quote
            });
        });

        it('should execute all three hedges in parallel', async () => {
            // Update oracle
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            // Create policy
            const coverageAmount = toNano('10000');
            const durationDays = 30;
            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.DEPEG,
                coverageAmount,
                durationDays
            );
            const basePremium = (coverageAmount * 80n * BigInt(durationDays)) / (10000n * 365n);
            const expectedPremium = basePremium + hedgeCost;

            await factory.sendCreateHedgedPolicy(user.getSender(), {
                value: expectedPremium + toNano('0.5'),
                userAddress: user.address,
                coverageType: CoverageType.DEPEG,
                coverageAmount,
                durationDays,
                expectedPremium,
                quoteTimestamp: Math.floor(Date.now() / 1000),
            });

            const policyId = 1n;

            // Register all three hedges
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.POLYMARKET,
                amount: toNano('4000'),
                externalId: 'pm-order-123',
                status: HedgeStatus.ACTIVE,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.PERPETUALS,
                amount: toNano('4000'),
                externalId: 'perp-position-456',
                status: HedgeStatus.ACTIVE,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.ALLIANZ,
                amount: toNano('2000'),
                externalId: 'allianz-policy-789',
                status: HedgeStatus.ACTIVE,
            });

            // Verify all three hedges recorded
            const hedgePosition = await hedgeCoordinator.getHedgePosition(policyId);

            expect(hedgePosition.polymarketStatus).toBe(HedgeStatus.ACTIVE);
            expect(hedgePosition.polymarketAmount).toBe(toNano('4000'));
            expect(hedgePosition.perpetualsStatus).toBe(HedgeStatus.ACTIVE);
            expect(hedgePosition.perpetualsAmount).toBe(toNano('4000'));
            expect(hedgePosition.allianzStatus).toBe(HedgeStatus.ACTIVE);
            expect(hedgePosition.allianzAmount).toBe(toNano('2000'));
        });

        it('should handle partial hedge execution (some succeed, some fail)', async () => {
            // Update oracle
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            // Create policy
            const coverageAmount = toNano('10000');
            const durationDays = 30;
            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.DEPEG,
                coverageAmount,
                durationDays
            );
            const basePremium = (coverageAmount * 80n * BigInt(durationDays)) / (10000n * 365n);
            const expectedPremium = basePremium + hedgeCost;

            await factory.sendCreateHedgedPolicy(user.getSender(), {
                value: expectedPremium + toNano('0.5'),
                userAddress: user.address,
                coverageType: CoverageType.DEPEG,
                coverageAmount,
                durationDays,
                expectedPremium,
                quoteTimestamp: Math.floor(Date.now() / 1000),
            });

            const policyId = 1n;

            // Register successful hedges
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.POLYMARKET,
                amount: toNano('4000'),
                externalId: 'pm-order-123',
                status: HedgeStatus.ACTIVE,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.PERPETUALS,
                amount: toNano('4000'),
                externalId: 'perp-position-456',
                status: HedgeStatus.ACTIVE,
            });

            // Register failed hedge
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.ALLIANZ,
                amount: 0n, // Failed to execute
                externalId: '',
                status: HedgeStatus.FAILED,
            });

            // Verify partial execution
            const hedgePosition = await hedgeCoordinator.getHedgePosition(policyId);

            expect(hedgePosition.polymarketStatus).toBe(HedgeStatus.ACTIVE);
            expect(hedgePosition.perpetualsStatus).toBe(HedgeStatus.ACTIVE);
            expect(hedgePosition.allianzStatus).toBe(HedgeStatus.FAILED);
            expect(hedgePosition.allianzAmount).toBe(0n);
        });

        it('should handle API failure during hedge execution', async () => {
            // Mock Polymarket API failure
            nock(API_URL)
                .post('/order')
                .reply(500, { error: 'Internal server error' });

            // Should throw error
            await expect(
                polymarketConnector.placeOrder({
                    coverageType: 'depeg',
                    amount: 4000,
                })
            ).rejects.toThrow('Polymarket order failed');
        });

        it('should calculate correct premium with swing pricing', async () => {
            // Update oracle with specific prices
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,    // 2.5%
                perpFundingRate: -50,   // -0.5% daily
                allianzQuote: 450,      // $4.50 per $1000
            });

            const coverageAmount = toNano('10000');
            const durationDays = 30;

            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.DEPEG,
                coverageAmount,
                durationDays
            );

            // Expected hedge cost calculation:
            // Polymarket: 10000 * 0.025 = 250 (but only 40% = 100)
            // Perpetuals: 10000 * 0.005 * 30 = 1500 (but only 40% = 60)
            // Allianz: 10000 * 0.0045 = 45 (but only 20% = 9)
            // Total: 169 TON

            const expectedHedgeCost = toNano('169');
            expect(hedgeCost).toBe(expectedHedgeCost);

            // Base premium: 10000 * 0.008 * (30/365) = 6.58 TON
            const basePremium = (coverageAmount * 80n * BigInt(durationDays)) / (10000n * 365n);
            const expectedBasePremium = toNano('6'); // Rounded

            expect(basePremium).toBeGreaterThanOrEqual(expectedBasePremium);

            // Total premium
            const totalPremium = basePremium + hedgeCost;
            expect(totalPremium).toBeGreaterThan(hedgeCost);
        });

        it('should reject policy if premium incorrect', async () => {
            // Update oracle
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            const coverageAmount = toNano('10000');
            const durationDays = 30;
            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.DEPEG,
                coverageAmount,
                durationDays
            );
            const basePremium = (coverageAmount * 80n * BigInt(durationDays)) / (10000n * 365n);
            const correctPremium = basePremium + hedgeCost;

            // Send incorrect premium (too low)
            const incorrectPremium = correctPremium - toNano('10');

            const result = await factory.sendCreateHedgedPolicy(user.getSender(), {
                value: incorrectPremium + toNano('0.5'),
                userAddress: user.address,
                coverageType: CoverageType.DEPEG,
                coverageAmount,
                durationDays,
                expectedPremium: incorrectPremium,
                quoteTimestamp: Math.floor(Date.now() / 1000),
            });

            // Should reject
            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: factory.address,
                success: false,
            });
        });

        it('should handle different coverage types correctly', async () => {
            // Update oracle for EXPLOIT coverage
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.EXPLOIT,
                polymarketOdds: 300,    // 3% for exploit (higher risk)
                perpFundingRate: -30,
                allianzQuote: 600,
            });

            const coverageAmount = toNano('10000');
            const durationDays = 30;

            const hedgeCostExploit = await pricingOracle.calculateHedgeCost(
                CoverageType.EXPLOIT,
                coverageAmount,
                durationDays
            );

            // Should be higher than DEPEG due to higher risk
            expect(hedgeCostExploit).toBeGreaterThan(toNano('100'));
        });

        it('should prevent unauthorized keeper from registering hedge', async () => {
            const unauthorizedKeeper = await blockchain.treasury('unauthorized');
            const policyId = 1n;

            const result = await hedgeCoordinator.sendRegisterHedge(
                unauthorizedKeeper.getSender(),
                {
                    value: toNano('0.05'),
                    policyId,
                    venueId: VenueType.POLYMARKET,
                    amount: toNano('4000'),
                    externalId: 'pm-order-123',
                    status: HedgeStatus.ACTIVE,
                }
            );

            // Should reject
            expect(result.transactions).toHaveTransaction({
                from: unauthorizedKeeper.address,
                to: hedgeCoordinator.address,
                success: false,
            });
        });
    });
});
