# Tonsurance Technical Delivery Plan
## Complete Implementation Roadmap with Actuarial Focus

**Version**: 2.0
**Date**: October 2025
**Timeline**: 12 months to production
**Team Size**: 15-20 engineers
**Focus**: OCaml actuarial backend + TON smart contracts

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Phase 1: Foundation (Months 1-3)](#3-phase-1-foundation-months-1-3)
4. [Phase 2: Integration (Months 4-6)](#4-phase-2-integration-months-4-6)
5. [Phase 3: Launch Prep (Months 7-9)](#5-phase-3-launch-prep-months-7-9)
6. [Phase 4: Production (Months 10-12)](#6-phase-4-production-months-10-12)
7. [OCaml Backend Architecture](#7-ocaml-backend-architecture)
8. [Actuarial Models Deep Dive](#8-actuarial-models-deep-dive)
9. [Testing Strategy](#9-testing-strategy)
10. [Infrastructure & DevOps](#10-infrastructure--devops)
11. [Team Structure](#11-team-structure)
12. [Risk Management](#12-risk-management)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRESENTATION LAYER                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  Telegram Bot    │  │   Web Dashboard   │  │  Mobile Apps │ │
│  │  (Node.js/TS)    │  │   (Next.js)       │  │  (Future)    │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
└────────────────────────────────┬────────────────────────────────┘
                                 │ HTTPS/WSS
┌────────────────────────────────▼────────────────────────────────┐
│                    API GATEWAY (Kong)                           │
│  - Rate limiting                                                │
│  - Authentication                                               │
│  - Request routing                                              │
│  - API versioning                                               │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│              APPLICATION LAYER (OCaml - Core Focus)             │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  ACTUARIAL ENGINES (Pure OCaml)                         │  │
│  │                                                          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │  │
│  │  │  Pricing   │  │    Risk    │  │   Float    │        │  │
│  │  │  Engine    │  │   Engine   │  │  Manager   │        │  │
│  │  └────────────┘  └────────────┘  └────────────┘        │  │
│  │                                                          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │  │
│  │  │ Collateral │  │   Claims   │  │ Portfolio  │        │  │
│  │  │  Manager   │  │   Engine   │  │ Optimizer  │        │  │
│  │  └────────────┘  └────────────┘  └────────────┘        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  API SERVER (Dream Framework)                           │  │
│  │  - REST endpoints                                        │  │
│  │  - WebSocket streaming                                   │  │
│  │  - Request validation                                    │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  BACKGROUND SERVICES (Lwt)                              │  │
│  │  - Trigger Monitor (continuous)                          │  │
│  │  - Float Rebalancer (hourly)                             │  │
│  │  - Analytics Engine (daily)                              │  │
│  └─────────────────────────────────────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                     INTEGRATION LAYER                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌──────────┐ │
│  │ TON Client  │ │   Oracle    │ │  Database   │ │  Message │ │
│  │             │ │ Aggregator  │ │   (Caqti)   │ │   Queue  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └──────────┘ │
└────────────────────────────────┬────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                        DATA LAYER                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │   PostgreSQL     │  │   TimescaleDB    │  │    Redis     │ │
│  │  (Policies)      │  │  (Price History) │  │   (Cache)    │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────┐
│                     BLOCKCHAIN LAYER                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  TON Smart Contracts (FunC)                              │  │
│  │  - PolicyManager.fc                                      │  │
│  │  - MultiTrancheVault.fc                                  │  │
│  │  - BitcoinFloatManager.fc                                │  │
│  │  - BeneficiaryPolicy.fc                                  │  │
│  │  - SmartEscrow.fc                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow: Policy Purchase

```
1. User (Telegram) → Bot (Node.js)
2. Bot → API Gateway → API Server (OCaml/Dream)
3. API Server → Pricing Engine → Calculate Premium
   ├─ Risk Engine → Assess Risk Factors
   ├─ Portfolio Optimizer → Check Capacity
   └─ Float Manager → Verify Collateral
4. Pricing Engine → Returns: {premium: $5,000, risk_score: 0.23}
5. API Server → Database → Create Policy Record
6. API Server → TON Client → Deploy Policy Contract
7. TON Client → PolicyManager.create_policy()
8. Blockchain → Emit PolicyCreated Event
9. API Server → Message Queue → Notification Task
10. Response → User: Policy #12345, NFT minted
```

### 1.3 Data Flow: Trigger & Payout

```
1. Oracle Aggregator (Lwt daemon)
   └─ Poll: RedStone, Pyth, Chainlink (every 60s)
   └─ Calculate: Consensus price (weighted average)
   └─ Store: price_history table (TimescaleDB)

2. Trigger Monitor (Lwt daemon)
   └─ Load: All active policies from DB
   └─ Check: current_price < trigger_price?
   └─ If yes:
      ├─ Log: trigger_monitoring table
      ├─ Track: 240 observations (4 hours)
      └─ If sustained → Execute payout

3. Claims Engine
   └─ Calculate: Payout amount (linear formula)
   └─ Validate: Vault has sufficient capital
   └─ Risk Engine → Update: Expected loss estimates

4. TON Client
   └─ Call: PolicyManager.execute_payout()
   └─ Wait: Transaction confirmation
   └─ Update: Database status → 'claimed'

5. Float Manager (triggered by payout)
   └─ Check: Is rebalancing needed?
   └─ If yes: Buy/Sell BTC to maintain 40/60

6. Notification Service
   └─ Telegram: "💰 Payout received: $42,857"
   └─ Email: Policy holder & beneficiary
```

---

## 2. Technology Stack

### 2.1 Backend (Core Application)

**Primary Language**: OCaml 5.0+

**Why OCaml**:
- ✅ Type safety prevents financial bugs (Jane Street uses for $50B+ daily trading)
- ✅ 25x faster than Python for numerical computing
- ✅ Formal verification capabilities (prove correctness mathematically)
- ✅ Excellent concurrency (Lwt for async, no callback hell)
- ✅ Pattern matching = clear business logic
- ✅ Immutable by default = safer concurrent code

**Core Libraries**:

```ocaml
(* dune-project *)
(lang dune 3.10)
(name tonsurance)

(package
 (name tonsurance)
 (depends
  ;; Core
  (ocaml (>= 5.0))
  base
  core
  core_unix

  ;; Web Framework
  dream                    ; Modern web framework

  ;; Database
  caqti                    ; Type-safe SQL
  caqti-lwt
  caqti-driver-postgresql

  ;; Async/Concurrency
  lwt                      ; Promises/async
  lwt_ppx                  ; Syntax sugar for async
  lwt_ssl                  ; SSL support

  ;; JSON
  yojson                   ; JSON parsing
  ppx_yojson_conv          ; JSON derivers

  ;; HTTP
  cohttp                   ; HTTP client
  cohttp-lwt-unix

  ;; WebSocket
  websocket
  websocket-lwt-unix

  ;; Cryptography
  cryptokit                ; Crypto primitives
  digestif                 ; Hashing (SHA, Blake2b)

  ;; Math/Stats
  owl                      ; Scientific computing
  lacaml                   ; Linear algebra (LAPACK bindings)
  gsl                      ; GNU Scientific Library

  ;; Financial Math
  ;; (Will create custom modules)

  ;; Testing
  alcotest                 ; Unit testing
  alcotest-lwt
  qcheck                   ; Property-based testing
  qcheck-alcotest

  ;; Logging
  logs
  logs-lwt
  fmt                      ; Formatting

  ;; Configuration
  ppx_deriving             ; Code generation
  ppx_fields_conv          ; Field accessors
  ppx_compare              ; Comparison derivers
  ppx_sexp_conv            ; S-expression conversion

  ;; CLI
  cmdliner                 ; Command-line parsing

  ;; Time
  ptime                    ; POSIX time

  ;; Data Structures
  containers               ; Extended stdlib

  ;; Monitoring
  prometheus               ; Metrics export
))
```

### 2.2 Smart Contracts

**Language**: FunC (TON)

**Tooling**:
```bash
# TON Development Kit
npm install -g @ton-community/blueprint
npm install -g @ton-community/func-js
npm install -g ton

# Testing
npm install @ton-community/sandbox
npm install @ton-community/test-utils

# Deployment
npm install tonweb
npm install @orbs-network/ton-access
```

**Why TON**:
- ✅ Telegram integration (900M users)
- ✅ Low fees (<$0.01/tx vs $5+ Ethereum)
- ✅ Fast finality (<5 seconds vs 15 minutes)
- ✅ Infinite sharding (true scalability)
- ✅ Mature ecosystem (2+ years production)

### 2.3 Frontend

**Telegram Bot**: Node.js + TypeScript
```json
{
  "dependencies": {
    "telegraf": "^4.15.0",
    "ton": "^13.9.0",
    "@tonconnect/sdk": "^3.0.0",
    "axios": "^1.6.0",
    "winston": "^3.11.0"
  }
}
```

**Web Dashboard**: Next.js 14 + React + TypeScript
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "@tanstack/react-query": "^5.0.0",
    "recharts": "^2.10.0",
    "tailwindcss": "^3.3.0"
  }
}
```

### 2.4 Infrastructure

**Container Orchestration**: Kubernetes (EKS/GKE)
**Database**: PostgreSQL 15 + TimescaleDB 2.13
**Cache**: Redis 7
**Message Queue**: RabbitMQ 3.12
**Monitoring**: Datadog + Prometheus
**Logging**: ELK Stack
**CI/CD**: GitHub Actions
**IaC**: Terraform

---

## 3. Phase 1: Foundation (Months 1-3)

**Goal**: Build core smart contracts and actuarial backend

### Month 1: Smart Contracts + Database

#### Week 1-2: Core Policy Contract

**File**: `contracts/PolicyManager.fc`

**Key Functions**:
```func
;; Create policy with beneficiary support
() create_policy(
    slice buyer_address,
    slice beneficiary_address,
    int coverage_amount,
    int trigger_price,
    int floor_price,
    int duration_seconds,
    int premium_amount,
    int asset_type
) impure

;; Check if should trigger
int check_trigger(int policy_id, int current_price) method_id

;; Calculate payout using linear formula
int calculate_payout(int policy_id, int current_price) method_id

;; Execute payout (sends to beneficiary)
() execute_payout(int policy_id, int current_price) impure

;; Get policy details
(int, slice, slice, int, int, int, int, int, int, int, int, int)
get_policy(int policy_id) method_id
```

**Testing**:
```typescript
// tests/PolicyManager.spec.ts
describe('PolicyManager', () => {
  it('should create policy with 3 parties', async () => {
    // Buyer pays premium
    // Beneficiary receives NFT
    // Vault receives premium
  });

  it('should trigger at correct price', async () => {
    // $0.97 trigger, $0.94 current → should trigger
  });

  it('should calculate payout correctly', async () => {
    // Linear interpolation formula
    // Coverage $100k, trigger $0.97, floor $0.90, current $0.94
    // Expected: $42,857
  });

  it('should send payout to beneficiary (not buyer)', async () => {
    // Critical: Beneficiary receives, not buyer
  });
});
```

**Deliverable**: ✅ PolicyManager deployed to testnet with >95% test coverage

#### Week 3: Multi-Tranche Vault

**File**: `contracts/MultiTrancheVault.fc`

**Tranche Structure**:
```
Tranche 1 (BTC Senior)     - 6% yield, 0.05 risk weight
Tranche 2 (Stable Senior)  - 10% yield, 0.10 risk weight
Tranche 3 (Opportunistic)  - 15% yield, 0.15 risk weight
Tranche 4 (RWA)            - 12% yield, 0.12 risk weight
Tranche 5 (DeFi Yield)     - 16% yield, 0.20 risk weight
Tranche 6 (Natural Hedge)  - 20% yield, 0.30 risk weight (most junior)
```

**Key Functions**:
```func
() deposit(slice depositor, int tranche_id, int amount) impure
() withdraw(slice depositor, int tranche_id, int lp_tokens) impure
() process_payout(int policy_id, slice beneficiary, int amount) impure
() distribute_yields() impure
(int, int, int, int) get_tranche(int tranche_id) method_id
int get_ltv() method_id
```

**Waterfall Logic**:
```func
;; Losses hit junior tranches first
() apply_loss_waterfall(int total_loss) impure {
    int remaining = total_loss;

    ;; Tranche 6 (most junior) absorbs first
    remaining -= apply_to_tranche(6, remaining);
    if (remaining == 0) return;

    ;; Tranche 5
    remaining -= apply_to_tranche(5, remaining);
    if (remaining == 0) return;

    ;; ... continue up to Tranche 1 (most senior)

    ;; If still remaining → vault insolvent (should never happen)
    throw_if(error_code, remaining > 0);
}
```

**Deliverable**: ✅ Vault deployed with all 6 tranches operational

#### Week 4: Database Schema

**File**: `migrations/001_initial_schema.sql`

**Core Tables**:

```sql
-- Policies (primary business object)
CREATE TABLE policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_address TEXT NOT NULL,
    beneficiary_address TEXT NOT NULL,
    asset TEXT NOT NULL CHECK (asset IN ('USDC', 'USDT', 'DAI')),
    coverage_usd_cents BIGINT NOT NULL CHECK (coverage_usd_cents > 0),
    trigger_price DECIMAL(10,6) NOT NULL,
    floor_price DECIMAL(10,6) NOT NULL,
    premium_usd_cents BIGINT NOT NULL,
    duration_seconds INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    contract_address TEXT UNIQUE,
    is_gift BOOLEAN DEFAULT FALSE,
    gift_message TEXT,

    CONSTRAINT expires_after_created CHECK (expires_at > created_at),
    CONSTRAINT trigger_above_floor CHECK (trigger_price > floor_price)
);

CREATE INDEX idx_policies_buyer ON policies(buyer_address);
CREATE INDEX idx_policies_beneficiary ON policies(beneficiary_address);
CREATE INDEX idx_policies_status_expires ON policies(status, expires_at)
    WHERE status = 'active';

-- Price history (TimescaleDB hypertable)
CREATE TABLE price_history (
    timestamp TIMESTAMPTZ NOT NULL,
    asset TEXT NOT NULL,
    price DECIMAL(18,8) NOT NULL,
    source TEXT NOT NULL,
    confidence DECIMAL(5,4),

    PRIMARY KEY (timestamp, asset, source)
);

SELECT create_hypertable('price_history', 'timestamp');

CREATE INDEX idx_price_asset_time ON price_history(asset, timestamp DESC);

-- Vault snapshots (daily)
CREATE TABLE vault_snapshots (
    timestamp TIMESTAMPTZ PRIMARY KEY,
    total_capital_usd_cents BIGINT NOT NULL,
    btc_float_sats BIGINT NOT NULL,
    btc_price_usd DECIMAL(18,8) NOT NULL,
    ltv_ratio DECIMAL(5,4) NOT NULL,
    var_95 DECIMAL(18,2),
    var_99 DECIMAL(18,2),
    expected_loss DECIMAL(18,2)
);

-- Trigger monitoring (ephemeral state)
CREATE TABLE trigger_monitoring (
    policy_id UUID PRIMARY KEY REFERENCES policies(id),
    first_below_timestamp TIMESTAMPTZ,
    samples_below_trigger INTEGER DEFAULT 0,
    last_check_timestamp TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'monitoring'
);
```

**Deliverable**: ✅ Database migrations tested and applied

---

### Month 2: Actuarial Backend (Core Focus)

This is the **heart** of the system. All pricing, risk management, and portfolio optimization.

#### Week 1-2: Core Types & Math Utilities

**File**: `lib/types/types.ml`

```ocaml
(* Core type definitions *)

open Core

(* Currency types - use int64 to prevent overflow *)
type usd_cents = int64 [@@deriving sexp, compare, yojson]
type btc_sats = int64 [@@deriving sexp, compare, yojson]

(* Assets *)
type asset =
  | USDC
  | USDT
  | DAI
  | FRAX
  | BUSD
  | BTC
  | ETH
[@@deriving sexp, compare, yojson, enumerate]

(* Price data with metadata *)
type price = {
  value: float;
  timestamp: float; (* Unix timestamp *)
  source: string;
  confidence: float; (* 0.0 - 1.0 *)
} [@@deriving sexp, yojson]

type price_series = price list [@@deriving sexp, yojson]

(* Policy structure *)
type policy = {
  id: string;
  buyer_address: string;
  beneficiary_address: string;
  asset: asset;
  coverage_amount: usd_cents;
  trigger_price: float;
  floor_price: float;
  premium: usd_cents;
  duration: int; (* seconds *)
  created_at: float;
  expires_at: float;
  is_gift: bool;
  gift_message: string option;
} [@@deriving sexp, yojson, fields]

(* Collateral position *)
type collateral_position = {
  asset: asset;
  amount: int64;
  value_usd: usd_cents;
  tranche: int; (* 1-6 *)
  ltv: float;
} [@@deriving sexp, yojson]

(* Vault state *)
type vault_state = {
  total_capital_usd: usd_cents;
  btc_float_sats: btc_sats;
  btc_float_value_usd: usd_cents;
  usd_reserves: usd_cents;
  collateral_positions: collateral_position list;
  active_policies: policy list;
  total_coverage_sold: usd_cents;
} [@@deriving sexp, yojson, fields]

(* Risk metrics *)
type risk_metrics = {
  var_95: float;
  var_99: float;
  expected_loss: float;
  sharpe_ratio: float;
  max_drawdown: float;
  stress_test_results: (string * float) list;
} [@@deriving sexp, yojson]

(* Stablecoin risk factors *)
type stablecoin_risk_factors = {
  reserve_quality: float;      (* 0-1, higher = worse *)
  banking_exposure: float;      (* 0-1, higher = more risk *)
  redemption_velocity: float;   (* Normalized rate *)
  market_depth: float;          (* Liquidity score *)
  regulatory_clarity: float;    (* 0-1, higher = better *)
  historical_volatility: float; (* Std dev *)
} [@@deriving sexp, yojson]

(* Rebalancing actions *)
type rebalance_action =
  | BuyBTC of float  (* USD amount *)
  | SellBTC of float (* BTC amount *)
  | Hold
[@@deriving sexp, yojson]
```

**File**: `lib/math/math.ml`

```ocaml
(* Mathematical utilities and financial calculations *)

open Core
open Types

(* Currency conversions *)
let usd_to_cents (dollars: float) : usd_cents =
  Int64.of_float (dollars *. 100.0)

let cents_to_usd (cents: usd_cents) : float =
  Int64.to_float cents /. 100.0

let btc_to_sats (btc: float) : btc_sats =
  Int64.of_float (btc *. 100_000_000.0)

let sats_to_btc (sats: btc_sats) : float =
  Int64.to_float sats /. 100_000_000.0

(* Safe division *)
let safe_div (num: float) (denom: float) : float option =
  if Float.abs denom < Float.epsilon
  then None
  else Some (num /. denom)

let safe_div_exn (num: float) (denom: float) : float =
  match safe_div num denom with
  | Some result -> result
  | None -> failwith "Division by zero"

(* Statistical functions *)
let mean (values: float list) : float =
  match values with
  | [] -> 0.0
  | _ ->
      let sum = List.fold values ~init:0.0 ~f:(+.) in
      sum /. Float.of_int (List.length values)

let variance (values: float list) : float =
  let m = mean values in
  let squared_diffs =
    List.map values ~f:(fun x -> (x -. m) ** 2.0)
  in
  mean squared_diffs

let std_dev (values: float list) : float =
  Float.sqrt (variance values)

let percentile (values: float list) (p: float) : float =
  let sorted = List.sort values ~compare:Float.compare in
  let index =
    Int.of_float (p *. Float.of_int (List.length sorted))
    |> min (List.length sorted - 1)
    |> max 0
  in
  List.nth_exn sorted index

(* Correlation coefficient *)
let correlation (xs: float list) (ys: float list) : float option =
  if List.length xs <> List.length ys then None
  else
    let mean_x = mean xs in
    let mean_y = mean ys in

    let numerator =
      List.fold2_exn xs ys ~init:0.0
        ~f:(fun acc x y -> acc +. ((x -. mean_x) *. (y -. mean_y)))
    in

    let denom_x =
      Float.sqrt (List.fold xs ~init:0.0
        ~f:(fun acc x -> acc +. ((x -. mean_x) ** 2.0)))
    in
    let denom_y =
      Float.sqrt (List.fold ys ~init:0.0
        ~f:(fun acc y -> acc +. ((y -. mean_y) ** 2.0)))
    in

    safe_div numerator (denom_x *. denom_y)

(* Covariance matrix *)
let covariance_matrix (data: float list list) : float list list =
  let n = List.length data in
  let means = List.map data ~f:mean in

  List.mapi data ~f:(fun i series_i ->
    let mean_i = List.nth_exn means i in

    List.mapi data ~f:(fun j series_j ->
      let mean_j = List.nth_exn means j in

      let cov =
        List.fold2_exn series_i series_j ~init:0.0
          ~f:(fun acc x_i x_j ->
            acc +. ((x_i -. mean_i) *. (x_j -. mean_j))
          )
      in
      cov /. Float.of_int (List.length series_i)
    )
  )

(* Monte Carlo simulation helpers *)
let box_muller_transform () : float * float =
  let u1 = Random.float 1.0 in
  let u2 = Random.float 1.0 in

  let mag = Float.sqrt (-2.0 *. Float.log u1) in
  let z0 = mag *. Float.cos (2.0 *. Float.pi *. u2) in
  let z1 = mag *. Float.sin (2.0 *. Float.pi *. u2) in

  (z0, z1)

let normal_random ~mean ~std_dev : float =
  let (z, _) = box_muller_transform () in
  mean +. (std_dev *. z)

(* Financial functions *)
let compound ~principal ~rate ~periods : float =
  principal *. ((1.0 +. rate) ** Float.of_int periods)

let present_value ~future_value ~rate ~periods : float =
  future_value /. ((1.0 +. rate) ** Float.of_int periods)

let annuity_pv ~payment ~rate ~periods : float =
  if Float.abs rate < Float.epsilon then
    payment *. Float.of_int periods
  else
    payment *. (1.0 -. (1.0 +. rate) ** Float.neg (Float.of_int periods)) /. rate

(* Black-Scholes (for future volatility products) *)
let black_scholes ~spot ~strike ~time_to_expiry ~rate ~volatility ~call_option : float =
  let d1 =
    (Float.log (spot /. strike) +. (rate +. 0.5 *. volatility ** 2.0) *. time_to_expiry)
    /. (volatility *. Float.sqrt time_to_expiry)
  in
  let d2 = d1 -. volatility *. Float.sqrt time_to_expiry in

  (* Normal CDF approximation *)
  let norm_cdf x =
    0.5 *. (1.0 +. Float.erf (x /. Float.sqrt 2.0))
  in

  if call_option then
    spot *. norm_cdf d1 -. strike *. Float.exp (Float.neg rate *. time_to_expiry) *. norm_cdf d2
  else
    strike *. Float.exp (Float.neg rate *. time_to_expiry) *. norm_cdf (Float.neg d2) -. spot *. norm_cdf (Float.neg d1)

(* Exponential moving average *)
let ema ~values ~alpha : float list =
  match values with
  | [] -> []
  | first :: rest ->
      let _, result =
        List.fold rest ~init:(first, [first]) ~f:(fun (prev_ema, acc) value ->
          let new_ema = alpha *. value +. (1.0 -. alpha) *. prev_ema in
          (new_ema, new_ema :: acc)
        )
      in
      List.rev result
```

**Deliverable**: ✅ Core types and math utilities with >95% test coverage

This is getting quite long. Should I continue with:

**Next sections**:
- Complete Pricing Engine implementation
- Risk Models (VaR, stress testing, Monte Carlo)
- Bitcoin Float Manager (rebalancing algorithms)
- Claims Engine
- Portfolio Optimizer
- Integration layer
- Phase 2-4 timeline
- Testing strategy
- Team structure

Would you like me to continue building this out, or should I deliver this first part and then continue?