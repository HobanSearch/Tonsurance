import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type ReferralManagerConfig = {
    ownerAddress: Address;
    totalReferralRewardsDistributed: bigint;
};
export declare function referralManagerConfigToCell(config: ReferralManagerConfig): Cell;
export declare class ReferralManager implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): ReferralManager;
    static createFromConfig(config: ReferralManagerConfig, code: Cell, workchain?: number): ReferralManager;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendRegisterReferral(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        userAddress: Address;
        referrerAddress: Address;
    }): Promise<void>;
    sendDistributeReferralRewards(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        totalAmount: bigint;
        userAddress: Address;
        policyId: bigint;
    }): Promise<void>;
    getReferrerStats(provider: ContractProvider, referrer: Address): Promise<{
        totalEarned: bigint;
        referralCount: number;
    }>;
    getDirectReferrer(provider: ContractProvider, user: Address): Promise<Address | null>;
    getFullChain(provider: ContractProvider, user: Address): Promise<{
        level1: Address | null;
        level2: Address | null;
        level3: Address | null;
        level4: Address | null;
        level5: Address | null;
        chainLength: number;
    }>;
    getTotalReferralRewards(provider: ContractProvider): Promise<bigint>;
}
