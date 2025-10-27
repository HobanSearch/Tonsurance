"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SURE_MEZZ = void 0;
exports.sure_mezz_ConfigToCell = sure_mezz_ConfigToCell;
const core_1 = require("@ton/core");
function sure_mezz_ConfigToCell(config) {
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
class SURE_MEZZ {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new SURE_MEZZ(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = sure_mezz_ConfigToCell(config);
        const init = { code, data };
        return new SURE_MEZZ((0, core_1.contractAddress)(workchain, init), init);
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
        // SURE-MEZZ has 30-day lock (2592000 seconds)
        return 2592000;
    }
    async getUnlockTime(provider, user) {
        const result = await provider.get('get_unlock_time', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(user).endCell() }
        ]);
        return result.stack.readNumber();
    }
    async isUnlocked(provider, user) {
        const unlockTime = await this.getUnlockTime(provider, user);
        return Math.floor(Date.now() / 1000) >= unlockTime;
    }
}
exports.SURE_MEZZ = SURE_MEZZ;
