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

import { Address, toNano } from '@ton/core';
import { TonClient } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import axios from 'axios';
import { PricingOracle } from '../wrappers/PricingOracle';

export interface BridgeHealthKeeperConfig {
    tonRpcUrl: string;
    keeperMnemonic: string;
    pricingOracleAddress: string;
    ocamlBackendUrl: string;
    updateIntervalSeconds?: number; // Default: 60 seconds
    alertWebhookUrl?: string; // For critical alerts
}

export interface BridgeHealth {
    bridge_id: string;
    source_chain: string;
    dest_chain: string;
    current_tvl_usd: number;
    previous_tvl_usd: number;
    health_score: number; // 0.0 - 1.0
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

export class BridgeHealthKeeper {
    private client: TonClient;
    private config: BridgeHealthKeeperConfig;
    private oracle: PricingOracle;
    private running: boolean = false;
    private keeperWallet: any;
    private previousHealth: Map<string, BridgeHealth> = new Map();

    constructor(config: BridgeHealthKeeperConfig) {
        this.config = {
            updateIntervalSeconds: 60,
            ...config,
        };

        this.client = new TonClient({
            endpoint: config.tonRpcUrl,
        });

        this.oracle = PricingOracle.createFromAddress(
            Address.parse(config.pricingOracleAddress)
        );
    }

    /**
     * Initialize keeper wallet
     */
    async initialize(): Promise<void> {
        const keyPair = await mnemonicToPrivateKey(
            this.config.keeperMnemonic.split(' ')
        );
        this.keeperWallet = this.client.open({
            address: Address.parse('...'), // Derive from keyPair
            publicKey: keyPair.publicKey,
            secretKey: keyPair.secretKey,
        });

        console.log('[BridgeHealthKeeper] Initialized');
        console.log(`  Update Interval: ${this.config.updateIntervalSeconds}s`);
    }

    /**
     * Fetch all bridge health data from OCaml backend
     */
    async fetchBridgeHealthData(): Promise<BridgeHealth[]> {
        try {
            const response = await axios.get(
                `${this.config.ocamlBackendUrl}/api/v1/bridge/health/all`,
                { timeout: 5000 }
            );
            return response.data.bridges;
        } catch (error) {
            console.error('[BridgeHealthKeeper] Failed to fetch bridge health:', error);
            throw error;
        }
    }

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
    calculateRiskMultiplier(healthScore: number): number {
        if (healthScore > 0.9) return 1.0;
        if (healthScore > 0.7) return 1.1;
        if (healthScore > 0.5) return 1.3;
        if (healthScore > 0.3) return 1.6;
        return 2.0;
    }

    /**
     * Check for critical alerts and send notifications
     */
    async processCriticalAlerts(bridge: BridgeHealth): Promise<void> {
        const criticalAlerts = bridge.alerts.filter(
            a => a.severity === 'Critical' && !a.resolved
        );

        if (criticalAlerts.length === 0) {
            return;
        }

        console.error(`[BridgeHealthKeeper] 🚨 CRITICAL: ${bridge.bridge_id} has ${criticalAlerts.length} critical alerts`);

        for (const alert of criticalAlerts) {
            console.error(`  - ${alert.message}`);

            // Send webhook notification if configured
            if (this.config.alertWebhookUrl) {
                try {
                    await axios.post(this.config.alertWebhookUrl, {
                        bridge_id: bridge.bridge_id,
                        alert_type: alert.alert_type,
                        message: alert.message,
                        severity: alert.severity,
                        timestamp: alert.timestamp,
                    }, { timeout: 3000 });
                } catch (error) {
                    console.error('[BridgeHealthKeeper] Failed to send webhook alert:', error);
                }
            }
        }
    }

    /**
     * Detect significant health changes
     */
    detectHealthChange(bridge: BridgeHealth): {
        changed: boolean;
        previousScore: number | null;
        currentScore: number;
        multiplierChange: number;
    } {
        const previous = this.previousHealth.get(bridge.bridge_id);

        if (!previous) {
            return {
                changed: false,
                previousScore: null,
                currentScore: bridge.health_score,
                multiplierChange: 0,
            };
        }

        const previousMultiplier = this.calculateRiskMultiplier(previous.health_score);
        const currentMultiplier = this.calculateRiskMultiplier(bridge.health_score);
        const multiplierChange = currentMultiplier - previousMultiplier;

        // Significant if multiplier changes by ≥0.1x
        const changed = Math.abs(multiplierChange) >= 0.1;

        return {
            changed,
            previousScore: previous.health_score,
            currentScore: bridge.health_score,
            multiplierChange,
        };
    }

    /**
     * Update on-chain oracle with bridge risk multipliers
     *
     * Note: This is a placeholder - actual implementation would depend on
     * PricingOracle contract supporting bridge-specific multipliers
     */
    async updateBridgeRiskOnChain(
        bridgeId: string,
        riskMultiplier: number
    ): Promise<void> {
        try {
            console.log(`[BridgeHealthKeeper] Updating risk multiplier for ${bridgeId}: ${riskMultiplier}x`);

            // TODO: Implement actual on-chain update
            // This would require extending PricingOracle contract with:
            // sendUpdateBridgeRisk(bridge_id, multiplier_bps)

            // For now, log the update
            console.log(`[BridgeHealthKeeper] ✅ Would update ${bridgeId} to ${riskMultiplier}x`);
        } catch (error) {
            console.error(`[BridgeHealthKeeper] ❌ Failed to update on-chain for ${bridgeId}:`, error);
            throw error;
        }
    }

    /**
     * Main keeper loop - runs every 60 seconds
     */
    async runKeeperLoop(): Promise<void> {
        console.log('[BridgeHealthKeeper] Starting keeper loop...');

        while (this.running) {
            const startTime = Date.now();

            try {
                // Fetch all bridge health data
                const bridges = await this.fetchBridgeHealthData();

                console.log(`[BridgeHealthKeeper] Monitoring ${bridges.length} bridges`);

                for (const bridge of bridges) {
                    // Calculate risk multiplier
                    const riskMultiplier = this.calculateRiskMultiplier(bridge.health_score);

                    // Detect significant changes
                    const change = this.detectHealthChange(bridge);

                    // Log status
                    const statusEmoji = bridge.health_score > 0.9 ? '✅' :
                                        bridge.health_score > 0.7 ? '⚠️' :
                                        bridge.health_score > 0.5 ? '⚠️' : '🚨';

                    console.log(`[BridgeHealthKeeper] ${statusEmoji} ${bridge.bridge_id}: ${(bridge.health_score * 100).toFixed(1)}% → ${riskMultiplier}x`);

                    // Check for critical alerts
                    await this.processCriticalAlerts(bridge);

                    // Update on-chain if significant change
                    if (change.changed) {
                        console.log(`[BridgeHealthKeeper] 📊 Significant change detected:`);
                        console.log(`  Previous: ${(change.previousScore! * 100).toFixed(1)}%`);
                        console.log(`  Current:  ${(change.currentScore * 100).toFixed(1)}%`);
                        console.log(`  Multiplier change: ${change.multiplierChange > 0 ? '+' : ''}${change.multiplierChange.toFixed(2)}x`);

                        await this.updateBridgeRiskOnChain(bridge.bridge_id, riskMultiplier);
                    }

                    // Store for next comparison
                    this.previousHealth.set(bridge.bridge_id, bridge);
                }

            } catch (error) {
                console.error('[BridgeHealthKeeper] Error in keeper loop:', error);
                // Continue running despite errors
            }

            // Calculate sleep time to maintain interval
            const elapsed = Date.now() - startTime;
            const sleepTime = Math.max(
                0,
                this.config.updateIntervalSeconds! * 1000 - elapsed
            );

            if (sleepTime > 0) {
                await new Promise(resolve => setTimeout(resolve, sleepTime));
            }
        }
    }

    /**
     * Start the keeper service
     */
    async start(): Promise<void> {
        if (this.running) {
            console.warn('[BridgeHealthKeeper] Already running');
            return;
        }

        await this.initialize();
        this.running = true;
        await this.runKeeperLoop();
    }

    /**
     * Stop the keeper service
     */
    stop(): void {
        console.log('[BridgeHealthKeeper] Stopping...');
        this.running = false;
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<{
        healthy: boolean;
        monitored_bridges: number;
        critical_alerts: number;
        lastUpdate: number;
    }> {
        try {
            const bridges = await this.fetchBridgeHealthData();

            const criticalAlerts = bridges.reduce((count, bridge) => {
                return count + bridge.alerts.filter(
                    a => a.severity === 'Critical' && !a.resolved
                ).length;
            }, 0);

            return {
                healthy: this.running && criticalAlerts === 0,
                monitored_bridges: bridges.length,
                critical_alerts: criticalAlerts,
                lastUpdate: Date.now(),
            };
        } catch (error) {
            return {
                healthy: false,
                monitored_bridges: 0,
                critical_alerts: 0,
                lastUpdate: 0,
            };
        }
    }
}

/**
 * CLI entry point
 */
if (require.main === module) {
    const keeper = new BridgeHealthKeeper({
        tonRpcUrl: process.env.TON_RPC_URL || 'https://toncenter.com/api/v2/jsonRPC',
        keeperMnemonic: process.env.KEEPER_MNEMONIC || '',
        pricingOracleAddress: process.env.PRICING_ORACLE_ADDRESS || '',
        ocamlBackendUrl: process.env.OCAML_BACKEND_URL || 'http://localhost:8080',
        updateIntervalSeconds: parseInt(process.env.BRIDGE_UPDATE_INTERVAL || '60'),
        alertWebhookUrl: process.env.ALERT_WEBHOOK_URL,
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n[BridgeHealthKeeper] Received SIGINT, shutting down...');
        keeper.stop();
        process.exit(0);
    });

    keeper.start().catch(error => {
        console.error('[BridgeHealthKeeper] Fatal error:', error);
        process.exit(1);
    });
}
