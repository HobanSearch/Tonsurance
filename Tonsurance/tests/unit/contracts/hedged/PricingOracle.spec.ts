import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address } from '@ton/core';
import { PricingOracle, CoverageType } from '../../../../wrappers/PricingOracle';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('PricingOracle', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('PricingOracle');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let keeper1: SandboxContract<TreasuryContract>;
    let keeper2: SandboxContract<TreasuryContract>;
    let user: SandboxContract<TreasuryContract>;
    let pricingOracle: SandboxContract<PricingOracle>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        keeper1 = await blockchain.treasury('keeper1');
        keeper2 = await blockchain.treasury('keeper2');
        user = await blockchain.treasury('user');

        pricingOracle = blockchain.openContract(
            PricingOracle.createFromConfig(
                {
                    adminAddress: deployer.address,
                },
                code
            )
        );

        const deployResult = await pricingOracle.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: pricingOracle.address,
            deploy: true,
            success: true,
        });
    });

    describe('Deployment', () => {
        it('should deploy successfully', async () => {
            // Contract is already deployed in beforeEach
            const adminAddress = await pricingOracle.getAdminAddress();
            expect(adminAddress.toString()).toBe(deployer.address.toString());
        });

        it('should initialize with zero last update time', async () => {
            const lastUpdateTime = await pricingOracle.getLastUpdateTime();
            expect(lastUpdateTime).toBe(0);
        });

        it('should initialize with no fresh data', async () => {
            const isFresh = await pricingOracle.isDataFresh();
            expect(isFresh).toBe(false);
        });
    });

    describe('Keeper Management', () => {
        it('should allow admin to add keeper', async () => {
            const result = await pricingOracle.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: pricingOracle.address,
                success: true,
            });

            const isAuthorized = await pricingOracle.checkKeeperAuthorized(keeper1.address);
            expect(isAuthorized).toBe(true);
        });

        it('should reject keeper addition from non-admin', async () => {
            const result = await pricingOracle.sendAddKeeper(user.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: pricingOracle.address,
                success: false,
                exitCode: 401, // error::unauthorized
            });
        });

        it('should allow admin to remove keeper', async () => {
            // First add keeper
            await pricingOracle.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            // Then remove keeper
            const result = await pricingOracle.sendRemoveKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: pricingOracle.address,
                success: true,
            });

            const isAuthorized = await pricingOracle.checkKeeperAuthorized(keeper1.address);
            expect(isAuthorized).toBe(false);
        });

        it('should reject keeper removal from non-admin', async () => {
            // Add keeper first
            await pricingOracle.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            // Try to remove as non-admin
            const result = await pricingOracle.sendRemoveKeeper(user.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: pricingOracle.address,
                success: false,
                exitCode: 401, // error::unauthorized
            });
        });
    });

    describe('Update Hedge Prices', () => {
        beforeEach(async () => {
            // Add keeper1 as authorized keeper
            await pricingOracle.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });
        });

        it('should allow authorized keeper to update prices for DEPEG', async () => {
            const result = await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,       // 2.5%
                perpFundingRate: -50,      // -0.5% daily
                allianzQuote: 450,         // $4.50 per $1000
            });

            expect(result.transactions).toHaveTransaction({
                from: keeper1.address,
                to: pricingOracle.address,
                success: true,
            });

            const prices = await pricingOracle.getHedgePrices(CoverageType.DEPEG);
            expect(prices.polymarketOdds).toBe(250);
            expect(prices.perpFundingRate).toBe(-50);
            expect(prices.allianzQuote).toBe(450);
            expect(prices.timestamp).toBeGreaterThan(0);
        });

        it('should allow authorized keeper to update prices for EXPLOIT', async () => {
            const result = await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.EXPLOIT,
                polymarketOdds: 300,       // 3.0%
                perpFundingRate: 75,       // 0.75% daily
                allianzQuote: 600,         // $6.00 per $1000
            });

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            const prices = await pricingOracle.getHedgePrices(CoverageType.EXPLOIT);
            expect(prices.polymarketOdds).toBe(300);
            expect(prices.perpFundingRate).toBe(75);
            expect(prices.allianzQuote).toBe(600);
        });

        it('should allow authorized keeper to update prices for BRIDGE', async () => {
            const result = await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.BRIDGE,
                polymarketOdds: 150,       // 1.5%
                perpFundingRate: -25,      // -0.25% daily
                allianzQuote: 350,         // $3.50 per $1000
            });

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            const prices = await pricingOracle.getHedgePrices(CoverageType.BRIDGE);
            expect(prices.polymarketOdds).toBe(150);
            expect(prices.perpFundingRate).toBe(-25);
            expect(prices.allianzQuote).toBe(350);
        });

        it('should reject price update from unauthorized keeper', async () => {
            const result = await pricingOracle.sendUpdateHedgePrices(user.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            expect(result.transactions).toHaveTransaction({
                from: user.address,
                to: pricingOracle.address,
                success: false,
                exitCode: 401, // error::unauthorized
            });
        });

        it('should reject invalid coverage type', async () => {
            const result = await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: 99 as CoverageType, // Invalid
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 402, // error::invalid_coverage_type
            });
        });

        it('should reject polymarket odds > 100%', async () => {
            const result = await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 15000,     // 150% - invalid
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 409, // error::invalid_price_data
            });
        });

        it('should reject negative polymarket odds', async () => {
            const result = await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: -100,      // Negative - invalid
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            expect(result.transactions).toHaveTransaction({
                success: false,
                exitCode: 409, // error::invalid_price_data
            });
        });

        it('should accept negative perpetual funding rate', async () => {
            const result = await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -500,     // -5% daily (high but valid)
                allianzQuote: 450,
            });

            expect(result.transactions).toHaveTransaction({
                success: true,
            });

            const prices = await pricingOracle.getHedgePrices(CoverageType.DEPEG);
            expect(prices.perpFundingRate).toBe(-500);
        });

        it('should update last_update_time on successful price update', async () => {
            const beforeTime = await pricingOracle.getLastUpdateTime();

            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            const afterTime = await pricingOracle.getLastUpdateTime();
            expect(afterTime).toBeGreaterThan(beforeTime);
        });

        it('should mark data as fresh after update', async () => {
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            const isFresh = await pricingOracle.isDataFresh();
            expect(isFresh).toBe(true);
        });
    });

    describe('Calculate Hedge Cost', () => {
        beforeEach(async () => {
            // Add keeper and update prices
            await pricingOracle.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,       // 2.5%
                perpFundingRate: -50,      // -0.5% daily
                allianzQuote: 450,         // $4.50 per $1000
            });
        });

        it('should calculate hedge cost correctly for 30 days', async () => {
            const coverageAmount = toNano('10000');
            const durationDays = 30;

            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.DEPEG,
                coverageAmount,
                durationDays
            );

            // Expected calculation:
            // Polymarket: 10000 * 0.025 * 0.4 = 100 TON
            // Perpetuals: 10000 * 0.005 * 30 * 0.4 = 60 TON
            // Allianz: 10000 * 0.0045 * 0.2 = 9 TON
            // Total: 169 TON

            const expectedCost = toNano('169');
            expect(hedgeCost).toBe(expectedCost);
        });

        it('should calculate hedge cost correctly for 60 days', async () => {
            const coverageAmount = toNano('10000');
            const durationDays = 60;

            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.DEPEG,
                coverageAmount,
                durationDays
            );

            // Expected calculation:
            // Polymarket: 10000 * 0.025 * 0.4 = 100 TON
            // Perpetuals: 10000 * 0.005 * 60 * 0.4 = 120 TON (doubled duration)
            // Allianz: 10000 * 0.0045 * 0.2 = 9 TON
            // Total: 229 TON

            const expectedCost = toNano('229');
            expect(hedgeCost).toBe(expectedCost);
        });

        it('should calculate hedge cost for different coverage amount', async () => {
            const coverageAmount = toNano('5000');
            const durationDays = 30;

            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.DEPEG,
                coverageAmount,
                durationDays
            );

            // Expected: Half of 10000 case = 169 / 2 = 84.5 TON
            const expectedCost = toNano('84.5');
            expect(hedgeCost).toBe(expectedCost);
        });

        it('should handle positive perpetual funding rate', async () => {
            // Update with positive funding rate
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.EXPLOIT,
                polymarketOdds: 300,       // 3%
                perpFundingRate: 100,      // +1% daily (shorts pay longs)
                allianzQuote: 600,
            });

            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.EXPLOIT,
                toNano('10000'),
                30
            );

            // Polymarket: 10000 * 0.03 * 0.4 = 120 TON
            // Perpetuals: 10000 * 0.01 * 30 * 0.4 = 120 TON (absolute value)
            // Allianz: 10000 * 0.006 * 0.2 = 12 TON
            // Total: 252 TON

            const expectedCost = toNano('252');
            expect(hedgeCost).toBe(expectedCost);
        });

        it('should reject if oracle data is stale', async () => {
            // Fast-forward time by 6 minutes (>5 min threshold)
            blockchain.now = Math.floor(Date.now() / 1000) + 361;

            await expect(
                pricingOracle.calculateHedgeCost(
                    CoverageType.DEPEG,
                    toNano('10000'),
                    30
                )
            ).rejects.toThrow(); // Should throw error::stale_oracle_data (408)
        });

        it('should work with recently updated data', async () => {
            // Update prices
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.BRIDGE,
                polymarketOdds: 150,
                perpFundingRate: -25,
                allianzQuote: 350,
            });

            // Immediately calculate (should work)
            const hedgeCost = await pricingOracle.calculateHedgeCost(
                CoverageType.BRIDGE,
                toNano('20000'),
                30
            );

            expect(hedgeCost).toBeGreaterThan(0n);
        });
    });

    describe('Get Hedge Prices', () => {
        beforeEach(async () => {
            await pricingOracle.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });
        });

        it('should return correct prices for DEPEG', async () => {
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            const prices = await pricingOracle.getHedgePrices(CoverageType.DEPEG);

            expect(prices.polymarketOdds).toBe(250);
            expect(prices.perpFundingRate).toBe(-50);
            expect(prices.allianzQuote).toBe(450);
            expect(prices.timestamp).toBeGreaterThan(0);
        });

        it('should return different prices for different coverage types', async () => {
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.EXPLOIT,
                polymarketOdds: 300,
                perpFundingRate: 75,
                allianzQuote: 600,
            });

            const depegPrices = await pricingOracle.getHedgePrices(CoverageType.DEPEG);
            const exploitPrices = await pricingOracle.getHedgePrices(CoverageType.EXPLOIT);

            expect(depegPrices.polymarketOdds).toBe(250);
            expect(exploitPrices.polymarketOdds).toBe(300);
        });

        it('should throw for coverage type without prices', async () => {
            await expect(
                pricingOracle.getHedgePrices(CoverageType.BRIDGE)
            ).rejects.toThrow(); // No prices set for BRIDGE yet
        });
    });

    describe('Data Freshness', () => {
        beforeEach(async () => {
            await pricingOracle.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });
        });

        it('should report data as stale before first update', async () => {
            const isFresh = await pricingOracle.isDataFresh();
            expect(isFresh).toBe(false);
        });

        it('should report data as fresh immediately after update', async () => {
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            const isFresh = await pricingOracle.isDataFresh();
            expect(isFresh).toBe(true);
        });

        it('should report data as stale after 5 minutes', async () => {
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            // Fast-forward 6 minutes
            blockchain.now = Math.floor(Date.now() / 1000) + 361;

            const isFresh = await pricingOracle.isDataFresh();
            expect(isFresh).toBe(false);
        });

        it('should report data as fresh within 5 minute window', async () => {
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            // Fast-forward 4 minutes (still within threshold)
            blockchain.now = Math.floor(Date.now() / 1000) + 240;

            const isFresh = await pricingOracle.isDataFresh();
            expect(isFresh).toBe(true);
        });
    });

    describe('Multiple Keepers', () => {
        beforeEach(async () => {
            await pricingOracle.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            await pricingOracle.sendAddKeeper(deployer.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper2.address,
            });
        });

        it('should allow multiple keepers to update prices', async () => {
            const result1 = await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            expect(result1.transactions).toHaveTransaction({ success: true });

            const result2 = await pricingOracle.sendUpdateHedgePrices(keeper2.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.EXPLOIT,
                polymarketOdds: 300,
                perpFundingRate: 75,
                allianzQuote: 600,
            });

            expect(result2.transactions).toHaveTransaction({ success: true });
        });

        it('should allow keeper2 to overwrite keeper1 prices', async () => {
            await pricingOracle.sendUpdateHedgePrices(keeper1.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 250,
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            await pricingOracle.sendUpdateHedgePrices(keeper2.getSender(), {
                value: toNano('0.05'),
                coverageType: CoverageType.DEPEG,
                polymarketOdds: 300,      // Different value
                perpFundingRate: -50,
                allianzQuote: 450,
            });

            const prices = await pricingOracle.getHedgePrices(CoverageType.DEPEG);
            expect(prices.polymarketOdds).toBe(300); // Latest value from keeper2
        });
    });
});
