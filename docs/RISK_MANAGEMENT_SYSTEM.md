# Risk Management System - Complete Architecture

## Overview

The Tonsurance Risk Management System is a comprehensive, real-time monitoring and optimization platform that operates across the unified liquidity pool. It consists of three core subsystems orchestrated by a single daemon:

1. **Unified Risk Monitor**: Real-time portfolio surveillance
2. **Float Rebalancer**: Dynamic USD/BTC allocation
3. **Tranche Arbitrage Engine**: Market making for virtual tranches

All systems share a single unified pool state and coordinate through the Risk Management Daemon.

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────┐
│          Risk Management Daemon (Orchestrator)               │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐│
│  │ Risk Monitor   │  │ Float Rebal.   │  │ Tranche Arb.   ││
│  │ (60s cycle)    │  │ (300s cycle)   │  │ (900s cycle)   ││
│  └────────┬───────┘  └────────┬───────┘  └────────┬───────┘│
│           │                    │                    │         │
│           └────────────────────┼────────────────────┘         │
│                                │                              │
└────────────────────────────────┼──────────────────────────────┘
                                 │
                      ┌──────────▼──────────┐
                      │  Unified Pool State │
                      │  (Shared Reference) │
                      └─────────────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
      ┌─────▼─────┐        ┌────▼────┐        ┌─────▼─────┐
      │ Policies  │        │  Float  │        │ Tranches  │
      │ $80M      │        │ USD/BTC │        │ 6 Virtual │
      └───────────┘        └─────────┘        └───────────┘
```

---

## 1. Unified Risk Monitor

**Purpose**: Real-time portfolio surveillance across ALL products

**Location**: `/lib/monitoring/unified_risk_monitor.ml`

### Key Metrics Calculated

```ocaml
type risk_snapshot = {
  (* Value at Risk *)
  var_95: float;                    (* 95% confidence VaR *)
  var_99: float;                    (* 99% confidence VaR *)
  cvar_95: float;                   (* Conditional VaR (expected shortfall) *)
  expected_loss: float;             (* Expected loss from active policies *)

  (* Stress Testing *)
  worst_case_stress: float;         (* Worst-case loss across scenarios *)
  stress_test_results: (string * float) list;

  (* Utilization *)
  ltv: float;                       (* Coverage sold / Total capital *)
  reserve_ratio: float;             (* USD reserves / Total capital *)

  (* Concentration *)
  asset_concentrations: (asset * float) list;
  max_concentration: float;         (* Highest single asset exposure *)

  (* Correlation *)
  correlated_exposure: float;       (* Total exposure to correlated assets *)
  correlation_matrix: (asset * asset * float) list;
  correlation_regime: [`Low | `Medium | `High];

  (* Alerts *)
  breach_alerts: risk_alert list;   (* Critical breaches *)
  warning_alerts: risk_alert list;  (* Warning threshold breaches *)
}
```

### VaR Calculation

Uses **Monte Carlo simulation** with 10,000 scenarios:

```ocaml
(* For each scenario: *)
1. Sample correlated price movements for all assets
2. Calculate payout probability for each policy
3. Sum total portfolio loss
4. Sort losses, take 95th/99th percentile

(* VaR 95 = "We expect losses to exceed this value only 5% of the time" *)
```

### Stress Test Scenarios

```ocaml
1. Banking Crisis: USDC→$0.85, USDT→$0.80, DAI→$0.88
2. Crypto Crash: All stables→$0.90 simultaneously
3. Regulatory: USDC→$0.75, USDT→$0.70 (severe)
4. Multiple Failures: 3+ stables depeg at once
```

### Risk-Adjusted Pricing

```ocaml
val get_risk_adjusted_multiplier : risk_snapshot -> policy -> float

(* Returns 1.0x - 3.0x multiplier based on: *)
- LTV pressure (>70% increases premiums)
- Asset concentration (>25% increases premiums)
- Correlation regime (high correlation = 1.3x)
- Reserve pressure (<20% increases premiums)
- Stress test proximity (near breach = 1.5x)
```

### Monitoring Loop

```ocaml
let monitor_loop
    ~collateral_manager:(mgr ref)
    ~config
    ~price_history_provider
  : unit Lwt.t =

  (* Every 60 seconds: *)
  1. Fetch current prices
  2. Get price history (100 data points)
  3. Calculate comprehensive risk metrics
  4. Generate alerts if thresholds breached
  5. Log snapshot to monitoring system
  6. Update risk-adjusted pricing multipliers
```

**Output**: Real-time risk dashboard with alerts

---

## 2. Float Rebalancer

**Purpose**: Automated USD/BTC allocation based on liquidity needs

**Location**: `/lib/pool/float_rebalancer.ml`

### Core Innovation: Liquidity-Driven Allocation

Traditional approach: Fixed 40% USD, 60% BTC

Our approach: **Dynamic allocation based on required liquidity**

```ocaml
(* Step 1: Calculate required liquidity *)
let required_usd =
  (* For each policy: *)
  - Calculate worst-case payout
  - Assume 50% of policies trigger simultaneously
  - Add 50% buffer
  in
  total_worst_case * 1.5

(* Step 2: Adjust target allocation *)
let target_usd_pct =
  max
    config.base_target_usd_pct  (* 40% base *)
    (required_usd / total_capital)
  |> adjust_for_btc_volatility
  |> cap_at_reasonable_bounds

(* Step 3: Rebalance if drift > 10% *)
if abs (current_usd_pct - target_usd_pct) > 0.10 then
  rebalance ()
```

### Rebalancing Logic

```ocaml
type rebalance_action = {
  action: [`Buy_BTC of float | `Sell_BTC of float | `Hold];
  usd_amount: float;
  btc_amount: float;
  reason: string;
  urgency: [`Low | `Medium | `High | `Critical];
  expected_benefit: float;
}

(* Urgency levels: *)
- Low: Efficiency optimization (5-10% drift)
- Medium: Target drift (10-15%)
- High: Liquidity concern (>15% drift, reserves <25%)
- Critical: Emergency (reserves <15%, LTV >80%)
```

### Example Scenarios

**Scenario 1: Normal Operations**
```
Total Capital: $100M
Active Policies: $50M coverage
Required Liquidity: $20M (worst case)

Current: 40% USD ($40M), 60% BTC ($60M)
Target: 40% USD (required $20M + buffer)
Action: Hold (within threshold)
```

**Scenario 2: Coverage Surge**
```
Total Capital: $100M
Active Policies: $75M coverage
Required Liquidity: $40M (worst case)

Current: 40% USD ($40M), 60% BTC ($60M)
Target: 50% USD (need more liquidity)
Action: Sell $10M BTC → Hold $50M USD
Reason: "Liquidity pressure from coverage surge"
```

**Scenario 3: High BTC Volatility**
```
BTC Volatility: 80% (vs normal 60%)

Current: 40% USD ($40M), 60% BTC ($60M)
Target: 50% USD (reduce volatile asset)
Action: Sell $10M BTC → Hold $50M USD
Reason: "High BTC volatility mitigation"
```

### DCA (Dollar Cost Averaging)

For large rebalances, split into smaller trades:

```ocaml
if trade_size > (total_capital * config.max_trade_size_pct) then
  (* Split into multiple trades over time *)
  execute_dca_trades
    ~total_amount
    ~max_per_trade:(total_capital * 0.25)
    ~interval:3600.0  (* 1 hour between trades *)
```

### Cost Basis Tracking

```ocaml
(* When buying BTC: *)
new_cost_basis =
  (old_cost_basis * old_btc + purchase_usd * new_btc) / total_btc

(* When selling BTC: *)
new_cost_basis =
  old_cost_basis * (remaining_btc / original_btc)
```

### Rebalancing Loop

```ocaml
let rebalance_loop
    ~collateral_manager:(mgr ref)
    ~config
  : unit Lwt.t =

  (* Every 300 seconds (5 minutes): *)
  1. Fetch BTC price and volatility
  2. Calculate required liquidity
  3. Determine dynamic target allocation
  4. Check if rebalancing needed (>10% drift)
  5. Execute rebalance if needed
  6. Log action and update metrics
```

**Output**: Optimized USD/BTC allocation

---

## 3. Tranche Arbitrage Engine

**Purpose**: Market making for virtual tranches - capture mispricing

**Location**: `/lib/pool/tranche_arbitrage.ml`

### Fair Value Model

```ocaml
type fair_value_analysis = {
  tranche_id: int;
  current_nav: float;              (* Current NAV per token *)
  fair_value_nav: float;           (* Calculated fair value *)
  risk_contribution_pct: float;    (* Marginal risk contribution *)
  loss_absorption_capacity: float; (* First-loss capacity *)
  expected_loss_rate: float;       (* Expected annual loss *)
  fair_value_yield_bps: int;       (* Risk-adjusted fair yield *)
  mispricing_pct: float;           (* (Fair - Current) / Current *)
  recommendation: [`Buy | `Sell | `Hold];
  confidence: float;               (* 0.0 - 1.0 *)
  expected_return: float;          (* Expected profit from arbitrage *)
}
```

### Fair Yield Calculation

```ocaml
let calculate_fair_yield
    ~risk_contribution
    ~loss_absorption
    ~expected_loss_rate
    ~config
  : int =

  (* Base rate: Risk-free rate *)
  let base_rate = config.risk_free_rate in  (* 5% *)

  (* Risk premium based on exposure *)
  let risk_premium =
    (risk_contribution * 0.20) +          (* 20% per unit risk *)
    (loss_absorption * 0.15) +            (* 15% per unit loss exposure *)
    (expected_loss_rate * 2.0)            (* 2x expected losses *)
  in

  (* Fair yield = base + premium *)
  let fair_yield = base_rate +. risk_premium in

  (* Convert to basis points *)
  Float.to_int (fair_yield *. 10000.0)
```

**Example:**

```
Junior Tranche (T3):
- Risk contribution: 40% of portfolio risk
- Loss absorption: First $20M of losses
- Expected loss rate: 3% annually

Fair yield = 5% + (0.40 * 20%) + (0.20 * 15%) + (0.03 * 200%)
          = 5% + 8% + 3% + 6%
          = 22% annual return

Current yield: 20% (target)
→ Underpriced by 2% → BUY signal
```

### Fair NAV Calculation

```ocaml
(* Discount future cash flows at fair yield *)
let fair_nav =
  let future_value =
    allocated_capital - expected_losses + expected_yields
  in
  let discount_factor =
    1.0 /. (1.0 +. (fair_yield /. 10000.0))
  in
  future_value *. discount_factor /. lp_token_supply
```

### Arbitrage Opportunity Detection

```ocaml
type arbitrage_opportunity = {
  buy_tranche: int;                (* Undervalued tranche *)
  sell_tranche: int;               (* Overvalued tranche *)
  buy_amount: float;               (* USD to allocate *)
  sell_amount: float;              (* USD to deallocate *)
  expected_profit: float;          (* Expected gain *)
  confidence: float;               (* 0.0 - 1.0 *)
  analysis: fair_value_analysis list;
}

(* Opportunity found when: *)
1. Buy tranche: (Fair NAV - Current NAV) / Current NAV > 2%
2. Sell tranche: (Current NAV - Fair NAV) / Fair NAV > 2%
3. Spread > 4% (buy undervalued, sell overvalued)
```

**Example:**

```
Senior Tranche (T1):
- Current NAV: $1.05
- Fair NAV: $1.02
- Mispricing: +2.9% (overvalued)
→ SELL

Junior Tranche (T3):
- Current NAV: $0.90
- Fair NAV: $0.95
- Mispricing: -5.6% (undervalued)
→ BUY

Arbitrage:
- Reduce T1 allocation by $5M
- Increase T3 allocation by $5M
- Expected profit: $5M * (5.6% - 2.9%) = $135k
- Confidence: 85%
```

### Arbitrage Execution

```ocaml
let execute_arbitrage
    (mgr: Collateral_manager.t)
    ~(opportunity: arbitrage_opportunity)
  : Collateral_manager.t =

  (* Internal capital reallocation - NO external transactions *)

  (* 1. Reduce overvalued tranche *)
  let updated_tranches =
    reduce_tranche_allocation
      tranches
      ~tranche_id:opportunity.sell_tranche
      ~amount:opportunity.sell_amount
  in

  (* 2. Increase undervalued tranche *)
  let final_tranches =
    increase_tranche_allocation
      updated_tranches
      ~tranche_id:opportunity.buy_tranche
      ~amount:opportunity.buy_amount
  in

  (* 3. Update pool state *)
  { mgr with pool = { pool with virtual_tranches = final_tranches } }
```

**Key Point**: This is pure accounting - we're rotating internal capital allocation, not executing external trades.

### Portfolio Optimization

```ocaml
let optimize_tranche_allocation
    (mgr: Collateral_manager.t)
    ~config
  : (int * float) list =

  (* Calculate Sharpe ratio for each tranche *)
  let tranche_sharpe_ratios =
    List.map tranches ~f:(fun t ->
      let expected_return = calculate_expected_return t in
      let volatility = calculate_volatility t in
      let sharpe = (expected_return - config.risk_free_rate) / volatility in
      (t.tranche_id, sharpe)
    )
  in

  (* Allocate capital proportional to Sharpe ratio *)
  optimize_allocation_by_sharpe tranche_sharpe_ratios
```

### Arbitrage Loop

```ocaml
let arbitrage_loop
    ~collateral_manager:(mgr ref)
    ~config
  : unit Lwt.t =

  (* Every 900 seconds (15 minutes): *)
  1. Calculate fair value for each tranche
  2. Detect mispricing (>2% threshold)
  3. Identify arbitrage opportunities
  4. Execute profitable arbitrages
  5. Log opportunities and actions
```

**Output**: Optimized tranche allocation with captured arbitrage profits

---

## 4. Risk Management Daemon

**Purpose**: Orchestrate all systems with shared state

**Location**: `/lib/daemons/risk_management_daemon.ml`

### Daemon Architecture

```ocaml
type daemon_state = {
  mutable collateral_manager: Collateral_manager.t;
  mutable price_history: (asset * float list) list;
  mutable is_running: bool;
  mutable error_counts: (string * int) list;
  mutable metrics: daemon_metrics;
}
```

### Parallel Execution

```ocaml
let start_daemon ~config state =
  (* All systems run in parallel *)
  Lwt.join [
    risk_monitor_loop state config;      (* 60s cycle *)
    rebalancer_loop state config;        (* 300s cycle *)
    arbitrage_loop state config;         (* 900s cycle *)
    price_update_loop state config;      (* 120s cycle *)
    health_check_loop state config;      (* 30s cycle *)
  ]
```

### Health Monitoring

```ocaml
let check_health state config =
  (* Check emergency conditions *)
  if ltv > config.max_ltv_shutdown then
    emergency_shutdown "LTV too high"

  if reserve_ratio < config.min_reserve_shutdown then
    emergency_shutdown "Reserves too low"

  (* Check error counts *)
  if total_errors > config.max_error_count then
    shutdown "Too many errors"
```

### Metrics Dashboard

```ocaml
type daemon_metrics = {
  mutable risk_monitor_cycles: int;
  mutable rebalancer_cycles: int;
  mutable arbitrage_cycles: int;
  mutable total_errors: int;
  mutable uptime_seconds: float;
  mutable last_risk_snapshot: risk_snapshot option;
  mutable last_rebalance: rebalance_action option;
  mutable last_arbitrage: arbitrage_opportunity list;
}
```

### Logging System

```ocaml
[timestamp] LEVEL [component] message

Examples:
[1697123456.789] INFO [RiskMonitor] Cycle 42: VaR95=2.3%, LTV=68.5%
[1697123456.790] WARNING [RiskMonitor] Asset concentration: USDC at 32%
[1697123757.123] INFO [Rebalancer] Action: Sell BTC, USD: $8.5M, Reason: Liquidity pressure
[1697124257.456] INFO [Arbitrage] Found 2 opportunities, executing T1→T3 arb
[1697124257.789] ERROR [HealthMonitor] LTV at 95.2%, approaching shutdown threshold
```

### Configuration

```ocaml
let default_config = {
  (* Intervals *)
  risk_monitor_interval = 60.0;        (* 1 minute *)
  rebalancer_interval = 300.0;         (* 5 minutes *)
  arbitrage_interval = 900.0;          (* 15 minutes *)
  health_check_interval = 30.0;        (* 30 seconds *)

  (* Safety *)
  max_error_count = 10;
  enable_emergency_shutdown = true;
  max_ltv_shutdown = 0.95;             (* 95% *)
  min_reserve_shutdown = 0.05;         (* 5% *)

  (* Logging *)
  log_level = `Info;
  log_file = Some "logs/risk_management_daemon.log";
}
```

---

## Integration Example

### Startup Sequence

```ocaml
(* 1. Create initial pool state *)
let initial_pool = Collateral_manager.create_unified_pool () in
let collateral_mgr = Collateral_manager.create initial_pool in

(* 2. Create daemon *)
let daemon = Risk_management_daemon.create_daemon collateral_mgr in

(* 3. Start all systems *)
Risk_management_daemon.start_daemon daemon
```

### Normal Operation Flow

```
T=0s:    Daemon starts, initializes price history
T=30s:   Health check runs (all green)
T=60s:   Risk Monitor calculates VaR, detects concentration warning
T=120s:  Price history updated
T=150s:  Health check runs (warning logged)
T=180s:  Risk Monitor recalculates, concentration resolved
T=300s:  Rebalancer evaluates, no action needed
T=330s:  Health check runs
T=360s:  Risk Monitor continues...
T=900s:  Arbitrage engine runs, finds T1→T3 opportunity
T=905s:  Arbitrage executed, $2.5M rotated, $65k profit captured
```

### Emergency Scenario

```
T=0s:    Normal operation, LTV 75%
T=300s:  Large policy purchased, LTV jumps to 88%
T=360s:  Risk Monitor detects high LTV, logs warning
T=420s:  Health check sees LTV 88%, no action yet
T=600s:  Another policy purchased, LTV hits 96%
T=630s:  Health check detects LTV > 95% shutdown threshold
T=631s:  EMERGENCY SHUTDOWN triggered
T=632s:  All systems gracefully stop
T=633s:  Final metrics logged, daemon exits
```

---

## Metrics & Monitoring

### Key Metrics Tracked

1. **Risk Metrics**
   - VaR 95/99
   - Conditional VaR
   - LTV ratio
   - Reserve ratio
   - Asset concentration
   - Correlation regime

2. **Performance Metrics**
   - System uptime
   - Cycle counts per component
   - Error rates
   - Response times

3. **Financial Metrics**
   - Total capital
   - Coverage sold
   - USD reserves
   - BTC float value
   - Arbitrage profits
   - Rebalancing costs

### Alert Thresholds

```ocaml
Risk Level    | LTV      | Reserves | Concentration | Action
--------------|----------|----------|---------------|------------------
Normal        | <70%     | >25%     | <25%          | Monitor
Warning       | 70-80%   | 15-25%   | 25-30%        | Increase premiums
High          | 80-90%   | 10-15%   | 30-40%        | Stop new policies
Critical      | 90-95%   | 5-10%    | >40%          | Emergency measures
Emergency     | >95%     | <5%      | -             | Shutdown
```

---

## Testing

**Location**: `/test/test_risk_management_integration.ml`

### Test Coverage

1. **Risk Monitor Tests**
   - VaR calculation accuracy
   - Stress test scenarios
   - Alert generation
   - Risk-adjusted pricing

2. **Rebalancer Tests**
   - Liquidity calculation
   - Dynamic allocation
   - Trade execution
   - Cost basis tracking

3. **Arbitrage Tests**
   - Fair value calculation
   - Opportunity detection
   - Execution logic
   - Portfolio optimization

4. **Integration Tests**
   - Daemon startup/shutdown
   - Parallel execution
   - Shared state coordination
   - Emergency scenarios
   - Loss waterfall

### Running Tests

```bash
# Run full integration test suite
dune test test/test_risk_management_integration.ml

# Run daemon for 15 seconds (test mode)
dune exec test_risk_management_daemon

# Expected output:
# [Daemon] Running integrated test for 15 seconds...
# [RiskMonitor] Cycle 1: VaR95=2.3%, LTV=68.5%
# [Rebalancer] Cycle 1: No action needed
# [Arbitrage] Found 2 opportunities
# [Daemon] Test completed successfully
```

---

## Production Deployment

### Prerequisites

1. PostgreSQL + TimescaleDB for metrics storage
2. Oracle price feeds configured
3. TON blockchain connection
4. Monitoring dashboards (Grafana/Prometheus)

### Configuration

```ocaml
(* Production config *)
let production_config = {
  risk_monitor_interval = 60.0;
  rebalancer_interval = 300.0;
  arbitrage_interval = 900.0;
  health_check_interval = 30.0;
  max_error_count = 10;
  enable_emergency_shutdown = true;
  max_ltv_shutdown = 0.95;
  min_reserve_shutdown = 0.05;
  log_level = `Info;
  log_file = Some "/var/log/tonsurance/risk_daemon.log";
}
```

### Startup

```bash
# Build
dune build lib/daemons/risk_management_daemon.ml

# Run as daemon
nohup dune exec risk_management_daemon > /dev/null 2>&1 &

# Check logs
tail -f /var/log/tonsurance/risk_daemon.log

# Monitor metrics
curl http://localhost:9090/metrics
```

### Monitoring Endpoints

```
GET /health           - Health check status
GET /metrics          - Prometheus metrics
GET /risk/snapshot    - Latest risk snapshot
GET /rebalance/status - Latest rebalance action
GET /arbitrage/status - Latest arbitrage opportunities
```

---

## Future Enhancements

1. **Machine Learning**
   - Predictive risk models
   - Volatility forecasting
   - Correlation regime detection

2. **Advanced Optimization**
   - Multi-period optimization
   - Transaction cost modeling
   - Slippage estimation

3. **Scalability**
   - Distributed monitoring
   - Sharded price data
   - Parallel stress testing

4. **Integration**
   - External DEX integration for rebalancing
   - Cross-chain arbitrage
   - Multi-asset float management

---

## Summary

The Risk Management System provides:

✅ **Real-time surveillance** across unified pool
✅ **Dynamic capital allocation** optimized for liquidity
✅ **Automated arbitrage** capturing tranche mispricing
✅ **Emergency safeguards** preventing catastrophic losses
✅ **Comprehensive metrics** for transparency and auditing

All systems coordinate through shared state with graceful error handling and emergency shutdown capabilities.

**Critical Principle**: Single unified pool, coordinated risk management, no fragmented liquidity.
