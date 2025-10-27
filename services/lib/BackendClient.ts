/**
 * Backend Client - Type-safe HTTP client for Tonsurance OCaml Backend API
 *
 * Provides TypeScript wrappers for all backend REST endpoints:
 * - Risk exposure calculations
 * - Hedging operations (Phase 4)
 * - Premium quotes
 * - Policy status
 *
 * Architecture:
 * - OCaml backend (port 8080): All business logic, hedge orchestration, risk calculation
 * - TypeScript services: Thin HTTP wrapper layer for frontend consumption
 *
 * Usage:
 * ```typescript
 * const client = new BackendClient('http://localhost:8080');
 * const quote = await client.getSwingQuote({
 *   coverageType: 'depeg',
 *   chain: 'ton',
 *   stablecoin: 'usdt',
 *   coverageAmount: 10000,
 *   durationDays: 30
 * });
 * ```
 */

import axios, { AxiosInstance } from 'axios';

// ============================================
// Type Definitions
// ============================================

export type CoverageType = 'depeg' | 'exploit' | 'bridge' | 'cex_liquidation' | 'oracle_failure';
export type Blockchain = 'ton' | 'ethereum' | 'arbitrum' | 'polygon' | 'bsc' | 'avalanche' | 'optimism' | 'base';
export type Stablecoin = 'usdt' | 'usdc' | 'dai' | 'frax' | 'busd' | 'tusd' | 'usdp' | 'lusd' | 'gusd' | 'usdd' | 'fdusd' | 'usdj' | 'usde' | 'other';

export interface SwingQuoteRequest {
    coverageType: CoverageType;
    chain: Blockchain;
    stablecoin: Stablecoin;
    coverageAmount: number;
    durationDays: number;
}

export interface HedgeCosts {
    polymarket: number;
    hyperliquid: number;
    binance: number;
    allianz: number;
    total: number;
}

export interface SwingQuoteResponse {
    base_premium: number;
    hedge_costs: HedgeCosts;
    protocol_margin: number;
    total_premium: number;
    savings_vs_core: number;
    savings_pct: number;
    valid_until: string;
    hedge_ratio: number;
    timestamp: number;
}

export interface HedgePosition {
    status: 'pending' | 'active' | 'liquidated' | 'failed';
    amount: number;
    external_id: string;
}

export interface HedgeStatusResponse {
    policy_id: string;
    hedges_requested: boolean;
    hedges_executed: {
        polymarket: HedgePosition;
        hyperliquid: HedgePosition;
        binance: HedgePosition;
        allianz: HedgePosition;
    };
    fully_hedged: boolean;
    total_hedge_amount: number;
    timestamp: number;
}

export interface ExposureByType {
    coverage_type: string;
    exposure_usd: number;
}

export interface ExposureByChain {
    chain: string;
    exposure_usd: number;
}

export interface ExposureByStablecoin {
    stablecoin: string;
    exposure_usd: number;
}

export interface TopProduct {
    coverage_type: string;
    chain: string;
    stablecoin: string;
    exposure_usd: number;
    policy_count: number;
}

export interface RiskExposureResponse {
    by_coverage_type: ExposureByType[];
    by_chain: ExposureByChain[];
    by_stablecoin: ExposureByStablecoin[];
    top_10_products: TopProduct[];
    total_policies: number;
    timestamp: number;
}

// ============================================
// Backend Client
// ============================================

export class BackendClient {
    private client: AxiosInstance;
    private baseURL: string;

    constructor(baseURL: string = 'http://localhost:8080') {
        this.baseURL = baseURL;
        this.client = axios.create({
            baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * GET /api/v2/hedging/swing-quote
     * Calculate swing premium with real-time hedge costs
     */
    async getSwingQuote(params: SwingQuoteRequest): Promise<SwingQuoteResponse> {
        try {
            const response = await this.client.get('/api/v2/hedging/swing-quote', {
                params: {
                    coverage_type: params.coverageType,
                    chain: params.chain,
                    stablecoin: params.stablecoin,
                    coverage_amount: params.coverageAmount.toString(),
                    duration_days: params.durationDays.toString(),
                },
            });

            return response.data;
        } catch (error: any) {
            console.error('[BackendClient] Swing quote error:', error.message);
            throw new Error(`Failed to fetch swing quote: ${error.message}`);
        }
    }

    /**
     * GET /api/v2/hedging/policy/:policy_id/status
     * Get hedge execution status for a policy
     */
    async getHedgeStatus(policyId: bigint | number | string): Promise<HedgeStatusResponse> {
        try {
            const response = await this.client.get(`/api/v2/hedging/policy/${policyId.toString()}/status`);
            return response.data;
        } catch (error: any) {
            console.error('[BackendClient] Hedge status error:', error.message);
            throw new Error(`Failed to fetch hedge status: ${error.message}`);
        }
    }

    /**
     * GET /api/v2/risk/exposure
     * Get aggregate risk exposure across all policies
     */
    async getRiskExposure(): Promise<RiskExposureResponse> {
        try {
            const response = await this.client.get('/api/v2/risk/exposure');
            return response.data;
        } catch (error: any) {
            console.error('[BackendClient] Risk exposure error:', error.message);
            throw new Error(`Failed to fetch risk exposure: ${error.message}`);
        }
    }

    /**
     * GET /health
     * Health check endpoint
     */
    async healthCheck(): Promise<{ status: string; timestamp: string }> {
        try {
            const response = await this.client.get('/health');
            return response.data;
        } catch (error: any) {
            console.error('[BackendClient] Health check error:', error.message);
            throw new Error(`Backend health check failed: ${error.message}`);
        }
    }
}

/**
 * Default export: singleton instance
 */
export default new BackendClient(process.env.BACKEND_API_URL || 'http://localhost:8080');
