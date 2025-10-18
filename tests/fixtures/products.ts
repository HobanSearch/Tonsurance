/**
 * Test Fixtures for 560-Product Matrix
 *
 * Products = 5 coverage types × 8 chains × 14 stablecoins = 560 combinations
 *
 * Coverage Types: depeg, smart_contract, oracle_failure, bridge_exploit, cex_liquidation
 * Chains: Ethereum, Arbitrum, Base, Polygon, Bitcoin, Lightning, TON, Solana
 * Stablecoins: USDC, USDT, USDP, DAI, FRAX, BUSD, USDe, sUSDe, USDY, PYUSD, GHO, LUSD, crvUSD, mkUSD
 */

export type CoverageType = 'depeg' | 'smart_contract' | 'oracle_failure' | 'bridge_exploit' | 'cex_liquidation';
export type Chain = 'Ethereum' | 'Arbitrum' | 'Base' | 'Polygon' | 'Bitcoin' | 'Lightning' | 'TON' | 'Solana';
export type Stablecoin = 'USDC' | 'USDT' | 'USDP' | 'DAI' | 'FRAX' | 'BUSD' | 'USDe' | 'sUSDe' | 'USDY' | 'PYUSD' | 'GHO' | 'LUSD' | 'crvUSD' | 'mkUSD';

// Map to contract IDs (from risk_multipliers.fc)
export const COVERAGE_TYPE_IDS: Record<CoverageType, number> = {
    'depeg': 0,
    'smart_contract': 1,
    'oracle_failure': 2,
    'bridge_exploit': 3,
    'cex_liquidation': 4,
};

export const CHAIN_IDS: Record<Chain, number> = {
    'Ethereum': 0,
    'Arbitrum': 1,
    'Base': 2,
    'Polygon': 3,
    'Bitcoin': 4,
    'Lightning': 5,
    'TON': 6,
    'Solana': 7,
};

export const STABLECOIN_IDS: Record<Stablecoin, number> = {
    'USDC': 0,
    'USDT': 1,
    'USDP': 2,
    'DAI': 3,
    'FRAX': 4,
    'BUSD': 5,
    'USDe': 6,
    'sUSDe': 7,
    'USDY': 8,
    'PYUSD': 9,
    'GHO': 10,
    'LUSD': 11,
    'crvUSD': 12,
    'mkUSD': 13,
};

// Base rates in basis points (from risk_multipliers.fc)
export const BASE_RATES: Record<CoverageType, number> = {
    'depeg': 80,              // 0.8% APR
    'smart_contract': 200,    // 2.0% APR
    'oracle_failure': 180,    // 1.8% APR
    'bridge_exploit': 200,    // 2.0% APR
    'cex_liquidation': 300,   // 3.0% APR
};

// Chain risk multipliers in basis points (10000 = 1.0x)
export const CHAIN_MULTIPLIERS: Record<Chain, number> = {
    'Ethereum': 10000,   // 1.0x
    'Arbitrum': 11000,   // 1.1x
    'Base': 11000,       // 1.1x
    'Polygon': 12000,    // 1.2x
    'Bitcoin': 9000,     // 0.9x
    'Lightning': 13000,  // 1.3x
    'TON': 11500,        // 1.15x
    'Solana': 14000,     // 1.4x
};

// Stablecoin risk adjustments in basis points
export const STABLECOIN_ADJUSTMENTS: Record<Stablecoin, number> = {
    'USDC': 0,       // Tier 1
    'USDT': 0,       // Tier 1
    'USDP': 0,       // Tier 1
    'DAI': 0,        // Tier 2
    'LUSD': 10,      // Tier 2
    'BUSD': 50,      // Tier 3
    'PYUSD': 25,     // Tier 3
    'FRAX': 75,      // Tier 4
    'GHO': 50,       // Tier 4
    'crvUSD': 60,    // Tier 4
    'mkUSD': 70,     // Tier 4
    'USDe': 100,     // Tier 5
    'sUSDe': 125,    // Tier 5
    'USDY': 110,     // Tier 5
};

export interface ProductKey {
    coverageType: CoverageType;
    chain: Chain;
    stablecoin: Stablecoin;
}

export interface ProductDefinition extends ProductKey {
    coverageTypeId: number;
    chainId: number;
    stablecoinId: number;
    productHash: number;
    baseRate: number;
    chainMultiplier: number;
    stablecoinAdjustment: number;
    adjustedRate: number;
    valid: boolean; // Some combinations are invalid (e.g., Bitcoin only supports USDT)
}

/**
 * Calculate product hash (used in contract for indexing)
 * Hash = (coverage_type << 16) | (chain_id << 8) | stablecoin_id
 */
export function calculateProductHash(coverageType: CoverageType, chain: Chain, stablecoin: Stablecoin): number {
    return (COVERAGE_TYPE_IDS[coverageType] << 16) | (CHAIN_IDS[chain] << 8) | STABLECOIN_IDS[stablecoin];
}

/**
 * Calculate adjusted rate after applying chain multiplier and stablecoin adjustment
 * Formula: (base_rate * chain_multiplier / 10000) + stablecoin_adjustment
 */
export function calculateAdjustedRate(coverageType: CoverageType, chain: Chain, stablecoin: Stablecoin): number {
    const baseRate = BASE_RATES[coverageType];
    const chainMultiplier = CHAIN_MULTIPLIERS[chain];
    const stablecoinAdjustment = STABLECOIN_ADJUSTMENTS[stablecoin];

    // Apply chain multiplier
    const rateAfterChain = Math.floor((baseRate * chainMultiplier) / 10000);

    // Apply stablecoin adjustment (additive)
    return rateAfterChain + stablecoinAdjustment;
}

/**
 * Check if chain-stablecoin combination is valid
 */
export function isValidCombination(chain: Chain, stablecoin: Stablecoin): boolean {
    // Bitcoin only supports USDT
    if (chain === 'Bitcoin') {
        return stablecoin === 'USDT';
    }

    // Lightning supports USDT and USDC
    if (chain === 'Lightning') {
        return stablecoin === 'USDT' || stablecoin === 'USDC';
    }

    // All other chains support all stablecoins
    return true;
}

/**
 * Generate all 560 product definitions
 */
export function generateAllProducts(): ProductDefinition[] {
    const products: ProductDefinition[] = [];

    const coverageTypes: CoverageType[] = ['depeg', 'smart_contract', 'oracle_failure', 'bridge_exploit', 'cex_liquidation'];
    const chains: Chain[] = ['Ethereum', 'Arbitrum', 'Base', 'Polygon', 'Bitcoin', 'Lightning', 'TON', 'Solana'];
    const stablecoins: Stablecoin[] = ['USDC', 'USDT', 'USDP', 'DAI', 'FRAX', 'BUSD', 'USDe', 'sUSDe', 'USDY', 'PYUSD', 'GHO', 'LUSD', 'crvUSD', 'mkUSD'];

    for (const coverageType of coverageTypes) {
        for (const chain of chains) {
            for (const stablecoin of stablecoins) {
                const valid = isValidCombination(chain, stablecoin);

                products.push({
                    coverageType,
                    chain,
                    stablecoin,
                    coverageTypeId: COVERAGE_TYPE_IDS[coverageType],
                    chainId: CHAIN_IDS[chain],
                    stablecoinId: STABLECOIN_IDS[stablecoin],
                    productHash: calculateProductHash(coverageType, chain, stablecoin),
                    baseRate: BASE_RATES[coverageType],
                    chainMultiplier: CHAIN_MULTIPLIERS[chain],
                    stablecoinAdjustment: STABLECOIN_ADJUSTMENTS[stablecoin],
                    adjustedRate: calculateAdjustedRate(coverageType, chain, stablecoin),
                    valid,
                });
            }
        }
    }

    return products;
}

/**
 * Get top 20 most important product combinations (for E2E testing)
 */
export function getTop20Products(): ProductDefinition[] {
    const allProducts = generateAllProducts();

    // Priority ranking based on:
    // 1. Market size (USDC/USDT on Ethereum/Arbitrum)
    // 2. High risk (bridge exploits, CEX liquidations)
    // 3. Edge cases (Bitcoin, Lightning)

    const priorityProducts: Array<[CoverageType, Chain, Stablecoin]> = [
        // Top 5 - Highest volume/importance
        ['depeg', 'Ethereum', 'USDC'],              // #1: Most common use case
        ['depeg', 'Arbitrum', 'USDT'],              // #2: L2 USDT depeg
        ['bridge_exploit', 'Ethereum', 'USDC'],     // #3: Bridge risk (Wormhole scenario)
        ['smart_contract', 'Polygon', 'DAI'],       // #4: DeFi smart contract risk
        ['cex_liquidation', 'Ethereum', 'USDC'],    // #5: Binance USDC liquidation

        // Next 5 - Important L2/sidechain scenarios
        ['depeg', 'Base', 'USDC'],                  // #6: Coinbase L2
        ['oracle_failure', 'Arbitrum', 'USDT'],     // #7: Chainlink oracle failure
        ['bridge_exploit', 'Polygon', 'USDC'],      // #8: Polygon bridge
        ['smart_contract', 'Arbitrum', 'FRAX'],     // #9: Algorithmic stablecoin
        ['depeg', 'Solana', 'USDC'],                // #10: High-risk chain

        // Next 5 - Yield-bearing and complex stablecoins
        ['depeg', 'Ethereum', 'USDe'],              // #11: Ethena delta-neutral
        ['depeg', 'Ethereum', 'sUSDe'],             // #12: Staked USDe
        ['smart_contract', 'Ethereum', 'GHO'],      // #13: Aave GHO
        ['depeg', 'Ethereum', 'crvUSD'],            // #14: Curve stablecoin
        ['bridge_exploit', 'Arbitrum', 'DAI'],      // #15: DAI bridge

        // Next 5 - Edge cases and Bitcoin
        ['depeg', 'Bitcoin', 'USDT'],               // #16: Bitcoin (only valid combo)
        ['depeg', 'Lightning', 'USDC'],             // #17: Lightning USDC
        ['depeg', 'TON', 'USDT'],                   // #18: TON ecosystem
        ['cex_liquidation', 'Arbitrum', 'USDT'],    // #19: L2 CEX liquidation
        ['oracle_failure', 'Ethereum', 'LUSD'],     // #20: Liquity oracle
    ];

    return priorityProducts.map(([coverageType, chain, stablecoin]) => {
        return allProducts.find(p =>
            p.coverageType === coverageType &&
            p.chain === chain &&
            p.stablecoin === stablecoin
        )!;
    });
}

/**
 * Calculate premium for a product (simplified - matches contract logic)
 */
export function calculatePremium(
    product: ProductDefinition,
    coverageAmountNanoTON: bigint,
    durationDays: number
): bigint {
    // Time multiplier (1000 = 1.0x)
    let timeMultiplier = 1000n;
    if (durationDays === 30) {
        timeMultiplier = 1200n; // 1.2x for short term
    } else if (durationDays === 180) {
        timeMultiplier = 900n;  // 0.9x for long term
    }

    // Formula: (amount * adjusted_rate * days / 365 / 10000) * time_multiplier / 1000
    const adjustedRateBigInt = BigInt(product.adjustedRate);
    const daysBigInt = BigInt(durationDays);

    let premium = (coverageAmountNanoTON * adjustedRateBigInt * daysBigInt) / (365n * 10000n);
    premium = (premium * timeMultiplier) / 1000n;

    return premium;
}

/**
 * Mock oracle responses for different chains
 */
export interface OracleResponse {
    chain: Chain;
    oracleType: 'Chainlink' | 'Blockstream' | 'Lightning_Network' | 'TON_API' | 'Pyth';
    price: number;
    timestamp: number;
    confidence: number; // 0-100
}

export function generateMockOracleResponse(chain: Chain, stablecoin: Stablecoin, depegScenario: boolean = false): OracleResponse {
    const oracleTypes: Record<Chain, OracleResponse['oracleType']> = {
        'Ethereum': 'Chainlink',
        'Arbitrum': 'Chainlink',
        'Base': 'Chainlink',
        'Polygon': 'Chainlink',
        'Bitcoin': 'Blockstream',
        'Lightning': 'Lightning_Network',
        'TON': 'TON_API',
        'Solana': 'Pyth',
    };

    // Normal: $1.00, Depeg: $0.95-0.97
    const price = depegScenario ? 0.96 : 1.00;

    return {
        chain,
        oracleType: oracleTypes[chain],
        price,
        timestamp: Math.floor(Date.now() / 1000),
        confidence: depegScenario ? 75 : 95,
    };
}

/**
 * Mock CEX liquidation event
 */
export interface CEXLiquidationEvent {
    exchange: 'Binance' | 'Coinbase' | 'Kraken' | 'OKX';
    stablecoin: Stablecoin;
    amountUSD: number;
    liquidationPrice: number;
    timestamp: number;
    verified: boolean;
}

export function generateMockCEXLiquidation(stablecoin: Stablecoin): CEXLiquidationEvent {
    return {
        exchange: 'Binance',
        stablecoin,
        amountUSD: 1_000_000, // $1M liquidation
        liquidationPrice: 0.97,
        timestamp: Math.floor(Date.now() / 1000),
        verified: true,
    };
}

/**
 * Realistic premium calculations for different scenarios
 */
export interface PremiumScenario {
    name: string;
    product: ProductDefinition;
    coverageAmountTON: number;
    durationDays: number;
    expectedPremiumTON: number;
    notes: string;
}

export function generatePremiumScenarios(): PremiumScenario[] {
    const scenarios: PremiumScenario[] = [];
    const top20 = getTop20Products();

    // Scenario 1: Standard USDC depeg on Ethereum
    const ethUSDCDepeg = top20[0];
    scenarios.push({
        name: 'Standard USDC Depeg (Ethereum, 90 days)',
        product: ethUSDCDepeg,
        coverageAmountTON: 10000,
        durationDays: 90,
        expectedPremiumTON: Number(calculatePremium(ethUSDCDepeg, 10000n * 1000000000n, 90)) / 1e9,
        notes: 'Most common use case - low premium',
    });

    // Scenario 2: CEX liquidation (high risk)
    const cexLiq = top20[4];
    scenarios.push({
        name: 'CEX Liquidation (Ethereum USDC, 30 days)',
        product: cexLiq,
        coverageAmountTON: 50000,
        durationDays: 30,
        expectedPremiumTON: Number(calculatePremium(cexLiq, 50000n * 1000000000n, 30)) / 1e9,
        notes: 'High risk = high premium (3% APR base rate)',
    });

    // Scenario 3: Solana (high chain risk)
    const solanaDepeg = top20[9];
    scenarios.push({
        name: 'USDC Depeg on Solana (90 days)',
        product: solanaDepeg,
        coverageAmountTON: 10000,
        durationDays: 90,
        expectedPremiumTON: Number(calculatePremium(solanaDepeg, 10000n * 1000000000n, 90)) / 1e9,
        notes: 'High chain risk (1.4x multiplier)',
    });

    // Scenario 4: Complex stablecoin (sUSDe)
    const sUSDeDepeg = top20[11];
    scenarios.push({
        name: 'sUSDe Depeg on Ethereum (90 days)',
        product: sUSDeDepeg,
        coverageAmountTON: 10000,
        durationDays: 90,
        expectedPremiumTON: Number(calculatePremium(sUSDeDepeg, 10000n * 1000000000n, 90)) / 1e9,
        notes: 'High stablecoin risk (+125 bps adjustment)',
    });

    // Scenario 5: Bitcoin (edge case)
    const btcDepeg = top20[15];
    scenarios.push({
        name: 'USDT Depeg on Bitcoin (180 days)',
        product: btcDepeg,
        coverageAmountTON: 5000,
        durationDays: 180,
        expectedPremiumTON: Number(calculatePremium(btcDepeg, 5000n * 1000000000n, 180)) / 1e9,
        notes: 'Bitcoin gets discount (0.9x multiplier), long-term discount',
    });

    return scenarios;
}

// Export counts for validation
export const PRODUCT_COUNTS = {
    TOTAL_PRODUCTS: 560,
    COVERAGE_TYPES: 5,
    CHAINS: 8,
    STABLECOINS: 14,
    VALID_PRODUCTS: generateAllProducts().filter(p => p.valid).length,
    INVALID_PRODUCTS: generateAllProducts().filter(p => !p.valid).length,
};
