import { Address, Cell, Contract, ContractProvider, Sender } from '@ton/core';
import { CoverageType, Chain, Stablecoin, ProductKey } from './types/ProductMatrix';
export type PolicyFactoryConfig = {
    ownerAddress: Address;
    nextPolicyId: bigint;
    totalPoliciesCreated: bigint;
    activePoliciesCount: bigint;
    treasuryAddress: Address;
    paused: number;
};
export declare function policyFactoryConfigToCell(config: PolicyFactoryConfig): Cell;
export declare class PolicyFactory implements Contract {
    readonly address: Address;
    readonly init?: {
        code: Cell;
        data: Cell;
    } | undefined;
    constructor(address: Address, init?: {
        code: Cell;
        data: Cell;
    } | undefined);
    static createFromAddress(address: Address): PolicyFactory;
    static createFromConfig(config: PolicyFactoryConfig, code: Cell, workchain?: number): PolicyFactory;
    sendDeploy(provider: ContractProvider, via: Sender, value: bigint): Promise<void>;
    /**
     * Create a new insurance policy with multi-dimensional parameters
     * @param provider Contract provider
     * @param via Sender
     * @param opts Policy creation options
     */
    sendCreatePolicy(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        coverageType: CoverageType;
        chainId: Chain;
        stablecoinId: Stablecoin;
        coverageAmount: bigint;
        duration: number;
    }): Promise<void>;
    sendSetTreasury(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        newAddress: Address;
    }): Promise<void>;
    sendSetPriceOracle(provider: ContractProvider, via: Sender, opts: {
        value: bigint;
        newAddress: Address;
    }): Promise<void>;
    getTotalPoliciesCreated(provider: ContractProvider): Promise<bigint>;
    /**
     * Get policy data (extended with multi-dimensional fields)
     */
    getPolicyData(provider: ContractProvider, policyId: bigint): Promise<{
        coverageType: CoverageType;
        chainId: Chain;
        stablecoinId: Stablecoin;
        coverageAmount: bigint;
        premium: bigint;
        startTime: number;
        duration: number;
        active: boolean;
    }>;
    /**
     * Calculate premium with multi-dimensional risk factors
     * Uses on-chain calculation (matches risk_multipliers.fc)
     */
    getCalculatePremium(provider: ContractProvider, coverageType: CoverageType, chainId: Chain, stablecoinId: Stablecoin, coverageAmount: bigint, durationDays: number): Promise<bigint>;
    /**
     * Get product information for a specific combination
     */
    getProductInfo(provider: ContractProvider, coverageType: CoverageType, chainId: Chain, stablecoinId: Stablecoin): Promise<{
        productHash: number;
        baseRate: number;
        chainMultiplier: number;
    }>;
    /**
     * Validate product parameters before creating policy
     * @returns Validation result with error message if invalid
     */
    validateProduct(product: ProductKey): {
        valid: boolean;
        error?: string;
    };
    /**
     * Calculate premium off-chain (matches on-chain calculation)
     * Useful for quote generation without blockchain call
     */
    calculatePremiumOffchain(product: ProductKey, coverageAmount: bigint, durationDays: number): bigint;
    /**
     * Calculate product hash for indexing/caching
     */
    calculateProductHash(product: ProductKey): number;
}
