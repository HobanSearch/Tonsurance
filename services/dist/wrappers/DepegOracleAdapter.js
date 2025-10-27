"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DepegOracleAdapter = void 0;
exports.depegOracleAdapterConfigToCell = depegOracleAdapterConfigToCell;
const core_1 = require("@ton/core");
function depegOracleAdapterConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeAddress(config.keeperAddress)
        .storeDict(null) // price_data
        .storeUint(0, 32) // last_update_timestamp
        .endCell();
}
class DepegOracleAdapter {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new DepegOracleAdapter(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = depegOracleAdapterConfigToCell(config);
        const init = { code, data };
        return new DepegOracleAdapter((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendUpdatePrice(provider, via, stablecoinId, timestamp, price, sourceBitmap) {
        await provider.internal(via, {
            value: (0, core_1.toNano)('0.05'),
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x12, 32) // OP_UPDATE_PRICE
                .storeUint(stablecoinId, 8)
                .storeUint(timestamp, 32)
                .storeUint(price, 64)
                .storeUint(sourceBitmap, 8)
                .endCell(),
        });
    }
    async sendBatchUpdatePrices(provider, via, updates) {
        const body = (0, core_1.beginCell)()
            .storeUint(0x13, 32) // OP_BATCH_UPDATE_PRICES
            .storeUint(updates.length, 16);
        updates.forEach(update => {
            body.storeUint(update.stablecoinId, 8)
                .storeUint(update.timestamp, 32)
                .storeUint(update.price, 64)
                .storeUint(update.sourceBitmap, 8);
        });
        await provider.internal(via, {
            value: (0, core_1.toNano)('0.1'),
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: body.endCell(),
        });
    }
    async sendSetClaimsProcessor(provider, via, newProcessor) {
        await provider.internal(via, {
            value: (0, core_1.toNano)('0.05'),
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x10, 32) // OP_SET_CLAIMS_PROCESSOR
                .storeAddress(newProcessor)
                .endCell(),
        });
    }
    async sendSetKeeper(provider, via, newKeeper) {
        await provider.internal(via, {
            value: (0, core_1.toNano)('0.05'),
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x11, 32) // OP_SET_KEEPER
                .storeAddress(newKeeper)
                .endCell(),
        });
    }
    async getOwner(provider) {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }
    async getClaimsProcessor(provider) {
        const result = await provider.get('get_claims_processor', []);
        return result.stack.readAddress();
    }
    async getKeeper(provider) {
        const result = await provider.get('get_keeper', []);
        return result.stack.readAddress();
    }
    async getLastUpdate(provider) {
        const result = await provider.get('get_last_update', []);
        return result.stack.readNumber();
    }
    async getPrice(provider, stablecoinId, timestamp) {
        const result = await provider.get('get_price', [
            { type: 'int', value: BigInt(stablecoinId) },
            { type: 'int', value: BigInt(timestamp) }
        ]);
        const price = result.stack.readBigNumber();
        const sourceBitmap = result.stack.readNumber();
        const found = result.stack.readNumber() !== 0;
        return { price, sourceBitmap, found };
    }
}
exports.DepegOracleAdapter = DepegOracleAdapter;
