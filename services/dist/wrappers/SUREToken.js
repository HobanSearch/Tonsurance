"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUREToken = void 0;
exports.sureTokenConfigToCell = sureTokenConfigToCell;
const core_1 = require("@ton/core");
function sureTokenConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeCoins(config.totalSupply)
        .storeInt(config.mintable ? -1 : 0, 1)
        .storeAddress(config.adminAddress)
        .storeRef(config.jettonWalletCode)
        .storeRef(config.content)
        .endCell();
}
class SUREToken {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new SUREToken(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = sureTokenConfigToCell(config);
        const init = { code, data };
        return new SUREToken((0, core_1.contractAddress)(workchain, init), init);
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
                .storeUint(21, 32) // op: mint
                .storeAddress(opts.toAddress)
                .storeCoins(opts.amount)
                .storeAddress(opts.responseAddress)
                .endCell(),
        });
    }
    async getJettonData(provider) {
        const result = await provider.get('get_jetton_data', []);
        return {
            totalSupply: result.stack.readBigNumber(),
            mintable: result.stack.readBoolean(),
            adminAddress: result.stack.readAddress(),
            content: result.stack.readCell(),
            walletCode: result.stack.readCell(),
        };
    }
    async getWalletAddress(provider, owner) {
        const result = await provider.get('get_wallet_address', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(owner).endCell() }
        ]);
        return result.stack.readAddress();
    }
}
exports.SUREToken = SUREToken;
