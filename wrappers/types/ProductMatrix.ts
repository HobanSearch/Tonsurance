/**
 * ProductMatrix.ts
 *
 * Comprehensive type definitions for Tonsurance's 560-product insurance matrix
 * (5 coverage types × 8 chains × 14 stablecoins)
 *
 * Used across PolicyFactory, ClaimsProcessor, and frontend for type-safe product handling
 */

// ================================
// COVERAGE TYPES (5 types)
// ================================

/**
 * Insurance coverage types supported by Tonsurance
 */
export enum CoverageType {
    DEPEG = 0,              // Stablecoin depeg protection (most common)
    SMART_CONTRACT = 1,     // Smart contract exploit/hack
    ORACLE = 2,             // Oracle manipulation/failure
    BRIDGE = 3,             // Cross-chain bridge hack
    CEX_LIQUIDATION = 4,    // CEX liquidation protection (new)
}

/**
 * Human-readable coverage type names
 */
export const CoverageTypeName: Record<CoverageType, string> = {
    [CoverageType.DEPEG]: 'Depeg Protection',
    [CoverageType.SMART_CONTRACT]: 'Smart Contract Exploit',
    [CoverageType.ORACLE]: 'Oracle Failure',
    [CoverageType.BRIDGE]: 'Bridge Hack',
    [CoverageType.CEX_LIQUIDATION]: 'CEX Liquidation',
};

/**
 * Base APR rates for each coverage type (in basis points)
 */
export const CoverageTypeBaseRate: Record<CoverageType, number> = {
    [CoverageType.DEPEG]: 80,               // 0.8% APR
    [CoverageType.SMART_CONTRACT]: 200,     // 2.0% APR
    [CoverageType.ORACLE]: 180,             // 1.8% APR
    [CoverageType.BRIDGE]: 200,             // 2.0% APR
    [CoverageType.CEX_LIQUIDATION]: 300,    // 3.0% APR (highest risk)
};

// ================================
// CHAINS (8 chains)
// ================================

/**
 * Supported blockchain networks
 */
export enum Chain {
    ETHEREUM = 0,    // EVM L1, most secure
    ARBITRUM = 1,    // Optimistic rollup
    BASE = 2,        // Coinbase L2
    POLYGON = 3,     // PoS sidechain
    BITCOIN = 4,     // Bitcoin mainnet
    LIGHTNING = 5,   // Lightning Network
    TON = 6,         // The Open Network
    SOLANA = 7,      // High-performance L1
}

/**
 * Human-readable chain names
 */
export const ChainName: Record<Chain, string> = {
    [Chain.ETHEREUM]: 'Ethereum',
    [Chain.ARBITRUM]: 'Arbitrum',
    [Chain.BASE]: 'Base',
    [Chain.POLYGON]: 'Polygon',
    [Chain.BITCOIN]: 'Bitcoin',
    [Chain.LIGHTNING]: 'Lightning Network',
    [Chain.TON]: 'TON',
    [Chain.SOLANA]: 'Solana',
};

/**
 * Chain risk multipliers (in basis points, 10000 = 1.0x)
 */
export const ChainRiskMultiplier: Record<Chain, number> = {
    [Chain.ETHEREUM]: 10000,  // 1.0x (baseline)
    [Chain.ARBITRUM]: 11000,  // 1.1x
    [Chain.BASE]: 11000,      // 1.1x
    [Chain.POLYGON]: 12000,   // 1.2x
    [Chain.BITCOIN]: 9000,    // 0.9x (discount)
    [Chain.LIGHTNING]: 13000, // 1.3x
    [Chain.TON]: 11500,       // 1.15x
    [Chain.SOLANA]: 14000,    // 1.4x (highest risk)
};

// ================================
// STABLECOINS (14 stablecoins)
// ================================

/**
 * Supported stablecoin assets
 */
export enum Stablecoin {
    USDC = 0,      // Circle USD Coin
    USDT = 1,      // Tether
    USDP = 2,      // Paxos USD
    DAI = 3,       // MakerDAO DAI
    FRAX = 4,      // Frax Finance
    BUSD = 5,      // Binance USD (deprecated)
    USDE = 6,      // Ethena USDe
    SUSDE = 7,     // Staked USDe
    USDY = 8,      // Ondo USDY
    PYUSD = 9,     // PayPal USD
    GHO = 10,      // Aave GHO
    LUSD = 11,     // Liquity LUSD
    CRVUSD = 12,   // Curve crvUSD
    MKUSD = 13,    // Prisma mkUSD
}

/**
 * Human-readable stablecoin names
 */
export const StablecoinName: Record<Stablecoin, string> = {
    [Stablecoin.USDC]: 'USDC',
    [Stablecoin.USDT]: 'USDT',
    [Stablecoin.USDP]: 'USDP',
    [Stablecoin.DAI]: 'DAI',
    [Stablecoin.FRAX]: 'FRAX',
    [Stablecoin.BUSD]: 'BUSD',
    [Stablecoin.USDE]: 'USDe',
    [Stablecoin.SUSDE]: 'sUSDe',
    [Stablecoin.USDY]: 'USDY',
    [Stablecoin.PYUSD]: 'PYUSD',
    [Stablecoin.GHO]: 'GHO',
    [Stablecoin.LUSD]: 'LUSD',
    [Stablecoin.CRVUSD]: 'crvUSD',
    [Stablecoin.MKUSD]: 'mkUSD',
};

/**
 * Stablecoin risk adjustments (in basis points, additive to base rate)
 * Negative = discount, Positive = premium
 */
export const StablecoinRiskAdjustment: Record<Stablecoin, number> = {
    [Stablecoin.USDC]: 0,       // Tier 1: Fiat-backed
    [Stablecoin.USDT]: 0,       // Tier 1: Fiat-backed
    [Stablecoin.USDP]: 0,       // Tier 1: Fiat-backed
    [Stablecoin.DAI]: 0,        // Tier 2: Crypto-collateralized
    [Stablecoin.LUSD]: 10,      // Tier 2: Crypto-collateralized
    [Stablecoin.BUSD]: 50,      // Tier 3: Deprecated
    [Stablecoin.PYUSD]: 25,     // Tier 3: New fiat-backed
    [Stablecoin.FRAX]: 75,      // Tier 4: Algorithmic
    [Stablecoin.GHO]: 50,       // Tier 4: Crypto-collateralized
    [Stablecoin.CRVUSD]: 60,    // Tier 4: Newer design
    [Stablecoin.MKUSD]: 70,     // Tier 4: Newer protocol
    [Stablecoin.USDE]: 100,     // Tier 5: Delta-neutral
    [Stablecoin.SUSDE]: 125,    // Tier 5: Staked delta-neutral
    [Stablecoin.USDY]: 110,     // Tier 5: RWA exposure
};

/**
 * Stablecoin risk tiers (0 = safest, 4 = riskiest)
 */
export enum StablecoinTier {
    TIER_1 = 0,  // Fiat-backed majors
    TIER_2 = 1,  // Established crypto-collateralized
    TIER_3 = 2,  // Newer fiat-backed
    TIER_4 = 3,  // Algorithmic/hybrid
    TIER_5 = 4,  // Complex strategies
}

export const StablecoinRiskTier: Record<Stablecoin, StablecoinTier> = {
    [Stablecoin.USDC]: StablecoinTier.TIER_1,
    [Stablecoin.USDT]: StablecoinTier.TIER_1,
    [Stablecoin.USDP]: StablecoinTier.TIER_1,
    [Stablecoin.DAI]: StablecoinTier.TIER_2,
    [Stablecoin.LUSD]: StablecoinTier.TIER_2,
    [Stablecoin.BUSD]: StablecoinTier.TIER_3,
    [Stablecoin.PYUSD]: StablecoinTier.TIER_3,
    [Stablecoin.FRAX]: StablecoinTier.TIER_4,
    [Stablecoin.GHO]: StablecoinTier.TIER_4,
    [Stablecoin.CRVUSD]: StablecoinTier.TIER_4,
    [Stablecoin.MKUSD]: StablecoinTier.TIER_4,
    [Stablecoin.USDE]: StablecoinTier.TIER_5,
    [Stablecoin.SUSDE]: StablecoinTier.TIER_5,
    [Stablecoin.USDY]: StablecoinTier.TIER_5,
};

// ================================
// PRODUCT KEY (COMBINATION)
// ================================

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
export function calculateProductHash(product: ProductKey): number {
    return (product.coverage << 16) | (product.chain << 8) | product.stablecoin;
}

/**
 * Decompose product hash back to components
 */
export function decomposeProductHash(hash: number): ProductKey {
    return {
        coverage: (hash >> 16) & 0xFF,
        chain: (hash >> 8) & 0xFF,
        stablecoin: hash & 0xFF,
    };
}

/**
 * Generate human-readable product name
 * Example: "Ethereum USDC Depeg Protection"
 */
export function getProductName(product: ProductKey): string {
    return `${ChainName[product.chain]} ${StablecoinName[product.stablecoin]} ${CoverageTypeName[product.coverage]}`;
}

// ================================
// CHAIN-STABLECOIN COMPATIBILITY
// ================================

/**
 * Check if a chain supports a given stablecoin
 * Returns true if the combination is valid
 */
export function isChainStablecoinCompatible(chain: Chain, stablecoin: Stablecoin): boolean {
    // Bitcoin only supports USDT (Omni/Liquid layers)
    if (chain === Chain.BITCOIN) {
        return stablecoin === Stablecoin.USDT;
    }

    // Lightning supports USDT and USDC
    if (chain === Chain.LIGHTNING) {
        return stablecoin === Stablecoin.USDT || stablecoin === Stablecoin.USDC;
    }

    // All other chains support most stablecoins
    // Frontend can implement more granular checks
    return true;
}

/**
 * Get all valid products (560 total combinations)
 * Filters out incompatible chain-stablecoin pairs
 */
export function getAllValidProducts(): ProductKey[] {
    const products: ProductKey[] = [];

    for (const coverage of Object.values(CoverageType).filter(v => typeof v === 'number') as CoverageType[]) {
        for (const chain of Object.values(Chain).filter(v => typeof v === 'number') as Chain[]) {
            for (const stablecoin of Object.values(Stablecoin).filter(v => typeof v === 'number') as Stablecoin[]) {
                if (isChainStablecoinCompatible(chain, stablecoin)) {
                    products.push({ coverage, chain, stablecoin });
                }
            }
        }
    }

    return products;
}

// ================================
// PREMIUM CALCULATION HELPERS
// ================================

/**
 * Calculate premium with multi-dimensional risk factors
 * Matches on-chain calculation in risk_multipliers.fc
 */
export function calculatePremium(
    product: ProductKey,
    coverageAmount: bigint,
    durationDays: number
): bigint {
    // 1. Get base rate
    const baseRate = CoverageTypeBaseRate[product.coverage];

    // 2. Apply chain multiplier
    const chainMultiplier = ChainRiskMultiplier[product.chain];
    let adjustedRate = (baseRate * chainMultiplier) / 10000;

    // 3. Apply stablecoin adjustment
    adjustedRate += StablecoinRiskAdjustment[product.stablecoin];

    // 4. Time multiplier
    let timeMultiplier = 1000; // 1.0x for 90 days
    if (durationDays === 30) {
        timeMultiplier = 1200; // 1.2x for shorter term
    } else if (durationDays === 180) {
        timeMultiplier = 900; // 0.9x for longer term
    }

    // 5. Calculate premium
    // Formula: (amount * adjusted_rate * days / 365 / 10000) * time_multiplier / 1000
    let premium = (coverageAmount * BigInt(adjustedRate) * BigInt(durationDays)) / (BigInt(365) * BigInt(10000));
    premium = (premium * BigInt(timeMultiplier)) / BigInt(1000);

    return premium;
}

/**
 * Validate product parameters
 */
export function validateProduct(product: ProductKey): { valid: boolean; error?: string } {
    // Validate coverage type
    if (product.coverage < 0 || product.coverage > 4) {
        return { valid: false, error: 'Invalid coverage type' };
    }

    // Validate chain
    if (product.chain < 0 || product.chain > 7) {
        return { valid: false, error: 'Invalid chain' };
    }

    // Validate stablecoin
    if (product.stablecoin < 0 || product.stablecoin > 13) {
        return { valid: false, error: 'Invalid stablecoin' };
    }

    // Check compatibility
    if (!isChainStablecoinCompatible(product.chain, product.stablecoin)) {
        return { valid: false, error: 'Chain does not support this stablecoin' };
    }

    return { valid: true };
}

// ================================
// TYPE GUARDS
// ================================

export function isCoverageType(value: number): value is CoverageType {
    return value >= 0 && value <= 4;
}

export function isChain(value: number): value is Chain {
    return value >= 0 && value <= 7;
}

export function isStablecoin(value: number): value is Stablecoin {
    return value >= 0 && value <= 13;
}

// ================================
// CONSTANTS
// ================================

export const TOTAL_COVERAGE_TYPES = 5;
export const TOTAL_CHAINS = 8;
export const TOTAL_STABLECOINS = 14;
export const TOTAL_PRODUCTS = 560; // After filtering incompatible pairs

export const MIN_COVERAGE_AMOUNT = BigInt(10_000_000_000); // 10 TON (at $5/TON = $50)
export const MAX_COVERAGE_AMOUNT = BigInt(1_000_000_000_000); // 1000 TON ($5000)

export const VALID_DURATIONS = [30, 90, 180] as const;
export type PolicyDuration = typeof VALID_DURATIONS[number];
