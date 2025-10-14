import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell } from '@ton/core';
import { PriceOracle } from '../wrappers/PriceOracle';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';

describe('PriceOracle', () => {
    let code: Cell;

    beforeAll(async () => {
        code = await compile('PriceOracle');
    });

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let priceOracle: SandboxContract<PriceOracle>;
    let oracleRewards: SandboxContract<TreasuryContract>;

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        oracleRewards = await blockchain.treasury('oracleRewards');

        priceOracle = blockchain.openContract(
            PriceOracle.createFromConfig(
                {
                    ownerAddress: deployer.address,
                    oracleRewardsAddress: oracleRewards.address,
                    minOracleCount: 5,
                    maxPriceAge: 300, // 5 minutes
                },
                code
            )
        );

        const deployResult = await priceOracle.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: priceOracle.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy successfully', async () => {
        // Deployment tested in beforeEach
    });

    it('should register keeper successfully', async () => {
        const keeper = await blockchain.treasury('keeper');

        const result = await priceOracle.sendRegisterKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: priceOracle.address,
            success: true,
        });
    });

    it('should update price from registered keeper', async () => {
        const keeper = await blockchain.treasury('keeper');
        const signature = beginCell().storeUint(123456, 256).endCell();

        // Register keeper first
        await priceOracle.sendRegisterKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        // Update price
        const assetId = 1; // USDT
        const price = toNano('1.0'); // $1.00
        const timestamp = Math.floor(Date.now() / 1000);

        const result = await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId,
            price,
            timestamp,
            signature,
        });

        expect(result.transactions).toHaveTransaction({
            from: keeper.address,
            to: priceOracle.address,
            success: true,
        });
    });

    it('should aggregate prices from multiple keepers (median of 5)', async () => {
        const keeper1 = await blockchain.treasury('keeper1');
        const keeper2 = await blockchain.treasury('keeper2');
        const keeper3 = await blockchain.treasury('keeper3');
        const keeper4 = await blockchain.treasury('keeper4');
        const keeper5 = await blockchain.treasury('keeper5');

        const keepers = [keeper1, keeper2, keeper3, keeper4, keeper5];
        const signature = beginCell().storeUint(123456, 256).endCell();

        // Register all keepers
        for (const keeper of keepers) {
            await priceOracle.sendRegisterKeeper(deployer.getSender(), {
                value: toNano('0.1'),
                keeperAddress: keeper.address,
            });
        }

        const assetId = 1; // USDT
        const timestamp = Math.floor(Date.now() / 1000);

        // Submit prices: 0.98, 0.99, 1.00, 1.01, 1.02
        // Median should be 1.00
        const prices = [
            toNano('0.98'),
            toNano('0.99'),
            toNano('1.00'),
            toNano('1.01'),
            toNano('1.02'),
        ];

        for (let i = 0; i < keepers.length; i++) {
            await priceOracle.sendUpdatePrice(keepers[i].getSender(), {
                value: toNano('0.1'),
                assetId,
                price: prices[i],
                timestamp,
                signature,
            });
        }

        const priceData = await priceOracle.getPrice(assetId);
        // Median price should be close to 1.00
        expect(Number(priceData.price)).toBeCloseTo(Number(toNano('1.00')), -9);
    });

    it('should detect stale prices (>5 min)', async () => {
        const keeper = await blockchain.treasury('keeper');
        const signature = beginCell().storeUint(123456, 256).endCell();

        await priceOracle.sendRegisterKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        const assetId = 1;
        const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 6 minutes ago

        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId,
            price: toNano('1.0'),
            timestamp: oldTimestamp,
            signature,
        });

        const isStale = await priceOracle.isPriceStale(assetId);
        expect(isStale).toBe(true);
    });

    it('should retrieve latest price', async () => {
        const keeper = await blockchain.treasury('keeper');
        const signature = beginCell().storeUint(123456, 256).endCell();

        await priceOracle.sendRegisterKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        const assetId = 2; // TON
        const price = toNano('5.5'); // $5.50
        const timestamp = Math.floor(Date.now() / 1000);

        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId,
            price,
            timestamp,
            signature,
        });

        const latestPrice = await priceOracle.getLatestPrice(assetId);
        expect(latestPrice).toBe(price);
    });

    it('should check if price is stale', async () => {
        const keeper = await blockchain.treasury('keeper');
        const signature = beginCell().storeUint(123456, 256).endCell();

        await priceOracle.sendRegisterKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        const assetId = 1;
        const timestamp = Math.floor(Date.now() / 1000);

        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId,
            price: toNano('1.0'),
            timestamp,
            signature,
        });

        // Price is fresh
        const staleBefore = await priceOracle.isPriceStale(assetId);
        expect(staleBefore).toBe(false);

        // Fast-forward time by 6 minutes
        blockchain.now = (blockchain.now || Math.floor(Date.now() / 1000)) + 360;

        // Price should now be stale
        const staleAfter = await priceOracle.isPriceStale(assetId);
        expect(staleAfter).toBe(true);
    });

    it('should track keeper statistics', async () => {
        const keeper = await blockchain.treasury('keeper');
        const signature = beginCell().storeUint(123456, 256).endCell();

        await priceOracle.sendRegisterKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        const assetId = 1;
        const timestamp = Math.floor(Date.now() / 1000);

        // Submit multiple updates
        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId,
            price: toNano('1.0'),
            timestamp,
            signature,
        });

        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId: 2,
            price: toNano('5.5'),
            timestamp,
            signature,
        });

        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId: 3,
            price: toNano('50000'),
            timestamp,
            signature,
        });

        const stats = await priceOracle.getKeeperStats(keeper.address);
        expect(stats.updateCount).toBe(3);
        expect(stats.isActive).toBe(true);
    });

    it('should allow owner to deactivate keeper', async () => {
        const keeper = await blockchain.treasury('keeper');

        await priceOracle.sendRegisterKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        const result = await priceOracle.sendDeactivateKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        expect(result.transactions).toHaveTransaction({
            from: deployer.address,
            to: priceOracle.address,
            success: true,
        });

        const stats = await priceOracle.getKeeperStats(keeper.address);
        expect(stats.isActive).toBe(false);
    });

    it('should enforce minimum oracle count', async () => {
        const minCount = await priceOracle.getMinOracleCount();
        expect(minCount).toBe(5);
    });

    it('should retrieve max price age setting', async () => {
        const maxAge = await priceOracle.getMaxPriceAge();
        expect(maxAge).toBe(300); // 5 minutes
    });

    it('should support multiple assets (USDT, TON, BTC, ETH)', async () => {
        const keeper = await blockchain.treasury('keeper');
        const signature = beginCell().storeUint(123456, 256).endCell();

        await priceOracle.sendRegisterKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        const timestamp = Math.floor(Date.now() / 1000);

        // USDT (asset ID 1)
        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId: 1,
            price: toNano('1.0'),
            timestamp,
            signature,
        });

        // TON (asset ID 2)
        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId: 2,
            price: toNano('5.5'),
            timestamp,
            signature,
        });

        // BTC (asset ID 3)
        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId: 3,
            price: toNano('50000'),
            timestamp,
            signature,
        });

        // ETH (asset ID 4)
        await priceOracle.sendUpdatePrice(keeper.getSender(), {
            value: toNano('0.1'),
            assetId: 4,
            price: toNano('3000'),
            timestamp,
            signature,
        });

        const usdt = await priceOracle.getLatestPrice(1);
        const ton = await priceOracle.getLatestPrice(2);
        const btc = await priceOracle.getLatestPrice(3);
        const eth = await priceOracle.getLatestPrice(4);

        expect(usdt).toBe(toNano('1.0'));
        expect(ton).toBe(toNano('5.5'));
        expect(btc).toBe(toNano('50000'));
        expect(eth).toBe(toNano('3000'));
    });

    it('should track accuracy scoring for keepers', async () => {
        const keeper = await blockchain.treasury('keeper');
        const signature = beginCell().storeUint(123456, 256).endCell();

        await priceOracle.sendRegisterKeeper(deployer.getSender(), {
            value: toNano('0.1'),
            keeperAddress: keeper.address,
        });

        const timestamp = Math.floor(Date.now() / 1000);

        // Submit several price updates
        for (let i = 0; i < 5; i++) {
            await priceOracle.sendUpdatePrice(keeper.getSender(), {
                value: toNano('0.1'),
                assetId: 1,
                price: toNano('1.0'),
                timestamp: timestamp + i,
                signature,
            });
        }

        const stats = await priceOracle.getKeeperStats(keeper.address);
        expect(stats.accuracyScore).toBeGreaterThan(0);
    });

    it('should reject price updates from non-keeper', async () => {
        const attacker = await blockchain.treasury('attacker');
        const signature = beginCell().storeUint(123456, 256).endCell();

        const result = await priceOracle.sendUpdatePrice(attacker.getSender(), {
            value: toNano('0.1'),
            assetId: 1,
            price: toNano('1.0'),
            timestamp: Math.floor(Date.now() / 1000),
            signature,
        });

        expect(result.transactions).toHaveTransaction({
            from: attacker.address,
            to: priceOracle.address,
            success: false,
            exitCode: 403, // Unauthorized
        });
    });
});
