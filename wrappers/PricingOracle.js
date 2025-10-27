"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingOracle = exports.CoverageType = void 0;
exports.pricingOracleConfigToCell = pricingOracleConfigToCell;
const core_1 = require("@ton/core");
var CoverageType;
(function (CoverageType) {
    CoverageType[CoverageType["DEPEG"] = 1] = "DEPEG";
    CoverageType[CoverageType["EXPLOIT"] = 2] = "EXPLOIT";
    CoverageType[CoverageType["BRIDGE"] = 3] = "BRIDGE";
})(CoverageType || (exports.CoverageType = CoverageType = {}));
function pricingOracleConfigToCell(config) {
    // Build authorized keepers dictionary
    let keepersDict = null;
    if (config.authorizedKeepers && config.authorizedKeepers.length > 0) {
        const dict = (0, core_1.beginCell)().endCell();
        // In production, would populate dict with keepers
        keepersDict = dict;
    }
    return (0, core_1.beginCell)()
        .storeAddress(config.adminAddress)
        .storeDict(keepersDict)
        .storeDict(null) // hedge_prices initially empty
        .storeUint(0, 32) // last_update_time = 0
        .endCell();
}
class PricingOracle {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new PricingOracle(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = pricingOracleConfigToCell(config);
        const init = { code, data };
        return new PricingOracle((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendUpdateHedgePrices(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x75706461, 32) // op::update_hedge_prices
                .storeUint(opts.coverageType, 8)
                .storeUint(opts.polymarketOdds, 32)
                .storeInt(opts.perpFundingRate, 32)
                .storeUint(opts.allianzQuote, 32)
                .endCell(),
        });
    }
    async sendAddKeeper(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x61646b70, 32) // op::add_keeper
                .storeAddress(opts.keeperAddress)
                .endCell(),
        });
    }
    async sendRemoveKeeper(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x726d6b70, 32) // op::remove_keeper
                .storeAddress(opts.keeperAddress)
                .endCell(),
        });
    }
    async getHedgePrices(provider, coverageType) {
        const result = await provider.get('get_hedge_prices', [
            { type: 'int', value: BigInt(coverageType) },
        ]);
        return {
            polymarketOdds: Number(result.stack.readBigNumber()),
            perpFundingRate: Number(result.stack.readBigNumber()),
            allianzQuote: Number(result.stack.readBigNumber()),
            timestamp: Number(result.stack.readBigNumber()),
        };
    }
    async calculateHedgeCost(provider, coverageType, coverageAmount, durationDays) {
        const result = await provider.get('calculate_hedge_cost', [
            { type: 'int', value: BigInt(coverageType) },
            { type: 'int', value: coverageAmount },
            { type: 'int', value: BigInt(durationDays) },
        ]);
        return result.stack.readBigNumber();
    }
    async getLastUpdateTime(provider) {
        const result = await provider.get('get_last_update_time', []);
        return Number(result.stack.readBigNumber());
    }
    async checkKeeperAuthorized(provider, keeperAddress) {
        const result = await provider.get('check_keeper_authorized', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(keeperAddress).endCell() },
        ]);
        return result.stack.readBoolean();
    }
    async getAdminAddress(provider) {
        const result = await provider.get('get_admin_address', []);
        return result.stack.readAddress();
    }
    async isDataFresh(provider) {
        const result = await provider.get('is_data_fresh', []);
        return result.stack.readBoolean();
    }
}
exports.PricingOracle = PricingOracle;
