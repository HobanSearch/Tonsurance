import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type PricingOracleConfig = {
    adminAddress: Address;
    authorizedKeepers?: Address[];
};
export type HedgePrices = {
    polymarketOdds: number;
    perpFundingRate: number;
    allianzQuote: number;
    timestamp: number;
};
export declare enum CoverageType {
    DEPEG = 1,
    EXPLOIT = 2,
    BRIDGE = 3
}
export declare function pricingOracleConfigToCell(config: PricingOracleConfig): Cell;
export declare class PricingOracle implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): PricingOracle;
    static createFromConfig(config: PricingOracleConfig, code: Cell, workchain?: number): PricingOracle;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendUpdateHedgePrices(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        coverageType: CoverageType;
        polymarketOdds: number;
        perpFundingRate: number;
        allianzQuote: number;
    }): Promise<void>;
    sendAddKeeper(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        keeperAddress: Address;
    }): Promise<void>;
    sendRemoveKeeper(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        keeperAddress: Address;
    }): Promise<void>;
    getHedgePrices(provider: ContractProvider, coverageType: CoverageType): Promise<HedgePrices>;
    calculateHedgeCost(provider: ContractProvider, coverageType: CoverageType, coverageAmount: bigint, durationDays: number): Promise<bigint>;
    getLastUpdateTime(provider: ContractProvider): Promise<number>;
    checkKeeperAuthorized(provider: ContractProvider, keeperAddress: Address): Promise<boolean>;
    getAdminAddress(provider: ContractProvider): Promise<Address>;
    isDataFresh(provider: ContractProvider): Promise<boolean>;
}
