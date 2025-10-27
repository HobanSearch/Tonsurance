import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type PriceOracleConfig = {
    ownerAddress: Address;
    oracleRewardsAddress: Address;
    minOracleCount: number;
    maxPriceAge: number;
};
export declare function priceOracleConfigToCell(config: PriceOracleConfig): Cell;
export declare class PriceOracle implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): PriceOracle;
    static createFromConfig(config: PriceOracleConfig, code: Cell, workchain?: number): PriceOracle;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendRegisterKeeper(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        keeperAddress: Address;
    }): Promise<void>;
    sendUpdatePrice(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        assetId: number;
        price: bigint;
        timestamp: number;
        signature: Cell;
    }): Promise<void>;
    sendDeactivateKeeper(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        keeperAddress: Address;
    }): Promise<void>;
    getPrice(provider: ContractProvider, assetId: number): Promise<{
        price: bigint;
        timestamp: number;
        isStale: boolean;
    }>;
    getLatestPrice(provider: ContractProvider, assetId: number): Promise<bigint>;
    isPriceStale(provider: ContractProvider, assetId: number): Promise<boolean>;
    getKeeperStats(provider: ContractProvider, keeper: Address): Promise<{
        updateCount: number;
        accuracyScore: number;
        isActive: boolean;
    }>;
    getMinOracleCount(provider: ContractProvider): Promise<number>;
    getMaxPriceAge(provider: ContractProvider): Promise<number>;
}
