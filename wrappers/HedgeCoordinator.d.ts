import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type HedgeCoordinatorConfig = {
    adminAddress: Address;
    factoryAddress: Address;
};
export declare enum VenueType {
    POLYMARKET = 1,
    PERPETUALS = 2,
    ALLIANZ = 3
}
export declare enum HedgeStatus {
    PENDING = 0,
    FILLED = 1,
    FAILED = 2,
    LIQUIDATING = 3,
    LIQUIDATED = 4
}
export type HedgePosition = {
    polymarketStatus: HedgeStatus;
    polymarketAmount: bigint;
    perpetualsStatus: HedgeStatus;
    perpetualsAmount: bigint;
    allianzStatus: HedgeStatus;
    allianzAmount: bigint;
};
export type LiquidationStatus = {
    timestamp: number;
    status: HedgeStatus;
    polymarketProceeds: bigint;
    perpetualsProceeds: bigint;
    allianzProceeds: bigint;
};
export declare function hedgeCoordinatorConfigToCell(config: HedgeCoordinatorConfig): Cell;
export declare class HedgeCoordinator implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): HedgeCoordinator;
    static createFromConfig(config: HedgeCoordinatorConfig, code: Cell, workchain?: number): HedgeCoordinator;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendRegisterHedge(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        policyId: bigint;
        venueId: VenueType;
        amount: bigint;
        externalId: string;
        status: HedgeStatus;
    }): Promise<void>;
    sendLiquidateHedges(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        policyId: bigint;
        polymarketKeeper: Address;
        perpKeeper: Address;
        allianzKeeper: Address;
    }): Promise<void>;
    sendReportLiquidation(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        policyId: bigint;
        venueId: VenueType;
        proceeds: bigint;
        reserveVault: Address;
    }): Promise<void>;
    sendUpdateFactory(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        factoryAddress: Address;
    }): Promise<void>;
    sendAddKeeper(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        keeperAddress: Address;
    }): Promise<void>;
    sendRemoveKeeper(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        keeperAddress: Address;
    }): Promise<void>;
    getHedgePosition(provider: ContractProvider, policyId: bigint): Promise<HedgePosition>;
    getLiquidationStatus(provider: ContractProvider, policyId: bigint): Promise<LiquidationStatus>;
    getTotalLiquidationProceeds(provider: ContractProvider, policyId: bigint): Promise<bigint>;
    checkKeeperAuthorized(provider: ContractProvider, keeperAddress: Address): Promise<boolean>;
    getAdminAddress(provider: ContractProvider): Promise<Address>;
    getFactoryAddress(provider: ContractProvider): Promise<Address>;
}
