# Resilient HTTP Infrastructure - Quick Start Guide

## Table of Contents
1. [5-Minute Quick Start](#5-minute-quick-start)
2. [Configuration](#configuration)
3. [Usage Examples](#usage-examples)
4. [Monitoring](#monitoring)
5. [Troubleshooting](#troubleshooting)

---

## 5-Minute Quick Start

### Step 1: Import the Module

```ocaml
open Resilient_http_client.ResilientHttpClient
```

### Step 2: Create a Client

```ocaml
let create_ton_client () =
  let config = {
    name = "ton_rpc";
    endpoints = [
      "https://toncenter.com/api/v2";
      "https://ton-api.io/api/v2";
    ];
    timeout_seconds = 30.0;
    retry_policy = default_retry_policy;
    circuit_breaker = default_circuit_breaker_config;
    pool = default_pool_config;
    default_headers = [("User-Agent", "Tonsurance/1.0")];
  } in
  ResilientHttpClient.create config
```

### Step 3: Make Requests

```ocaml
let%lwt ton_client = create_ton_client () in

(* GET request *)
let%lwt result = ResilientHttpClient.get ton_client "/getAddressInformation?address=..." in

(* GET with JSON parsing *)
let%lwt json_result = ResilientHttpClient.get_json ton_client "/getAddressInformation?address=..." in

(* POST with JSON *)
let body = `Assoc [("method", `String "runGetMethod")] in
let%lwt json_result = ResilientHttpClient.post_json ton_client ~body "/jsonRPC" in
```

### Step 4: Handle Results

```ocaml
match result with
| Ok response ->
    (* Success: use response.body, response.status_code, response.metrics *)
    Lwt.return ()
| Error (Timeout msg) ->
    Logs.warn (fun m -> m "Timeout: %s" msg);
    Lwt.return ()
| Error (ConnectionError msg) ->
    Logs.err (fun m -> m "Connection error: %s" msg);
    Lwt.return ()
| Error (HttpError (code, msg)) ->
    Logs.err (fun m -> m "HTTP %d: %s" code msg);
    Lwt.return ()
| Error (CircuitOpen msg) ->
    Logs.err (fun m -> m "Circuit breaker open: %s" msg);
    Lwt.return ()
| Error _ ->
    Logs.err (fun m -> m "Unknown error");
    Lwt.return ()
```

---

## Configuration

### Load from JSON File

```ocaml
let load_http_config service_name =
  let json = Yojson.Safe.from_file "backend/config/http_clients.json" in
  let open Yojson.Safe.Util in
  let service_json = json |> member service_name in

  {
    name = service_json |> member "name" |> to_string;
    endpoints = service_json |> member "endpoints" |> to_list |> List.map ~f:to_string;
    timeout_seconds = service_json |> member "timeout_seconds" |> to_float;
    (* ... parse rest of config *)
  }

let ton_client =
  let config = load_http_config "ton_client" in
  ResilientHttpClient.create config
```

### Environment Variable Overrides

```ocaml
let get_timeout () =
  match Sys.getenv "HTTP_TIMEOUT" with
  | Some s -> Float.of_string s
  | None -> 30.0

let config = { config with timeout_seconds = get_timeout () }
```

### Per-Service Tuning

```ocaml
(* Critical service: aggressive retries *)
let binance_config = {
  default_config () with
  retry_policy = {
    max_attempts = 5;
    base_delay_ms = 500;
    max_delay_ms = 15000;
    backoff_multiplier = 2.0;
    jitter_factor = 0.3;
    retry_on_timeout = true;
    retry_on_connection_error = true;
    retry_on_5xx = true;
    retry_on_4xx = false;
  }
}

(* Non-critical service: fail fast *)
let analytics_config = {
  default_config () with
  retry_policy = {
    max_attempts = 1; (* No retries *)
    base_delay_ms = 0;
    max_delay_ms = 0;
    backoff_multiplier = 1.0;
    jitter_factor = 0.0;
    retry_on_timeout = false;
    retry_on_connection_error = false;
    retry_on_5xx = false;
    retry_on_4xx = false;
  }
}
```

---

## Usage Examples

### Example 1: Polymarket Order Execution

```ocaml
open Polymarket_http_client.PolymarketClient

let%lwt polymarket = create
  ~api_key:"your_api_key"
  ~api_secret:"your_secret"
in

(* Get market info *)
let%lwt market_result = get_market polymarket
  ~condition_id:"0x1234..."
in

match market_result with
| Ok market ->
    Printf.printf "YES price: %.4f\n" market.yes_price;

    (* Create market buy order *)
    let%lwt order_result = create_market_order polymarket
      ~market_id:"0x1234..."
      ~side:Buy
      ~size:100.0
    in

    (match order_result with
    | Ok order ->
        Printf.printf "Order created: %s\n" order.order_id;
        Lwt.return ()
    | Error e ->
        Logs.err (fun m -> m "Order failed: %s"
          (Sexp.to_string_mach (sexp_of_error_type e)));
        Lwt.return ())

| Error e ->
    Logs.err (fun m -> m "Failed to fetch market: %s"
      (Sexp.to_string_mach (sexp_of_error_type e)));
    Lwt.return ()
```

### Example 2: Binance Position Management

```ocaml
open Binance_http_client.BinanceFuturesClient

let%lwt binance = create
  ~api_key:"your_api_key"
  ~api_secret:"your_secret"
  ()
in

(* Check current position *)
let%lwt pos_result = get_position binance ~symbol:"TONUSDT" in

match pos_result with
| Ok (Some position) ->
    Printf.printf "Position: %s %.4f @ %.2f\n"
      (match position.side with Long -> "LONG" | Short -> "SHORT")
      position.size
      position.entry_price;

    (* Close position if unrealized PnL < -1000 *)
    if position.unrealized_pnl < -1000.0 then begin
      let%lwt close_result = close_position binance ~symbol:"TONUSDT" in
      match close_result with
      | Ok true -> Logs.info (fun m -> m "Position closed (stop loss)"); Lwt.return ()
      | _ -> Lwt.return ()
    end else
      Lwt.return ()

| Ok None ->
    (* No position - open one *)
    let%lwt order_result = create_market_order binance
      ~symbol:"TONUSDT"
      ~side:Buy
      ~quantity:100.0
    in
    Lwt.return ()

| Error e ->
    Logs.err (fun m -> m "Position check failed: %s"
      (Sexp.to_string_mach (sexp_of_error_type e)));
    Lwt.return ()
```

### Example 3: Chainlink Price Feeds

```ocaml
open Chainlink_http_client.ChainlinkClient

let%lwt chainlink = create () in

(* Get multiple prices in parallel *)
let%lwt prices_result = get_prices chainlink
  ~asset_pairs:["ETH/USD"; "BTC/USD"; "USDT/USD"]
in

match prices_result with
| Ok feeds ->
    List.iter feeds ~f:(fun feed ->
      if is_price_stale feed then
        Logs.warn (fun m -> m "%s price is stale!" feed.asset_pair)
      else
        Printf.printf "%s: $%.2f (updated: %Ld)\n"
          feed.asset_pair
          feed.price
          feed.updated_at
    );
    Lwt.return ()

| Error e ->
    Logs.err (fun m -> m "Failed to fetch prices: %s"
      (Sexp.to_string_mach (sexp_of_error_type e)));
    Lwt.return ()
```

### Example 4: PostgreSQL Connection Pool

```ocaml
open Db.Connection_pool.ConnectionPool

(* Create pool on startup *)
let db_uri = Uri.of_string "postgresql://user:pass@localhost:5432/tonsurance" in
let%lwt pool = create db_uri in

(* Start health checks *)
let () = start_health_check pool in

(* Use connection with auto-release *)
let%lwt result = with_connection pool (fun db ->
  let query = Caqti_request.collect
    Caqti_type.unit
    Caqti_type.(tup2 int string)
    "SELECT id, name FROM policies WHERE active = true"
  in
  db#collect_list query ()
) in

match result with
| Ok policies ->
    List.iter policies ~f:(fun (id, name) ->
      Printf.printf "Policy %d: %s\n" id name
    );
    Lwt.return ()
| Error msg ->
    Logs.err (fun m -> m "Query failed: %s" msg);
    Lwt.return ()

(* Check pool health *)
let%lwt () = print_stats pool in

(* Cleanup on shutdown *)
let%lwt () = close pool in
Lwt.return ()
```

---

## Monitoring

### Real-Time Metrics

```ocaml
(* Print metrics every 60 seconds *)
let rec metrics_loop client =
  let%lwt () = Lwt_unix.sleep 60.0 in
  let%lwt metrics_str = ResilientHttpClient.get_metrics client in
  Logs.info (fun m -> m "[Metrics] %s" metrics_str);
  metrics_loop client
in
Lwt.async (fun () -> metrics_loop ton_client)
```

**Example output**:
```
[Metrics] Total: 1234 | Success: 1200 (97.2%) | Failed: 34 | Retries: 89 | Avg: 145.3ms | Timeouts: 12 | ConnErr: 8 | HttpErr: 14
```

### Circuit Breaker State

```ocaml
let%lwt state = ResilientHttpClient.get_circuit_state client in
match state with
| Closed ->
    Logs.info (fun m -> m "Circuit: CLOSED (healthy)")
| Open reset_time ->
    let now = Unix.gettimeofday () in
    Logs.warn (fun m -> m "Circuit: OPEN (resets in %.0fs)" (reset_time -. now))
| HalfOpen ->
    Logs.info (fun m -> m "Circuit: HALF_OPEN (testing recovery)")
```

### Connection Pool Stats

```ocaml
let%lwt (total, in_use, idle) = ResilientHttpClient.get_pool_stats client in
Logs.info (fun m -> m "Pool: %d total, %d active, %d idle" total in_use idle)
```

### Database Pool Stats

```ocaml
let%lwt stats = ConnectionPool.get_stats pool in
Printf.printf "DB Pool:\n";
Printf.printf "  Total: %d connections\n" stats.total_connections;
Printf.printf "  Active: %d\n" stats.active_connections;
Printf.printf "  Idle: %d\n" stats.idle_connections;
Printf.printf "  Failed: %d\n" stats.failed_connections;
Printf.printf "  Waiting: %d threads\n" stats.waiting_threads;
Printf.printf "  Acquired: %d (lifetime)\n" stats.total_acquired;
Printf.printf "  Released: %d (lifetime)\n" stats.total_released;
Printf.printf "  Failures: %d (lifetime)\n" stats.total_failures
```

---

## Troubleshooting

### Issue 1: Requests Timing Out

**Symptoms**: `Error (Timeout "Request timeout after 30s")`

**Solutions**:

1. **Increase timeout**:
```ocaml
let config = { config with timeout_seconds = 60.0 }
```

2. **Check if endpoint is slow**:
```bash
curl -w "\nTime: %{time_total}s\n" https://toncenter.com/api/v2/getAddressInformation?address=...
```

3. **Enable debug logging**:
```ocaml
Logs.set_level (Some Logs.Debug);
```

---

### Issue 2: Circuit Breaker Stuck Open

**Symptoms**: All requests fail with `Error (CircuitOpen "Circuit breaker OPEN")`

**Solutions**:

1. **Check circuit state**:
```ocaml
let%lwt state = ResilientHttpClient.get_circuit_state client in
(* If Open, wait for timeout_seconds to elapse *)
```

2. **Increase failure threshold** (less sensitive):
```ocaml
let config = { config with
  circuit_breaker = { config.circuit_breaker with
    failure_threshold = 10; (* Was 5 *)
  }
}
```

3. **Decrease timeout** (faster recovery):
```ocaml
let config = { config with
  circuit_breaker = { config.circuit_breaker with
    timeout_seconds = 15.0; (* Was 30.0 *)
  }
}
```

---

### Issue 3: Connection Pool Exhausted

**Symptoms**: `Error (PoolExhausted "Failed to acquire connection")`

**Solutions**:

1. **Increase pool size**:
```ocaml
let config = { config with
  pool = { config.pool with
    max_connections = 20; (* Was 10 *)
  }
}
```

2. **Check for connection leaks**:
```ocaml
let%lwt (total, in_use, idle) = ResilientHttpClient.get_pool_stats client in
if in_use > 15 then
  Logs.warn (fun m -> m "High connection usage: %d/%d" in_use total)
```

3. **Force cleanup**:
```ocaml
let%lwt () = ResilientHttpClient.cleanup_idle_connections client in
```

---

### Issue 4: High Retry Rate

**Symptoms**: Metrics show `Retries: 500` for 100 requests

**Solutions**:

1. **Check if endpoint is flaky**:
```bash
# Run 100 requests and check failure rate
for i in {1..100}; do
  curl -w "%{http_code}\n" -o /dev/null -s https://toncenter.com/api/v2/...
done | sort | uniq -c
```

2. **Reduce retry attempts** (fail faster):
```ocaml
let config = { config with
  retry_policy = { config.retry_policy with
    max_attempts = 2; (* Was 3 *)
  }
}
```

3. **Add failover endpoints**:
```ocaml
let config = { config with
  endpoints = config.endpoints @ [
    "https://backup-endpoint.com";
  ]
}
```

---

### Issue 5: Database Connection Failures

**Symptoms**: `Error "Connection lost: server closed the connection"`

**Solutions**:

1. **Check PostgreSQL status**:
```bash
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
```

2. **Increase connection lifetime**:
```ocaml
let pool_config = { pool_config with
  max_connection_lifetime_seconds = 7200.0; (* 2 hours *)
}
```

3. **Enable health checks**:
```ocaml
ConnectionPool.start_health_check pool;
(* Will auto-detect and replace dead connections *)
```

4. **Manual health check**:
```ocaml
let%lwt () = ConnectionPool.health_check pool in
let%lwt () = ConnectionPool.cleanup_connections pool in
```

---

### Issue 6: Slow Queries

**Symptoms**: Database pool shows `Avg: 5000ms` per query

**Solutions**:

1. **Check pool stats**:
```ocaml
let%lwt stats = ConnectionPool.get_stats pool in
(* If waiting_threads > 0, pool is bottleneck *)
```

2. **Increase pool size**:
```ocaml
let pool_config = { pool_config with
  pool_size = 40; (* Was 20 *)
  max_overflow = 20; (* Was 10 *)
}
```

3. **Optimize queries** (add indexes):
```sql
CREATE INDEX idx_policies_active ON policies(active);
EXPLAIN ANALYZE SELECT * FROM policies WHERE active = true;
```

---

## Best Practices

### 1. Always Use `with_connection` for DB

**Bad** (connection leak risk):
```ocaml
let%lwt conn = ConnectionPool.acquire pool in
let%lwt result = db#find query () in
(* If exception here, connection never released! *)
let%lwt () = ConnectionPool.release pool conn in
```

**Good** (auto-release):
```ocaml
let%lwt result = ConnectionPool.with_connection pool (fun db ->
  db#find query ()
) in
(* Connection always released, even on exception *)
```

### 2. Handle All Error Cases

**Bad**:
```ocaml
let%lwt result = ResilientHttpClient.get client url in
match result with
| Ok response -> (* ... *)
| Error _ -> failwith "Request failed" (* Non-descriptive *)
```

**Good**:
```ocaml
match result with
| Ok response -> (* ... *)
| Error (Timeout msg) -> (* Specific handling *)
| Error (ConnectionError msg) -> (* Specific handling *)
| Error (HttpError (code, msg)) when code >= 500 -> (* Server error *)
| Error (HttpError (code, msg)) when code >= 400 -> (* Client error *)
| Error (CircuitOpen msg) -> (* Circuit breaker *)
| Error _ -> (* Other *)
```

### 3. Set Realistic Timeouts

**Bad**:
```ocaml
timeout_seconds = 300.0 (* 5 minutes - way too long *)
```

**Good**:
```ocaml
(* API calls: 10-30s *)
timeout_seconds = 15.0

(* Blockchain RPCs: 30-60s *)
timeout_seconds = 30.0

(* Internal services: 5-10s *)
timeout_seconds = 5.0
```

### 4. Monitor Circuit Breaker State

**Bad**: Ignore circuit breaker state

**Good**: Alert when circuit opens
```ocaml
let%lwt state = ResilientHttpClient.get_circuit_state client in
match state with
| Open _ ->
    (* Send alert to ops team *)
    Logs.err (fun m -> m "ALERT: Circuit breaker open for %s" config.name);
    Lwt.return ()
| _ -> Lwt.return ()
```

### 5. Use Appropriate Pool Sizes

| Service Type | Pool Size | Reasoning |
|--------------|-----------|-----------|
| High-throughput API (>100 req/s) | 20-50 | Handle burst traffic |
| Blockchain RPC (10-50 req/s) | 10-20 | Rate-limited by endpoint |
| Database queries (constant) | 20-40 | Match DB connection limit |
| Background jobs (low priority) | 5-10 | Don't hog resources |

---

## Performance Tips

### 1. Parallel Requests

**Slow** (sequential):
```ocaml
let%lwt price1 = get_price "ETH/USD" in
let%lwt price2 = get_price "BTC/USD" in
let%lwt price3 = get_price "USDT/USD" in
(* Total time: 3 × latency *)
```

**Fast** (parallel):
```ocaml
let%lwt prices = Lwt_list.map_p (fun pair ->
  get_price pair
) ["ETH/USD"; "BTC/USD"; "USDT/USD"] in
(* Total time: max(latency1, latency2, latency3) *)
```

### 2. Batch Database Queries

**Slow** (N+1 query problem):
```ocaml
let%lwt policies = get_all_policies () in
let%lwt prices = Lwt_list.map_s (fun policy ->
  get_policy_price policy.id (* N queries *)
) policies in
```

**Fast** (batch query):
```ocaml
let%lwt policies = get_all_policies () in
let policy_ids = List.map policies ~f:(fun p -> p.id) in
let%lwt prices = get_policy_prices_batch policy_ids in (* 1 query *)
```

### 3. Cache Hot Data

```ocaml
let price_cache = Hashtbl.create (module String) in
let cache_ttl = 60.0 (* 1 minute *)

let get_price_cached asset_pair =
  match Hashtbl.find price_cache asset_pair with
  | Some (price, timestamp) when Unix.time () -. timestamp < cache_ttl ->
      Lwt.return (Ok price)
  | _ ->
      let%lwt result = get_price asset_pair in
      (match result with
      | Ok price ->
          Hashtbl.set price_cache ~key:asset_pair ~data:(price, Unix.time ())
      | _ -> ());
      Lwt.return result
```

---

## Quick Reference Card

### Client Creation
```ocaml
let client = ResilientHttpClient.create config
```

### HTTP Methods
```ocaml
get client url
post client ~body url
put client ~body url
delete client url
get_json client url
post_json client ~body url
```

### Database Pool
```ocaml
let%lwt pool = ConnectionPool.create db_uri
with_connection pool (fun db -> ...)
```

### Monitoring
```ocaml
get_metrics client
get_circuit_state client
get_pool_stats client
health_check client
```

### Error Handling
```ocaml
match result with
| Ok response -> ...
| Error (Timeout _) -> ...
| Error (ConnectionError _) -> ...
| Error (HttpError (code, msg)) -> ...
| Error (CircuitOpen _) -> ...
| Error _ -> ...
```

---

## Support

- **Documentation**: `/Users/ben/Documents/Work/HS/Application/Tonsurance/RESILIENT_HTTP_IMPLEMENTATION_REPORT.md`
- **Tests**: `dune exec backend/test/resilient_http_client_test.exe`
- **Configuration**: `backend/config/http_clients.json`

---

**Last Updated**: 2025-10-16
