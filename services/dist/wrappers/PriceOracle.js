"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceOracle = void 0;
exports.priceOracleConfigToCell = priceOracleConfigToCell;
const core_1 = require("@ton/core");
function priceOracleConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.oracleRewardsAddress)
        .storeDict(null) // price_feeds
        .storeDict(null) // oracle_keepers
        .storeUint(config.minOracleCount, 8)
        .storeUint(config.maxPriceAge, 32)
        .endCell();
}
class PriceOracle {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new PriceOracle(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = priceOracleConfigToCell(config);
        const init = { code, data };
        return new PriceOracle((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendRegisterKeeper(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x01, 32) // op: register_keeper
                .storeAddress(opts.keeperAddress)
                .endCell(),
        });
    }
    async sendUpdatePrice(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x02, 32) // op: update_price
                .storeUint(opts.assetId, 8)
                .storeCoins(opts.price)
                .storeUint(opts.timestamp, 32)
                .storeRef(opts.signature)
                .endCell(),
        });
    }
    async sendDeactivateKeeper(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x10, 32) // op: deactivate_keeper
                .storeAddress(opts.keeperAddress)
                .endCell(),
        });
    }
    async getPrice(provider, assetId) {
        const result = await provider.get('get_price', [
            { type: 'int', value: BigInt(assetId) }
        ]);
        return {
            price: result.stack.readBigNumber(),
            timestamp: result.stack.readNumber(),
            isStale: result.stack.readBoolean(),
        };
    }
    async getLatestPrice(provider, assetId) {
        const result = await provider.get('get_latest_price', [
            { type: 'int', value: BigInt(assetId) }
        ]);
        return result.stack.readBigNumber();
    }
    async isPriceStale(provider, assetId) {
        const result = await provider.get('is_price_stale', [
            { type: 'int', value: BigInt(assetId) }
        ]);
        return result.stack.readBoolean();
    }
    async getKeeperStats(provider, keeper) {
        const result = await provider.get('get_keeper_stats', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(keeper).endCell() }
        ]);
        return {
            updateCount: result.stack.readNumber(),
            accuracyScore: result.stack.readNumber(),
            isActive: result.stack.readBoolean(),
        };
    }
    async getMinOracleCount(provider) {
        const result = await provider.get('get_min_oracle_count', []);
        return result.stack.readNumber();
    }
    async getMaxPriceAge(provider) {
        const result = await provider.get('get_max_price_age', []);
        return result.stack.readNumber();
    }
}
exports.PriceOracle = PriceOracle;
