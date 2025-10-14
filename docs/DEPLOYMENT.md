# Tonsurance Production Deployment Guide

## Overview

Tonsurance is a multi-component system requiring careful orchestration of:

1. **OCaml Backend**: Oracle aggregator (RedStone, Pyth, Chainlink)
2. **TypeScript Keepers**: PricingOracleKeeper, BridgeHealthKeeper
3. **React Frontend**: Multi-chain insurance UI
4. **TON Smart Contracts**: On-chain policies and oracles
5. **Infrastructure**: PostgreSQL, Redis, Prometheus, Grafana

## Prerequisites

- Docker & Docker Compose v2.x
- 4GB+ RAM, 2+ CPU cores
- TON wallet with keeper mnemonic (24 words)
- API keys for: RedStone, Pyth, Chainlink, Polymarket, Binance, Allianz

## Quick Start

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/tonsurance.git
cd tonsurance
```

### 2. Configure Environment

```bash
cp .env.production.example .env.production
nano .env.production
```

Fill in all required values:

```env
# TON Configuration
TON_RPC_URL=https://toncenter.com/api/v2/jsonRPC
KEEPER_MNEMONIC="word1 word2 ... word24"
PRICING_ORACLE_ADDRESS=EQC...

# Oracle API Keys
REDSTONE_API_KEY=your_key
PYTH_API_KEY=your_key
CHAINLINK_API_KEY=your_key

# Hedge Venues
POLYMARKET_API_KEY=your_key
BINANCE_API_KEY=your_key
ALLIANZ_API_KEY=your_key

# Database & Cache
POSTGRES_PASSWORD=strong_password_here
REDIS_PASSWORD=strong_password_here

# Monitoring
GRAFANA_PASSWORD=strong_password_here
ALERT_WEBHOOK_URL=https://hooks.slack.com/...
```

### 3. Deploy Smart Contracts

```bash
cd Tonsurance
npx blueprint build
npx blueprint run deployPricingOracle  # Save address to .env.production
npx blueprint run deployHedgedPolicyFactory
```

### 4. Start Services

```bash
cd ..
docker-compose -f docker-compose.production.yml up -d
```

### 5. Verify Deployment

```bash
# Check all services are running
docker-compose ps

# Check OCaml backend health
curl http://localhost:8080/health

# Check keeper logs
docker logs -f tonsurance-pricing-keeper
docker logs -f tonsurance-bridge-keeper

# Access monitoring dashboard
open http://localhost:3001  # Grafana (admin/your_password)
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User's Browser                          │
│                   (React + TON Connect)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)                     │
│                    Port 80/443 (HTTPS)                       │
└──────┬───────────────────────────────────┬──────────────────┘
       │                                    │
       ▼                                    ▼
┌──────────────────┐            ┌─────────────────────────┐
│  React Frontend  │            │    OCaml Backend        │
│   (Port 3000)    │            │  Oracle Aggregator      │
│                  │            │   (Port 8080)           │
│ • Multi-chain UI │            │                         │
│ • ChainSelector  │            │ • RedStone API          │
│ • BridgeHealth   │            │ • Pyth API              │
│ • Enterprise CSV │            │ • Chainlink API         │
└──────────────────┘            │ • Bridge Monitor        │
                                └────────┬────────────────┘
                                         │
                                         ▼
                          ┌──────────────────────────────┐
                          │   TypeScript Keepers         │
                          │                              │
                          │ PricingOracleKeeper (5s)     │
                          │ • Polls OCaml API            │
                          │ • Fetches hedge costs        │
                          │ • Updates PricingOracle      │
                          │                              │
                          │ BridgeHealthKeeper (60s)     │
                          │ • Monitors bridge TVL        │
                          │ • Calculates risk multiplier │
                          │ • Sends critical alerts      │
                          └───────────┬──────────────────┘
                                      │
                                      ▼
                          ┌─────────────────────────┐
                          │   TON Blockchain        │
                          │                         │
                          │ • PricingOracle.fc      │
                          │ • HedgedPolicyFactory.fc│
                          │ • HedgeCoordinator.fc   │
                          └─────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      Infrastructure                          │
│                                                              │
│  PostgreSQL (Policies)   Redis (Cache)   Prometheus/Grafana │
└─────────────────────────────────────────────────────────────┘
```

## Service Details

### OCaml Backend (Port 8080)

**Purpose**: Multi-chain oracle consensus aggregation

**Endpoints**:
- `GET /health` - Health check
- `GET /api/v1/consensus-price/:asset` - Get consensus price for USDC/USDT/etc
- `GET /api/v1/oracle/cross-chain/:asset` - Get prices across all 8 blockchains
- `GET /api/v1/bridge/health/:bridge_id` - Get bridge health score
- `GET /api/v1/bridge/health/all` - Get all bridge health data

**Oracle Weights**:
- RedStone: 40% (TON-native)
- Pyth: 35% (high frequency)
- Chainlink: 25% (established)

**Supported Assets**: 14 stablecoins + BTC/ETH
- Circle: USDC, USDP
- Tether: USDT
- MakerDAO: DAI
- Frax: FRAX
- Binance: BUSD
- Ethena: USDe, sUSDe
- Ondo: USDY
- PayPal: PYUSD
- Aave: GHO
- Liquity: LUSD
- Curve: crvUSD
- Prisma: mkUSD

### PricingOracleKeeper (Port 3001)

**Purpose**: Bridges OCaml consensus prices to TON PricingOracle contract

**Update Frequency**: Every 5 seconds

**Operations**:
1. Poll OCaml API for consensus prices
2. Fetch external hedge costs:
   - Polymarket prediction market odds (40%)
   - Binance perpetuals funding rates (40%)
   - Allianz parametric insurance quotes (20%)
3. Calculate total swing premium
4. Send `sendUpdateHedgePrices()` transaction to PricingOracle contract

**Gas Cost**: ~0.05 TON per update = 0.6 TON/min = 864 TON/day

### BridgeHealthKeeper (Port 3002)

**Purpose**: Monitors cross-chain bridge health and adjusts pricing risk

**Update Frequency**: Every 60 seconds

**Operations**:
1. Poll OCaml bridge monitor for health scores
2. Calculate risk multipliers:
   - 0.9-1.0 health → 1.0x (excellent)
   - 0.7-0.9 → 1.1x (good)
   - 0.5-0.7 → 1.3x (moderate)
   - 0.3-0.5 → 1.6x (poor)
   - 0.0-0.3 → 2.0x (critical)
3. Send critical alerts via webhook (Slack/Discord)
4. Update on-chain pricing with bridge-specific multipliers

**Monitored Bridges**:
- Wormhole (ETH ↔ TON)
- Axelar (Arbitrum ↔ TON)
- LayerZero (Base ↔ TON)
- Stargate (Polygon ↔ TON)

### Frontend (Port 3000)

**Features**:
- **Multi-Chain Insurance**: Select from 8 blockchains, 14 stablecoins
- **Enterprise Bulk**: CSV upload for 200+ employees with 20% discount
- **Bridge Health Dashboard**: Real-time TVL and risk monitoring
- **Hedged Insurance**: Dynamic swing pricing with external hedge breakdown
- **Gift Protection**: Send policies to other wallets with custom messages

**Pages**:
- `/policy` - Core insurance (fixed APR)
- `/multi-chain` - Cross-chain insurance with bridge monitoring
- `/enterprise` - Bulk employee protection (CSV import)
- `/hedged` - Advanced hedged insurance
- `/vaults` - LP staking
- `/claims` - Claims filing
- `/analytics` - Protocol analytics

## Monitoring

### Grafana Dashboards (Port 3001)

**Access**: http://localhost:3001 (admin / your_password)

**Dashboards**:

1. **Oracle Health**
   - Consensus price accuracy
   - Oracle response times
   - Price deviation from median
   - Stale data alerts

2. **Keeper Performance**
   - PricingOracleKeeper: Updates per minute, gas costs
   - BridgeHealthKeeper: Health scores, alert count
   - Transaction success rates

3. **Bridge Security**
   - TVL changes (24h)
   - Health score trends
   - Risk multiplier history
   - Exploit alerts

4. **System Resources**
   - CPU, memory, disk usage
   - Container health
   - Network latency

### Prometheus Metrics (Port 9090)

**Key Metrics**:
- `tonsurance_oracle_price{asset="USDC"}` - Current consensus price
- `tonsurance_oracle_confidence{asset="USDC"}` - Confidence score (0.0-1.0)
- `tonsurance_keeper_updates_total` - Total keeper updates
- `tonsurance_keeper_gas_cost_ton` - Gas costs in TON
- `tonsurance_bridge_health_score{bridge_id="wormhole"}` - Bridge health (0.0-1.0)
- `tonsurance_bridge_tvl_usd{bridge_id="wormhole"}` - Bridge TVL in USD

## Security

### API Keys

Store in AWS Secrets Manager or HashiCorp Vault:

```bash
aws secretsmanager create-secret \
  --name tonsurance/production/keeper-mnemonic \
  --secret-string "word1 word2 ... word24"
```

Update docker-compose to fetch from secrets manager.

### Keeper Wallet

- **Recommended Balance**: 100+ TON
- **Permissions**: Only needs to call `sendUpdateHedgePrices()`
- **Multi-sig**: NOT required (keeper is not admin)

### Smart Contract Admin

- **Multi-sig**: 3-of-5 required for mainnet admin functions
- **Admin functions**: Change parameters, pause contracts, emergency withdraw
- **Keeper != Admin**: Keeper wallet cannot modify contract logic

## Cost Estimates

### Monthly Costs (Mainnet)

| Service | Cost | Notes |
|---------|------|-------|
| TON Gas (PricingOracle updates) | ~25,920 TON/month | 5-second updates |
| TON Gas (Bridge updates) | ~43 TON/month | 60-second updates |
| Oracle APIs (RedStone, Pyth, Chainlink) | $500/month | Pro tier |
| Hedge APIs (Polymarket, Binance, Allianz) | $1,000/month | Trading fees |
| AWS EC2 (8 vCPU, 16GB RAM) | $150/month | c5.2xlarge |
| AWS RDS (PostgreSQL) | $100/month | db.t3.medium |
| AWS ElastiCache (Redis) | $50/month | cache.t3.small |
| Monitoring (Grafana Cloud) | $50/month | Pro plan |
| **Total** | **~$1,850/month + 25,963 TON** | - |

**Note**: At TON = $2.50, monthly cost = $1,850 + $64,908 = **$66,758**

**Revenue Required**: ~$66,758/month in premiums to break even on keeper costs.

## Scaling

### Testnet → Mainnet Migration

1. **Testnet Phase (2 weeks)**:
   - Deploy all contracts to testnet
   - Run keepers with testnet RPC
   - Test with 10-20 beta users
   - Coverage limit: $10,000 per policy

2. **Mainnet Beta (1 month)**:
   - Deploy to mainnet
   - Coverage limit: $50,000 per policy
   - Whitelist 100 users
   - Monitor closely

3. **Mainnet Production**:
   - Remove coverage limits
   - Scale keepers (multiple instances)
   - Add load balancing

### Keeper Scaling

For high traffic (1000+ transactions/hour):

```yaml
pricing-oracle-keeper:
  deploy:
    replicas: 3  # Run 3 instances
    update_config:
      parallelism: 1
      delay: 10s
```

## Troubleshooting

### Keeper Not Updating

```bash
# Check keeper logs
docker logs -f tonsurance-pricing-keeper

# Common issues:
# 1. Insufficient TON balance
# 2. OCaml backend unreachable
# 3. Invalid mnemonic
# 4. Contract address mismatch
```

### OCaml Backend Slow

```bash
# Check oracle API latency
curl -w "@curl-format.txt" http://localhost:8080/api/v1/consensus-price/USDC

# Common issues:
# 1. API rate limits (upgrade plan)
# 2. Network latency (use regional endpoints)
# 3. Timeout too low (increase in config)
```

### Bridge Health Alert Not Firing

```bash
# Check BridgeHealthKeeper logs
docker logs -f tonsurance-bridge-keeper

# Verify webhook URL
curl -X POST $ALERT_WEBHOOK_URL \
  -H "Content-Type: application/json" \
  -d '{"text": "Test alert"}'
```

## Support

- **Documentation**: https://docs.tonsurance.io
- **Discord**: https://discord.gg/tonsurance
- **GitHub**: https://github.com/yourusername/tonsurance
- **Email**: support@tonsurance.io

## License

MIT License - See LICENSE file for details
