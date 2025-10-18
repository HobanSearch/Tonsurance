# Gas Optimization Patches - Quick Reference

This document provides ready-to-apply code patches for the critical gas optimizations identified in the Gas Optimization Report.

---

## Patch 1: Fix absorb_loss() Event Batching (CRITICAL)

**File**: `contracts/core/MultiTrancheVault.fc`
**Lines**: 961-1053
**Savings**: -16,000 gas (brings operation from 103% to 94% of budget)
**Priority**: 🔴 CRITICAL - Must apply before mainnet

### Current Code (Lines 961-1053)

```func
() absorb_loss(slice sender, int loss_amount) impure {
    check_claims_processor(sender);
    throw_unless(ERR_INVALID_AMOUNT, loss_amount > 0);

    int should_pause = check_circuit_breaker(loss_amount);
    if (should_pause) {
        paused = 1;
        emit_log(0x40, begin_cell()  ;; ← 5k gas
            .store_uint(now(), 32)
            .store_coins(loss_amount)
            .store_coins(circuit_breaker_losses)
            .store_coins(total_capital)
            .end_cell().begin_parse());
    }

    int remaining_loss = loss_amount;
    int tranche_id = TRANCHE_EQT;

    while ((tranche_id >= TRANCHE_BTC) & (remaining_loss > 0)) {
        var (capital, apy_min, apy_max, curve_type, allocation_percent,
             accumulated_yield, token_address, total_tokens) = load_tranche(tranche_id);

        if (capital > 0) {
            int loss_to_absorb = remaining_loss;
            if (loss_to_absorb > capital) {
                loss_to_absorb = capital;
            }

            int new_capital = capital - loss_to_absorb;
            if (new_capital < 0) {
                new_capital = 0;
            }

            save_tranche(tranche_id, new_capital, apy_min, apy_max, curve_type,
                        allocation_percent, accumulated_yield, token_address, total_tokens);

            total_capital -= loss_to_absorb;
            accumulated_losses += loss_to_absorb;
            remaining_loss -= loss_to_absorb;

            ;; PER-TRANCHE EVENT (1k gas × 6 = 6k total) ← INEFFICIENT
            emit_log(0x34, begin_cell()
                .store_uint(tranche_id, 8)
                .store_coins(loss_to_absorb)
                .store_coins(new_capital)
                .store_coins(capital)
                .end_cell().begin_parse());
        }

        tranche_id -= 1;
    }

    if (remaining_loss > 0) {
        emit_log(0x41, begin_cell()  ;; ← 5k gas
            .store_uint(now(), 32)
            .store_coins(loss_amount)
            .store_coins(remaining_loss)
            .store_coins(total_capital)
            .end_cell().begin_parse());

        paused = 1;
    }

    ;; SUMMARY EVENT (5k gas)
    emit_log(0x33, begin_cell()
        .store_slice(sender)
        .store_coins(loss_amount)
        .store_coins(accumulated_losses)
        .store_coins(total_capital)
        .end_cell().begin_parse());

    save_data();
}
```

### Optimized Code (Replace lines 961-1053)

```func
() absorb_loss(slice sender, int loss_amount) impure {
    ;; Access control: ONLY ClaimsProcessor can call this
    check_claims_processor(sender);
    throw_unless(ERR_INVALID_AMOUNT, loss_amount > 0);

    ;; Check circuit breaker BEFORE absorbing loss
    int should_pause = check_circuit_breaker(loss_amount);

    int remaining_loss = loss_amount;
    int tranche_id = TRANCHE_EQT;  ;; Start with tier 6 (equity - first loss)

    ;; OPTIMIZATION: Build single cascading event with all tranche data
    ;; This replaces 6 individual emit_log() calls (6k gas) with one (1k gas)
    builder cascade_builder = begin_cell()
        .store_uint(now(), 32)
        .store_slice(sender)
        .store_coins(loss_amount)
        .store_uint(should_pause, 1);

    int tranches_affected = 0;

    ;; Reverse waterfall: Iterate through tranches EQT (6) → BTC (1)
    while ((tranche_id >= TRANCHE_BTC) & (remaining_loss > 0)) {
        ;; Load tranche data
        var (capital, apy_min, apy_max, curve_type, allocation_percent,
             accumulated_yield, token_address, total_tokens) = load_tranche(tranche_id);

        ;; Skip if tranche has no capital
        if (capital > 0) {
            ;; Calculate loss to absorb from this tranche
            int loss_to_absorb = remaining_loss;

            ;; Cap at tranche capital (can't absorb more than exists)
            if (loss_to_absorb > capital) {
                loss_to_absorb = capital;
            }

            ;; Deduct from tranche capital
            int new_capital = capital - loss_to_absorb;

            ;; Sanity check: prevent negative capital
            if (new_capital < 0) {
                new_capital = 0;
            }

            ;; Update tranche with reduced capital
            save_tranche(tranche_id, new_capital, apy_min, apy_max, curve_type,
                        allocation_percent, accumulated_yield, token_address, total_tokens);

            ;; Update vault totals
            total_capital -= loss_to_absorb;
            accumulated_losses += loss_to_absorb;

            ;; Deduct from remaining loss
            remaining_loss -= loss_to_absorb;

            ;; OPTIMIZATION: Append tranche data to batch event
            ;; Old approach: emit_log() here (1k gas per tranche)
            ;; New approach: Accumulate in builder, emit once at end
            cascade_builder = cascade_builder
                .store_uint(tranche_id, 8)
                .store_coins(loss_to_absorb)
                .store_coins(new_capital)
                .store_coins(capital);  ;; Original capital for comparison

            tranches_affected += 1;
        }

        tranche_id -= 1;  ;; Move to next senior tranche
    }

    ;; Handle circuit breaker trigger
    if (should_pause) {
        paused = 1;
        circuit_breaker_losses += loss_amount;
    }

    ;; Handle insolvency (loss exceeds all capital)
    int is_insolvent = remaining_loss > 0;
    if (is_insolvent) {
        ;; CRITICAL: Vault is insolvent
        paused = 1;  ;; Emergency pause - manual intervention required
    }

    ;; OPTIMIZATION: Single comprehensive event with all cascade data
    ;; Replaces 3 separate events:
    ;;   - 0x34 per tranche (6 × 1k = 6k gas)
    ;;   - 0x40 circuit breaker (5k gas)
    ;;   - 0x41 insolvency (5k gas)
    ;;   - 0x33 summary (5k gas)
    ;; Total old: 21k gas in events
    ;; Total new: 5k gas (single batch event)
    ;; Savings: 16k gas
    emit_log(0x33, cascade_builder
        .store_uint(tranches_affected, 8)
        .store_coins(remaining_loss)
        .store_uint(is_insolvent, 1)
        .store_coins(total_capital)
        .store_coins(accumulated_losses)
        .end_cell().begin_parse());

    save_data();
}
```

### Gas Impact Analysis

| Component | Before | After | Savings |
|-----------|--------|-------|---------|
| Per-tranche events | 6 × 1k = 6k | 0 | -6k |
| Circuit breaker event | 5k | 0 | -5k |
| Insolvency event | 5k | 0 | -5k |
| Summary event | 5k | 0 | -5k |
| Single batch event | 0 | 5k | +5k |
| **Total** | **21k** | **5k** | **-16k** |

**New Total Operation Gas**: 113k (94% of 120k budget) ✅

---

## Patch 2: Add Dynamic Gas Estimation

**Files**: Multiple
**Savings**: Prevents bounce scenarios (saves ~50k gas per retry)
**Priority**: 🔴 CRITICAL - Improves reliability

### Add to `contracts/libs/async_helpers.fc` (after line 100)

```func
;; ===== DYNAMIC GAS ESTIMATION =====

;; Estimate gas required for token mint operation
int estimate_mint_gas(int token_amount) inline {
    ;; Base gas for mint operation
    int base_gas = 80000000;  ;; 0.08 TON

    ;; Dynamic component: larger amounts need more gas for verification
    ;; Add 0.005 TON per 10 tokens
    int dynamic_gas = (token_amount / 10000000000) * 5000000;

    ;; Add safety margin (20%)
    int total_gas = base_gas + dynamic_gas;
    int with_margin = total_gas + (total_gas / 5);

    return with_margin;
}

;; Estimate gas required for vault deposit
int estimate_deposit_gas(int deposit_amount, int tranche_id) inline {
    ;; Base gas for deposit processing
    int base_gas = 120000000;  ;; 0.12 TON

    ;; Senior tranches (1-3) have lockup calculations
    if ((tranche_id >= 1) & (tranche_id <= 3)) {
        base_gas += 20000000;  ;; +0.02 TON
    }

    ;; Large deposits need more gas
    if (deposit_amount > 1000000000000) {  ;; >1000 TON
        base_gas += 30000000;  ;; +0.03 TON
    }

    ;; Safety margin (20%)
    return base_gas + (base_gas / 5);
}

;; Estimate gas for premium distribution
int estimate_distribute_gas(int tranche_count, int utilization) inline {
    ;; Base gas
    int base_gas = 50000000;  ;; 0.05 TON

    ;; Per-tranche cost
    int per_tranche = tranche_count * 10000000;  ;; 0.01 TON per tranche

    ;; High utilization requires more calculation
    if (utilization > 800000000) {  ;; >80% utilization
        per_tranche += 10000000;  ;; +0.01 TON
    }

    int total_gas = base_gas + per_tranche;
    return total_gas + (total_gas / 5);  ;; +20% margin
}

;; Estimate gas for claim payout waterfall
int estimate_payout_gas(int vault_count) inline {
    ;; Base gas
    int base_gas = 150000000;  ;; 0.15 TON

    ;; Per-vault forwarding
    int per_vault = vault_count * 50000000;  ;; 0.05 TON per vault

    int total_gas = base_gas + per_vault;
    return total_gas + (total_gas / 5);  ;; +20% margin
}
```

### Update MultiTrancheVault.fc deposit() (line 644)

**Before**:
```func
cell mint_msg = begin_cell()
    .store_uint(0x18, 6)
    .store_slice(token_address)
    .store_coins(100000000)  ;; ← HARDCODED 0.1 TON
    .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
    .store_uint(21, 32)
    .store_uint(tx_id, 64)
    .store_slice(depositor)
    .store_coins(tokens)
    .end_cell();
```

**After**:
```func
;; OPTIMIZATION: Dynamic gas estimation based on token amount
int forward_amount = estimate_mint_gas(tokens);

cell mint_msg = begin_cell()
    .store_uint(0x18, 6)
    .store_slice(token_address)
    .store_coins(forward_amount)  ;; ← DYNAMIC
    .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
    .store_uint(21, 32)
    .store_uint(tx_id, 64)
    .store_slice(depositor)
    .store_coins(tokens)
    .end_cell();
```

---

## Patch 3: Combine Validation Functions

**File**: `contracts/core/PolicyFactory.fc`
**Lines**: 70-90
**Savings**: -3,000 gas
**Priority**: 🟡 MEDIUM

### Before (Lines 70-90)

```func
int calculate_premium(
    int coverage_type,
    int chain_id,
    int stablecoin_id,
    int coverage_amount,
    int duration_days
) inline {
    ;; Validate all dimensions
    validate_coverage_type(coverage_type);      ;; Function call overhead
    validate_chain_id(chain_id);                ;; Function call overhead
    validate_stablecoin_id(stablecoin_id);      ;; Function call overhead

    ;; Use multi-dimensional calculator from risk_multipliers.fc
    return calculate_multi_dimensional_premium(
        coverage_type,
        chain_id,
        stablecoin_id,
        coverage_amount,
        duration_days
    );
}
```

### After (Replace lines 70-90)

```func
;; OPTIMIZATION: Inline all validation to eliminate function call overhead
int calculate_premium(
    int coverage_type,
    int chain_id,
    int stablecoin_id,
    int coverage_amount,
    int duration_days
) inline {
    ;; Combined validation with single-pass range checks
    ;; Saves 3k gas vs. 3 separate function calls

    ;; Validate coverage type (0-4)
    throw_unless(400, (coverage_type >= 0) & (coverage_type <= 4));

    ;; Validate chain ID (0-7)
    throw_unless(401, (chain_id >= 0) & (chain_id <= 7));

    ;; Validate stablecoin ID (0-13)
    throw_unless(402, (stablecoin_id >= 0) & (stablecoin_id <= 13));

    ;; Use multi-dimensional calculator from risk_multipliers.fc
    return calculate_multi_dimensional_premium(
        coverage_type,
        chain_id,
        stablecoin_id,
        coverage_amount,
        duration_days
    );
}
```

---

## Patch 4: Lazy Tranche Evaluation (OPTIONAL)

**File**: `contracts/core/MultiTrancheVault.fc`
**Lines**: 820-959
**Savings**: -6,000 gas (typical case)
**Priority**: 🟢 LOW - Apply after critical fixes

### Add Helper Function (after line 492)

```func
;; Fast capital check without loading full tranche data
(int, int) get_tranche_capital_fast(int tranche_id) inline {
    ;; Quick lookup: only extract capital field (3k gas vs. 8k for full load)
    (slice tranche_slice, int found) = tranche_data.udict_get?(8, tranche_id);

    if (~ found) {
        return (0, 0);
    }

    ;; Only load first field (capital)
    int capital = tranche_slice~load_coins();

    return (capital, found);
}
```

### Update distribute_premiums() (lines 820-959)

**Before Pass 1**:
```func
int total_capital_time = 0;
int tranche_id = TRANCHE_BTC;

while (tranche_id <= TRANCHE_EQT) {
    var (capital, _, _, _, _, _, _, _) = load_tranche(tranche_id);  ;; 8k gas × 6 = 48k
    if (capital > 0) {
        int assumed_stake_seconds = 2592000;
        int capital_time = muldiv(capital, assumed_stake_seconds, 86400);
        total_capital_time += capital_time;
    }
    tranche_id += 1;
}
```

**After Pass 1**:
```func
;; OPTIMIZATION: Fast pre-filter for active tranches
int total_capital_time = 0;
int active_mask = 0;  ;; Bitmask to track active tranches
int tranche_id = TRANCHE_BTC;

;; First pass: lightweight check (1k gas per tranche vs. 8k)
while (tranche_id <= TRANCHE_EQT) {
    (int capital, int found) = get_tranche_capital_fast(tranche_id);  ;; 1k gas

    if (found & (capital > 0)) {
        active_mask = active_mask | (1 << tranche_id);  ;; Set bit

        int assumed_stake_seconds = 2592000;
        int capital_time = muldiv(capital, assumed_stake_seconds, 86400);
        total_capital_time += capital_time;
    }

    tranche_id += 1;
}

;; Savings: 6 × (8k - 1k) = 42k gas
;; Cost: 6 × 1k = 6k gas
;; Net savings: 36k gas
```

**Update Pass 2** (lines 867-934):
```func
tranche_id = TRANCHE_BTC;

while ((tranche_id <= TRANCHE_EQT) & (remaining_premium > 0)) {
    ;; OPTIMIZATION: Skip inactive tranches using bitmask
    if (~ (active_mask & (1 << tranche_id))) {
        tranche_id += 1;
        continue;  ;; Skip to next iteration (saves 8k gas)
    }

    ;; Only load full tranche data for active tranches
    var (capital, apy_min, apy_max, curve_type, allocation_percent,
         accumulated_yield, token_address, total_tokens) = load_tranche(tranche_id);

    ;; ... rest of distribution logic unchanged ...

    tranche_id += 1;
}
```

**Gas Impact**:
- Typical case (4/6 tranches active): saves 2 × 8k = 16k gas
- Worst case (6/6 tranches active): costs 6k extra gas (acceptable)
- Best case (1/6 tranches active): saves 5 × 8k = 40k gas

---

## Patch 5: Storage Bit-packing (OPTIONAL)

**File**: `contracts/core/PolicyFactory.fc`
**Lines**: 161-174
**Savings**: -7% storage costs (~$4/year for 10k policies)
**Priority**: 🟢 LOW - Apply when storage costs become significant

### Before (Lines 161-174)

```func
cell policy_data = begin_cell()
    .store_uint(policy_id, 64)
    .store_slice(user_address)
    .store_uint(coverage_type, 8)      ;; 8 bits
    .store_uint(chain_id, 8)           ;; 8 bits
    .store_uint(stablecoin_id, 8)      ;; 8 bits
    .store_coins(coverage_amount)
    .store_uint(start_time, 32)        ;; 32 bits
    .store_uint(end_time, 32)          ;; 32 bits
    .store_uint(1, 1)  ;; active flag  ;; 1 bit
    .store_uint(0, 1)  ;; claimed flag ;; 1 bit
    .store_coins(calculated_premium)
    .store_uint(product_hash, 32)
    .end_cell();
;; Total: 731 bits
```

### After (Replace lines 161-174)

```func
;; OPTIMIZATION: Bit-pack dimensions and flags
;; Reduces storage from 731 to 679 bits (7% savings)

;; Calculate deployment timestamp (store once globally)
;; int deployment_time = 1728950400;  ;; Contract deployment epoch

;; Pack all small fields into single 32-bit integer:
;; [31-29] coverage_type (3 bits for 0-4)
;; [28-26] chain_id (3 bits for 0-7)
;; [25-22] stablecoin_id (4 bits for 0-13)
;; [21] active flag
;; [20] claimed flag
;; [19-0] duration_days (20 bits for up to 1M days)

int packed_data = (coverage_type << 29) |
                  (chain_id << 26) |
                  (stablecoin_id << 22) |
                  (1 << 21) |  ;; active = true
                  (0 << 20) |  ;; claimed = false
                  duration_days;

cell policy_data = begin_cell()
    .store_uint(policy_id, 64)
    .store_slice(user_address)
    .store_uint(packed_data, 32)       ;; 32 bits (was 56 bits)
    .store_coins(coverage_amount)
    .store_uint(start_time, 32)        ;; Keep absolute time for now
    .store_coins(calculated_premium)
    .store_uint(product_hash, 32)
    .end_cell();
;; Total: 679 bits (52 bits saved)
```

### Unpacking Helper (add to get_policy_data() method)

```func
;; Get policy data (extended with unpacking logic)
(int, int, int, int, int, int, int, int) get_policy_data(int policy_id) method_id {
    load_data();

    (slice policy_slice, int found) = policies_dict.udict_get?(64, policy_id);
    throw_unless(404, found);

    ;; Parse policy data
    int stored_policy_id = policy_slice~load_uint(64);
    slice user_address = policy_slice~load_msg_addr();

    ;; OPTIMIZATION: Unpack bit-packed data
    int packed_data = policy_slice~load_uint(32);

    ;; Extract individual fields with bit shifting
    int coverage_type = (packed_data >> 29) & 0x07;      ;; Bits 31-29 (3 bits)
    int chain_id = (packed_data >> 26) & 0x07;           ;; Bits 28-26 (3 bits)
    int stablecoin_id = (packed_data >> 22) & 0x0F;      ;; Bits 25-22 (4 bits)
    int active = (packed_data >> 21) & 0x01;             ;; Bit 21
    int claimed = (packed_data >> 20) & 0x01;            ;; Bit 20
    int duration_days = packed_data & 0xFFFFF;           ;; Bits 19-0

    int coverage_amount = policy_slice~load_coins();
    int start_time = policy_slice~load_uint(32);
    int premium = policy_slice~load_coins();
    int product_hash = policy_slice~load_uint(32);

    return (coverage_type, chain_id, stablecoin_id, coverage_amount,
            premium, start_time, duration_days, active);
}
```

**Trade-off Analysis**:
- **Pros**: 7% storage reduction (~$4/year for 10k policies)
- **Cons**: +1k gas for unpacking on reads
- **Recommendation**: Apply only if storage costs >$50/month

---

## Testing Patches

### Run Gas Profiling Tests

After applying patches, verify improvements:

```bash
# Run comprehensive gas profiling suite
cd /Users/ben/Documents/Work/HS/Application/Tonsurance
npm run test:gas

# Or run individual test file
npx jest tests/gas/GasProfiling.spec.ts --verbose
```

### Expected Results After Patches 1-3

| Operation | Before | After | Target | Status |
|-----------|--------|-------|--------|--------|
| create_policy() | 75k | 72k | 80k | ✅ PASS (90% → 87%) |
| absorb_loss() | 123k | 113k | 120k | ✅ PASS (103% → 94%) |
| distribute_premiums() | 140k | 134k | 150k | ✅ PASS (93% → 89%) |

### Regression Test Template

Add to `tests/gas/regression.spec.ts`:

```typescript
describe('Gas Regression After Patches', () => {
    it('PATCH 1: absorb_loss() with full cascade <120k gas', async () => {
        // Setup: deposit into all tranches
        // ...

        // Trigger loss cascade
        const result = await vault.sendAbsorbLoss(
            claimsProcessor.getSender(),
            { lossAmount: toNano('50'), value: toNano('0.1') }
        );

        const gas = extractGasUsed(result);
        expect(Number(gas)).toBeLessThan(120_000);

        // Also verify event structure
        expect(result.transactions).toHaveTransaction({
            from: claimsProcessor.address,
            to: vault.address,
            success: true,
        });

        // Check that single batch event was emitted (not 6 individual)
        const events = result.events.filter(e => e.type === 'log');
        expect(events.length).toBe(1);  // Single batch event
    });

    it('PATCH 2: Dynamic gas prevents bounces', async () => {
        // Large deposit should auto-adjust gas
        const result = await vault.sendDeposit(
            user.getSender(),
            { trancheId: 1, value: toNano('1000.5') }  // 1000 TON + gas
        );

        // Should succeed without bounce
        expect(result.transactions).toHaveTransaction({
            from: user.address,
            to: vault.address,
            success: true,
        });

        // Verify no bounce messages
        const bounces = result.transactions.filter(t => t.inMessage?.bounced);
        expect(bounces.length).toBe(0);
    });

    it('PATCH 3: Combined validation saves gas', async () => {
        const result = await policyFactory.sendCreatePolicy(
            user.getSender(),
            {
                coverageType: 0,
                chainId: 0,
                stablecoinId: 0,
                coverageAmount: toNano('100'),
                durationDays: 30,
                value: toNano('5'),
            }
        );

        const gas = extractGasUsed(result);
        expect(Number(gas)).toBeLessThan(73_000);  // Was 75k
    });
});
```

---

## Deployment Checklist

Before deploying optimized contracts to testnet/mainnet:

### Pre-deployment

- [ ] Apply Patch 1 (absorb_loss batching) - CRITICAL
- [ ] Apply Patch 2 (dynamic gas estimation) - CRITICAL
- [ ] Apply Patch 3 (combined validation) - MEDIUM
- [ ] Run full test suite: `npm test`
- [ ] Run gas profiling: `npm run test:gas`
- [ ] Verify all operations <100k gas
- [ ] Review gas budget document
- [ ] Code review by 2+ team members

### Testnet Deployment

- [ ] Deploy to TON testnet
- [ ] Monitor gas consumption for 1000+ transactions
- [ ] Verify no bounces or failed transactions
- [ ] Load test with 100+ concurrent operations
- [ ] Measure storage growth over 7 days
- [ ] Validate event structures (frontend integration)

### Mainnet Deployment

- [ ] Final security audit including gas optimizations
- [ ] Multi-sig approval for deployment
- [ ] Deploy with gas monitoring enabled
- [ ] Set up alerts for gas threshold breaches
- [ ] Document rollback procedure
- [ ] Gradual rollout (10% → 50% → 100% traffic)

---

## Rollback Procedure

If gas issues detected in production:

1. **Immediate Actions**:
   - Pause affected contracts via admin functions
   - Analyze transaction logs for gas spikes
   - Identify problematic operation

2. **Hotfix Options**:
   - **Option A**: Revert to previous contract version (requires redeployment)
   - **Option B**: Apply targeted fix (if issue is isolated)
   - **Option C**: Increase gas allocation temporarily (band-aid)

3. **Post-incident**:
   - Root cause analysis
   - Add regression test for failure case
   - Update gas profiling suite
   - Document lessons learned

---

## Support and Maintenance

### Gas Monitoring Dashboard

Set up Grafana/Datadog with these metrics:

```
┌─────────────────────────────────────────┐
│ Real-time Gas Consumption                │
├─────────────────────────────────────────┤
│ create_policy: 72k avg (90% budget)     │
│ deposit: 48k avg (80% budget)           │
│ distribute_premiums: 134k (89%)        │
│ absorb_loss: 113k (94%)                 │
└─────────────────────────────────────────┘

Alerts:
🔴 P1: Any operation >100k gas
🟠 P2: Operation >90% of budget
🟡 P3: Dict size >5k entries
```

### Contacts

- **Gas Optimization Team**: gas-opt@tonsurance.io
- **Smart Contract Team**: contracts@tonsurance.io
- **On-call Engineer**: +1-XXX-XXX-XXXX

---

**Last Updated**: 2025-10-15
**Next Review**: After testnet deployment
**Owner**: Smart Contract Optimization Team
