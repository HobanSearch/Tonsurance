"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartContractOracleAdapter = void 0;
exports.smartContractOracleAdapterConfigToCell = smartContractOracleAdapterConfigToCell;
const core_1 = require("@ton/core");
function smartContractOracleAdapterConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeAddress(config.keeperAddress)
        .storeDict(null) // contract_registry
        .storeDict(null) // exploit_events
        .storeUint(0, 32) // total_exploits_tracked
        .endCell();
}
class SmartContractOracleAdapter {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new SmartContractOracleAdapter(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = smartContractOracleAdapterConfigToCell(config);
        const init = { code, data };
        return new SmartContractOracleAdapter((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendReportExploit(provider, via, contractAddress, chainId, exploitTimestamp, stolenAmount, txHashHigh, txHashLow, monitoringSources, contractType) {
        await provider.internal(via, {
            value: (0, core_1.toNano)('0.1'),
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x12, 32) // OP_REPORT_EXPLOIT
                .storeAddress(contractAddress)
                .storeUint(chainId, 8)
                .storeUint(exploitTimestamp, 32)
                .storeCoins(stolenAmount)
                .storeUint(txHashHigh, 128)
                .storeUint(txHashLow, 128)
                .storeUint(monitoringSources, 8)
                .storeUint(contractType, 8)
                .endCell(),
        });
    }
    async sendUpdateContractStatus(provider, via, contractAddress, status, currentTvl) {
        await provider.internal(via, {
            value: (0, core_1.toNano)('0.05'),
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x13, 32) // OP_UPDATE_CONTRACT_STATUS
                .storeAddress(contractAddress)
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
    async getContractInfo(provider, contractAddress) {
        const result = await provider.get('get_contract_info', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(contractAddress).endCell() }
        ]);
        const status = result.stack.readNumber();
        const tvl = result.stack.readBigNumber();
        const lastUpdate = result.stack.readNumber();
        const found = result.stack.readNumber() !== 0;
        return { status, tvl, lastUpdate, found };
    }
}
exports.SmartContractOracleAdapter = SmartContractOracleAdapter;
