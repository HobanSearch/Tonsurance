# Unified Liquidity Pool Architecture

**Critical Constraint**: Single shared liquidity pool across ALL products
**Why**: Risk management consistency, capital efficiency, no fragmentation

---

## The Problem with Multiple Vaults

```
❌ WRONG APPROACH:
Vault A (Senior):     $50M capital → Insures USDC only
Vault B (Junior):     $30M capital → Insures USDT only
Vault C (Aggressive): $20M capital → Insures all assets

Issues:
1. Vault A has excess capital for USDC demand
2. Vault B is under-capitalized for USDT surge
3. Capital trapped, can't rebalance efficiently
4. Different risk models = inconsistent pricing
5. Fragmented liquidity = worse user experience
```

## Unified Pool Approach

```
✅ CORRECT APPROACH:
Single Pool: $100M total capital
├── Backing ALL insurance products
├── Dynamic allocation across assets
├── Single risk model governs all policies
├── Unified pricing engine
└── Tranche system is INTERNAL accounting only

Benefits:
1. Capital efficiency (100% utilization)
2. Consistent risk management
3. Better liquidity for all products
4. Easier to scale
5. Single source of truth
```

---

## Architecture Design

### Core Principle: Unified Pool, Multiple Products

```
                    ┌─────────────────────────┐
                    │   UNIFIED LIQUIDITY     │
                    │         POOL            │
                    │      $100M Total        │
                    └───────────┬─────────────┘
                                │
                    ┌───────────┴──────────────┐
                    │   Risk Management Layer   │
                    │  (Single Risk Model)      │
                    └───────────┬───────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        │                       │                        │
   ┌────▼─────┐          ┌─────▼──────┐          ┌─────▼──────┐
   │ Product  │          │  Product   │          │  Product   │
   │ Type A   │          │  Type B    │          │  Type C    │
   │ (Depeg)  │          │  (Flash)   │          │  (Escrow)  │
   └──────────┘          └────────────┘          └────────────┘

All products share the same $100M pool
All products use same risk calculations
Different product types = different fee structures only
```

---

## Capital Allocation Model

### NOT Multiple Vaults - Single Pool with Virtual Tranches

```ocaml
type unified_pool = {
  (* Physical capital *)
  total_capital_usd: usd_cents;
  total_coverage_sold: usd_cents;

  (* Asset breakdown *)
  btc_float_sats: int64;
  btc_cost_basis: usd_cents;
  usd_reserves: usd_cents;

  (* Virtual tranches for risk segregation *)
  (* These are ACCOUNTING constructs, not separate pools *)
  virtual_tranches: virtual_tranche list;

  (* Single risk model *)
  risk_params: unified_risk_params;
}

type virtual_tranche = {
  tranche_id: int;
  seniority: int; (* 1 = most senior, 6 = most junior *)
  target_yield_bps: int;

  (* These are just accounting - capital is fungible *)
  allocated_capital: usd_cents;
  lp_token_holders: (address * int64) list;

  (* Loss allocation (for accounting) *)
  accumulated_losses: usd_cents;
  accumulated_yields: usd_cents;
}

(* KEY: All tranches draw from same physical pool *)
(* Losses are ALLOCATED to tranches but paid from unified pool *)
```

### How It Works

1. **LPs Deposit to Tranches** (for yield preferences)
   ```
   LP deposits $1M to "Senior Tranche"
   → Gets Senior LP tokens
   → Capital goes into unified pool
   → Entitled to 8% yield + senior loss protection
   ```

2. **Pool Writes All Policies** (unified underwriting)
   ```
   User buys $100k USDC depeg insurance
   → Pool underwrites (checks total risk)
   → Premium goes to unified pool
   → Coverage backed by full $100M
   ```

3. **Loss Allocation** (waterfall accounting)
   ```
   $10M payout triggered
   → Paid from unified pool (immediate)
   → THEN allocated to tranches:
     - Junior tranche absorbs first
     - Mezzanine absorbs next
     - Senior last
   → LP NAV updated accordingly
   ```

---

## Risk Management: Single Source of Truth

### Unified Risk Parameters

```ocaml
type unified_risk_params = {
  (* Global limits *)
  max_ltv: float;                    (* 0.75 = 75% max utilization *)
  min_reserve_ratio: float;          (* 0.15 = 15% minimum reserves *)

  (* Per-asset concentration limits *)
  max_single_asset_exposure: float;  (* 0.30 = 30% max in one asset *)

  (* Stress testing *)
  stress_scenarios: stress_scenario list;
  required_stress_buffer: float;     (* 1.5 = 150% of worst-case loss *)

  (* Correlation limits *)
  max_correlated_exposure: float;    (* If USDC/USDT correlate, limit both *)

  (* Rebalancing triggers *)
  rebalance_threshold: float;        (* 0.10 = rebalance if >10% drift *)
}
```

### Single Risk Check for ALL Products

```ocaml
let can_underwrite_policy
    (pool: unified_pool)
    (policy: policy_request)
  : bool =

  (* Check 1: Total utilization *)
  let new_ltv =
    (pool.total_coverage_sold + policy.coverage) / pool.total_capital
  in

  if new_ltv > pool.risk_params.max_ltv then false
  else
    (* Check 2: Asset concentration *)
    let asset_exposure = get_asset_exposure pool policy.asset in
    let new_exposure =
      (asset_exposure + policy.coverage) / pool.total_capital
    in

    if new_exposure > pool.risk_params.max_single_asset_exposure then false
    else
      (* Check 3: Stress test *)
      let worst_case_loss = run_stress_tests pool ~new_policy:policy in
      let available_buffer = pool.total_capital - pool.total_coverage_sold in

      if worst_case_loss > (available_buffer * pool.risk_params.required_stress_buffer) then false
      else
        true (* All checks passed *)
```

**KEY**: Same risk checks apply to ALL products
- Depeg insurance? Check limits.
- Flash insurance? Check limits.
- Escrow insurance? Check limits.

No exceptions. No product-specific overrides.

---

## Product Types: Different Interfaces, Same Pool

### Product Type Configuration

```ocaml
type product_type = {
  product_id: string;
  display_name: string;

  (* Pricing parameters *)
  base_rate: float;
  risk_multiplier: float;

  (* Product-specific features *)
  min_duration: duration;
  max_duration: duration;
  min_coverage: usd_cents;
  max_coverage: usd_cents;

  (* Fee structure *)
  protocol_fee_bps: int;

  (* But all share same pool risk limits *)
}

let product_types = [
  {
    product_id = "depeg_standard";
    display_name = "Stablecoin Depeg Insurance";
    base_rate = 0.04;
    risk_multiplier = 1.0;
    min_duration = Days 7;
    max_duration = Days 365;
    min_coverage = usd_to_cents 1_000.0;
    max_coverage = usd_to_cents 10_000_000.0;
    protocol_fee_bps = 1000; (* 10% *)
  };

  {
    product_id = "flash_insurance";
    display_name = "Flash Insurance (1-24 hours)";
    base_rate = 0.04;
    risk_multiplier = 3.0; (* 3x base for short duration *)
    min_duration = Hours 1;
    max_duration = Hours 24;
    min_coverage = usd_to_cents 10_000.0;
    max_coverage = usd_to_cents 100_000_000.0;
    protocol_fee_bps = 500; (* 5% - high volume *)
  };

  {
    product_id = "escrow_insurance";
    display_name = "Smart Escrow with Insurance";
    base_rate = 0.04;
    risk_multiplier = 1.2;
    min_duration = Days 1;
    max_duration = Days 90;
    min_coverage = usd_to_cents 5_000.0;
    max_coverage = usd_to_cents 5_000_000.0;
    protocol_fee_bps = 800; (* 8% *)
  };
]
```

### Product-Specific Pricing (Unified Risk Base)

```ocaml
let calculate_premium
    (pool: unified_pool)
    (product: product_type)
    (request: policy_request)
  : usd_cents =

  (* Start with base pricing from unified engine *)
  let base_premium = PricingEngine.calculate_premium
    ~asset:request.asset
    ~coverage_amount:request.coverage
    ~trigger_price:request.trigger
    ~floor_price:request.floor
    ~duration_days:(duration_to_days request.duration)
    ~vault_state:(pool_to_vault_state pool)
    ~market_stress:(get_current_market_stress ())
    ~risk_factors:(get_risk_factors request.asset)
    ~actual_loss_ratio:(get_loss_ratio pool)
  in

  (* Apply product-specific multiplier *)
  let adjusted_premium =
    Math.cents_to_usd base_premium *. product.risk_multiplier
    |> Math.usd_to_cents
  in

  adjusted_premium
```

**KEY**: All products use same base pricing engine
- Flash insurance pays 3x the base rate (compensates for urgency)
- Escrow pays 1.2x (includes escrow service)
- Standard depeg pays 1.0x

But base rate is ALWAYS calculated from unified risk model.

---

## Capital Allocation Strategy

### How Capital is Actually Allocated

```ocaml
type capital_allocation = {
  (* Physical holdings *)
  usd_cash: usd_cents;
  btc_float: int64; (* satoshis *)
  stablecoin_reserves: (asset * usd_cents) list;

  (* Virtual allocations (accounting) *)
  reserved_for_policies: usd_cents;
  available_for_underwriting: usd_cents;
  emergency_reserve: usd_cents;

  (* Target ratios *)
  target_liquid_ratio: float;  (* 0.40 = 40% liquid USD *)
  target_btc_ratio: float;     (* 0.60 = 60% BTC float *)
}

let rebalance_pool
    (pool: unified_pool)
    ~(btc_price: float)
  : rebalance_action list =

  (* Calculate required liquidity *)
  let total_coverage = pool.total_coverage_sold in
  let required_reserves =
    (* Worst-case stress test loss + buffer *)
    calculate_worst_case_loss pool *. 1.5
  in

  (* Calculate current allocation *)
  let current_usd = Math.cents_to_usd pool.usd_reserves in
  let current_btc_value =
    (Int64.to_float pool.btc_float_sats /. 100_000_000.0) *. btc_price
  in
  let total_value = current_usd +. current_btc_value in

  (* Determine if rebalance needed *)
  let usd_ratio = current_usd /. total_value in
  let required_usd_ratio = required_reserves /. total_value in

  if usd_ratio < required_usd_ratio then
    (* Need more liquidity - sell BTC *)
    [SellBTC (required_usd_ratio -. usd_ratio) *. total_value]
  else if usd_ratio > (required_usd_ratio +. 0.10) then
    (* Excess liquidity - buy BTC *)
    [BuyBTC (usd_ratio -. required_usd_ratio -. 0.05) *. total_value]
  else
    [] (* No rebalance needed *)
```

---

## LP Experience: Multiple Yield Options, One Pool

### How LPs Interact

```
LP Journey:
1. "I want 8% safe yield" → Deposit to Senior Tranche
2. "I want 20% aggressive yield" → Deposit to Junior Tranche
3. Pool uses BOTH deposits for underwriting
4. Yields distributed according to tranche rules
5. Losses allocated according to waterfall
```

### LP Token Mechanics

```ocaml
type lp_position = {
  lp_address: address;
  tranche_id: int;
  lp_tokens: int64;
  entry_nav: float;
  entry_timestamp: float;
}

(* NAV calculation per tranche *)
let calculate_tranche_nav
    (pool: unified_pool)
    (tranche_id: int)
  : float =

  let tranche = get_tranche pool tranche_id in

  (* Net value after losses *)
  let net_value =
    Math.cents_to_usd tranche.allocated_capital
    -. Math.cents_to_usd tranche.accumulated_losses
    +. Math.cents_to_usd tranche.accumulated_yields
  in

  (* NAV per token *)
  if tranche.lp_token_holders |> List.length = 0 then
    1.0 (* Initial NAV *)
  else
    let total_tokens =
      List.fold tranche.lp_token_holders ~init:0L ~f:(fun acc (_, tokens) ->
        Int64.(acc + tokens)
      )
    in
    net_value /. Int64.to_float total_tokens
```

---

## Implementation: Collateral Manager

### Single Source of Truth for Capital

```ocaml
module CollateralManager = struct

  type t = {
    pool: unified_pool;
    risk_params: unified_risk_params;
    price_cache: (asset * float * float) list; (* asset, price, timestamp *)
  }

  (* Check if new policy can be underwritten *)
  let can_underwrite (t: t) (policy: policy_request) : bool =
    (* Implementation from earlier *)

  (* Allocate coverage from pool *)
  let allocate_coverage
      (t: t)
      (policy: policy)
    : t =

    let new_pool = {
      t.pool with
      total_coverage_sold =
        Int64.(t.pool.total_coverage_sold + policy.coverage_amount)
    } in

    { t with pool = new_pool }

  (* Release coverage (policy expired/paid) *)
  let release_coverage
      (t: t)
      (policy: policy)
    : t =

    let new_pool = {
      t.pool with
      total_coverage_sold =
        Int64.(t.pool.total_coverage_sold - policy.coverage_amount)
    } in

    { t with pool = new_pool }

  (* Execute payout (update pool, allocate losses) *)
  let execute_payout
      (t: t)
      (payout_amount: usd_cents)
    : t =

    (* Deduct from pool *)
    let new_pool = {
      t.pool with
      total_capital_usd = Int64.(t.pool.total_capital_usd - payout_amount);
      usd_reserves = Int64.(t.pool.usd_reserves - payout_amount);
    } in

    (* Allocate losses to tranches (waterfall) *)
    let updated_tranches =
      allocate_losses_to_tranches new_pool.virtual_tranches payout_amount
    in

    let final_pool = { new_pool with virtual_tranches = updated_tranches } in

    { t with pool = final_pool }

end
```

---

## Key Decisions

### ✅ What We're Doing

1. **Single unified pool** for all capital
2. **Virtual tranches** for LP yield preferences (accounting only)
3. **Unified risk model** governs all products
4. **Product types** differ only in pricing multipliers and features
5. **Capital is fungible** - can back any product
6. **Loss allocation** happens AFTER payout (accounting step)

### ❌ What We're NOT Doing

1. **NOT creating separate vault contracts per product**
2. **NOT fragmenting liquidity**
3. **NOT allowing product-specific risk overrides**
4. **NOT creating isolated risk models**
5. **NOT creating multiple pools that can become imbalanced**

---

## Migration Path

### Phase 1: Launch with Unified Pool
- Single contract: `UnifiedPool.fc`
- 3 virtual tranches (Senior, Mezzanine, Junior)
- 2 product types (Standard Depeg, Flash)

### Phase 2: Add Product Types
- Keep same pool
- Add Escrow, Protocol Treasury, etc.
- All share risk limits

### Phase 3: Scale Tranches
- Add more virtual tranches if demand
- But still one physical pool

---

## Next: Implement Collateral Manager

This will be the core module that:
1. Manages unified pool state
2. Enforces risk limits
3. Allocates capital to policies
4. Tracks virtual tranche accounting
5. Executes loss waterfall

**Critical**: Every policy goes through CollateralManager.can_underwrite()
No exceptions. No product-specific bypass.
