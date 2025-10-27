import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type OracleRewardsConfig = {
    ownerAddress: Address;
    premiumDistributorAddress: Address;
    totalRewardsDistributed: bigint;
    totalRewardsPending: bigint;
    minUpdateInterval: number;
    accuracyThreshold: number;
};
export declare function oracleRewardsConfigToCell(config: OracleRewardsConfig): Cell;
export declare class OracleRewards implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): OracleRewards;
    static createFromConfig(config: OracleRewardsConfig, code: Cell, workchain?: number): OracleRewards;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendRegisterOracle(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        oracleAddress: Address;
    }): Promise<void>;
    sendRecordOracleUpdate(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        oracleAddress: Address;
        accuracyScore: number;
        isStale: boolean;
    }): Promise<void>;
    sendDistributeOracleFee(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        amount: bigint;
    }): Promise<void>;
    sendClaimRewards(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    getOracleStats(provider: ContractProvider, oracle: Address): Promise<{
        totalEarned: bigint;
        updateCount: number;
        accuracyScore: number;
    }>;
    getPendingRewards(provider: ContractProvider, oracle: Address): Promise<bigint>;
    getRewardsSummary(provider: ContractProvider): Promise<{
        totalDistributed: bigint;
        totalPending: bigint;
    }>;
}
