import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, Address, Dictionary, beginCell } from '@ton/core';
import {
    PriceOracle,
    ASSET_USDT,
    ASSET_USDC,
    ASSET_DAI,
    BRIDGE_TON,
    BRIDGE_ORBIT,
    ORACLE_REDSTONE,
    ORACLE_PYTH,
    PROTOCOL_DEDUST,
    PROTOCOL_STON,
    PRICE_DECIMALS,
    MAX_PRICE_AGE_DEFAULT,
    MAX_STATUS_AGE_DEFAULT,
    MIN_ORACLE_COUNT_DEFAULT,
    PRODUCT_TYPE_DEPEG,
    formatPrice,
    encodePrice,
    isDepegged,
} from '../../wrappers/v3/PriceOracle';
import '@ton/test-utils';
import { compileV3 } from './compile-helper';

describe('PriceOracle', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compileV3('PriceOracle');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let masterFactory: SandboxContract<TreasuryContract>;
    let rewards: SandboxContract<TreasuryContract>;
    let keeper1: SandboxContract<TreasuryContract>;
    let keeper2: SandboxContract<TreasuryContract>;
    let keeper3: SandboxContract<TreasuryContract>;
    let oracle: SandboxContract<PriceOracle>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        masterFactory = await blockchain.treasury('master_factory');
        rewards = await blockchain.treasury('rewards');
        keeper1 = await blockchain.treasury('keeper1');
        keeper2 = await blockchain.treasury('keeper2');
        keeper3 = await blockchain.treasury('keeper3');

        oracle = blockchain.openContract(
            PriceOracle.createFromConfig(
                {
                    masterFactoryAddress: masterFactory.address,
                    rewardsAddress: rewards.address,
                    priceFeeds: Dictionary.empty(),
                    bridgeStatus: Dictionary.empty(),
                    oracleStatus: Dictionary.empty(),
                    protocolStatus: Dictionary.empty(),
                    oracleKeepers: Dictionary.empty(),
                    minOracleCount: MIN_ORACLE_COUNT_DEFAULT,
                    maxPriceAge: MAX_PRICE_AGE_DEFAULT,
                    maxStatusAge: MAX_STATUS_AGE_DEFAULT,
                },
                code
            )
        );

        const deployResult = await oracle.sendDeploy(deployer.getSender(), toNano('1'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: oracle.address,
            deploy: true,
            success: true,
        });
    });

    describe('Initialization', () => {
        it('should initialize with correct configuration', async () => {
            const minOracleCount = await oracle.getMinOracleCount();
            expect(minOracleCount).toEqual(MIN_ORACLE_COUNT_DEFAULT);

            const maxPriceAge = await oracle.getMaxPriceAge();
            expect(maxPriceAge).toEqual(MAX_PRICE_AGE_DEFAULT);

            const version = await oracle.getVersion();
            expect(version).toEqual(3);
        });
    });

    describe('Keeper Management', () => {
        it('should allow master factory to register keeper', async () => {
            const result = await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracle.address,
                success: true,
            });

            const stats = await oracle.getKeeperStats(keeper1.address);
            expect(stats.updateCount).toEqual(0);
            expect(stats.accuracyScore).toEqual(10000); // 100%
            expect(stats.isActive).toBe(true);
        });

        it('should prevent non-master from registering keeper', async () => {
            const result = await oracle.sendRegisterKeeper(deployer.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: oracle.address,
                success: false,
                exitCode: 401,
            });
        });

        it('should allow master factory to deactivate keeper', async () => {
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper1.address,
            });

            const result = await oracle.sendDeactivateKeeper(masterFactory.getSender(), {
                value: toNano('0.05'),
                keeperAddress: keeper1.address,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracle.address,
                success: true,
            });

            const stats = await oracle.getKeeperStats(keeper1.address);
            expect(stats.isActive).toBe(false);
        });
    });

    describe('Price Updates (Depeg)', () => {
        beforeEach(async () => {
            // Register 3 keepers
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper1.address,
            });
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper2.address,
            });
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper3.address,
            });
        });

        it('should allow keeper to update price', async () => {
            const price = encodePrice(0.995); // $0.995
            const signature = beginCell().endCell();

            const result = await oracle.sendUpdatePrice(keeper1.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: price,
                timestamp: Math.floor(Date.now() / 1000),
                signature: signature,
            });

            expect(result.transactions).toHaveTransaction({
                from: keeper1.address,
                to: oracle.address,
                success: true,
            });
        });

        it('should reject price update from non-keeper', async () => {
            const price = encodePrice(0.995);
            const signature = beginCell().endCell();

            const result = await oracle.sendUpdatePrice(deployer.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: price,
                timestamp: Math.floor(Date.now() / 1000),
                signature: signature,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: oracle.address,
                success: false,
                exitCode: 402, // keeper_not_found
            });
        });

        it('should calculate median price from multiple keepers', async () => {
            const now = Math.floor(Date.now() / 1000);
            const signature = beginCell().endCell();

            // Keeper 1: $0.995
            await oracle.sendUpdatePrice(keeper1.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.995),
                timestamp: now,
                signature: signature,
            });

            // Keeper 2: $0.993
            await oracle.sendUpdatePrice(keeper2.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.993),
                timestamp: now,
                signature: signature,
            });

            // Keeper 3: $0.997
            await oracle.sendUpdatePrice(keeper3.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.997),
                timestamp: now,
                signature: signature,
            });

            const { price, isStale } = await oracle.getPrice(ASSET_USDT);
            expect(isStale).toBe(false); // 3 keepers = sufficient
            expect(formatPrice(price)).toBeCloseTo(0.995, 3); // Median of 0.993, 0.995, 0.997
        });

        it('should track keeper update count', async () => {
            const now = Math.floor(Date.now() / 1000);
            const signature = beginCell().endCell();

            await oracle.sendUpdatePrice(keeper1.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.995),
                timestamp: now,
                signature: signature,
            });

            await oracle.sendUpdatePrice(keeper1.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDC,
                price: encodePrice(0.998),
                timestamp: now,
                signature: signature,
            });

            const stats = await oracle.getKeeperStats(keeper1.address);
            expect(stats.updateCount).toEqual(2);
        });
    });

    describe('Bridge Status Updates', () => {
        beforeEach(async () => {
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper1.address,
            });
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper2.address,
            });
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper3.address,
            });
        });

        it('should allow keeper to update bridge status', async () => {
            const now = Math.floor(Date.now() / 1000);
            const signature = beginCell().endCell();

            const result = await oracle.sendUpdateBridgeStatus(keeper1.getSender(), {
                value: toNano('0.05'),
                bridgeId: BRIDGE_TON,
                isOnline: true,
                lastSeen: now,
                signature: signature,
            });

            expect(result.transactions).toHaveTransaction({
                from: keeper1.address,
                to: oracle.address,
                success: true,
            });
        });

        it('should reject bridge update from non-keeper', async () => {
            const now = Math.floor(Date.now() / 1000);
            const signature = beginCell().endCell();

            const result = await oracle.sendUpdateBridgeStatus(deployer.getSender(), {
                value: toNano('0.05'),
                bridgeId: BRIDGE_TON,
                isOnline: true,
                lastSeen: now,
                signature: signature,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: oracle.address,
                success: false,
                exitCode: 402,
            });
        });
    });

    describe('Oracle Status Updates', () => {
        beforeEach(async () => {
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper1.address,
            });
        });

        it('should allow keeper to update oracle status', async () => {
            const now = Math.floor(Date.now() / 1000);
            const signature = beginCell().endCell();

            const result = await oracle.sendUpdateOracleStatus(keeper1.getSender(), {
                value: toNano('0.05'),
                oracleId: ORACLE_REDSTONE,
                isHealthy: true,
                lastUpdateTime: now,
                deviationBps: 50, // 0.5%
                signature: signature,
            });

            expect(result.transactions).toHaveTransaction({
                from: keeper1.address,
                to: oracle.address,
                success: true,
            });
        });
    });

    describe('Protocol Status Updates', () => {
        beforeEach(async () => {
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper1.address,
            });
        });

        it('should allow keeper to update protocol status', async () => {
            const now = Math.floor(Date.now() / 1000);
            const signature = beginCell().endCell();

            const result = await oracle.sendUpdateProtocolStatus(keeper1.getSender(), {
                value: toNano('0.05'),
                protocolId: PROTOCOL_DEDUST,
                isPaused: false,
                pauseTimestamp: 0,
                signature: signature,
            });

            expect(result.transactions).toHaveTransaction({
                from: keeper1.address,
                to: oracle.address,
                success: true,
            });
        });
    });

    describe('Admin Functions', () => {
        it('should allow master factory to set min oracle count', async () => {
            const result = await oracle.sendSetMinOracleCount(masterFactory.getSender(), {
                value: toNano('0.05'),
                minOracleCount: 5,
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracle.address,
                success: true,
            });

            const minOracleCount = await oracle.getMinOracleCount();
            expect(minOracleCount).toEqual(5);
        });

        it('should allow master factory to set max price age', async () => {
            const result = await oracle.sendSetMaxPriceAge(masterFactory.getSender(), {
                value: toNano('0.05'),
                maxPriceAge: 600, // 10 minutes
            });

            expect(result.transactions).toHaveTransaction({
                from: masterFactory.address,
                to: oracle.address,
                success: true,
            });

            const maxPriceAge = await oracle.getMaxPriceAge();
            expect(maxPriceAge).toEqual(600);
        });

        it('should prevent non-master from setting min oracle count', async () => {
            const result = await oracle.sendSetMinOracleCount(deployer.getSender(), {
                value: toNano('0.05'),
                minOracleCount: 5,
            });

            expect(result.transactions).toHaveTransaction({
                from: deployer.address,
                to: oracle.address,
                success: false,
                exitCode: 401,
            });
        });
    });

    describe('Price Queries', () => {
        beforeEach(async () => {
            // Register and update price
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper1.address,
            });
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper2.address,
            });
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper3.address,
            });

            const now = Math.floor(Date.now() / 1000);
            const signature = beginCell().endCell();

            await oracle.sendUpdatePrice(keeper1.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.995),
                timestamp: now,
                signature: signature,
            });
            await oracle.sendUpdatePrice(keeper2.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.996),
                timestamp: now,
                signature: signature,
            });
            await oracle.sendUpdatePrice(keeper3.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.994),
                timestamp: now,
                signature: signature,
            });
        });

        it('should return latest price', async () => {
            const price = await oracle.getLatestPrice(ASSET_USDT);
            expect(formatPrice(price)).toBeCloseTo(0.995, 3);
        });

        it('should return price with metadata', async () => {
            const result = await oracle.getPrice(ASSET_USDT);
            expect(formatPrice(result.price)).toBeCloseTo(0.995, 3);
            expect(result.isStale).toBe(false);
            expect(result.timestamp).toBeGreaterThan(0);
        });

        it('should detect stale price', async () => {
            const isStale = await oracle.isPriceStale(ASSET_USDT);
            expect(isStale).toBe(false); // 3 keepers = not stale

            // Query non-existent asset
            const noData = await oracle.isPriceStale(99);
            expect(noData).toBe(true); // No data = stale
        });
    });

    describe('Trigger Validation', () => {
        beforeEach(async () => {
            // Register keepers and update USDT price to $0.965
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper1.address,
            });
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper2.address,
            });
            await oracle.sendRegisterKeeper(masterFactory.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper3.address,
            });

            const now = Math.floor(Date.now() / 1000);
            const signature = beginCell().endCell();

            await oracle.sendUpdatePrice(keeper1.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.965),
                timestamp: now,
                signature: signature,
            });
            await oracle.sendUpdatePrice(keeper2.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.964),
                timestamp: now,
                signature: signature,
            });
            await oracle.sendUpdatePrice(keeper3.getSender(), {
                value: toNano('0.05'),
                assetId: ASSET_USDT,
                price: encodePrice(0.966),
                timestamp: now,
                signature: signature,
            });
        });

        it('should validate depeg trigger', async () => {
            const result = await oracle.validateTrigger({
                productType: PRODUCT_TYPE_DEPEG,
                assetId: ASSET_USDT,
                triggerThreshold: encodePrice(0.98), // Trigger if < $0.98
                triggerDuration: 0,
            });

            expect(result.isTriggered).toBe(true); // $0.965 < $0.98
        });

        it('should not trigger if price above threshold', async () => {
            const result = await oracle.validateTrigger({
                productType: PRODUCT_TYPE_DEPEG,
                assetId: ASSET_USDT,
                triggerThreshold: encodePrice(0.95), // Trigger if < $0.95
                triggerDuration: 0,
            });

            expect(result.isTriggered).toBe(false); // $0.965 > $0.95
        });
    });

    describe('Helper Functions', () => {
        it('should format price correctly', () => {
            const formatted = formatPrice(encodePrice(0.995));
            expect(formatted).toBeCloseTo(0.995, 6);
        });

        it('should encode price correctly', () => {
            const encoded = encodePrice(0.995);
            expect(encoded).toEqual(BigInt(995000));
        });

        it('should detect depeg', () => {
            expect(isDepegged(0.965, 0.98)).toBe(true);
            expect(isDepegged(0.985, 0.98)).toBe(false);
        });
    });

    describe('Constants', () => {
        it('should have correct asset IDs', () => {
            expect(ASSET_USDT).toEqual(1);
            expect(ASSET_USDC).toEqual(2);
            expect(ASSET_DAI).toEqual(3);
        });

        it('should have correct bridge IDs', () => {
            expect(BRIDGE_TON).toEqual(1);
            expect(BRIDGE_ORBIT).toEqual(2);
        });

        it('should have correct oracle IDs', () => {
            expect(ORACLE_REDSTONE).toEqual(1);
            expect(ORACLE_PYTH).toEqual(2);
        });

        it('should have correct protocol IDs', () => {
            expect(PROTOCOL_DEDUST).toEqual(1);
            expect(PROTOCOL_STON).toEqual(2);
        });

        it('should have correct defaults', () => {
            expect(PRICE_DECIMALS).toEqual(1000000);
            expect(MAX_PRICE_AGE_DEFAULT).toEqual(300);
            expect(MAX_STATUS_AGE_DEFAULT).toEqual(1800);
            expect(MIN_ORACLE_COUNT_DEFAULT).toEqual(3);
        });
    });
});
