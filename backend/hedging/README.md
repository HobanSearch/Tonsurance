# Hedging Module - Multi-Product Risk Hedging System

**Status:** Initial Implementation Complete
**Created:** 2025-10-18
**Purpose:** Execute hedges across all 560 insurance products to reduce capital requirements

---

## Overview

The hedging module transforms Tonsurance from a BTC-only hedging system into a comprehensive multi-product hedging platform that hedges actual insurance coverage risks across:

- **5 Coverage Types**: Depeg, Smart Contract, Bridge, Oracle, CEX Liquidation
- **8 Blockchains**: Ethereum, Arbitrum, Base, Polygon, Optimism, Bitcoin, Solana, TON
- **14 Stablecoins**: USDC, USDT, DAI, FRAX, BUSD, USDe, sUSDe, USDY, PYUSD, GHO, LUSD, crvUSD, mkUSD, USDP

**Total: 560 Possible Products** (not all combinations are valid)

---

## Architecture

### Capital Allocation Strategy

For $10M total insurance capital:

**On-Chain (80% = $8M)**:
- Primary Vault: $4.5M (45% - crypto LPs, first loss)
- Secondary Vault: $2M (20% - SURE stakers, second loss)
- TradFi Buffer: $1M (10% - institutions, third loss)
- Protocol Reserve: $500k (5%)

**External Hedges (20% = $2M)**:
- **Polymarket** (40% = $800k): Prediction markets
- **Binance Futures** (40% = $800k): Perpetual contracts
- **Allianz Parametric** (20% = $400k): Traditional reinsurance (future)

**Capital Efficiency**: 250% (vs 200% for unhedged, 100-150% for traditional insurance)

---

## Modules

### 1. Hedge Orchestrator (`hedge_orchestrator.ml`)

**Purpose:** Central coordinator for all hedging activities

**Key Functions:**
- `calculate_all_exposures()` - Aggregate risk across 560 products
- `calculate_all_allocations()` - Optimize hedge allocation per product
- `execute_hedge_allocation()` - Execute hedges across venues
- `close_policy_hedges()` - Liquidate hedges on claim payout
- `hedge_loop()` - Main monitoring loop (runs every 5 minutes)

**Example Output:**
```
╔══════════════════════════════════════════════════════════╗
║  HEDGE ORCHESTRATOR STATUS REPORT                        ║
╚══════════════════════════════════════════════════════════╝

=== Product Exposures ===
Total Products with Exposure: 47
Total Coverage Amount: $12,450,000
Total Hedge Required (20%): $2,490,000

=== Hedge Allocations ===
Products Being Hedged: 42
  Polymarket (40%): $996,000
  Perpetuals (40%): $996,000
  Allianz (20%): $498,000

=== Active Hedge Positions ===
Open Positions: 126
Closed Positions: 54
Total Realized P&L: $342,500
```

### 2. Depeg Hedge Executor (`depeg_hedge_executor.ml`)

**Purpose:** Execute Polymarket hedges for stablecoin depeg coverage

**Strategy:**
- User buys $100,000 USDC depeg coverage
- Executor buys $20,000 worth of YES shares on "USDC < $0.98"
- If USDC depegs → User gets $100k, hedge pays $40k (2x return)
- Net vault cost: $60k (vs $100k unhedged)

**Key Functions:**
- `find_depeg_markets()` - Search Polymarket for depeg markets
- `execute_depeg_hedge()` - Buy YES shares on prediction markets
- `liquidate_hedge_position()` - Sell shares on claim payout
- `execute_batch_hedges()` - Batch execution for efficiency

**Supported Assets:**
- USDC, USDT, DAI, FRAX, BUSD, USDe, sUSDe, USDY, PYUSD, GHO, LUSD, crvUSD, mkUSD

**Polymarket Integration:**
- CLOB API for order execution
- WebSocket for price monitoring
- Liquidity typically $100k-$10M per market

### 3. Bridge Exploit Executor (TODO)

Execute hedges for bridge coverage using Polymarket prediction markets like "Will Wormhole be hacked this month?"

### 4. CEX Liquidation Executor (TODO)

Execute correlation hedges using Binance Futures for CEX liquidation coverage.

---

## Integration Points

### With Existing Systems

**Pricing Oracle Keeper** (`backend/pricing/pricing_oracle_keeper.ml`):
- Fetch real-time hedge costs from Polymarket/Binance
- Update on-chain DynamicPricingOracle contract
- Calculate swing premiums (base + hedge costs)

**Policy Event Subscriber** (`backend/integration/policy_event_subscriber.ml`):
- Listen for new policy creation events
- Trigger hedge execution automatically
- Update hedge positions on policy expiry

**Collateral Manager** (`backend/pool/collateral_manager.ml`):
- Coordinate hedge settlements with vault rebalancing
- Reconcile hedge P&L with reserve vault

### External APIs

**Polymarket CLOB API**:
- Endpoint: `https://clob.polymarket.com/`
- Auth: HMAC signature
- Operations: Place orders, cancel orders, get orderbook
- WebSocket: `wss://clob.polymarket.com/ws` for price updates

**Binance Futures API**:
- Endpoint: `https://fapi.binance.com/`
- Auth: HMAC-SHA256
- Operations: Open/close positions, get funding rates
- Already integrated in `backend/integration/binance_futures_client.ml`

**Allianz Parametric Insurance** (Future):
- Traditional reinsurance partnership
- Manual quote process initially
- API integration planned for Phase 5

---

## Usage Examples

### Execute Depeg Hedge

```ocaml
open Depeg_hedge_executor.DepegHedgeExecutor

(* Execute hedge for single policy *)
let%lwt result = execute_depeg_hedge
  ~policy:{
    policy_id = 12345L;
    coverage_type = Depeg;
    asset = USDC;
    coverage_amount = 10_000_000L; (* $100,000 *)
    ...
  }
  ~hedge_ratio:0.20
in

match result with
| Some exec ->
    Logs.info (fun m ->
      m "Hedge executed: %.2f shares at $%.4f = $%.2f"
        exec.shares_bought exec.avg_price exec.total_cost_usd
    )
| None ->
    Logs.warn (fun m -> m "No suitable market found")
```

### Start Hedge Orchestrator

```ocaml
open Hedge_orchestrator.HedgeOrchestrator

(* Start main hedge loop *)
let%lwt () = hedge_loop
  ~policies_provider:(fun () -> Database.fetch_active_policies ())
  ~config:default_config
```

---

## Database Schema

### hedge_positions Table

```sql
CREATE TABLE hedge_positions (
  position_id TEXT PRIMARY KEY,
  policy_id BIGINT NOT NULL,
  coverage_type INT NOT NULL,
  chain TEXT NOT NULL,
  asset TEXT NOT NULL,
  venue TEXT NOT NULL, -- 'polymarket' | 'binance_futures' | 'allianz'
  external_order_id TEXT NOT NULL,
  hedge_amount BIGINT NOT NULL,
  entry_price REAL NOT NULL,
  entry_time REAL NOT NULL,
  status TEXT NOT NULL, -- 'open' | 'closed'
  realized_pnl BIGINT,
  close_time REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (policy_id) REFERENCES policies(policy_id)
);

CREATE INDEX idx_hedge_policy ON hedge_positions(policy_id);
CREATE INDEX idx_hedge_status ON hedge_positions(status);
CREATE INDEX idx_hedge_venue ON hedge_positions(venue);
```

---

## Deployment

### Prerequisites

1. **Polymarket API Access**:
   ```bash
   export POLYMARKET_API_KEY="your_api_key"
   export POLYMARKET_SECRET="your_secret"
   ```

2. **Binance Futures Account**:
   ```bash
   export BINANCE_API_KEY="your_api_key"
   export BINANCE_SECRET="your_secret"
   ```

3. **PostgreSQL Database**:
   ```bash
   psql -U tonsurance -d tonsurance_prod < migrations/002_hedge_positions.sql
   ```

### Build & Test

```bash
# Build hedging module
cd backend
dune build hedging

# Run unit tests
dune test hedging

# Start hedge orchestrator (dry-run mode)
./hedge_orchestrator --dry-run

# Start hedge orchestrator (production)
./hedge_orchestrator --config prod.yaml
```

### Testnet Deployment

```bash
# Deploy to TON testnet
cd ../
npm run deploy:testnet -- --contract HedgedPolicyFactory

# Verify hedge execution
curl http://localhost:8080/api/v2/hedges/positions?status=open
```

---

## Monitoring

### Key Metrics

1. **Exposure Coverage**: % of policies with active hedges
2. **Hedge Efficiency**: Average hedge cost / expected payout
3. **P&L Tracking**: Realized vs unrealized P&L
4. **Liquidity Health**: Available liquidity vs required hedge size
5. **Execution Latency**: Time from policy creation to hedge execution

### Alerts

- Hedge execution failure (Slack notification)
- Low liquidity warning (< 10% of required hedge size)
- Large P&L movement (> $10k in 1 hour)
- Polymarket API downtime
- Binance Futures position liquidation

### Grafana Dashboard

See `infra/monitoring/grafana/hedge-dashboard.json` for complete dashboard config.

---

## Next Steps

### Phase 1 (Current - Day 1-2)
- ✅ Hedge orchestrator skeleton
- ✅ Depeg hedge executor (Polymarket)
- ⏳ Bridge hedge executor
- ⏳ CEX liquidation executor

### Phase 2 (Day 3-5)
- Integration with pricing oracle keeper
- Real-time hedge cost fetching
- Database position tracking
- WebSocket price monitoring

### Phase 3 (Day 6-7)
- Testnet deployment
- End-to-end testing
- Performance optimization
- Production rollout

### Phase 4 (Future)
- Allianz parametric insurance integration
- ML-based hedge optimization
- Cross-venue arbitrage
- Additional hedge venues (Hyperliquid, GMX)

---

## References

- **HEDGED_ARCHITECTURE.md**: Complete system architecture
- **Polymarket Docs**: https://docs.polymarket.com/
- **Binance Futures API**: https://binance-docs.github.io/apidocs/futures/en/
- **TON Blueprint**: https://github.com/ton-org/blueprint

---

## Contributors

- Engineering Team
- Risk Management Team
- Quantitative Research Team

**Last Updated:** 2025-10-18
