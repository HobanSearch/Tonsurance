import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type PolicyRouterConfig = {
    ownerAddress: Address;
    nextPolicyId: bigint;
    totalPolicies: bigint;
    paused: boolean;
    shardAddresses: Cell | null;
    treasuryAddress: Address;
    pendingTxs: Cell | null;
    seqNo: number;
};
export declare function policyRouterConfigToCell(config: PolicyRouterConfig): Cell;
export declare class PolicyRouter implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): PolicyRouter;
    static createFromConfig(config: PolicyRouterConfig, code: Cell, workchain?: number): PolicyRouter;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    /**
     * Create a new policy (routes to appropriate shard)
     * @param via Sender
     * @param value Premium amount + gas (0.3 TON recommended)
     * @param opts Policy parameters
     */
    sendCreatePolicy(provider: ContractProvider, via: Sender, value: bigint, opts: {
        coverageType: number;
        chainId: number;
        stablecoinId: number;
        coverageAmount: bigint;
        durationDays: number;
    }): Promise<void>;
    /**
     * Cancel an active policy (must be owner)
     */
    sendCancelPolicy(provider: ContractProvider, via: Sender, value: bigint, policyId: bigint): Promise<void>;
    sendPause(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendUnpause(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendRegisterShard(provider: ContractProvider, via: Sender, value: bigint, shardId: number, shardAddress: Address): Promise<void>;
    sendSetTreasury(provider: ContractProvider, via: Sender, value: bigint, newTreasury: Address): Promise<void>;
    /**
     * Get the address of a specific shard
     */
    getShardAddress(provider: ContractProvider, shardId: number): Promise<Address>;
    /**
     * Get shard ID and address for a given policy ID
     */
    getShardForPolicy(provider: ContractProvider, policyId: bigint): Promise<{
        shardId: number;
        shardAddress: Address;
    }>;
    /**
     * Get the next policy ID that will be assigned
     */
    getNextPolicyId(provider: ContractProvider): Promise<bigint>;
    /**
     * Get total number of policies across all shards
     */
    getTotalPolicies(provider: ContractProvider): Promise<bigint>;
    getPaused(provider: ContractProvider): Promise<boolean>;
    getOwner(provider: ContractProvider): Promise<Address>;
    getTreasury(provider: ContractProvider): Promise<Address>;
    getSeqNo(provider: ContractProvider): Promise<bigint>;
    /**
     * Calculate which shard a policy ID belongs to
     */
    static calculateShardId(policyId: bigint): number;
}
