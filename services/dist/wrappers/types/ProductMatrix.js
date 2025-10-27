"use strict";
/**
 * ProductMatrix.ts
 *
 * Comprehensive type definitions for Tonsurance's 560-product insurance matrix
 * (5 coverage types × 8 chains × 14 stablecoins)
 *
 * Used across PolicyFactory, ClaimsProcessor, and frontend for type-safe product handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_DURATIONS = exports.MAX_COVERAGE_AMOUNT = exports.MIN_COVERAGE_AMOUNT = exports.TOTAL_PRODUCTS = exports.TOTAL_STABLECOINS = exports.TOTAL_CHAINS = exports.TOTAL_COVERAGE_TYPES = exports.StablecoinRiskTier = exports.StablecoinTier = exports.StablecoinRiskAdjustment = exports.StablecoinName = exports.Stablecoin = exports.ChainRiskMultiplier = exports.ChainName = exports.Chain = exports.CoverageTypeBaseRate = exports.CoverageTypeName = exports.CoverageType = void 0;
exports.calculateProductHash = calculateProductHash;
exports.decomposeProductHash = decomposeProductHash;
exports.getProductName = getProductName;
exports.isChainStablecoinCompatible = isChainStablecoinCompatible;
exports.getAllValidProducts = getAllValidProducts;
exports.calculatePremium = calculatePremium;
exports.validateProduct = validateProduct;
exports.isCoverageType = isCoverageType;
exports.isChain = isChain;
exports.isStablecoin = isStablecoin;
// ================================
// COVERAGE TYPES (5 types)
// ================================
/**
 * Insurance coverage types supported by Tonsurance
 */
var CoverageType;
(function (CoverageType) {
    CoverageType[CoverageType["DEPEG"] = 0] = "DEPEG";
    CoverageType[CoverageType["SMART_CONTRACT"] = 1] = "SMART_CONTRACT";
    CoverageType[CoverageType["ORACLE"] = 2] = "ORACLE";
    CoverageType[CoverageType["BRIDGE"] = 3] = "BRIDGE";
    CoverageType[CoverageType["CEX_LIQUIDATION"] = 4] = "CEX_LIQUIDATION";
})(CoverageType || (exports.CoverageType = CoverageType = {}));
/**
 * Human-readable coverage type names
 */
exports.CoverageTypeName = {
    [CoverageType.DEPEG]: 'Depeg Protection',
    [CoverageType.SMART_CONTRACT]: 'Smart Contract Exploit',
    [CoverageType.ORACLE]: 'Oracle Failure',
    [CoverageType.BRIDGE]: 'Bridge Hack',
    [CoverageType.CEX_LIQUIDATION]: 'CEX Liquidation',
};
/**
 * Base APR rates for each coverage type (in basis points)
 */
exports.CoverageTypeBaseRate = {
    [CoverageType.DEPEG]: 80, // 0.8% APR
    [CoverageType.SMART_CONTRACT]: 200, // 2.0% APR
    [CoverageType.ORACLE]: 180, // 1.8% APR
    [CoverageType.BRIDGE]: 200, // 2.0% APR
    [CoverageType.CEX_LIQUIDATION]: 300, // 3.0% APR (highest risk)
};
// ================================
// CHAINS (8 chains)
// ================================
/**
 * Supported blockchain networks
 */
var Chain;
(function (Chain) {
    Chain[Chain["ETHEREUM"] = 0] = "ETHEREUM";
    Chain[Chain["ARBITRUM"] = 1] = "ARBITRUM";
    Chain[Chain["BASE"] = 2] = "BASE";
    Chain[Chain["POLYGON"] = 3] = "POLYGON";
    Chain[Chain["BITCOIN"] = 4] = "BITCOIN";
    Chain[Chain["LIGHTNING"] = 5] = "LIGHTNING";
    Chain[Chain["TON"] = 6] = "TON";
    Chain[Chain["SOLANA"] = 7] = "SOLANA";
})(Chain || (exports.Chain = Chain = {}));
/**
 * Human-readable chain names
 */
exports.ChainName = {
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
exports.ChainRiskMultiplier = {
    [Chain.ETHEREUM]: 10000, // 1.0x (baseline)
    [Chain.ARBITRUM]: 11000, // 1.1x
    [Chain.BASE]: 11000, // 1.1x
    [Chain.POLYGON]: 12000, // 1.2x
    [Chain.BITCOIN]: 9000, // 0.9x (discount)
    [Chain.LIGHTNING]: 13000, // 1.3x
    [Chain.TON]: 11500, // 1.15x
    [Chain.SOLANA]: 14000, // 1.4x (highest risk)
};
// ================================
// STABLECOINS (14 stablecoins)
// ================================
/**
 * Supported stablecoin assets
 */
var Stablecoin;
(function (Stablecoin) {
    Stablecoin[Stablecoin["USDC"] = 0] = "USDC";
    Stablecoin[Stablecoin["USDT"] = 1] = "USDT";
    Stablecoin[Stablecoin["USDP"] = 2] = "USDP";
    Stablecoin[Stablecoin["DAI"] = 3] = "DAI";
    Stablecoin[Stablecoin["FRAX"] = 4] = "FRAX";
    Stablecoin[Stablecoin["BUSD"] = 5] = "BUSD";
    Stablecoin[Stablecoin["USDE"] = 6] = "USDE";
    Stablecoin[Stablecoin["SUSDE"] = 7] = "SUSDE";
    Stablecoin[Stablecoin["USDY"] = 8] = "USDY";
    Stablecoin[Stablecoin["PYUSD"] = 9] = "PYUSD";
    Stablecoin[Stablecoin["GHO"] = 10] = "GHO";
    Stablecoin[Stablecoin["LUSD"] = 11] = "LUSD";
    Stablecoin[Stablecoin["CRVUSD"] = 12] = "CRVUSD";
    Stablecoin[Stablecoin["MKUSD"] = 13] = "MKUSD";
})(Stablecoin || (exports.Stablecoin = Stablecoin = {}));
/**
 * Human-readable stablecoin names
 */
exports.StablecoinName = {
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
exports.StablecoinRiskAdjustment = {
    [Stablecoin.USDC]: 0, // Tier 1: Fiat-backed
    [Stablecoin.USDT]: 0, // Tier 1: Fiat-backed
    [Stablecoin.USDP]: 0, // Tier 1: Fiat-backed
    [Stablecoin.DAI]: 0, // Tier 2: Crypto-collateralized
    [Stablecoin.LUSD]: 10, // Tier 2: Crypto-collateralized
    [Stablecoin.BUSD]: 50, // Tier 3: Deprecated
    [Stablecoin.PYUSD]: 25, // Tier 3: New fiat-backed
    [Stablecoin.FRAX]: 75, // Tier 4: Algorithmic
    [Stablecoin.GHO]: 50, // Tier 4: Crypto-collateralized
    [Stablecoin.CRVUSD]: 60, // Tier 4: Newer design
    [Stablecoin.MKUSD]: 70, // Tier 4: Newer protocol
    [Stablecoin.USDE]: 100, // Tier 5: Delta-neutral
    [Stablecoin.SUSDE]: 125, // Tier 5: Staked delta-neutral
    [Stablecoin.USDY]: 110, // Tier 5: RWA exposure
};
/**
 * Stablecoin risk tiers (0 = safest, 4 = riskiest)
 */
var StablecoinTier;
(function (StablecoinTier) {
    StablecoinTier[StablecoinTier["TIER_1"] = 0] = "TIER_1";
    StablecoinTier[StablecoinTier["TIER_2"] = 1] = "TIER_2";
    StablecoinTier[StablecoinTier["TIER_3"] = 2] = "TIER_3";
    StablecoinTier[StablecoinTier["TIER_4"] = 3] = "TIER_4";
    StablecoinTier[StablecoinTier["TIER_5"] = 4] = "TIER_5";
})(StablecoinTier || (exports.StablecoinTier = StablecoinTier = {}));
exports.StablecoinRiskTier = {
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
/**
 * Product hash calculation (matches on-chain implementation)
 * Hash = (coverage_type << 16) | (chain_id << 8) | stablecoin_id
 */
function calculateProductHash(product) {
    return (product.coverage << 16) | (product.chain << 8) | product.stablecoin;
}
/**
 * Decompose product hash back to components
 */
function decomposeProductHash(hash) {
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
function getProductName(product) {
    return `${exports.ChainName[product.chain]} ${exports.StablecoinName[product.stablecoin]} ${exports.CoverageTypeName[product.coverage]}`;
}
// ================================
// CHAIN-STABLECOIN COMPATIBILITY
// ================================
/**
 * Check if a chain supports a given stablecoin
 * Returns true if the combination is valid
 */
function isChainStablecoinCompatible(chain, stablecoin) {
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
function getAllValidProducts() {
    const products = [];
    for (const coverage of Object.values(CoverageType).filter(v => typeof v === 'number')) {
        for (const chain of Object.values(Chain).filter(v => typeof v === 'number')) {
            for (const stablecoin of Object.values(Stablecoin).filter(v => typeof v === 'number')) {
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
function calculatePremium(product, coverageAmount, durationDays) {
    // 1. Get base rate
    const baseRate = exports.CoverageTypeBaseRate[product.coverage];
    // 2. Apply chain multiplier
    const chainMultiplier = exports.ChainRiskMultiplier[product.chain];
    let adjustedRate = (baseRate * chainMultiplier) / 10000;
    // 3. Apply stablecoin adjustment
    adjustedRate += exports.StablecoinRiskAdjustment[product.stablecoin];
    // 4. Time multiplier
    let timeMultiplier = 1000; // 1.0x for 90 days
    if (durationDays === 30) {
        timeMultiplier = 1200; // 1.2x for shorter term
    }
    else if (durationDays === 180) {
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
function validateProduct(product) {
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
function isCoverageType(value) {
    return value >= 0 && value <= 4;
}
function isChain(value) {
    return value >= 0 && value <= 7;
}
function isStablecoin(value) {
    return value >= 0 && value <= 13;
}
// ================================
// CONSTANTS
// ================================
exports.TOTAL_COVERAGE_TYPES = 5;
exports.TOTAL_CHAINS = 8;
exports.TOTAL_STABLECOINS = 14;
exports.TOTAL_PRODUCTS = 560; // After filtering incompatible pairs
exports.MIN_COVERAGE_AMOUNT = BigInt(10000000000); // 10 TON (at $5/TON = $50)
exports.MAX_COVERAGE_AMOUNT = BigInt(1000000000000); // 1000 TON ($5000)
exports.VALID_DURATIONS = [30, 90, 180];
