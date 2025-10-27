/**
 * ProductMatrix.ts
 *
 * Comprehensive type definitions for Tonsurance's 560-product insurance matrix
 * (5 coverage types × 8 chains × 14 stablecoins)
 *
 * Used across PolicyFactory, ClaimsProcessor, and frontend for type-safe product handling
 */
/**
 * Insurance coverage types supported by Tonsurance
 */
export declare enum CoverageType {
    DEPEG = 0,// Stablecoin depeg protection (most common)
    SMART_CONTRACT = 1,// Smart contract exploit/hack
    ORACLE = 2,// Oracle manipulation/failure
    BRIDGE = 3,// Cross-chain bridge hack
    CEX_LIQUIDATION = 4
}
/**
 * Human-readable coverage type names
 */
export declare const CoverageTypeName: Record<CoverageType, string>;
/**
 * Base APR rates for each coverage type (in basis points)
 */
export declare const CoverageTypeBaseRate: Record<CoverageType, number>;
/**
 * Supported blockchain networks
 */
export declare enum Chain {
    ETHEREUM = 0,// EVM L1, most secure
    ARBITRUM = 1,// Optimistic rollup
    BASE = 2,// Coinbase L2
    POLYGON = 3,// PoS sidechain
    BITCOIN = 4,// Bitcoin mainnet
    LIGHTNING = 5,// Lightning Network
    TON = 6,// The Open Network
    SOLANA = 7
}
/**
 * Human-readable chain names
 */
export declare const ChainName: Record<Chain, string>;
/**
 * Chain risk multipliers (in basis points, 10000 = 1.0x)
 */
export declare const ChainRiskMultiplier: Record<Chain, number>;
/**
 * Supported stablecoin assets
 */
export declare enum Stablecoin {
    USDC = 0,// Circle USD Coin
    USDT = 1,// Tether
    USDP = 2,// Paxos USD
    DAI = 3,// MakerDAO DAI
    FRAX = 4,// Frax Finance
    BUSD = 5,// Binance USD (deprecated)
    USDE = 6,// Ethena USDe
    SUSDE = 7,// Staked USDe
    USDY = 8,// Ondo USDY
    PYUSD = 9,// PayPal USD
    GHO = 10,// Aave GHO
    LUSD = 11,// Liquity LUSD
    CRVUSD = 12,// Curve crvUSD
    MKUSD = 13
}
/**
 * Human-readable stablecoin names
 */
export declare const StablecoinName: Record<Stablecoin, string>;
/**
 * Stablecoin risk adjustments (in basis points, additive to base rate)
 * Negative = discount, Positive = premium
 */
export declare const StablecoinRiskAdjustment: Record<Stablecoin, number>;
/**
 * Stablecoin risk tiers (0 = safest, 4 = riskiest)
 */
export declare enum StablecoinTier {
    TIER_1 = 0,// Fiat-backed majors
    TIER_2 = 1,// Established crypto-collateralized
    TIER_3 = 2,// Newer fiat-backed
    TIER_4 = 3,// Algorithmic/hybrid
    TIER_5 = 4
}
export declare const StablecoinRiskTier: Record<Stablecoin, StablecoinTier>;
/**
 * Complete product identifier combining all three dimensions
 */
export interface ProductKey {
    coverage: CoverageType;
    chain: Chain;
    stablecoin: Stablecoin;
}
/**
 * Product hash calculation (matches on-chain implementation)
 * Hash = (coverage_type << 16) | (chain_id << 8) | stablecoin_id
 */
export declare function calculateProductHash(product: ProductKey): number;
/**
 * Decompose product hash back to components
 */
export declare function decomposeProductHash(hash: number): ProductKey;
/**
 * Generate human-readable product name
 * Example: "Ethereum USDC Depeg Protection"
 */
export declare function getProductName(product: ProductKey): string;
/**
 * Check if a chain supports a given stablecoin
 * Returns true if the combination is valid
 */
export declare function isChainStablecoinCompatible(chain: Chain, stablecoin: Stablecoin): boolean;
/**
 * Get all valid products (560 total combinations)
 * Filters out incompatible chain-stablecoin pairs
 */
export declare function getAllValidProducts(): ProductKey[];
/**
 * Calculate premium with multi-dimensional risk factors
 * Matches on-chain calculation in risk_multipliers.fc
 */
export declare function calculatePremium(product: ProductKey, coverageAmount: bigint, durationDays: number): bigint;
/**
 * Validate product parameters
 */
export declare function validateProduct(product: ProductKey): {
    valid: boolean;
    error?: string;
};
export declare function isCoverageType(value: number): value is CoverageType;
export declare function isChain(value: number): value is Chain;
export declare function isStablecoin(value: number): value is Stablecoin;
export declare const TOTAL_COVERAGE_TYPES = 5;
export declare const TOTAL_CHAINS = 8;
export declare const TOTAL_STABLECOINS = 14;
export declare const TOTAL_PRODUCTS = 560;
export declare const MIN_COVERAGE_AMOUNT: bigint;
export declare const MAX_COVERAGE_AMOUNT: bigint;
export declare const VALID_DURATIONS: readonly [30, 90, 180];
export type PolicyDuration = typeof VALID_DURATIONS[number];
