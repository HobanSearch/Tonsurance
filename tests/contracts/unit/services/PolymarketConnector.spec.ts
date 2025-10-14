import { PolymarketConnector } from '../../../hedging/services/PolymarketConnector';
import nock from 'nock';

describe('PolymarketConnector', () => {
    let connector: PolymarketConnector;
    const API_URL = 'https://clob.polymarket.com';

    beforeEach(() => {
        connector = new PolymarketConnector({
            apiUrl: API_URL,
            apiKey: 'test-api-key',
            apiSecret: 'test-api-secret',
        });

        // Reset nock
        nock.cleanAll();
    });

    afterEach(() => {
        // Verify all nock interceptors were called
        if (!nock.isDone()) {
            console.warn('Not all nock interceptors were called');
            nock.cleanAll();
        }
    });

    describe('placeOrder', () => {
        it('should place YES order on depeg market', async () => {
            nock(API_URL)
                .post('/order', (body) => {
                    return (
                        body.market === 'usdt-depeg-q1-2025' &&
                        body.side === 'YES' &&
                        body.size === 10000 &&
                        body.type === 'MARKET'
                    );
                })
                .reply(200, {
                    orderId: 'pm-order-123',
                    status: 'FILLED',
                    fillPrice: 0.025,
                    size: 10000,
                });

            const result = await connector.placeOrder({
                coverageType: 'depeg',
                amount: 10000,
                side: 'YES',
                type: 'MARKET',
            });

            expect(result).toMatchObject({
                externalId: 'pm-order-123',
                status: 'FILLED',
                fillPrice: 0.025,
                size: 10000,
                cost: 250, // 10000 * 0.025
                venue: 'polymarket',
            });
        });

        it('should place order for exploit coverage type', async () => {
            nock(API_URL)
                .post('/order', (body) => body.market === 'defi-exploit-q1-2025')
                .reply(200, {
                    orderId: 'pm-order-456',
                    status: 'FILLED',
                    fillPrice: 0.030,
                    size: 5000,
                });

            const result = await connector.placeOrder({
                coverageType: 'exploit',
                amount: 5000,
            });

            expect(result.externalId).toBe('pm-order-456');
            expect(result.cost).toBe(150); // 5000 * 0.030
        });

        it('should place order for bridge coverage type', async () => {
            nock(API_URL)
                .post('/order', (body) => body.market === 'bridge-hack-q1-2025')
                .reply(200, {
                    orderId: 'pm-order-789',
                    status: 'FILLED',
                    fillPrice: 0.015,
                    size: 20000,
                });

            const result = await connector.placeOrder({
                coverageType: 'bridge',
                amount: 20000,
            });

            expect(result.externalId).toBe('pm-order-789');
            expect(result.cost).toBe(300); // 20000 * 0.015
        });

        it('should default to YES side and MARKET type', async () => {
            nock(API_URL)
                .post('/order', (body) => body.side === 'YES' && body.type === 'MARKET')
                .reply(200, {
                    orderId: 'pm-order-default',
                    status: 'FILLED',
                    fillPrice: 0.025,
                    size: 10000,
                });

            const result = await connector.placeOrder({
                coverageType: 'depeg',
                amount: 10000,
                // side and type omitted
            });

            expect(result.status).toBe('FILLED');
        });

        it('should handle PENDING status', async () => {
            nock(API_URL)
                .post('/order')
                .reply(200, {
                    orderId: 'pm-order-pending',
                    status: 'PENDING',
                    avgPrice: 0.025,
                    size: 10000,
                });

            const result = await connector.placeOrder({
                coverageType: 'depeg',
                amount: 10000,
            });

            expect(result.status).toBe('PENDING');
        });

        it('should retry on rate limit (429)', async () => {
            // First request fails with 429
            nock(API_URL)
                .post('/order')
                .reply(429, { error: 'Rate limit exceeded' });

            // Second request succeeds
            nock(API_URL)
                .post('/order')
                .reply(200, {
                    orderId: 'pm-order-retry',
                    status: 'FILLED',
                    fillPrice: 0.025,
                    size: 10000,
                });

            const result = await connector.placeOrder({
                coverageType: 'depeg',
                amount: 10000,
            });

            expect(result.externalId).toBe('pm-order-retry');
            expect(connector.retryCount).toBe(1);
        });

        it('should fail after 3 retries', async () => {
            // All requests fail with 429
            nock(API_URL).post('/order').times(4).reply(429, { error: 'Rate limit exceeded' });

            await expect(
                connector.placeOrder({
                    coverageType: 'depeg',
                    amount: 10000,
                })
            ).rejects.toThrow('Polymarket order failed');
        });

        it('should throw on API error', async () => {
            nock(API_URL)
                .post('/order')
                .reply(400, { error: 'Invalid market' });

            await expect(
                connector.placeOrder({
                    coverageType: 'depeg',
                    amount: 10000,
                })
            ).rejects.toThrow('Polymarket order failed');
        });

        it('should include API key in request headers', async () => {
            nock(API_URL)
                .post('/order')
                .matchHeader('X-API-Key', 'test-api-key')
                .reply(200, {
                    orderId: 'pm-order-auth',
                    status: 'FILLED',
                    fillPrice: 0.025,
                    size: 10000,
                });

            await connector.placeOrder({
                coverageType: 'depeg',
                amount: 10000,
            });

            // Nock will verify the header match
        });
    });

    describe('liquidatePosition', () => {
        it('should sell position at market price', async () => {
            nock(API_URL)
                .post('/order', (body) => body.side === 'NO' && body.type === 'MARKET')
                .reply(200, {
                    proceeds: 9800,
                    fillPrice: 0.98,
                    size: 10000,
                });

            const result = await connector.liquidatePosition({
                externalId: 'pm-order-123',
                amount: 10000,
            });

            expect(result).toMatchObject({
                proceeds: 9800,
                slippage: 0.02, // (10000 - 9800) / 10000
            });
        });

        it('should handle liquidation with profit', async () => {
            nock(API_URL)
                .post('/order')
                .reply(200, {
                    proceeds: 10200,
                    fillPrice: 1.02,
                    size: 10000,
                });

            const result = await connector.liquidatePosition({
                externalId: 'pm-order-123',
                amount: 10000,
            });

            expect(result.proceeds).toBe(10200);
            expect(result.slippage).toBe(-0.02); // Negative = profit
        });

        it('should throw on liquidation error', async () => {
            nock(API_URL)
                .post('/order')
                .reply(500, { error: 'Internal server error' });

            await expect(
                connector.liquidatePosition({
                    externalId: 'pm-order-123',
                    amount: 10000,
                })
            ).rejects.toThrow('Polymarket liquidation failed');
        });

        it('should calculate proceeds from fillPrice if proceeds not provided', async () => {
            nock(API_URL)
                .post('/order')
                .reply(200, {
                    fillPrice: 0.95,
                    size: 10000,
                    // proceeds not provided
                });

            const result = await connector.liquidatePosition({
                externalId: 'pm-order-123',
                amount: 10000,
            });

            expect(result.proceeds).toBe(9500); // 10000 * 0.95
        });
    });

    describe('getMarketData', () => {
        it('should fetch market data for depeg', async () => {
            nock(API_URL)
                .get('/markets/usdt-depeg-q1-2025')
                .reply(200, {
                    yesPrice: 0.025,
                    noPrice: 0.975,
                    liquidity: 500000,
                    volume24h: 125000,
                });

            const data = await connector.getMarketData('depeg');

            expect(data).toMatchObject({
                probability: 0.025,
                cost: 0.025,
                capacity: 500000,
                confidence: 'high', // volume > 100k
            });
        });

        it('should fetch market data for exploit', async () => {
            nock(API_URL)
                .get('/markets/defi-exploit-q1-2025')
                .reply(200, {
                    yesPrice: 0.030,
                    liquidity: 300000,
                    volume24h: 80000,
                });

            const data = await connector.getMarketData('exploit');

            expect(data.probability).toBe(0.030);
            expect(data.confidence).toBe('medium'); // volume 50k-100k
        });

        it('should fetch market data for bridge', async () => {
            nock(API_URL)
                .get('/markets/bridge-hack-q1-2025')
                .reply(200, {
                    yesPrice: 0.015,
                    liquidity: 400000,
                    volume24h: 40000,
                });

            const data = await connector.getMarketData('bridge');

            expect(data.probability).toBe(0.015);
            expect(data.confidence).toBe('low'); // volume < 50k
        });

        it('should assign confidence based on volume', async () => {
            // High volume
            nock(API_URL)
                .get('/markets/usdt-depeg-q1-2025')
                .reply(200, {
                    yesPrice: 0.025,
                    liquidity: 500000,
                    volume24h: 150000,
                });

            const highVolumeData = await connector.getMarketData('depeg');
            expect(highVolumeData.confidence).toBe('high');

            // Medium volume
            nock(API_URL)
                .get('/markets/usdt-depeg-q1-2025')
                .reply(200, {
                    yesPrice: 0.025,
                    liquidity: 500000,
                    volume24h: 75000,
                });

            const mediumVolumeData = await connector.getMarketData('depeg');
            expect(mediumVolumeData.confidence).toBe('medium');

            // Low volume
            nock(API_URL)
                .get('/markets/usdt-depeg-q1-2025')
                .reply(200, {
                    yesPrice: 0.025,
                    liquidity: 500000,
                    volume24h: 25000,
                });

            const lowVolumeData = await connector.getMarketData('depeg');
            expect(lowVolumeData.confidence).toBe('low');
        });

        it('should throw on market data fetch error', async () => {
            nock(API_URL)
                .get('/markets/usdt-depeg-q1-2025')
                .reply(404, { error: 'Market not found' });

            await expect(connector.getMarketData('depeg')).rejects.toThrow(
                'Failed to fetch Polymarket market data'
            );
        });
    });

    describe('getOdds', () => {
        it('should fetch current odds for market', async () => {
            nock(API_URL)
                .get('/markets/usdt-depeg-q1-2025')
                .reply(200, {
                    yesPrice: 0.028,
                    noPrice: 0.972,
                });

            const odds = await connector.getOdds('usdt-depeg-q1-2025');

            expect(odds).toBe(0.028);
        });

        it('should throw on fetch error', async () => {
            nock(API_URL)
                .get('/markets/invalid-market')
                .reply(404, { error: 'Market not found' });

            await expect(connector.getOdds('invalid-market')).rejects.toThrow(
                'Failed to fetch odds'
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle network timeout', async () => {
            nock(API_URL)
                .post('/order')
                .delayConnection(15000) // Longer than 10s timeout
                .reply(200, {});

            await expect(
                connector.placeOrder({
                    coverageType: 'depeg',
                    amount: 10000,
                })
            ).rejects.toThrow();
        });

        it('should handle malformed response', async () => {
            nock(API_URL)
                .post('/order')
                .reply(200, 'invalid json');

            await expect(
                connector.placeOrder({
                    coverageType: 'depeg',
                    amount: 10000,
                })
            ).rejects.toThrow();
        });
    });

    describe('Market Mapping', () => {
        it('should map coverage types to correct market IDs', async () => {
            const depegOrder = nock(API_URL)
                .post('/order', (body) => body.market === 'usdt-depeg-q1-2025')
                .reply(200, { orderId: '1', status: 'FILLED', fillPrice: 0.025, size: 1000 });

            await connector.placeOrder({ coverageType: 'depeg', amount: 1000 });
            expect(depegOrder.isDone()).toBe(true);

            const exploitOrder = nock(API_URL)
                .post('/order', (body) => body.market === 'defi-exploit-q1-2025')
                .reply(200, { orderId: '2', status: 'FILLED', fillPrice: 0.030, size: 1000 });

            await connector.placeOrder({ coverageType: 'exploit', amount: 1000 });
            expect(exploitOrder.isDone()).toBe(true);

            const bridgeOrder = nock(API_URL)
                .post('/order', (body) => body.market === 'bridge-hack-q1-2025')
                .reply(200, { orderId: '3', status: 'FILLED', fillPrice: 0.015, size: 1000 });

            await connector.placeOrder({ coverageType: 'bridge', amount: 1000 });
            expect(bridgeOrder.isDone()).toBe(true);
        });
    });
});
