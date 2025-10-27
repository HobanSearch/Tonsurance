import express from 'express';
import { Address } from '@ton/core';
import { TonClient } from '@ton/ton';
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
export declare class HedgingAPI {
    private app;
    private config;
    private riskCalculator;
    private quoteCache;
    constructor(config: HedgingAPIConfig);
    /**
     * Setup Express middleware
     */
    private setupMiddleware;
    /**
     * Setup API routes
     */
    private setupRoutes;
    /**
     * GET /premium/swing-quote
     * Calculate real-time swing premium with hedge costs
     */
    private getSwingQuote;
    /**
     * GET /hedging/policy/:id/status
     * Get hedge execution status for a policy
     */
    private getHedgeStatus;
    /**
     * GET /hedging/exposure
     * Get current risk exposure across all policies
     */
    private getExposure;
    /**
     * Helper: Map coverage type string to enum
     */
    private mapCoverageType;
    /**
     * Helper: Map hedge status number to string
     */
    private mapHedgeStatus;
    /**
     * Start API server
     */
    start(): void;
    /**
     * Get Express app (for testing)
     */
    getApp(): express.Application;
}
