"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JettonWallet = void 0;
exports.jettonWalletConfigToCell = jettonWalletConfigToCell;
const core_1 = require("@ton/core");
function jettonWalletConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeCoins(config.balance)
        .storeAddress(config.ownerAddress)
        .storeAddress(config.jettonMasterAddress)
        .storeRef(config.jettonWalletCode)
        .endCell();
}
class JettonWallet {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new JettonWallet(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = jettonWalletConfigToCell(config);
        const init = { code, data };
        return new JettonWallet((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendTransfer(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0xf8a7ea5, 32) // op: transfer
                .storeUint(opts.queryId || 0, 64)
                .storeCoins(opts.amount)
                .storeAddress(opts.toAddress)
                .storeAddress(opts.responseAddress || null)
                .storeDict(null) // custom_payload
                .storeCoins(opts.forwardAmount || 0n)
                .storeDict(opts.forwardPayload || null)
                .endCell(),
        });
    }
    async sendBurn(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x595f07bc, 32) // op: burn
                .storeUint(opts.queryId || 0, 64)
                .storeCoins(opts.amount)
                .storeAddress(opts.responseAddress || null)
                .endCell(),
        });
    }
    async getWalletData(provider) {
        const result = await provider.get('get_wallet_data', []);
        return {
            balance: result.stack.readBigNumber(),
            ownerAddress: result.stack.readAddress(),
            jettonMasterAddress: result.stack.readAddress(),
            jettonWalletCode: result.stack.readCell(),
        };
    }
}
exports.JettonWallet = JettonWallet;
