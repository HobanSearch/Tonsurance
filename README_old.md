# Tonsurance - Stablecoin Insurance Protocol

**Type-safe insurance for the decentralized future**

OCaml backend for Tonsurance, a decentralized insurance protocol for stablecoins on the TON blockchain.

## 🎯 Overview

Tonsurance provides parametric insurance for stablecoin depegs using:
- **7-factor dynamic pricing** with actuarial models
- **Unified liquidity pool** with virtual tranches (no fragmentation)
- **Real-time risk management** (VaR, stress tests, rebalancing)
- **Bitcoin float strategy** for constant yields
- **Sustained trigger validation** (4-hour requirement)

## 📊 Key Features

### For Policyholders
- ✅ Insure USDC, USDT, DAI, and other stablecoins
- ✅ Custom trigger and floor prices
- ✅ Linear payout formula (no binary options)
- ✅ Beneficiary support (gift insurance to others)
- ✅ Policy NFTs on TON blockchain

### For LPs (Liquidity Providers)
- ✅ 6 tranches with varying risk/return profiles
- ✅ 8% - 25% target yields
- ✅ Bitcoin float appreciation (20% of premiums)
- ✅ Automated rebalancing and optimization
- ✅ Transparent NAV and loss allocation

### For Developers
- ✅ Type-safe OCaml backend (no runtime errors)
- ✅ REST API with comprehensive endpoints
- ✅ Real-time risk monitoring
- ✅ Automated claims processing
- ✅ Production-ready with tests

## 🚀 Quick Start

### Prerequisites

```bash
# Install OCaml 5.0+
opam init
opam switch create 5.1.0
eval $(opam env)

# Install dependencies
opam install dune core lwt dream caqti yojson logs
```

### Build

```bash
# Clone repository
git clone https://github.com/tonsurance/tonsurance
cd tonsurance

# Install dependencies
opam install . --deps-only

# Build all modules
dune build

# Run tests
dune test
```

### Run API Server

```bash
# Start API server on port 8080
dune exec tonsurance_api_server

# Server will be available at http://localhost:8080
```

### Run Risk Management Daemon

```bash
# Start background risk monitoring
dune exec risk_management_daemon

# This starts:
# - Risk Monitor (60s cycle)
# - Float Rebalancer (5min cycle)
# - Tranche Arbitrage (15min cycle)
```

## 📖 API Examples

### Get Premium Quote

```bash
curl -X POST http://localhost:8080/api/v1/quote \
  -H "Content-Type: application/json" \
  -d '{
    "asset": "USDC",
    "coverage_amount_usd": 100000,
    "trigger_price": 0.97,
    "floor_price": 0.90,
    "duration_days": 30
  }'

# Response:
{
  "premium_usd": 328.77,
  "premium_rate_bps": 329,
  "coverage_usd": 100000,
  "duration_days": 30,
  "estimated_roi": 0.0,
  "available": true,
  "reason": null
}
```

### Purchase Policy

```bash
curl -X POST http://localhost:8080/api/v1/policy/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "buyer_address": "EQBv...",
    "beneficiary_address": "EQCx...",
    "asset": "USDC",
    "coverage_amount_usd": 100000,
    "trigger_price": 0.97,
    "floor_price": 0.90,
    "duration_days": 30,
    "is_gift": false
  }'

# Response:
{
  "policy_id": 123456789,
  "contract_address": "EQ...",
  "nft_minted": true,
  "premium_paid_usd": 328.77,
  "transaction_hash": "tx_123456789"
}
```

### Get Policy Info

```bash
curl http://localhost:8080/api/v1/policy/123456789

# Response:
{
  "policy": {
    "policy_id": 123456789,
    "policyholder": "EQBv...",
    "beneficiary": "EQCx...",
    "asset": "USDC",
    "coverage_amount": 10000000,
    "trigger_price": 0.97,
    "floor_price": 0.90,
    "status": "active"
  },
  "current_asset_price": 0.9995,
  "is_triggered": false,
  "time_remaining_seconds": 2592000,
  "estimated_payout_usd": null
}
```

### Get Vault Info

```bash
curl http://localhost:8080/api/v1/vault/info

# Response:
{
  "total_capital_usd": 100000000,
  "total_coverage_sold_usd": 50000000,
  "ltv_ratio": 0.5,
  "usd_reserves_usd": 40000000,
  "btc_float_btc": 923.08,
  "btc_float_usd": 60000000,
  "tranches": [
    {
      "tranche_id": 1,
      "seniority": 1,
      "target_yield_bps": 800,
      "nav": 1.05,
      "tvl_usd": 30000000,
      "accumulated_yield_usd": 1500000,
      "accumulated_loss_usd": 0
    }
  ],
  "available_capacity_usd": 50000000
}
```

### LP Deposit

```bash
curl -X POST http://localhost:8080/api/v1/lp/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "lp_address": "EQLp...",
    "tranche_id": 1,
    "amount_usd": 10000
  }'

# Response:
{
  "lp_tokens": 9523,
  "tranche_id": 1,
  "amount_deposited_usd": 10000,
  "transaction_hash": "tx_deposit_EQLp..."
}
```

### Get Risk Metrics

```bash
curl http://localhost:8080/api/v1/risk/metrics

# Response:
{
  "var_95": 0.023,
  "var_99": 0.035,
  "cvar_95": 0.041,
  "expected_loss": 0.015,
  "ltv": 0.5,
  "reserve_ratio": 0.4,
  "max_concentration": 0.25,
  "breach_alerts": 0,
  "warning_alerts": 1
}
```

## 🏗️ Architecture

### Module Overview

```
tonsurance/
├── lib/
│   ├── types/              # Core type system
│   ├── math/               # Math & statistics utilities
│   ├── pricing/            # 7-factor pricing engine
│   ├── risk/               # Risk model (VaR, stress tests)
│   ├── pool/               # Collateral manager, rebalancer, arbitrage
│   ├── float/              # Bitcoin float manager
│   ├── monitoring/         # Unified risk monitor
│   ├── claims/             # Claims processing engine
│   ├── integration/        # Oracle, database, TON client
│   ├── daemons/            # Background services
│   └── api/                # REST API server
├── test/                   # Integration tests
├── contracts/              # TON smart contracts (FunC)
└── docs/                   # Documentation
```

### Data Flow

```
User Request
    ↓
REST API (Dream)
    ↓
Pricing Engine → Risk Model → Collateral Manager
    ↓
Policy Created → Smart Contract (TON)
    ↓
Oracle Monitor → Trigger Check (4 hours sustained)
    ↓
Claims Engine → Payout → Beneficiary
    ↓
Loss Waterfall → Tranches (Junior → Senior)
```

## 💰 Pricing Model

### 7-Factor Dynamic Pricing

```ocaml
Premium = Coverage * Duration * (
    Base_Rate              (* 4% annualized *)
    * Risk_Multiplier      (* Asset-specific: USDC 1.0x, USDT 1.2x *)
    * Utilization_Factor   (* (1 + LTV²) *)
    * Stress_Factor        (* 1.0x - 2.5x based on market *)
    * Asset_Factor         (* Based on reserves, audits, etc. *)
    * Duration_Factor      (* sqrt(days/365) *)
    * Loss_Ratio_Adj       (* Actual vs expected losses *)
)
```

**Example**:
- Coverage: $100,000
- Asset: USDC
- Duration: 30 days
- Result: **$328.77** (≈4% annualized)

## 🎲 Risk Management

### Value at Risk (VaR)

Monte Carlo simulation with 10,000 scenarios:

```ocaml
1. Generate correlated price movements for all assets
2. Calculate payout for each scenario
3. Sort losses and take 95th/99th percentile
4. VaR 95 = Expected loss exceeded only 5% of time
```

### Stress Tests

```ocaml
1. Banking Crisis:  USDC→$0.85, USDT→$0.80
2. Crypto Crash:    All stables→$0.90
3. Regulatory:      USDC→$0.75, USDT→$0.70
4. Multiple Fails:  3+ depegs simultaneously
```

### Risk Limits

```ocaml
✅ LTV < 75%              (Coverage / Capital)
✅ Reserves > 15%         (USD / Capital)
✅ Concentration < 30%    (Single asset exposure)
✅ Correlation < 50%      (Correlated assets)
✅ Stress Buffer > 1.5x   (Worst case loss)
```

## 🔄 Float Rebalancing

### Liquidity-Driven Allocation

```ocaml
(* Traditional: Fixed 40% USD, 60% BTC *)
(* Ours: Calculate required liquidity, adjust accordingly *)

required_usd = worst_case_payouts * 1.5x buffer

target_usd_pct = max(
  0.40,  (* Base 40% *)
  required_usd / total_capital
) |> adjust_for_btc_volatility
```

**Rebalancing triggers**:
- Drift > 10% from target
- High volatility periods
- Liquidity crises
- Emergency scenarios

## 📊 Virtual Tranches

### Tranche Structure (Risk/Return)

```
Tranche 1 (BTC Senior)      8%  | █░░░░░ 5% risk
Tranche 2 (Stable Senior)  10%  | ██░░░░ 10% risk
Tranche 3 (Opportunistic)  15%  | ███░░░ 15% risk
Tranche 4 (RWA)            12%  | ██░░░░ 12% risk
Tranche 5 (DeFi Yield)     16%  | ████░░ 20% risk
Tranche 6 (Natural Hedge)  25%  | ██████ 40% risk (junior)
```

### Loss Waterfall

Losses hit junior tranches first:

```
$10M Loss Allocation:
├─ Tranche 6 (Junior):  Absorbs $4M
├─ Tranche 5 (Mezz 2):  Absorbs $3M
├─ Tranche 4 (Mezz 1):  Absorbs $2M
├─ Tranche 3 (Senior 2): Absorbs $1M
├─ Tranche 2 (Senior 1): Protected
└─ Tranche 1 (BTC):      Protected
```

## 🧪 Testing

### Run All Tests

```bash
# Unit tests
dune test

# Integration tests
dune exec test/test_risk_management_integration.exe

# Expected output:
# ✓ Risk monitor calculation
# ✓ Float rebalancer execution
# ✓ Tranche arbitrage opportunities
# ✓ Daemon integration (15s)
# ✓ Emergency shutdown
# ✓ Stress scenario alerts
# ✓ Loss waterfall allocation
```

### Test Coverage

- ✅ Pricing engine (7 factors)
- ✅ Risk model (VaR, stress tests)
- ✅ Collateral manager (pool operations)
- ✅ Claims engine (trigger & payout)
- ✅ Float rebalancer (allocation)
- ✅ Tranche arbitrage (fair value)
- ✅ Full system integration

## 📚 Documentation

- [`/docs/UNIFIED_LIQUIDITY_ARCHITECTURE.md`](docs/UNIFIED_LIQUIDITY_ARCHITECTURE.md) - Pool design
- [`/docs/RISK_MANAGEMENT_SYSTEM.md`](docs/RISK_MANAGEMENT_SYSTEM.md) - Risk monitoring
- [`/docs/VAULT_RETURN_PROFILES.md`](docs/VAULT_RETURN_PROFILES.md) - Tranche strategies
- [`/docs/TECHNICAL_DELIVERY_PLAN.md`](docs/TECHNICAL_DELIVERY_PLAN.md) - Full roadmap
- [`/docs/IMPLEMENTATION_COMPLETE.md`](docs/IMPLEMENTATION_COMPLETE.md) - Implementation status

## 🐳 Docker Deployment

```bash
# Build Docker image
docker build -t tonsurance-backend .

# Run API server
docker run -p 8080:8080 tonsurance-backend

# Run with environment variables
docker run -p 8080:8080 \
  -e DATABASE_URL=postgresql://... \
  -e TON_MAINNET=true \
  tonsurance-backend
```

## 🔧 Configuration

### Environment Variables

```bash
# API Server
API_PORT=8080
API_HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/tonsurance
REDIS_URL=redis://localhost:6379

# TON Blockchain
TON_MAINNET=false
TON_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC
TON_API_KEY=your_api_key

# Oracle
REDSTONE_API_KEY=your_key
PYTH_RPC_URL=https://...
CHAINLINK_RPC_URL=https://...

# Monitoring
DATADOG_API_KEY=your_key
PROMETHEUS_PORT=9090
LOG_LEVEL=info

# Risk Management
RISK_MONITOR_INTERVAL=60
REBALANCER_INTERVAL=300
ARBITRAGE_INTERVAL=900
```

## 🚦 Production Deployment

### Infrastructure Requirements

```yaml
# Kubernetes deployment
Resources:
  API Server:
    replicas: 3
    cpu: 2 cores
    memory: 4GB

  Risk Daemon:
    replicas: 1
    cpu: 4 cores
    memory: 8GB

  Database:
    postgresql: 15+
    timescaledb: 2.13+
    storage: 500GB SSD

  Cache:
    redis: 7+
    memory: 16GB
```

### Monitoring

```bash
# Health check
curl http://localhost:8080/health

# Prometheus metrics
curl http://localhost:9090/metrics

# Logs
tail -f logs/tonsurance.log
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md).

```bash
# Fork the repository
git clone https://github.com/yourusername/tonsurance
cd tonsurance

# Create a branch
git checkout -b feature/your-feature

# Make changes and test
dune build
dune test

# Submit PR
git push origin feature/your-feature
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🔗 Links

- **Website**: https://tonsurance.com
- **Documentation**: https://docs.tonsurance.com
- **Telegram**: https://t.me/tonsurance
- **Twitter**: https://twitter.com/tonsurance
- **GitHub**: https://github.com/tonsurance

## 📞 Support

- **Email**: dev@tonsurance.com
- **Telegram**: @tonsurance_support
- **Discord**: https://discord.gg/tonsurance

---

**Built with ❤️ using OCaml** - Type-safe, fast, and reliable insurance infrastructure
