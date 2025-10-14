import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano, Address } from '@ton/core';
import { HedgeCoordinator, VenueType, HedgeStatus } from '../../../wrappers/HedgeCoordinator';
import { PolymarketConnector } from '../../../hedging/services/PolymarketConnector';
import nock from 'nock';
import '@ton/test-utils';

describe('Claim Payout Flow Integration', () => {
    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let keeper1: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<TreasuryContract>;
    let reserveVault: SandboxContract<TreasuryContract>;

    let hedgeCoordinator: SandboxContract<HedgeCoordinator>;
    let polymarketConnector: PolymarketConnector;

    const API_URL = 'https://clob.polymarket.com';

    beforeEach(async () => {
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        keeper1 = await blockchain.treasury('keeper1');
        factory = await blockchain.treasury('factory');
        reserveVault = await blockchain.treasury('reserve');

        // Deploy HedgeCoordinator
        hedgeCoordinator = blockchain.openContract(
            await HedgeCoordinator.fromInit(deployer.address, factory.address)
        );
        await hedgeCoordinator.send(
            deployer.getSender(),
            { value: toNano('0.05') },
            { $$type: 'Deploy', queryId: 0n }
        );

        // Add keeper
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

    describe('Full Claim Payout Flow', () => {
        it('should complete full flow: claim → liquidate → refill reserve', async () => {
            const policyId = 1n;

            // Step 1: Register initial hedges (from policy creation)
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

            // Step 2: Trigger liquidation (from factory after claim approved)
            const liquidateResult = await hedgeCoordinator.sendLiquidateHedges(
                factory.getSender(),
                {
                    value: toNano('0.5'),
                    policyId,
                    polymarketKeeper: keeper1.address,
                    perpKeeper: keeper1.address,
                    allianzKeeper: keeper1.address,
                }
            );

            expect(liquidateResult.transactions).toHaveTransaction({
                from: factory.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            // Step 3: Mock Polymarket liquidation API
            nock(API_URL)
                .post('/order', (body) => body.side === 'NO') // Selling position
                .reply(200, {
                    proceeds: 3950,
                    fillPrice: 0.9875,
                    size: 4000,
                });

            // Step 4: Execute Polymarket liquidation (keeper action)
            const polymarketProceeds = await polymarketConnector.liquidatePosition({
                externalId: 'pm-order-123',
                amount: 4000,
            });

            expect(polymarketProceeds.proceeds).toBe(3950);
            expect(polymarketProceeds.slippage).toBeCloseTo(0.0125, 4); // 1.25% slippage

            // Step 5: Report Polymarket liquidation
            const reportPolymarketResult = await hedgeCoordinator.sendReportLiquidation(
                keeper1.getSender(),
                {
                    value: toNano('0.1'),
                    policyId,
                    venueId: VenueType.POLYMARKET,
                    proceeds: toNano('3950'),
                    reserveVault: reserveVault.address,
                }
            );

            expect(reportPolymarketResult.transactions).toHaveTransaction({
                from: keeper1.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            // Step 6: Report Perpetuals liquidation
            const reportPerpResult = await hedgeCoordinator.sendReportLiquidation(
                keeper1.getSender(),
                {
                    value: toNano('0.1'),
                    policyId,
                    venueId: VenueType.PERPETUALS,
                    proceeds: toNano('4100'), // Profit on short
                    reserveVault: reserveVault.address,
                }
            );

            expect(reportPerpResult.transactions).toHaveTransaction({
                from: keeper1.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            // Step 7: Report Allianz liquidation (completes all 3)
            const reportAllianzResult = await hedgeCoordinator.sendReportLiquidation(
                keeper1.getSender(),
                {
                    value: toNano('0.1'),
                    policyId,
                    venueId: VenueType.ALLIANZ,
                    proceeds: toNano('2000'),
                    reserveVault: reserveVault.address,
                }
            );

            expect(reportAllianzResult.transactions).toHaveTransaction({
                from: keeper1.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            // Step 8: Verify reserve refill happened
            // Total proceeds: 3950 + 4100 + 2000 = 10050 TON
            expect(reportAllianzResult.transactions).toHaveTransaction({
                from: hedgeCoordinator.address,
                to: reserveVault.address,
                success: true,
            });
        });

        it('should handle concurrent liquidation of all three venues', async () => {
            const policyId = 1n;

            // Register hedges
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

            // Trigger liquidation
            await hedgeCoordinator.sendLiquidateHedges(factory.getSender(), {
                value: toNano('0.5'),
                policyId,
                polymarketKeeper: keeper1.address,
                perpKeeper: keeper1.address,
                allianzKeeper: keeper1.address,
            });

            // Report all three liquidations (simulating parallel execution)
            const [result1, result2, result3] = await Promise.all([
                hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                    value: toNano('0.1'),
                    policyId,
                    venueId: VenueType.POLYMARKET,
                    proceeds: toNano('3950'),
                    reserveVault: reserveVault.address,
                }),
                hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                    value: toNano('0.1'),
                    policyId,
                    venueId: VenueType.PERPETUALS,
                    proceeds: toNano('4100'),
                    reserveVault: reserveVault.address,
                }),
                hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                    value: toNano('0.1'),
                    policyId,
                    venueId: VenueType.ALLIANZ,
                    proceeds: toNano('2000'),
                    reserveVault: reserveVault.address,
                }),
            ]);

            // All should succeed
            expect(result1.transactions).toHaveTransaction({ success: true });
            expect(result2.transactions).toHaveTransaction({ success: true });
            expect(result3.transactions).toHaveTransaction({ success: true });
        });

        it('should handle partial hedge settlement (not all venues complete)', async () => {
            const policyId = 1n;

            // Register hedges
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

            // Trigger liquidation
            await hedgeCoordinator.sendLiquidateHedges(factory.getSender(), {
                value: toNano('0.5'),
                policyId,
                polymarketKeeper: keeper1.address,
                perpKeeper: keeper1.address,
                allianzKeeper: keeper1.address,
            });

            // Report only Polymarket liquidation
            const result1 = await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.POLYMARKET,
                proceeds: toNano('3950'),
                reserveVault: reserveVault.address,
            });

            expect(result1.transactions).toHaveTransaction({
                from: keeper1.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            // Should NOT refill reserve yet (only 1 of 3 complete)
            expect(result1.transactions).not.toHaveTransaction({
                from: hedgeCoordinator.address,
                to: reserveVault.address,
            });

            // Report Perpetuals liquidation
            const result2 = await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.PERPETUALS,
                proceeds: toNano('4100'),
                reserveVault: reserveVault.address,
            });

            // Still should NOT refill (2 of 3)
            expect(result2.transactions).not.toHaveTransaction({
                from: hedgeCoordinator.address,
                to: reserveVault.address,
            });

            // Report final Allianz liquidation
            const result3 = await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.ALLIANZ,
                proceeds: toNano('2000'),
                reserveVault: reserveVault.address,
            });

            // NOW should refill reserve (3 of 3)
            expect(result3.transactions).toHaveTransaction({
                from: hedgeCoordinator.address,
                to: reserveVault.address,
                success: true,
            });
        });

        it('should handle liquidation with profit', async () => {
            const policyId = 1n;

            // Register hedges
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

            // Trigger liquidation
            await hedgeCoordinator.sendLiquidateHedges(factory.getSender(), {
                value: toNano('0.5'),
                policyId,
                polymarketKeeper: keeper1.address,
                perpKeeper: keeper1.address,
                allianzKeeper: keeper1.address,
            });

            // Report liquidations with profit
            await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.POLYMARKET,
                proceeds: toNano('4200'), // +200 profit
                reserveVault: reserveVault.address,
            });

            await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.PERPETUALS,
                proceeds: toNano('4300'), // +300 profit
                reserveVault: reserveVault.address,
            });

            const finalResult = await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.ALLIANZ,
                proceeds: toNano('2100'), // +100 profit
                reserveVault: reserveVault.address,
            });

            // Total proceeds: 4200 + 4300 + 2100 = 10600 TON (vs 10000 invested)
            // +600 profit
            expect(finalResult.transactions).toHaveTransaction({
                from: hedgeCoordinator.address,
                to: reserveVault.address,
                success: true,
            });
        });

        it('should handle liquidation with loss (slippage)', async () => {
            const policyId = 1n;

            // Register hedges
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

            // Trigger liquidation
            await hedgeCoordinator.sendLiquidateHedges(factory.getSender(), {
                value: toNano('0.5'),
                policyId,
                polymarketKeeper: keeper1.address,
                perpKeeper: keeper1.address,
                allianzKeeper: keeper1.address,
            });

            // Report liquidations with slippage loss
            await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.POLYMARKET,
                proceeds: toNano('3800'), // -200 loss (5% slippage)
                reserveVault: reserveVault.address,
            });

            await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.PERPETUALS,
                proceeds: toNano('3900'), // -100 loss
                reserveVault: reserveVault.address,
            });

            const finalResult = await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.ALLIANZ,
                proceeds: toNano('1950'), // -50 loss
                reserveVault: reserveVault.address,
            });

            // Total proceeds: 3800 + 3900 + 1950 = 9650 TON (vs 10000 invested)
            // -350 loss (3.5% total slippage)
            expect(finalResult.transactions).toHaveTransaction({
                from: hedgeCoordinator.address,
                to: reserveVault.address,
                success: true,
            });
        });

        it('should prevent non-factory from triggering liquidation', async () => {
            const unauthorizedCaller = await blockchain.treasury('unauthorized');
            const policyId = 1n;

            const result = await hedgeCoordinator.sendLiquidateHedges(
                unauthorizedCaller.getSender(),
                {
                    value: toNano('0.5'),
                    policyId,
                    polymarketKeeper: keeper1.address,
                    perpKeeper: keeper1.address,
                    allianzKeeper: keeper1.address,
                }
            );

            // Should reject
            expect(result.transactions).toHaveTransaction({
                from: unauthorizedCaller.address,
                to: hedgeCoordinator.address,
                success: false,
            });
        });

        it('should handle liquidation API failure gracefully', async () => {
            // Mock Polymarket API failure
            nock(API_URL)
                .post('/order')
                .reply(500, { error: 'Internal server error' });

            // Should throw error
            await expect(
                polymarketConnector.liquidatePosition({
                    externalId: 'pm-order-123',
                    amount: 4000,
                })
            ).rejects.toThrow('Polymarket liquidation failed');
        });

        it('should calculate proceeds correctly from fillPrice', async () => {
            // Mock Polymarket API with fillPrice only (no proceeds field)
            nock(API_URL)
                .post('/order')
                .reply(200, {
                    fillPrice: 0.9875,
                    size: 4000,
                    // proceeds not provided
                });

            const result = await polymarketConnector.liquidatePosition({
                externalId: 'pm-order-123',
                amount: 4000,
            });

            // Should calculate proceeds from fillPrice
            expect(result.proceeds).toBe(3950); // 4000 * 0.9875
            expect(result.slippage).toBeCloseTo(0.0125, 4);
        });
    });
});
