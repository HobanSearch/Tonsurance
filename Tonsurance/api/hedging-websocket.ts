import { Server as WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { PricingOracle, CoverageType } from '../wrappers/PricingOracle';

/**
 * Hedging WebSocket Server - Real-time updates for Phase 4 Hedged Insurance
 *
 * Channels:
 * - premium - Real-time premium updates (updates every 5 seconds)
 * - hedge_status - Hedge execution status updates
 * - exposure - Risk exposure alerts
 */

export interface WebSocketConfig {
    server: HTTPServer;
    tonClient: TonClient;
    pricingOracleAddress: Address;
    updateInterval?: number; // Default: 5000ms
}

interface ClientSubscription {
    ws: WebSocket;
    channel: string;
    params: any;
}

export class HedgingWebSocket {
    private wss: WebSocketServer;
    private config: WebSocketConfig;
    private subscriptions: Map<WebSocket, ClientSubscription[]> = new Map();
    private updateInterval: NodeJS.Timeout | null = null;

    constructor(config: WebSocketConfig) {
        this.config = config;
        this.wss = new WebSocketServer({ server: config.server });

        this.setupWebSocket();
    }

    /**
     * Setup WebSocket server
     */
    private setupWebSocket(): void {
        this.wss.on('connection', (ws: WebSocket) => {
            console.log('📡 New WebSocket connection');

            // Initialize subscription list for this client
            this.subscriptions.set(ws, []);

            // Handle incoming messages
            ws.on('message', (data: string) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(ws, message);
                } catch (error: any) {
                    console.error('WebSocket message error:', error);
                    ws.send(
                        JSON.stringify({
                            error: 'Invalid message format',
                            message: error.message,
                        })
                    );
                }
            });

            // Handle disconnect
            ws.on('close', () => {
                console.log('📡 WebSocket connection closed');
                this.subscriptions.delete(ws);
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
            });

            // Send welcome message
            ws.send(
                JSON.stringify({
                    type: 'connected',
                    message: 'Connected to Tonsurance Hedging WebSocket',
                    timestamp: new Date().toISOString(),
                })
            );
        });

        // Start update loop
        this.startUpdateLoop();

        console.log('🌐 WebSocket server initialized');
    }

    /**
     * Handle incoming client messages
     */
    private handleMessage(ws: WebSocket, message: any): void {
        const { action, channel, params } = message;

        switch (action) {
            case 'subscribe':
                this.handleSubscribe(ws, channel, params);
                break;

            case 'unsubscribe':
                this.handleUnsubscribe(ws, channel);
                break;

            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                break;

            default:
                ws.send(
                    JSON.stringify({
                        error: 'Unknown action',
                        action,
                    })
                );
        }
    }

    /**
     * Handle subscription request
     */
    private handleSubscribe(ws: WebSocket, channel: string, params: any): void {
        const clientSubs = this.subscriptions.get(ws) || [];

        // Check if already subscribed
        const existing = clientSubs.find((sub) => sub.channel === channel);
        if (existing) {
            ws.send(
                JSON.stringify({
                    type: 'error',
                    message: `Already subscribed to channel: ${channel}`,
                })
            );
            return;
        }

        // Add subscription
        clientSubs.push({ ws, channel, params });
        this.subscriptions.set(ws, clientSubs);

        console.log(`📡 Client subscribed to channel: ${channel}`);

        // Send confirmation
        ws.send(
            JSON.stringify({
                type: 'subscribed',
                channel,
                params,
                timestamp: new Date().toISOString(),
            })
        );

        // Send initial data
        this.sendInitialData(ws, channel, params);
    }

    /**
     * Handle unsubscribe request
     */
    private handleUnsubscribe(ws: WebSocket, channel: string): void {
        const clientSubs = this.subscriptions.get(ws) || [];
        const filtered = clientSubs.filter((sub) => sub.channel !== channel);

        this.subscriptions.set(ws, filtered);

        console.log(`📡 Client unsubscribed from channel: ${channel}`);

        ws.send(
            JSON.stringify({
                type: 'unsubscribed',
                channel,
                timestamp: new Date().toISOString(),
            })
        );
    }

    /**
     * Send initial data when client subscribes
     */
    private async sendInitialData(ws: WebSocket, channel: string, params: any): Promise<void> {
        try {
            if (channel === 'premium') {
                const premiumData = await this.calculatePremium(params);
                ws.send(
                    JSON.stringify({
                        type: 'premium_update',
                        data: premiumData,
                        timestamp: new Date().toISOString(),
                    })
                );
            }
        } catch (error: any) {
            console.error('Failed to send initial data:', error);
        }
    }

    /**
     * Start update loop for all subscriptions
     */
    private startUpdateLoop(): void {
        this.updateInterval = setInterval(async () => {
            await this.broadcastUpdates();
        }, this.config.updateInterval || 5000);
    }

    /**
     * Broadcast updates to all subscribed clients
     */
    private async broadcastUpdates(): Promise<void> {
        for (const [ws, subs] of this.subscriptions) {
            for (const sub of subs) {
                try {
                    if (sub.channel === 'premium') {
                        const premiumData = await this.calculatePremium(sub.params);
                        ws.send(
                            JSON.stringify({
                                type: 'premium_update',
                                data: premiumData,
                                timestamp: new Date().toISOString(),
                            })
                        );
                    } else if (sub.channel === 'hedge_status') {
                        // TODO: Fetch hedge status from HedgeCoordinator
                        // For now, skip
                    } else if (sub.channel === 'exposure') {
                        // TODO: Calculate exposure
                        // For now, skip
                    }
                } catch (error: any) {
                    console.error(`Failed to broadcast update for channel ${sub.channel}:`, error);
                }
            }
        }
    }

    /**
     * Calculate premium for subscription
     */
    private async calculatePremium(params: any): Promise<any> {
        const { coverageType, coverageAmount, duration } = params;

        // Get hedge costs from PricingOracle
        const provider = this.config.tonClient.provider(this.config.pricingOracleAddress);
        const oracle = provider.open(PricingOracle.fromAddress(this.config.pricingOracleAddress)) as any;

        const coverageTypeEnum = this.mapCoverageType(coverageType);
        const coverageAmountNano = BigInt(Math.floor(coverageAmount * 1e9 / 5)); // Convert USD to nanoTON

        const hedgeCostNano = await oracle.calculateHedgeCost(
            coverageTypeEnum,
            coverageAmountNano,
            duration
        );

        const hedgeCost = Number(hedgeCostNano) / 1e9 * 5; // Convert back to USD

        // Calculate base premium (0.8% APR)
        const basePremium = (coverageAmount * 0.008 * duration) / 365;

        // Protocol margin (5% of hedge costs)
        const protocolMargin = hedgeCost * 0.05;

        // Total premium
        const totalPremium = basePremium + hedgeCost + protocolMargin;

        return {
            coverageType,
            coverageAmount,
            duration,
            basePremium: parseFloat(basePremium.toFixed(2)),
            hedgeCost: parseFloat(hedgeCost.toFixed(2)),
            protocolMargin: parseFloat(protocolMargin.toFixed(2)),
            totalPremium: parseFloat(totalPremium.toFixed(2)),
        };
    }

    /**
     * Helper: Map coverage type string to enum
     */
    private mapCoverageType(type: string): CoverageType {
        const map: Record<string, CoverageType> = {
            depeg: CoverageType.DEPEG,
            exploit: CoverageType.EXPLOIT,
            bridge: CoverageType.BRIDGE,
        };
        return map[type] || CoverageType.DEPEG;
    }

    /**
     * Broadcast message to all clients subscribed to a channel
     */
    broadcastToChannel(channel: string, data: any): void {
        for (const [ws, subs] of this.subscriptions) {
            const sub = subs.find((s) => s.channel === channel);
            if (sub) {
                ws.send(
                    JSON.stringify({
                        type: `${channel}_update`,
                        data,
                        timestamp: new Date().toISOString(),
                    })
                );
            }
        }
    }

    /**
     * Get connected clients count
     */
    getConnectedClients(): number {
        return this.subscriptions.size;
    }

    /**
     * Stop WebSocket server
     */
    stop(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        this.wss.close(() => {
            console.log('🛑 WebSocket server stopped');
        });
    }
}
