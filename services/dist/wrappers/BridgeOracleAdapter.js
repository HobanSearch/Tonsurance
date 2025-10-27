"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeOracleAdapter = void 0;
exports.bridgeOracleAdapterConfigToCell = bridgeOracleAdapterConfigToCell;
const core_1 = require("@ton/core");
function bridgeOracleAdapterConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeAddress(config.keeperAddress)
        .storeDict(null) // bridge_registry
        .storeDict(null) // exploit_events
        .storeUint(0, 32) // total_exploits_tracked
        .endCell();
}
class BridgeOracleAdapter {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new BridgeOracleAdapter(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = bridgeOracleAdapterConfigToCell(config);
        const init = { code, data };
        return new BridgeOracleAdapter((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendReportExploit(provider, via, bridgeAddress, exploitTimestamp, stolenAmount, txHashHigh, txHashLow, monitoringSources) {
        await provider.internal(via, {
            value: (0, core_1.toNano)('0.1'),
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x12, 32) // OP_REPORT_EXPLOIT
                .storeAddress(bridgeAddress)
                .storeUint(exploitTimestamp, 32)
                .storeCoins(stolenAmount)
                .storeUint(txHashHigh, 128)
                .storeUint(txHashLow, 128)
                .storeUint(monitoringSources, 8)
                .endCell(),
        });
    }
    async sendUpdateBridgeStatus(provider, via, bridgeAddress, status, currentTvl) {
        await provider.internal(via, {
            value: (0, core_1.toNano)('0.05'),
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x13, 32) // OP_UPDATE_BRIDGE_STATUS
                .storeAddress(bridgeAddress)
                .storeUint(status, 8)
                .storeCoins(currentTvl)
                .endCell(),
        });
    }
    async getOwner(provider) {
        const result = await provider.get('get_owner', []);
        return result.stack.readAddress();
    }
    async getTotalExploits(provider) {
        const result = await provider.get('get_total_exploits', []);
        return result.stack.readNumber();
    }
    async getBridgeInfo(provider, bridgeAddress) {
        const result = await provider.get('get_bridge_info', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(bridgeAddress).endCell() }
        ]);
        const status = result.stack.readNumber();
        const tvl = result.stack.readBigNumber();
        const lastUpdate = result.stack.readNumber();
        const found = result.stack.readNumber() !== 0;
        return { status, tvl, lastUpdate, found };
    }
    async getExploitInfo(provider, bridgeAddress, timestamp) {
        const result = await provider.get('get_exploit_info', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(bridgeAddress).endCell() },
            { type: 'int', value: BigInt(timestamp) }
        ]);
        const stolenAmount = result.stack.readBigNumber();
        const monitoringSources = result.stack.readNumber();
        const reportedAt = result.stack.readNumber();
        const found = result.stack.readNumber() !== 0;
        return { stolenAmount, monitoringSources, reportedAt, found };
    }
}
exports.BridgeOracleAdapter = BridgeOracleAdapter;
