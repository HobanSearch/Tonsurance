# Oracle Integration Quick Start Guide

## Overview

Tonsurance uses a **median-of-3 oracle consensus** combining:
- **Chainlink** (on-chain price feeds)
- **Pyth Network** (high-frequency institutional data)
- **Binance Spot** (real market prices)

## Quick Usage

### Fetch Single Asset Price

```ocaml
open Oracle_aggregator.OracleAggregator

(* Get BTC consensus price *)
let%lwt consensus_opt = get_consensus_price BTC ~previous_price:None in

match consensus_opt with
| Some consensus ->
    Printf.printf "BTC Price: $%.2f\n" consensus.price;
    Printf.printf "Confidence: %.2f\n" consensus.confidence;
    Printf.printf "Sources: %d\n" consensus.num_sources;
| None ->
    Printf.printf "Failed to get consensus price\n"
```

### Fetch Multiple Assets (Batch)

```ocaml
let assets = [USDC; USDT; DAI; FRAX; BUSD] in

let%lwt results = Lwt_list.map_p (fun asset ->
  get_consensus_price asset ~previous_price:None
) assets in

List.iter results ~f:(function
  | Some consensus ->
      Printf.printf "%s: $%.6f (conf: %.2f)\n"
        (asset_to_string consensus.asset)
        consensus.price
        consensus.confidence
  | None -> ()
)
```

### Use Individual Oracle (Fallback)

```ocaml
(* Chainlink only *)
let%lwt chainlink_price =
  Chainlink_client.ChainlinkClient.fetch_chainlink_price ~config ~feed
in

(* Pyth only *)
let%lwt pyth_price = Pyth_client.PythClient.get_price BTC in

(* Binance only *)
let%lwt binance_price =
  Oracle_aggregator.OracleAggregator.fetch_binance_price BTC
in
```

## Configuration

### Chainlink RPC Endpoints

```ocaml
let config = {
  rpc_endpoints = [
    (Ethereum, [
      "https://eth-mainnet.g.alchemy.com/v2/YOUR-API-KEY";
      "https://mainnet.infura.io/v3/YOUR-API-KEY";
      "https://cloudflare-eth.com"; (* Public fallback *)
    ]);
  ];
  retry_attempts = 3;
  timeout_seconds = 10.0;
  cache_ttl_seconds = 300; (* 5 minutes *)
}
```

### Oracle Aggregator Settings

```ocaml
let custom_config = {
  providers = [Chainlink; Pyth; Binance];
  weights = [
    (Chainlink, 0.35);
    (Pyth, 0.35);
    (Binance, 0.30);
  ];
  staleness_threshold = 300.0; (* 5 minutes *)
  outlier_threshold = 0.02; (* 2% *)
  min_sources = 2; (* Require at least 2 sources *)
  circuit_breaker_threshold = 0.05; (* 5% max change *)
}

let%lwt consensus = get_consensus_price ~config:custom_config BTC
```

## Response Format

### Consensus Price

```ocaml
type consensus_price = {
  asset: asset;
  price: float;                    (* Median price *)
  weighted_price: float;           (* Confidence-weighted average *)
  median_price: float;             (* Same as price *)
  std_deviation: float;            (* Spread between sources *)
  num_sources: int;                (* How many oracles responded *)
  sources: price_point list;       (* Individual oracle prices *)
  timestamp: float;                (* Unix timestamp *)
  confidence: float;               (* 0.0-1.0 quality score *)
  is_stale: bool;                  (* >5 minutes old *)
  has_anomaly: bool;               (* Outliers detected *)
}
```

### Individual Price Point

```ocaml
type price_point = {
  provider: oracle_provider;       (* Chainlink | Pyth | Binance *)
  asset: asset;
  price: float;
  timestamp: float;
  confidence: float;               (* Provider-specific confidence *)
  source_signature: string option; (* Cryptographic proof (if available) *)
}
```

## Error Handling

### Handle Missing Data

```ocaml
let%lwt price_opt = get_consensus_price USDC ~previous_price:None in

match price_opt with
| Some consensus when consensus.confidence >= 0.8 ->
    (* High confidence price available *)
    use_price consensus.price

| Some consensus ->
    (* Low confidence, use with caution *)
    Logs.warn (fun m -> m "Low confidence price: %.2f" consensus.confidence);
    use_price_with_warning consensus.price

| None ->
    (* No consensus, use fallback *)
    Logs.err (fun m -> m "No oracle consensus for USDC");
    use_fallback_price ()
```

### Circuit Breaker Handling

```ocaml
let previous_price = ref None in

let rec fetch_loop () =
  let%lwt consensus_opt = get_consensus_price BTC ~previous_price:!previous_price in

  match consensus_opt with
  | Some consensus ->
      previous_price := Some consensus.price;
      process_price consensus.price
  | None ->
      (* Circuit breaker triggered or all sources down *)
      Logs.err (fun m -> m "Circuit breaker triggered, using cached price");
      use_cached_price ()
  in

  let%lwt () = Lwt_unix.sleep 60.0 in
  fetch_loop ()
```

## Monitoring

### Health Check

```ocaml
(* Check Pyth health *)
let%lwt pyth_healthy = Pyth_client.PythClient.health_check () in

(* Check Chainlink health (by fetching a known feed) *)
let%lwt chainlink_data =
  Chainlink_client.ChainlinkClient.fetch_chainlink_price ~config ~feed
in
let chainlink_healthy = Option.is_some chainlink_data in

Printf.printf "Oracle Health:\n";
Printf.printf "  Pyth: %s\n" (if pyth_healthy then "✓" else "✗");
Printf.printf "  Chainlink: %s\n" (if chainlink_healthy then "✓" else "✗");
```

### Export Metrics

```ocaml
open Oracle_monitoring

(* Start monitoring *)
let%lwt () = start_monitoring
  ~interval_seconds:60.0
  ~assets:[BTC; ETH; USDC; USDT; DAI]
in

(* Export Prometheus metrics *)
let metrics_text = Metrics.export_prometheus () in
Printf.printf "%s\n" metrics_text;

(* Generate health report *)
let report = generate_health_report () in
Printf.printf "%s\n" report;
```

## Supported Assets

### Stablecoins (14)
- USDC, USDT, USDP, DAI
- FRAX, BUSD
- USDe, sUSDe, USDY
- PYUSD, GHO, LUSD
- crvUSD, mkUSD

### Cryptocurrencies (2)
- BTC, ETH

## Common Patterns

### Pattern 1: Continuous Price Monitoring

```ocaml
let monitor_prices () =
  let rec loop () =
    let%lwt prices = Pyth_client.PythClient.get_prices_batch
      [USDC; USDT; DAI]
    in

    List.iter prices ~f:(fun data ->
      Printf.printf "%s: $%.6f (age: %.0fs)\n"
        (asset_to_string data.asset)
        data.price
        (Unix.gettimeofday () -. data.publish_time)
    );

    let%lwt () = Lwt_unix.sleep 5.0 in
    loop ()
  in
  loop ()
```

### Pattern 2: Aggregated Price with Fallback

```ocaml
let get_price_with_fallback asset =
  (* Try consensus first *)
  let%lwt consensus_opt = get_consensus_price asset ~previous_price:None in

  match consensus_opt with
  | Some consensus -> Lwt.return (Some consensus.price)
  | None ->
      (* Fallback to Pyth *)
      let%lwt pyth_opt = Pyth_client.PythClient.get_price asset in
      match pyth_opt with
      | Some data -> Lwt.return (Some data.price)
      | None ->
          (* Fallback to cached or hardcoded *)
          Lwt.return (Some 1.0) (* For stablecoins *)
```

### Pattern 3: Price Validation

```ocaml
let validate_and_use_price consensus =
  (* Check staleness *)
  if consensus.is_stale then begin
    Logs.warn (fun m -> m "Price is stale");
    false
  end
  (* Check confidence *)
  else if consensus.confidence < 0.5 then begin
    Logs.warn (fun m -> m "Low confidence: %.2f" consensus.confidence);
    false
  end
  (* Check number of sources *)
  else if consensus.num_sources < 2 then begin
    Logs.warn (fun m -> m "Insufficient sources: %d" consensus.num_sources);
    false
  end
  (* Check for anomalies *)
  else if consensus.has_anomaly then begin
    Logs.warn (fun m -> m "Anomaly detected");
    false
  end
  else
    true
```

## Testing

### Run Integration Tests

```bash
# All oracle tests
dune exec backend/test/integration/test_oracle_integration.exe

# Expected output:
# ✓ Chainlink Tests: 3/3 passed
# ✓ Pyth Tests: 4/4 passed
# ✓ Aggregator Tests: 4/4 passed
# ✓ ALL TESTS PASSED
```

### Manual Testing

```bash
# Test Chainlink (fetch USDC price)
dune utop backend/integration
> open Chainlink_client.ChainlinkClient;;
> let config = { ... };;
> Lwt_main.run (fetch_chainlink_price ~config ~feed);;

# Test Pyth (fetch BTC price)
> open Pyth_client.PythClient;;
> Lwt_main.run (get_price BTC);;

# Test Aggregator (median-of-3)
> open Oracle_aggregator.OracleAggregator;;
> Lwt_main.run (get_consensus_price BTC ~previous_price:None);;
```

## Troubleshooting

### Issue: "No RPC endpoints configured"

**Solution:** Add Ethereum RPC endpoints to config
```ocaml
let config = {
  rpc_endpoints = [(Ethereum, ["https://cloudflare-eth.com"])];
  ...
}
```

### Issue: "All sources failed"

**Causes:**
1. Network connectivity issues
2. RPC rate limits exceeded
3. All oracles down (rare)

**Solution:**
- Check internet connection
- Verify API keys are valid
- Check RPC endpoint status
- Use cached prices as fallback

### Issue: "Circuit breaker triggered"

**Cause:** Price changed >5% from previous update (likely error)

**Solution:**
- Investigate price spike in logs
- If legitimate, increase `circuit_breaker_threshold`
- If error, wait for next update

### Issue: "Confidence too low"

**Causes:**
1. High divergence between sources
2. Stale data from some sources
3. Only 1-2 sources available

**Solution:**
- Check individual source health
- Wait for next update
- Use fallback price if urgent

## Best Practices

### 1. Always Check Confidence

```ocaml
match consensus_opt with
| Some c when c.confidence >= 0.8 -> (* Use price *)
| _ -> (* Use fallback *)
```

### 2. Log All Price Updates

```ocaml
Logs.info (fun m ->
  m "Price updated: %s = $%.6f (sources: %d, conf: %.2f)"
    (asset_to_string asset) price num_sources confidence
)
```

### 3. Cache Prices Locally

```ocaml
let price_cache = Hashtbl.create (module Asset) in

let get_or_fetch asset =
  match Hashtbl.find price_cache asset with
  | Some (price, timestamp) when Unix.time () -. timestamp < 300.0 ->
      Lwt.return (Some price)
  | _ ->
      let%lwt consensus_opt = get_consensus_price asset in
      Option.iter consensus_opt ~f:(fun c ->
        Hashtbl.set price_cache ~key:asset ~data:(c.price, Unix.time ())
      );
      Lwt.return (Option.map consensus_opt ~f:(fun c -> c.price))
```

### 4. Monitor Staleness

```ocaml
if consensus.is_stale then
  Logs.warn (fun m ->
    m "Stale price for %s (age: %.0fs)"
      (asset_to_string asset)
      (Unix.time () -. consensus.timestamp)
  )
```

### 5. Handle Circuit Breaker Gracefully

```ocaml
let fetch_with_circuit_breaker asset previous_price =
  let%lwt consensus_opt = get_consensus_price asset ~previous_price in

  match consensus_opt, previous_price with
  | None, Some prev_price ->
      Logs.warn (fun m -> m "Circuit breaker, using previous price");
      Lwt.return (Some prev_price)
  | None, None ->
      Logs.err (fun m -> m "No price available");
      Lwt.return None
  | Some consensus, _ ->
      Lwt.return (Some consensus.price)
```

## Performance Tips

### 1. Use Caching

All oracle clients have built-in 5-minute caching. Don't disable it.

### 2. Batch Requests

```ocaml
(* Good: Parallel fetching *)
let%lwt prices = Lwt_list.map_p get_consensus_price assets in

(* Bad: Sequential fetching *)
let prices = ref [] in
List.iter assets ~f:(fun asset ->
  let%lwt p = get_consensus_price asset in
  prices := p :: !prices
)
```

### 3. Reuse Connections

Cohttp reuses HTTP connections automatically. Don't create new clients per request.

### 4. Monitor Cache Hit Rate

```ocaml
(* Cache hits should be >80% for 60s update interval *)
let cache_hits = Metrics.cache_hits () in
let cache_misses = Metrics.cache_misses () in
let hit_rate = Float.of_int cache_hits /. Float.of_int (cache_hits + cache_misses) in

if hit_rate < 0.8 then
  Logs.warn (fun m -> m "Low cache hit rate: %.2f" hit_rate)
```

## Support

**Documentation:**
- Full report: `/backend/ORACLE_INTEGRATION_REPORT.md`
- Grafana dashboard: `/docs/ORACLE_GRAFANA_DASHBOARD.json`
- Integration tests: `/backend/test/integration/test_oracle_integration.ml`

**Monitoring:**
- Prometheus: `http://localhost:9090/metrics`
- Grafana: `http://localhost:3000/d/oracle-dashboard`
- PagerDuty: Alerts for critical issues

**Logs:**
```bash
# View oracle logs
journalctl -u tonsurance-backend | grep -i oracle

# Filter by severity
journalctl -u tonsurance-backend | grep "ERROR.*oracle"
```
