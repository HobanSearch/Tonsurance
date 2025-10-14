import { Address, toNano, WalletContractV4 } from '@ton/ton';
import { PricingOracle, CoverageType } from '../../wrappers/PricingOracle';
import { PolymarketConnector } from '../services/PolymarketConnector';

export interface PricingOracleKeeperConfig {
    oracleAddress: Address;
    keeperWallet: WalletContractV4;
    polymarketConnector: PolymarketConnector;
    updateInterval?: number; // In milliseconds, default 5000 (5 seconds)
}

export interface HedgePriceUpdate {
    coverageType: CoverageType;
    polymarketOdds: number;
    perpFundingRate: number;
    allianzQuote: number;
}

export class PricingOracleKeeper {
    private oracle: PricingOracle;
    private keeperWallet: WalletContractV4;
    private polymarketConnector: PolymarketConnector;
    private updateInterval: number;
    private intervalId?: NodeJS.Timeout;
    private isRunning: boolean = false;

    constructor(config: PricingOracleKeeperConfig) {
        this.oracle = new PricingOracle(config.oracleAddress);
        this.keeperWallet = config.keeperWallet;
        this.polymarketConnector = config.polymarketConnector;
        this.updateInterval = config.updateInterval || 5000;
    }

    /**
     * Start the keeper service (updates every 5 seconds)
     */
    start(): void {
        if (this.isRunning) {
            console.warn('PricingOracleKeeper is already running');
            return;
        }

        this.isRunning = true;
        console.log(`Starting PricingOracleKeeper with ${this.updateInterval}ms interval`);

        // Update immediately on start
        this.updatePrices().catch(err => {
            console.error('Initial price update failed:', err.message);
        });

        // Then update on interval
        this.intervalId = setInterval(() => {
            this.updatePrices().catch(err => {
                console.error('Price update failed:', err.message);
            });
        }, this.updateInterval);
    }

    /**
     * Stop the keeper service
     */
    stop(): void {
        if (!this.isRunning) {
            console.warn('PricingOracleKeeper is not running');
            return;
        }

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        this.isRunning = false;
        console.log('PricingOracleKeeper stopped');
    }

    /**
     * Update prices for all coverage types
     */
    async updatePrices(): Promise<void> {
        const coverageTypes: CoverageType[] = [
            CoverageType.DEPEG,
            CoverageType.EXPLOIT,
            CoverageType.BRIDGE,
        ];

        for (const coverageType of coverageTypes) {
            try {
                await this.updatePriceForCoverageType(coverageType);
            } catch (error: any) {
                console.error(`Failed to update ${CoverageType[coverageType]}:`, error.message);
            }
        }
    }

    /**
     * Update price for a specific coverage type
     */
    async updatePriceForCoverageType(coverageType: CoverageType): Promise<void> {
        // 1. Fetch prices from external sources
        const [polyOdds, perpFunding, allianzQuote] = await Promise.all([
            this.fetchPolymarketOdds(coverageType),
            this.fetchPerpFundingRate(coverageType),
            this.fetchAllianzQuote(coverageType),
        ]);

        // 2. Convert to basis points
        const polyBps = Math.round(polyOdds * 10000);
        const perpBps = Math.round(perpFunding * 10000);
        const allianzBps = Math.round(allianzQuote * 100);

        // 3. Update oracle
        await this.oracle.sendUpdateHedgePrices(
            this.keeperWallet.sender(this.keeperWallet.address),
            {
                value: toNano('0.05'),
                coverageType,
                polymarketOdds: polyBps,
                perpFundingRate: perpBps,
                allianzQuote: allianzBps,
            }
        );

        console.log(`Updated ${CoverageType[coverageType]}: PM=${polyBps}bps, Perp=${perpBps}bps, ALZ=${allianzBps}bps`);
    }

    /**
     * Fetch Polymarket odds
     */
    private async fetchPolymarketOdds(coverageType: CoverageType): Promise<number> {
        const coverageTypeStr = this.getCoverageTypeString(coverageType);

        try {
            const marketData = await this.polymarketConnector.getMarketData(coverageTypeStr);
            return marketData.probability;
        } catch (error: any) {
            console.warn(`Failed to fetch Polymarket odds for ${coverageTypeStr}, using default`);
            return this.getDefaultOdds(coverageType);
        }
    }

    /**
     * Fetch perpetual funding rate
     * In production, this would call Binance API
     */
    private async fetchPerpFundingRate(coverageType: CoverageType): Promise<number> {
        // Mock implementation - in production, call Binance Futures API
        // Example: GET https://fapi.binance.com/fapi/v1/fundingRate?symbol=TONUSDT

        try {
            // Simulated funding rate based on coverage type
            switch (coverageType) {
                case CoverageType.DEPEG:
                    return -0.0005; // -0.05% per 8h (negative = longs pay shorts)
                case CoverageType.EXPLOIT:
                    return 0.001;   // 0.1% per 8h
                case CoverageType.BRIDGE:
                    return -0.00025; // -0.025% per 8h
                default:
                    return 0;
            }
        } catch (error: any) {
            console.warn(`Failed to fetch funding rate, using default`);
            return 0;
        }
    }

    /**
     * Fetch Allianz parametric insurance quote
     * In production, this would call Allianz API
     */
    private async fetchAllianzQuote(coverageType: CoverageType): Promise<number> {
        // Mock implementation - in production, call Allianz Parametric Insurance API

        try {
            // Simulated quote based on coverage type (cost per $1000)
            switch (coverageType) {
                case CoverageType.DEPEG:
                    return 4.50;  // $4.50 per $1000 coverage
                case CoverageType.EXPLOIT:
                    return 6.00;  // $6.00 per $1000
                case CoverageType.BRIDGE:
                    return 3.50;  // $3.50 per $1000
                default:
                    return 5.00;
            }
        } catch (error: any) {
            console.warn(`Failed to fetch Allianz quote, using default`);
            return 5.00;
        }
    }

    /**
     * Get default odds if API fails
     */
    private getDefaultOdds(coverageType: CoverageType): number {
        switch (coverageType) {
            case CoverageType.DEPEG:
                return 0.025; // 2.5%
            case CoverageType.EXPLOIT:
                return 0.030; // 3%
            case CoverageType.BRIDGE:
                return 0.015; // 1.5%
            default:
                return 0.025;
        }
    }

    /**
     * Convert CoverageType enum to string
     */
    private getCoverageTypeString(coverageType: CoverageType): 'depeg' | 'exploit' | 'bridge' {
        switch (coverageType) {
            case CoverageType.DEPEG:
                return 'depeg';
            case CoverageType.EXPLOIT:
                return 'exploit';
            case CoverageType.BRIDGE:
                return 'bridge';
            default:
                throw new Error(`Invalid coverage type: ${coverageType}`);
        }
    }

    /**
     * Check if keeper is running
     */
    isKeeperRunning(): boolean {
        return this.isRunning;
    }

    /**
     * Manually trigger price update (for testing)
     */
    async triggerUpdate(): Promise<void> {
        await this.updatePrices();
    }

    /**
     * Get last update time from oracle
     */
    async getLastUpdateTime(): Promise<number> {
        // This would query the oracle contract
        // For now, return current time
        return Math.floor(Date.now() / 1000);
    }
}
