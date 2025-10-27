/**
 * PricingOracleKeeper Service
 *
 * CRITICAL SERVICE: Bridges OCaml oracle aggregator to TON PricingOracle contract
 *
 * Flow:
 * 1. Poll OCaml backend every 5 seconds for consensus prices
 * 2. Fetch external hedge costs (Polymarket, Perpetuals, Allianz)
 * 3. Calculate total swing premium
 * 4. Update PricingOracle contract on-chain
 *
 * This keeper ensures real-time pricing for Phase 4 Hedged Insurance
 */
import { CoverageType } from '../wrappers/PricingOracle';
export interface PricingOracleKeeperConfig {
    tonRpcUrl: string;
    keeperMnemonic: string;
    pricingOracleAddress: string;
    ocamlBackendUrl: string;
    polymarketApiKey?: string;
    binanceApiKey?: string;
    allianzApiKey?: string;
    updateIntervalSeconds?: number;
}
export interface OCamlConsensusPrice {
    asset: string;
    price: number;
    weighted_price: number;
    median_price: number;
    std_deviation: number;
    num_sources: number;
    timestamp: number;
    confidence: number;
    is_stale: boolean;
    has_anomaly: boolean;
}
export interface HedgeCosts {
    polymarketOdds: number;
    perpFundingRate: number;
    allianzQuote: number;
}
export declare class PricingOracleKeeper {
    private client;
    private config;
    private oracle;
    private running;
    private keeperWallet;
    constructor(config: PricingOracleKeeperConfig);
    /**
     * Initialize keeper wallet from mnemonic
     */
    initialize(): Promise<void>;
    /**
     * Fetch consensus price from OCaml backend
     */
    fetchOCamlPrice(asset: string): Promise<OCamlConsensusPrice>;
    /**
     * Fetch Polymarket prediction market odds
     *
     * Example: "USDT < $0.98 in Q1 2026" market
     * YES price of $0.025 = 2.5% implied probability
     */
    fetchPolymarketOdds(coverageType: CoverageType): Promise<number>;
    /**
     * Fetch perpetual futures funding rate
     *
     * Example: Binance TONUSDT-PERP funding rate
     * Negative rate means shorts pay longs (we earn)
     */
    fetchPerpFundingRate(asset: string): Promise<number>;
    /**
     * Fetch Allianz parametric insurance quote
     *
     * Example: $4.50 per $1000 coverage for 30-day USDT depeg
     */
    fetchAllianzQuote(coverageType: CoverageType): Promise<number>;
    /**
     * Fetch all hedge costs for a coverage type
     */
    fetchHedgeCosts(coverageType: CoverageType): Promise<HedgeCosts>;
    /**
     * Update PricingOracle contract with latest hedge costs
     */
    updateOracleOnChain(coverageType: CoverageType, hedgeCosts: HedgeCosts): Promise<void>;
    /**
     * Main keeper loop - runs every 5 seconds
     */
    runKeeperLoop(): Promise<void>;
    /**
     * Start the keeper service
     */
    start(): Promise<void>;
    /**
     * Stop the keeper service
     */
    stop(): void;
    /**
     * Health check
     */
    healthCheck(): Promise<{
        healthy: boolean;
        lastUpdate: number;
        ocamlBackend: boolean;
        externalApis: boolean;
    }>;
}
