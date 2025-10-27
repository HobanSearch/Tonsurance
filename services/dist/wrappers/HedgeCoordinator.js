"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HedgeCoordinator = exports.HedgeStatus = exports.VenueType = void 0;
exports.hedgeCoordinatorConfigToCell = hedgeCoordinatorConfigToCell;
const core_1 = require("@ton/core");
var VenueType;
(function (VenueType) {
    VenueType[VenueType["POLYMARKET"] = 1] = "POLYMARKET";
    VenueType[VenueType["PERPETUALS"] = 2] = "PERPETUALS";
    VenueType[VenueType["ALLIANZ"] = 3] = "ALLIANZ";
})(VenueType || (exports.VenueType = VenueType = {}));
var HedgeStatus;
(function (HedgeStatus) {
    HedgeStatus[HedgeStatus["PENDING"] = 0] = "PENDING";
    HedgeStatus[HedgeStatus["FILLED"] = 1] = "FILLED";
    HedgeStatus[HedgeStatus["FAILED"] = 2] = "FAILED";
    HedgeStatus[HedgeStatus["LIQUIDATING"] = 3] = "LIQUIDATING";
    HedgeStatus[HedgeStatus["LIQUIDATED"] = 4] = "LIQUIDATED";
})(HedgeStatus || (exports.HedgeStatus = HedgeStatus = {}));
function hedgeCoordinatorConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.adminAddress)
        .storeAddress(config.factoryAddress)
        .storeDict(null) // authorized_keepers initially empty
        .storeDict(null) // hedge_positions initially empty
        .storeDict(null) // liquidations initially empty
        .endCell();
}
class HedgeCoordinator {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new HedgeCoordinator(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = hedgeCoordinatorConfigToCell(config);
        const init = { code, data };
        return new HedgeCoordinator((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendRegisterHedge(provider, via, opts) {
        // Convert external ID to 256-bit hash
        const externalIdHash = BigInt('0x' + Buffer.from(opts.externalId).toString('hex').padEnd(64, '0').slice(0, 64));
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x72656768, 32) // op::register_hedge
                .storeUint(opts.policyId, 64)
                .storeUint(opts.venueId, 8)
                .storeCoins(opts.amount)
                .storeUint(externalIdHash, 256)
                .storeUint(opts.status, 8)
                .endCell(),
        });
    }
    async sendLiquidateHedges(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x6c697164, 32) // op::liquidate_hedges
                .storeUint(opts.policyId, 64)
                .storeAddress(opts.polymarketKeeper)
                .storeAddress(opts.perpKeeper)
                .storeAddress(opts.allianzKeeper)
                .endCell(),
        });
    }
    async sendReportLiquidation(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x72706c64, 32) // op::report_liquidation
                .storeUint(opts.policyId, 64)
                .storeUint(opts.venueId, 8)
                .storeCoins(opts.proceeds)
                .storeAddress(opts.reserveVault)
                .endCell(),
        });
    }
    async sendUpdateFactory(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x75706466, 32) // op::update_factory
                .storeAddress(opts.factoryAddress)
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
    async getHedgePosition(provider, policyId) {
        const result = await provider.get('get_hedge_position', [
            { type: 'int', value: policyId },
        ]);
        return {
            polymarketStatus: Number(result.stack.readBigNumber()),
            polymarketAmount: result.stack.readBigNumber(),
            perpetualsStatus: Number(result.stack.readBigNumber()),
            perpetualsAmount: result.stack.readBigNumber(),
            allianzStatus: Number(result.stack.readBigNumber()),
            allianzAmount: result.stack.readBigNumber(),
        };
    }
    async getLiquidationStatus(provider, policyId) {
        const result = await provider.get('get_liquidation_status', [
            { type: 'int', value: policyId },
        ]);
        return {
            timestamp: Number(result.stack.readBigNumber()),
            status: Number(result.stack.readBigNumber()),
            polymarketProceeds: result.stack.readBigNumber(),
            perpetualsProceeds: result.stack.readBigNumber(),
            allianzProceeds: result.stack.readBigNumber(),
        };
    }
    async getTotalLiquidationProceeds(provider, policyId) {
        const result = await provider.get('get_total_liquidation_proceeds', [
            { type: 'int', value: policyId },
        ]);
        return result.stack.readBigNumber();
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
    async getFactoryAddress(provider) {
        const result = await provider.get('get_factory_address', []);
        return result.stack.readAddress();
    }
}
exports.HedgeCoordinator = HedgeCoordinator;
