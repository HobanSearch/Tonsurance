# Phase 4 Hedged Insurance - Deployment Guide

**Version:** 1.0
**Last Updated:** 2025-10-09
**Status:** Production Ready

---

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Setup](#environment-setup)
3. [Smart Contract Deployment](#smart-contract-deployment)
4. [Keeper Services Setup](#keeper-services-setup)
5. [API Server Setup](#api-server-setup)
6. [Testing & Verification](#testing--verification)
7. [Monitoring & Maintenance](#monitoring--maintenance)
8. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Required Accounts & API Keys

- [ ] TON Testnet/Mainnet wallet with sufficient balance (>10 TON for deployment gas)
- [ ] TonCenter API key ([https://toncenter.com](https://toncenter.com))
- [ ] Polymarket API credentials
- [ ] Binance Futures API credentials
- [ ] Allianz Parametric Insurance API credentials (or use mock mode)
- [ ] AWS/Cloud hosting account (for keepers and API)

### Development Environment

- [ ] Node.js v18+ installed
- [ ] npm or yarn installed
- [ ] Git repository cloned
- [ ] Dependencies installed (`npm install`)
- [ ] Contracts compiled (`npm run build`)
- [ ] Tests passing (`npm test`)

---

## Environment Setup

### 1. Copy Environment Template

```bash
cp .env.example .env
```

### 2. Configure Environment Variables

Edit `.env` and fill in all required values:

```bash
# TON Blockchain
TON_NETWORK=testnet
TON_API_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC
TON_API_KEY=your_toncenter_api_key

# Keeper Wallet (generate or import)
KEEPER_MNEMONIC="your 24 word mnemonic phrase"

# API Keys
POLYMARKET_API_KEY=your_polymarket_key
POLYMARKET_API_SECRET=your_polymarket_secret
BINANCE_API_KEY=your_binance_key
BINANCE_API_SECRET=your_binance_secret
ALLIANZ_API_KEY=your_allianz_key
ALLIANZ_CLIENT_ID=your_allianz_client_id

# For testing, set to true
ALLIANZ_USE_MOCK=true
BINANCE_TESTNET=true
```

### 3. Generate Keeper Wallet (if needed)

```bash
npx ton-cli create wallet
# Save the mnemonic to .env as KEEPER_MNEMONIC
# Fund with testnet TON: https://testnet.ton.org/testnet/faucet
```

---

## Smart Contract Deployment

### Option 1: Deploy All Contracts at Once (Recommended)

```bash
npm run deploy:phase4
```

This will:
1. Deploy PricingOracle
2. Deploy HedgeCoordinator
3. Deploy HedgedPolicyFactory
4. Display all contract addresses
5. Provide .env configuration snippet

**Save the contract addresses!** You'll need them for the next steps.

### Option 2: Deploy Individually

```bash
# Step 1: Deploy PricingOracle
npx blueprint run deployPricingOracle --testnet
# Copy the address: PRICING_ORACLE_ADDRESS=EQC...

# Step 2: Deploy HedgeCoordinator
npx blueprint run deployHedgeCoordinator --testnet
# Copy the address: HEDGE_COORDINATOR_ADDRESS=EQC...

# Step 3: Deploy HedgedPolicyFactory
npx blueprint run deployHedgedPolicyFactory --testnet
# Copy the address: HEDGED_POLICY_FACTORY_ADDRESS=EQC...
```

### Update .env with Contract Addresses

```bash
PRICING_ORACLE_ADDRESS=EQC1234...
HEDGE_COORDINATOR_ADDRESS=EQC5678...
HEDGED_POLICY_FACTORY_ADDRESS=EQC9012...
RESERVE_VAULT_ADDRESS=EQC3456...
```

---

## Keeper Services Setup

Keepers are automated services that execute hedges and update prices. They must run 24/7.

### 1. Add Keeper Addresses to Contracts

```bash
# On-chain: Add keeper to PricingOracle
# (Use Blueprint console or create admin script)

# On-chain: Add keepers to HedgeCoordinator
# (Add 3 keepers: Polymarket, Perp, Allianz)
```

### 2. Start Keeper Services

#### Development (local)

```bash
npm run keepers:start
```

#### Production (PM2 recommended)

```bash
# Install PM2
npm install -g pm2

# Create keeper startup script
cat > scripts/startKeepers.ts << 'EOF'
import { PricingOracleKeeper } from '../hedging/keepers/PricingOracleKeeper';
import { PolymarketKeeper } from '../hedging/keepers/PolymarketKeeper';
import { PerpKeeper } from '../hedging/keepers/PerpKeeper';
import { AllianzKeeper } from '../hedging/keepers/AllianzKeeper';
import { getConfig } from '../config/hedging.config';

const config = getConfig();

// Start all keepers
const pricingKeeper = new PricingOracleKeeper(config);
pricingKeeper.start();

const polyKeeper = new PolymarketKeeper(config);
polyKeeper.start();

const perpKeeper = new PerpKeeper(config);
perpKeeper.start();

const allianzKeeper = new AllianzKeeper(config);
allianzKeeper.start();

console.log('✅ All keepers started');
EOF

# Start with PM2
pm2 start scripts/startKeepers.ts --name tonsurance-keepers
pm2 save
pm2 startup  # Enable auto-start on reboot
```

### 3. Verify Keepers Running

```bash
pm2 status
pm2 logs tonsurance-keepers
```

---

## API Server Setup

### 1. Start API Server

#### Development (local)

```bash
npm run api:start
```

#### Production (PM2)

```bash
# Create API startup script
cat > api/server.ts << 'EOF'
import { createServer } from 'http';
import { TonClient } from '@ton/ton';
import { HedgingAPI } from './hedging-api';
import { HedgingWebSocket } from './hedging-websocket';
import { getConfig } from '../config/hedging.config';

const config = getConfig();

const tonClient = new TonClient({
  endpoint: config.ton.apiEndpoint,
  apiKey: config.ton.apiKey,
});

// Create HTTP server
const httpServer = createServer();

// Initialize API
const api = new HedgingAPI({
  port: config.server.port,
  tonClient,
  pricingOracleAddress: config.contracts.pricingOracle!,
  hedgeCoordinatorAddress: config.contracts.hedgeCoordinator!,
  factoryAddress: config.contracts.hedgedPolicyFactory!,
  corsOrigin: config.server.corsOrigin,
});

// Initialize WebSocket
const ws = new HedgingWebSocket({
  server: httpServer,
  tonClient,
  pricingOracleAddress: config.contracts.pricingOracle!,
  updateInterval: config.server.wsUpdateInterval,
});

// Start server
api.start();
httpServer.listen(config.server.port, () => {
  console.log(`🌐 Hedging API ready on port ${config.server.port}`);
});
EOF

# Start with PM2
pm2 start api/server.ts --name tonsurance-api
pm2 save
```

### 2. Verify API Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Swing quote
curl "http://localhost:3000/premium/swing-quote?coverageType=depeg&coverageAmount=10000&duration=30"

# Hedge status
curl http://localhost:3000/hedging/policy/1/status

# Exposure
curl http://localhost:3000/hedging/exposure
```

### 3. Test WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  // Subscribe to premium updates
  ws.send(JSON.stringify({
    action: 'subscribe',
    channel: 'premium',
    params: {
      coverageType: 'depeg',
      coverageAmount: 10000,
      duration: 30
    }
  }));
};

ws.onmessage = (event) => {
  console.log('Update:', JSON.parse(event.data));
};
```

---

## Testing & Verification

### 1. Run Complete Test Suite

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# All tests with coverage
npm run test:coverage
```

### 2. Manual Integration Test

```bash
# 1. Get premium quote
curl "http://localhost:3000/premium/swing-quote?coverageType=depeg&coverageAmount=10000&duration=30"

# 2. Create policy (via frontend or CLI)
# TX: HedgedPolicyFactory.create_hedged_policy(...)

# 3. Check hedge status
curl http://localhost:3000/hedging/policy/1/status

# Expected: All 3 hedges executed within 30 seconds
```

### 3. Monitor Keeper Logs

```bash
pm2 logs tonsurance-keepers --lines 100
```

Look for:
- ✅ PricingOracle updates every 5 seconds
- ✅ Hedge execution confirmations
- ❌ No repeated errors

---

## Monitoring & Maintenance

### Daily Checks

- [ ] All keepers running (`pm2 status`)
- [ ] API health check passing
- [ ] No errors in logs (`pm2 logs`)
- [ ] Oracle prices updating (check on-chain)
- [ ] Hedge execution success rate >95%

### Weekly Tasks

- [ ] Review hedge performance (ROI, slippage)
- [ ] Check exposure vs hedge ratios
- [ ] Verify reserve vault balance
- [ ] Update API keys if needed (rotate every 90 days)

### Alerts Setup (Recommended)

```bash
# Setup monitoring with Sentry/Datadog
# Add to .env:
SENTRY_DSN=your_sentry_dsn
SLACK_WEBHOOK_URL=your_slack_webhook

# Add to code:
- Alert if keeper stops for >5 min
- Alert if oracle not updated for >10 min
- Alert if hedge execution fails 3 times
- Alert if exposure drift >10%
```

---

## Troubleshooting

### Issue: Keeper Not Updating Prices

**Symptoms:** PricingOracle not receiving updates

**Solutions:**
1. Check keeper is running: `pm2 status`
2. Check keeper has TON for gas: `ton-cli balance <keeper_address>`
3. Verify keeper address is authorized in PricingOracle contract
4. Check API keys are valid: `curl <polymarket_api>`
5. Review logs: `pm2 logs tonsurance-keepers`

### Issue: Hedge Execution Failed

**Symptoms:** HedgeStatus shows FAILED for a policy

**Solutions:**
1. Check API rate limits (Polymarket: 10 req/s, Binance: 20 req/s)
2. Verify API keys and permissions
3. Check venue has sufficient liquidity
4. Review connector logs for specific error
5. Retry manually if needed

### Issue: API Returns Stale Data

**Symptoms:** Premium quotes not updating

**Solutions:**
1. Check PricingOracle last_update_time (should be <5 min)
2. Restart API server: `pm2 restart tonsurance-api`
3. Clear quote cache
4. Verify WebSocket connection count: Check logs for connected clients

### Issue: WebSocket Disconnects

**Symptoms:** Clients not receiving real-time updates

**Solutions:**
1. Check server load (CPU, memory)
2. Increase WebSocket timeout
3. Review nginx/proxy settings (if using reverse proxy)
4. Enable WebSocket sticky sessions for load balancing

---

## Security Best Practices

### Production Checklist

- [ ] Use AWS Secrets Manager for API keys (not .env)
- [ ] Enable multi-sig for admin functions (3-of-5 recommended)
- [ ] Rotate API keys every 90 days
- [ ] Use hardware wallet for keeper funds
- [ ] Enable rate limiting on API endpoints
- [ ] Setup DDoS protection (Cloudflare)
- [ ] Regular security audits
- [ ] Monitor for unusual activity (large orders, rapid calls)

### API Key Management

```bash
# Production: Store in AWS Secrets Manager
aws secretsmanager create-secret \
  --name tonsurance/polymarket-api-key \
  --secret-string "your_key_here"

# Load in code:
const apiKey = await secretsManager.getSecretValue({
  SecretId: 'tonsurance/polymarket-api-key'
}).promise();
```

---

## Mainnet Deployment

### Differences from Testnet

1. **Contract Addresses**: Deploy fresh contracts to mainnet
2. **API Endpoints**:
   - Binance: `https://fapi.binance.com` (not testnet)
   - Set `BINANCE_TESTNET=false`
3. **Real API Keys**: Use production Polymarket/Binance/Allianz keys
4. **Multi-Sig**: Enable multi-sig for admin functions
5. **Gradual Rollout**:
   - Start with $10k coverage limit
   - Monitor for 2 weeks
   - Increase to $100k
   - Monitor for 1 month
   - Full launch with $1M+ coverage

### Mainnet Deployment Command

```bash
# Build contracts
npm run build

# Deploy to mainnet
npx blueprint run deployPhase4Complete --mainnet

# IMPORTANT: Verify contracts on TON Explorer
# IMPORTANT: Test with small amounts first
```

---

## Support & Resources

- **Documentation**: `/docs` folder
- **Issue Tracker**: GitHub Issues
- **API Docs**: `http://localhost:3000/docs` (when running)
- **TON Dev Chat**: [https://t.me/tondev](https://t.me/tondev)
- **Tonsurance Team**: support@tonsurance.com

---

**Last Updated**: 2025-10-09
**Version**: 1.0
**Status**: ✅ Production Ready
