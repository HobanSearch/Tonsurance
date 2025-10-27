import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type SmartContractOracleAdapterConfig = {
    ownerAddress: Address;
    claimsProcessorAddress: Address;
    keeperAddress: Address;
};
export declare function smartContractOracleAdapterConfigToCell(config: SmartContractOracleAdapterConfig): Cell;
export declare class SmartContractOracleAdapter implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): SmartContractOracleAdapter;
    static createFromConfig(config: SmartContractOracleAdapterConfig, code: Cell, workchain?: number): SmartContractOracleAdapter;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendReportExploit(provider: ContractProvider, via: Sender, contractAddress: Address, chainId: number, exploitTimestamp: number, stolenAmount: bigint, txHashHigh: bigint, txHashLow: bigint, monitoringSources: number, contractType: number): Promise<void>;
    sendUpdateContractStatus(provider: ContractProvider, via: Sender, contractAddress: Address, status: number, currentTvl: bigint): Promise<void>;
    getOwner(provider: ContractProvider): Promise<Address>;
    getTotalExploits(provider: ContractProvider): Promise<number>;
    getContractInfo(provider: ContractProvider, contractAddress: Address): Promise<{
        status: number;
        tvl: bigint;
        lastUpdate: number;
        found: boolean;
    }>;
}
