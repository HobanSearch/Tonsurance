import { toNano } from '@ton/core';

export interface MockPolicy {
    id: bigint;
    userAddress: string;
    coverageType: number;
    coverageAmount: bigint;
    durationDays: number;
    basePremium: bigint;
    hedgeCosts: {
        polymarket: bigint;
        perpetuals: bigint;
        allianz: bigint;
    };
    totalPremium: bigint;
    createdAt: number;
    expiresAt: number;
    hedgeStatus: 'PENDING' | 'FILLED' | 'FAILED';
}

export function generateMockPolicy(overrides: Partial<MockPolicy> = {}): MockPolicy {
    const id = overrides.id || BigInt(Math.floor(Math.random() * 10000));
    const coverageAmount = overrides.coverageAmount || toNano(String(Math.floor(Math.random() * 90000) + 10000));
    const durationDays = overrides.durationDays || [7, 14, 30, 60, 90][Math.floor(Math.random() * 5)];

    // Calculate base premium (0.8% APR)
    const basePremium = (coverageAmount * BigInt(80) * BigInt(durationDays)) / (BigInt(10000) * BigInt(365));

    // Calculate hedge costs
    const hedgeCosts = {
        polymarket: (coverageAmount * BigInt(25) * BigInt(40)) / (BigInt(10000) * BigInt(100)), // 2.5% * 40%
        perpetuals: (coverageAmount * BigInt(50) * BigInt(durationDays) * BigInt(40)) / (BigInt(10000) * BigInt(100)), // 0.5% daily * 40%
        allianz: (coverageAmount * BigInt(450) * BigInt(20)) / (BigInt(100000) * BigInt(100)), // $4.50 per $1k * 20%
    };

    const totalPremium = basePremium + hedgeCosts.polymarket + hedgeCosts.perpetuals + hedgeCosts.allianz;

    const now = Math.floor(Date.now() / 1000);

    return {
        id,
        userAddress: overrides.userAddress || `EQC${randomHex(64)}`,
        coverageType: overrides.coverageType || randomChoice([1, 2, 3]),
        coverageAmount,
        durationDays,
        basePremium,
        hedgeCosts,
        totalPremium,
        createdAt: overrides.createdAt || now,
        expiresAt: overrides.expiresAt || (now + durationDays * 86400),
        hedgeStatus: overrides.hedgeStatus || 'FILLED',
    };
}

export function generateMockPolicies(count: number): MockPolicy[] {
    return Array.from({ length: count }, (_, i) =>
        generateMockPolicy({ id: BigInt(i + 1) })
    );
}

// Utility functions
function randomHex(length: number): string {
    const chars = '0123456789abcdef';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
}

function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

// Preset scenarios
export const SCENARIO_DEPEG_EVENT = {
    name: 'USDT Depegs to $0.95',
    policies: generateMockPolicies(50).map(p => ({
        ...p,
        coverageType: 1, // All DEPEG policies
    })),
};

export const SCENARIO_HIGH_VOLUME = {
    name: 'High Volume Day',
    policies: generateMockPolicies(100),
};

export const SCENARIO_MIXED_COVERAGE = {
    name: 'Mixed Coverage Types',
    policies: [
        ...generateMockPolicies(20).map(p => ({ ...p, coverageType: 1 })), // DEPEG
        ...generateMockPolicies(15).map(p => ({ ...p, coverageType: 2 })), // EXPLOIT
        ...generateMockPolicies(10).map(p => ({ ...p, coverageType: 3 })), // BRIDGE
    ],
};
