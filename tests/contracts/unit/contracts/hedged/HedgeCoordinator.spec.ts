import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano } from '@ton/core';
import { HedgeCoordinator, VenueType, HedgeStatus } from '../../../../wrappers/HedgeCoordinator';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('HedgeCoordinator', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('HedgeCoordinator');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let factory: SandboxContract<TreasuryContract>;
    let keeper1: SandboxContract<TreasuryContract>;
    let keeper2: SandboxContract<TreasuryContract>;
    let reserveVault: SandboxContract<TreasuryContract>;
    let hedgeCoordinator: SandboxContract<HedgeCoordinator>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        factory = await blockchain.treasury('factory');
        keeper1 = await blockchain.treasury('keeper1');
        keeper2 = await blockchain.treasury('keeper2');
        reserveVault = await blockchain.treasury('reserveVault');

        hedgeCoordinator = blockchain.openContract(
            HedgeCoordinator.createFromConfig(
                {
                    adminAddress: deployer.address,
                    factoryAddress: factory.address,
                },
                code
            )
        );

        const deployResult = await hedgeCoordinator.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: hedgeCoordinator.address,
            deploy: true,
            success: true,
        });
    });

    describe('Deployment', () => {
        it('should deploy successfully', async () => {
            const adminAddress = await hedgeCoordinator.getAdminAddress();
            expect(adminAddress.toString()).toBe(deployer.address.toString());
        });

        it('should set factory address correctly', async () => {
            const factoryAddress = await hedgeCoordinator.getFactoryAddress();
            expect(factoryAddress.toString()).toBe(factory.address.toString());
        });
    });

    describe('Keeper Management', () => {
        it('should allow admin to add keeper', async () => {
            const result = await hedgeCoordinator.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            const isAuthorized = await hedgeCoordinator.checkKeeperAuthorized(keeper1.address);
            expect(isAuthorized).toBe(true);
        });

        it('should reject keeper addition from non-admin', async () => {
            const result = await hedgeCoordinator.sendAddKeeper(keeper1.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper2.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: keeper1.address,
                to: hedgeCoordinator.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Register Hedge', () => {
        beforeEach(async () => {
            await hedgeCoordinator.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });
        });

        it('should register Polymarket hedge', async () => {
            const policyId = 1n;
            const result = await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.POLYMARKET,
                amount: toNano('800'),
                externalId: 'pm-order-123',
                status: HedgeStatus.FILLED,
            });

            expect(result.transactions).toHaveTransaction({
                from: keeper1.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            const position = await hedgeCoordinator.getHedgePosition(policyId);
            expect(position.polymarketStatus).toBe(HedgeStatus.FILLED);
            expect(position.polymarketAmount).toBe(toNano('800'));
        });

        it('should register Perpetuals hedge', async () => {
            const policyId = 1n;
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.PERPETUALS,
                amount: toNano('800'),
                externalId: 'perp-order-456',
                status: HedgeStatus.FILLED,
            });

            const position = await hedgeCoordinator.getHedgePosition(policyId);
            expect(position.perpetualsStatus).toBe(HedgeStatus.FILLED);
            expect(position.perpetualsAmount).toBe(toNano('800'));
        });

        it('should register Allianz hedge', async () => {
            const policyId = 1n;
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.ALLIANZ,
                amount: toNano('400'),
                externalId: 'alz-policy-789',
                status: HedgeStatus.FILLED,
            });

            const position = await hedgeCoordinator.getHedgePosition(policyId);
            expect(position.allianzStatus).toBe(HedgeStatus.FILLED);
            expect(position.allianzAmount).toBe(toNano('400'));
        });

        it('should register all three hedges for same policy', async () => {
            const policyId = 1n;

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.POLYMARKET,
                amount: toNano('800'),
                externalId: 'pm-order-123',
                status: HedgeStatus.FILLED,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.PERPETUALS,
                amount: toNano('800'),
                externalId: 'perp-order-456',
                status: HedgeStatus.FILLED,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.ALLIANZ,
                amount: toNano('400'),
                externalId: 'alz-policy-789',
                status: HedgeStatus.FILLED,
            });

            const position = await hedgeCoordinator.getHedgePosition(policyId);
            expect(position.polymarketStatus).toBe(HedgeStatus.FILLED);
            expect(position.polymarketAmount).toBe(toNano('800'));
            expect(position.perpetualsStatus).toBe(HedgeStatus.FILLED);
            expect(position.perpetualsAmount).toBe(toNano('800'));
            expect(position.allianzStatus).toBe(HedgeStatus.FILLED);
            expect(position.allianzAmount).toBe(toNano('400'));
        });

        it('should reject hedge registration from unauthorized keeper', async () => {
            const result = await hedgeCoordinator.sendRegisterHedge(keeper2.getSender(), {
                value: toNano('0.05'),
                policyId: 1n,
                venueId: VenueType.POLYMARKET,
                amount: toNano('800'),
                externalId: 'pm-order-123',
                status: HedgeStatus.FILLED,
            });

            expect(result.transactions).toHaveTransaction({
                from: keeper2.address,
                to: hedgeCoordinator.address,
                success: false,
                exitCode: 401,
            });
        });

        it('should register hedge with FAILED status', async () => {
            const policyId = 1n;
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.POLYMARKET,
                amount: toNano('800'),
                externalId: 'pm-order-failed',
                status: HedgeStatus.FAILED,
            });

            const position = await hedgeCoordinator.getHedgePosition(policyId);
            expect(position.polymarketStatus).toBe(HedgeStatus.FAILED);
        });
    });

    describe('Liquidate Hedges', () => {
        beforeEach(async () => {
            await hedgeCoordinator.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            // Register hedges for policy 1
            const policyId = 1n;
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.POLYMARKET,
                amount: toNano('800'),
                externalId: 'pm-order-123',
                status: HedgeStatus.FILLED,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.PERPETUALS,
                amount: toNano('800'),
                externalId: 'perp-order-456',
                status: HedgeStatus.FILLED,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.ALLIANZ,
                amount: toNano('400'),
                externalId: 'alz-policy-789',
                status: HedgeStatus.FILLED,
            });
        });

        it('should trigger liquidation from factory', async () => {
            const result = await hedgeCoordinator.sendLiquidateHedges(factory.getSender(), {
                value: toNano('1'),
                policyId: 1n,
                polymarketKeeper: keeper1.address,
                perpKeeper: keeper1.address,
                allianzKeeper: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: factory.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            // Should have sent 3 messages to keepers
            expect(result.transactions).toHaveLength(4); // Factory tx + 3 keeper messages
        });

        it('should reject liquidation from non-factory', async () => {
            const result = await hedgeCoordinator.sendLiquidateHedges(deployer.getSender(), {
                value: toNano('1'),
                policyId: 1n,
                polymarketKeeper: keeper1.address,
                perpKeeper: keeper1.address,
                allianzKeeper: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: hedgeCoordinator.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Report Liquidation', () => {
        beforeEach(async () => {
            await hedgeCoordinator.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            // Register and liquidate hedges
            const policyId = 1n;
            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.POLYMARKET,
                amount: toNano('800'),
                externalId: 'pm-order-123',
                status: HedgeStatus.FILLED,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.PERPETUALS,
                amount: toNano('800'),
                externalId: 'perp-order-456',
                status: HedgeStatus.FILLED,
            });

            await hedgeCoordinator.sendRegisterHedge(keeper1.getSender(), {
                value: toNano('0.05'),
                policyId,
                venueId: VenueType.ALLIANZ,
                amount: toNano('400'),
                externalId: 'alz-policy-789',
                status: HedgeStatus.FILLED,
            });

            await hedgeCoordinator.sendLiquidateHedges(factory.getSender(), {
                value: toNano('1'),
                policyId,
                polymarketKeeper: keeper1.address,
                perpKeeper: keeper1.address,
                allianzKeeper: keeper1.address,
            });
        });

        it('should report Polymarket liquidation proceeds', async () => {
            const policyId = 1n;
            const result = await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.POLYMARKET,
                proceeds: toNano('795'), // With slippage
                reserveVault: reserveVault.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: keeper1.address,
                to: hedgeCoordinator.address,
                success: true,
            });

            const liquidation = await hedgeCoordinator.getLiquidationStatus(policyId);
            expect(liquidation.polymarketProceeds).toBe(toNano('795'));
        });

        it('should refill reserve when all three liquidations complete', async () => {
            const policyId = 1n;

            // Report Polymarket
            await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.POLYMARKET,
                proceeds: toNano('795'),
                reserveVault: reserveVault.address,
            });

            // Report Perpetuals
            await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.PERPETUALS,
                proceeds: toNano('810'), // Profit from funding
                reserveVault: reserveVault.address,
            });

            // Report Allianz (completes all 3)
            const result = await hedgeCoordinator.sendReportLiquidation(keeper1.getSender(), {
                value: toNano('0.1'),
                policyId,
                venueId: VenueType.ALLIANZ,
                proceeds: toNano('400'),
                reserveVault: reserveVault.address,
            });

            // Should send refill message to reserve vault
            expect(result.transactions).toHaveTransaction({
                from: hedgeCoordinator.address,
                to: reserveVault.address,
                success: true,
            });

            const liquidation = await hedgeCoordinator.getLiquidationStatus(policyId);
            expect(liquidation.status).toBe(HedgeStatus.LIQUIDATED);

            const totalProceeds = await hedgeCoordinator.getTotalLiquidationProceeds(policyId);
            expect(totalProceeds).toBe(toNano('2005')); // 795 + 810 + 400
        });
    });
});
