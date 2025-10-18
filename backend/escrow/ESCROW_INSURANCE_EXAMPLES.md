# Escrow Insurance Integration - Examples & Premium Calculations

## Overview

The Escrow Insurance system automatically creates insurance policies when escrows are created with `protection_enabled: true`. This provides protection against timeout failures, contract exploits, and dispute resolutions.

## Premium Calculation Formula

```
Base Premium = Escrow Amount × 0.008 APR × (Days / 365)

Final Premium = Base Premium
                × Duration Discount
                × Volume Discount
                × Coverage Multiplier

Minimum Premium = $1.00
```

### Discount Factors

| Factor | Condition | Multiplier |
|--------|-----------|------------|
| **Duration Discount** | ≤ 7 days | 0.80 (20% off) |
| | ≤ 30 days | 0.90 (10% off) |
| | > 30 days | 1.00 (no discount) |
| **Volume Discount** | 5+ active escrows | 0.90 (10% off) |
| | < 5 active | 1.00 (no discount) |
| **Coverage Multiplier** | PayerOnly | 0.80 |
| | PayeeOnly | 0.80 |
| | BothParties | 1.50 |

## Example Calculations

### Example 1: Small Freelance Project
**Scenario:** $1,000 escrow, 7 days, protecting payee only

```
Base Premium = $1,000 × 0.008 × (7/365)
             = $1,000 × 0.008 × 0.0192
             = $0.15

Duration Discount = 0.80 (7 days)
Volume Discount = 1.00 (< 5 active)
Coverage Multiplier = 0.80 (PayeeOnly)

Final Premium = $0.15 × 0.80 × 1.00 × 0.80
              = $0.096
              → $1.00 (minimum floor)

RESULT: $1.00 premium
```

### Example 2: Medium Trade Deal
**Scenario:** $10,000 escrow, 30 days, protecting payer only

```
Base Premium = $10,000 × 0.008 × (30/365)
             = $10,000 × 0.008 × 0.0822
             = $6.58

Duration Discount = 0.90 (30 days)
Volume Discount = 1.00 (< 5 active)
Coverage Multiplier = 0.80 (PayerOnly)

Final Premium = $6.58 × 0.90 × 1.00 × 0.80
              = $4.74

RESULT: $4.74 premium (0.047% of escrow amount)
```

### Example 3: Large Real Estate Escrow
**Scenario:** $100,000 escrow, 60 days, protecting both parties

```
Base Premium = $100,000 × 0.008 × (60/365)
             = $100,000 × 0.008 × 0.1644
             = $131.51

Duration Discount = 1.00 (> 30 days, no discount)
Volume Discount = 1.00 (< 5 active)
Coverage Multiplier = 1.50 (BothParties)

Final Premium = $131.51 × 1.00 × 1.00 × 1.50
              = $197.27

RESULT: $197.27 premium (0.197% of escrow amount)
```

### Example 4: Power User with Volume Discount
**Scenario:** $5,000 escrow, 14 days, protecting payee, 5+ active escrows

```
Base Premium = $5,000 × 0.008 × (14/365)
             = $5,000 × 0.008 × 0.0384
             = $1.53

Duration Discount = 0.90 (≤ 30 days)
Volume Discount = 0.90 (5+ active)
Coverage Multiplier = 0.80 (PayeeOnly)

Final Premium = $1.53 × 0.90 × 0.90 × 0.80
              = $0.99
              → $1.00 (minimum floor)

RESULT: $1.00 premium
Total savings: 35% off (duration + volume + coverage)
```

### Example 5: Maximum Discounts
**Scenario:** $20,000 escrow, 7 days, protecting payer, 10+ active escrows

```
Base Premium = $20,000 × 0.008 × (7/365)
             = $20,000 × 0.008 × 0.0192
             = $3.07

Duration Discount = 0.80 (7 days, 20% off)
Volume Discount = 0.90 (10+ active, 10% off)
Coverage Multiplier = 0.80 (PayerOnly)

Final Premium = $3.07 × 0.80 × 0.90 × 0.80
              = $1.77

RESULT: $1.77 premium (0.009% of escrow amount)
Total savings: 42% off base premium
```

## Coverage Types & Claim Scenarios

### PayerOnly Protection

**When claims trigger:**
- Escrow times out with `ReleaseToPayee` action → Payer loses funds
- Smart contract exploit → Payer's funds at risk
- Unfair cancellation by payee

**Example:**
```
Payer: Alice
Payee: Bob
Amount: $5,000
Timeout: 30 days
Action: ReleaseToPayee
Protection: PayerOnly

IF escrow times out without conditions met:
  → Funds go to Bob (per timeout action)
  → Alice gets $5,000 claim payout from insurance
  → Alice is made whole
```

### PayeeOnly Protection

**When claims trigger:**
- Escrow times out with `ReturnToPayer` action → Payee loses funds
- Unfair cancellation by payer
- Payer dispute wins incorrectly

**Example:**
```
Payer: Charlie
Payee: Dana
Amount: $10,000
Timeout: 60 days
Action: ReturnToPayer
Protection: PayeeOnly

IF escrow times out (work complete but not approved):
  → Funds return to Charlie (per timeout action)
  → Dana gets $10,000 claim payout from insurance
  → Dana is made whole for completed work
```

### BothParties Protection

**When claims trigger:**
- Any timeout scenario
- Smart contract exploit
- Dispute resolution (winner receives claim)

**Example:**
```
Payer: Eve
Payee: Frank
Amount: $50,000
Timeout: 90 days
Action: Split (60/40)
Protection: BothParties

IF escrow times out:
  → Split: Eve gets $30k, Frank gets $20k
  → Insurance claim filed
  → Winner of dispute gets full $50k from insurance
  → Both parties protected
```

## Real-World Use Cases

### Use Case 1: Freelance Web Development

```yaml
Escrow Details:
  Client: "UQClient_ABC..."
  Freelancer: "UQFreelancer_XYZ..."
  Amount: $3,000
  Duration: 21 days
  Protection: PayeeOnly (protect freelancer)

Premium Calculation:
  Base: $3,000 × 0.008 × (21/365) = $1.38
  Duration discount: 0.90 (≤30 days)
  Volume discount: 1.00 (new client)
  Coverage: 0.80 (PayeeOnly)

  Final: $1.38 × 0.90 × 1.00 × 0.80 = $0.99 → $1.00

Result:
  → Freelancer pays $1.00 premium
  → If client doesn't approve by day 21, escrow times out
  → Freelancer automatically receives $3,000 claim payout
  → Work is protected
```

### Use Case 2: International Trade ($50k Shipment)

```yaml
Escrow Details:
  Buyer: "UQBuyer_Trade123..."
  Seller: "UQSeller_Trade456..."
  Amount: $50,000
  Duration: 45 days
  Protection: BothParties (high-value transaction)

Premium Calculation:
  Base: $50,000 × 0.008 × (45/365) = $49.32
  Duration discount: 1.00 (>30 days)
  Volume discount: 0.90 (repeat trader, 5+ active)
  Coverage: 1.50 (BothParties)

  Final: $49.32 × 1.00 × 0.90 × 1.50 = $66.58

Result:
  → Parties split $66.58 premium
  → Both protected against timeout/dispute
  → Oracle verifies delivery
  → If delivery fails, affected party gets $50k claim
```

### Use Case 3: Real Estate Down Payment

```yaml
Escrow Details:
  Buyer: "UQHomeBuyer..."
  Seller: "UQHomeSeller..."
  Amount: $100,000
  Duration: 60 days
  Protection: PayerOnly (protect buyer's down payment)

Premium Calculation:
  Base: $100,000 × 0.008 × (60/365) = $131.51
  Duration discount: 1.00 (>30 days)
  Volume discount: 1.00 (one-time purchase)
  Coverage: 0.80 (PayerOnly)

  Final: $131.51 × 1.00 × 1.00 × 0.80 = $105.21

Result:
  → Buyer pays $105.21 premium (0.11% of down payment)
  → If title issues arise, buyer gets $100k back via insurance
  → Down payment protected during due diligence period
```

## API Integration Examples

### Create Protected Escrow (OCaml)

```ocaml
open Lwt.Syntax

let create_freelance_escrow
    ~(client: string)
    ~(freelancer: string)
    ~(amount_usd: float)
  : escrow_contract Lwt.t =

  let amount = Math.usd_to_cents amount_usd in

  let%lwt escrow = Escrow_engine.EscrowOps.create_escrow
    ~payer:client
    ~payee:freelancer
    ~amount
    ~asset:USDC
    ~release_conditions:[
      ManualApproval {
        approver = client;
        approved = false;
        approval_deadline = Some (Unix.time () +. 21.0 *. 86400.0);
        signature = None;
      }
    ]
    ~timeout_action:ReleaseToPayee
    ~timeout_seconds:(21 * 86400)
    ~additional_parties:[]
    ~protection_enabled:true
    ~protection_covers:PayeeOnly
    ~active_escrow_count:0
    ~create_policy_fn:(Some PolicyFactory.create_policy)
    ()
  in

  Lwt.return escrow
```

### Get Premium Quote (OCaml)

```ocaml
let get_quote
    ~(amount_usd: float)
    ~(duration_days: int)
    ~(coverage: protection_coverage)
  : premium_breakdown =

  Insurance_integration.EscrowInsurance.get_premium_quote
    ~escrow_amount:(Math.usd_to_cents amount_usd)
    ~duration_days
    ~protection_coverage:coverage
    ~active_escrow_count:0

(* Example usage *)
let quote = get_quote
  ~amount_usd:10_000.0
  ~duration_days:30
  ~coverage:PayerOnly

(* Result:
   {
     base_premium = 658_00L;           (* $6.58 *)
     duration_discount = 0.90;          (* 10% off *)
     volume_discount = 1.00;            (* no discount *)
     coverage_multiplier = 0.80;        (* PayerOnly *)
     final_premium = 474_00L;           (* $4.74 *)
   }
*)
```

## Claim Lifecycle

### 1. Automatic Claim Triggering

```ocaml
(* Timeout handler automatically triggers claims *)
let%lwt escrow_after_timeout =
  Escrow_engine.EscrowOps.handle_timeout
    escrow
    ~execute_payout_fn:(Some payout_function)
    ()

(* If conditions met for claim:
   1. Checks protection_enabled = true
   2. Checks protection_policy_id exists
   3. Determines if protected party is affected
   4. Triggers claim via EscrowInsurance.trigger_claim
   5. Executes payout to protected party
*)
```

### 2. Manual Claim Triggering (Exploit/Dispute)

```ocaml
let trigger_exploit_claim
    ~(escrow: escrow_contract)
    ~(policy_id: int64)
  : claim_result Lwt.t =

  let reason = Insurance_integration.SmartContractExploit {
    contract_address = "UQEscrowContract...";
    amount_lost = escrow.amount;
    exploit_type = "reentrancy_attack";
    verified_at = Unix.time ();
  } in

  Insurance_integration.EscrowInsurance.trigger_claim
    ~escrow
    ~policy_id
    ~reason
    ~execute_payout_fn:payout_function
```

## Cost Comparison

### vs. Traditional Escrow Services

| Service | $10k Escrow | $100k Escrow | Features |
|---------|-------------|--------------|----------|
| **Traditional Escrow** | $200-500 (2-5%) | $1,000-3,000 (1-3%) | Manual process, 30-60 days |
| **Crypto Escrow** | $50-100 (0.5-1%) | $500-1,000 (0.5-1%) | Automated, no insurance |
| **Tonsurance Escrow** | $4.74 (0.047%) | $105.21 (0.11%) | Automated + Insurance |

**Savings Example:**
- $100k escrow for 60 days
- Traditional: $1,500 fee (1.5%)
- Tonsurance: $105.21 premium (0.11%)
- **Savings: $1,394.79 (93% cheaper)**

## Statistics & Analytics

### Sample Performance Metrics

```sql
-- Query escrow insurance stats
SELECT * FROM v_escrow_insurance_stats;

/* Expected Results:
total_protected_escrows     | 1,247
total_premiums_collected    | $15,821.50
total_claims_filed          | 23
total_claims_paid           | $178,500.00
avg_premium_per_escrow      | $12.68
payer_only_count            | 520
payee_only_count            | 612
both_parties_count          | 115
loss_ratio                  | 11.28 (claims/premiums)
*/
```

### Loss Ratio Analysis

The system maintains a healthy loss ratio through:
1. **Risk-based pricing**: Higher risk = higher premium
2. **Incentive alignment**: Both parties want escrow to succeed
3. **Oracle verification**: Reduces fraudulent claims
4. **Minimum premiums**: Covers operational costs

Target loss ratio: **40%**
Current observed: **11.28%** (well below target)

## Summary

✅ **Automatic Protection**: Policies created seamlessly on escrow creation
✅ **Affordable Premiums**: 0.05% - 0.20% of escrow amount
✅ **Flexible Coverage**: PayerOnly, PayeeOnly, or BothParties
✅ **Smart Discounts**: Duration, volume, and coverage-based
✅ **Instant Claims**: Automatic payout on timeout/failure
✅ **Full Integration**: Works with existing PolicyFactory system

The Escrow Insurance system makes protected transactions accessible and affordable for everyone from $1,000 freelance projects to $100k+ real estate deals.
