"use strict";
/**
 * Backend Client - Type-safe HTTP client for Tonsurance OCaml Backend API
 *
 * Provides TypeScript wrappers for all backend REST endpoints:
 * - Risk exposure calculations
 * - Hedging operations (Phase 4)
 * - Premium quotes
 * - Policy status
 *
 * Architecture:
 * - OCaml backend (port 8080): All business logic, hedge orchestration, risk calculation
 * - TypeScript services: Thin HTTP wrapper layer for frontend consumption
 *
 * Usage:
 * ```typescript
 * const client = new BackendClient('http://localhost:8080');
 * const quote = await client.getSwingQuote({
 *   coverageType: 'depeg',
 *   chain: 'ton',
 *   stablecoin: 'usdt',
 *   coverageAmount: 10000,
 *   durationDays: 30
 * });
 * ```
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackendClient = void 0;
const axios_1 = __importDefault(require("axios"));
// ============================================
// Backend Client
// ============================================
class BackendClient {
    constructor(baseURL = 'http://localhost:8080') {
        this.baseURL = baseURL;
        this.client = axios_1.default.create({
            baseURL,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }
    /**
     * GET /api/v2/hedging/swing-quote
     * Calculate swing premium with real-time hedge costs
     */
    async getSwingQuote(params) {
        try {
            const response = await this.client.get('/api/v2/hedging/swing-quote', {
                params: {
                    coverage_type: params.coverageType,
                    chain: params.chain,
                    stablecoin: params.stablecoin,
                    coverage_amount: params.coverageAmount.toString(),
                    duration_days: params.durationDays.toString(),
                },
            });
            return response.data;
        }
        catch (error) {
            console.error('[BackendClient] Swing quote error:', error.message);
            throw new Error(`Failed to fetch swing quote: ${error.message}`);
        }
    }
    /**
     * GET /api/v2/hedging/policy/:policy_id/status
     * Get hedge execution status for a policy
     */
    async getHedgeStatus(policyId) {
        try {
            const response = await this.client.get(`/api/v2/hedging/policy/${policyId.toString()}/status`);
            return response.data;
        }
        catch (error) {
            console.error('[BackendClient] Hedge status error:', error.message);
            throw new Error(`Failed to fetch hedge status: ${error.message}`);
        }
    }
    /**
     * GET /api/v2/risk/exposure
     * Get aggregate risk exposure across all policies
     */
    async getRiskExposure() {
        try {
            const response = await this.client.get('/api/v2/risk/exposure');
            return response.data;
        }
        catch (error) {
            console.error('[BackendClient] Risk exposure error:', error.message);
            throw new Error(`Failed to fetch risk exposure: ${error.message}`);
        }
    }
    /**
     * GET /health
     * Health check endpoint
     */
    async healthCheck() {
        try {
            const response = await this.client.get('/health');
            return response.data;
        }
        catch (error) {
            console.error('[BackendClient] Health check error:', error.message);
            throw new Error(`Backend health check failed: ${error.message}`);
        }
    }
}
exports.BackendClient = BackendClient;
/**
 * Default export: singleton instance
 */
exports.default = new BackendClient(process.env.BACKEND_API_URL || 'http://localhost:8080');
