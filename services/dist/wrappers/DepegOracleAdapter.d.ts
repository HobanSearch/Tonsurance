import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type DepegOracleAdapterConfig = {
    ownerAddress: Address;
    claimsProcessorAddress: Address;
    keeperAddress: Address;
};
export declare function depegOracleAdapterConfigToCell(config: DepegOracleAdapterConfig): Cell;
export declare class DepegOracleAdapter implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): DepegOracleAdapter;
    static createFromConfig(config: DepegOracleAdapterConfig, code: Cell, workchain?: number): DepegOracleAdapter;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendUpdatePrice(provider: ContractProvider, via: Sender, stablecoinId: number, timestamp: number, price: bigint, sourceBitmap: number): Promise<void>;
    sendBatchUpdatePrices(provider: ContractProvider, via: Sender, updates: Array<{
        stablecoinId: number;
        timestamp: number;
        price: bigint;
        sourceBitmap: number;
    }>): Promise<void>;
    sendSetClaimsProcessor(provider: ContractProvider, via: Sender, newProcessor: Address): Promise<void>;
    sendSetKeeper(provider: ContractProvider, via: Sender, newKeeper: Address): Promise<void>;
    getOwner(provider: ContractProvider): Promise<Address>;
    getClaimsProcessor(provider: ContractProvider): Promise<Address>;
    getKeeper(provider: ContractProvider): Promise<Address>;
    getLastUpdate(provider: ContractProvider): Promise<number>;
    getPrice(provider: ContractProvider, stablecoinId: number, timestamp: number): Promise<{
        price: bigint;
        sourceBitmap: number;
        found: boolean;
    }>;
}
