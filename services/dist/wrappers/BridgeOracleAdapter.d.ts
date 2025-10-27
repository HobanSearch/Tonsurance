import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type BridgeOracleAdapterConfig = {
    ownerAddress: Address;
    claimsProcessorAddress: Address;
    keeperAddress: Address;
};
export declare function bridgeOracleAdapterConfigToCell(config: BridgeOracleAdapterConfig): Cell;
export declare class BridgeOracleAdapter implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): BridgeOracleAdapter;
    static createFromConfig(config: BridgeOracleAdapterConfig, code: Cell, workchain?: number): BridgeOracleAdapter;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendReportExploit(provider: ContractProvider, via: Sender, bridgeAddress: Address, exploitTimestamp: number, stolenAmount: bigint, txHashHigh: bigint, txHashLow: bigint, monitoringSources: number): Promise<void>;
    sendUpdateBridgeStatus(provider: ContractProvider, via: Sender, bridgeAddress: Address, status: number, currentTvl: bigint): Promise<void>;
    getOwner(provider: ContractProvider): Promise<Address>;
    getTotalExploits(provider: ContractProvider): Promise<number>;
    getBridgeInfo(provider: ContractProvider, bridgeAddress: Address): Promise<{
        status: number;
        tvl: bigint;
        lastUpdate: number;
        found: boolean;
    }>;
    getExploitInfo(provider: ContractProvider, bridgeAddress: Address, timestamp: number): Promise<{
        stolenAmount: bigint;
        monitoringSources: number;
        reportedAt: number;
        found: boolean;
    }>;
}
