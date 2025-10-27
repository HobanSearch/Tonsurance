import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type PolicyShardConfig = {
    shardId: number;
    routerAddress: Address;
    ownerAddress: Address;
    claimsProcessorAddress: Address;
    shardPolicyCount: number;
    paused: boolean;
    policiesDict: Cell | null;
};
export declare function policyShardConfigToCell(config: PolicyShardConfig): Cell;
export interface PolicyData {
    policyId: bigint;
    userAddress: Address;
    coverageType: number;
    chainId: number;
    stablecoinId: number;
    coverageAmount: bigint;
    startTime: bigint;
    endTime: bigint;
    active: boolean;
    claimed: boolean;
    premium: bigint;
}
export declare class PolicyShard implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): PolicyShard;
    static createFromConfig(config: PolicyShardConfig, code: Cell, workchain?: number): PolicyShard;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    /**
     * Mark policy as claimed (only ClaimsProcessor can call)
     */
    sendMarkClaimed(provider: ContractProvider, via: Sender, value: bigint, policyId: bigint): Promise<void>;
    /**
     * Deactivate policy (cancellation/expiry)
     */
    sendDeactivatePolicy(provider: ContractProvider, via: Sender, value: bigint, policyId: bigint): Promise<void>;
    sendPause(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendUnpause(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendSetClaimsProcessor(provider: ContractProvider, via: Sender, value: bigint, newProcessor: Address): Promise<void>;
    /**
     * Get full policy data
     */
    getPolicyData(provider: ContractProvider, policyId: bigint): Promise<PolicyData>;
    /**
     * Get policy status (active/claimed)
     */
    getPolicyStatus(provider: ContractProvider, policyId: bigint): Promise<{
        exists: boolean;
        active: boolean;
        claimed: boolean;
        expired: boolean;
    }>;
    /**
     * Get user's policies in this shard
     */
    getUserPolicies(provider: ContractProvider, userAddress: Address): Promise<{
        policyIds: bigint[];
        count: number;
    }>;
    /**
     * Get this shard's ID
     */
    getShardId(provider: ContractProvider): Promise<number>;
    /**
     * Get number of policies in this shard
     */
    getPolicyCount(provider: ContractProvider): Promise<bigint>;
    getPaused(provider: ContractProvider): Promise<boolean>;
    getOwner(provider: ContractProvider): Promise<Address>;
    getRouter(provider: ContractProvider): Promise<Address>;
    getClaimsProcessor(provider: ContractProvider): Promise<Address>;
    /**
     * Check if a policy exists in this shard
     */
    policyExists(provider: ContractProvider, policyId: bigint): Promise<boolean>;
    /**
     * Verify that a policy ID belongs to this shard
     */
    static validateShardAssignment(policyId: bigint, shardId: number): boolean;
}
