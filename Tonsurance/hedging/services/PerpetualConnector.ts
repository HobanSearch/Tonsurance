import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';

/**
 * PerpetualConnector - Execute and liquidate hedges on perpetual futures exchanges
 *
 * Supports: Binance Futures, Hyperliquid
 * Strategy: Short perpetual contracts to hedge against depeg/exploit events
 */

export interface PerpetualPosition {
    externalId: string;
    venue: 'binance' | 'hyperliquid';
    symbol: string;
    side: 'SHORT' | 'LONG';
    size: number;
    entryPrice: number;
    currentPrice: number;
    unrealizedPnL: number;
    fundingRate: number; // Daily funding rate
}

export interface PerpetualOrderResult {
    externalId: string;
    status: 'FILLED' | 'PENDING' | 'FAILED';
    symbol: string;
    side: 'SHORT' | 'LONG';
    size: number;
    fillPrice: number;
    cost: number;
    venue: 'perpetuals';
}

export interface PerpetualMarketData {
    symbol: string;
    fundingRate: number; // Daily rate
    nextFundingTime: number;
    openInterest: number;
    volume24h: number;
    confidence: 'high' | 'medium' | 'low';
}

export interface PerpetualConnectorConfig {
    venue: 'binance' | 'hyperliquid';
    apiUrl: string;
    apiKey: string;
    apiSecret: string;
    testnet?: boolean;
}

export class PerpetualConnector {
    private client: AxiosInstance;
    private config: PerpetualConnectorConfig;
    private positions: Map<string, PerpetualPosition> = new Map();
    public retryCount: number = 0;

    constructor(config: PerpetualConnectorConfig) {
        this.config = config;
        this.client = axios.create({
            baseURL: config.apiUrl,
            timeout: 10000,
            headers: {
                'X-MBX-APIKEY': config.apiKey, // Binance header
                'Content-Type': 'application/json',
            },
        });
    }

    /**
     * Open short position to hedge coverage
     */
    async placeOrder(opts: {
        coverageType: 'depeg' | 'exploit' | 'bridge';
        amount: number;
        leverage?: number;
    }): Promise<PerpetualOrderResult> {
        const { coverageType, amount, leverage = 1 } = opts;

        // Map coverage type to trading symbol
        const symbol = this.getSymbolForCoverage(coverageType);

        // Calculate position size
        const size = amount * leverage;

        try {
            const timestamp = Date.now();
            const params = {
                symbol,
                side: 'SELL', // Short position
                type: 'MARKET',
                quantity: size,
                timestamp,
            };

            // Sign request (Binance requires HMAC SHA256 signature)
            const signature = this.signRequest(params);

            const response = await this.client.post('/fapi/v1/order', null, {
                params: {
                    ...params,
                    signature,
                },
            });

            const order = response.data;

            return {
                externalId: order.orderId.toString(),
                status: order.status === 'FILLED' ? 'FILLED' : 'PENDING',
                symbol,
                side: 'SHORT',
                size,
                fillPrice: parseFloat(order.avgPrice || order.price),
                cost: size * parseFloat(order.avgPrice || order.price),
                venue: 'perpetuals',
            };
        } catch (error: any) {
            // Handle rate limiting
            if (error.response?.status === 429 && this.retryCount < 3) {
                this.retryCount++;
                await this.sleep(1000 * Math.pow(2, this.retryCount)); // Exponential backoff
                return this.placeOrder(opts);
            }

            this.retryCount = 0;
            throw new Error(`Perpetual order failed: ${error.message}`);
        }
    }

    /**
     * Close position (liquidate hedge)
     */
    async liquidatePosition(opts: {
        externalId: string;
        symbol: string;
        size: number;
    }): Promise<{ proceeds: number; pnl: number; slippage: number }> {
        const { symbol, size } = opts;

        try {
            const timestamp = Date.now();
            const params = {
                symbol,
                side: 'BUY', // Close short by buying back
                type: 'MARKET',
                quantity: size,
                timestamp,
            };

            const signature = this.signRequest(params);

            const response = await this.client.post('/fapi/v1/order', null, {
                params: {
                    ...params,
                    signature,
                },
            });

            const order = response.data;
            const fillPrice = parseFloat(order.avgPrice || order.price);
            const proceeds = size * fillPrice;

            // Calculate PnL from position
            const position = this.positions.get(opts.externalId);
            const pnl = position
                ? (position.entryPrice - fillPrice) * size
                : 0;

            // Calculate slippage
            const expectedProceeds = size * (position?.entryPrice || fillPrice);
            const slippage = (expectedProceeds - proceeds) / expectedProceeds;

            // Remove from tracked positions
            this.positions.delete(opts.externalId);

            return {
                proceeds,
                pnl,
                slippage,
            };
        } catch (error: any) {
            throw new Error(`Perpetual liquidation failed: ${error.message}`);
        }
    }

    /**
     * Get current funding rate for coverage type
     */
    async getFundingRate(coverageType: 'depeg' | 'exploit' | 'bridge'): Promise<number> {
        const symbol = this.getSymbolForCoverage(coverageType);

        try {
            const response = await this.client.get('/fapi/v1/fundingRate', {
                params: { symbol, limit: 1 },
            });

            const fundingData = response.data[0];
            return parseFloat(fundingData.fundingRate);
        } catch (error: any) {
            throw new Error(`Failed to fetch funding rate: ${error.message}`);
        }
    }

    /**
     * Get market data for symbol
     */
    async getMarketData(
        coverageType: 'depeg' | 'exploit' | 'bridge'
    ): Promise<PerpetualMarketData> {
        const symbol = this.getSymbolForCoverage(coverageType);

        try {
            // Fetch funding rate
            const fundingResponse = await this.client.get('/fapi/v1/fundingRate', {
                params: { symbol, limit: 1 },
            });

            // Fetch 24h ticker
            const tickerResponse = await this.client.get('/fapi/v1/ticker/24hr', {
                params: { symbol },
            });

            const fundingData = fundingResponse.data[0];
            const tickerData = tickerResponse.data;

            const volume24h = parseFloat(tickerData.volume);
            const fundingRate = parseFloat(fundingData.fundingRate);

            return {
                symbol,
                fundingRate,
                nextFundingTime: fundingData.fundingTime,
                openInterest: parseFloat(tickerData.openInterest || '0'),
                volume24h,
                confidence: this.getConfidence(volume24h),
            };
        } catch (error: any) {
            throw new Error(`Failed to fetch market data: ${error.message}`);
        }
    }

    /**
     * Map coverage type to perpetual symbol
     */
    private getSymbolForCoverage(
        coverageType: 'depeg' | 'exploit' | 'bridge'
    ): string {
        const symbolMap: Record<string, string> = {
            depeg: 'USDTUSDC', // USDT/USDC perpetual (depeg indicator)
            exploit: 'BTCUSDT', // BTC perpetual (DeFi correlation)
            bridge: 'ETHUSDT', // ETH perpetual (bridge correlation)
        };

        return symbolMap[coverageType] || 'BTCUSDT';
    }

    /**
     * Sign request with HMAC SHA256 (Binance standard)
     */
    private signRequest(params: Record<string, any>): string {
        const queryString = Object.keys(params)
            .sort()
            .map((key) => `${key}=${params[key]}`)
            .join('&');

        return crypto
            .createHmac('sha256', this.config.apiSecret)
            .update(queryString)
            .digest('hex');
    }

    /**
     * Determine confidence based on volume
     */
    private getConfidence(volume24h: number): 'high' | 'medium' | 'low' {
        if (volume24h > 1000000000) return 'high'; // >$1B volume
        if (volume24h > 100000000) return 'medium'; // >$100M volume
        return 'low';
    }

    /**
     * Sleep utility for retries
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Track position internally
     */
    trackPosition(externalId: string, position: PerpetualPosition): void {
        this.positions.set(externalId, position);
    }

    /**
     * Get position by external ID
     */
    getPosition(externalId: string): PerpetualPosition | undefined {
        return this.positions.get(externalId);
    }

    /**
     * Update position with current market price
     */
    async updatePosition(externalId: string): Promise<void> {
        const position = this.positions.get(externalId);
        if (!position) return;

        try {
            const tickerResponse = await this.client.get('/fapi/v1/ticker/price', {
                params: { symbol: position.symbol },
            });

            const currentPrice = parseFloat(tickerResponse.data.price);
            position.currentPrice = currentPrice;

            // Calculate unrealized PnL for short position
            position.unrealizedPnL = (position.entryPrice - currentPrice) * position.size;

            this.positions.set(externalId, position);
        } catch (error: any) {
            console.error(`Failed to update position ${externalId}:`, error.message);
        }
    }
}
