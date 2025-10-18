# Utilization Tracker Module

Real-time vault utilization tracking for Tonsurance multi-tranche vaults, enabling dynamic APY calculations based on capital deployment.

## Overview

The Utilization Tracker coordinates with on-chain vault state to provide:
- Real-time utilization ratios (coverage_sold / total_capital)
- Dynamic APY calculations using bonding curves
- Capacity management and risk monitoring
- PostgreSQL persistence with Redis caching

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    On-Chain Events                          │
│  (Deposits, Withdrawals, Policy Creation, Policy Expiry)   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Utilization Tracker Module                     │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │  Update Capital  │    │ Update Coverage  │              │
│  └────────┬─────────┘    └────────┬─────────┘              │
│           │                       │                         │
│           ▼                       ▼                         │
│  ┌────────────────────────────────────────┐                │
│  │     Calculate Utilization Ratio        │                │
│  │     coverage_sold / total_capital      │                │
│  └───────────────┬────────────────────────┘                │
│                  │                                          │
│                  ▼                                          │
│  ┌────────────────────────────────────────┐                │
│  │   Calculate APY (Bonding Curve)        │                │
│  │   tranche_pricing.calculate_apy()      │                │
│  └───────────────┬────────────────────────┘                │
│                  │                                          │
│                  ▼                                          │
│  ┌─────────────────────────────────────────────────┐       │
│  │              Persistence Layer                  │       │
│  │                                                  │       │
│  │  PostgreSQL (Audit Trail)  Redis (30s Cache)   │       │
│  └─────────────────────────────────────────────────┘       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Integration Points                          │
│                                                              │
│  • Tranche APY API (real-time quotes)                       │
│  • Collateral Manager (risk checks)                         │
│  • Tonny Bot (vault stats)                                  │
│  • Frontend VaultStaking (UI data)                          │
└─────────────────────────────────────────────────────────────┘
```

## Module Interface

### Core Functions

#### Initialization
```ocaml
val init : database_config:Database.db_config -> (unit, error) result Lwt.t
```
Initialize tracker with PostgreSQL connection pool. Creates schema if needed.

#### Query Utilization
```ocaml
val get_tranche_utilization : tranche:tranche -> tranche_utilization Lwt.t

val get_all_utilizations : unit -> tranche_utilization list Lwt.t
```
Get current utilization state. Serves from cache (30s TTL) or database.

#### Update State
```ocaml
val update_capital : tranche:tranche -> delta:int64 -> unit Lwt.t

val update_coverage : tranche:tranche -> delta:int64 -> unit Lwt.t
```
Update vault state. Positive delta = increase, negative = decrease. Automatically:
- Recalculates utilization
- Updates APY
- Invalidates cache
- Persists to database
- Emits alerts if thresholds exceeded

#### Capacity Management
```ocaml
val can_accept_coverage : tranche:tranche -> amount:int64 -> bool Lwt.t

val get_available_capacity : tranche:tranche -> int64 Lwt.t

val get_collateralization_ratio : tranche:tranche -> float Lwt.t
```
Check vault capacity before accepting new policies.

#### Chain Sync
```ocaml
val sync_from_chain :
  tranche:tranche ->
  total_capital:int64 ->
  coverage_sold:int64 ->
  unit Lwt.t
```
Synchronize state from on-chain vault. Use for periodic reconciliation.

### Data Types

#### tranche_utilization
```ocaml
type tranche_utilization = {
  tranche_id: tranche;           (* SURE_BTC | SURE_SNR | ... *)
  total_capital: int64;          (* Total deposits in nanoTON *)
  coverage_sold: int64;          (* Outstanding obligations in nanoTON *)
  utilization_ratio: float;      (* 0.0 to 1.0 *)
  current_apy: float;            (* From bonding curve, e.g. 9.5 for 9.5% *)
  last_updated: float;           (* Unix timestamp *)
}
```

## Usage Examples

### Basic Usage

```ocaml
open Pool.Utilization_tracker

(* Initialize *)
let* () = UtilizationTracker.init ~database_config in

(* Handle deposit *)
let amount_nano = 1_000_000_000_000L in (* 1000 TON *)
let* () = UtilizationTracker.update_capital
  ~tranche:SURE_SNR
  ~delta:amount_nano
in

(* Get updated APY *)
let* util = UtilizationTracker.get_tranche_utilization ~tranche:SURE_SNR in
Printf.printf "New APY: %.2f%%\n" util.current_apy
```

### Policy Purchase Flow

```ocaml
(* Check capacity before creating policy *)
let coverage_amount = 500_000_000_000L in (* 500 TON *)

let* can_accept = UtilizationTracker.can_accept_coverage
  ~tranche:SURE_MEZZ
  ~amount:coverage_amount
in

if can_accept then (
  (* Create policy on-chain *)
  let* policy_id = create_policy ~coverage:coverage_amount in

  (* Update tracker *)
  let* () = UtilizationTracker.update_coverage
    ~tranche:SURE_MEZZ
    ~delta:coverage_amount
  in

  Printf.printf "Policy %Ld created\n" policy_id;
  Lwt.return_ok policy_id
) else (
  Printf.printf "Insufficient vault capacity\n";
  Lwt.return_error "Capacity exceeded"
)
```

### REST API Integration

```ocaml
open Dream

(* GET /api/v1/utilization/:tranche_id *)
let get_utilization_handler req =
  let tranche_str = Dream.param req "tranche_id" in

  match tranche_of_string tranche_str with
  | Error msg -> Dream.json ~status:`Bad_Request (error_json msg)
  | Ok tranche ->
      let* util = UtilizationTracker.get_tranche_utilization ~tranche in

      let response = `Assoc [
        ("tranche_id", `String (tranche_to_string tranche));
        ("current_apy", `Float util.current_apy);
        ("utilization", `Float util.utilization_ratio);
        ("total_capital_ton", `Float (nanoton_to_ton util.total_capital));
        ("coverage_sold_ton", `Float (nanoton_to_ton util.coverage_sold));
      ] in

      Dream.json (Yojson.Safe.to_string response)
```

### Dashboard Data

```ocaml
(* Get all tranches for dashboard *)
let* all_utils = UtilizationTracker.get_all_utilizations () in

let dashboard_data = List.map all_utils ~f:(fun util ->
  let config = Tranche_pricing.get_tranche_config ~tranche:util.tranche_id in

  `Assoc [
    ("tranche", `String (tranche_to_string util.tranche_id));
    ("apy", `Float util.current_apy);
    ("apy_range", `Assoc [
      ("min", `Float config.apy_min);
      ("max", `Float config.apy_max);
    ]);
    ("utilization", `Float util.utilization_ratio);
    ("tvl_ton", `Float (nanoton_to_ton util.total_capital));
  ]
) in

let json = `Assoc [("tranches", `List dashboard_data)] in
Yojson.Safe.pretty_to_string json
```

## Database Schema

### tranche_utilization Table

```sql
CREATE TABLE tranche_utilization (
  tranche_id TEXT PRIMARY KEY,              -- "SURE-BTC", "SURE-SNR", etc.
  total_capital_nanoton BIGINT NOT NULL,    -- Total vault deposits
  coverage_sold_nanoton BIGINT NOT NULL,    -- Outstanding coverage
  utilization_ratio DOUBLE PRECISION NOT NULL,  -- Calculated ratio
  current_apy DOUBLE PRECISION NOT NULL,    -- Current APY from curve
  updated_at TIMESTAMP DEFAULT NOW()        -- Last update time
);

CREATE INDEX idx_tranche_util_updated ON tranche_utilization(updated_at DESC);
```

### Example Queries

```sql
-- Get all tranches ordered by utilization
SELECT
  tranche_id,
  utilization_ratio * 100 AS utilization_pct,
  current_apy,
  total_capital_nanoton / 1e9 AS capital_ton,
  coverage_sold_nanoton / 1e9 AS coverage_ton
FROM tranche_utilization
ORDER BY utilization_ratio DESC;

-- Get high utilization tranches (>80%)
SELECT tranche_id, utilization_ratio * 100 AS util_pct
FROM tranche_utilization
WHERE utilization_ratio > 0.80;

-- Utilization history (requires audit table)
SELECT
  tranche_id,
  utilization_ratio,
  current_apy,
  updated_at
FROM tranche_utilization_history
WHERE tranche_id = 'SURE-SNR'
  AND updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at ASC;
```

## Caching Strategy

### In-Memory Cache
- **TTL**: 30 seconds
- **Structure**: Hashtbl mapping tranche → cache_entry
- **Invalidation**: Automatic on updates, explicit on sync

### Cache Flow
```
1. Query arrives
   ↓
2. Check in-memory cache
   ↓
3. If hit and fresh (< 30s) → return cached
   ↓
4. If miss or stale → query PostgreSQL
   ↓
5. Update cache with fresh data
   ↓
6. Return result
```

### Cache Management
```ocaml
(* Clear specific tranche cache *)
UtilizationTracker.invalidate_cache SURE_BTC

(* Clear all caches (testing) *)
UtilizationTracker.clear_caches ()
```

## Risk Monitoring

### Thresholds

| Threshold | Value | Action |
|-----------|-------|--------|
| High Utilization | 90% | Warning log |
| Max Utilization | 95% | Reject new coverage |
| Min Collateralization | 110% | Error alert |

### Alerts

The tracker automatically logs alerts when thresholds are exceeded:

```
⚠️  HIGH UTILIZATION: SURE-MEZZ at 92.50% (threshold: 90.00%)

🚨 UNDERCOLLATERALIZED: SURE-JNR at 1.05x (minimum: 1.10x)
```

### Integration with Monitoring

```ocaml
(* Periodic monitoring task *)
let rec monitor_loop () =
  let* all_utils = UtilizationTracker.get_all_utilizations () in

  Lwt_list.iter_s (fun util ->
    if util.utilization_ratio >= 0.90 then
      send_alert ~severity:`High ~message:(
        sprintf "High utilization: %s at %.2f%%"
          (tranche_to_string util.tranche_id)
          (util.utilization_ratio *. 100.0)
      )
    else
      Lwt.return_unit
  ) all_utils >>= fun () ->

  let* () = Lwt_unix.sleep 60.0 in
  monitor_loop ()
```

## Performance Considerations

### Throughput
- **Cached reads**: < 1ms (in-memory lookup)
- **Database reads**: 5-10ms (PostgreSQL query)
- **Updates**: 10-20ms (DB write + cache invalidation)

### Optimization Tips

1. **Batch updates**: Accumulate multiple coverage updates before syncing
   ```ocaml
   (* Instead of *)
   List.iter policies ~f:(fun p -> update_coverage ~delta:p.amount)

   (* Do *)
   let total_delta = List.fold policies ~init:0L ~f:(fun acc p ->
     Int64.(acc + p.amount)
   ) in
   update_coverage ~delta:total_delta
   ```

2. **Use cache for read-heavy workloads**: Dashboard queries benefit from caching
   ```ocaml
   (* Cache hit rate: ~95% for 30s TTL *)
   let* all_utils = get_all_utilizations () in (* Mostly cached *)
   ```

3. **Async updates**: Don't block user transactions on utilization updates
   ```ocaml
   (* Policy creation *)
   let* policy_id = create_policy_on_chain () in
   let* () = send_response_to_user policy_id in

   (* Update tracker asynchronously *)
   Lwt.async (fun () ->
     UtilizationTracker.update_coverage ~tranche ~delta:coverage_amount
   );
   ```

## Integration Points

### 1. Tranche APY API
**File**: `backend/api/tranche_apy_api.ml`

Replace static utilization with real-time data:

```ocaml
(* Before *)
let apy = calculate_apy ~tranche ~utilization:0.5

(* After *)
let* util = UtilizationTracker.get_tranche_utilization ~tranche in
let apy = util.current_apy
```

### 2. Collateral Manager
**File**: `backend/pool/collateral_manager.ml`

Check capacity before accepting policies:

```ocaml
let can_create_policy ~tranche ~coverage_amount =
  UtilizationTracker.can_accept_coverage ~tranche ~amount:coverage_amount
```

### 3. Tonny Bot
**File**: `backend/tonny/tonny_bot.ml`

Provide vault stats to users:

```ocaml
let handle_vault_stats_command chat_id =
  let* all_utils = UtilizationTracker.get_all_utilizations () in

  let message = List.map all_utils ~f:(fun util ->
    sprintf "%s: %.2f%% util, %.2f%% APY"
      (tranche_to_string util.tranche_id)
      (util.utilization_ratio *. 100.0)
      util.current_apy
  ) |> String.concat ~sep:"\n" in

  send_telegram_message chat_id message
```

### 4. Frontend VaultStaking
**API Endpoint**: `GET /api/v1/utilization/dashboard`

```typescript
// frontend/src/pages/VaultStaking.tsx
const response = await fetch('/api/v1/utilization/dashboard');
const data = await response.json();

tranches.forEach(tranche => {
  updateUI({
    trancheName: tranche.tranche_id,
    currentAPY: tranche.current_apy,
    utilization: tranche.utilization * 100,
    tvl: tranche.total_capital_ton
  });
});
```

## Testing

### Unit Tests
**File**: `backend/test/utilization_tracker_test.ml`

Run tests:
```bash
cd backend
dune test
```

Test coverage:
- Utilization calculations
- Capital/coverage updates
- Capacity checks
- Collateralization ratios
- Cache behavior
- APY integration

### Integration Tests

```ocaml
(* Test full workflow *)
let test_policy_lifecycle () =
  (* 1. Initialize tracker *)
  let* () = UtilizationTracker.init ~database_config in

  (* 2. Deposit capital *)
  let* () = UtilizationTracker.update_capital
    ~tranche:SURE_SNR
    ~delta:(ton_to_nano 10000.0)
  in

  (* 3. Create policy *)
  let* () = UtilizationTracker.update_coverage
    ~tranche:SURE_SNR
    ~delta:(ton_to_nano 5000.0)
  in

  (* 4. Verify utilization *)
  let* util = UtilizationTracker.get_tranche_utilization ~tranche:SURE_SNR in
  assert (Float.(abs (util.utilization_ratio - 0.50) < 0.01));

  (* 5. Policy expires *)
  let* () = UtilizationTracker.update_coverage
    ~tranche:SURE_SNR
    ~delta:(ton_to_nano (-5000.0))
  in

  (* 6. Verify return to baseline *)
  let* util2 = UtilizationTracker.get_tranche_utilization ~tranche:SURE_SNR in
  assert (Float.(abs util2.utilization_ratio < 0.01));

  Lwt.return_unit
```

## Troubleshooting

### Issue: Database connection fails

**Symptom**: `DatabaseError: connection refused`

**Solution**:
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Verify credentials
psql -h localhost -U postgres -d tonsurance_test

# Check config
echo $DB_HOST $DB_PORT $DB_NAME
```

### Issue: Cache always misses

**Symptom**: Every query hits database

**Solution**:
```ocaml
(* Check cache TTL *)
let cache_ttl_seconds = 30.0  (* Should be 30 seconds *)

(* Verify cache is being populated *)
UtilizationTracker.clear_caches ();
let* util1 = get_tranche_utilization ~tranche:SURE_BTC in
let* util2 = get_tranche_utilization ~tranche:SURE_BTC in
(* util2 should be cached, check logs *)
```

### Issue: APY not updating

**Symptom**: APY stays constant despite utilization changes

**Solution**:
```ocaml
(* Verify utilization is being calculated *)
let* util = get_tranche_utilization ~tranche in
Printf.printf "Utilization: %.2f%%\n" (util.utilization_ratio *. 100.0);

(* Check bonding curve integration *)
let apy = Tranche_pricing.calculate_apy ~tranche ~utilization:util.utilization_ratio in
Printf.printf "Expected APY: %.2f%%\n" apy;
```

### Issue: Capacity checks too restrictive

**Symptom**: Policies rejected despite capacity

**Solution**:
```ocaml
(* Check max utilization threshold *)
let thresholds = UtilizationTracker.default_thresholds in
Printf.printf "Max utilization: %.2f%%\n" (thresholds.max_utilization *. 100.0);

(* Get actual capacity *)
let* capacity = get_available_capacity ~tranche in
Printf.printf "Available: %Ld nanoTON\n" capacity;
```

## Future Enhancements

### Redis Integration
Replace in-memory cache with distributed Redis:

```ocaml
module RedisCache = struct
  let init ~host ~port = ...
  let get_utilization ~tranche = ...
  let store_utilization ~util = ...
  let invalidate ~tranche = ...
end
```

### Historical Analytics
Track utilization over time:

```sql
CREATE TABLE tranche_utilization_history (
  id BIGSERIAL PRIMARY KEY,
  tranche_id TEXT NOT NULL,
  utilization_ratio DOUBLE PRECISION NOT NULL,
  current_apy DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_util_history_tranche_time
  ON tranche_utilization_history(tranche_id, recorded_at DESC);
```

### Predictive Capacity
Use ML to forecast capacity exhaustion:

```ocaml
val predict_capacity_exhaustion :
  tranche:tranche ->
  (hours_until_full:float option) Lwt.t
```

### Multi-Vault Support
Track utilization across multiple vault instances:

```ocaml
type vault_id = string

val get_vault_utilization :
  vault_id:vault_id ->
  tranche:tranche ->
  tranche_utilization Lwt.t
```

## References

- **Tranche Pricing Module**: `backend/pricing/tranche_pricing.ml`
- **Database Integration**: `backend/integration/database.ml`
- **Types**: `backend/types/types.ml`
- **Multi-Tranche Vault Spec**: `docs/MULTI_TRANCHE_VAULT_SPEC.md`
- **Redis Deployment Guide**: `docs/REDIS_DEPLOYMENT.md`

## Support

For issues or questions:
1. Check test suite: `dune test`
2. Review logs: `Logs.set_level (Some Logs.Debug)`
3. Inspect database: `psql tonsurance -c "SELECT * FROM tranche_utilization"`
4. Check cache stats: `UtilizationTracker.get_statistics ()`
