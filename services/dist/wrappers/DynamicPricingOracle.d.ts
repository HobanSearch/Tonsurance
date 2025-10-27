import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
export type DynamicPricingOracleConfig = {
    adminAddress: Address;
    authorizedKeepers: Cell | null;
    multisigSigners: Cell | null;
    multisigThreshold: number;
    productMultipliers: Cell | null;
    globalCircuitBreaker: boolean;
    lastUpdateTime: number;
    totalUpdates: number;
};
export declare function dynamicPricingOracleConfigToCell(config: DynamicPricingOracleConfig): Cell;
export interface MultiplierData {
    baseMultiplier: bigint;
    marketAdjustment: bigint;
    volatilityPremium: bigint;
    timestamp: bigint;
    updateCount: bigint;
}
export declare class DynamicPricingOracle implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): DynamicPricingOracle;
    static createFromConfig(config: DynamicPricingOracleConfig, code: Cell, workchain?: number): DynamicPricingOracle;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendUpdateMultiplier(provider: ContractProvider, via: Sender, value: bigint, opts: {
        coverageType: number;
        chainId: number;
        stablecoinId: number;
        baseMultiplier: bigint;
        marketAdjustment: bigint;
        volatilityPremium: bigint;
    }): Promise<void>;
    sendBatchUpdateMultipliers(provider: ContractProvider, via: Sender, value: bigint, multipliers: Array<{
        coverageType: number;
        chainId: number;
        stablecoinId: number;
        baseMultiplier: bigint;
        marketAdjustment: bigint;
        volatilityPremium: bigint;
    }>): Promise<void>;
    sendToggleCircuitBreaker(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    sendAddKeeper(provider: ContractProvider, via: Sender, value: bigint, keeperAddress: Address): Promise<void>;
    sendRemoveKeeper(provider: ContractProvider, via: Sender, value: bigint, keeperAddress: Address): Promise<void>;
    sendAddSigner(provider: ContractProvider, via: Sender, value: bigint, signerAddress: Address): Promise<void>;
    sendRemoveSigner(provider: ContractProvider, via: Sender, value: bigint, signerAddress: Address): Promise<void>;
    /**
     * Get product multiplier for specific coverage product
     * @param coverageType 0=depeg, 1=exploit, 2=bridge, 3=cex_liquidation, 4=cex_freeze
     * @param chainId 0-7 (ethereum, bsc, polygon, avalanche, arbitrum, optimism, ton, solana)
     * @param stablecoinId 0-13 (usdt, usdc, dai, ...)
     */
    getMultiplier(provider: ContractProvider, coverageType: number, chainId: number, stablecoinId: number): Promise<bigint>;
    getMultiplierComponents(provider: ContractProvider, coverageType: number, chainId: number, stablecoinId: number): Promise<MultiplierData>;
    getLastUpdateTime(provider: ContractProvider): Promise<bigint>;
    getTotalUpdates(provider: ContractProvider): Promise<bigint>;
    getCircuitBreakerStatus(provider: ContractProvider): Promise<{
        enabled: boolean;
        minMultiplier: bigint;
        maxMultiplier: bigint;
    }>;
    isKeeperAuthorized(provider: ContractProvider, keeperAddress: Address): Promise<boolean>;
    getAdmin(provider: ContractProvider): Promise<Address>;
    getMultisigThreshold(provider: ContractProvider): Promise<bigint>;
    /**
     * Check if oracle data is fresh (updated within last 5 minutes)
     */
    isFresh(provider: ContractProvider): Promise<boolean>;
}
