import express from 'express';
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
export declare class HedgingAPI {
    private app;
    private config;
    private backendClient;
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
     * Proxy to backend API with caching
     */
    private getSwingQuote;
    /**
     * GET /hedging/policy/:id/status
     * Proxy to backend API
     */
    private getHedgeStatus;
    /**
     * GET /hedging/exposure
     * Proxy to backend API for risk exposure
     */
    private getExposure;
    /**
     * Start API server
     */
    start(): void;
    /**
     * Get Express app (for testing)
     */
    getApp(): express.Application;
}
