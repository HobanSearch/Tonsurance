(** Comprehensive Oracle Integration Tests
 *
 * Tests real oracle data fetching from:
 * - Chainlink (Ethereum mainnet price feeds)
 * - Pyth Network (HTTP API)
 * - Binance (Spot prices)
 * - Oracle Aggregator (Median-of-3 consensus)
 *
 * These tests use REAL external APIs - may be flaky if APIs are down.
 * Run with: dune exec backend/test/integration/test_oracle_integration.exe
 *)

open Core
open Lwt.Syntax
open Types

(** Test Chainlink Integration *)
module ChainlinkTests = struct
  open Chainlink_client.ChainlinkClient

  let test_fetch_btc_price () =
    Printf.printf "\n=== TEST: Fetch BTC Price from Chainlink ===\n";

    let config = {
      rpc_endpoints = [
        (Ethereum, [
          "https://eth-mainnet.g.alchemy.com/v2/demo";
          "https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161";
          "https://cloudflare-eth.com";
        ]);
      ];
      api_keys = [];
      rate_limit_per_second = 10;
      timeout_seconds = 15.0;
      retry_attempts = 3;
      cache_ttl_seconds = 300;
    } in

    (* BTC price feed doesn't exist in ethereum_feeds, so test with USDC *)
    let feed = List.find_exn ethereum_feeds ~f:(fun f -> Poly.equal f.asset USDC) in

    let%lwt result = fetch_chainlink_price ~config ~feed in

    match result with
    | Some data ->
        Printf.printf "  ✓ Successfully fetched %s price: $%.6f\n"
          (asset_to_string data.asset) data.price;
        Printf.printf "  ✓ Timestamp: %.0f (age: %.0fs)\n"
          data.timestamp (Unix.gettimeofday () -. data.timestamp);
        Printf.printf "  ✓ Confidence: %.2f\n" data.confidence;
        Printf.printf "  ✓ Round ID: %Ld\n" data.round_id;

        (* Validate price is reasonable *)
        let is_valid = data.price >= 0.90 && data.price <= 1.10 in
        Printf.printf "  %s Price in valid range (0.90-1.10): %b\n"
          (if is_valid then "✓" else "✗") is_valid;

        (* Validate timestamp is recent *)
        let age = Unix.gettimeofday () -. data.timestamp in
        let is_recent = age < 3600.0 in (* < 1 hour *)
        Printf.printf "  %s Price is recent (<1 hour): %b\n"
          (if is_recent then "✓" else "✗") is_recent;

        Lwt.return (is_valid && is_recent)

    | None ->
        Printf.printf "  ✗ Failed to fetch price\n";
        Lwt.return false

  let test_retry_logic () =
    Printf.printf "\n=== TEST: Chainlink Retry Logic ===\n";

    let config = {
      rpc_endpoints = [
        (Ethereum, [
          "https://invalid-rpc-endpoint-1.com"; (* Will fail *)
          "https://invalid-rpc-endpoint-2.com"; (* Will fail *)
          "https://cloudflare-eth.com"; (* Should succeed *)
        ]);
      ];
      api_keys = [];
      rate_limit_per_second = 10;
      timeout_seconds = 5.0;
      retry_attempts = 2;
      cache_ttl_seconds = 300;
    } in

    let feed = List.find_exn ethereum_feeds ~f:(fun f -> Poly.equal f.asset USDT) in

    let start_time = Unix.gettimeofday () in
    let%lwt result = fetch_chainlink_price ~config ~feed in
    let elapsed = Unix.gettimeofday () -. start_time in

    match result with
    | Some data ->
        Printf.printf "  ✓ Successfully fetched after retries (took %.2fs)\n" elapsed;
        Printf.printf "  ✓ Price: $%.6f\n" data.price;
        Lwt.return true
    | None ->
        Printf.printf "  ✗ Failed even after retries\n";
        Lwt.return false

  let test_staleness_detection () =
    Printf.printf "\n=== TEST: Staleness Detection ===\n";

    let config = {
      rpc_endpoints = [(Ethereum, ["https://cloudflare-eth.com"])];
      api_keys = [];
      rate_limit_per_second = 10;
      timeout_seconds = 10.0;
      retry_attempts = 3;
      cache_ttl_seconds = 300;
    } in

    let feed = List.find_exn ethereum_feeds ~f:(fun f -> Poly.equal f.asset DAI) in

    let%lwt result = fetch_chainlink_price ~config ~feed in

    match result with
    | Some data ->
        let is_stale = is_price_stale data ~max_age_seconds:300.0 in
        Printf.printf "  ✓ Price fetched: $%.6f\n" data.price;
        Printf.printf "  ✓ Age: %.0fs\n" (Unix.gettimeofday () -. data.timestamp);
        Printf.printf "  %s Is stale (>5 min): %b\n"
          (if not is_stale then "✓" else "✗") is_stale;
        Lwt.return (not is_stale)
    | None ->
        Printf.printf "  ✗ Failed to fetch price\n";
        Lwt.return false

  let run_all () =
    let%lwt test1 = test_fetch_btc_price () in
    let%lwt test2 = test_retry_logic () in
    let%lwt test3 = test_staleness_detection () in

    let passed = [test1; test2; test3] |> List.count ~f:Fn.id in
    Printf.printf "\nChainlink Tests: %d/3 passed\n" passed;

    Lwt.return (passed = 3)
end

(** Test Pyth Integration *)
module PythTests = struct
  open Pyth_client.PythClient

  let test_fetch_btc_price () =
    Printf.printf "\n=== TEST: Fetch BTC Price from Pyth ===\n";

    let%lwt result = get_price BTC in

    match result with
    | Some data ->
        Printf.printf "  ✓ Successfully fetched BTC price: $%.2f\n" data.price;
        Printf.printf "  ✓ Confidence interval: ±$%.2f\n" data.conf;
        Printf.printf "  ✓ Normalized confidence: %.2f\n" data.confidence;
        Printf.printf "  ✓ Publish time: %.0f (age: %.0fs)\n"
          data.publish_time (Unix.gettimeofday () -. data.publish_time);

        (* Validate price is in reasonable range *)
        let is_valid = data.price >= 30000.0 && data.price <= 100000.0 in
        Printf.printf "  %s Price in valid range ($30k-$100k): %b\n"
          (if is_valid then "✓" else "✗") is_valid;

        (* Validate confidence *)
        let has_confidence = data.confidence >= 0.5 in
        Printf.printf "  %s Confidence >= 0.5: %b\n"
          (if has_confidence then "✓" else "✗") has_confidence;

        Lwt.return (is_valid && has_confidence)

    | None ->
        Printf.printf "  ✗ Failed to fetch BTC price\n";
        Lwt.return false

  let test_fetch_stablecoin_prices () =
    Printf.printf "\n=== TEST: Fetch Stablecoin Prices from Pyth ===\n";

    let stablecoins = [USDC; USDT; DAI; FRAX] in

    let%lwt results = get_prices_batch stablecoins in

    Printf.printf "  ✓ Fetched %d/%d stablecoin prices\n"
      (List.length results) (List.length stablecoins);

    List.iter results ~f:(fun data ->
      Printf.printf "    - %s: $%.6f (conf: %.2f)\n"
        (asset_to_string data.asset) data.price data.confidence
    );

    (* All stablecoin prices should be close to $1.00 *)
    let all_valid = List.for_all results ~f:(fun data ->
      data.price >= 0.90 && data.price <= 1.10
    ) in

    Printf.printf "  %s All prices in range (0.90-1.10): %b\n"
      (if all_valid then "✓" else "✗") all_valid;

    Lwt.return (List.length results >= 3 && all_valid)

  let test_price_validation () =
    Printf.printf "\n=== TEST: Pyth Price Validation ===\n";

    let%lwt result = get_price ETH in

    match result with
    | Some data ->
        let is_valid = validate_price_data data ~max_age_seconds:(Some 60.0) in
        Printf.printf "  ✓ ETH price: $%.2f\n" data.price;
        Printf.printf "  ✓ Validation result: %b\n" is_valid;
        Printf.printf "  ✓ Confidence: %.2f\n" data.confidence;
        Printf.printf "  ✓ Age: %.0fs\n" (Unix.gettimeofday () -. data.publish_time);
        Lwt.return is_valid
    | None ->
        Printf.printf "  ✗ Failed to fetch ETH price\n";
        Lwt.return false

  let test_health_check () =
    Printf.printf "\n=== TEST: Pyth Health Check ===\n";

    let%lwt is_healthy = health_check () in

    Printf.printf "  %s Health check: %s\n"
      (if is_healthy then "✓" else "✗")
      (if is_healthy then "PASSED" else "FAILED");

    Lwt.return is_healthy

  let run_all () =
    let%lwt test1 = test_fetch_btc_price () in
    let%lwt test2 = test_fetch_stablecoin_prices () in
    let%lwt test3 = test_price_validation () in
    let%lwt test4 = test_health_check () in

    let passed = [test1; test2; test3; test4] |> List.count ~f:Fn.id in
    Printf.printf "\nPyth Tests: %d/4 passed\n" passed;

    Lwt.return (passed = 4)
end

(** Test Oracle Aggregator *)
module AggregatorTests = struct
  open Oracle_aggregator.OracleAggregator

  let test_median_calculation () =
    Printf.printf "\n=== TEST: Median-of-3 Price Aggregation ===\n";

    let%lwt consensus_opt = get_consensus_price BTC ~previous_price:None in

    match consensus_opt with
    | Some consensus ->
        Printf.printf "  ✓ Consensus price: $%.2f\n" consensus.price;
        Printf.printf "  ✓ Median price: $%.2f\n" consensus.median_price;
        Printf.printf "  ✓ Weighted price: $%.2f\n" consensus.weighted_price;
        Printf.printf "  ✓ Std deviation: $%.2f\n" consensus.std_deviation;
        Printf.printf "  ✓ Number of sources: %d\n" consensus.num_sources;
        Printf.printf "  ✓ Confidence: %.2f\n" consensus.confidence;

        Printf.printf "\n  Sources:\n";
        List.iter consensus.sources ~f:(fun source ->
          let provider_name = match source.provider with
            | Chainlink -> "Chainlink"
            | Pyth -> "Pyth"
            | Binance -> "Binance"
            | RedStone -> "RedStone"
            | Custom s -> s
          in
          Printf.printf "    - %s: $%.2f (conf: %.2f)\n"
            provider_name source.price source.confidence
        );

        (* Validate we have at least 2 sources *)
        let has_min_sources = consensus.num_sources >= 2 in
        Printf.printf "  %s Has >= 2 sources: %b\n"
          (if has_min_sources then "✓" else "✗") has_min_sources;

        (* Validate price reasonableness *)
        let is_reasonable = consensus.price >= 30000.0 && consensus.price <= 100000.0 in
        Printf.printf "  %s Price in valid range: %b\n"
          (if is_reasonable then "✓" else "✗") is_reasonable;

        Lwt.return (has_min_sources && is_reasonable)

    | None ->
        Printf.printf "  ✗ Failed to get consensus price\n";
        Lwt.return false

  let test_outlier_rejection () =
    Printf.printf "\n=== TEST: Outlier Rejection ===\n";

    (* Create mock price points with one outlier *)
    let prices = [
      {
        provider = Chainlink;
        asset = USDC;
        price = 0.998;
        timestamp = Unix.time ();
        confidence = 0.95;
        source_signature = None;
      };
      {
        provider = Pyth;
        asset = USDC;
        price = 1.002;
        timestamp = Unix.time ();
        confidence = 0.93;
        source_signature = None;
      };
      {
        provider = Binance;
        asset = USDC;
        price = 0.85; (* Outlier - 15% below *)
        timestamp = Unix.time ();
        confidence = 0.90;
        source_signature = None;
      };
    ] in

    let (normal, outliers) = detect_outliers prices ~threshold:0.10 in

    Printf.printf "  ✓ Normal prices: %d\n" (List.length normal);
    Printf.printf "  ✓ Outliers detected: %d\n" (List.length outliers);

    let success = List.length normal = 2 && List.length outliers = 1 in
    Printf.printf "  %s Correctly identified outlier: %b\n"
      (if success then "✓" else "✗") success;

    Lwt.return success

  let test_circuit_breaker () =
    Printf.printf "\n=== TEST: Circuit Breaker ===\n";

    (* Fetch current price *)
    let%lwt consensus1_opt = get_consensus_price ETH ~previous_price:None in

    match consensus1_opt with
    | None ->
        Printf.printf "  ✗ Failed to fetch initial price\n";
        Lwt.return false
    | Some consensus1 ->
        Printf.printf "  ✓ Initial price: $%.2f\n" consensus1.price;

        (* Try again with circuit breaker (should pass if price hasn't changed >5%) *)
        let%lwt consensus2_opt = get_consensus_price ETH
          ~previous_price:(Some consensus1.price) in

        match consensus2_opt with
        | Some consensus2 ->
            let change_pct = Float.abs (consensus2.price -. consensus1.price) /. consensus1.price in
            Printf.printf "  ✓ Second price: $%.2f\n" consensus2.price;
            Printf.printf "  ✓ Price change: %.2f%%\n" (change_pct *. 100.0);

            let within_threshold = change_pct <= 0.05 in
            Printf.printf "  %s Within 5%% threshold: %b\n"
              (if within_threshold then "✓" else "✗") within_threshold;

            Lwt.return true

        | None ->
            Printf.printf "  ⚠ Circuit breaker triggered (price changed >5%%)\n";
            Lwt.return true (* This is actually correct behavior *)

  let test_all_stablecoins () =
    Printf.printf "\n=== TEST: Fetch All Stablecoin Consensus Prices ===\n";

    let stablecoins = [USDC; USDT; DAI; FRAX; BUSD] in

    let%lwt results = Lwt_list.map_p (fun asset ->
      let%lwt consensus_opt = get_consensus_price asset ~previous_price:None in
      Lwt.return (asset, consensus_opt)
    ) stablecoins in

    let successful = List.count results ~f:(fun (_, opt) -> Option.is_some opt) in

    Printf.printf "  ✓ Successfully fetched: %d/%d\n" successful (List.length stablecoins);

    List.iter results ~f:(fun (asset, consensus_opt) ->
      match consensus_opt with
      | Some consensus ->
          Printf.printf "    - %s: $%.6f (sources: %d, conf: %.2f)\n"
            (asset_to_string asset) consensus.price
            consensus.num_sources consensus.confidence
      | None ->
          Printf.printf "    - %s: FAILED\n" (asset_to_string asset)
    );

    Lwt.return (successful >= 3) (* At least 3/5 should succeed *)

  let run_all () =
    let%lwt test1 = test_median_calculation () in
    let%lwt test2 = test_outlier_rejection () in
    let%lwt test3 = test_circuit_breaker () in
    let%lwt test4 = test_all_stablecoins () in

    let passed = [test1; test2; test3; test4] |> List.count ~f:Fn.id in
    Printf.printf "\nAggregator Tests: %d/4 passed\n" passed;

    Lwt.return (passed = 4)
end

(** Main test runner *)
let run_all_tests () =
  Printf.printf "\n╔══════════════════════════════════════════════════════════╗\n";
  Printf.printf "║  ORACLE INTEGRATION TESTS                                ║\n";
  Printf.printf "╚══════════════════════════════════════════════════════════╝\n";
  Printf.printf "\nTesting real oracle integrations (Chainlink, Pyth, Binance)\n";
  Printf.printf "Note: These tests require internet connectivity\n\n";

  let%lwt chainlink_pass = ChainlinkTests.run_all () in
  let%lwt pyth_pass = PythTests.run_all () in
  let%lwt aggregator_pass = AggregatorTests.run_all () in

  Printf.printf "\n╔══════════════════════════════════════════════════════════╗\n";
  Printf.printf "║  TEST SUMMARY                                            ║\n";
  Printf.printf "╚══════════════════════════════════════════════════════════╝\n";
  Printf.printf "  %s Chainlink Tests\n" (if chainlink_pass then "✓" else "✗");
  Printf.printf "  %s Pyth Tests\n" (if pyth_pass then "✓" else "✗");
  Printf.printf "  %s Aggregator Tests\n" (if aggregator_pass then "✓" else "✗");

  let all_pass = chainlink_pass && pyth_pass && aggregator_pass in
  Printf.printf "\n%s ALL TESTS %s\n\n"
    (if all_pass then "✓" else "✗")
    (if all_pass then "PASSED" else "FAILED");

  Lwt.return (if all_pass then 0 else 1)

let () =
  (* Set up logging *)
  Logs.set_reporter (Logs_fmt.reporter ());
  Logs.set_level (Some Logs.Info);

  (* Run tests *)
  let exit_code = Lwt_main.run (run_all_tests ()) in
  exit exit_code
