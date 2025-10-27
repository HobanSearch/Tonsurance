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
export declare class BackendClient {
    private client;
    private baseURL;
    constructor(baseURL?: string);
    /**
     * GET /api/v2/hedging/swing-quote
     * Calculate swing premium with real-time hedge costs
     */
    getSwingQuote(params: SwingQuoteRequest): Promise<SwingQuoteResponse>;
    /**
     * GET /api/v2/hedging/policy/:policy_id/status
     * Get hedge execution status for a policy
     */
    getHedgeStatus(policyId: bigint | number | string): Promise<HedgeStatusResponse>;
    /**
     * GET /api/v2/risk/exposure
     * Get aggregate risk exposure across all policies
     */
    getRiskExposure(): Promise<RiskExposureResponse>;
    /**
     * GET /health
     * Health check endpoint
     */
    healthCheck(): Promise<{
        status: string;
        timestamp: string;
    }>;
}
/**
 * Default export: singleton instance
 */
declare const _default: BackendClient;
export default _default;
