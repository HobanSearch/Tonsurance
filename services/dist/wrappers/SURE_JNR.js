"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SURE_JNR = void 0;
exports.sure_jnr_ConfigToCell = sure_jnr_ConfigToCell;
const core_1 = require("@ton/core");
function sure_jnr_ConfigToCell(config) {
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
class SURE_JNR {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new SURE_JNR(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = sure_jnr_ConfigToCell(config);
        const init = { code, data };
        return new SURE_JNR((0, core_1.contractAddress)(workchain, init), init);
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
        // SURE-JNR has NO lock period
        return 0;
    }
    async isUnlocked(provider, user) {
        // JNR tokens are always unlocked (no lock-up period)
        return true;
    }
}
exports.SURE_JNR = SURE_JNR;
