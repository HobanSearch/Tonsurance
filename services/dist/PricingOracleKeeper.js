"use strict";
/**
 * PricingOracleKeeper Service
 *
 * CRITICAL SERVICE: Bridges OCaml oracle aggregator to TON PricingOracle contract
 *
 * Flow:
 * 1. Poll OCaml backend every 5 seconds for consensus prices
 * 2. Fetch external hedge costs (Polymarket, Perpetuals, Allianz)
 * 3. Calculate total swing premium
 * 4. Update PricingOracle contract on-chain
 *
 * This keeper ensures real-time pricing for Phase 4 Hedged Insurance
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingOracleKeeper = void 0;
const core_1 = require("@ton/core");
const ton_1 = require("@ton/ton");
const crypto_1 = require("@ton/crypto");
const axios_1 = __importDefault(require("axios"));
const PricingOracle_1 = require("../wrappers/PricingOracle");
class PricingOracleKeeper {
    constructor(config) {
        this.running = false;
        this.config = {
            updateIntervalSeconds: 5,
            ...config,
        };
        this.client = new ton_1.TonClient({
            endpoint: config.tonRpcUrl,
        });
        this.oracle = PricingOracle_1.PricingOracle.createFromAddress(core_1.Address.parse(config.pricingOracleAddress));
    }
    /**
     * Initialize keeper wallet from mnemonic
     */
    async initialize() {
        const keyPair = await (0, crypto_1.mnemonicToPrivateKey)(this.config.keeperMnemonic.split(' '));
        this.keeperWallet = this.client.open({
            address: core_1.Address.parse('...'), // Derive from keyPair
            publicKey: keyPair.publicKey,
            secretKey: keyPair.secretKey,
        });
        console.log('[PricingOracleKeeper] Initialized');
        console.log(`  Oracle Address: ${this.config.pricingOracleAddress}`);
        console.log(`  Update Interval: ${this.config.updateIntervalSeconds}s`);
    }
    /**
     * Fetch consensus price from OCaml backend
     */
    async fetchOCamlPrice(asset) {
        try {
            const response = await axios_1.default.get(`${this.config.ocamlBackendUrl}/api/v1/consensus-price/${asset}`, { timeout: 3000 });
            return response.data;
        }
        catch (error) {
            console.error(`[PricingOracleKeeper] Failed to fetch OCaml price for ${asset}:`, error);
            throw error;
        }
    }
    /**
     * Fetch Polymarket prediction market odds
     *
     * Example: "USDT < $0.98 in Q1 2026" market
     * YES price of $0.025 = 2.5% implied probability
     */
    async fetchPolymarketOdds(coverageType) {
        if (!this.config.polymarketApiKey) {
            console.warn('[PricingOracleKeeper] Polymarket API key not configured, using default');
            return 250; // 2.5% default
        }
        try {
            // In production: Query Polymarket CLOB API for relevant market
            // For now: Mock realistic values
            const mockOdds = {
                [PricingOracle_1.CoverageType.DEPEG]: 250, // 2.5% - USDT depeg probability
                [PricingOracle_1.CoverageType.EXPLOIT]: 150, // 1.5% - Smart contract hack
                [PricingOracle_1.CoverageType.BRIDGE]: 300, // 3.0% - Bridge exploit
            };
            return mockOdds[coverageType] || 200;
        }
        catch (error) {
            console.error('[PricingOracleKeeper] Failed to fetch Polymarket odds:', error);
            return 250; // Fallback
        }
    }
    /**
     * Fetch perpetual futures funding rate
     *
     * Example: Binance TONUSDT-PERP funding rate
     * Negative rate means shorts pay longs (we earn)
     */
    async fetchPerpFundingRate(asset) {
        if (!this.config.binanceApiKey) {
            console.warn('[PricingOracleKeeper] Binance API key not configured, using default');
            return -50; // -0.5% daily (we earn)
        }
        try {
            // In production: Query Binance Futures API
            // GET /fapi/v1/fundingRate?symbol=TONUSDT
            // For now: Mock realistic funding rates
            return -50; // -0.5% daily (shorts pay longs)
        }
        catch (error) {
            console.error('[PricingOracleKeeper] Failed to fetch funding rate:', error);
            return 0; // Neutral fallback
        }
    }
    /**
     * Fetch Allianz parametric insurance quote
     *
     * Example: $4.50 per $1000 coverage for 30-day USDT depeg
     */
    async fetchAllianzQuote(coverageType) {
        if (!this.config.allianzApiKey) {
            console.warn('[PricingOracleKeeper] Allianz API key not configured, using default');
            return 450; // $4.50 per $1000
        }
        try {
            // In production: Query Allianz Parametric API
            // POST /api/quote with coverage details
            // For now: Mock institutional insurance pricing
            const mockQuotes = {
                [PricingOracle_1.CoverageType.DEPEG]: 450, // $4.50 per $1000
                [PricingOracle_1.CoverageType.EXPLOIT]: 600, // $6.00 per $1000
                [PricingOracle_1.CoverageType.BRIDGE]: 550, // $5.50 per $1000
            };
            return mockQuotes[coverageType] || 500;
        }
        catch (error) {
            console.error('[PricingOracleKeeper] Failed to fetch Allianz quote:', error);
            return 500; // Fallback
        }
    }
    /**
     * Fetch all hedge costs for a coverage type
     */
    async fetchHedgeCosts(coverageType) {
        const [polymarketOdds, perpFundingRate, allianzQuote] = await Promise.all([
            this.fetchPolymarketOdds(coverageType),
            this.fetchPerpFundingRate('USDT'), // Asset-specific in production
            this.fetchAllianzQuote(coverageType),
        ]);
        return {
            polymarketOdds,
            perpFundingRate,
            allianzQuote,
        };
    }
    /**
     * Update PricingOracle contract with latest hedge costs
     */
    async updateOracleOnChain(coverageType, hedgeCosts) {
        try {
            console.log(`[PricingOracleKeeper] Updating oracle for coverage type ${coverageType}:`);
            console.log(`  Polymarket Odds: ${hedgeCosts.polymarketOdds} bps (${hedgeCosts.polymarketOdds / 100}%)`);
            console.log(`  Perp Funding: ${hedgeCosts.perpFundingRate} bps/day (${hedgeCosts.perpFundingRate / 100}%)`);
            console.log(`  Allianz Quote: ${hedgeCosts.allianzQuote} cents/$1000 ($${hedgeCosts.allianzQuote / 100})`);
            // Send transaction to PricingOracle contract
            await this.oracle.sendUpdateHedgePrices(this.client.provider(this.oracle.address), this.keeperWallet.sender(), {
                value: (0, core_1.toNano)('0.05'), // 0.05 TON for gas
                coverageType,
                polymarketOdds: hedgeCosts.polymarketOdds,
                perpFundingRate: hedgeCosts.perpFundingRate,
                allianzQuote: hedgeCosts.allianzQuote,
            });
            console.log('[PricingOracleKeeper] ✅ On-chain update successful');
        }
        catch (error) {
            console.error('[PricingOracleKeeper] ❌ Failed to update on-chain:', error);
            throw error;
        }
    }
    /**
     * Main keeper loop - runs every 5 seconds
     */
    async runKeeperLoop() {
        console.log('[PricingOracleKeeper] Starting keeper loop...');
        while (this.running) {
            const startTime = Date.now();
            try {
                // Fetch hedge costs for all coverage types
                const depegCosts = await this.fetchHedgeCosts(PricingOracle_1.CoverageType.DEPEG);
                const exploitCosts = await this.fetchHedgeCosts(PricingOracle_1.CoverageType.EXPLOIT);
                const bridgeCosts = await this.fetchHedgeCosts(PricingOracle_1.CoverageType.BRIDGE);
                // Update on-chain oracle (3 transactions)
                await this.updateOracleOnChain(PricingOracle_1.CoverageType.DEPEG, depegCosts);
                await this.updateOracleOnChain(PricingOracle_1.CoverageType.EXPLOIT, exploitCosts);
                await this.updateOracleOnChain(PricingOracle_1.CoverageType.BRIDGE, bridgeCosts);
                // Optional: Fetch OCaml consensus prices for logging/validation
                const usdcPrice = await this.fetchOCamlPrice('USDC');
                console.log(`[PricingOracleKeeper] OCaml USDC price: $${usdcPrice.price} (${usdcPrice.num_sources} sources)`);
            }
            catch (error) {
                console.error('[PricingOracleKeeper] Error in keeper loop:', error);
                // Continue running despite errors
            }
            // Calculate sleep time to maintain 5-second interval
            const elapsed = Date.now() - startTime;
            const sleepTime = Math.max(0, this.config.updateIntervalSeconds * 1000 - elapsed);
            if (sleepTime > 0) {
                await new Promise(resolve => setTimeout(resolve, sleepTime));
            }
        }
    }
    /**
     * Start the keeper service
     */
    async start() {
        if (this.running) {
            console.warn('[PricingOracleKeeper] Already running');
            return;
        }
        await this.initialize();
        this.running = true;
        await this.runKeeperLoop();
    }
    /**
     * Stop the keeper service
     */
    stop() {
        console.log('[PricingOracleKeeper] Stopping...');
        this.running = false;
    }
    /**
     * Health check
     */
    async healthCheck() {
        try {
            // Check OCaml backend
            const ocamlHealthy = await axios_1.default
                .get(`${this.config.ocamlBackendUrl}/health`, { timeout: 2000 })
                .then(() => true)
                .catch(() => false);
            // Check if keeper has updated recently (within last 30s)
            const now = Date.now();
            const lastUpdate = 0; // TODO: Track from contract state
            return {
                healthy: ocamlHealthy && this.running,
                lastUpdate,
                ocamlBackend: ocamlHealthy,
                externalApis: true, // TODO: Check Polymarket/Binance/Allianz
            };
        }
        catch (error) {
            return {
                healthy: false,
                lastUpdate: 0,
                ocamlBackend: false,
                externalApis: false,
            };
        }
    }
}
exports.PricingOracleKeeper = PricingOracleKeeper;
/**
 * CLI entry point
 */
if (require.main === module) {
    const keeper = new PricingOracleKeeper({
        tonRpcUrl: process.env.TON_RPC_URL || 'https://toncenter.com/api/v2/jsonRPC',
        keeperMnemonic: process.env.KEEPER_MNEMONIC || '',
        pricingOracleAddress: process.env.PRICING_ORACLE_ADDRESS || '',
        ocamlBackendUrl: process.env.OCAML_BACKEND_URL || 'http://localhost:8080',
        polymarketApiKey: process.env.POLYMARKET_API_KEY,
        binanceApiKey: process.env.BINANCE_API_KEY,
        allianzApiKey: process.env.ALLIANZ_API_KEY,
        updateIntervalSeconds: parseInt(process.env.UPDATE_INTERVAL || '5'),
    });
    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('\n[PricingOracleKeeper] Received SIGINT, shutting down...');
        keeper.stop();
        process.exit(0);
    });
    keeper.start().catch(error => {
        console.error('[PricingOracleKeeper] Fatal error:', error);
        process.exit(1);
    });
}
