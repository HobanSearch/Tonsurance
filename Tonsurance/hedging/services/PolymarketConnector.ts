import axios, { AxiosInstance } from 'axios';

export interface PolymarketConfig {
    apiUrl?: string;
    apiKey: string;
    apiSecret: string;
}

export interface PolymarketOrder {
    market: string;
    side: 'YES' | 'NO';
    size: number;
    price?: number;
    type?: 'MARKET' | 'LIMIT';
}

export interface PolymarketOrderResult {
    externalId: string;
    status: 'FILLED' | 'PENDING' | 'FAILED';
    fillPrice: number;
    size: number;
    cost: number;
    venue: 'polymarket';
}

export interface PolymarketMarketData {
    marketId: string;
    yesPrice: number;
    noPrice: number;
    liquidity: number;
    volume24h: number;
}

export class PolymarketConnector {
    private client: AxiosInstance;
    private apiKey: string;
    private apiSecret: string;
    public retryCount: number = 0;

    constructor(config: PolymarketConfig) {
        this.apiKey = config.apiKey;
        this.apiSecret = config.apiSecret;

        this.client = axios.create({
            baseURL: config.apiUrl || 'https://clob.polymarket.com',
            timeout: 10000,
            headers: {
                'Content-Type': 'application/json',
            },
        });

        // Add auth interceptor
        this.client.interceptors.request.use(req => {
            // In production, sign request with apiSecret
            req.headers['X-API-Key'] = this.apiKey;
            return req;
        });
    }

    /**
     * Place order on Polymarket
     */
    async placeOrder(opts: {
        coverageType: 'depeg' | 'exploit' | 'bridge';
        amount: number;
        side?: 'YES' | 'NO';
        type?: 'MARKET' | 'LIMIT';
    }): Promise<PolymarketOrderResult> {
        const market = this.getMarketForCoverageType(opts.coverageType);
        const side = opts.side || 'YES';
        const type = opts.type || 'MARKET';

        try {
            const response = await this.client.post('/order', {
                market,
                side,
                size: opts.amount,
                type,
            });

            return {
                externalId: response.data.orderId,
                status: response.data.status === 'FILLED' ? 'FILLED' : 'PENDING',
                fillPrice: response.data.fillPrice || response.data.avgPrice,
                size: response.data.size || opts.amount,
                cost: (response.data.fillPrice || response.data.avgPrice) * opts.amount,
                venue: 'polymarket',
            };
        } catch (error: any) {
            if (error.response?.status === 429) {
                // Rate limited - retry
                this.retryCount++;
                if (this.retryCount < 3) {
                    await this.sleep(1000 * this.retryCount);
                    return this.placeOrder(opts);
                }
            }

            throw new Error(`Polymarket order failed: ${error.message}`);
        }
    }

    /**
     * Liquidate position (sell opposite side)
     */
    async liquidatePosition(opts: {
        externalId: string;
        amount: number;
        coverageType?: 'depeg' | 'exploit' | 'bridge';
    }): Promise<{ proceeds: number; slippage: number }> {
        try {
            const response = await this.client.post('/order', {
                side: 'NO', // Sell YES position
                size: opts.amount,
                type: 'MARKET',
            });

            const proceeds = response.data.proceeds || response.data.fillPrice * opts.amount;
            const slippage = (opts.amount - proceeds) / opts.amount;

            return { proceeds, slippage };
        } catch (error: any) {
            throw new Error(`Polymarket liquidation failed: ${error.message}`);
        }
    }

    /**
     * Get market data for coverage type
     */
    async getMarketData(coverageType: 'depeg' | 'exploit' | 'bridge'): Promise<{
        probability: number;
        cost: number;
        capacity: number;
        confidence: 'low' | 'medium' | 'high';
    }> {
        const marketId = this.getMarketForCoverageType(coverageType);

        try {
            const response = await this.client.get(`/markets/${marketId}`);

            const yesPrice = response.data.yesPrice;
            const liquidity = response.data.liquidity;
            const volume24h = response.data.volume24h;

            // Confidence based on volume
            let confidence: 'low' | 'medium' | 'high';
            if (volume24h > 100000) {
                confidence = 'high';
            } else if (volume24h > 50000) {
                confidence = 'medium';
            } else {
                confidence = 'low';
            }

            return {
                probability: yesPrice,
                cost: yesPrice,
                capacity: liquidity,
                confidence,
            };
        } catch (error: any) {
            throw new Error(`Failed to fetch Polymarket market data: ${error.message}`);
        }
    }

    /**
     * Get market ID for coverage type
     */
    private getMarketForCoverageType(coverageType: 'depeg' | 'exploit' | 'bridge'): string {
        switch (coverageType) {
            case 'depeg':
                return 'usdt-depeg-q1-2025';
            case 'exploit':
                return 'defi-exploit-q1-2025';
            case 'bridge':
                return 'bridge-hack-q1-2025';
            default:
                throw new Error(`Unknown coverage type: ${coverageType}`);
        }
    }

    /**
     * Get current odds for market
     */
    async getOdds(market: string): Promise<number> {
        try {
            const response = await this.client.get(`/markets/${market}`);
            return response.data.yesPrice;
        } catch (error: any) {
            throw new Error(`Failed to fetch odds: ${error.message}`);
        }
    }

    /**
     * Sleep utility for retries
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
