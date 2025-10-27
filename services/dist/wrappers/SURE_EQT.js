"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SURE_EQT = void 0;
exports.sure_eqt_ConfigToCell = sure_eqt_ConfigToCell;
const core_1 = require("@ton/core");
function sure_eqt_ConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeCoins(config.total_supply)
        .storeUint(config.mintable ? 1 : 0, 1)
        .storeAddress(config.admin_address)
        .storeAddress(config.vault_address)
        .storeRef(config.jetton_wallet_code)
        .storeRef(config.content)
        .storeDict(null) // stake_locks initially empty
        .endCell();
}
class SURE_EQT {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new SURE_EQT(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = sure_eqt_ConfigToCell(config);
        const init = { code, data };
        return new SURE_EQT((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendMint(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x15, 32) // op::mint
                .storeUint(opts.query_id ?? 0, 64)
                .storeAddress(opts.to_address)
                .storeCoins(opts.amount)
                .storeAddress(opts.response_address)
                .endCell(),
        });
    }
    async getTotalSupply(provider) {
        const result = await provider.get('get_jetton_data', []);
        return result.stack.readBigNumber();
    }
    async getLockPeriod(provider) {
        // SURE-EQT has NO lock period
        return 0;
    }
    async isUnlocked(provider, user) {
        // EQT tokens are always unlocked (no lock-up period)
        return true;
    }
}
exports.SURE_EQT = SURE_EQT;
