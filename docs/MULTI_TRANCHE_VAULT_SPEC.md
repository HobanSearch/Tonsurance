# Multi-Tranche Vault Technical Specification

**Version**: 1.0
**Date**: 2025-10-15
**Status**: Implementation Phase

---

## Overview

The Multi-Tranche Vault implements a 6-tier waterfall capital structure for the Tonsurance LP investment product. Each tranche has distinct risk-return profiles, bonding curves, and loss absorption priorities.

---

## Tranche Structure

### 1. SURE-BTC (Ultra-Senior - Tier 1)
- **APY**: 4% (flat)
- **Bonding Curve**: FLAT
- **Risk Level**: Safest
- **Allocation**: 25%
- **Loss Range**: 75-100% (last to absorb losses)
- **Lock-up**: Required
- **Target**: Institutions, Treasuries

### 2. SURE-SNR (Senior - Tier 2)
- **APY**: 6.5% → 10%
- **Bonding Curve**: LOGARITHMIC
- **Risk Level**: Very Low
- **Allocation**: 20%
- **Loss Range**: 55-75%
- **Lock-up**: Required
- **Target**: Conservative DeFi Users

### 3. SURE-MEZZ (Mezzanine - Tier 3)
- **APY**: 9% → 15%
- **Bonding Curve**: LINEAR
- **Risk Level**: Low
- **Allocation**: 18%
- **Loss Range**: 37-55%
- **Lock-up**: Required
- **Target**: Balanced DeFi Investors

### 4. SURE-JNR (Junior - Tier 4)
- **APY**: 12.5% → 16%
- **Bonding Curve**: SIGMOIDAL (S-curve)
- **Risk Level**: Medium
- **Allocation**: 15%
- **Loss Range**: 22-37%
- **Lock-up**: No lock-up
- **Target**: Crypto Natives, Active Traders

### 5. SURE-JNR+ (Junior Plus - Tier 5)
- **APY**: 16% → 22%
- **Bonding Curve**: QUADRATIC
- **Risk Level**: High
- **Allocation**: 12%
- **Loss Range**: 10-22%
- **Lock-up**: No lock-up
- **Target**: High-Risk Tolerance Investors

### 6. SURE-EQT (Equity - Tier 6)
- **APY**: 15% → 25% (capped)
- **Bonding Curve**: EXPONENTIAL
- **Risk Level**: Highest
- **Allocation**: 10%
- **Loss Range**: 0-10% (first to absorb losses)
- **Lock-up**: No lock-up
- **Target**: Degen Yield Farmers, Seed Capital

---

## Waterfall Mechanics

### Revenue Waterfall (Premium Distribution)

Premiums are distributed from **safest to riskiest** (senior priority):

```
1. SURE-BTC receives 4% APY first
2. SURE-SNR receives 6.5%-10% APY second
3. SURE-MEZZ receives 9%-15% APY third
4. SURE-JNR receives 12.5%-16% APY fourth
5. SURE-JNR+ receives 16%-22% APY fifth
6. SURE-EQT receives 15%-25% APY last
```

**Invariant**: `Σ(premiums_distributed) ≤ total_premiums_collected`

### Loss Waterfall (Payout Absorption)

Losses are absorbed in **reverse order** (equity takes first loss):

```
1. SURE-EQT absorbs 0-10% of claims (first-loss capital)
2. SURE-JNR+ absorbs 10-22% of claims
3. SURE-JNR absorbs 22-37% of claims
4. SURE-MEZZ absorbs 37-55% of claims
5. SURE-SNR absorbs 55-75% of claims
6. SURE-BTC absorbs 75-100% of claims (maximum protection)
```

**Invariant**: `Σ(loss_ranges) = 100%` (0-10% + 10-22% + ... + 75-100% = 100%)

---

## Bonding Curves

Bonding curves determine APY based on vault utilization. All curves are **overflow-safe** and **mathematically verified**.

### Mathematical Definitions

Let:
- `U = utilization ratio` (0.0 to 1.0)
- `MIN_APY` = minimum APY for tranche
- `MAX_APY` = maximum APY for tranche
- `APY(U)` = current APY at utilization U

### 1. FLAT Curve (SURE-BTC)
```
APY(U) = 4% for all U
```

### 2. LOGARITHMIC Curve (SURE-SNR)
```
APY(U) = MIN_APY + (MAX_APY - MIN_APY) * log(1 + U) / log(2)
APY(0) = 6.5%
APY(1) = 10%
```

Fast growth initially, then plateaus.

### 3. LINEAR Curve (SURE-MEZZ)
```
APY(U) = MIN_APY + (MAX_APY - MIN_APY) * U
APY(0) = 9%
APY(1) = 15%
```

Proportional increase with utilization.

### 4. SIGMOIDAL Curve (SURE-JNR)
```
APY(U) = MIN_APY + (MAX_APY - MIN_APY) / (1 + e^(-10(U - 0.5)))
APY(0) = 12.5%
APY(1) = 16%
```

S-curve: gradual start, steep middle, gradual end.

### 5. QUADRATIC Curve (SURE-JNR+)
```
APY(U) = MIN_APY + (MAX_APY - MIN_APY) * U^2
APY(0) = 16%
APY(1) = 22%
```

Accelerating growth (slow start, fast finish).

### 6. EXPONENTIAL Curve (SURE-EQT)
```
APY(U) = MIN_APY + (MAX_APY - MIN_APY) * (e^(2U) - 1) / (e^2 - 1)
APY(0) = 15%
APY(1) = 25% (capped)
```

Rapid acceleration at high utilization.

---

## Overcollateralization Ratios

Different bonding curves attract capital at different rates, affecting overcollateralization:

| Tranche | Curve | Overcollateralization Ratio |
|---------|-------|---------------------------|
| SURE-EQT | Exponential | 150-200% |
| SURE-JNR+ | Quadratic | 150-200% |
| SURE-JNR | Sigmoidal | 130-150% |
| SURE-MEZZ | Linear | 120-140% |
| SURE-SNR | Logarithmic | 120-130% |
| SURE-BTC | Flat | 110-120% |

**Why This Matters**: Higher overcollateralization means the protocol can absorb larger losses before affecting senior tranches.

---

## Smart Contract Storage Layout

```
Storage Cell:
├─ owner_address (slice)
├─ total_capital (coins) - sum of all tranche deposits
├─ total_coverage_sold (coins) - outstanding coverage obligations
├─ accumulated_premiums (coins) - premiums collected but not distributed
├─ accumulated_losses (coins) - losses absorbed by tranches
├─ tranche_data (cell ref)
│  ├─ SURE-BTC (tier 1) - capital, apy_min, apy_max, curve_type, lock_until
│  ├─ SURE-SNR (tier 2)
│  ├─ SURE-MEZZ (tier 3)
│  ├─ SURE-JNR (tier 4)
│  ├─ SURE-JNR+ (tier 5)
│  └─ SURE-EQT (tier 6)
├─ depositor_balances (dict) - address -> (tranche_id, token_balance)
├─ paused (int) - emergency pause flag
└─ admin_address (slice) - multi-sig address for admin functions
```

---

## Contract Operations

### 1. Deposit (User → Tranche)
```func
deposit(tranche_id: int, amount: coins) -> tranche_tokens
```
- Validates tranche_id (1-6)
- Validates minimum deposit (0.1 TON)
- Calculates current APY via bonding curve
- Mints tranche tokens to depositor
- Updates tranche capital
- Emits DepositEvent

### 2. Withdraw (Tranche → User)
```func
withdraw(tranche_id: int, token_amount: coins) -> capital_returned
```
- Validates lock-up period (if applicable)
- Burns tranche tokens
- Calculates capital + accrued yield
- Transfers capital to user
- Updates tranche capital
- Emits WithdrawEvent

### 3. Distribute Premiums (Protocol → Tranches)
```func
distribute_premiums(premium_amount: coins)
```
- Follows revenue waterfall (tier 1 → tier 6)
- Calculates APY for each tranche
- Distributes premiums proportionally
- Updates accumulated_yield per tranche
- Emits PremiumDistributionEvent

### 4. Absorb Loss (Claim → Tranches)
```func
absorb_loss(loss_amount: coins)
```
- Follows loss waterfall (tier 6 → tier 1)
- Deducts from equity first (0-10%)
- Cascades to junior+ (10-22%), etc.
- Updates tranche capital
- Emits LossAbsorptionEvent
- **Circuit Breaker**: If loss > 10% of total capital in 24h, pause vault

---

## Security Features

### 1. Reentrancy Guard
All external calls (deposits, withdrawals, claims) use reentrancy protection.

### 2. Emergency Pause
Multi-sig (3-of-5) can pause vault, preventing new deposits/withdrawals.

### 3. Circuit Breaker
Automatic pause if:
- Single loss > 20% of tranche capital
- Daily losses > 10% of total capital
- Overcollateralization ratio < 100%

### 4. Access Control
- Only ClaimsProcessor can call `absorb_loss()`
- Only PolicyFactory can call `distribute_premiums()`
- Only admin multi-sig can pause/unpause

---

## Mathematical Invariants

These must hold at all times or contract reverts:

1. **Capital Conservation**: `total_capital = Σ(tranche_capitals)`
2. **Loss Absorption**: `Σ(loss_ranges) = 100%`
3. **Premium Distribution**: `Σ(premiums_distributed) ≤ total_premiums_collected`
4. **Overcollateralization**: `total_capital ≥ total_coverage_sold`
5. **APY Bounds**: `MIN_APY ≤ APY(U) ≤ MAX_APY` for all U
6. **No Negative Balances**: `tranche_capital[i] ≥ 0` for all i

---

## Gas Optimization

### Sharding Strategy
- Deploy 1 MultiTrancheVault per shard
- Route deposits via policy_id % 256 → shard_id
- **Target**: <0.02 TON per deposit/withdrawal

### Batch Operations
- `distribute_premiums_batch()` for multiple tranches in one tx
- `withdraw_batch()` for users with deposits in multiple tranches

---

## Testing Requirements

### Unit Tests (95%+ coverage)
- Bonding curve calculations (1000+ test cases)
- Waterfall distribution (all edge cases)
- Lock-up enforcement
- Circuit breaker triggers

### Integration Tests
- Full deposit → premiums → loss → withdrawal flow
- Multi-tranche scenarios (6 deposits, 3 claims, 2 withdrawals)

### Fuzz Tests
- Random deposits/withdrawals (10k iterations)
- Random loss amounts (ensure no insolvency)

### Formal Verification
- Prove invariants hold under all execution paths
- Prove no integer overflow in bonding curve math

---

## Deployment Checklist

- [ ] Compile contract with FunC compiler
- [ ] Run full test suite (255+ tests)
- [ ] Security audit by CertiK or Trail of Bits
- [ ] Deploy to testnet, run for 2 weeks
- [ ] Bug bounty program on Immunefi
- [ ] Multi-sig ceremony (3-of-5 admin keys)
- [ ] Deploy to mainnet with $10k coverage limit
- [ ] Gradual rollout: $10k → $100k → $1M limits

---

## Appendix A: Bonding Curve Implementation

See `contracts/libs/bonding_curves.fc` for overflow-safe implementations using fixed-point arithmetic.

## Appendix B: Waterfall Test Cases

See `tests/unit/waterfall_scenarios.spec.ts` for comprehensive test suite.

---

**End of Specification**
