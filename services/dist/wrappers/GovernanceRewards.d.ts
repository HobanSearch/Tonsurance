import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type GovernanceRewardsConfig = {
    ownerAddress: Address;
    premiumDistributorAddress: Address;
    claimsProcessorAddress: Address;
    totalRewardsDistributed: bigint;
    totalRewardsPending: bigint;
    minVotingPower: bigint;
    participationBonusThreshold: number;
};
export declare function governanceRewardsConfigToCell(config: GovernanceRewardsConfig): Cell;
export declare class GovernanceRewards implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): GovernanceRewards;
    static createFromConfig(config: GovernanceRewardsConfig, code: Cell, workchain?: number): GovernanceRewards;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendRegisterVoter(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        voterAddress: Address;
    }): Promise<void>;
    sendRecordVote(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        voterAddress: Address;
        votingPower: bigint;
        votedWithMajority: boolean;
        participationRate: number;
    }): Promise<void>;
    sendReceiveGovernanceShare(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        amount: bigint;
    }): Promise<void>;
    sendClaimRewards(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    getVoterStats(provider: ContractProvider, voter: Address): Promise<{
        totalEarned: bigint;
        voteCount: number;
        participationRate: number;
    }>;
    getPendingRewards(provider: ContractProvider, voter: Address): Promise<bigint>;
    getRewardsSummary(provider: ContractProvider): Promise<{
        totalDistributed: bigint;
        totalPending: bigint;
    }>;
    getMinVotingPower(provider: ContractProvider): Promise<bigint>;
}
