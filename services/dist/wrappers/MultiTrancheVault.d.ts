import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type MultiTrancheVaultConfig = {
    ownerAddress: Address;
    totalCapital: bigint;
    totalCoverageSold: bigint;
    accumulatedPremiums: bigint;
    accumulatedLosses: bigint;
    trancheData: Cell;
    depositorBalances: Cell | null;
    paused: boolean;
    adminAddress: Address;
    claimsProcessorAddress: Address;
    reentrancyGuard: boolean;
    seqNo: number;
    circuitBreakerWindowStart: number;
    circuitBreakerLosses: bigint;
    pendingTxs: Cell | null;
    trancheLocks: Cell | null;
    testMode: boolean;
};
export declare function multiTrancheVaultConfigToCell(config: MultiTrancheVaultConfig): Cell;
export declare function createInitialTrancheData(): Cell;
export declare class MultiTrancheVault implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): MultiTrancheVault;
    static createFromConfig(config: MultiTrancheVaultConfig, code: Cell, workchain?: number): MultiTrancheVault;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendPause(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendUnpause(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendSetAdmin(provider: ContractProvider, via: Sender, value: bigint, newAdmin: Address): Promise<void>;
    sendSetClaimsProcessor(provider: ContractProvider, via: Sender, value: bigint, newProcessor: Address): Promise<void>;
    sendSetTrancheToken(provider: ContractProvider, via: Sender, value: bigint, trancheId: number, tokenAddress: Address): Promise<void>;
    sendDeposit(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        trancheId: number;
    }): Promise<void>;
    sendWithdraw(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        trancheId: number;
        amount: bigint;
    }): Promise<void>;
    sendAbsorbLoss(provider: ContractProvider, via: Sender, value: bigint, lossAmount: bigint): Promise<void>;
    sendDistributePremiums(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        premiumAmount: bigint;
    }): Promise<void>;
    getTotalCapital(provider: ContractProvider): Promise<bigint>;
    getTotalCoverageSold(provider: ContractProvider): Promise<bigint>;
    getPaused(provider: ContractProvider): Promise<boolean>;
    getTrancheCapital(provider: ContractProvider, trancheId: number): Promise<bigint>;
    getTrancheApy(provider: ContractProvider, trancheId: number): Promise<{
        min: bigint;
        max: bigint;
    }>;
    getOwner(provider: ContractProvider): Promise<Address>;
    getAdmin(provider: ContractProvider): Promise<Address>;
    getClaimsProcessor(provider: ContractProvider): Promise<Address>;
    getAccumulatedPremiums(provider: ContractProvider): Promise<bigint>;
    getAccumulatedLosses(provider: ContractProvider): Promise<bigint>;
    getSeqNo(provider: ContractProvider): Promise<bigint>;
    getCircuitBreakerStatus(provider: ContractProvider): Promise<{
        windowStart: bigint;
        losses: bigint;
    }>;
    getTrancheTokenAddress(provider: ContractProvider, trancheId: number): Promise<Address>;
    getTrancheTotalTokens(provider: ContractProvider, trancheId: number): Promise<bigint>;
    getTrancheInfo(provider: ContractProvider, trancheId: number): Promise<{
        capital: bigint;
        apyMin: bigint;
        apyMax: bigint;
        curveType: bigint;
        allocationPercent: bigint;
        accumulatedYield: bigint;
        tokenAddress: Address;
        totalTokens: bigint;
    }>;
    getTrancheNAV(provider: ContractProvider, trancheId: number): Promise<bigint>;
    getTrancheState(provider: ContractProvider, trancheId: number): Promise<{
        totalCapital: bigint;
        tokenSupply: bigint;
        utilization: bigint;
        nav: bigint;
        accumulatedYield: bigint;
    }>;
    getDepositorBalance(provider: ContractProvider, depositorAddress: Address): Promise<{
        trancheId: bigint;
        balance: bigint;
        lockUntil: bigint;
        stakeStartTime: bigint;
    }>;
    getTestMode(provider: ContractProvider): Promise<boolean>;
}
