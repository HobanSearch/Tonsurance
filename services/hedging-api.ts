import express, { Request, Response, NextFunction } from 'express';
import { BackendClient } from './lib/BackendClient';

/**
 * Hedging API Server - REST endpoints for Phase 4 Hedged Insurance
 *
 * Architecture:
 * - This is a thin TypeScript wrapper layer for the frontend
 * - All business logic lives in the OCaml backend
 * - Proxies requests to backend API and adds minimal caching
 *
 * Endpoints:
 * - GET  /premium/swing-quote - Real-time premium calculation with hedge costs
 * - GET  /hedging/policy/:id/status - Hedge execution status for policy
 * - GET  /hedging/exposure - Risk exposure monitoring across all policies
 */

export interface HedgingAPIConfig {
    port: number;
    backendApiUrl: string;
    corsOrigin?: string;
}

export class HedgingAPI {
    private app: express.Application;
    private config: HedgingAPIConfig;
    private backendClient: BackendClient;
    private quoteCache: Map<string, { quote: any; expiresAt: number }> = new Map();

    constructor(config: HedgingAPIConfig) {
        this.config = config;
        this.app = express();
        this.backendClient = new BackendClient(config.backendApiUrl);

        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup Express middleware
     */
    private setupMiddleware(): void {
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
        this.app.use(express.json());

        // Request logging
        this.app.use((req, res, next) => {
            console.log(`${req.method} ${req.path}`);
            next();
        });

        // Error handler
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
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
    private setupRoutes(): void {
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
    private async getSwingQuote(req: Request, res: Response): Promise<void> {
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
            const coverage = coverageType as string;
            const chainStr = chain as string;
            const stablecoinStr = stablecoin as string;
            const amount = parseFloat(coverageAmount as string);
            const days = parseInt(duration as string);

            // Check cache
            const cacheKey = `${coverage}-${chainStr}-${stablecoinStr}-${amount}-${days}`;
            const cached = this.quoteCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                res.json(cached.quote);
                return;
            }

            // Call backend API
            const quote = await this.backendClient.getSwingQuote({
                coverageType: coverage as any,
                chain: chainStr as any,
                stablecoin: stablecoinStr as any,
                coverageAmount: amount,
                durationDays: days,
            });

            // Cache for 30 seconds
            this.quoteCache.set(cacheKey, {
                quote,
                expiresAt: Date.now() + 30 * 1000,
            });

            res.json(quote);
        } catch (error: any) {
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
    private async getHedgeStatus(req: Request, res: Response): Promise<void> {
        try {
            const policyId = req.params.id;

            // Call backend API
            const status = await this.backendClient.getHedgeStatus(policyId);

            res.json(status);
        } catch (error: any) {
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
    private async getExposure(req: Request, res: Response): Promise<void> {
        try {
            // Call backend API
            const exposure = await this.backendClient.getRiskExposure();

            res.json(exposure);
        } catch (error: any) {
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
    start(): void {
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
    getApp(): express.Application {
        return this.app;
    }
}
