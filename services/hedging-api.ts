import express, { Request, Response, NextFunction } from 'express';
import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
import { PricingOracle, CoverageType } from '../wrappers/PricingOracle';
import { HedgeCoordinator } from '../wrappers/HedgeCoordinator';
import { RiskCalculator } from '../hedging/services/RiskCalculator';

/**
 * Hedging API Server - REST endpoints for Phase 4 Hedged Insurance
 *
 * Endpoints:
 * - GET  /premium/swing-quote - Real-time premium calculation with hedge costs
 * - GET  /hedging/policy/:id/status - Hedge execution status for policy
 * - GET  /hedging/exposure - Risk exposure monitoring across all policies
 */

export interface HedgingAPIConfig {
    port: number;
    tonClient: TonClient;
    pricingOracleAddress: Address;
    hedgeCoordinatorAddress: Address;
    factoryAddress: Address;
    corsOrigin?: string;
}

export class HedgingAPI {
    private app: express.Application;
    private config: HedgingAPIConfig;
    private riskCalculator: RiskCalculator;
    private quoteCache: Map<string, { quote: any; expiresAt: number }> = new Map();

    constructor(config: HedgingAPIConfig) {
        this.config = config;
        this.app = express();
        this.riskCalculator = new RiskCalculator({
            tonClient: config.tonClient,
            factoryAddress: config.factoryAddress,
        });

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
     * Calculate real-time swing premium with hedge costs
     */
    private async getSwingQuote(req: Request, res: Response): Promise<void> {
        try {
            const { coverageType, coverageAmount, duration } = req.query;

            // Validate parameters
            if (!coverageType || !coverageAmount || !duration) {
                res.status(400).json({
                    error: 'Missing required parameters',
                    required: ['coverageType', 'coverageAmount', 'duration'],
                });
                return;
            }

            // Parse parameters
            const coverage = coverageType as 'depeg' | 'exploit' | 'bridge';
            const amount = parseFloat(coverageAmount as string);
            const days = parseInt(duration as string);

            // Check cache
            const cacheKey = `${coverage}-${amount}-${days}`;
            const cached = this.quoteCache.get(cacheKey);
            if (cached && cached.expiresAt > Date.now()) {
                res.json(cached.quote);
                return;
            }

            // Get hedge costs from PricingOracle
            const provider = this.config.tonClient.provider(this.config.pricingOracleAddress);
            const oracle = provider.open(
                PricingOracle.fromAddress(this.config.pricingOracleAddress)
            ) as any;

            const coverageTypeEnum = this.mapCoverageType(coverage);
            const coverageAmountNano = BigInt(Math.floor(amount * 1e9 / 5)); // Convert USD to nanoTON

            const hedgeCostNano = await oracle.calculateHedgeCost(
                coverageTypeEnum,
                coverageAmountNano,
                days
            );

            const hedgeCost = Number(hedgeCostNano) / 1e9 * 5; // Convert back to USD

            // Calculate base premium (0.8% APR)
            const basePremium = (amount * 0.008 * days) / 365;

            // Protocol margin (5% of hedge costs)
            const protocolMargin = hedgeCost * 0.05;

            // Total premium
            const totalPremium = basePremium + hedgeCost + protocolMargin;

            // Calculate savings vs Core Insurance (fixed 2% APR)
            const corePremium = (amount * 0.02 * days) / 365;
            const savings = corePremium - totalPremium;
            const savingsPct = (savings / corePremium) * 100;

            const quote = {
                basePremium: parseFloat(basePremium.toFixed(2)),
                hedgeCosts: {
                    polymarket: parseFloat((hedgeCost * 0.4).toFixed(2)),
                    perpetuals: parseFloat((hedgeCost * 0.4).toFixed(2)),
                    allianz: parseFloat((hedgeCost * 0.2).toFixed(2)),
                    total: parseFloat(hedgeCost.toFixed(2)),
                },
                protocolMargin: parseFloat(protocolMargin.toFixed(2)),
                totalPremium: parseFloat(totalPremium.toFixed(2)),
                savings: parseFloat(savings.toFixed(2)),
                savingsPct: parseFloat(savingsPct.toFixed(1)),
                validUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 min validity
                marketConditions: {
                    timestamp: new Date().toISOString(),
                },
            };

            // Cache for 30 seconds
            this.quoteCache.set(cacheKey, {
                quote,
                expiresAt: Date.now() + 30 * 1000,
            });

            res.json(quote);
        } catch (error: any) {
            console.error('Swing quote error:', error);
            res.status(500).json({
                error: 'Failed to calculate premium',
                message: error.message,
            });
        }
    }

    /**
     * GET /hedging/policy/:id/status
     * Get hedge execution status for a policy
     */
    private async getHedgeStatus(req: Request, res: Response): Promise<void> {
        try {
            const policyId = BigInt(req.params.id);

            // Get hedge position from HedgeCoordinator
            const provider = this.config.tonClient.provider(this.config.hedgeCoordinatorAddress);
            const coordinator = provider.open(
                HedgeCoordinator.fromAddress(this.config.hedgeCoordinatorAddress)
            ) as any;

            const hedgePosition = await coordinator.getHedgePosition(policyId);

            const status = {
                policyId: policyId.toString(),
                hedgesRequested: true,
                hedgesExecuted: {
                    polymarket: {
                        status: this.mapHedgeStatus(hedgePosition.polymarketStatus),
                        amount: hedgePosition.polymarketAmount.toString(),
                        externalId: 'pm-' + policyId.toString(),
                    },
                    perpetuals: {
                        status: this.mapHedgeStatus(hedgePosition.perpetualsStatus),
                        amount: hedgePosition.perpetualsAmount.toString(),
                        externalId: 'perp-' + policyId.toString(),
                    },
                    allianz: {
                        status: this.mapHedgeStatus(hedgePosition.allianzStatus),
                        amount: hedgePosition.allianzAmount.toString(),
                        externalId: 'alz-' + policyId.toString(),
                    },
                },
                fullyHedged:
                    hedgePosition.polymarketStatus === 1 &&
                    hedgePosition.perpetualsStatus === 1 &&
                    hedgePosition.allianzStatus === 1,
                timestamp: new Date().toISOString(),
            };

            res.json(status);
        } catch (error: any) {
            console.error('Hedge status error:', error);
            res.status(500).json({
                error: 'Failed to fetch hedge status',
                message: error.message,
            });
        }
    }

    /**
     * GET /hedging/exposure
     * Get current risk exposure across all policies
     */
    private async getExposure(req: Request, res: Response): Promise<void> {
        try {
            // Calculate exposure using RiskCalculator
            const exposures = await this.riskCalculator.calculateExposure();

            const totalExposure = exposures.reduce(
                (sum, exp) => sum + Number(exp.totalCoverage),
                0
            );

            const byType = exposures.map((exp) => ({
                coverageType: exp.coverageType,
                totalCoverage: Number(exp.totalCoverage) / 1e9 * 5, // Convert to USD
                activePolicies: 0, // TODO: Get from factory
                requiredHedge: Number(exp.requiredHedge) / 1e9 * 5,
                currentHedge: Number(exp.currentHedge) / 1e9 * 5,
                hedgeDeficit: Number(exp.hedgeDeficit) / 1e9 * 5,
                driftPct: (Number(exp.hedgeDeficit) / Number(exp.requiredHedge)) * 100,
            }));

            const needsRebalancing = await this.riskCalculator.needsRebalancing();

            const exposure = {
                totalExposure: totalExposure / 1e9 * 5, // Convert to USD
                byType,
                needsRebalancing,
                timestamp: new Date().toISOString(),
            };

            res.json(exposure);
        } catch (error: any) {
            console.error('Exposure error:', error);
            res.status(500).json({
                error: 'Failed to calculate exposure',
                message: error.message,
            });
        }
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
     * Helper: Map hedge status number to string
     */
    private mapHedgeStatus(status: number): string {
        const map: Record<number, string> = {
            0: 'pending',
            1: 'active',
            2: 'liquidated',
            3: 'failed',
        };
        return map[status] || 'unknown';
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
