"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HedgingWebSocket = void 0;
const ws_1 = require("ws");
const PricingOracle_1 = require("../wrappers/PricingOracle");
class HedgingWebSocket {
    constructor(config) {
        this.subscriptions = new Map();
        this.updateInterval = null;
        this.config = config;
        this.wss = new ws_1.Server({ server: config.server });
        this.setupWebSocket();
    }
    /**
     * Setup WebSocket server
     */
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('📡 New WebSocket connection');
            // Initialize subscription list for this client
            this.subscriptions.set(ws, []);
            // Handle incoming messages
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleMessage(ws, message);
                }
                catch (error) {
                    console.error('WebSocket message error:', error);
                    ws.send(JSON.stringify({
                        error: 'Invalid message format',
                        message: error.message,
                    }));
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
            ws.send(JSON.stringify({
                type: 'connected',
                message: 'Connected to Tonsurance Hedging WebSocket',
                timestamp: new Date().toISOString(),
            }));
        });
        // Start update loop
        this.startUpdateLoop();
        console.log('🌐 WebSocket server initialized');
    }
    /**
     * Handle incoming client messages
     */
    handleMessage(ws, message) {
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
                ws.send(JSON.stringify({
                    error: 'Unknown action',
                    action,
                }));
        }
    }
    /**
     * Handle subscription request
     */
    handleSubscribe(ws, channel, params) {
        const clientSubs = this.subscriptions.get(ws) || [];
        // Check if already subscribed
        const existing = clientSubs.find((sub) => sub.channel === channel);
        if (existing) {
            ws.send(JSON.stringify({
                type: 'error',
                message: `Already subscribed to channel: ${channel}`,
            }));
            return;
        }
        // Add subscription
        clientSubs.push({ ws, channel, params });
        this.subscriptions.set(ws, clientSubs);
        console.log(`📡 Client subscribed to channel: ${channel}`);
        // Send confirmation
        ws.send(JSON.stringify({
            type: 'subscribed',
            channel,
            params,
            timestamp: new Date().toISOString(),
        }));
        // Send initial data
        this.sendInitialData(ws, channel, params);
    }
    /**
     * Handle unsubscribe request
     */
    handleUnsubscribe(ws, channel) {
        const clientSubs = this.subscriptions.get(ws) || [];
        const filtered = clientSubs.filter((sub) => sub.channel !== channel);
        this.subscriptions.set(ws, filtered);
        console.log(`📡 Client unsubscribed from channel: ${channel}`);
        ws.send(JSON.stringify({
            type: 'unsubscribed',
            channel,
            timestamp: new Date().toISOString(),
        }));
    }
    /**
     * Send initial data when client subscribes
     */
    async sendInitialData(ws, channel, params) {
        try {
            if (channel === 'premium') {
                const premiumData = await this.calculatePremium(params);
                ws.send(JSON.stringify({
                    type: 'premium_update',
                    data: premiumData,
                    timestamp: new Date().toISOString(),
                }));
            }
        }
        catch (error) {
            console.error('Failed to send initial data:', error);
        }
    }
    /**
     * Start update loop for all subscriptions
     */
    startUpdateLoop() {
        this.updateInterval = setInterval(async () => {
            await this.broadcastUpdates();
        }, this.config.updateInterval || 5000);
    }
    /**
     * Broadcast updates to all subscribed clients
     */
    async broadcastUpdates() {
        for (const [ws, subs] of this.subscriptions) {
            for (const sub of subs) {
                try {
                    if (sub.channel === 'premium') {
                        const premiumData = await this.calculatePremium(sub.params);
                        ws.send(JSON.stringify({
                            type: 'premium_update',
                            data: premiumData,
                            timestamp: new Date().toISOString(),
                        }));
                    }
                    else if (sub.channel === 'hedge_status') {
                        // TODO: Fetch hedge status from HedgeCoordinator
                        // For now, skip
                    }
                    else if (sub.channel === 'exposure') {
                        // TODO: Calculate exposure
                        // For now, skip
                    }
                }
                catch (error) {
                    console.error(`Failed to broadcast update for channel ${sub.channel}:`, error);
                }
            }
        }
    }
    /**
     * Calculate premium for subscription
     */
    async calculatePremium(params) {
        const { coverageType, coverageAmount, duration } = params;
        // Get hedge costs from PricingOracle
        const provider = this.config.tonClient.provider(this.config.pricingOracleAddress);
        const oracle = provider.open(PricingOracle_1.PricingOracle.createFromAddress(this.config.pricingOracleAddress));
        const coverageTypeEnum = this.mapCoverageType(coverageType);
        const coverageAmountNano = BigInt(Math.floor(coverageAmount * 1e9 / 5)); // Convert USD to nanoTON
        const hedgeCostNano = await oracle.calculateHedgeCost(coverageTypeEnum, coverageAmountNano, duration);
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
    mapCoverageType(type) {
        const map = {
            depeg: PricingOracle_1.CoverageType.DEPEG,
            exploit: PricingOracle_1.CoverageType.EXPLOIT,
            bridge: PricingOracle_1.CoverageType.BRIDGE,
        };
        return map[type] || PricingOracle_1.CoverageType.DEPEG;
    }
    /**
     * Broadcast message to all clients subscribed to a channel
     */
    broadcastToChannel(channel, data) {
        for (const [ws, subs] of this.subscriptions) {
            const sub = subs.find((s) => s.channel === channel);
            if (sub) {
                ws.send(JSON.stringify({
                    type: `${channel}_update`,
                    data,
                    timestamp: new Date().toISOString(),
                }));
            }
        }
    }
    /**
     * Get connected clients count
     */
    getConnectedClients() {
        return this.subscriptions.size;
    }
    /**
     * Stop WebSocket server
     */
    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.wss.close(() => {
            console.log('🛑 WebSocket server stopped');
        });
    }
}
exports.HedgingWebSocket = HedgingWebSocket;
