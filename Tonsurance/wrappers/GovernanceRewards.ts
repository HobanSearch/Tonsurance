import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type GovernanceRewardsConfig = {
    ownerAddress: Address;
    premiumDistributorAddress: Address;
    claimsProcessorAddress: Address;
    totalRewardsDistributed: bigint;
    totalRewardsPending: bigint;
    minVotingPower: bigint;
    participationBonusThreshold: number;
};

export function governanceRewardsConfigToCell(config: GovernanceRewardsConfig): Cell {
    return beginCell()
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

export class GovernanceRewards implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell }
    ) {}

    static createFromAddress(address: Address) {
        return new GovernanceRewards(address);
    }

    static createFromConfig(config: GovernanceRewardsConfig, code: Cell, workchain = 0) {
        const data = governanceRewardsConfigToCell(config);
        const init = { code, data };
        return new GovernanceRewards(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendRegisterVoter(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            voterAddress: Address;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x01, 32) // op: register_voter
                .storeAddress(opts.voterAddress)
                .endCell(),
        });
    }

    async sendRecordVote(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            voterAddress: Address;
            votingPower: bigint;
            votedWithMajority: boolean;
            participationRate: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x02, 32) // op: record_vote
                .storeAddress(opts.voterAddress)
                .storeCoins(opts.votingPower)
                .storeUint(opts.votedWithMajority ? 1 : 0, 1)
                .storeUint(opts.participationRate, 16)
                .endCell(),
        });
    }

    async sendReceiveGovernanceShare(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            amount: bigint;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x05, 32) // op: receive_governance_share
                .storeCoins(opts.amount)
                .endCell(),
        });
    }

    async sendClaimRewards(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(0x03, 32) // op: claim_rewards
                .endCell(),
        });
    }

    async getVoterStats(provider: ContractProvider, voter: Address): Promise<{
        totalEarned: bigint;
        voteCount: number;
        participationRate: number;
    }> {
        const result = await provider.get('get_voter_stats', [
            { type: 'slice', cell: beginCell().storeAddress(voter).endCell() }
        ]);
        return {
            totalEarned: result.stack.readBigNumber(),
            voteCount: result.stack.readNumber(),
            participationRate: result.stack.readNumber(),
        };
    }

    async getPendingRewards(provider: ContractProvider, voter: Address): Promise<bigint> {
        const result = await provider.get('get_pending_rewards', [
            { type: 'slice', cell: beginCell().storeAddress(voter).endCell() }
        ]);
        return result.stack.readBigNumber();
    }

    async getRewardsSummary(provider: ContractProvider): Promise<{
        totalDistributed: bigint;
        totalPending: bigint;
    }> {
        const result = await provider.get('get_rewards_summary', []);
        return {
            totalDistributed: result.stack.readBigNumber(),
            totalPending: result.stack.readBigNumber(),
        };
    }

    async getMinVotingPower(provider: ContractProvider): Promise<bigint> {
        const result = await provider.get('get_min_voting_power', []);
        return result.stack.readBigNumber();
    }
}
