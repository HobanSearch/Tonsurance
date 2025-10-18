# Tonsurance Configuration System - Complete Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Configuration Files](#configuration-files)
4. [Environment Management](#environment-management)
5. [OCaml Configuration Manager](#ocaml-configuration-manager)
6. [Smart Contract Configuration](#smart-contract-configuration)
7. [Migration Guide](#migration-guide)
8. [Tuning for Performance](#tuning-for-performance)
9. [Production Updates](#production-updates)
10. [Troubleshooting](#troubleshooting)

## Overview

The Tonsurance configuration system eliminates hardcoded values throughout the codebase, providing:

- **Centralized configuration** - All parameters in JSON files
- **Environment-specific overrides** - Different settings for dev/staging/prod
- **Runtime overrides** - Environment variables for dynamic changes
- **Type-safe access** - OCaml modules with validation
- **Hot-reload support** - Update without restarting (non-critical params)
- **On-chain configuration** - FunC contract for blockchain parameters
- **Comprehensive validation** - Catch invalid values early
- **Audit trail** - Track all configuration changes

### What Was Extracted

**Smart Contracts (FunC):**
- Gas amounts: 0.01 TON - 0.15 TON for various operations
- Timeout values: 30s - 300s (premium quotes, oracle staleness, lock timeouts)
- Treasury splits: 70/20/10 (vault/staker/reserve)
- Retry limits: 3-5 attempts, 1-16s backoff
- Minimum deposits: 0.1 TON vault, 2-200 TON policies
- Seq_no overflow threshold: 2^32-1

**Backend (OCaml):**
- HTTP timeouts: 10-60 seconds
- Oracle update intervals: 60-120 seconds
- Daemon polling intervals: 10-900 seconds
- Retry policies: 3 attempts, [1s, 2s, 4s] backoff
- Database pool sizes: 5-50 connections
- Worker thread counts: 2-16 threads
- Rate limits: 100-1200 requests/minute
- Circuit breaker thresholds: 5-50% price changes
- Utilization thresholds: 50-90% capacity

## Architecture

### Configuration Layers

```
┌─────────────────────────────────────────────────────────────┐
│ Priority 1: Environment Variables (Runtime Override)        │
│ TONSURANCE_TIMEOUTS_TON_CLIENT_REQUEST_TIMEOUT_SECONDS=60   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Priority 2: Environment-Specific Config                     │
│ development.json / staging.json / production.json           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Priority 3: Base Configuration Files                        │
│ timeouts.json, gas_config.json, retry_policies.json, etc.  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ Priority 4: Hardcoded Defaults (Fallback)                   │
│ In config_manager.ml: ~default:30                           │
└─────────────────────────────────────────────────────────────┘
```

### Component Interaction

```
┌──────────────────┐
│  OCaml Services  │
│  (ton_client.ml, │
│   daemons, API)  │
└────────┬─────────┘
         │
         │ uses
         ▼
┌──────────────────────────┐      loads      ┌──────────────────┐
│  config_manager.ml       │ ◄───────────────│  JSON Config     │
│  - Timeouts module       │                 │  Files           │
│  - Gas module            │                 │  (5 files)       │
│  - Retry module          │                 │                  │
│  - Pools module          │                 │  Environment     │
│  - Thresholds module     │                 │  Overrides       │
│  - Hot-reload support    │ ◄───────────────│  (3 files)       │
└──────────────────────────┘                 └──────────────────┘
         │
         │ can reload
         ▼
┌──────────────────────────┐
│  In-Memory Cache         │
│  (60s TTL)               │
└──────────────────────────┘


┌──────────────────┐
│  FunC Contracts  │
│  (PolicyFactory, │
│   Treasury, etc) │
└────────┬─────────┘
         │
         │ reads
         ▼
┌──────────────────────────┐      admin      ┌──────────────────┐
│  ConfigRegistry.fc       │ ◄───updates─────│  Admin Wallet    │
│  - Gas config            │                 │  (Multi-sig)     │
│  - Timeout config        │                 │                  │
│  - Treasury splits       │                 └──────────────────┘
│  - Policy limits         │
│  - On-chain storage      │
└──────────────────────────┘
```

## Configuration Files

### Directory Structure

```
backend/config/
├── timeouts.json              # All timeout values
├── gas_config.json            # Gas amounts per operation
├── retry_policies.json        # Retry attempts and backoff
├── pool_sizes.json            # Connection pools, concurrency
├── thresholds.json            # Circuit breakers, alerts
├── development.json           # Dev environment overrides
├── staging.json               # Staging environment overrides
├── production.json            # Production environment overrides
├── config_manager.ml          # OCaml configuration module
├── config_loader.ml           # Database-backed loader (legacy)
├── migration_example.ml       # Before/after examples
├── CONFIG_GUIDE.md            # This file
└── CONFIG_QUICK_REFERENCE.md  # Quick lookup guide

contracts/config/
└── ConfigRegistry.fc          # On-chain configuration contract
```

### File Descriptions

#### 1. timeouts.json

**Purpose:** All timeout values for network requests, daemon intervals, and polling frequencies.

**Categories:**
- `ton_client` - TON blockchain API timeouts
- `http_client` - External HTTP API timeouts
- `oracle` - Oracle update intervals and staleness checks
- `daemon` - Background daemon polling intervals
- `etl` - ETL pipeline timeouts
- `claims` - Claims processing intervals
- `websocket` - WebSocket connection management
- `bot` - Tonny bot conversation timeouts

**Example:**
```json
{
  "ton_client": {
    "request_timeout_seconds": 30
  },
  "oracle": {
    "update_interval_seconds": 60.0,
    "max_staleness_seconds": 300
  },
  "daemon": {
    "vault_sync_interval_seconds": 300.0,
    "event_poll_interval_seconds": 10.0
  }
}
```

**When to adjust:**
- Network latency increases → Increase request timeouts
- Need faster updates → Decrease polling intervals
- Resource constraints → Increase intervals to reduce load

#### 2. gas_config.json

**Purpose:** Gas amounts (in nanoton) for all blockchain operations.

**Categories:**
- `base_amounts_nanoton` - Minimum operational balance
- `contract_operations` - Standard operation gas amounts
- `policy_factory` - Policy creation gas
- `multi_tranche_vault` - Vault operation gas
- `claims_processor` - Claims processing gas
- `tranche_tokens` - Token operation gas
- `environment_multipliers` - Per-environment gas buffers

**Example:**
```json
{
  "contract_operations": {
    "simple_message": {
      "amount_nanoton": 10000000,
      "description": "0.01 TON"
    },
    "waterfall_operation": {
      "amount_nanoton": 150000000,
      "description": "0.15 TON"
    }
  },
  "environment_multipliers": {
    "development": 1.0,
    "production": 1.2
  }
}
```

**When to adjust:**
- Network congestion → Increase gas amounts
- Gas price drops → Can reduce amounts
- Complex operations failing → Increase specific operation gas
- Production → Use 1.2x multiplier for safety

#### 3. retry_policies.json

**Purpose:** Retry attempts and backoff strategies for all external services.

**Categories:**
- `http_client` - Standard HTTP retry
- `oracle_aggregator` - Oracle service retry
- `chainlink_client` - Chainlink-specific retry
- `binance_futures` - Exchange API retry
- `circuit_breaker` - Circuit breaker thresholds
- `async_helpers` - On-chain async retry

**Example:**
```json
{
  "http_client": {
    "retry_attempts": 3,
    "retry_delays_seconds": [1.0, 2.0, 4.0],
    "backoff_strategy": "exponential"
  },
  "circuit_breaker": {
    "failure_threshold": 5,
    "success_threshold": 2,
    "timeout_seconds": 60.0
  }
}
```

**When to adjust:**
- External API is flaky → Increase retry attempts
- Need faster failure → Reduce retry attempts
- Service overload → Increase backoff delays
- Critical path → Lower circuit breaker threshold

#### 4. pool_sizes.json

**Purpose:** Connection pool sizes, worker threads, and concurrency limits.

**Categories:**
- `database` - PostgreSQL connection pool
- `redis` - Redis connection pool
- `http_client` - HTTP connection limits
- `worker_threads` - Background worker pool
- `websocket` - WebSocket connection limits
- `rate_limits` - API rate limiting
- `environment_overrides` - Per-environment sizes

**Example:**
```json
{
  "database": {
    "default_pool_size": 10,
    "max_pool_size": 50,
    "connection_timeout_seconds": 30
  },
  "worker_threads": {
    "default_workers": 4,
    "max_workers": 16
  },
  "rate_limits": {
    "requests_per_minute_per_ip": 100
  }
}
```

**When to adjust:**
- High load → Increase pool sizes
- Database connection exhaustion → Increase DB pool
- CPU saturation → Reduce worker threads
- DDoS protection → Lower rate limits
- Development → Use smaller pools to save resources

#### 5. thresholds.json

**Purpose:** Thresholds for circuit breakers, alerts, and risk management.

**Categories:**
- `circuit_breaker` - Price change and deviation limits
- `risk_management` - Utilization and buffer thresholds
- `oracle_monitoring` - Staleness and deviation alerts
- `collateral_manager` - Rebalancing triggers
- `vault_operations` - Deposit limits and lock timeouts
- `market_data` - Depeg and anomaly detection
- `monitoring_alerts` - System health thresholds

**Example:**
```json
{
  "circuit_breaker": {
    "price_change_max_percent": 50.0,
    "failure_count_threshold": 5
  },
  "risk_management": {
    "utilization_critical_percent": 90.0,
    "capital_buffer_min_percent": 10.0
  },
  "vault_operations": {
    "lock_timeout_seconds": 60
  }
}
```

**When to adjust:**
- Market volatility → Adjust price change limits
- Risk tolerance changes → Modify utilization thresholds
- False positives → Increase alert thresholds
- Tighten security → Lower thresholds

## Environment Management

### Setting Environment

```bash
# Set environment variable
export TONSURANCE_ENV=production

# Or in systemd service
Environment="TONSURANCE_ENV=production"

# Or in Docker
docker run -e TONSURANCE_ENV=production ...

# Or in Kubernetes
env:
  - name: TONSURANCE_ENV
    value: "production"
```

### Environment-Specific Configurations

#### Development (development.json)

**Purpose:** Loose limits for testing and debugging.

**Characteristics:**
- Longer timeouts (reduce flaky tests)
- Smaller pools (save resources)
- Verbose logging
- Test endpoints enabled
- Mock external APIs optional
- Lenient thresholds

**Example:**
```json
{
  "environment": "development",
  "timeouts": {
    "ton_client_seconds": 60
  },
  "pools": {
    "database_pool_size": 5,
    "worker_threads": 2
  },
  "thresholds": {
    "circuit_breaker_failures": 10
  },
  "features": {
    "enable_test_endpoints": true,
    "mock_external_apis": true
  }
}
```

#### Staging (staging.json)

**Purpose:** Production-like settings for final testing.

**Characteristics:**
- Production timeouts
- Moderate pool sizes
- Real external APIs
- Testnet contracts
- INFO logging
- Hot-reload enabled

**Example:**
```json
{
  "environment": "staging",
  "timeouts": {
    "ton_client_seconds": 30
  },
  "pools": {
    "database_pool_size": 10,
    "worker_threads": 4
  },
  "thresholds": {
    "circuit_breaker_failures": 7
  }
}
```

#### Production (production.json)

**Purpose:** Tight limits for security and performance.

**Characteristics:**
- 20% gas buffer
- Large pools for load
- Strict thresholds
- All security features
- Monitoring enabled
- Multi-sig required
- Test endpoints disabled

**Example:**
```json
{
  "environment": "production",
  "gas": {
    "environment_multiplier": 1.2
  },
  "pools": {
    "database_pool_size": 50,
    "worker_threads": 16
  },
  "thresholds": {
    "circuit_breaker_failures": 5
  },
  "security": {
    "require_multi_sig": true
  },
  "features": {
    "enable_test_endpoints": false
  }
}
```

## OCaml Configuration Manager

### Initialization

```ocaml
open Config_manager
open Lwt.Syntax

let main () =
  (* Initialize configuration system *)
  let* () = initialize () in

  (* Validate configuration *)
  let* result = validate_config () in
  match result with
  | Ok () ->
      Logs.info (fun m -> m "Configuration validated successfully");
      run_service ()
  | Error msg ->
      Logs.err (fun m -> m "Configuration validation failed: %s" msg);
      exit 1
```

### Module Structure

The `Config_manager` module provides type-safe sub-modules:

```ocaml
module Timeouts = struct
  val get_ton_client_timeout : unit -> int Lwt.t
  val get_http_timeout : unit -> float Lwt.t
  val get_oracle_update_interval : unit -> float Lwt.t
  val get_daemon_interval : string -> float Lwt.t
  val get_max_staleness : unit -> int Lwt.t
end

module Gas = struct
  val get_operation_gas : string -> int Lwt.t
  val get_min_operational_balance : unit -> int Lwt.t
  val get_policy_factory_gas : unit -> int Lwt.t
  val get_vault_gas : string -> int Lwt.t
  val get_environment_multiplier : unit -> float Lwt.t
end

module Retry = struct
  val get_max_attempts : string -> int Lwt.t
  val get_backoff_delays : string -> float list Lwt.t
  val get_circuit_breaker_threshold : unit -> int Lwt.t
end

module Pools = struct
  val get_database_pool_size : unit -> int Lwt.t
  val get_worker_threads : unit -> int Lwt.t
  val get_rate_limit_per_minute : unit -> int Lwt.t
  val get_max_concurrent_requests : unit -> int Lwt.t
end

module Thresholds = struct
  val get_circuit_breaker_price_change_max : unit -> float Lwt.t
  val get_utilization_threshold : string -> float Lwt.t
  val get_oracle_staleness_critical : unit -> int Lwt.t
  val get_min_reserve_balance : unit -> int Lwt.t
  val get_vault_lock_timeout : unit -> int Lwt.t
end
```

### Usage Examples

```ocaml
(* TON client with configured timeout *)
let create_ton_client () =
  let* timeout = Timeouts.get_ton_client_timeout () in
  let config = {
    network = "mainnet";
    timeout_seconds = timeout;
  } in
  Lwt.return (TonClient.create config)

(* Policy purchase with configured gas *)
let purchase_policy coverage_amount =
  let* base_gas = Gas.get_policy_factory_gas () in
  let* multiplier = Gas.get_environment_multiplier () in
  let total_gas = Float.to_int (Float.of_int base_gas *. multiplier) in

  send_transaction ~gas:total_gas ~amount:coverage_amount

(* HTTP client with retry *)
let fetch_with_retry url =
  let* max_attempts = Retry.get_max_attempts "http_client" in
  let* delays = Retry.get_backoff_delays "http_client" in

  let rec retry attempt =
    if attempt >= max_attempts then
      Lwt.fail (Failure "Max retries exceeded")
    else
      try%lwt
        Http.get url
      with exn ->
        let delay = List.nth_exn delays (min attempt (List.length delays - 1)) in
        let* () = Lwt_unix.sleep delay in
        retry (attempt + 1)
  in
  retry 0
```

## Smart Contract Configuration

### ConfigRegistry Contract

The `ConfigRegistry.fc` contract provides on-chain configuration for smart contracts.

#### Deployment

```typescript
import { ConfigRegistry } from './wrappers/ConfigRegistry';

// Deploy ConfigRegistry
const configRegistry = await ConfigRegistry.deploy(ownerAddress);

// Initialize with default values
await configRegistry.sendUpdateGasConfig(
  10000000,   // simple_message
  30000000,   // standard_operation
  50000000,   // complex_operation
  100000000,  // heavy_operation
  150000000   // waterfall_operation
);

await configRegistry.sendUpdateTimeoutConfig(
  60,   // lock_timeout
  30,   // quote_validity
  300,  // oracle_staleness
  60    // oracle_interval
);

await configRegistry.sendUpdateTreasurySplits(
  7000,  // vault_split (70%)
  2000,  // staker_split (20%)
  1000   // reserve_split (10%)
);
```

#### Reading Configuration

```func
;; In your contract
#include "../config/ConfigRegistry.fc"

() process_deposit(int amount, slice sender) impure {
    ;; Get configured gas amount
    int gas = get_gas_for_operation(3);  ;; 3 = complex operation

    ;; Get configured timeout
    (int lock_timeout, int quote_validity, int oracle_staleness, int oracle_interval) = get_timeout_config();

    ;; Use lock_timeout for tranche lock
    var (lock_acquired, updated_locks) = acquire_tranche_lock(
        tranche_locks, tranche_id, seq_no, lock_timeout
    );

    ;; Rest of logic...
}

;; Get Treasury splits
() distribute_premium(int amount) impure {
    (int vault_split, int staker_split, int reserve_split) = get_treasury_splits();

    int vault_amount = muldiv(amount, vault_split, 10000);
    int staker_amount = muldiv(amount, staker_split, 10000);
    int reserve_amount = amount - vault_amount - staker_amount;

    ;; Send to respective addresses...
}
```

#### Updating Configuration (Admin Only)

```typescript
// Update gas configuration
await configRegistry.sendUpdateGasConfig(
  15000000,   // Increase simple_message gas
  35000000,   // Increase standard_operation gas
  60000000,   // Increase complex_operation gas
  120000000,  // Increase heavy_operation gas
  180000000   // Increase waterfall_operation gas
);

// Update timeout configuration
await configRegistry.sendUpdateTimeoutConfig(
  90,   // Increase lock_timeout to 90 seconds
  45,   // Increase quote_validity to 45 seconds
  450,  // Increase oracle_staleness to 7.5 minutes
  90    // Increase oracle_interval to 90 seconds
);

// Update Treasury splits
await configRegistry.sendUpdateTreasurySplits(
  7500,  // Increase vault share to 75%
  1500,  // Decrease staker share to 15%
  1000   // Keep reserve at 10%
);
```

### Multi-Sig for Production

Production configuration updates require multi-sig approval:

```typescript
// 3-of-5 multi-sig wallet
const multiSig = await MultiSigWallet.fromAddress(multiSigAddress);

// Propose configuration update
const proposal = await multiSig.proposeTransaction({
  dest: configRegistryAddress,
  value: toNano('0.05'),
  payload: ConfigRegistry.updateGasConfigPayload(...)
});

// Signers approve
await multiSig.approve(proposal.id, signer1);
await multiSig.approve(proposal.id, signer2);
await multiSig.approve(proposal.id, signer3);

// Execute when threshold reached
await multiSig.execute(proposal.id);
```

## Migration Guide

### Step 1: Identify Hardcoded Values

Search your codebase for hardcoded values:

```bash
# Find hardcoded timeouts
rg "timeout.*=.*[0-9]+" backend/

# Find hardcoded gas amounts
rg "[0-9]+000000.*TON" contracts/

# Find hardcoded retry counts
rg "retry.*=.*[0-9]+" backend/
```

### Step 2: Update Code

Replace hardcoded values with config manager calls:

**Before:**
```ocaml
let timeout = 30 in  (* HARDCODED *)
let gas = 50000000 in  (* HARDCODED *)
```

**After:**
```ocaml
let* timeout = Config_manager.Timeouts.get_ton_client_timeout () in
let* gas = Config_manager.Gas.get_operation_gas "complex_operation" in
```

### Step 3: Add to Configuration Files

Add new parameters to appropriate JSON files:

```json
// timeouts.json
{
  "my_service": {
    "request_timeout_seconds": 30
  }
}

// gas_config.json
{
  "my_operations": {
    "my_operation_gas": 50000000
  }
}
```

### Step 4: Update Tests

Update tests to use configuration:

```ocaml
let test_my_service () =
  let* () = Config_manager.initialize ~base_path:"./test/config" () in
  let* timeout = Config_manager.Timeouts.get_ton_client_timeout () in
  Alcotest.(check int) "timeout" 30 timeout;
  Lwt.return_unit
```

### Step 5: Deploy and Verify

1. Deploy to development
2. Verify configuration loads correctly
3. Test with different environment variables
4. Deploy to staging
5. Final testing
6. Deploy to production with monitoring

## Tuning for Performance

### Identifying Bottlenecks

```bash
# Monitor database connections
psql -c "SELECT count(*) FROM pg_stat_activity;"

# Check service latency
curl http://localhost:8080/metrics | grep latency

# View circuit breaker activations
curl http://localhost:8080/metrics | grep circuit_breaker
```

### Tuning Database Pools

```json
// pool_sizes.json
{
  "database": {
    "default_pool_size": 50,  // Increase if connection exhaustion
    "max_pool_size": 100,     // Set to 2x default as headroom
    "connection_timeout_seconds": 30,  // Reduce if slow queries fixed
    "idle_timeout_seconds": 600  // Reduce to free connections faster
  }
}
```

**Symptoms → Adjustments:**
- Connection exhaustion → Increase `default_pool_size`
- Idle connections → Reduce `idle_timeout_seconds`
- Slow queries → Increase `connection_timeout_seconds`

### Tuning Worker Threads

```json
// pool_sizes.json
{
  "worker_threads": {
    "default_workers": 8,  // = number of CPU cores
    "max_workers": 32,     // = 2-4x CPU cores
    "queue_size": 1000     // Increase if queue saturation
  }
}
```

**Guidelines:**
- CPU-bound tasks: workers = CPU cores
- I/O-bound tasks: workers = 2-4x CPU cores
- Mixed workload: Start with 2x, monitor CPU usage

### Tuning Timeouts

```json
// timeouts.json
{
  "http_client": {
    "default_timeout_seconds": 10.0,  // Balance latency vs success rate
    "long_timeout_seconds": 60.0      // For heavy operations
  }
}
```

**Considerations:**
- P95 latency < timeout → Good setting
- P95 latency > timeout → Increase or optimize service
- Timeout too high → Slow failure detection

### Tuning Retry Policies

```json
// retry_policies.json
{
  "http_client": {
    "retry_attempts": 3,  // Balance success rate vs latency
    "retry_delays_seconds": [1.0, 2.0, 4.0]  // Exponential backoff
  }
}
```

**Tuning:**
- Transient failures → Increase retry attempts
- Service overload → Increase backoff delays
- Critical latency → Reduce retries, fail fast

### Tuning Circuit Breakers

```json
// thresholds.json
{
  "circuit_breaker": {
    "failure_threshold": 5,      // Trip after N failures
    "success_threshold": 2,       // Reset after N successes
    "timeout_seconds": 60.0       // Retry closed state after timeout
  }
}
```

**Tuning:**
- Too many trips → Increase failure threshold
- Cascading failures → Decrease failure threshold
- Slow recovery → Reduce timeout

## Production Updates

### Safe Update Process

1. **Test in Development**
   ```bash
   export TONSURANCE_ENV=development
   # Edit development.json
   # Restart service
   # Verify new values
   ```

2. **Deploy to Staging**
   ```bash
   # Update staging.json
   git add backend/config/staging.json
   git commit -m "config: Update staging timeout values"
   git push

   # Deploy to staging
   ssh staging "cd /app && git pull && systemctl restart tonsurance"

   # Monitor for 24 hours
   # Check metrics, logs, alerts
   ```

3. **Production Rollout**
   ```bash
   # Update production.json
   git add backend/config/production.json
   git commit -m "config: Update production timeout values"

   # Create pull request
   gh pr create --title "Config: Update production timeouts" \
                --body "Increases TON client timeout from 30s to 45s to reduce timeouts during congestion"

   # Require approval from 2+ engineers
   # Merge after approval

   # Deploy with monitoring
   ssh prod-01 "cd /app && git pull && systemctl reload tonsurance"
   # Watch metrics for 10 minutes
   ssh prod-02 "cd /app && git pull && systemctl reload tonsurance"
   # Continue rollout...
   ```

### Hot-Reload (Non-Critical Params)

```bash
# Edit configuration file
vim /app/backend/config/timeouts.json

# Reload without restart
kill -HUP <pid>

# Or via API
curl -X POST http://localhost:8080/admin/reload-config \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Verify new values
curl http://localhost:8080/admin/config-summary
```

**Safe for hot-reload:**
- Timeout values
- Retry counts
- Pool sizes (within limits)
- Thresholds

**Requires restart:**
- Database connection strings
- API keys
- Security settings
- Structural changes

### Rollback Procedure

```bash
# Revert configuration
git revert <commit-hash>
git push

# Deploy rollback
ansible-playbook -i production deploy-config.yml

# Or manual rollback
ssh prod "cd /app && git reset --hard HEAD~1 && systemctl restart tonsurance"

# Verify rollback
curl http://localhost:8080/health
```

### Monitoring Configuration Changes

```bash
# Add monitoring for config changes
# Log all reloads
Logs.info (fun m -> m "Configuration reloaded: %s" (config_summary ()));

# Track in metrics
Prometheus.Counter.inc_one config_reloads_total

# Alert on validation failures
if config_invalid then
  send_alert ~severity:Critical ~message:"Configuration validation failed"
```

## Troubleshooting

### Configuration Not Loading

**Symptom:** Service uses default values instead of configured values.

**Diagnosis:**
```bash
# Check environment
echo $TONSURANCE_ENV

# Check file permissions
ls -l backend/config/*.json

# Check logs
journalctl -u tonsurance | grep -i config

# Validate JSON syntax
jsonlint backend/config/timeouts.json
```

**Solutions:**
```bash
# Set environment
export TONSURANCE_ENV=production

# Fix permissions
chmod 644 backend/config/*.json

# Fix JSON syntax errors
vim backend/config/timeouts.json
```

### Wrong Values Being Used

**Symptom:** Configuration has correct value but service uses different value.

**Diagnosis:**
```ocaml
(* Add debug logging *)
let* timeout = Timeouts.get_ton_client_timeout () in
Logs.debug (fun m -> m "Using timeout: %d" timeout);

(* Check cache *)
let* summary = get_config_summary () in
Logs.info (fun m -> m "Config summary: %s" (Yojson.Safe.to_string summary));
```

**Possible causes:**
1. Environment variable override
2. Wrong environment loaded
3. Cached old value
4. Wrong config path

**Solutions:**
```bash
# Clear environment variables
unset $(env | grep TONSURANCE_ | cut -d= -f1)

# Force reload
kill -HUP <pid>

# Check config path
Config_manager.initialize ~base_path:"/correct/path" ()
```

### Performance Degradation

**Symptom:** Service slower after configuration change.

**Diagnosis:**
```bash
# Compare before/after metrics
curl http://localhost:8080/metrics > after.txt
diff before.txt after.txt

# Check which config changed
git diff HEAD~1 backend/config/

# Profile service
perf record -g -p <pid>
perf report
```

**Common causes:**
- Increased timeout → Slower failure detection
- Increased retry count → More attempts before giving up
- Larger pool size → More memory/connections
- Reduced worker threads → Bottleneck

### Configuration Validation Failures

**Symptom:** Service fails to start with validation error.

**Diagnosis:**
```bash
# Run validation manually
./scripts/validate_config.sh production

# Check error logs
journalctl -u tonsurance -n 100 | grep -i validation

# Test with defaults
mv backend/config/production.json backend/config/production.json.bak
# Start service, see if defaults work
```

**Solutions:**
```json
// Fix out-of-range values
{
  "timeout_seconds": 30,  // Was: -5 (invalid)
  "pool_size": 10,        // Was: 0 (invalid)
  "threshold_percent": 90.0  // Was: 150.0 (invalid)
}
```

### On-Chain Configuration Issues

**Symptom:** Smart contracts using wrong parameter values.

**Diagnosis:**
```typescript
// Check ConfigRegistry state
const gasConfig = await configRegistry.getGasConfig();
console.log('Gas config:', gasConfig);

const timeouts = await configRegistry.getTimeoutConfig();
console.log('Timeouts:', timeouts);

const splits = await configRegistry.getTreasurySplits();
console.log('Treasury splits:', splits);
```

**Solutions:**
```typescript
// Verify contract address
console.log('ConfigRegistry address:', configRegistry.address);

// Check if admin
const owner = await configRegistry.getOwner();
console.log('Owner:', owner);

// Re-initialize if needed
await configRegistry.sendUpdateGasConfig(...correctValues);
```

## Best Practices

### Development

1. **Use development.json** for loose limits
2. **Mock external APIs** to avoid rate limits
3. **Enable verbose logging** for debugging
4. **Use smaller pools** to save resources
5. **Keep timeouts long** to reduce flaky tests

### Staging

1. **Mirror production** configuration as closely as possible
2. **Use real external APIs** but with staging keys
3. **Test configuration changes** before production
4. **Monitor for 24 hours** before promoting
5. **Validate all paths** (happy path, error cases, edge cases)

### Production

1. **Use 20% gas buffer** for safety
2. **Enable all monitoring** and alerting
3. **Require multi-sig** for contract updates
4. **Test in staging first** always
5. **Rollout gradually** with monitoring
6. **Keep rollback plan** ready
7. **Never skip validation**

### Security

1. **Never commit secrets** to JSON files
2. **Use environment variables** for API keys
3. **Restrict admin access** to ConfigRegistry
4. **Audit all changes** in git history
5. **Validate inputs** in config manager
6. **Rate limit config reloads** to prevent DoS

### Maintenance

1. **Review quarterly** based on metrics
2. **Document all changes** in commit messages
3. **Keep this guide updated** with new parameters
4. **Monitor config usage** via metrics
5. **Clean up unused parameters**

## Additional Resources

- [Quick Reference](./CONFIG_QUICK_REFERENCE.md) - Fast lookup for common parameters
- [Migration Examples](./migration_example.ml) - Before/after code examples
- [ConfigRegistry Contract](../../contracts/config/ConfigRegistry.fc) - On-chain configuration
- [Config Manager Source](./config_manager.ml) - OCaml implementation
- [Config JSON Schema](./timeouts.json) - JSON structure with $schema

## Support

For questions or issues:
1. Check this guide first
2. Search existing issues
3. Ask in #infrastructure Slack channel
4. Create GitHub issue with "config:" prefix

## Changelog

### v1.0.0 (2025-10-16)
- Initial configuration system implementation
- Extracted all hardcoded values to JSON files
- Created ConfigRegistry.fc smart contract
- Implemented config_manager.ml with hot-reload
- Environment-specific configurations (dev/staging/prod)
- Comprehensive documentation and migration guide
