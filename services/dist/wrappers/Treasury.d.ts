import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type TreasuryConfig = {
    ownerAddress: Address;
    totalPremiumsCollected: bigint;
    totalPayoutsMade: bigint;
    reserveBalance: bigint;
    claimsProcessorAddress: Address;
    multiTrancheVaultAddress: Address;
    stakingPoolAddress: Address;
    btcYieldDistributed: bigint;
    snrYieldDistributed: bigint;
    mezzYieldDistributed: bigint;
    jnrYieldDistributed: bigint;
    jnrPlusYieldDistributed: bigint;
    eqtYieldDistributed: bigint;
};
export declare function treasuryConfigToCell(config: TreasuryConfig): Cell;
export declare class Treasury implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): Treasury;
    static createFromConfig(config: TreasuryConfig, code: Cell, workchain?: number): Treasury;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    getTreasuryStats(provider: ContractProvider): Promise<{
        totalPremiums: bigint;
        totalPayouts: bigint;
        reserveBalance: bigint;
    }>;
    getReserveBalance(provider: ContractProvider): Promise<bigint>;
    getAllTrancheYields(provider: ContractProvider): Promise<{
        btc: bigint;
        snr: bigint;
        mezz: bigint;
        jnr: bigint;
        jnrPlus: bigint;
        eqt: bigint;
    }>;
    getTotalYieldDistributed(provider: ContractProvider): Promise<bigint>;
    getBtcYieldDistributed(provider: ContractProvider): Promise<bigint>;
    getSnrYieldDistributed(provider: ContractProvider): Promise<bigint>;
    getMezzYieldDistributed(provider: ContractProvider): Promise<bigint>;
    getJnrYieldDistributed(provider: ContractProvider): Promise<bigint>;
    getJnrPlusYieldDistributed(provider: ContractProvider): Promise<bigint>;
    getEqtYieldDistributed(provider: ContractProvider): Promise<bigint>;
    getMultiTrancheVault(provider: ContractProvider): Promise<Address>;
}
