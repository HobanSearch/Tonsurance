"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HedgingAPI = void 0;
const express_1 = __importDefault(require("express"));
const BackendClient_1 = require("./lib/BackendClient");
class HedgingAPI {
    constructor(config) {
        this.quoteCache = new Map();
        this.config = config;
        this.app = (0, express_1.default)();
        this.backendClient = new BackendClient_1.BackendClient(config.backendApiUrl);
        this.setupMiddleware();
        this.setupRoutes();
    }
    /**
     * Setup Express middleware
     */
    setupMiddleware() {
        // CORS
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', this.config.corsOrigin || '*');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            if (req.method === 'OPTIONS') {
                return res.sendStatus(200);
            }
            next();
        });
        // JSON body parser
        this.app.use(express_1.default.json());
        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${req.method} ${req.path}`);
            next();
        });
        // Error handler
        this.app.use((err, req, res, next) => {
            console.error('API Error:', err);
            res.status(500).json({
                error: 'Internal server error',
                message: err.message,
            });
        });
    }
    /**
     * Setup API routes
     */
    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });
        // Swing premium quote
        this.app.get('/premium/swing-quote', this.getSwingQuote.bind(this));
        // Hedge execution status
        this.app.get('/hedging/policy/:id/status', this.getHedgeStatus.bind(this));
        // Exposure monitoring
        this.app.get('/hedging/exposure', this.getExposure.bind(this));
    }
    /**
     * GET /premium/swing-quote
     * Proxy to backend API with caching
     */
    async getSwingQuote(req, res) {
        try {
            const { coverageType, chain, stablecoin, coverageAmount, duration } = req.query;
            // Validate parameters
            if (!coverageType || !chain || !stablecoin || !coverageAmount || !duration) {
                res.status(400).json({
                    error: 'Missing required parameters',
                    required: ['coverageType', 'chain', 'stablecoin', 'coverageAmount', 'duration'],
                });
                return;
            }
            // Parse parameters
            const coverage = coverageType;
            const chainStr = chain;
            const stablecoinStr = stablecoin;
            const amount = parseFloat(coverageAmount);
            const days = parseInt(duration);
            // Check cache
            const cacheKey = `${coverage}-${chainStr}-${stablecoinStr}-${amount}-${days}`;
            const cached = this.quoteCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                res.json(cached.quote);
                return;
            }
            // Call backend API
            const quote = await this.backendClient.getSwingQuote({
                coverageType: coverage,
                chain: chainStr,
                stablecoin: stablecoinStr,
                coverageAmount: amount,
                durationDays: days,
            });
            // Cache for 30 seconds
            this.quoteCache.set(cacheKey, {
                quote,
                expiresAt: Date.now() + 30 * 1000,
            });
            res.json(quote);
        }
        catch (error) {
            console.error('[HedgingAPI] Swing quote error:', error.message);
            res.status(500).json({
                error: 'Failed to calculate premium',
                message: error.message,
            });
        }
    }
    /**
     * GET /hedging/policy/:id/status
     * Proxy to backend API
     */
    async getHedgeStatus(req, res) {
        try {
            const policyId = req.params.id;
            // Call backend API
            const status = await this.backendClient.getHedgeStatus(policyId);
            res.json(status);
        }
        catch (error) {
            console.error('[HedgingAPI] Hedge status error:', error.message);
            res.status(500).json({
                error: 'Failed to fetch hedge status',
                message: error.message,
            });
        }
    }
    /**
     * GET /hedging/exposure
     * Proxy to backend API for risk exposure
     */
    async getExposure(req, res) {
        try {
            // Call backend API
            const exposure = await this.backendClient.getRiskExposure();
            res.json(exposure);
        }
        catch (error) {
            console.error('[HedgingAPI] Exposure error:', error.message);
            res.status(500).json({
                error: 'Failed to calculate exposure',
                message: error.message,
            });
        }
    }
    /**
     * Start API server
     */
    start() {
        this.app.listen(this.config.port, () => {
            console.log(`🌐 Hedging API server started on port ${this.config.port}`);
            console.log(`   Health check: http://localhost:${this.config.port}/health`);
            console.log(`   Swing quote: http://localhost:${this.config.port}/premium/swing-quote`);
            console.log(`   Hedge status: http://localhost:${this.config.port}/hedging/policy/:id/status`);
            console.log(`   Exposure: http://localhost:${this.config.port}/hedging/exposure`);
        });
    }
    /**
     * Get Express app (for testing)
     */
    getApp() {
        return this.app;
    }
}
exports.HedgingAPI = HedgingAPI;
