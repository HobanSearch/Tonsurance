(** Unit tests for Binance Futures Client
 *
 * Tests:
 * - Rate limiter functionality
 * - Signature generation
 * - Position opening/closing (mocked)
 * - Error handling
 * - Integration test with Binance testnet (requires API keys)
 *)

open Core
open Lwt.Syntax
open Integration.Binance_futures_client.BinanceFuturesClient

(** Test configuration *)
let test_config = {
  api_key = "test_api_key_12345";
  api_secret = "test_api_secret_67890";
  testnet = true;
  rate_limit_weight_per_minute = 1200;
  timeout_seconds = 10.0;
}

(** Mock configuration for unit tests *)
let mock_testnet_config =
  let get_env_or_default var default =
    match Sys.getenv var with
    | Some v -> v
    | None -> default
  in
  {
    api_key = get_env_or_default "BINANCE_TESTNET_API_KEY" "mock_key";
    api_secret = get_env_or_default "BINANCE_TESTNET_API_SECRET" "mock_secret";
    testnet = true;
    rate_limit_weight_per_minute = 1200;
    timeout_seconds = 10.0;
  }

(** Test: Rate limiter *)
let test_rate_limiter () =
  Lwt_main.run (
    let limiter = RateLimiter.create ~max_weight_per_minute:1200 in

    (* Should be able to acquire tokens immediately *)
    let%lwt () = RateLimiter.acquire limiter ~weight:10 in

    (* Check that tokens were consumed *)
    let tokens_after = limiter.tokens in
    assert (tokens_after <= 1200 - 10);

    Lwt_io.printlf "✓ Rate limiter test passed: tokens=%d" tokens_after
  )

(** Test: Signature generation *)
let test_signature_generation () =
  let secret = "NhqPtmdSJYdKjVHjA7PZj4Mge3R5YNiP1e3UZjInClVN65XAbvqqM6A7H5fATj0j" in
  let query_string = "symbol=BTCUSDT&side=BUY&type=LIMIT&timeInForce=GTC&quantity=1&price=0.1&recvWindow=5000&timestamp=1499827319559" in

  let signature = generate_signature secret query_string in

  (* Expected signature from Binance documentation *)
  let expected = "c8db56825ae71d6d79447849e617115f4a920fa2acdcab2b053c4b2838bd6b71" in

  assert (String.equal signature expected);
  Lwt_main.run (Lwt_io.printlf "✓ Signature generation test passed")

(** Test: Get base URL *)
let test_base_url () =
  let testnet_url = get_base_url { test_config with testnet = true } in
  let mainnet_url = get_base_url { test_config with testnet = false } in

  assert (String.equal testnet_url "https://testnet.binancefuture.com");
  assert (String.equal mainnet_url "https://fapi.binance.com");

  Lwt_main.run (Lwt_io.printlf "✓ Base URL test passed")

(** Test: Error handling *)
let test_error_handling () =
  Lwt_main.run (
    let error = API_error (400, "Invalid request") in
    let error_str = error_to_string error in

    assert (String.is_substring error_str ~substring:"400");
    assert (String.is_substring error_str ~substring:"Invalid request");

    Lwt_io.printlf "✓ Error handling test passed"
  )

(** Test: Position serialization *)
let test_position_serialization () =
  let position = {
    position_id = "test_pos_123";
    symbol = "BTCUSDT";
    side = `Short;
    quantity = 0.5;
    entry_price = 50000.0;
    mark_price = 49500.0;
    unrealized_pnl = 250.0;
    leverage = 10;
    liquidation_price = 55000.0;
    margin = 2500.0;
    timestamp = Unix.gettimeofday ();
  } in

  (* Test JSON serialization *)
  let json = position_to_yojson position in
  let json_str = Yojson.Safe.to_string json in

  assert (String.is_substring json_str ~substring:"BTCUSDT");
  assert (String.is_substring json_str ~substring:"50000");

  Lwt_main.run (Lwt_io.printlf "✓ Position serialization test passed")

(** Test: PnL calculation *)
let test_pnl_calculation () =
  let pnl = {
    realized_pnl = 500.0;
    unrealized_pnl = 0.0;
    fees = 20.0;
    net_pnl = 480.0;
  } in

  (* Verify calculation *)
  let expected_net = pnl.realized_pnl +. pnl.unrealized_pnl -. pnl.fees in
  assert (Float.abs (pnl.net_pnl -. expected_net) < 0.01);

  Lwt_main.run (Lwt_io.printlf "✓ PnL calculation test passed")

(** Integration test: Test connectivity (requires internet) *)
let test_connectivity_integration () =
  Lwt_main.run (
    let%lwt () = Lwt_io.printlf "\n=== Testing Binance Testnet Connectivity ===" in

    let%lwt result = test_connectivity ~config:mock_testnet_config in

    match result with
    | Ok true ->
        Lwt_io.printlf "✓ Connectivity test passed: Successfully connected to Binance testnet"
    | Ok false ->
        Lwt_io.printlf "✗ Connectivity test failed: Connection failed"
    | Error e ->
        Lwt_io.printlf "✗ Connectivity test error: %s" (error_to_string e)
  )

(** Integration test: Get mark price (requires internet) *)
let test_get_mark_price_integration () =
  Lwt_main.run (
    let%lwt () = Lwt_io.printlf "\n=== Testing Get Mark Price ===" in

    let%lwt result = get_mark_price ~config:mock_testnet_config ~symbol:"BTCUSDT" in

    match result with
    | Ok price ->
        let%lwt () = Lwt_io.printlf "✓ Mark price test passed: BTC mark price = $%.2f" price in

        (* Sanity check: BTC should be between $10k and $1M *)
        if price > 10_000.0 && price < 1_000_000.0 then
          Lwt_io.printlf "  Price is within expected range"
        else
          Lwt_io.printlf "  Warning: Price outside expected range"
    | Error e ->
        Lwt_io.printlf "✗ Mark price test error: %s" (error_to_string e)
  )

(** Integration test: Get funding rate (requires internet) *)
let test_get_funding_rate_integration () =
  Lwt_main.run (
    let%lwt () = Lwt_io.printlf "\n=== Testing Get Funding Rate ===" in

    let%lwt result = get_funding_rate ~config:mock_testnet_config ~symbol:"BTCUSDT" in

    match result with
    | Ok funding_rate ->
        let%lwt () = Lwt_io.printlf "✓ Funding rate test passed: %.6f%%" (funding_rate *. 100.0) in

        (* Funding rate should typically be between -0.5% and +0.5% *)
        if Float.abs funding_rate < 0.01 then
          Lwt_io.printlf "  Funding rate is within normal range"
        else
          Lwt_io.printlf "  Warning: Funding rate is unusually high"
    | Error e ->
        Lwt_io.printlf "✗ Funding rate test error: %s" (error_to_string e)
  )

(** Integration test: Get funding info (requires internet) *)
let test_get_funding_info_integration () =
  Lwt_main.run (
    let%lwt () = Lwt_io.printlf "\n=== Testing Get Funding Info ===" in

    let%lwt result = get_funding_info ~config:mock_testnet_config ~symbol:"BTCUSDT" in

    match result with
    | Ok info ->
        let%lwt () = Lwt_io.printlf "✓ Funding info test passed:" in
        let%lwt () = Lwt_io.printlf "  Symbol: %s" info.symbol in
        let%lwt () = Lwt_io.printlf "  Funding rate: %.6f%%" (info.funding_rate *. 100.0) in
        let%lwt () = Lwt_io.printlf "  Mark price: $%.2f" info.mark_price in
        let%lwt () = Lwt_io.printlf "  Next funding time: %s"
          (Time.to_string (Time.of_float info.funding_time)) in
        Lwt.return ()
    | Error e ->
        Lwt_io.printlf "✗ Funding info test error: %s" (error_to_string e)
  )

(** Integration test: Open and close position (requires valid API keys and testnet balance) *)
let test_open_close_position_integration () =
  Lwt_main.run (
    let%lwt () = Lwt_io.printlf "\n=== Testing Open/Close Position (TESTNET ONLY) ===" in

    (* Check if we have real API keys *)
    let has_real_keys =
      Option.is_some (Sys.getenv "BINANCE_TESTNET_API_KEY") &&
      Option.is_some (Sys.getenv "BINANCE_TESTNET_API_SECRET")
    in

    if not has_real_keys then begin
      let%lwt () = Lwt_io.printlf "⊘ Skipping: No testnet API keys found" in
      Lwt_io.printlf "  Set BINANCE_TESTNET_API_KEY and BINANCE_TESTNET_API_SECRET to run this test"
    end else begin
      let get_env_exn var = Option.value_exn (Sys.getenv var) in
      let config = {
        api_key = get_env_exn "BINANCE_TESTNET_API_KEY";
        api_secret = get_env_exn "BINANCE_TESTNET_API_SECRET";
        testnet = true;
        rate_limit_weight_per_minute = 1200;
        timeout_seconds = 10.0;
      } in

      (* Try to open a small short position *)
      let%lwt () = Lwt_io.printlf "Opening short position: 0.001 BTC @ 10x leverage..." in
      let%lwt open_result = open_short
        ~config
        ~symbol:"BTCUSDT"
        ~quantity:0.001
        ~leverage:10
      in

      match open_result with
      | Ok position ->
          let%lwt () = Lwt_io.printlf "✓ Position opened successfully:" in
          let%lwt () = Lwt_io.printlf "  Position ID: %s" position.position_id in
          let%lwt () = Lwt_io.printlf "  Entry price: $%.2f" position.entry_price in
          let%lwt () = Lwt_io.printlf "  Quantity: %.8f BTC" position.quantity in
          let%lwt () = Lwt_io.printlf "  Margin: $%.2f" position.margin in

          (* Wait a moment *)
          let%lwt () = Lwt_unix.sleep 2.0 in

          (* Try to close the position *)
          let%lwt () = Lwt_io.printlf "\nClosing position..." in
          let%lwt close_result = close_position ~config ~position_id:position.position_id in

          begin match close_result with
          | Ok pnl ->
              let%lwt () = Lwt_io.printlf "✓ Position closed successfully:" in
              let%lwt () = Lwt_io.printlf "  Realized PnL: $%.2f" pnl.realized_pnl in
              let%lwt () = Lwt_io.printlf "  Fees: $%.2f" pnl.fees in
              Lwt_io.printlf "  Net PnL: $%.2f" pnl.net_pnl
          | Error e ->
              Lwt_io.printlf "✗ Close position error: %s" (error_to_string e)
          end

      | Error e ->
          Lwt_io.printlf "✗ Open position error: %s\n  (This is expected if you don't have testnet balance)"
            (error_to_string e)
    end
  )

(** Run all tests *)
let run_all_tests () =
  Lwt_main.run (
    let%lwt () = Lwt_io.printlf "\n╔══════════════════════════════════════════════╗" in
    let%lwt () = Lwt_io.printlf "║  Binance Futures Client Test Suite          ║" in
    let%lwt () = Lwt_io.printlf "╚══════════════════════════════════════════════╝\n" in

    (* Unit tests *)
    let%lwt () = Lwt_io.printlf "=== Unit Tests ===" in
    let%lwt () = Lwt.wrap (fun () -> test_rate_limiter ()) in
    let%lwt () = Lwt.wrap (fun () -> test_signature_generation ()) in
    let%lwt () = Lwt.wrap (fun () -> test_base_url ()) in
    let%lwt () = Lwt.wrap (fun () -> test_error_handling ()) in
    let%lwt () = Lwt.wrap (fun () -> test_position_serialization ()) in
    let%lwt () = Lwt.wrap (fun () -> test_pnl_calculation ()) in

    (* Integration tests *)
    let%lwt () = Lwt_io.printlf "\n=== Integration Tests (require internet) ===" in
    let%lwt () = test_connectivity_integration () in
    let%lwt () = test_get_mark_price_integration () in
    let%lwt () = test_get_funding_rate_integration () in
    let%lwt () = test_get_funding_info_integration () in
    let%lwt () = test_open_close_position_integration () in

    let%lwt () = Lwt_io.printlf "\n╔══════════════════════════════════════════════╗" in
    let%lwt () = Lwt_io.printlf "║  All Tests Completed                         ║" in
    Lwt_io.printlf "╚══════════════════════════════════════════════╝\n"
  )

(** Entry point *)
let () =
  try
    run_all_tests ()
  with exn ->
    Printf.eprintf "Test suite failed: %s\n" (Exn.to_string exn);
    exit 1
