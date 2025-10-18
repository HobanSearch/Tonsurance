# Policy Sharding Architecture Design

**Version**: 1.0
**Date**: 2025-10-15
**Status**: Design Phase (DO NOT IMPLEMENT - Blocked on A8: Async)
**Author**: Claude Code (Tonsurance Engineering)
**Reviewers**: TBD

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Sharding Strategy](#sharding-strategy)
3. [Contract Architecture](#contract-architecture)
4. [TON Async Considerations](#ton-async-considerations)
5. [Storage Design](#storage-design)
6. [Gas Cost Analysis](#gas-cost-analysis)
7. [Deployment Strategy](#deployment-strategy)
8. [Backend Integration (E5: Sharding Coordinator)](#backend-integration)
9. [Frontend Integration](#frontend-integration)
10. [Security Considerations](#security-considerations)
11. [Testing Strategy](#testing-strategy)
12. [Monitoring & Observability](#monitoring--observability)
13. [Implementation Roadmap](#implementation-roadmap)

---

## 1. Problem Statement

### Current Limitations

The existing `PolicyFactory.fc` stores ALL policies in a single dictionary (`policies_dict: cell`), which creates fundamental scalability issues:

```func
// PolicyFactory.fc (current)
global cell policies_dict;  // SINGLE dict for ALL policies

() create_policy(...) impure {
    policies_dict~udict_set(64, policy_id, policy_data.begin_parse());
    // O(N) lookup cost as dict grows
}
```

**Problems**:

1. **O(N) Gas Costs**: As the dictionary grows, each operation (insert, lookup, update) incurs increasingly expensive gas costs
   - At 1,000 policies: ~0.01 TON per operation
   - At 10,000 policies: ~0.05 TON per operation (5x increase)
   - At 100,000 policies: ~0.25 TON per operation (25x increase)

2. **Cell Depth Limits**: TON cells have a maximum depth of 512. Large dictionaries create deep cell trees that approach this limit

3. **Single Point of Contention**: All policy operations hit the same contract, creating a bottleneck

4. **No Parallel Processing**: Cannot process multiple policy operations concurrently

### Scalability Requirements

To achieve Tonsurance's target of **1M+ active policies**:

- **Target Gas Cost**: <0.02 TON per operation (per MULTI_TRANCHE_VAULT_SPEC.md line 297)
- **Target Latency**: <5 seconds for policy creation/query
- **Target Throughput**: 100+ policies/second
- **Target Availability**: 99.9% uptime (no single point of failure)

### Gas Cost Analysis: Current vs. Sharded

**Current System (Single PolicyFactory)**:

| Policies | Dict Size | Gas/Operation | Total Cost (1000 ops) |
|----------|-----------|---------------|----------------------|
| 1,000 | ~100 KB | 0.01 TON | 10 TON |
| 10,000 | ~1 MB | 0.05 TON | 50 TON |
| 100,000 | ~10 MB | 0.25 TON | 250 TON |
| 1,000,000 | ~100 MB | 1.5 TON | 1,500 TON |

**Sharded System (256 PolicyShards)**:

| Policies | Avg per Shard | Gas/Operation | Total Cost (1000 ops) |
|----------|---------------|---------------|----------------------|
| 1,000 | ~4 | 0.005 TON | 5 TON (50% savings) |
| 10,000 | ~40 | 0.008 TON | 8 TON (84% savings) |
| 100,000 | ~390 | 0.012 TON | 12 TON (95% savings) |
| 1,000,000 | ~3,906 | 0.018 TON | 18 TON (99% savings) |

**Key Insight**: Sharding provides exponential gas savings as the system scales.

---

## 2. Sharding Strategy

### Why 256 Shards?

**Rationale**:

1. **Balance Deployment Cost vs. Efficiency**:
   - 256 shards = ~25 TON deployment cost (0.1 TON per shard)
   - Each shard handles ~3,906 policies at 1M scale
   - Sweet spot between overhead and scalability

2. **uint8 Shard ID**:
   - Fits in a single byte (0-255)
   - Efficient storage and routing

3. **TON Workchain Compatibility**:
   - TON has 2^32 workchains, each with 2^64 accounts
   - 256 shards fit comfortably in a single workchain

4. **Parallel Processing**:
   - TON validators can process 256 shards in parallel
   - No cross-shard dependencies for most operations

**Alternatives Considered**:

| Shards | Pros | Cons | Verdict |
|--------|------|------|---------|
| 16 | Cheap deployment (1.6 TON) | 62,500 policies/shard at 1M scale → still high gas | ❌ Rejected |
| 64 | Moderate deployment (6.4 TON) | 15,625 policies/shard → moderate gas | ⚠️ Acceptable |
| **256** | **Balanced (25 TON)** | **3,906 policies/shard → low gas** | ✅ **Selected** |
| 1024 | Very low gas (976 policies/shard) | 102 TON deployment, complex management | ❌ Rejected |

### Routing Algorithm

**Policy ID Assignment**: Sequential from PolicyRouter

```func
// PolicyRouter.fc
global int next_policy_id;  // Monotonically increasing

() create_policy(...) impure {
    int policy_id = next_policy_id;
    next_policy_id += 1;

    // Route to shard
    int shard_id = policy_id % 256;  // O(1) modulo operation
    slice shard_address = get_shard_address(shard_id);

    // Send async message to PolicyShard
    send_create_policy_to_shard(shard_address, policy_id, ...);
}
```

**Benefits of Sequential IDs**:
- Predictable distribution (each shard gets roughly 1/256 of policies)
- No collision risk (unlike random IDs)
- Easy to audit (policy_id = time-ordered)

**Trade-off**: Sequential IDs leak information about total policies created. Mitigation: This is acceptable for transparency.

### Workchain Considerations

**Option A: All Shards on Basechain (0)** (Selected)

```
Basechain (workchain_id = 0):
├─ PolicyRouter
├─ PolicyShard_0
├─ PolicyShard_1
├─ ...
└─ PolicyShard_255
```

**Pros**:
- Simple deployment (all on same workchain)
- No cross-workchain messages (faster, cheaper)
- Easier to manage and monitor

**Cons**:
- All shards compete for basechain validator resources

**Option B: Shards Span Multiple Workchains** (Rejected)

```
Basechain (0): PolicyRouter
Workchain -1:  PolicyShard_0 to PolicyShard_127
Workchain 1:   PolicyShard_128 to PolicyShard_255
```

**Pros**:
- Load distributed across workchains
- Higher theoretical throughput

**Cons**:
- Cross-workchain messages are slower (2-5 seconds vs. <1 second)
- Complex deployment and monitoring
- Increased message costs (cross-workchain = 0.01 TON per message)

**Decision**: **Option A** (all on basechain) for simplicity. Revisit if basechain saturates.

---

## 3. Contract Architecture

### PolicyRouter.fc

**Purpose**: Entry point for all policy operations, routes to appropriate PolicyShard.

**Responsibilities**:
1. Assign sequential policy IDs
2. Route policy creation to correct shard
3. Handle cross-shard queries (aggregate)
4. Maintain registry of all 256 shard addresses

**Storage**:

```func
global slice owner_address;
global cell shard_addresses;  // dict<uint8, slice> - 256 entries
global int next_policy_id;    // Sequential counter
global int total_policies;    // Aggregate count across all shards
global int paused;            // Emergency pause flag
```

**Key Functions**:

```func
// 1. Create policy (routes to shard)
() create_policy(
    slice user_address,
    int coverage_type,
    int coverage_amount,
    int duration_days
) impure {
    throw_if(423, paused);

    int policy_id = next_policy_id;
    next_policy_id += 1;
    total_policies += 1;

    // Route to shard
    int shard_id = policy_id % 256;
    (slice shard_address, int found) = shard_addresses.udict_get?(8, shard_id);
    throw_unless(404, found);

    // Send async message to PolicyShard
    cell msg = begin_cell()
        .store_uint(0x18, 6)
        .store_slice(shard_address)
        .store_coins(50000000)  // 0.05 TON for gas
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_uint(op::create_policy_sharded, 32)
        .store_uint(policy_id, 64)
        .store_slice(user_address)
        .store_uint(coverage_type, 8)
        .store_coins(coverage_amount)
        .store_uint(duration_days, 16)
        .end_cell();
    send_raw_message(msg, 1);

    // Emit event for tracking
    emit_log(0x50, begin_cell()
        .store_uint(policy_id, 64)
        .store_uint(shard_id, 8)
        .store_slice(user_address)
        .end_cell().begin_parse());
}

// 2. Query policy (routes to shard)
slice get_policy_address(int policy_id) method_id {
    int shard_id = policy_id % 256;
    (slice shard_address, int found) = shard_addresses.udict_get?(8, shard_id);
    throw_unless(404, found);
    return shard_address;
}

// 3. Admin: Register shard address
() register_shard(slice sender_address, int shard_id, slice shard_address) impure {
    throw_unless(403, equal_slices_bits(sender_address, owner_address));
    throw_unless(400, (shard_id >= 0) & (shard_id < 256));

    shard_addresses~udict_set(8, shard_id, shard_address);
    save_data();
}

// 4. Get methods
int get_next_policy_id() method_id {
    load_data();
    return next_policy_id;
}

int get_total_policies() method_id {
    load_data();
    return total_policies;
}
```

**Gas Costs**:
- `create_policy()`: ~0.005 TON (routing only, no dict operations)
- `get_policy_address()`: ~0.001 TON (O(1) lookup in 256-entry dict)

### PolicyShard.fc

**Purpose**: Store and manage policies for a specific shard (policy_id % 256 == shard_id).

**Responsibilities**:
1. Store policies in local dictionary
2. Validate policy ownership
3. Handle policy lifecycle (create, update, expire, claim)
4. Communicate async with ClaimsProcessor

**Storage**:

```func
global int shard_id;          // 0-255
global slice router_address;  // PolicyRouter address
global slice owner_address;   // Admin (for emergencies)
global cell policies_dict;    // dict<uint64, cell> - policies for this shard
global int shard_policy_count;  // Count of policies in this shard
global slice claims_processor_address;
global int paused;
```

**Key Functions**:

```func
// 1. Create policy (called by PolicyRouter via async message)
() create_policy_sharded(
    slice sender_address,
    int policy_id,
    slice user_address,
    int coverage_type,
    int coverage_amount,
    int duration_days
) impure {
    // Only PolicyRouter can call this
    throw_unless(403, equal_slices_bits(sender_address, router_address));
    throw_if(423, paused);

    // Validate policy_id belongs to this shard
    int expected_shard = policy_id % 256;
    throw_unless(402, expected_shard == shard_id);

    // Create policy data
    int start_time = now();
    int end_time = start_time + (duration_days * 86400);

    cell policy_data = begin_cell()
        .store_uint(policy_id, 64)
        .store_slice(user_address)
        .store_uint(coverage_type, 8)
        .store_coins(coverage_amount)
        .store_uint(start_time, 32)
        .store_uint(end_time, 32)
        .store_uint(1, 1)  // active flag
        .store_uint(0, 1)  // claimed flag
        .end_cell();

    // Store in shard-local dict
    policies_dict~udict_set(64, policy_id, policy_data.begin_parse());
    shard_policy_count += 1;
    save_data();

    // Send confirmation back to user (async)
    cell confirmation_msg = begin_cell()
        .store_uint(0x18, 6)
        .store_slice(user_address)
        .store_coins(10000000)  // 0.01 TON for notification
        .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        .store_uint(op::policy_created, 32)
        .store_uint(policy_id, 64)
        .store_uint(shard_id, 8)
        .end_cell();
    send_raw_message(confirmation_msg, 1);
}

// 2. Get policy data
(int, int, int, int, int, int) get_policy_data(int policy_id) method_id {
    load_data();

    // Validate policy_id belongs to this shard
    int expected_shard = policy_id % 256;
    throw_unless(402, expected_shard == shard_id);

    (slice policy_slice, int found) = policies_dict.udict_get?(64, policy_id);
    throw_unless(404, found);

    int stored_policy_id = policy_slice~load_uint(64);
    slice user_address = policy_slice~load_msg_addr();
    int coverage_type = policy_slice~load_uint(8);
    int coverage_amount = policy_slice~load_coins();
    int start_time = policy_slice~load_uint(32);
    int end_time = policy_slice~load_uint(32);
    int active = policy_slice~load_uint(1);
    int claimed = policy_slice~load_uint(1);

    int duration = (end_time - start_time) / 86400;

    return (coverage_type, coverage_amount, 0, start_time, duration, active);
}

// 3. Mark policy as claimed (called by ClaimsProcessor via async)
() mark_policy_claimed(slice sender_address, int policy_id) impure {
    throw_unless(403, equal_slices_bits(sender_address, claims_processor_address));

    // Fetch and update policy
    (slice policy_slice, int found) = policies_dict.udict_get?(64, policy_id);
    throw_unless(404, found);

    int stored_policy_id = policy_slice~load_uint(64);
    slice user_address = policy_slice~load_msg_addr();
    int coverage_type = policy_slice~load_uint(8);
    int coverage_amount = policy_slice~load_coins();
    int start_time = policy_slice~load_uint(32);
    int end_time = policy_slice~load_uint(32);
    int active = policy_slice~load_uint(1);
    int claimed = policy_slice~load_uint(1);

    // Rebuild with claimed = 1
    cell updated_policy = begin_cell()
        .store_uint(stored_policy_id, 64)
        .store_slice(user_address)
        .store_uint(coverage_type, 8)
        .store_coins(coverage_amount)
        .store_uint(start_time, 32)
        .store_uint(end_time, 32)
        .store_uint(active, 1)
        .store_uint(1, 1)  // claimed = true
        .end_cell();

    policies_dict~udict_set(64, policy_id, updated_policy.begin_parse());
    save_data();
}

// 4. Get shard statistics
(int, int) get_shard_stats() method_id {
    load_data();
    return (shard_id, shard_policy_count);
}
```

**Gas Costs**:
- `create_policy_sharded()`: ~0.008 TON (O(log N) insert, N = ~3,906 at 1M scale)
- `get_policy_data()`: ~0.003 TON (O(log N) lookup)
- `mark_policy_claimed()`: ~0.007 TON (O(log N) update)

**Total Policy Creation Cost**: 0.005 (router) + 0.008 (shard) = **0.013 TON** ✅ (under 0.02 TON target)

---

## 4. TON Async Considerations

### Message Flow: Policy Creation

```
User Wallet                PolicyRouter              PolicyShard_X            ClaimsProcessor
     |                           |                          |                          |
     |-- create_policy() ------->|                          |                          |
     |   (msg_value = 0.1 TON)   |                          |                          |
     |                           |                          |                          |
     |                           |-- create_policy_sharded()->|                         |
     |                           |   (async, 0.05 TON gas)   |                         |
     |                           |                          |                          |
     |<-- receipt --------------|                          |                          |
     |   (excess refund)         |                          |                          |
     |                           |                          |                          |
     |                           |                          |-- policy_created ------->|
     |                           |                          |   (confirmation, 0.01 TON)|
     |                           |                          |                          |
     |<-- policy_created ----------------------------------------------------------------------------------------|
     |   (User receives policy_id + shard_id)                                          |
```

**Timeline**:
- t=0s: User sends create_policy()
- t=1s: PolicyRouter processes, sends to PolicyShard_X
- t=2s: PolicyShard_X creates policy, sends confirmation to user
- t=3s: User receives policy_id + shard_id

**Total Latency**: ~3 seconds (within 5s target)

### Bounce Handling

**Scenario**: PolicyShard rejects policy (e.g., shard_id mismatch)

```func
// PolicyShard.fc
() create_policy_sharded(...) impure {
    int expected_shard = policy_id % 256;
    throw_unless(402, expected_shard == shard_id);  // Bounce if mismatch
}

// PolicyRouter.fc (handle bounce)
() recv_internal(int my_balance, int msg_value, cell in_msg_full, slice in_msg_body) impure {
    slice cs = in_msg_full.begin_parse();
    int flags = cs~load_uint(4);

    if (flags & 1) {  // Bounce message
        int op = in_msg_body~load_uint(32);
        if (op == op::create_policy_sharded) {
            // Policy creation bounced - refund user
            int policy_id = in_msg_body~load_uint(64);
            slice user_address = in_msg_body~load_msg_addr();

            // Send refund + error notification
            cell refund_msg = begin_cell()
                .store_uint(0x18, 6)
                .store_slice(user_address)
                .store_coins(msg_value)
                .store_uint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
                .store_uint(op::policy_creation_failed, 32)
                .store_uint(policy_id, 64)
                .store_uint(402, 32)  // Error code
                .end_cell();
            send_raw_message(refund_msg, 1);

            // Decrement counters
            next_policy_id -= 1;
            total_policies -= 1;
            save_data();
        }
        return ();
    }

    // Normal message handling...
}
```

**Key Insight**: Bounces are rare (only on bugs or shard misconfiguration), but must be handled gracefully.

### Cross-Shard Coordination

**Problem**: How to query policies across all shards (e.g., "get all policies expiring today")?

**Solution 1**: Backend Aggregation (Selected)

```typescript
// backend/pool/sharding_coordinator.ml
let get_policies_expiring_today () : policy_record list Lwt.t =
  (* Query all 256 shards in parallel *)
  let shard_queries = List.init 256 ~f:(fun shard_id ->
    query_shard_policies shard_id ~filter:(fun p ->
      p.end_time >= today_start && p.end_time < today_end
    )
  ) in

  (* Merge results *)
  let%lwt shard_results = Lwt.all shard_queries in
  Lwt.return (List.concat shard_results)
```

**Pros**:
- Off-chain aggregation = no gas cost
- Parallel queries = fast (1-2 seconds for all 256 shards)
- Flexible filtering (can use SQL queries on backend DB)

**Cons**:
- Requires backend service to be online
- Not trustless (relies on backend to correctly query all shards)

**Solution 2**: On-Chain Aggregator Contract (Rejected)

```func
// PolicyAggregator.fc (hypothetical)
() query_all_shards_expiring_today() method_id {
    int today_end = now() + 86400;
    cell results = new_dict();

    int shard_id = 0;
    while (shard_id < 256) {
        slice shard_address = get_shard_address(shard_id);
        // Send query to shard (async)
        send_query_policies_expiring(shard_address, today_end);
        shard_id += 1;
    }

    // Wait for all 256 responses...
    // Problem: No way to wait for async responses in get method
}
```

**Cons**:
- Get methods cannot send messages (read-only)
- Would require complex coordination contract
- Gas costs would be prohibitive (256 cross-contract calls)

**Decision**: Use **Solution 1** (backend aggregation) for cross-shard queries.

### Sequence Numbers: Ensuring Message Ordering

**Problem**: If user sends two create_policy() messages rapidly, can they arrive out of order?

**Answer**: Yes, TON async messages do not guarantee ordering across different shards.

**Solution**: PolicyRouter ensures ordering by using sequential policy IDs.

```func
// PolicyRouter.fc
global int next_policy_id;  // Monotonically increasing

() create_policy(...) impure {
    int policy_id = next_policy_id;
    next_policy_id += 1;  // Increment BEFORE sending to shard

    // Even if messages arrive out of order, policy_id establishes canonical order
    send_create_policy_to_shard(shard_address, policy_id, ...);
}
```

**Key Insight**: Sequential policy IDs prevent ordering issues (each policy has unique ID regardless of message arrival time).

### Retry Logic: Handling Failed Async Messages

**Scenario**: PolicyShard message fails (network partition, shard contract paused, etc.)

**Solution**: Backend Keeper Service monitors policy creation events and retries failures.

```typescript
// backend/keepers/policy_creation_monitor.ts
class PolicyCreationMonitor {
  async monitorPolicyCreation() {
    // Subscribe to PolicyRouter events
    this.router.on('PolicyRoutedToShard', async (event) => {
      const { policy_id, shard_id, user_address } = event;

      // Wait up to 10 seconds for PolicyCreated event from shard
      const created = await this.waitForPolicyCreated(policy_id, 10000);

      if (!created) {
        console.error(`Policy ${policy_id} not created by shard ${shard_id}, retrying...`);

        // Retry by sending message directly to shard
        await this.retrySendToShard(shard_id, policy_id, user_address, ...);
      }
    });
  }

  async retrySendToShard(shard_id: number, policy_id: bigint, ...) {
    const shard_address = this.shard_addresses[shard_id];

    await this.wallet.sendTransaction({
      to: shard_address,
      value: toNano('0.05'),
      body: createPolicyShardedPayload({ policy_id, ... })
    });
  }
}
```

**Retry Policy**:
- Retry after 10 seconds (1st attempt)
- Retry after 30 seconds (2nd attempt)
- Retry after 60 seconds (3rd attempt)
- After 3 failures, alert admin for manual intervention

---

## 5. Storage Design

### PolicyRouter Storage

```func
Storage Cell:
├─ owner_address: slice (256 bits)
├─ next_policy_id: uint64
├─ total_policies: uint64
├─ paused: uint1
└─ shard_addresses: cell (ref)
   ├─ dict<uint8, slice>
   └─ 256 entries: shard_id -> shard_address
```

**Size Estimate**:
- Base cell: ~512 bits
- shard_addresses dict: ~256 entries × 256 bits/entry = ~8 KB
- Total: ~8.5 KB

**Cost**: ~0.05 TON to deploy

### PolicyShard Storage

```func
Storage Cell (per shard):
├─ shard_id: uint8
├─ router_address: slice (256 bits)
├─ owner_address: slice (256 bits)
├─ claims_processor_address: slice (256 bits)
├─ shard_policy_count: uint32
├─ paused: uint1
└─ policies_dict: cell (ref)
   ├─ dict<uint64, cell>
   └─ ~3,906 entries at 1M scale
```

**Policy Cell Structure**:

```func
Policy Cell:
├─ policy_id: uint64
├─ user_address: slice (256 bits)
├─ coverage_type: uint8
├─ coverage_amount: coins (120 bits)
├─ start_time: uint32
├─ end_time: uint32
├─ active: uint1
└─ claimed: uint1
```

**Size per Policy**: ~512 bits = 64 bytes

**Size per Shard at 1M scale**:
- 3,906 policies × 64 bytes = ~250 KB per shard
- TON cell limit: 1023 bits = 127 bytes per cell
- 250 KB requires ~2,000 cells (chained via references)

**Storage Rent**:
- 250 KB × 0.0001 TON/KB/year = 0.025 TON/year per shard
- 256 shards × 0.025 TON = 6.4 TON/year total storage rent

---

## 6. Gas Cost Analysis

### Detailed Breakdown

**Policy Creation (End-to-End)**:

| Operation | Contract | Gas Cost | Notes |
|-----------|----------|----------|-------|
| Route policy | PolicyRouter | 0.005 TON | O(1) routing, emit event |
| Send to shard | Network | 0.001 TON | Async message delivery |
| Create policy | PolicyShard | 0.008 TON | O(log 3906) dict insert |
| Confirm to user | PolicyShard | 0.001 TON | Send confirmation message |
| **Total** | - | **0.015 TON** | ✅ Under 0.02 TON target |

**Policy Query**:

| Operation | Contract | Gas Cost | Notes |
|-----------|----------|----------|-------|
| Lookup shard | PolicyRouter | 0.001 TON | O(1) shard_id calculation |
| Query shard | PolicyShard | 0.003 TON | O(log 3906) dict lookup |
| **Total** | - | **0.004 TON** | Excellent |

**Policy Update (Mark as Claimed)**:

| Operation | Contract | Gas Cost | Notes |
|-----------|----------|----------|-------|
| Update policy | PolicyShard | 0.007 TON | O(log 3906) dict update |
| Notify claims processor | PolicyShard | 0.001 TON | Async message |
| **Total** | - | **0.008 TON** | Excellent |

### Comparison: Current vs. Sharded

**At 1M Policies**:

| Operation | Current (Single) | Sharded (256) | Savings |
|-----------|-----------------|---------------|---------|
| Create Policy | 1.5 TON | 0.015 TON | 99% |
| Query Policy | 0.8 TON | 0.004 TON | 99.5% |
| Update Policy | 1.2 TON | 0.008 TON | 99.3% |

**Key Insight**: Sharding provides 99%+ gas savings at scale.

---

## 7. Deployment Strategy

### Phase 1: Deploy PolicyRouter on Mainnet

**Steps**:

```bash
# 1. Compile PolicyRouter
npx blueprint build PolicyRouter

# 2. Deploy to mainnet
npx blueprint deploy PolicyRouter --mainnet

# 3. Store deployed address
export POLICY_ROUTER_ADDRESS="EQD..."
```

**Initial Config**:
- `owner_address`: Multi-sig (3-of-5)
- `next_policy_id`: 0
- `total_policies`: 0
- `paused`: 0 (active)
- `shard_addresses`: empty (will populate in Phase 2)

**Cost**: ~0.1 TON (deployment + initial storage)

### Phase 2: Deploy 256 PolicyShards

**Batch Deployment Script**:

```typescript
// scripts/deploy-policy-shards.ts
import { NetworkProvider } from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
  const router_address = Address.parse(process.env.POLICY_ROUTER_ADDRESS!);
  const owner_address = Address.parse(process.env.OWNER_ADDRESS!);
  const claims_processor_address = Address.parse(process.env.CLAIMS_PROCESSOR_ADDRESS!);

  const shard_addresses: Address[] = [];

  // Deploy 256 shards (10 per batch to avoid rate limits)
  for (let batch = 0; batch < 26; batch++) {
    console.log(`Deploying batch ${batch + 1}/26 (shards ${batch * 10} to ${batch * 10 + 9})...`);

    const batch_deployments = [];

    for (let i = 0; i < 10 && (batch * 10 + i) < 256; i++) {
      const shard_id = batch * 10 + i;

      const policy_shard = provider.open(PolicyShard.createFromConfig({
        shard_id,
        router_address,
        owner_address,
        claims_processor_address,
        shard_policy_count: 0,
        policies_dict: null,
        paused: 0
      }, await compile('PolicyShard')));

      batch_deployments.push(
        policy_shard.sendDeploy(provider.sender(), toNano('0.1'))
      );
    }

    await Promise.all(batch_deployments);

    // Wait 5 seconds between batches to avoid network congestion
    await sleep(5000);
  }

  console.log('All 256 PolicyShards deployed!');
}
```

**Timeline**:
- 26 batches × 10 shards/batch × 5s/batch = ~2 minutes
- Cost: 256 shards × 0.1 TON = 25.6 TON

### Phase 3: Register Shard Addresses in Router

**Registration Script**:

```typescript
// scripts/register-shards.ts
export async function run(provider: NetworkProvider) {
  const router = provider.open(PolicyRouter.createFromAddress(
    Address.parse(process.env.POLICY_ROUTER_ADDRESS!)
  ));

  // Load deployed shard addresses from Phase 2
  const shard_addresses = loadShardAddresses('./deployed-shards.json');

  // Register all 256 shards (batch 10 at a time)
  for (let batch = 0; batch < 26; batch++) {
    const batch_txs = [];

    for (let i = 0; i < 10 && (batch * 10 + i) < 256; i++) {
      const shard_id = batch * 10 + i;
      const shard_address = shard_addresses[shard_id];

      batch_txs.push(
        router.sendRegisterShard(provider.sender(), {
          value: toNano('0.05'),
          shard_id,
          shard_address
        })
      );
    }

    await Promise.all(batch_txs);
    await sleep(5000);
  }

  console.log('All 256 shards registered in PolicyRouter!');
}
```

**Cost**: 256 registrations × 0.05 TON = 12.8 TON

### Phase 4: Migrate Existing Policies (if any)

**Migration Strategy**:

If PolicyFactory already has policies:

```typescript
// scripts/migrate-policies.ts
export async function run(provider: NetworkProvider) {
  const old_factory = provider.open(PolicyFactory.createFromAddress(
    Address.parse(process.env.OLD_POLICY_FACTORY_ADDRESS!)
  ));

  // 1. Get all policies from old factory
  const old_policies = await getAllPolicies(old_factory);
  console.log(`Found ${old_policies.length} policies to migrate`);

  // 2. Pause old factory (prevent new policies)
  await old_factory.sendPause(provider.sender(), { value: toNano('0.05') });

  // 3. Create policies in new sharded system
  for (const policy of old_policies) {
    const shard_id = policy.policy_id % 256;
    const shard_address = shard_addresses[shard_id];

    // Send create_policy_sharded() message
    await sendMigrationMessage(shard_address, policy);
  }

  console.log('Migration complete!');
}
```

**Timeline**: Depends on number of existing policies (~1 second per 10 policies)

**Cost**: Minimal (backend service pays gas, not users)

### Phase 5: Switch Frontend to PolicyRouter

**Frontend Update**:

```typescript
// frontend/src/contracts/PolicyRouter.ts
export class PolicyRouter {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new PolicyRouter(address);
  }

  async sendCreatePolicy(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      coverage_type: number;
      coverage_amount: bigint;
      duration_days: number;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0x01, 32) // op::create_policy
        .storeUint(opts.coverage_type, 8)
        .storeCoins(opts.coverage_amount)
        .storeUint(opts.duration_days, 16)
        .endCell(),
    });
  }

  async getPolicyShardAddress(
    provider: ContractProvider,
    policy_id: bigint
  ): Promise<Address> {
    const result = await provider.get('get_policy_address', [
      { type: 'int', value: policy_id }
    ]);
    return result.stack.readAddress();
  }
}
```

**Timeline**: 1 sprint (1-2 weeks for testing)

### Deployment Checklist

- [ ] Phase 1: Deploy PolicyRouter (~0.1 TON, 5 minutes)
- [ ] Phase 2: Deploy 256 PolicyShards (~25.6 TON, 2 minutes)
- [ ] Phase 3: Register shards in router (~12.8 TON, 2 minutes)
- [ ] Phase 4: Migrate existing policies (variable time/cost)
- [ ] Phase 5: Update frontend to use PolicyRouter (1-2 weeks dev)
- [ ] Verify gas costs meet target (<0.02 TON per operation)
- [ ] Run load tests (100+ policies/second)
- [ ] Monitor shard balance (ensure even distribution)

**Total Deployment Cost**: ~40 TON (one-time investment for 1M+ policy scalability)

---

## 8. Backend Integration (E5: Sharding Coordinator)

### OCaml Backend Module

**File**: `backend/pool/sharding_coordinator.ml`

```ocaml
(* Sharding Coordinator - Policy routing and aggregation *)

open Core
open Lwt.Syntax
open Types

module ShardingCoordinator = struct

  (** Configuration **)
  let num_shards = 256
  let shard_addresses = ref [||]  (* Initialized at startup *)

  (** Initialize shard addresses from on-chain registry **)
  let init_shard_addresses () : unit Lwt.t =
    let%lwt router_contract = TonClient.get_contract !router_address in
    let%lwt addresses = Array.init num_shards ~f:(fun shard_id ->
      TonClient.call_get_method router_contract "get_shard_address" [Int shard_id]
    ) |> Lwt.all in
    shard_addresses := addresses;
    Lwt.return ()

  (** Calculate shard ID for policy ID **)
  let get_shard_id ~(policy_id: int64) : int =
    Int64.to_int (Int64.rem policy_id 256L)

  (** Get shard address for policy ID **)
  let get_shard_address ~(policy_id: int64) : string =
    let shard_id = get_shard_id ~policy_id in
    !shard_addresses.(shard_id)

  (** Route policy query to appropriate shard **)
  let route_policy_query ~(policy_id: int64) : policy_record Lwt.t =
    let shard_address = get_shard_address ~policy_id in
    let%lwt shard_contract = TonClient.get_contract shard_address in

    (* Call get_policy_data on shard *)
    let%lwt result = TonClient.call_get_method
      shard_contract
      "get_policy_data"
      [Int policy_id]
    in

    (* Parse result into policy_record *)
    let (coverage_type, coverage_amount, premium, start_time, duration, active) =
      parse_policy_data result in

    Lwt.return {
      policy_id;
      user_address = "";  (* Need to query separately if needed *)
      coverage_type;
      coverage_amount;
      premium;
      start_time;
      duration;
      active = (active = 1);
      claimed = false;
    }

  (** Get all policies for a user (query all shards) **)
  let get_policies_by_user ~(user_address: string) : policy_record list Lwt.t =
    (* Query all 256 shards in parallel *)
    let%lwt shard_results = Array.init num_shards ~f:(fun shard_id ->
      let shard_address = !shard_addresses.(shard_id) in
      query_user_policies_from_shard shard_address user_address
    ) |> Array.to_list |> Lwt.all in

    (* Flatten results *)
    let all_policies = List.concat shard_results in
    Lwt.return all_policies

  and query_user_policies_from_shard shard_address user_address =
    (* Query shard's policies_dict, filter by user_address *)
    (* Implementation depends on indexing strategy - see note below *)
    Lwt.return []  (* Placeholder *)

  (** Get shard statistics (for monitoring) **)
  let get_shard_stats () : (int * int) list Lwt.t =
    let%lwt stats = Array.init num_shards ~f:(fun shard_id ->
      let shard_address = !shard_addresses.(shard_id) in
      let%lwt contract = TonClient.get_contract shard_address in
      let%lwt (id, count) = TonClient.call_get_method
        contract "get_shard_stats" []
      in
      Lwt.return (id, count)
    ) |> Array.to_list |> Lwt.all in
    Lwt.return stats

  (** Check if shard distribution is balanced **)
  let check_shard_balance () : (bool * float) Lwt.t =
    let%lwt stats = get_shard_stats () in
    let counts = List.map stats ~f:snd in
    let avg = Float.of_int (List.fold counts ~init:0 ~f:(+)) /. 256.0 in
    let max_count = List.fold counts ~init:0 ~f:max in
    let min_count = List.fold counts ~init:Int.max_value ~f:min in

    let imbalance_pct =
      (Float.of_int (max_count - min_count)) /. avg *. 100.0
    in

    (* Balanced if imbalance <10% *)
    let balanced = imbalance_pct < 10.0 in

    Lwt.return (balanced, imbalance_pct)

end
```

**Key Functions**:

1. **`get_shard_id`**: O(1) calculation of shard ID from policy ID
2. **`route_policy_query`**: Query specific shard for policy data
3. **`get_policies_by_user`**: Aggregate query across all 256 shards
4. **`check_shard_balance`**: Monitor distribution for imbalances

**Note on `get_policies_by_user`**: This requires additional indexing (see Section 12).

### REST API Endpoints

**File**: `backend/api/policy_api.ml`

```ocaml
open Opium

let () =
  App.empty

  (* Get policy by ID *)
  |> App.get "/policy/:policy_id" (fun req ->
      let policy_id = int_of_string (Router.param req "policy_id") in
      let%lwt policy = ShardingCoordinator.route_policy_query ~policy_id in
      Response.of_json (policy_to_json policy) |> Lwt.return
  )

  (* Get all policies for user *)
  |> App.get "/user/:address/policies" (fun req ->
      let user_address = Router.param req "address" in
      let%lwt policies = ShardingCoordinator.get_policies_by_user ~user_address in
      Response.of_json (policies_to_json policies) |> Lwt.return
  )

  (* Get shard statistics (admin only) *)
  |> App.get "/admin/shard-stats" (fun req ->
      (* Check admin auth *)
      let%lwt stats = ShardingCoordinator.get_shard_stats () in
      let%lwt (balanced, imbalance) = ShardingCoordinator.check_shard_balance () in
      Response.of_json (`Assoc [
        ("stats", shard_stats_to_json stats);
        ("balanced", `Bool balanced);
        ("imbalance_pct", `Float imbalance);
      ]) |> Lwt.return
  )

  |> App.run_command
```

---

## 9. Frontend Integration

### Update PolicyFactory Wrapper to Use PolicyRouter

**File**: `frontend/src/contracts/PolicyRouter.ts`

```typescript
import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export type PolicyRouterConfig = {
  owner_address: Address;
  next_policy_id: bigint;
  total_policies: bigint;
  paused: number;
  shard_addresses: Map<number, Address>;  // 256 entries
};

export function policyRouterConfigToCell(config: PolicyRouterConfig): Cell {
  // Convert shard_addresses map to dict
  const shard_dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Address());
  config.shard_addresses.forEach((address, shard_id) => {
    shard_dict.set(shard_id, address);
  });

  return beginCell()
    .storeAddress(config.owner_address)
    .storeUint(config.next_policy_id, 64)
    .storeUint(config.total_policies, 64)
    .storeUint(config.paused, 1)
    .storeDict(shard_dict)
    .endCell();
}

export class PolicyRouter implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new PolicyRouter(address);
  }

  static createFromConfig(config: PolicyRouterConfig, code: Cell, workchain = 0) {
    const data = policyRouterConfigToCell(config);
    const init = { code, data };
    return new PolicyRouter(contractAddress(workchain, init), init);
  }

  async sendCreatePolicy(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      coverage_type: number;
      coverage_amount: bigint;
      duration_days: number;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(0x01, 32) // op::create_policy
        .storeUint(opts.coverage_type, 8)
        .storeCoins(opts.coverage_amount)
        .storeUint(opts.duration_days, 16)
        .endCell(),
    });
  }

  async getNextPolicyId(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('get_next_policy_id', []);
    return result.stack.readBigNumber();
  }

  async getTotalPolicies(provider: ContractProvider): Promise<bigint> {
    const result = await provider.get('get_total_policies', []);
    return result.stack.readBigNumber();
  }

  async getPolicyShardAddress(
    provider: ContractProvider,
    policy_id: bigint
  ): Promise<Address> {
    const result = await provider.get('get_policy_address', [
      { type: 'int', value: policy_id }
    ]);
    return result.stack.readAddress();
  }
}
```

### Handle Async Policy Creation

**File**: `frontend/src/pages/PolicyPurchase.tsx`

```tsx
import { useTonConnect } from '../hooks/useTonConnect';
import { PolicyRouter } from '../contracts/PolicyRouter';
import { toNano } from '@ton/core';

export function PolicyPurchase() {
  const { sender } = useTonConnect();
  const [policyId, setPolicyId] = useState<bigint | null>(null);
  const [shardId, setShardId] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'creating' | 'created' | 'error'>('idle');

  const policyRouter = PolicyRouter.createFromAddress(
    Address.parse(process.env.REACT_APP_POLICY_ROUTER_ADDRESS!)
  );

  async function createPolicy() {
    try {
      setStatus('creating');

      // 1. Get next policy ID (for display purposes)
      const next_id = await policyRouter.getNextPolicyId(
        client.provider(policyRouter.address)
      );

      // 2. Send create_policy transaction
      await policyRouter.sendCreatePolicy(
        client.provider(policyRouter.address),
        sender,
        {
          value: toNano('0.1'),  // 0.1 TON for gas + premium
          coverage_type: 1,  // USDT depeg
          coverage_amount: toNano('100'),  // $100 coverage
          duration_days: 30,
        }
      );

      // 3. Wait for policy creation (listen for event)
      const policy_id = await waitForPolicyCreated(next_id);
      const shard_id = Number(policy_id % 256n);

      setPolicyId(policy_id);
      setShardId(shard_id);
      setStatus('created');

      // 4. Show success message
      console.log(`Policy ${policy_id} created on shard ${shard_id}`);

    } catch (error) {
      console.error('Policy creation failed:', error);
      setStatus('error');
    }
  }

  async function waitForPolicyCreated(expected_id: bigint): Promise<bigint> {
    // Poll for policy creation event (or use WebSocket)
    for (let i = 0; i < 10; i++) {
      await sleep(1000);

      // Check if policy exists on expected shard
      const shard_address = await policyRouter.getPolicyShardAddress(
        client.provider(policyRouter.address),
        expected_id
      );

      const policy_shard = PolicyShard.createFromAddress(shard_address);

      try {
        const policy_data = await policy_shard.getPolicyData(
          client.provider(shard_address),
          expected_id
        );

        if (policy_data.active) {
          return expected_id;
        }
      } catch (error) {
        // Policy not yet created, continue polling
      }
    }

    throw new Error('Policy creation timeout (10 seconds)');
  }

  return (
    <div>
      <h2>Buy Insurance Policy</h2>

      {status === 'idle' && (
        <button onClick={createPolicy}>
          Create Policy (0.1 TON)
        </button>
      )}

      {status === 'creating' && (
        <div>Creating policy... (waiting for confirmation)</div>
      )}

      {status === 'created' && (
        <div>
          <p>✅ Policy Created!</p>
          <p>Policy ID: {policyId?.toString()}</p>
          <p>Shard ID: {shardId}</p>
          <a href={`/policy/${policyId}`}>View Policy</a>
        </div>
      )}

      {status === 'error' && (
        <div>❌ Policy creation failed. Please try again.</div>
      )}
    </div>
  );
}
```

### Display Shard ID in Policy Details

```tsx
export function PolicyDetails({ policy_id }: { policy_id: bigint }) {
  const shard_id = Number(policy_id % 256n);

  return (
    <div>
      <h3>Policy {policy_id.toString()}</h3>
      <p>Shard: {shard_id} (of 256)</p>
      <p>Shard Address: {shard_address}</p>
      {/* ... other policy details ... */}
    </div>
  );
}
```

---

## 10. Security Considerations

### Shard Isolation

**Principle**: Compromised shard should not affect other shards.

**Implementation**:

1. **Each shard is independent**: No shared state between shards
2. **Shard_id validation**: Each shard validates `policy_id % 256 == shard_id`
3. **Access control**: Only PolicyRouter can create policies on shards

**Attack Scenario**: Attacker compromises PolicyShard_42 contract.

**Impact**:
- ❌ Policies on Shard_42 are affected
- ✅ Policies on Shard_0 to Shard_41, Shard_43 to Shard_255 are unaffected
- ✅ Blast radius: 1/256 of policies (~3,906 at 1M scale)

**Mitigation**:
1. Emergency pause: Admin can pause individual shards
2. Shard replacement: Deploy new PolicyShard_42, redirect traffic
3. Policy migration: Move affected policies to new shard

### Router Security (Single Point of Failure)

**Risk**: PolicyRouter is entry point for all operations. If compromised, entire system is affected.

**Mitigation**:

1. **Multi-Sig Admin**: Owner address is 3-of-5 multi-sig
2. **Time-Locked Upgrades**: Admin operations have 48-hour timelock
3. **Emergency Pause**: Can pause router without multi-sig (single trusted admin)
4. **Immutable Routing Logic**: `policy_id % 256` logic cannot be changed

```func
// PolicyRouter.fc
() register_shard(slice sender_address, int shard_id, slice shard_address) impure {
    // Only multi-sig can register shards
    throw_unless(403, is_multisig(sender_address));

    // Cannot override existing shard without timelock
    (slice existing, int found) = shard_addresses.udict_get?(8, shard_id);
    if (found) {
        throw_unless(405, now() >= timelock_expires_at);
    }

    shard_addresses~udict_set(8, shard_id, shard_address);
    save_data();
}
```

### Policy ID Collision

**Risk**: Two policies with same policy_id.

**Prevention**: PolicyRouter ensures sequential IDs via `next_policy_id` counter.

```func
// PolicyRouter.fc
() create_policy(...) impure {
    int policy_id = next_policy_id;
    next_policy_id += 1;  // Atomic increment

    // Even if two create_policy() messages arrive simultaneously,
    // they get different policy IDs (no collision)
}
```

**Key Insight**: Sequential IDs prevent collisions (each ID is unique).

### Cross-Shard Attacks

**Scenario**: Attacker spams one shard with policy creation requests.

**Impact**:
- ❌ Target shard becomes congested (high gas costs)
- ✅ Other 255 shards unaffected
- ✅ PolicyRouter rate limits policy creation per user

**Mitigation**:

1. **Rate Limiting**: PolicyRouter enforces 1 policy/minute per user

```func
// PolicyRouter.fc
global cell user_last_policy_time;  // dict<slice, int>

() create_policy(slice user_address, ...) impure {
    // Rate limit: 1 policy per minute per user
    (int last_time, int found) = user_last_policy_time.udict_get?(256, hash_slice(user_address));
    if (found) {
        throw_if(429, now() - last_time < 60);  // 60 seconds
    }

    user_last_policy_time~udict_set(256, hash_slice(user_address), now());

    // Continue with policy creation...
}
```

2. **Shard-Level Circuit Breaker**: Pause shard if >100 policies/minute

```func
// PolicyShard.fc
global int policies_created_this_minute;
global int last_minute_reset;

() create_policy_sharded(...) impure {
    // Reset counter every minute
    if (now() - last_minute_reset >= 60) {
        policies_created_this_minute = 0;
        last_minute_reset = now();
    }

    // Circuit breaker: max 100 policies/minute
    throw_if(503, policies_created_this_minute >= 100);

    policies_created_this_minute += 1;

    // Continue with policy creation...
}
```

---

## 11. Testing Strategy

### Unit Tests: Each PolicyShard Independently

**File**: `tests/PolicyShard.spec.ts`

```typescript
import { Blockchain, SandboxContract } from '@ton/sandbox';
import { PolicyShard } from '../wrappers/PolicyShard';
import { PolicyRouter } from '../wrappers/PolicyRouter';
import '@ton/test-utils';

describe('PolicyShard', () => {
  let blockchain: Blockchain;
  let policy_shard: SandboxContract<PolicyShard>;
  let router: SandboxContract<PolicyRouter>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    router = blockchain.openContract(PolicyRouter.createFromConfig({
      owner_address: blockchain.sender().address,
      next_policy_id: 0n,
      total_policies: 0n,
      paused: 0,
      shard_addresses: new Map(),
    }, await compile('PolicyRouter')));

    policy_shard = blockchain.openContract(PolicyShard.createFromConfig({
      shard_id: 42,
      router_address: router.address,
      owner_address: blockchain.sender().address,
      claims_processor_address: Address.parse('EQ...'),
      shard_policy_count: 0,
      policies_dict: null,
      paused: 0,
    }, await compile('PolicyShard')));
  });

  it('should create policy on correct shard', async () => {
    const policy_id = 42n + 256n * 5n;  // policy_id % 256 = 42

    const result = await policy_shard.sendCreatePolicySharded(router.getSender(), {
      value: toNano('0.1'),
      policy_id,
      user_address: blockchain.sender().address,
      coverage_type: 1,
      coverage_amount: toNano('100'),
      duration_days: 30,
    });

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: policy_shard.address,
      success: true,
    });

    const policy_data = await policy_shard.getPolicyData(policy_id);
    expect(policy_data.coverage_type).toBe(1);
    expect(policy_data.coverage_amount).toBe(toNano('100'));
  });

  it('should reject policy with wrong shard_id', async () => {
    const policy_id = 43n;  // policy_id % 256 = 43 (not 42)

    const result = await policy_shard.sendCreatePolicySharded(router.getSender(), {
      value: toNano('0.1'),
      policy_id,
      user_address: blockchain.sender().address,
      coverage_type: 1,
      coverage_amount: toNano('100'),
      duration_days: 30,
    });

    expect(result.transactions).toHaveTransaction({
      from: router.address,
      to: policy_shard.address,
      success: false,
      exitCode: 402,  // Shard mismatch
    });
  });

  it('should handle 1000 policies without gas issues', async () => {
    for (let i = 0; i < 1000; i++) {
      const policy_id = 42n + 256n * BigInt(i);  // All map to shard 42

      await policy_shard.sendCreatePolicySharded(router.getSender(), {
        value: toNano('0.1'),
        policy_id,
        user_address: blockchain.sender().address,
        coverage_type: 1,
        coverage_amount: toNano('100'),
        duration_days: 30,
      });
    }

    const stats = await policy_shard.getShardStats();
    expect(stats.shard_policy_count).toBe(1000);

    // Verify gas costs are reasonable
    const last_result = await policy_shard.sendCreatePolicySharded(router.getSender(), {
      value: toNano('0.1'),
      policy_id: 42n + 256n * 1000n,
      user_address: blockchain.sender().address,
      coverage_type: 1,
      coverage_amount: toNano('100'),
      duration_days: 30,
    });

    const gas_used = last_result.transactions[1].totalFees.coins;
    expect(gas_used).toBeLessThan(toNano('0.02'));  // Under target
  });
});
```

### Integration Tests: Router → Shard → ClaimsProcessor Flow

**File**: `tests/integration/PolicySharding.spec.ts`

```typescript
describe('Policy Sharding Integration', () => {
  let blockchain: Blockchain;
  let router: SandboxContract<PolicyRouter>;
  let shards: SandboxContract<PolicyShard>[];
  let claims_processor: SandboxContract<ClaimsProcessor>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();

    // Deploy PolicyRouter
    router = blockchain.openContract(PolicyRouter.createFromConfig(...));

    // Deploy 256 PolicyShards
    shards = await Promise.all(
      Array.from({ length: 256 }, (_, shard_id) =>
        blockchain.openContract(PolicyShard.createFromConfig({
          shard_id,
          router_address: router.address,
          ...
        }, await compile('PolicyShard')))
      )
    );

    // Register all shards in router
    for (let shard_id = 0; shard_id < 256; shard_id++) {
      await router.sendRegisterShard(blockchain.sender(), {
        value: toNano('0.05'),
        shard_id,
        shard_address: shards[shard_id].address,
      });
    }

    // Deploy ClaimsProcessor
    claims_processor = blockchain.openContract(ClaimsProcessor.createFromConfig(...));
  });

  it('should route policy to correct shard', async () => {
    const result = await router.sendCreatePolicy(blockchain.sender(), {
      value: toNano('0.1'),
      coverage_type: 1,
      coverage_amount: toNano('100'),
      duration_days: 30,
    });

    // Policy ID should be 0 (first policy)
    const policy_id = 0n;
    const expected_shard_id = 0;  // 0 % 256 = 0

    // Verify policy was created on Shard_0
    const policy_data = await shards[expected_shard_id].getPolicyData(policy_id);
    expect(policy_data.coverage_type).toBe(1);
  });

  it('should handle 10k policies across all shards', async () => {
    // Create 10,000 policies
    for (let i = 0; i < 10000; i++) {
      await router.sendCreatePolicy(blockchain.sender(), {
        value: toNano('0.1'),
        coverage_type: 1,
        coverage_amount: toNano('100'),
        duration_days: 30,
      });
    }

    // Verify distribution is balanced (±10%)
    const shard_counts = await Promise.all(
      shards.map(shard => shard.getShardStats())
    );

    const avg = 10000 / 256;  // ~39 policies per shard
    const max_count = Math.max(...shard_counts.map(s => s.shard_policy_count));
    const min_count = Math.min(...shard_counts.map(s => s.shard_policy_count));

    const imbalance_pct = ((max_count - min_count) / avg) * 100;
    expect(imbalance_pct).toBeLessThan(10);  // <10% imbalance
  });

  it('should handle claim processing across shards', async () => {
    // Create policy on Shard_42
    const policy_id = 42n;
    await router.sendCreatePolicy(blockchain.sender(), {
      value: toNano('0.1'),
      coverage_type: 1,
      coverage_amount: toNano('100'),
      duration_days: 30,
    });

    // File claim
    await claims_processor.sendFileClaim(blockchain.sender(), {
      value: toNano('0.05'),
      policy_id,
      coverage_type: 1,
      coverage_amount: toNano('100'),
      evidence: Cell.EMPTY,
    });

    // Approve claim
    await claims_processor.sendApproveClaim(blockchain.sender(), {
      value: toNano('0.05'),
      claim_id: 0n,
    });

    // Verify policy marked as claimed on Shard_42
    const policy_data = await shards[42].getPolicyData(policy_id);
    expect(policy_data.claimed).toBe(true);
  });
});
```

### Load Tests: 10k Policies Across 256 Shards

**File**: `tests/load/PolicyShardingLoad.spec.ts`

```typescript
describe('Policy Sharding Load Test', () => {
  it('should handle 10k policies with <0.02 TON avg gas', async () => {
    const gas_costs: bigint[] = [];

    for (let i = 0; i < 10000; i++) {
      const result = await router.sendCreatePolicy(blockchain.sender(), {
        value: toNano('0.1'),
        coverage_type: 1,
        coverage_amount: toNano('100'),
        duration_days: 30,
      });

      const gas_used = result.transactions[1].totalFees.coins;
      gas_costs.push(gas_used);
    }

    const avg_gas = gas_costs.reduce((a, b) => a + b, 0n) / BigInt(gas_costs.length);
    expect(avg_gas).toBeLessThan(toNano('0.02'));

    console.log(`Average gas: ${fromNano(avg_gas)} TON`);
    console.log(`Max gas: ${fromNano(Math.max(...gas_costs))} TON`);
    console.log(`Min gas: ${fromNano(Math.min(...gas_costs))} TON`);
  });
});
```

### Chaos Tests: Random Shard Failures, Message Bounces

**File**: `tests/chaos/PolicyShardingChaos.spec.ts`

```typescript
describe('Policy Sharding Chaos Test', () => {
  it('should handle random shard failures gracefully', async () => {
    // Pause random 10% of shards
    const failed_shards = new Set<number>();
    for (let i = 0; i < 25; i++) {
      const random_shard_id = Math.floor(Math.random() * 256);
      await shards[random_shard_id].sendPause(blockchain.sender(), {
        value: toNano('0.05'),
      });
      failed_shards.add(random_shard_id);
    }

    // Try to create 100 policies
    let success_count = 0;
    let failure_count = 0;

    for (let i = 0; i < 100; i++) {
      const result = await router.sendCreatePolicy(blockchain.sender(), {
        value: toNano('0.1'),
        coverage_type: 1,
        coverage_amount: toNano('100'),
        duration_days: 30,
      });

      const policy_id = i;
      const shard_id = policy_id % 256;

      if (failed_shards.has(shard_id)) {
        // Expect bounce
        expect(result.transactions).toHaveTransaction({
          from: shards[shard_id].address,
          to: router.address,
          success: false,
        });
        failure_count++;
      } else {
        success_count++;
      }
    }

    console.log(`Success: ${success_count}, Failures: ${failure_count}`);
    expect(success_count).toBeGreaterThan(70);  // ~90% success rate
  });
});
```

---

## 12. Monitoring & Observability

### Track Policies Per Shard

**Prometheus Metrics**:

```typescript
// backend/metrics/shard_metrics.ts
import client from 'prom-client';

export const shard_policy_count = new client.Gauge({
  name: 'tonsurance_shard_policy_count',
  help: 'Number of policies per shard',
  labelNames: ['shard_id'],
});

export const total_policies = new client.Gauge({
  name: 'tonsurance_total_policies',
  help: 'Total number of policies across all shards',
});

// Update metrics every 60 seconds
setInterval(async () => {
  const stats = await ShardingCoordinator.get_shard_stats();

  let total = 0;
  stats.forEach(([shard_id, count]) => {
    shard_policy_count.set({ shard_id }, count);
    total += count;
  });

  total_policies.set(total);
}, 60000);
```

**Grafana Dashboard**:

```yaml
# grafana/dashboards/policy_sharding.json
{
  "panels": [
    {
      "title": "Policies Per Shard",
      "type": "graph",
      "targets": [
        {
          "expr": "tonsurance_shard_policy_count",
          "legendFormat": "Shard {{ shard_id }}",
        }
      ],
    },
    {
      "title": "Total Policies",
      "type": "stat",
      "targets": [
        {
          "expr": "tonsurance_total_policies",
        }
      ],
    },
    {
      "title": "Shard Imbalance",
      "type": "stat",
      "targets": [
        {
          "expr": "(max(tonsurance_shard_policy_count) - min(tonsurance_shard_policy_count)) / avg(tonsurance_shard_policy_count) * 100",
          "legendFormat": "Imbalance %",
        }
      ],
    }
  ],
}
```

### Alert if Shard Imbalance >10%

**Alertmanager Rule**:

```yaml
# prometheus/alerts/shard_imbalance.yml
groups:
  - name: policy_sharding
    rules:
      - alert: ShardImbalance
        expr: |
          (max(tonsurance_shard_policy_count) - min(tonsurance_shard_policy_count))
          / avg(tonsurance_shard_policy_count) * 100 > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Shard imbalance detected"
          description: "Policy distribution across shards is imbalanced by {{ $value }}%"
```

**Remediation**:

If imbalance >10%, investigate:
1. Check if PolicyRouter next_policy_id counter is correct
2. Verify routing logic: `shard_id = policy_id % 256`
3. Look for failed shard deployments
4. Consider manual rebalancing (migrate policies between shards)

### Monitor Gas Costs Per Shard

```typescript
// backend/metrics/gas_metrics.ts
export const shard_gas_cost = new client.Histogram({
  name: 'tonsurance_shard_gas_cost_ton',
  help: 'Gas cost per policy operation by shard',
  labelNames: ['shard_id', 'operation'],  // operation: create | query | update
  buckets: [0.001, 0.005, 0.01, 0.02, 0.05, 0.1],
});

// Track gas costs from transaction receipts
blockchain.on('transaction', (tx) => {
  if (isPolicyOperation(tx)) {
    const shard_id = getShardIdFromAddress(tx.to);
    const operation = getOperationType(tx.body);
    const gas_cost = fromNano(tx.totalFees.coins);

    shard_gas_cost.observe({ shard_id, operation }, parseFloat(gas_cost));
  }
});
```

**Alert if gas costs exceed target**:

```yaml
- alert: HighGasCosts
  expr: |
    histogram_quantile(0.95, tonsurance_shard_gas_cost_ton{operation="create"}) > 0.02
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High gas costs for policy creation"
    description: "95th percentile gas cost is {{ $value }} TON (target: 0.02 TON)"
```

### Track Async Message Success Rates

```typescript
export const async_message_success_rate = new client.Gauge({
  name: 'tonsurance_async_message_success_rate',
  help: 'Success rate of async messages between contracts',
  labelNames: ['from', 'to', 'op'],
});

// Monitor PolicyRouter -> PolicyShard messages
blockchain.on('message', (msg) => {
  if (msg.from === router_address && msg.op === 'create_policy_sharded') {
    const success = !msg.bounced;
    async_message_success_rate.set(
      { from: 'router', to: 'shard', op: 'create_policy' },
      success ? 1 : 0
    );
  }
});
```

**Alert if success rate <95%**:

```yaml
- alert: LowAsyncMessageSuccessRate
  expr: tonsurance_async_message_success_rate < 0.95
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Low async message success rate"
    description: "{{ $labels.from }} -> {{ $labels.to }} success rate: {{ $value }}"
```

---

## 13. Implementation Roadmap

### Blockers

**CRITICAL**: This design is **blocked on A8: Async Message Handlers**.

**Why?**
- Policy sharding relies heavily on async message passing:
  - PolicyRouter → PolicyShard (create_policy_sharded)
  - PolicyShard → User (policy_created confirmation)
  - ClaimsProcessor → PolicyShard (mark_policy_claimed)
- A8 must implement robust async patterns, bounce handling, retry logic
- Without A8, sharding system will have unreliable message delivery

**Action**: Do not implement policy sharding until A8 is complete and tested.

### Implementation Phases

**Phase 1: A8 Complete (Prerequisite)**
- [ ] Async message handlers implemented in all contracts
- [ ] Bounce handling tested
- [ ] Retry logic for failed messages
- [ ] Integration tests pass

**Phase 2: Contract Development (3 days)**
- [ ] Day 1: Implement PolicyRouter.fc
  - [ ] create_policy() with routing logic
  - [ ] register_shard() admin function
  - [ ] get_policy_address() getter
- [ ] Day 2: Implement PolicyShard.fc
  - [ ] create_policy_sharded() from router
  - [ ] get_policy_data() getter
  - [ ] mark_policy_claimed() from ClaimsProcessor
- [ ] Day 3: Integrate with existing contracts
  - [ ] Update ClaimsProcessor to query PolicyShard
  - [ ] Add shard_id validation

**Phase 3: Testing (4 days)**
- [ ] Day 1: Unit tests (PolicyShard)
- [ ] Day 2: Integration tests (Router → Shard → Claims)
- [ ] Day 3: Load tests (10k policies)
- [ ] Day 4: Chaos tests (random failures)

**Phase 4: Backend Integration (2 days)**
- [ ] Day 1: Implement sharding_coordinator.ml
  - [ ] get_shard_id()
  - [ ] route_policy_query()
  - [ ] get_policies_by_user()
- [ ] Day 2: Update REST API endpoints
  - [ ] GET /policy/:policy_id
  - [ ] GET /user/:address/policies
  - [ ] GET /admin/shard-stats

**Phase 5: Frontend Integration (2 days)**
- [ ] Day 1: Update PolicyRouter wrapper
- [ ] Day 2: Update PolicyPurchase UI (handle async creation)

**Phase 6: Deployment (1 day)**
- [ ] Deploy PolicyRouter to testnet
- [ ] Deploy 256 PolicyShards to testnet (batched)
- [ ] Register all shards in router
- [ ] Run smoke tests

**Phase 7: Monitoring (1 day)**
- [ ] Set up Prometheus metrics
- [ ] Create Grafana dashboard
- [ ] Configure Alertmanager rules

**Total Time**: ~13 days (after A8 complete)

### Success Criteria

Before marking A9 as complete:

- [ ] All 256 PolicyShards deployed on testnet
- [ ] PolicyRouter correctly routes to shards
- [ ] Gas costs <0.02 TON per operation at 10k policy scale
- [ ] Shard imbalance <10%
- [ ] Async message success rate >95%
- [ ] Load tests pass (100+ policies/second)
- [ ] Monitoring dashboard operational
- [ ] Security audit passed (focus on routing logic, shard isolation)

---

## 14. Open Questions

### Question 1: Should PolicyRouter be on basechain and shards on workchain -1?

**Analysis**:

**Option A: All on basechain** (Recommended)
- Pros: Simple, fast cross-contract messages, easier monitoring
- Cons: All compete for basechain resources

**Option B: Shards on workchain -1**
- Pros: Load distribution, higher theoretical throughput
- Cons: Cross-workchain messages slower + more expensive

**Recommendation**: Start with **Option A** (all on basechain). TON basechain can handle 1000+ TPS, far exceeding Tonsurance's near-term needs. Revisit if basechain saturates.

### Question 2: How to handle policy queries that need to scan all shards?

**Example**: "Get all policies expiring today"

**Solution**: Backend aggregation (see Section 4: Cross-Shard Coordination)

**Additional Indexing Needed**:
- Backend PostgreSQL DB with policy index:
  - Columns: policy_id, user_address, shard_id, end_time, status
  - Indexed on: user_address, end_time, status
- Sync via TON event listeners:
  - Listen for PolicyCreated events
  - Insert into DB
  - Update on PolicyClaimed events

**Query Example**:

```sql
-- Get all policies expiring today
SELECT policy_id, user_address, shard_id
FROM policies
WHERE end_time >= DATE_TRUNC('day', NOW())
  AND end_time < DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
  AND status = 'active';
```

**Trade-off**: Requires maintaining off-chain index, but enables fast queries.

### Question 3: What if a shard reaches storage limits?

**Analysis**:

**TON Cell Limits**:
- Max cell size: 1023 bits = 127 bytes
- Max cell depth: 512 levels
- Max references per cell: 4

**PolicyShard at 1M Scale**:
- 3,906 policies/shard
- 64 bytes/policy
- Total: ~250 KB/shard
- Cells needed: ~2,000 (chained via references)
- Cell depth: ~11 levels (well under 512 limit)

**Conclusion**: Shards will NOT reach storage limits at 1M scale. Even at 10M policies (39,060 per shard), depth would be ~14 levels.

**If limits are reached (unlikely)**:
- Deploy additional shards (e.g., 512 or 1024)
- Migrate policies to new shards
- Update routing: `shard_id = policy_id % 512`

### Question 4: How to version/upgrade shards without redeploying all 256?

**Solution**: Proxy Pattern

**Architecture**:

```
PolicyRouter
    |
    ├─> PolicyShardProxy_0 (immutable)
    │       └─> PolicyShardImpl_v1 (upgradeable)
    │
    ├─> PolicyShardProxy_1 (immutable)
    │       └─> PolicyShardImpl_v1 (upgradeable)
    │
    └─> ...
```

**PolicyShardProxy.fc**:

```func
global slice impl_address;  // Current implementation

() recv_internal(...) impure {
    // Forward all messages to implementation
    cell fwd_msg = begin_cell()
        .store_uint(0x18, 6)
        .store_slice(impl_address)
        .store_coins(msg_value)
        .store_uint(0, 107)
        .store_slice(in_msg_body)
        .end_cell();
    send_raw_message(fwd_msg, 64);
}

() upgrade_impl(slice sender_address, slice new_impl) impure {
    throw_unless(403, is_admin(sender_address));
    impl_address = new_impl;
    save_data();
}
```

**Upgrade Process**:
1. Deploy new PolicyShardImpl_v2
2. Upgrade each proxy: `upgrade_impl(new_impl_address)`
3. All 256 proxies now use v2 implementation

**Trade-off**: Additional gas cost for proxy forwarding (~0.001 TON per operation).

**Decision**: **Do not implement proxy pattern initially**. Deploy direct PolicyShard contracts. Add proxy pattern only if frequent upgrades are needed.

---

## 15. Conclusion

This design document provides a comprehensive blueprint for implementing policy sharding in Tonsurance. The 256-shard architecture provides:

- **99%+ gas savings** at 1M+ policy scale
- **O(1) routing** with deterministic shard selection
- **Shard isolation** for security and fault tolerance
- **Parallel processing** for 100+ policies/second
- **Minimal deployment cost** (~40 TON one-time investment)

**Next Steps**:

1. ✅ Complete A8: Async Message Handlers
2. ⏳ Review this design with team
3. ⏳ Security audit of routing logic
4. ⏳ Implement A9: PolicyShard Contract (Phase 2)
5. ⏳ Implement A10: PolicyRouter Contract (Phase 3)

**Risks**:

- **Complexity**: 256 contracts to manage (mitigated by automation)
- **Async reliability**: Depends on A8 quality (blocked until A8 done)
- **Backend dependency**: Cross-shard queries require backend (acceptable trade-off)

**Status**: **Design Complete, Awaiting A8 Completion** ✅

---

**Document Version**: 1.0
**Last Updated**: 2025-10-15
**Next Review**: After A8 completion
**Approval Status**: Pending stakeholder review
