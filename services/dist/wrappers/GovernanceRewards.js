"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GovernanceRewards = void 0;
exports.governanceRewardsConfigToCell = governanceRewardsConfigToCell;
const core_1 = require("@ton/core");
function governanceRewardsConfigToCell(config) {
    return (0, core_1.beginCell)()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.premiumDistributorAddress)
        .storeAddress(config.claimsProcessorAddress)
        .storeDict(null) // voter_registry
        .storeDict(null) // pending_rewards
        .storeCoins(config.totalRewardsDistributed)
        .storeCoins(config.totalRewardsPending)
        .storeCoins(config.minVotingPower)
        .storeUint(config.participationBonusThreshold, 16)
        .endCell();
}
class GovernanceRewards {
    constructor(address, init) {
        this.address = address;
        this.init = init;
    }
    static createFromAddress(address) {
        return new GovernanceRewards(address);
    }
    static createFromConfig(config, code, workchain = 0) {
        const data = governanceRewardsConfigToCell(config);
        const init = { code, data };
        return new GovernanceRewards((0, core_1.contractAddress)(workchain, init), init);
    }
    async sendDeploy(provider, via, value) {
        await provider.internal(via, {
            value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)().endCell(),
        });
    }
    async sendRegisterVoter(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x01, 32) // op: register_voter
                .storeAddress(opts.voterAddress)
                .endCell(),
        });
    }
    async sendRecordVote(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x02, 32) // op: record_vote
                .storeAddress(opts.voterAddress)
                .storeCoins(opts.votingPower)
                .storeUint(opts.votedWithMajority ? 1 : 0, 1)
                .storeUint(opts.participationRate, 16)
                .endCell(),
        });
    }
    async sendReceiveGovernanceShare(provider, via, opts) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: core_1.SendMode.PAY_GAS_SEPARATELY,
            body: (0, core_1.beginCell)()
                .storeUint(0x05, 32) // op: receive_governance_share
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
    async getVoterStats(provider, voter) {
        const result = await provider.get('get_voter_stats', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(voter).endCell() }
        ]);
        return {
            totalEarned: result.stack.readBigNumber(),
            voteCount: result.stack.readNumber(),
            participationRate: result.stack.readNumber(),
        };
    }
    async getPendingRewards(provider, voter) {
        const result = await provider.get('get_pending_rewards', [
            { type: 'slice', cell: (0, core_1.beginCell)().storeAddress(voter).endCell() }
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
    async getMinVotingPower(provider) {
        const result = await provider.get('get_min_voting_power', []);
        return result.stack.readBigNumber();
    }
}
exports.GovernanceRewards = GovernanceRewards;
