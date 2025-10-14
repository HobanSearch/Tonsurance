import express from 'express';

const app = express();
app.use(express.json());

// Mock market data
const marketData: Record<string, any> = {
    'usdt-depeg-q1-2025': {
        marketId: 'usdt-depeg-q1-2025',
        yesPrice: 0.025,
        noPrice: 0.975,
        liquidity: 500000,
        volume24h: 125000,
    },
    'defi-exploit-q1-2025': {
        marketId: 'defi-exploit-q1-2025',
        yesPrice: 0.030,
        noPrice: 0.970,
        liquidity: 300000,
        volume24h: 80000,
    },
    'bridge-hack-q1-2025': {
        marketId: 'bridge-hack-q1-2025',
        yesPrice: 0.015,
        noPrice: 0.985,
        liquidity: 400000,
        volume24h: 100000,
    },
};

let orderCounter = 1000;

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'polymarket-mock' });
});

// Get market data
app.get('/markets/:marketId', (req, res) => {
    const data = marketData[req.params.marketId];
    if (!data) {
        return res.status(404).json({ error: 'Market not found' });
    }
    res.json(data);
});

// Place order
app.post('/order', (req, res) => {
    const { market, side, size, type = 'MARKET' } = req.body;

    if (!market || !side || !size) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const marketInfo = marketData[market];
    if (!marketInfo) {
        return res.status(404).json({ error: 'Market not found' });
    }

    // Simulate processing delay
    setTimeout(() => {
        const orderId = `pm-${orderCounter++}`;
        const fillPrice = side === 'YES' ? marketInfo.yesPrice : marketInfo.noPrice;

        res.json({
            orderId,
            status: 'FILLED',
            fillPrice,
            size,
            type,
            timestamp: Date.now(),
        });
    }, 100);
});

// Admin endpoint to update market data (for testing)
app.post('/admin/update-market', (req, res) => {
    const { marketId, data } = req.body;
    if (marketData[marketId]) {
        marketData[marketId] = { ...marketData[marketId], ...data };
        res.json({ success: true, market: marketData[marketId] });
    } else {
        res.status(404).json({ error: 'Market not found' });
    }
});

const PORT = process.env.POLYMARKET_MOCK_PORT || 3001;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Mock Polymarket API listening on port ${PORT}`);
    });
}

export default app;
