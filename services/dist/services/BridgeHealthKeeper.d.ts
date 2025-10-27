/**
 * BridgeHealthKeeper Service
 *
 * Monitors cross-chain bridge health and updates pricing risk multipliers
 *
 * Flow:
 * 1. Poll OCaml bridge monitor every 60 seconds
 * 2. Check bridge health scores (TVL drops, oracle consensus, tx success)
 * 3. Calculate risk multipliers (1.0x - 2.0x)
 * 4. Update PricingOracle with bridge-specific risk adjustments
 * 5. Alert on critical bridge issues
 */
export interface BridgeHealthKeeperConfig {
    tonRpcUrl: string;
    keeperMnemonic: string;
    pricingOracleAddress: string;
    ocamlBackendUrl: string;
    updateIntervalSeconds?: number;
    alertWebhookUrl?: string;
}
export interface BridgeHealth {
    bridge_id: string;
    source_chain: string;
    dest_chain: string;
    current_tvl_usd: number;
    previous_tvl_usd: number;
    health_score: number;
    last_updated: number;
    exploit_detected: boolean;
    alerts: BridgeAlert[];
}
export interface BridgeAlert {
    alert_id: string;
    severity: 'Critical' | 'High' | 'Medium' | 'Low';
    alert_type: string;
    message: string;
    timestamp: number;
    resolved: boolean;
}
export declare class BridgeHealthKeeper {
    private client;
    private config;
    private oracle;
    private running;
    private keeperWallet;
    private previousHealth;
    constructor(config: BridgeHealthKeeperConfig);
    /**
     * Initialize keeper wallet
     */
    initialize(): Promise<void>;
    /**
     * Fetch all bridge health data from OCaml backend
     */
    fetchBridgeHealthData(): Promise<BridgeHealth[]>;
    /**
     * Calculate risk multiplier from bridge health score
     *
     * Health Score → Risk Multiplier:
     * 0.9 - 1.0: 1.0x (excellent)
     * 0.7 - 0.9: 1.1x (good)
     * 0.5 - 0.7: 1.3x (moderate)
     * 0.3 - 0.5: 1.6x (poor)
     * 0.0 - 0.3: 2.0x (critical)
     */
    calculateRiskMultiplier(healthScore: number): number;
    /**
     * Check for critical alerts and send notifications
     */
    processCriticalAlerts(bridge: BridgeHealth): Promise<void>;
    /**
     * Detect significant health changes
     */
    detectHealthChange(bridge: BridgeHealth): {
        changed: boolean;
        previousScore: number | null;
        currentScore: number;
        multiplierChange: number;
    };
    /**
     * Update on-chain oracle with bridge risk multipliers
     *
     * Note: This is a placeholder - actual implementation would depend on
     * PricingOracle contract supporting bridge-specific multipliers
     */
    updateBridgeRiskOnChain(bridgeId: string, riskMultiplier: number): Promise<void>;
    /**
     * Main keeper loop - runs every 60 seconds
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
        monitored_bridges: number;
        critical_alerts: number;
        lastUpdate: number;
    }>;
}
