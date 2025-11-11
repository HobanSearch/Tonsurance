# Tonsurance V3 Security Patterns

## Overview

V3 implements comprehensive security hardening across all contracts, addressing common vulnerabilities in TON smart contracts:

1. **Bounced Message Handling**: Parse error codes, refund users, emit events
2. **DoS Prevention**: Rate limiting, early validation, gas buffers
3. **Replay Protection**: Nonce-based sequence validation
4. **Access Control**: Multi-sig admin, role-based permissions
5. **Oracle Security**: 3/5 consensus, staleness checks, Sybil resistance
6. **Economic Security**: Vault waterfall, circuit breakers, coverage limits
7. **Reentrancy Guards**: State locks, check-effects-interactions pattern

---

## 1. Bounced Message Handling

### Problem

TON TVM uses **asynchronous message passing**. If a message fails (out of gas, assertion, etc.), it "bounces" back to sender with error code. Without proper handling:
- User loses funds (no refund)
- Silent failures (no error visibility)
- Debugging nightmare (no logs)

### Solution Pattern

**Every contract implements `on_bounce()` handler**:

```func
() on_bounce(slice in_msg) impure {
  ;; TVM prefixes bounced messages with 0xFFFFFFFF
  int bounce_prefix = in_msg~load_uint(32);
  throw_unless(400, bounce_prefix == 0xFFFFFFFF);

  ;; Parse original message
  int op = in_msg~load_uint(32);
  int error_code = in_msg~load_uint(32); ;; Exit code from failed contract

  if (op == op::create_policy) {
    slice user_addr = in_msg~load_msg_addr();
    int coverage_amount = in_msg~load_coins();
    int premium = in_msg~load_coins();

    ;; Refund user (premium - processing fee)
    int refund_amount = premium - 10000000; ;; Subtract 0.01 TON fee
    send_simple_message(user_addr, refund_amount);

    ;; Emit event for monitoring
    emit_log_event(
      "PolicyCreationFailed",
      begin_cell()
        .store_slice(user_addr)
        .store_uint(error_code, 32)
        .store_uint(op, 32)
        .end_cell()
    );

    ;; Update statistics
    failed_policy_count += 1;
    save_data();
  }
  elseif (op == op::claim_payout) {
    ;; Handle claim failure
    slice policy_holder = in_msg~load_msg_addr();
    int policy_id = in_msg~load_uint(64);

    ;; Mark claim as failed (allow retry)
    mark_claim_failed(policy_id, error_code);

    emit_log_event(
      "ClaimPayoutFailed",
      begin_cell()
        .store_slice(policy_holder)
        .store_uint(policy_id, 64)
        .store_uint(error_code, 32)
        .end_cell()
    );
  }
  ;; ... handle other ops
}
```

### Common Error Codes

| Code | Meaning | Recovery Action |
|------|---------|-----------------|
| **8** | Out of gas | Refund user, suggest higher gas |
| **34** | Invalid sender | Log unauthorized access attempt |
| **35** | Invalid signature | Refund user, check key |
| **400-499** | Custom assertion failures | Parse specific error, provide context |
| **9** | Cell overflow | Data too large, split into multiple messages |

### security_helpers.fc Library Function

```func
;; Parse bounced message and extract error details
(int op, int error_code, cell payload) parse_bounced_message(slice in_msg) impure {
  int bounce_prefix = in_msg~load_uint(32);
  throw_unless(400, bounce_prefix == 0xFFFFFFFF);

  int op = in_msg~load_uint(32);
  int error_code = in_msg~load_uint(32);
  cell payload = in_msg~load_ref(); ;; Original message data

  return (op, error_code, payload);
}

;; Emit structured log event
() emit_log_event(slice event_name, cell event_data) impure {
  send_raw_message(
    begin_cell()
      .store_uint(0x18, 6)  ;; Internal message, no bounce
      .store_slice("Ef8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADAU") ;; Log collector address
      .store_coins(0)
      .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
      .store_slice(event_name)
      .store_ref(event_data)
      .end_cell(),
    1  ;; Send with attached value
  );
}
```

### Testing Bounce Handlers

```typescript
// Jest + @ton/sandbox test
it('should refund user on policy creation failure', async () => {
  const user = await blockchain.treasury('user');

  // Deploy child contract with insufficient gas (will fail)
  const result = await masterFactory.sendCreatePolicy(user.getSender(), {
    value: toNano('0.001'), // Too low, will bounce
    productType: 1,
    assetId: 1,
    coverageAmount: 10000n
  });

  // Check bounce message received
  expect(result.transactions).toHaveTransaction({
    from: depegSubFactory.address,
    to: masterFactory.address,
    op: 0xFFFFFFFF, // Bounce prefix
    success: true
  });

  // Check refund sent to user
  expect(result.transactions).toHaveTransaction({
    from: masterFactory.address,
    to: user.address,
    success: true
  });

  // Check event emitted
  const events = result.events.filter(e => e.type === 'PolicyCreationFailed');
  expect(events).toHaveLength(1);
  expect(events[0].error_code).toBe(8); // Out of gas
});
```

---

## 2. DoS Prevention (GasWallet)

### Problem

**External messages** (user-initiated, no sender balance) create DoS vector:
- Attacker spams 10,000 external messages
- Each costs ~10k gas to process signature check
- Total: 100M gas (~0.1 TON) wasted by validator
- Legit users experience delays

### Solution: Multi-Layer Defense

**Layer 1: Early Signature Validation** (~1k gas)
```func
() recv_external(slice in_msg) impure {
  ;; IMMEDIATELY validate signature (before any storage reads)
  int sig_hash = in_msg~load_uint(256);
  slice signature = in_msg~load_bits(512);

  throw_unless(35, check_signature(sig_hash, signature, get_public_key()));
  accept_message(); ;; Accept only if signature valid

  ;; Continue processing...
}
```

**Layer 2: Rate Limiting** (5 tx/min per address)
```func
global cell rate_limits; ;; Dict<addr_hash:uint256, (last_ts:uint32, count:uint8)>

int rate_limit_check(slice user_addr) impure {
  int addr_hash = slice_hash(user_addr);
  (slice data, int found) = rate_limits.udict_get?(256, addr_hash);

  if (!found) {
    ;; First transaction
    rate_limits~udict_set(256, addr_hash,
      begin_cell()
        .store_uint(now(), 32)
        .store_uint(1, 8)
        .end_cell()
        .begin_parse()
    );
    return true;
  }

  int last_ts = data~load_uint(32);
  int count = data~load_uint(8);

  int time_elapsed = now() - last_ts;

  if (time_elapsed > 60) {
    ;; Window expired, reset
    rate_limits~udict_set(256, addr_hash,
      begin_cell()
        .store_uint(now(), 32)
        .store_uint(1, 8)
        .end_cell()
        .begin_parse()
    );
    return true;
  }

  if (count >= 5) {
    ;; Rate limit exceeded
    return false;
  }

  ;; Increment count
  rate_limits~udict_set(256, addr_hash,
    begin_cell()
      .store_uint(last_ts, 32)
      .store_uint(count + 1, 8)
      .end_cell()
      .begin_parse()
  );
  return true;
}

() recv_external(slice in_msg) impure {
  ;; ... signature check ...

  slice user_addr = in_msg~load_msg_addr();
  throw_unless(36, rate_limit_check(user_addr));

  ;; Continue processing...
}
```

**Layer 3: Nonce Replay Protection**
```func
global cell user_nonces; ;; Dict<addr_hash:uint256, last_nonce:uint64>

int validate_nonce(slice user_addr, int nonce) impure {
  int addr_hash = slice_hash(user_addr);
  (int last_nonce, int found) = user_nonces.udict_get?(256, addr_hash);

  if (!found) {
    ;; First transaction, expect nonce = 1
    throw_unless(400, nonce == 1);
    user_nonces~udict_set(256, addr_hash, 1);
    return true;
  }

  ;; Nonce must increment by 1 (no gaps, no replays)
  throw_unless(400, nonce == last_nonce + 1);
  user_nonces~udict_set(256, addr_hash, nonce);
  return true;
}

() recv_external(slice in_msg) impure {
  ;; ... signature + rate limit checks ...

  int nonce = in_msg~load_uint(64);
  throw_unless(37, validate_nonce(user_addr, nonce));

  ;; Continue processing...
}
```

**Layer 4: Gas Buffer Reservation**
```func
() recv_external(slice in_msg) impure {
  ;; ... all validations pass ...

  ;; Reserve 0.05 TON for bounce message (if downstream fails)
  raw_reserve(50000000, 0); ;; 0.05 TON

  ;; Forward to MasterFactory with 0.5 TON
  send_internal_message(
    master_factory_addr,
    500000000, ;; 0.5 TON
    op::create_policy,
    in_msg
  );
}
```

### Attack Scenarios and Defenses

| Attack | Defense | Cost to Attacker | Cost to Protocol |
|--------|---------|------------------|------------------|
| **Spam 1000 external msgs/sec** | Rate limit (5/min) → 99.2% rejected at ~1k gas | $0 (rejected early) | ~0.001 TON/sec |
| **Replay same tx 1000 times** | Nonce check → 100% rejected | $0 (rejected early) | ~0.001 TON |
| **Rotate 1000 addresses** | Still rate limited per address | $0 (need 1000 funded addresses) | ~0.001 TON/sec |
| **Send 0 TON internal messages** | `throw_if(msg_value < 0.05 TON)` | Wasted gas on sender side | 0 TON |

---

## 3. Replay Protection

### Problem

Without nonce validation, attacker can:
1. Capture valid signed message from user
2. Replay it 1000 times (user charged 1000× premium)
3. User unknowingly creates 1000 identical policies

### Solution: Sequential Nonces

**User Side** (TypeScript):
```typescript
class GasWalletClient {
  private nonce: number = 1;

  async sendTransaction(data: Cell): Promise<void> {
    const message = beginCell()
      .storeUint(this.nonce, 64)
      .storeRef(data)
      .endCell();

    const signature = sign(message.hash(), this.privateKey);

    await this.gasWallet.sendExternal({
      body: beginCell()
        .storeBuffer(signature)
        .storeSlice(message.beginParse())
        .endCell()
    });

    this.nonce++; // Increment for next tx
  }
}
```

**Contract Side** (FunC):
```func
global cell user_nonces; ;; Dict<addr_hash:uint256, last_nonce:uint64>

int validate_nonce(slice user_addr, int nonce) impure {
  int addr_hash = slice_hash(user_addr);
  (int last_nonce, int found) = user_nonces.udict_get?(256, addr_hash);

  if (!found) {
    throw_unless(400, nonce == 1);
    user_nonces~udict_set(256, addr_hash, 1);
    return true;
  }

  throw_unless(400, nonce == last_nonce + 1);
  user_nonces~udict_set(256, addr_hash, nonce);
  return true;
}
```

**Edge Case: Out-of-Order Transactions**
- User sends tx with nonce 5
- Network delays, user sends nonce 6
- Nonce 6 arrives first → rejected (expect 5)
- Nonce 5 arrives next → accepted
- Nonce 6 resubmit → accepted

**Solution**: User must track nonce locally, retry rejected transactions.

---

## 4. Access Control

### Multi-Sig Admin

**Problem**: Single admin private key is single point of failure (theft, loss).

**Solution**: 3-of-5 multi-sig for admin actions.

```func
global cell admin_signers; ;; Dict<index:uint8, pubkey:uint256> (5 entries)
global int required_signatures; ;; 3

() execute_admin_action(cell action, cell signatures) impure {
  ;; Parse signatures (3× {index, signature})
  slice sig_slice = signatures.begin_parse();
  int sig_count = sig_slice~load_uint(8);
  throw_unless(401, sig_count >= required_signatures);

  int validated = 0;
  int action_hash = cell_hash(action);

  repeat (sig_count) {
    int signer_index = sig_slice~load_uint(8);
    slice signature = sig_slice~load_bits(512);

    ;; Get pubkey for this index
    (int pubkey, int found) = admin_signers.udict_get?(8, signer_index);
    throw_unless(402, found);

    ;; Validate signature
    int valid = check_signature(action_hash, signature, pubkey);
    if (valid) {
      validated += 1;
    }
  }

  throw_unless(403, validated >= required_signatures);

  ;; Execute action
  slice action_slice = action.begin_parse();
  int op = action_slice~load_uint(32);

  if (op == op::set_pause) {
    int new_paused = action_slice~load_uint(1);
    paused = new_paused;
    save_data();
  }
  elseif (op == op::set_oracle) {
    slice oracle_addr = action_slice~load_msg_addr();
    oracle_address = oracle_addr;
    save_data();
  }
  ;; ... other admin ops
}
```

### Role-Based Access Control (RBAC)

```func
;; Role enum
const int ROLE_ADMIN = 1;
const int ROLE_ORACLE_KEEPER = 2;
const int ROLE_ARBITER = 3;
const int ROLE_PAUSER = 4;

global cell user_roles; ;; Dict<addr_hash:uint256, role_bitmap:uint8>

int has_role(slice user_addr, int required_role) {
  int addr_hash = slice_hash(user_addr);
  (int role_bitmap, int found) = user_roles.udict_get?(256, addr_hash);

  if (!found) {
    return false;
  }

  ;; Check if role bit is set
  return (role_bitmap & (1 << required_role)) > 0;
}

() require_role(slice user_addr, int required_role) impure {
  throw_unless(403, has_role(user_addr, required_role));
}

() recv_internal(int msg_value, cell in_msg_full, slice in_msg_body) impure {
  slice sender = in_msg_full.begin_parse().skip_bits(4).load_msg_addr();
  int op = in_msg_body~load_uint(32);

  if (op == op::pause_contract) {
    require_role(sender, ROLE_PAUSER);
    paused = true;
    save_data();
  }
  elseif (op == op::update_oracle_price) {
    require_role(sender, ROLE_ORACLE_KEEPER);
    ;; ... update price logic
  }
  ;; ... other ops
}
```

---

## 5. Oracle Security

### Problem

**Centralized oracle** = single point of failure/manipulation
**Multiple oracles without consensus** = conflicting data

### Solution: 3/5 Consensus with Staleness Checks

```func
global cell oracle_keepers; ;; Dict<keeper_id:uint8, (addr:slice, last_update:uint32)>
global cell oracle_prices; ;; Dict<keeper_id:uint8, (price:uint64, timestamp:uint32)>
global int required_consensus; ;; 3 out of 5

() submit_price(int keeper_id, int price, int timestamp) impure {
  ;; Validate keeper
  (slice keeper_data, int found) = oracle_keepers.udict_get?(8, keeper_id);
  throw_unless(404, found);

  slice keeper_addr = keeper_data~load_msg_addr();
  throw_unless(401, equal_slices(sender(), keeper_addr));

  ;; Check timestamp freshness (<30 min old)
  throw_unless(405, (now() - timestamp) < 1800);

  ;; Store price
  oracle_prices~udict_set(8, keeper_id,
    begin_cell()
      .store_uint(price, 64)
      .store_uint(timestamp, 32)
      .end_cell()
      .begin_parse()
  );

  save_data();
}

(int price, int valid) get_consensus_price() {
  ;; Collect prices from all keepers
  int[5] prices;
  int valid_count = 0;

  int keeper_id = 0;
  repeat (5) {
    (slice price_data, int found) = oracle_prices.udict_get?(8, keeper_id);

    if (found) {
      int price = price_data~load_uint(64);
      int timestamp = price_data~load_uint(32);

      ;; Check staleness (<30 min)
      if ((now() - timestamp) < 1800) {
        prices{valid_count} = price;
        valid_count += 1;
      }
    }

    keeper_id += 1;
  }

  ;; Require 3/5 consensus
  if (valid_count < required_consensus) {
    return (0, false);
  }

  ;; Calculate median (sort + pick middle)
  int[5] sorted = sort_array(prices, valid_count);
  int median_index = valid_count / 2;
  int median_price = sorted{median_index};

  return (median_price, true);
}
```

### Sybil Resistance

**Problem**: Attacker controls 3/5 keepers → manipulate price

**Defenses**:
1. **Diverse Keeper Sources**: RedStone, Pyth, Chainlink (different infrastructure)
2. **Economic Stake**: Keepers post $50K bond, slashed for manipulation
3. **Deviation Limits**: If consensus price deviates >10% from previous, flag for review
4. **Fallback Pricing**: If consensus fails, use Binance/CoinGecko API (off-chain)

```func
() validate_price_deviation(int new_price, int old_price) impure {
  int deviation = abs(new_price - old_price) * 100 / old_price;

  if (deviation > 10) {
    ;; Large deviation, pause and alert
    paused = true;
    emit_log_event("LargePriceDeviation",
      begin_cell()
        .store_uint(old_price, 64)
        .store_uint(new_price, 64)
        .store_uint(deviation, 16)
        .end_cell()
    );
  }
}
```

---

## 6. Economic Security

### Vault Waterfall (Loss Absorption)

**Problem**: Single vault → catastrophic loss wipes out all LPs

**Solution**: 6-tranche waterfall (junior tranches absorb first losses)

```func
;; Tranche allocation (from riskiest to safest)
const int TRANCHE_EQT = 5;   ;; 5% (first loss, highest APY)
const int TRANCHE_JNR_PLUS = 15; ;; 15% (second loss)
const int TRANCHE_JNR = 20;  ;; 20% (third loss)
const int TRANCHE_MEZZ = 25; ;; 25% (fourth loss)
const int TRANCHE_SNR = 20;  ;; 20% (fifth loss)
const int TRANCHE_BTC = 15;  ;; 15% (last loss, lowest APY, safest)

() absorb_loss(int loss_amount) impure {
  ;; Start from riskiest tranche
  loss_amount = absorb_from_tranche(TRANCHE_EQT, loss_amount);
  if (loss_amount == 0) { return (); }

  loss_amount = absorb_from_tranche(TRANCHE_JNR_PLUS, loss_amount);
  if (loss_amount == 0) { return (); }

  loss_amount = absorb_from_tranche(TRANCHE_JNR, loss_amount);
  if (loss_amount == 0) { return (); }

  loss_amount = absorb_from_tranche(TRANCHE_MEZZ, loss_amount);
  if (loss_amount == 0) { return (); }

  loss_amount = absorb_from_tranche(TRANCHE_SNR, loss_amount);
  if (loss_amount == 0) { return (); }

  loss_amount = absorb_from_tranche(TRANCHE_BTC, loss_amount);

  if (loss_amount > 0) {
    ;; All tranches wiped out, protocol insolvent
    emit_log_event("ProtocolInsolvent",
      begin_cell()
        .store_uint(loss_amount, 64)
        .end_cell()
    );
    paused = true;
  }

  save_data();
}

int absorb_from_tranche(int tranche_id, int loss_amount) impure {
  (int tranche_balance, _) = tranche_balances.udict_get?(8, tranche_id);

  if (tranche_balance >= loss_amount) {
    ;; Tranche can absorb full loss
    tranche_balances~udict_set(8, tranche_id, tranche_balance - loss_amount);
    return 0; ;; Loss fully absorbed
  } else {
    ;; Tranche wiped out, pass remaining loss to next
    tranche_balances~udict_set(8, tranche_id, 0);
    return loss_amount - tranche_balance;
  }
}
```

### Circuit Breakers

**Trigger Conditions**:
1. **Loss Spike**: >$1M lost in 1 hour
2. **Mass Claims**: >50 policies claim simultaneously
3. **Oracle Failure**: 0/5 keepers report prices
4. **Vault Depletion**: Total capacity <10% of coverage sold

```func
() check_circuit_breakers() impure {
  ;; Check 1: Loss spike
  int hourly_loss = get_losses_last_hour();
  if (hourly_loss > 1000000 * 1000000) { ;; $1M in nano-units
    trigger_circuit_breaker("LossSpike");
    return ();
  }

  ;; Check 2: Mass claims
  int hourly_claims = get_claims_last_hour();
  if (hourly_claims > 50) {
    trigger_circuit_breaker("MassClaims");
    return ();
  }

  ;; Check 3: Oracle failure
  (_, int oracle_valid) = get_consensus_price();
  if (!oracle_valid) {
    trigger_circuit_breaker("OracleFailure");
    return ();
  }

  ;; Check 4: Vault depletion
  int total_capacity = get_total_vault_capacity();
  int coverage_sold = get_total_coverage_sold();
  if (total_capacity * 10 < coverage_sold) { ;; <10% capacity
    trigger_circuit_breaker("VaultDepletion");
    return ();
  }
}

() trigger_circuit_breaker(slice reason) impure {
  paused = true;
  emit_log_event("CircuitBreakerTriggered",
    begin_cell()
      .store_slice(reason)
      .store_uint(now(), 32)
      .end_cell()
  );
  save_data();

  ;; Notify admin multisig (requires 3/5 to resume)
}
```

---

## 7. Reentrancy Guards

### Problem

**Reentrancy attack** (classic Ethereum DAO hack):
1. User calls `withdraw(100 TON)`
2. Contract sends 100 TON to user
3. User's receive handler calls `withdraw(100 TON)` again
4. Contract hasn't updated balance yet → sends another 100 TON
5. Repeat until drained

### Solution: Check-Effects-Interactions Pattern

```func
global int reentrancy_guard; ;; 0 = not active, 1 = active

() withdraw(int amount) impure {
  ;; CHECK: Validate reentrancy guard
  throw_if(409, reentrancy_guard == 1);
  reentrancy_guard = 1; ;; Lock

  ;; CHECK: Validate amount
  int user_balance = get_user_balance(sender());
  throw_unless(410, user_balance >= amount);

  ;; EFFECTS: Update state BEFORE external call
  set_user_balance(sender(), user_balance - amount);
  save_data();

  ;; INTERACTIONS: External call (last)
  send_simple_message(sender(), amount);

  ;; Unlock guard
  reentrancy_guard = 0;
  save_data();
}
```

**Alternative: Mutex Lock (More Gas Efficient)**:
```func
global int locked; ;; 0 = unlocked, 1 = locked

() nonreentrant_function() impure {
  throw_if(409, locked == 1);
  locked = 1;

  ;; ... function logic ...

  locked = 0;
  save_data();
}
```

---

## 8. Testing Security Patterns

### DoS Attack Tests

```typescript
describe('GasWallet DoS Resistance', () => {
  it('should rate limit excessive transactions', async () => {
    const attacker = await blockchain.treasury('attacker');

    // Send 10 transactions rapidly (limit is 5/min)
    const results = await Promise.all(
      Array(10).fill(0).map((_, i) =>
        gasWallet.sendCreatePolicy(attacker.getSender(), {
          value: toNano('0.1'),
          nonce: i + 1,
          productType: 1,
          assetId: 1
        })
      )
    );

    // First 5 should succeed, next 5 should fail
    const successes = results.filter(r => r.transactions[0].success);
    expect(successes).toHaveLength(5);
  });

  it('should reject replay attacks', async () => {
    const user = await blockchain.treasury('user');

    // Send transaction with nonce 1
    await gasWallet.sendCreatePolicy(user.getSender(), {
      value: toNano('0.1'),
      nonce: 1
    });

    // Try to replay nonce 1
    const result = await gasWallet.sendCreatePolicy(user.getSender(), {
      value: toNano('0.1'),
      nonce: 1
    });

    expect(result.transactions).toHaveTransaction({
      success: false,
      exitCode: 400 // Invalid nonce
    });
  });
});
```

### Reentrancy Tests

```typescript
it('should prevent reentrancy attacks on withdraw', async () => {
  // Deploy malicious contract that re-enters on receive
  const attacker = await blockchain.deploy(MaliciousContract.createFromConfig({
    target: vault.address
  }));

  // Attacker deposits 100 TON
  await vault.sendDeposit(attacker.getSender(), { value: toNano('100') });

  // Attacker tries to withdraw twice (reentrancy)
  const result = await attacker.sendReentrantWithdraw();

  // Should fail with reentrancy error
  expect(result.transactions).toHaveTransaction({
    from: vault.address,
    to: attacker.address,
    success: false,
    exitCode: 409 // Reentrancy detected
  });

  // Vault balance should only decrease by 100 TON (not 200)
  const vaultBalance = await vault.getBalance();
  expect(vaultBalance).toBeLessThan(toNano('100'));
});
```

### Oracle Manipulation Tests

```typescript
it('should require 3/5 consensus for price updates', async () => {
  // Submit prices from only 2 keepers
  await oracle.sendSubmitPrice(keeper1.getSender(), { price: 98000000n });
  await oracle.sendSubmitPrice(keeper2.getSender(), { price: 98000000n });

  // Try to trigger claim (should fail, need 3/5)
  const result = await escrow.sendTriggerClaim();

  expect(result.transactions).toHaveTransaction({
    success: false,
    exitCode: 405 // Insufficient consensus
  });

  // Submit 3rd keeper price
  await oracle.sendSubmitPrice(keeper3.getSender(), { price: 98000000n });

  // Now claim should succeed
  const result2 = await escrow.sendTriggerClaim();
  expect(result2.transactions).toHaveTransaction({
    success: true
  });
});
```

---

## Conclusion

V3 security patterns provide comprehensive protection against:
- **DoS attacks**: Rate limiting (5/min), early validation (~1k gas), nonce replay protection
- **Economic exploits**: Vault waterfall, circuit breakers, coverage limits
- **Oracle manipulation**: 3/5 consensus, staleness checks, deviation limits
- **Reentrancy**: Check-effects-interactions, mutex locks
- **Silent failures**: Bounced message handling, event emission

**Next Steps**: Implement security_helpers.fc library, integrate into all contracts, write 250+ unit tests covering all attack scenarios.
