"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleRewards = void 0;
exports.oracleRewardsConfigToCell = oracleRewardsConfigToCell;
const core_1 = require("@ton/core");
function oracleRewardsConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.premiumDistributorAddress)
        .storeDict(null) // oracle_registry
        .storeDict(null) // pending_rewards
        .storeCoins(config.totalRewardsDistributed)
        .storeCoins(config.totalRewardsPending)
        .storeUint(config.minUpdateInterval, 32)
        .storeUint(config.accuracyThreshold, 16)
        .endCell();
}
class OracleRewards {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new OracleRewards(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = oracleRewardsConfigToCell(config);
        const init = { code, data };
        return new OracleRewards((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendRegisterOracle(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x01, 32) // op: register_oracle
                .storeAddress(opts.oracleAddress)
                .endCell(),
        });
    }
    async sendRecordOracleUpdate(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x02, 32) // op: record_oracle_update
                .storeAddress(opts.oracleAddress)
                .storeUint(opts.accuracyScore, 16)
                .storeUint(opts.isStale ? 1 : 0, 1)
                .endCell(),
        });
    }
    async sendDistributeOracleFee(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x04, 32) // op: distribute_oracle_fee
                .storeCoins(opts.amount)
                .endCell(),
        });
    }
    async sendClaimRewards(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x03, 32) // op: claim_rewards
                .endCell(),
        });
    }
    async getOracleStats(provider, oracle) {
        const result = await provider.get('get_oracle_stats', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(oracle).endCell() }
        ]);
        return {
            totalEarned: result.stack.readBigNumber(),
            updateCount: result.stack.readNumber(),
            accuracyScore: result.stack.readNumber(),
        };
    }
    async getPendingRewards(provider, oracle) {
        const result = await provider.get('get_pending_rewards', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(oracle).endCell() }
        ]);
        return result.stack.readBigNumber();
    }
    async getRewardsSummary(provider) {
        const result = await provider.get('get_rewards_summary', []);
        return {
            totalDistributed: result.stack.readBigNumber(),
            totalPending: result.stack.readBigNumber(),
        };
    }
}
exports.OracleRewards = OracleRewards;
