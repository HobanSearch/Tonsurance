import { Server as HTTPServer } from 'http';
import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
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
    updateInterval?: number;
}
export declare class HedgingWebSocket {
    private wss;
    private config;
    private subscriptions;
    private updateInterval;
    constructor(config: WebSocketConfig);
    /**
     * Setup WebSocket server
     */
    private setupWebSocket;
    /**
     * Handle incoming client messages
     */
    private handleMessage;
    /**
     * Handle subscription request
     */
    private handleSubscribe;
    /**
     * Handle unsubscribe request
     */
    private handleUnsubscribe;
    /**
     * Send initial data when client subscribes
     */
    private sendInitialData;
    /**
     * Start update loop for all subscriptions
     */
    private startUpdateLoop;
    /**
     * Broadcast updates to all subscribed clients
     */
    private broadcastUpdates;
    /**
     * Calculate premium for subscription
     */
    private calculatePremium;
    /**
     * Helper: Map coverage type string to enum
     */
    private mapCoverageType;
    /**
     * Broadcast message to all clients subscribed to a channel
     */
    broadcastToChannel(channel: string, data: any): void;
    /**
     * Get connected clients count
     */
    getConnectedClients(): number;
    /**
     * Stop WebSocket server
     */
    stop(): void;
}
