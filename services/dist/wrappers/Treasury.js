"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Treasury = void 0;
exports.treasuryConfigToCell = treasuryConfigToCell;
const core_1 = require("@ton/core");
function treasuryConfigToCell(config) {
    // Split storage to avoid BitBuilder overflow
    // Main cell: owner + stats + first extra address
    // Ref cell 1: vault and staking addresses
    // Ref cell 2: tranche yield tracking
    const addressesRef = (0, core_1.beginCell)()
        .storeAddress(config.multiTrancheVaultAddress)
        .storeAddress(config.stakingPoolAddress)
        .endCell();
    const yieldRef = (0, core_1.beginCell)()
        .storeCoins(config.btcYieldDistributed)
        .storeCoins(config.snrYieldDistributed)
        .storeCoins(config.mezzYieldDistributed)
        .storeCoins(config.jnrYieldDistributed)
        .storeCoins(config.jnrPlusYieldDistributed)
        .storeCoins(config.eqtYieldDistributed)
        .endCell();
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeCoins(config.totalPremiumsCollected)
        .storeCoins(config.totalPayoutsMade)
        .storeCoins(config.reserveBalance)
        .storeAddress(config.claimsProcessorAddress)
        .storeRef(addressesRef)
        .storeRef(yieldRef)
        .endCell();
}
class Treasury {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new Treasury(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = treasuryConfigToCell(config);
        const init = { code, data };
        return new Treasury((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async getTreasuryStats(provider) {
        const result = await provider.get('get_treasury_stats', []);
        return {
            totalPremiums: result.stack.readBigNumber(),
            totalPayouts: result.stack.readBigNumber(),
            reserveBalance: result.stack.readBigNumber(),
        };
    }
    async getReserveBalance(provider) {
        const result = await provider.get('get_reserve_balance', []);
        return result.stack.readBigNumber();
    }
    async getAllTrancheYields(provider) {
        const result = await provider.get('get_all_tranche_yields', []);
        return {
            btc: result.stack.readBigNumber(),
            snr: result.stack.readBigNumber(),
            mezz: result.stack.readBigNumber(),
            jnr: result.stack.readBigNumber(),
            jnrPlus: result.stack.readBigNumber(),
            eqt: result.stack.readBigNumber(),
        };
    }
    async getTotalYieldDistributed(provider) {
        const result = await provider.get('get_total_yield_distributed', []);
        return result.stack.readBigNumber();
    }
    async getBtcYieldDistributed(provider) {
        const result = await provider.get('get_btc_yield_distributed', []);
        return result.stack.readBigNumber();
    }
    async getSnrYieldDistributed(provider) {
        const result = await provider.get('get_snr_yield_distributed', []);
        return result.stack.readBigNumber();
    }
    async getMezzYieldDistributed(provider) {
        const result = await provider.get('get_mezz_yield_distributed', []);
        return result.stack.readBigNumber();
    }
    async getJnrYieldDistributed(provider) {
        const result = await provider.get('get_jnr_yield_distributed', []);
        return result.stack.readBigNumber();
    }
    async getJnrPlusYieldDistributed(provider) {
        const result = await provider.get('get_jnr_plus_yield_distributed', []);
        return result.stack.readBigNumber();
    }
    async getEqtYieldDistributed(provider) {
        const result = await provider.get('get_eqt_yield_distributed', []);
        return result.stack.readBigNumber();
    }
    async getMultiTrancheVault(provider) {
        const result = await provider.get('get_multi_tranche_vault', []);
        return result.stack.readAddress();
    }
}
exports.Treasury = Treasury;
