import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type RiskMultipliersTestConfig = {
    ownerAddress: Address;
};
export declare function riskMultipliersTestConfigToCell(config: RiskMultipliersTestConfig): Cell;
export declare class RiskMultipliersTest implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): RiskMultipliersTest;
    static createFromConfig(config: RiskMultipliersTestConfig, code: Cell, workchain?: number): RiskMultipliersTest;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    getChainRiskMultiplier(provider: ContractProvider, chainId: number): Promise<number>;
    getStablecoinRiskAdjustment(provider: ContractProvider, stablecoinId: number): Promise<number>;
    getCoverageTypeBaseRate(provider: ContractProvider, coverageType: number): Promise<number>;
    getStablecoinRiskTier(provider: ContractProvider, stablecoinId: number): Promise<number>;
    validateChainStablecoinPair(provider: ContractProvider, chainId: number, stablecoinId: number): Promise<boolean>;
    calculateProductHash(provider: ContractProvider, coverageType: number, chainId: number, stablecoinId: number): Promise<number>;
    decomposeProductHash(provider: ContractProvider, productHash: number): Promise<{
        coverageType: number;
        chainId: number;
        stablecoinId: number;
    }>;
    calculateMultiDimensionalPremium(provider: ContractProvider, coverageType: number, chainId: number, stablecoinId: number, coverageAmount: bigint, durationDays: number): Promise<bigint>;
    validateChainId(provider: ContractProvider, chainId: number): Promise<boolean>;
    validateStablecoinId(provider: ContractProvider, stablecoinId: number): Promise<boolean>;
    validateCoverageType(provider: ContractProvider, coverageType: number): Promise<boolean>;
}
