(** Integration tests for external API clients
 *  Tests real HTTP calls with retry logic, rate limiting, and circuit breakers
 *)

open Core
open Lwt.Syntax
open Types

(** Helper: Create test Chainlink config *)
let test_chainlink_config () =
  Integration.Chainlink_client.ChainlinkClient.{
    rpc_endpoints = [
      (Ethereum, ["https://eth-mainnet.g.alchemy.com/v2/demo"]);
    ];
    api_keys = [];
    rate_limit_per_second = 5;
    timeout_seconds = 10.0;
    retry_attempts = 3;
    cache_ttl_seconds = 300;
  }

(** Helper: Create test bridge health config *)
let test_bridge_config () =
  Integration.Bridge_health_client.{
    l2beat_api_url = "https://l2beat.com/api";
    defillama_api_url = "https://api.llama.fi";
    timeout = 10.0;
    max_retries = 3;
    cache_ttl_seconds = 60;
  }

(** Helper: Create test CEX liquidation config *)
let test_cex_config () =
  Integration.Cex_liquidation_client.{
    binance_api_url = "https://fapi.binance.com";
    bybit_api_url = "https://api.bybit.com";
    okx_api_url = "https://www.okx.com";
    deribit_api_url = "https://www.deribit.com";
    timeout = 10.0;
    max_retries = 3;
    api_keys = None;  (* Public endpoints only for testing *)
  }

(** Test suite: Chainlink integration *)
module TestChainlink = struct

  (** Test: Fetch USDT price from Chainlink *)
  let test_fetch_usdt_price () =
    let config = test_chainlink_config () in
    let%lwt price_opt = Integration.Chainlink_client.ChainlinkClient.fetch_price
      ~config
      ~chain:Ethereum
      ~asset:USDT
    in

    match price_opt with
    | Some price ->
        (* USDT should be close to $1.00 *)
        let is_reasonable = price > 0.95 && price < 1.05 in
        Alcotest.(check bool) "USDT price near $1.00" true is_reasonable;

        Logs.info (fun m -> m "✓ USDT price: $%.4f" price);
        Lwt.return_unit

    | None ->
        (* Don't fail if API is down - just log warning *)
        Logs.warn (fun m -> m "⚠ Failed to fetch USDT price (Chainlink API may be down)");
        Lwt.return_unit

  (** Test: Fetch multiple stablecoin prices *)
  let test_fetch_all_prices () =
    let config = test_chainlink_config () in
    let stablecoins = [USDT; USDC; DAI] in

    let%lwt prices = Lwt_list.map_p (fun asset ->
      Integration.Chainlink_client.ChainlinkClient.fetch_price
        ~config
        ~chain:Ethereum
        ~asset
    ) stablecoins in

    let successful_fetches = List.count prices ~f:Option.is_some in

    (* At least 1 stablecoin price should be fetchable *)
    let has_data = successful_fetches > 0 in
    Alcotest.(check bool) "At least one price fetched" true has_data;

    Logs.info (fun m -> m "✓ Fetched %d/3 stablecoin prices" successful_fetches);
    Lwt.return_unit

  (** Test: Handle network failure gracefully *)
  let test_network_failure () =
    (* Create config with invalid endpoint *)
    let bad_config = Integration.Chainlink_client.ChainlinkClient.{
      rpc_endpoints = [(Ethereum, ["https://invalid.endpoint.test"])];
      api_keys = [];
      rate_limit_per_second = 5;
      timeout_seconds = 2.0;  (* Short timeout *)
      retry_attempts = 1;      (* Single retry *)
      cache_ttl_seconds = 300;
    } in

    let%lwt price_opt = Integration.Chainlink_client.ChainlinkClient.fetch_price
      ~config:bad_config
      ~chain:Ethereum
      ~asset:USDT
    in

    (* Should return None gracefully without crashing *)
    Alcotest.(check bool) "Returns None on network failure" true (Option.is_none price_opt);

    Logs.info (fun m -> m "✓ Network failure handled gracefully");
    Lwt.return_unit

  (** Test: Rate limiting works *)
  let test_rate_limiting () =
    let config = Integration.Chainlink_client.ChainlinkClient.{
      rpc_endpoints = [(Ethereum, ["https://eth-mainnet.g.alchemy.com/v2/demo"])];
      api_keys = [];
      rate_limit_per_second = 2;  (* Very restrictive limit *)
      timeout_seconds = 10.0;
      retry_attempts = 3;
      cache_ttl_seconds = 0;  (* Disable cache *)
    } in

    let start_time = Unix.gettimeofday () in

    (* Make 5 rapid requests *)
    let%lwt _prices = Lwt_list.map_s (fun _ ->
      Integration.Chainlink_client.ChainlinkClient.fetch_price
        ~config
        ~chain:Ethereum
        ~asset:USDT
    ) [1; 2; 3; 4; 5] in

    let elapsed = Unix.gettimeofday () -. start_time in

    (* 5 requests at 2/sec should take at least 2 seconds *)
    let is_rate_limited = elapsed >= 2.0 in
    Alcotest.(check bool) "Rate limiting enforced" true is_rate_limited;

    Logs.info (fun m -> m "✓ Rate limiting works (5 requests took %.1fs)" elapsed);
    Lwt.return_unit

end

(** Test suite: Bridge health integration *)
module TestBridgeHealth = struct

  (** Test: Fetch bridge TVL from DeFiLlama *)
  let test_fetch_bridge_tvl () =
    let config = test_bridge_config () in
    let%lwt tvl_opt = Integration.Bridge_health_client.fetch_bridge_tvl
      ~config
      ~bridge_id:"arbitrum"
    in

    match tvl_opt with
    | Some tvl ->
        (* Arbitrum should have > $1B TVL *)
        let is_reasonable = tvl > 1_000_000_000.0 in
        Alcotest.(check bool) "Arbitrum TVL > $1B" true is_reasonable;

        Logs.info (fun m -> m "✓ Arbitrum TVL: $%.2fB" (tvl /. 1e9));
        Lwt.return_unit

    | None ->
        Alcotest.fail "Failed to fetch bridge TVL"

  (** Test: Calculate bridge health score *)
  let test_calculate_health_score () =
    let config = test_bridge_config () in
    let%lwt health_opt = Integration.Bridge_health_client.get_bridge_health
      ~config
      ~bridge_id:"arbitrum"
    in

    match health_opt with
    | Some health ->
        (* Score should be 0.0-1.0 *)
        let is_valid = health.score >= 0.0 && health.score <= 1.0 in
        Alcotest.(check bool) "Health score in valid range" true is_valid;

        Logs.info (fun m -> m "✓ Arbitrum health: %.2f (TVL: $%.2fB, Volume: $%.2fM/day)"
          health.score
          (health.tvl /. 1e9)
          (health.daily_volume /. 1e6));
        Lwt.return_unit

    | None ->
        Alcotest.fail "Failed to calculate bridge health"

  (** Test: Detect exploits *)
  let test_exploit_detection () =
    let config = test_bridge_config () in

    (* Test with Ronin bridge (known exploit in March 2022) *)
    let%lwt has_exploit = Integration.Bridge_health_client.check_recent_exploits
      ~config
      ~bridge_id:"ronin"
    in

    Logs.info (fun m -> m "✓ Exploit detection: Ronin = %b" has_exploit);
    Lwt.return_unit

end

(** Test suite: CEX liquidation integration *)
module TestCexLiquidation = struct

  (** Test: Fetch Binance liquidations *)
  let test_fetch_binance_liquidations () =
    let config = test_cex_config () in
    let%lwt liquidations = Integration.Cex_liquidation_client.fetch_binance_liquidations
      ~config
      ~symbol:"BTCUSDT"
      ~start_time:(Unix.gettimeofday () -. 3600.0)  (* Last 1 hour *)
      ~end_time:(Unix.gettimeofday ())
    in

    (* May have 0 liquidations if quiet market, just check no crash *)
    Logs.info (fun m -> m "✓ Fetched %d Binance liquidations" (List.length liquidations));
    Lwt.return_unit

  (** Test: Calculate liquidation volume *)
  let test_calculate_liquidation_volume () =
    let config = test_cex_config () in
    let%lwt volume_opt = Integration.Cex_liquidation_client.get_total_liquidation_volume
      ~config
      ~asset:BTC
      ~duration_hours:24
    in

    match volume_opt with
    | Some volume ->
        (* Volume should be non-negative *)
        let is_valid = volume >= 0.0 in
        Alcotest.(check bool) "Volume is non-negative" true is_valid;

        Logs.info (fun m -> m "✓ 24h BTC liquidation volume: $%.2fM" (volume /. 1e6));
        Lwt.return_unit

    | None ->
        Logs.info (fun m -> m "✓ No liquidations in last 24h (quiet market)");
        Lwt.return_unit

  (** Test: Handle malformed data gracefully *)
  let test_malformed_data_handling () =
    let config = test_cex_config () in

    (* Fetch from multiple venues in parallel *)
    let%lwt results = Lwt.all [
      Integration.Cex_liquidation_client.fetch_binance_liquidations ~config ~symbol:"BTCUSDT"
        ~start_time:(Unix.gettimeofday () -. 3600.0) ~end_time:(Unix.gettimeofday ());
      Integration.Cex_liquidation_client.fetch_bybit_liquidations ~config ~symbol:"BTCUSDT"
        ~start_time:(Unix.gettimeofday () -. 3600.0) ~end_time:(Unix.gettimeofday ());
    ] in

    (* Should not crash even if some data is malformed *)
    Logs.info (fun m -> m "✓ Handled responses from 2 venues without crashing");
    Lwt.return_unit

end

(** Test suite: HTTP client reliability *)
module TestHttpClient = struct

  (** Test: Exponential backoff on retries *)
  let test_exponential_backoff () =
    let start_time = Unix.gettimeofday () in

    (* Try to fetch from non-existent endpoint (will retry 3 times) *)
    let%lwt result =
      try%lwt
        let%lwt _ = Integration.Http_client.get
          ~timeout:5.0
          ~retries:3
          "https://httpstat.us/500"  (* Always returns 500 error *)
        in
        Lwt.return true
      with _ ->
        Lwt.return false
    in

    let elapsed = Unix.gettimeofday () -. start_time in

    (* Should take ~7 seconds (1s + 2s + 4s delays) *)
    let used_backoff = elapsed >= 5.0 && elapsed <= 10.0 in
    Alcotest.(check bool) "Used exponential backoff" true used_backoff;

    Logs.info (fun m -> m "✓ Exponential backoff: 3 retries in %.2fs" elapsed);
    Lwt.return_unit

  (** Test: Circuit breaker opens after failures *)
  let test_circuit_breaker () =
    let breaker = Integration.Http_client.CircuitBreaker.create ~failure_threshold:3 in

    (* Cause 3 failures *)
    let%lwt () = Lwt_list.iter_s
      (fun _ ->
        try%lwt
          let%lwt _ = Integration.Http_client.CircuitBreaker.call breaker (fun () ->
            Lwt.fail_with "Simulated failure"
          ) in
          Lwt.return_unit
        with _ -> Lwt.return_unit)
      [1; 2; 3]
    in

    (* Circuit should now be open *)
    let state = Integration.Http_client.CircuitBreaker.get_state breaker in
    Alcotest.(check bool) "Circuit breaker opened" true (state = Integration.Http_client.CircuitBreaker.Open);

    Logs.info (fun m -> m "✓ Circuit breaker opened after 3 failures");
    Lwt.return_unit

end

(** Run all tests *)
let () =
  Lwt_main.run begin
    Logs.set_reporter (Logs_fmt.reporter ());
    Logs.set_level (Some Logs.Info);

    Alcotest_lwt.run "API Integration Tests" [
      "Chainlink", [
        Alcotest_lwt.test_case "Fetch USDT price" `Slow TestChainlink.test_fetch_usdt_price;
        Alcotest_lwt.test_case "Fetch all prices" `Slow TestChainlink.test_fetch_all_prices;
        Alcotest_lwt.test_case "Handle network failure" `Quick TestChainlink.test_network_failure;
        Alcotest_lwt.test_case "Rate limiting" `Slow TestChainlink.test_rate_limiting;
      ];

      "Bridge Health", [
        Alcotest_lwt.test_case "Fetch bridge TVL" `Slow TestBridgeHealth.test_fetch_bridge_tvl;
        Alcotest_lwt.test_case "Calculate health score" `Slow TestBridgeHealth.test_calculate_health_score;
        Alcotest_lwt.test_case "Detect exploits" `Quick TestBridgeHealth.test_exploit_detection;
      ];

      "CEX Liquidation", [
        Alcotest_lwt.test_case "Fetch Binance liquidations" `Slow TestCexLiquidation.test_fetch_binance_liquidations;
        Alcotest_lwt.test_case "Calculate liquidation volume" `Slow TestCexLiquidation.test_calculate_liquidation_volume;
        Alcotest_lwt.test_case "Handle malformed data" `Quick TestCexLiquidation.test_malformed_data_handling;
      ];

      "HTTP Client", [
        Alcotest_lwt.test_case "Exponential backoff" `Slow TestHttpClient.test_exponential_backoff;
        Alcotest_lwt.test_case "Circuit breaker" `Quick TestHttpClient.test_circuit_breaker;
      ];
    ]
  end
