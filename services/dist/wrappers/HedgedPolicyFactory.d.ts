import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type HedgedPolicyFactoryConfig = {
    adminAddress: Address;
    pricingOracle: Address;
    hedgeCoordinator: Address;
    primaryVault: Address;
    keepers: {
        polymarket: Address;
        perpetuals: Address;
        allianz: Address;
    };
};
export type PolicyDetails = {
    userAddress: Address;
    coverageType: number;
    coverageAmount: bigint;
    durationDays: number;
    totalPremium: bigint;
    createdAt: number;
    expiryTime: number;
    isActive: boolean;
};
export declare function hedgedPolicyFactoryConfigToCell(config: HedgedPolicyFactoryConfig): Cell;
export declare class HedgedPolicyFactory implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): HedgedPolicyFactory;
    static createFromConfig(config: HedgedPolicyFactoryConfig, code: Cell, workchain?: number): HedgedPolicyFactory;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendCreateHedgedPolicy(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        userAddress: Address;
        coverageType: number;
        coverageAmount: bigint;
        durationDays: number;
        expectedPremium: bigint;
        quoteTimestamp: number;
    }): Promise<void>;
    sendUpdateOracle(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        oracleAddress: Address;
    }): Promise<void>;
    sendUpdateCoordinator(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        coordinatorAddress: Address;
    }): Promise<void>;
    sendUpdateVault(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        vaultAddress: Address;
    }): Promise<void>;
    getPolicy(provider: ContractProvider, policyId: bigint): Promise<PolicyDetails>;
    getNextPolicyId(provider: ContractProvider): Promise<bigint>;
    getTotalCoverage(provider: ContractProvider): Promise<bigint>;
    getPoolUtilization(provider: ContractProvider): Promise<number>;
    getPricingOracle(provider: ContractProvider): Promise<Address>;
    getHedgeCoordinator(provider: ContractProvider): Promise<Address>;
    getAdminAddress(provider: ContractProvider): Promise<Address>;
}
