/**
 * Mock Market Data for Testing
 * Provides realistic mock data for:
 * - Chainlink price feeds (normal + depeg scenarios)
 * - Bridge health data (healthy + compromised)
 * - CEX liquidation data (calm + volatile)
 * - Oracle signatures (valid + invalid)
 */

import { Cell, beginCell, Address } from '@ton/core';

// ===== CHAINLINK PRICE FEED MOCKS =====

export interface ChainlinkPrice {
    roundId: bigint;
    answer: bigint;  // Price with 8 decimals
    startedAt: bigint;
    updatedAt: bigint;
    answeredInRound: bigint;
}

export const NORMAL_USDC_PRICE: ChainlinkPrice = {
    roundId: 100000000001n,
    answer: 100000000n,  // $1.00
    startedAt: BigInt(Date.now() / 1000 - 3600),
    updatedAt: BigInt(Date.now() / 1000),
    answeredInRound: 100000000001n,
};

export const NORMAL_USDT_PRICE: ChainlinkPrice = {
    roundId: 100000000002n,
    answer: 99980000n,  // $0.9998
    startedAt: BigInt(Date.now() / 1000 - 3600),
    updatedAt: BigInt(Date.now() / 1000),
    answeredInRound: 100000000002n,
};

export const DEPEG_USDC_PRICE: ChainlinkPrice = {
    roundId: 100000000050n,
    answer: 91500000n,  // $0.915 (USDC depeg like March 2023)
    startedAt: BigInt(Date.now() / 1000 - 600),
    updatedAt: BigInt(Date.now() / 1000),
    answeredInRound: 100000000050n,
};

export const DEPEG_USDT_PRICE: ChainlinkPrice = {
    roundId: 100000000051n,
    answer: 95200000n,  // $0.952 (slight depeg)
    startedAt: BigInt(Date.now() / 1000 - 1200),
    updatedAt: BigInt(Date.now() / 1000),
    answeredInRound: 100000000051n,
};

export const STALE_PRICE: ChainlinkPrice = {
    roundId: 99999999999n,
    answer: 100000000n,
    startedAt: BigInt(Date.now() / 1000 - 7200),  // 2 hours old
    updatedAt: BigInt(Date.now() / 1000 - 7200),
    answeredInRound: 99999999999n,
};

export const CIRCUIT_BREAKER_TRIGGER_PRICE: ChainlinkPrice = {
    roundId: 100000000100n,
    answer: 40000000n,  // $0.40 (60% drop - should trigger circuit breaker)
    startedAt: BigInt(Date.now() / 1000 - 60),
    updatedAt: BigInt(Date.now() / 1000),
    answeredInRound: 100000000100n,
};

// ===== BRIDGE HEALTH DATA MOCKS =====

export interface BridgeHealthData {
    bridgeId: number;  // 0=CCIP, 1=Wormhole, 2=Axelar, 3=LayerZero
    isHealthy: boolean;
    tvlLocked: bigint;  // Total value locked in nanoTON
    lastHeartbeat: bigint;
    failedTransactions: number;
    avgConfirmationTime: number;  // seconds
    securityScore: number;  // 0-100
}

export const HEALTHY_CCIP: BridgeHealthData = {
    bridgeId: 0,
    isHealthy: true,
    tvlLocked: 50000000000000n,  // 50,000 TON
    lastHeartbeat: BigInt(Date.now() / 1000),
    failedTransactions: 0,
    avgConfirmationTime: 120,
    securityScore: 98,
};

export const HEALTHY_WORMHOLE: BridgeHealthData = {
    bridgeId: 1,
    isHealthy: true,
    tvlLocked: 100000000000000n,  // 100,000 TON
    lastHeartbeat: BigInt(Date.now() / 1000),
    failedTransactions: 2,
    avgConfirmationTime: 180,
    securityScore: 95,
};

export const COMPROMISED_WORMHOLE: BridgeHealthData = {
    bridgeId: 1,
    isHealthy: false,
    tvlLocked: 100000000000000n,
    lastHeartbeat: BigInt(Date.now() / 1000 - 3600),  // 1 hour stale
    failedTransactions: 157,
    avgConfirmationTime: 9999,
    securityScore: 12,  // Security incident detected
};

export const DEGRADED_AXELAR: BridgeHealthData = {
    bridgeId: 2,
    isHealthy: true,
    tvlLocked: 30000000000000n,
    lastHeartbeat: BigInt(Date.now() / 1000),
    failedTransactions: 45,  // Elevated failure rate
    avgConfirmationTime: 600,  // Slow confirmations
    securityScore: 72,  // Degraded but operational
};

// ===== CEX LIQUIDATION DATA MOCKS =====

export interface CEXLiquidationData {
    exchange: string;
    timestamp: bigint;
    totalLiquidations: bigint;  // USD value
    btcLiquidations: bigint;
    ethLiquidations: bigint;
    altcoinLiquidations: bigint;
    longLiquidations: bigint;
    shortLiquidations: bigint;
    uniqueAccounts: number;
    volatilityIndex: number;  // 0-100
}

export const CALM_MARKET_LIQUIDATIONS: CEXLiquidationData = {
    exchange: 'Binance',
    timestamp: BigInt(Date.now() / 1000),
    totalLiquidations: 5000000n,  // $5M
    btcLiquidations: 2000000n,
    ethLiquidations: 1500000n,
    altcoinLiquidations: 1500000n,
    longLiquidations: 2500000n,
    shortLiquidations: 2500000n,
    uniqueAccounts: 120,
    volatilityIndex: 25,
};

export const VOLATILE_MARKET_LIQUIDATIONS: CEXLiquidationData = {
    exchange: 'Binance',
    timestamp: BigInt(Date.now() / 1000),
    totalLiquidations: 850000000n,  // $850M (high volatility event)
    btcLiquidations: 400000000n,
    ethLiquidations: 300000000n,
    altcoinLiquidations: 150000000n,
    longLiquidations: 750000000n,  // Heavy long liquidations
    shortLiquidations: 100000000n,
    uniqueAccounts: 45000,
    volatilityIndex: 92,
};

export const FTX_COLLAPSE_LIQUIDATIONS: CEXLiquidationData = {
    exchange: 'FTX',
    timestamp: BigInt(Date.now() / 1000),
    totalLiquidations: 8000000000n,  // $8B (exchange collapse)
    btcLiquidations: 3000000000n,
    ethLiquidations: 2500000000n,
    altcoinLiquidations: 2500000000n,
    longLiquidations: 8000000000n,  // All longs wiped
    shortLiquidations: 0n,
    uniqueAccounts: 1200000,
    volatilityIndex: 100,
};

// ===== ORACLE SIGNATURE MOCKS =====

export interface OracleSignature {
    oracle: Address;
    data: Cell;
    signature: Buffer;
    timestamp: bigint;
    nonce: bigint;
    isValid: boolean;
}

// Mock oracle addresses (use treasury addresses for testing)
export const ORACLE_1_ADDRESS = Address.parse('EQD4a__8J3mjD_oG0G1tOWC4b1C0eB5lU6-gLvvNKu6u_g6q');
export const ORACLE_2_ADDRESS = Address.parse('EQBGBh8W3_0p4YWYYoVK_oD0QqJnRJM-qNGYoVK_oC8U3EoU');
export const ORACLE_3_ADDRESS = Address.parse('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs');

export function createValidOracleSignature(
    priceData: ChainlinkPrice,
    oracleAddress: Address = ORACLE_1_ADDRESS
): OracleSignature {
    const data = beginCell()
        .storeUint(priceData.roundId, 64)
        .storeUint(priceData.answer, 64)
        .storeUint(priceData.updatedAt, 32)
        .endCell();

    return {
        oracle: oracleAddress,
        data,
        signature: Buffer.from('valid_signature_mock_32bytes_here!'.padEnd(64, '0')),
        timestamp: BigInt(Date.now() / 1000),
        nonce: 1n,
        isValid: true,
    };
}

export function createInvalidOracleSignature(
    priceData: ChainlinkPrice,
    oracleAddress: Address = ORACLE_1_ADDRESS
): OracleSignature {
    const data = beginCell()
        .storeUint(priceData.roundId, 64)
        .storeUint(priceData.answer, 64)
        .storeUint(priceData.updatedAt, 32)
        .endCell();

    return {
        oracle: oracleAddress,
        data,
        signature: Buffer.from('INVALID_SIGNATURE_BAD_BYTES!!!'.padEnd(64, 'X')),
        timestamp: BigInt(Date.now() / 1000),
        nonce: 1n,
        isValid: false,
    };
}

export function createExpiredOracleSignature(
    priceData: ChainlinkPrice,
    oracleAddress: Address = ORACLE_1_ADDRESS
): OracleSignature {
    const data = beginCell()
        .storeUint(priceData.roundId, 64)
        .storeUint(priceData.answer, 64)
        .storeUint(priceData.updatedAt, 32)
        .endCell();

    return {
        oracle: oracleAddress,
        data,
        signature: Buffer.from('valid_signature_mock_32bytes_here!'.padEnd(64, '0')),
        timestamp: BigInt(Date.now() / 1000 - 7200),  // 2 hours old
        nonce: 1n,
        isValid: false,
    };
}

// ===== MULTI-CHAIN STABLECOIN PRICE DATA =====

export interface MultiChainPrice {
    chainId: number;
    stablecoinId: number;
    price: bigint;
    timestamp: bigint;
    confidence: number;  // 0-100
}

export const MULTI_CHAIN_PRICES: MultiChainPrice[] = [
    // Ethereum
    { chainId: 0, stablecoinId: 0, price: 100000000n, timestamp: BigInt(Date.now() / 1000), confidence: 99 },  // USDC
    { chainId: 0, stablecoinId: 1, price: 99980000n, timestamp: BigInt(Date.now() / 1000), confidence: 99 },   // USDT
    { chainId: 0, stablecoinId: 3, price: 100010000n, timestamp: BigInt(Date.now() / 1000), confidence: 98 },  // DAI

    // Arbitrum
    { chainId: 1, stablecoinId: 0, price: 100020000n, timestamp: BigInt(Date.now() / 1000), confidence: 97 },  // USDC
    { chainId: 1, stablecoinId: 1, price: 99970000n, timestamp: BigInt(Date.now() / 1000), confidence: 96 },   // USDT

    // Base
    { chainId: 2, stablecoinId: 0, price: 99990000n, timestamp: BigInt(Date.now() / 1000), confidence: 98 },   // USDC

    // Bitcoin (via Liquid/Omni)
    { chainId: 4, stablecoinId: 1, price: 99950000n, timestamp: BigInt(Date.now() / 1000), confidence: 90 },   // USDT

    // TON
    { chainId: 6, stablecoinId: 0, price: 100000000n, timestamp: BigInt(Date.now() / 1000), confidence: 95 },  // USDC
    { chainId: 6, stablecoinId: 1, price: 99980000n, timestamp: BigInt(Date.now() / 1000), confidence: 94 },   // USDT
];

export const DEPEG_SCENARIO_PRICES: MultiChainPrice[] = [
    // USDC depeg scenario (March 2023 style)
    { chainId: 0, stablecoinId: 0, price: 91500000n, timestamp: BigInt(Date.now() / 1000), confidence: 95 },
    { chainId: 1, stablecoinId: 0, price: 92000000n, timestamp: BigInt(Date.now() / 1000), confidence: 92 },
    { chainId: 2, stablecoinId: 0, price: 91800000n, timestamp: BigInt(Date.now() / 1000), confidence: 93 },
];

// ===== PROTOCOL EXPLOIT DATA =====

export interface ProtocolExploitData {
    protocolName: string;
    chainId: number;
    exploitAmount: bigint;  // USD value
    timestamp: bigint;
    exploitType: string;
    affectedAssets: string[];
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export const MINOR_PROTOCOL_EXPLOIT: ProtocolExploitData = {
    protocolName: 'TestDeFi',
    chainId: 1,
    exploitAmount: 500000n,  // $500k
    timestamp: BigInt(Date.now() / 1000),
    exploitType: 'Flash loan',
    affectedAssets: ['USDC'],
    severity: 'MEDIUM',
};

export const MAJOR_PROTOCOL_EXPLOIT: ProtocolExploitData = {
    protocolName: 'MegaProtocol',
    chainId: 0,
    exploitAmount: 120000000n,  // $120M
    timestamp: BigInt(Date.now() / 1000),
    exploitType: 'Smart contract vulnerability',
    affectedAssets: ['USDC', 'USDT', 'DAI'],
    severity: 'CRITICAL',
};

// ===== GAS ESTIMATION DATA =====

export interface GasEstimate {
    operation: string;
    estimatedGas: bigint;
    maxGas: bigint;
    avgGas: bigint;
}

export const GAS_ESTIMATES: Record<string, GasEstimate> = {
    'policy_creation': {
        operation: 'create_policy',
        estimatedGas: 50000000n,  // 0.05 TON
        maxGas: 100000000n,
        avgGas: 45000000n,
    },
    'claim_submission': {
        operation: 'file_claim',
        estimatedGas: 60000000n,
        maxGas: 120000000n,
        avgGas: 55000000n,
    },
    'vault_deposit': {
        operation: 'deposit',
        estimatedGas: 80000000n,
        maxGas: 150000000n,
        avgGas: 75000000n,
    },
    'vault_withdrawal': {
        operation: 'withdraw',
        estimatedGas: 90000000n,
        maxGas: 180000000n,
        avgGas: 85000000n,
    },
    'loss_absorption': {
        operation: 'absorb_loss',
        estimatedGas: 120000000n,
        maxGas: 250000000n,
        avgGas: 110000000n,
    },
};

// ===== HELPER FUNCTIONS =====

export function createChainlinkPriceCell(price: ChainlinkPrice): Cell {
    return beginCell()
        .storeUint(price.roundId, 64)
        .storeUint(price.answer, 64)
        .storeUint(price.startedAt, 32)
        .storeUint(price.updatedAt, 32)
        .storeUint(price.answeredInRound, 64)
        .endCell();
}

export function createBridgeHealthCell(bridge: BridgeHealthData): Cell {
    return beginCell()
        .storeUint(bridge.bridgeId, 8)
        .storeUint(bridge.isHealthy ? 1 : 0, 1)
        .storeCoins(bridge.tvlLocked)
        .storeUint(bridge.lastHeartbeat, 32)
        .storeUint(bridge.failedTransactions, 32)
        .storeUint(bridge.avgConfirmationTime, 16)
        .storeUint(bridge.securityScore, 8)
        .endCell();
}

export function createLiquidationDataCell(liq: CEXLiquidationData): Cell {
    return beginCell()
        .storeUint(liq.timestamp, 32)
        .storeCoins(liq.totalLiquidations)
        .storeCoins(liq.btcLiquidations)
        .storeCoins(liq.ethLiquidations)
        .storeCoins(liq.altcoinLiquidations)
        .storeCoins(liq.longLiquidations)
        .storeCoins(liq.shortLiquidations)
        .storeUint(liq.uniqueAccounts, 32)
        .storeUint(liq.volatilityIndex, 8)
        .endCell();
}

// ===== REALISTIC TEST SCENARIOS =====

export const TEST_SCENARIOS = {
    'normal_market': {
        prices: [NORMAL_USDC_PRICE, NORMAL_USDT_PRICE],
        bridges: [HEALTHY_CCIP, HEALTHY_WORMHOLE],
        liquidations: CALM_MARKET_LIQUIDATIONS,
        description: 'Normal market conditions - all systems healthy',
    },
    'usdc_depeg': {
        prices: [DEPEG_USDC_PRICE, NORMAL_USDT_PRICE],
        bridges: [HEALTHY_CCIP, HEALTHY_WORMHOLE],
        liquidations: VOLATILE_MARKET_LIQUIDATIONS,
        description: 'USDC depeg scenario (March 2023 style)',
    },
    'bridge_compromise': {
        prices: [NORMAL_USDC_PRICE, NORMAL_USDT_PRICE],
        bridges: [HEALTHY_CCIP, COMPROMISED_WORMHOLE],
        liquidations: CALM_MARKET_LIQUIDATIONS,
        description: 'Wormhole bridge compromised',
    },
    'market_crash': {
        prices: [CIRCUIT_BREAKER_TRIGGER_PRICE, DEPEG_USDT_PRICE],
        bridges: [DEGRADED_AXELAR, HEALTHY_CCIP],
        liquidations: FTX_COLLAPSE_LIQUIDATIONS,
        description: 'Market crash with extreme volatility',
    },
    'stale_oracle': {
        prices: [STALE_PRICE, NORMAL_USDT_PRICE],
        bridges: [HEALTHY_CCIP, HEALTHY_WORMHOLE],
        liquidations: CALM_MARKET_LIQUIDATIONS,
        description: 'Stale oracle data (should be rejected)',
    },
};

export default {
    chainlink: {
        NORMAL_USDC_PRICE,
        NORMAL_USDT_PRICE,
        DEPEG_USDC_PRICE,
        DEPEG_USDT_PRICE,
        STALE_PRICE,
        CIRCUIT_BREAKER_TRIGGER_PRICE,
    },
    bridges: {
        HEALTHY_CCIP,
        HEALTHY_WORMHOLE,
        COMPROMISED_WORMHOLE,
        DEGRADED_AXELAR,
    },
    cex: {
        CALM_MARKET_LIQUIDATIONS,
        VOLATILE_MARKET_LIQUIDATIONS,
        FTX_COLLAPSE_LIQUIDATIONS,
    },
    oracles: {
        createValidOracleSignature,
        createInvalidOracleSignature,
        createExpiredOracleSignature,
    },
    multichain: {
        MULTI_CHAIN_PRICES,
        DEPEG_SCENARIO_PRICES,
    },
    scenarios: TEST_SCENARIOS,
};
