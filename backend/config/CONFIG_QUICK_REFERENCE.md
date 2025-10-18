# Configuration System Quick Reference

## Overview

The Tonsurance configuration system supports:
- **File-based JSON configuration** - Organized by category (timeouts, gas, retry, pools, thresholds)
- **Environment-specific overrides** - development.json, staging.json, production.json
- **Environment variable overrides** - Highest priority for runtime changes
- **Hot-reload support** - Update config without restarting services
- **Type-safe access** - OCaml module provides validated accessors
- **On-chain configuration** - FunC ConfigRegistry contract for contract parameters

## Quick Start

### 1. Set Environment

```bash
# Set environment (development, staging, production)
export TONSURANCE_ENV=development

# Start your service
./your_service
```

### 2. OCaml Code Example

```ocaml
open Config_manager
open Lwt.Syntax

let my_service () =
  (* Initialize config system *)
  let* () = initialize () in

  (* Get timeout value *)
  let* timeout = Timeouts.get_ton_client_timeout () in

  (* Get gas amount *)
  let* gas = Gas.get_operation_gas "complex_operation" in

  (* Get retry attempts *)
  let* retries = Retry.get_max_attempts "http_client" in

  (* Use the values *)
  Printf.printf "Timeout: %d, Gas: %d, Retries: %d\n" timeout gas retries;
  Lwt.return_unit
```

### 3. Environment Variable Override

```bash
# Override timeout for this run
export TONSURANCE_TIMEOUTS_TON_CLIENT_REQUEST_TIMEOUT_SECONDS=60
./your_service

# Override gas amount
export TONSURANCE_GAS_CONTRACT_OPERATIONS_COMPLEX_OPERATION_AMOUNT_NANOTON=75000000
./your_service
```

## Configuration Files

### Location
`/Users/ben/Documents/Work/HS/Application/Tonsurance/backend/config/`

### Files
- **timeouts.json** - All timeout values (requests, polling, intervals)
- **gas_config.json** - Gas amounts for blockchain operations
- **retry_policies.json** - Retry attempts, backoff strategies
- **pool_sizes.json** - Connection pools, concurrency limits
- **thresholds.json** - Circuit breakers, alerts, risk thresholds
- **development.json** - Dev environment overrides
- **staging.json** - Staging environment overrides
- **production.json** - Production environment overrides

## Common Use Cases

### Timeouts

```ocaml
(* TON blockchain client timeout *)
let* timeout = Timeouts.get_ton_client_timeout () in

(* HTTP client timeout *)
let* http_timeout = Timeouts.get_http_timeout () in

(* Oracle update interval *)
let* interval = Timeouts.get_oracle_update_interval () in

(* Daemon-specific interval *)
let* sync_interval = Timeouts.get_daemon_interval "vault_sync" in

(* Max staleness for oracle data *)
let* max_staleness = Timeouts.get_max_staleness () in
```

**JSON Path:**
```json
// timeouts.json
{
  "ton_client": {
    "request_timeout_seconds": 30
  },
  "http_client": {
    "default_timeout_seconds": 10.0
  },
  "oracle": {
    "update_interval_seconds": 60.0,
    "max_staleness_seconds": 300
  },
  "daemon": {
    "vault_sync_interval_seconds": 300.0
  }
}
```

### Gas Amounts

```ocaml
(* Get gas for specific operation type *)
let* simple_gas = Gas.get_operation_gas "simple_message" in
let* complex_gas = Gas.get_operation_gas "complex_operation" in
let* waterfall_gas = Gas.get_operation_gas "waterfall_operation" in

(* Policy factory gas *)
let* premium_gas = Gas.get_policy_factory_gas () in

(* Vault operation gas *)
let* deposit_gas = Gas.get_vault_gas "deposit" in
let* withdrawal_gas = Gas.get_vault_gas "withdrawal" in

(* Environment multiplier (1.0 dev, 1.2 prod) *)
let* multiplier = Gas.get_environment_multiplier () in
let adjusted_gas = Float.to_int (Float.of_int gas *. multiplier) in
```

**JSON Path:**
```json
// gas_config.json
{
  "contract_operations": {
    "simple_message": {
      "amount_nanoton": 10000000  // 0.01 TON
    },
    "complex_operation": {
      "amount_nanoton": 50000000  // 0.05 TON
    },
    "waterfall_operation": {
      "amount_nanoton": 150000000  // 0.15 TON
    }
  },
  "policy_factory": {
    "minimum_premium_gas": 50000000
  },
  "multi_tranche_vault": {
    "deposit_gas": 100000000,
    "withdrawal_gas": 50000000
  },
  "environment_multipliers": {
    "development": 1.0,
    "production": 1.2
  }
}
```

### Retry Policies

```ocaml
(* Get retry attempts for a service *)
let* max_attempts = Retry.get_max_attempts "http_client" in
let* oracle_attempts = Retry.get_max_attempts "oracle_aggregator" in

(* Get backoff delays *)
let* delays = Retry.get_backoff_delays "http_client" in
(* Returns: [1.0; 2.0; 4.0] *)

(* Circuit breaker threshold *)
let* threshold = Retry.get_circuit_breaker_threshold () in
```

**JSON Path:**
```json
// retry_policies.json
{
  "http_client": {
    "retry_attempts": 3,
    "retry_delays_seconds": [1.0, 2.0, 4.0],
    "backoff_strategy": "exponential"
  },
  "oracle_aggregator": {
    "retry_attempts": 3,
    "timeout_per_attempt_seconds": 10.0
  },
  "circuit_breaker": {
    "failure_threshold": 5,
    "success_threshold": 2,
    "timeout_seconds": 60.0
  }
}
```

### Pool Sizes

```ocaml
(* Database connection pool *)
let* pool_size = Pools.get_database_pool_size () in

(* Worker threads *)
let* workers = Pools.get_worker_threads () in

(* Rate limit per minute *)
let* rate_limit = Pools.get_rate_limit_per_minute () in

(* Max concurrent requests *)
let* max_concurrent = Pools.get_max_concurrent_requests () in
```

**JSON Path:**
```json
// pool_sizes.json
{
  "database": {
    "default_pool_size": 10
  },
  "worker_threads": {
    "default_workers": 4
  },
  "rate_limits": {
    "requests_per_minute_per_ip": 100
  },
  "http_client": {
    "max_concurrent_requests": 100
  }
}
```

### Thresholds

```ocaml
(* Circuit breaker thresholds *)
let* max_price_change = Thresholds.get_circuit_breaker_price_change_max () in

(* Utilization thresholds *)
let* critical_util = Thresholds.get_utilization_threshold "critical" in
let* high_util = Thresholds.get_utilization_threshold "high" in

(* Oracle staleness *)
let* staleness = Thresholds.get_oracle_staleness_critical () in

(* Treasury reserve *)
let* min_reserve = Thresholds.get_min_reserve_balance () in

(* Vault lock timeout *)
let* lock_timeout = Thresholds.get_vault_lock_timeout () in
```

**JSON Path:**
```json
// thresholds.json
{
  "circuit_breaker": {
    "price_change_max_percent": 50.0,
    "failure_count_threshold": 5
  },
  "risk_management": {
    "utilization_critical_percent": 90.0,
    "utilization_high_percent": 75.0
  },
  "oracle_monitoring": {
    "staleness_critical_seconds": 300
  },
  "treasury_management": {
    "min_reserve_balance_ton": 1000
  },
  "vault_operations": {
    "lock_timeout_seconds": 60
  }
}
```

## Environment-Specific Overrides

### Development
```json
// development.json
{
  "timeouts": {
    "ton_client_seconds": 60  // Longer for debugging
  },
  "pools": {
    "database_pool_size": 5,  // Smaller for dev
    "worker_threads": 2
  },
  "thresholds": {
    "circuit_breaker_failures": 10  // More lenient
  }
}
```

### Production
```json
// production.json
{
  "gas": {
    "environment_multiplier": 1.2  // 20% safety buffer
  },
  "pools": {
    "database_pool_size": 50,  // Large for load
    "worker_threads": 16
  },
  "thresholds": {
    "circuit_breaker_failures": 5  // Strict
  },
  "security": {
    "require_multi_sig": true
  }
}
```

## Priority Order

Configuration values are resolved in this order (highest to lowest):

1. **Environment Variable** - `TONSURANCE_CATEGORY_PATH_TO_VALUE`
2. **Environment-Specific Config** - `development.json`, `staging.json`, or `production.json`
3. **Base Config File** - `timeouts.json`, `gas_config.json`, etc.
4. **Default Value** - Hardcoded in `config_manager.ml`

## Hot-Reload

```ocaml
(* Reload configuration without restarting *)
let* () = Config_manager.reload_config () in

(* New values will be used for subsequent calls *)
let* new_timeout = Timeouts.get_ton_client_timeout () in
```

**CLI:**
```bash
# Edit config file
vim backend/config/timeouts.json

# Send reload signal (if service supports it)
kill -HUP <pid>

# Or call reload endpoint
curl -X POST http://localhost:8080/admin/reload-config
```

## Validation

```ocaml
(* Validate all configuration *)
let* result = Config_manager.validate_config () in
match result with
| Ok () -> Logs.info (fun m -> m "Config valid")
| Error msg -> Logs.err (fun m -> m "Config invalid: %s" msg)
```

## Monitoring

```ocaml
(* Get configuration summary *)
let* summary = Config_manager.get_config_summary () in
(* Returns JSON with environment, loaded_at, uptime, config_files *)
```

## On-Chain Configuration (FunC)

Smart contracts use the `ConfigRegistry` contract:

```func
;; Get gas configuration
(int, int, int, int, int) gas_config = get_gas_config();

;; Get timeout configuration
(int, int, int, int) timeouts = get_timeout_config();

;; Get Treasury splits
(int, int, int) splits = get_treasury_splits();

;; Get specific gas amount
int gas = get_gas_for_operation(3);  ;; 3 = complex operation
```

Update on-chain config:
```typescript
// Update gas config (admin only)
await configRegistry.sendUpdateGasConfig(
  simpleMsg, standardOp, complexOp, heavyOp, waterfallOp
);

// Update timeout config
await configRegistry.sendUpdateTimeoutConfig(
  lockTimeout, quoteValidity, oracleStaleness, oracleInterval
);
```

## Troubleshooting

### Config not loading
```ocaml
(* Check if config is initialized *)
let* () = Config_manager.initialize () in
let* () = Config_manager.ensure_config_loaded () in
```

### Wrong values
```bash
# Check environment
echo $TONSURANCE_ENV

# Check for env var overrides
env | grep TONSURANCE_

# Validate config
./scripts/validate_config.sh
```

### Performance
```ocaml
(* Config is cached, so repeated calls are cheap *)
let* timeout1 = Timeouts.get_ton_client_timeout () in  (* Loads from file *)
let* timeout2 = Timeouts.get_ton_client_timeout () in  (* Returns cached value *)
```

## Best Practices

1. **Always initialize** - Call `Config_manager.initialize ()` at startup
2. **Use type-safe accessors** - Use `Timeouts.get_*`, `Gas.get_*` modules
3. **Provide defaults** - Always specify a sensible default value
4. **Environment-specific tuning** - Adjust for dev/staging/prod
5. **Monitor config changes** - Log when config is reloaded
6. **Validate on startup** - Call `validate_config ()` before running
7. **Use env vars for secrets** - Never commit API keys to JSON files

## See Also

- [Full Configuration Guide](./CONFIG_GUIDE.md)
- [Migration Guide](./migration_example.ml)
- [Example Service Integration](./example_service.ml)
