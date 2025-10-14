import { MarketData, VenueData } from '../../hedging/services/HedgeOptimizer';

export interface MarketScenario {
    name: string;
    description: string;
    data: MarketData;
}

// Bull market scenario - low hedge costs
export const BULL_MARKET: MarketScenario = {
    name: 'Bull Market',
    description: 'Low depeg probability, negative funding (we earn), cheap insurance',
    data: {
        polymarket: {
            cost: 0.010,      // 1% probability
            capacity: 1000000,
            confidence: 0.95,
        },
        perpetuals: {
            cost: -0.005,     // Negative funding (we earn 0.5% daily)
            capacity: 5000000,
            confidence: 0.90,
        },
        allianz: {
            cost: 0.003,      // $3 per $1000
            capacity: 2000000,
            confidence: 1.0,
        },
    },
};

// Bear market scenario - high hedge costs
export const BEAR_MARKET: MarketScenario = {
    name: 'Bear Market',
    description: 'High depeg probability, positive funding, expensive insurance',
    data: {
        polymarket: {
            cost: 0.050,      // 5% probability
            capacity: 500000,
            confidence: 0.85,
        },
        perpetuals: {
            cost: 0.015,      // Positive funding (shorts pay longs 1.5% daily)
            capacity: 3000000,
            confidence: 0.80,
        },
        allianz: {
            cost: 0.010,      // $10 per $1000
            capacity: 1000000,
            confidence: 1.0,
        },
    },
};

// Volatile market scenario - mixed conditions
export const VOLATILE_MARKET: MarketScenario = {
    name: 'Volatile Market',
    description: 'Uncertain conditions, moderate costs, varying confidence',
    data: {
        polymarket: {
            cost: 0.030,      // 3% probability
            capacity: 750000,
            confidence: 0.70,
        },
        perpetuals: {
            cost: 0.008,      // Moderate funding
            capacity: 4000000,
            confidence: 0.75,
        },
        allianz: {
            cost: 0.006,      // $6 per $1000
            capacity: 1500000,
            confidence: 1.0,
        },
    },
};

// Crisis scenario - extremely high costs
export const CRISIS: MarketScenario = {
    name: 'Crisis',
    description: 'Major event imminent, very high costs, low capacity',
    data: {
        polymarket: {
            cost: 0.150,      // 15% probability
            capacity: 100000,
            confidence: 0.60,
        },
        perpetuals: {
            cost: 0.050,      // Very high funding
            capacity: 1000000,
            confidence: 0.65,
        },
        allianz: {
            cost: 0.025,      // $25 per $1000
            capacity: 500000,
            confidence: 1.0,
        },
    },
};

// Normal market - baseline scenario
export const NORMAL_MARKET: MarketScenario = {
    name: 'Normal Market',
    description: 'Baseline conditions, moderate costs and capacity',
    data: {
        polymarket: {
            cost: 0.025,      // 2.5% probability
            capacity: 800000,
            confidence: 0.85,
        },
        perpetuals: {
            cost: 0.005,      // Low positive funding
            capacity: 4000000,
            confidence: 0.85,
        },
        allianz: {
            cost: 0.0045,     // $4.50 per $1000
            capacity: 1500000,
            confidence: 1.0,
        },
    },
};

// All scenarios for testing
export const ALL_SCENARIOS: MarketScenario[] = [
    BULL_MARKET,
    BEAR_MARKET,
    VOLATILE_MARKET,
    CRISIS,
    NORMAL_MARKET,
];

// Helper function to generate random market data
export function generateRandomMarketData(): MarketData {
    return {
        polymarket: {
            cost: Math.random() * 0.10,  // 0-10%
            capacity: Math.floor(Math.random() * 1000000) + 100000,
            confidence: 0.5 + Math.random() * 0.5,  // 0.5-1.0
        },
        perpetuals: {
            cost: (Math.random() - 0.5) * 0.02,  // -1% to +1%
            capacity: Math.floor(Math.random() * 5000000) + 1000000,
            confidence: 0.5 + Math.random() * 0.5,
        },
        allianz: {
            cost: Math.random() * 0.015,  // 0-1.5%
            capacity: Math.floor(Math.random() * 2000000) + 500000,
            confidence: 0.9 + Math.random() * 0.1,  // 0.9-1.0
        },
    };
}

// Helper to modify market data
export function adjustMarketData(
    base: MarketData,
    adjustments: Partial<Record<keyof MarketData, Partial<VenueData>>>
): MarketData {
    return {
        polymarket: { ...base.polymarket, ...(adjustments.polymarket || {}) },
        perpetuals: { ...base.perpetuals, ...(adjustments.perpetuals || {}) },
        allianz: { ...base.allianz, ...(adjustments.allianz || {}) },
    };
}
