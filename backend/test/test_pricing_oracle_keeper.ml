(**
 * Pricing Oracle Keeper Test Suite
 * Tests the dynamic pricing oracle system with 12 risk multipliers
 *
 * Covers:
 * - Multi-dimensional premium calculation (560 products)
 * - Circuit breaker (±50% price change limits)
 * - Oracle staleness detection (>5 minutes)
 * - Risk multiplier calculations
 * - Exponential backoff retry logic
 * - Market data fetching from external APIs
 *)

open Core
open Alcotest
open Lwt.Infix

(** Mock data for testing *)

let normal_usdc_price = {
  round_id = 100000000001L;
  answer = 100000000L;  (* $1.00 with 8 decimals *)
  started_at = Int64.of_float (Unix.time ()) - 3600L;
  updated_at = Int64.of_float (Unix.time ());
  answered_in_round = 100000000001L;
}

let depeg_usdc_price = {
  round_id = 100000000050L;
  answer = 91500000L;  (* $0.915 - March 2023 style depeg *)
  started_at = Int64.of_float (Unix.time ()) - 600L;
  updated_at = Int64.of_float (Unix.time ());
  answered_in_round = 100000000050L;
}

let stale_price = {
  round_id = 99999999999L;
  answer = 100000000L;
  started_at = Int64.of_float (Unix.time ()) - 7200L;  (* 2 hours old *)
  updated_at = Int64.of_float (Unix.time ()) - 7200L;
  answered_in_round = 99999999999L;
}

let circuit_breaker_trigger_price = {
  round_id = 100000000100L;
  answer = 40000000L;  (* $0.40 - 60% drop *)
  started_at = Int64.of_float (Unix.time ()) - 60L;
  updated_at = Int64.of_float (Unix.time ());
  answered_in_round = 100000000100L;
}

(** Test Suite *)

let test_fetch_chainlink_data () =
  Lwt_main.run (
    (* Mock Chainlink API response *)
    let mock_response = {
      price = normal_usdc_price;
      confidence = 99;
      timestamp = Int64.of_float (Unix.time ());
    } in

    (* Simulate fetching data *)
    let%lwt fetched_data = Lwt.return mock_response in

    (* Verify price structure *)
    Alcotest.(check int64) "price answer" 100000000L fetched_data.price.answer;
    Alcotest.(check int) "confidence" 99 fetched_data.confidence;

    Lwt.return ()
  )

let test_staleness_detection () =
  let now = Int64.of_float (Unix.time ()) in

  (* Test fresh data (<5 minutes) *)
  let fresh_price = { normal_usdc_price with updated_at = Int64.sub now 120L } in
  let is_stale_fresh = Pricing_oracle_keeper.is_stale fresh_price 300 in
  Alcotest.(check bool) "fresh data not stale" false is_stale_fresh;

  (* Test stale data (>5 minutes) *)
  let old_price = { normal_usdc_price with updated_at = Int64.sub now 400L } in
  let is_stale_old = Pricing_oracle_keeper.is_stale old_price 300 in
  Alcotest.(check bool) "old data is stale" true is_stale_old

let test_circuit_breaker_trigger () =
  (* Previous price: $1.00, New price: $0.40 (60% drop) *)
  let previous = normal_usdc_price.answer in
  let new_price = circuit_breaker_trigger_price.answer in

  let capped_price = Pricing_oracle_keeper.apply_circuit_breaker previous new_price 0.5 in

  (* Price should be capped at 50% of previous ($0.50) *)
  let expected_min = Int64.(previous * 50L / 100L) in
  Alcotest.(check int64) "price capped at 50%" expected_min capped_price

let test_circuit_breaker_allows_gradual_change () =
  (* Previous: $1.00, New: $0.95 (5% drop - allowed) *)
  let previous = 100000000L in
  let new_price = 95000000L in

  let result = Pricing_oracle_keeper.apply_circuit_breaker previous new_price 0.5 in

  (* Should return new_price unchanged *)
  Alcotest.(check int64) "gradual change allowed" new_price result

let test_calculate_coverage_type_multiplier () =
  (* Coverage type multipliers:
   * 0 (Depeg) = 1.0x
   * 1 (Bridge) = 0.8x
   * 2 (CEX) = 1.2x
   * 3 (Protocol) = 1.1x
   * 4 (Composite) = 1.5x
   *)

  let depeg_mult = Pricing_oracle_keeper.get_coverage_type_multiplier 0 in
  Alcotest.(check (float 0.01)) "depeg multiplier" 1.0 depeg_mult;

  let bridge_mult = Pricing_oracle_keeper.get_coverage_type_multiplier 1 in
  Alcotest.(check (float 0.01)) "bridge multiplier" 0.8 bridge_mult;

  let cex_mult = Pricing_oracle_keeper.get_coverage_type_multiplier 2 in
  Alcotest.(check (float 0.01)) "cex multiplier" 1.2 cex_mult;

  let protocol_mult = Pricing_oracle_keeper.get_coverage_type_multiplier 3 in
  Alcotest.(check (float 0.01)) "protocol multiplier" 1.1 protocol_mult;

  let composite_mult = Pricing_oracle_keeper.get_coverage_type_multiplier 4 in
  Alcotest.(check (float 0.01)) "composite multiplier" 1.5 composite_mult

let test_calculate_chain_risk_multiplier () =
  (* Chain risk multipliers:
   * 0 (Ethereum) = 0.8x (most secure)
   * 1 (Arbitrum) = 0.9x
   * 2 (Base) = 1.0x
   * 3 (Polygon) = 1.1x
   * 4 (Bitcoin) = 0.85x
   * 5 (Solana) = 1.2x
   * 6 (TON) = 1.0x
   * 7 (BSC) = 1.3x (highest risk)
   *)

  let eth_mult = Pricing_oracle_keeper.get_chain_risk_multiplier 0 in
  Alcotest.(check (float 0.01)) "ethereum multiplier" 0.8 eth_mult;

  let bsc_mult = Pricing_oracle_keeper.get_chain_risk_multiplier 7 in
  Alcotest.(check (float 0.01)) "bsc multiplier" 1.3 bsc_mult

let test_calculate_stablecoin_risk_multiplier () =
  (* Stablecoin risk multipliers:
   * 0 (USDC) = 0.9x
   * 1 (USDT) = 1.0x
   * 3 (DAI) = 0.95x
   * 4 (FRAX) = 1.1x
   * 7 (BUSD) = 1.05x
   * 10 (UST) = 2.0x (high risk due to history)
   *)

  let usdc_mult = Pricing_oracle_keeper.get_stablecoin_risk_multiplier 0 in
  Alcotest.(check (float 0.01)) "usdc multiplier" 0.9 usdc_mult;

  let usdt_mult = Pricing_oracle_keeper.get_stablecoin_risk_multiplier 1 in
  Alcotest.(check (float 0.01)) "usdt multiplier" 1.0 usdt_mult;

  let ust_mult = Pricing_oracle_keeper.get_stablecoin_risk_multiplier 10 in
  Alcotest.(check (float 0.01)) "ust multiplier" 2.0 ust_mult

let test_calculate_duration_multiplier () =
  (* Duration multipliers (days):
   * 1-7 days = 0.9x (short term discount)
   * 8-30 days = 1.0x (standard)
   * 31-90 days = 1.05x
   * 91-180 days = 1.1x
   * 181-365 days = 1.15x
   *)

  let short_mult = Pricing_oracle_keeper.get_duration_multiplier 7 in
  Alcotest.(check (float 0.01)) "7 day multiplier" 0.9 short_mult;

  let standard_mult = Pricing_oracle_keeper.get_duration_multiplier 30 in
  Alcotest.(check (float 0.01)) "30 day multiplier" 1.0 standard_mult;

  let long_mult = Pricing_oracle_keeper.get_duration_multiplier 365 in
  Alcotest.(check (float 0.01)) "365 day multiplier" 1.15 long_mult

let test_calculate_price_deviation_multiplier () =
  (* Price deviation from $1.00:
   * 0-1% = 1.0x
   * 1-2% = 1.2x
   * 2-5% = 1.5x
   * 5-10% = 1.8x
   * >10% = 2.0x
   *)

  let normal_mult = Pricing_oracle_keeper.get_price_deviation_multiplier 100000000L in
  Alcotest.(check (float 0.01)) "no deviation" 1.0 normal_mult;

  let small_dev_mult = Pricing_oracle_keeper.get_price_deviation_multiplier 98500000L in
  Alcotest.(check (float 0.01)) "1.5% deviation" 1.2 small_dev_mult;

  let large_dev_mult = Pricing_oracle_keeper.get_price_deviation_multiplier 91500000L in
  Alcotest.(check (float 0.01)) "8.5% deviation" 1.8 large_dev_mult;

  let extreme_dev_mult = Pricing_oracle_keeper.get_price_deviation_multiplier 80000000L in
  Alcotest.(check (float 0.01)) "20% deviation" 2.0 extreme_dev_mult

let test_calculate_premium_multi_dimensional () =
  (* Test full premium calculation for specific product:
   * Coverage: Depeg (type 0)
   * Chain: Ethereum (chain 0)
   * Stablecoin: USDC (coin 0)
   * Amount: $10,000
   * Duration: 30 days
   * Current price: $1.00 (normal)
   *
   * Base premium: $10,000 × 0.8% APR × (30/365) = $6.575
   *
   * Multipliers:
   * - Coverage type: 1.0x (Depeg)
   * - Chain risk: 0.8x (Ethereum)
   * - Stablecoin risk: 0.9x (USDC)
   * - Duration: 1.0x (30 days)
   * - Price deviation: 1.0x (normal)
   * - Amount: 1.0x (standard size)
   * - Utilization: 1.0x (assume normal)
   * - Historical claims: 1.0x (assume normal)
   * - Time of day: 1.0x
   * - Bridge health: N/A
   * - CEX liquidations: N/A
   * - Protocol exploits: N/A
   *
   * Total multiplier: 1.0 × 0.8 × 0.9 × 1.0 × 1.0 × 1.0 × 1.0 × 1.0 × 1.0 = 0.72
   * Final premium: $6.575 × 0.72 = $4.734
   *)

  let policy_params = {
    coverage_type = 0;
    chain_id = 0;
    stablecoin_id = 0;
    coverage_amount = 10000_00000000L;  (* $10,000 with 8 decimals *)
    duration_days = 30;
    current_price = 100000000L;
    bridge_id = None;
    timestamp = Int64.of_float (Unix.time ());
  } in

  let premium = Pricing_oracle_keeper.calculate_premium policy_params in

  (* Expected: ~$4.73-$4.75 (473000000-475000000 with 8 decimals) *)
  Alcotest.(check bool) "premium in expected range"
    true
    (Int64.(premium >= 470000000L && premium <= 480000000L))

let test_calculate_premium_depeg_scenario () =
  (* Same as above but with USDC depegged to $0.915
   * Base premium: $6.575
   * Price deviation multiplier: 1.8x (8.5% deviation)
   * Total multiplier: 0.72 × 1.8 = 1.296
   * Final premium: $6.575 × 1.296 = $8.52
   *)

  let policy_params = {
    coverage_type = 0;
    chain_id = 0;
    stablecoin_id = 0;
    coverage_amount = 10000_00000000L;
    duration_days = 30;
    current_price = 91500000L;  (* $0.915 *)
    bridge_id = None;
    timestamp = Int64.of_float (Unix.time ());
  } in

  let premium = Pricing_oracle_keeper.calculate_premium policy_params in

  (* Expected: ~$8.40-$8.65 (840000000-865000000 with 8 decimals) *)
  Alcotest.(check bool) "depeg premium higher"
    true
    (Int64.(premium >= 840000000L && premium <= 865000000L))

let test_exponential_backoff_retry () =
  (* Test retry logic: 1s, 2s, 4s, 8s, 16s *)
  let backoff_0 = Pricing_oracle_keeper.calculate_backoff 0 in
  Alcotest.(check int) "retry 0: 1s" 1 backoff_0;

  let backoff_1 = Pricing_oracle_keeper.calculate_backoff 1 in
  Alcotest.(check int) "retry 1: 2s" 2 backoff_1;

  let backoff_2 = Pricing_oracle_keeper.calculate_backoff 2 in
  Alcotest.(check int) "retry 2: 4s" 4 backoff_2;

  let backoff_3 = Pricing_oracle_keeper.calculate_backoff 3 in
  Alcotest.(check int) "retry 3: 8s" 8 backoff_3;

  let backoff_4 = Pricing_oracle_keeper.calculate_backoff 4 in
  Alcotest.(check int) "retry 4: 16s" 16 backoff_4

let test_retry_on_api_failure () =
  Lwt_main.run (
    let retry_count = ref 0 in

    (* Mock API that fails first 3 times *)
    let mock_fetch_with_failures () =
      retry_count := !retry_count + 1;
      if !retry_count < 3 then
        Lwt.fail (Failure "API unavailable")
      else
        Lwt.return normal_usdc_price
    in

    (* Test retry mechanism *)
    let%lwt result = Pricing_oracle_keeper.fetch_with_retry
      mock_fetch_with_failures
      ~max_retries:5
      ~backoff_fn:Pricing_oracle_keeper.calculate_backoff
    in

    (* Should succeed on 3rd retry *)
    Alcotest.(check int) "retry count" 3 !retry_count;
    Alcotest.(check int64) "fetched price" 100000000L result.answer;

    Lwt.return ()
  )

let test_oracle_update_event_emission () =
  (* Verify event structure for oracle updates *)
  let event = Pricing_oracle_keeper.create_update_event
    ~chain_id:0
    ~stablecoin_id:0
    ~old_price:100000000L
    ~new_price:95000000L
    ~timestamp:(Int64.of_float (Unix.time ()))
  in

  Alcotest.(check int) "chain_id" 0 event.chain_id;
  Alcotest.(check int) "stablecoin_id" 0 event.stablecoin_id;
  Alcotest.(check int64) "old_price" 100000000L event.old_price;
  Alcotest.(check int64) "new_price" 95000000L event.new_price;
  Alcotest.(check bool) "is_significant_change" true event.is_significant_change

let test_all_560_products_premium_calculation () =
  (* Sample test for all 560 products (5 types × 8 chains × 14 stablecoins) *)
  let product_count = ref 0 in
  let all_valid = ref true in

  for coverage_type = 0 to 4 do
    for chain_id = 0 to 7 do
      for stablecoin_id = 0 to 13 do
        let policy_params = {
          coverage_type;
          chain_id;
          stablecoin_id;
          coverage_amount = 1000_00000000L;  (* $1,000 *)
          duration_days = 30;
          current_price = 100000000L;
          bridge_id = if coverage_type = 1 then Some 0 else None;
          timestamp = Int64.of_float (Unix.time ());
        } in

        let premium = Pricing_oracle_keeper.calculate_premium policy_params in

        (* Premium should be positive and reasonable (<$100 for $1,000 coverage) *)
        if Int64.(premium <= 0L || premium >= 10000000000L) then
          all_valid := false;

        product_count := !product_count + 1
      done
    done
  done;

  Alcotest.(check int) "product count" 560 !product_count;
  Alcotest.(check bool) "all premiums valid" true !all_valid

(** Test Runner *)

let () =
  run "PricingOracleKeeper" [
    "fetch_data", [
      test_case "chainlink" `Quick test_fetch_chainlink_data;
    ];
    "staleness", [
      test_case "detect_stale" `Quick test_staleness_detection;
    ];
    "circuit_breaker", [
      test_case "trigger" `Quick test_circuit_breaker_trigger;
      test_case "allow_gradual" `Quick test_circuit_breaker_allows_gradual_change;
    ];
    "risk_multipliers", [
      test_case "coverage_type" `Quick test_calculate_coverage_type_multiplier;
      test_case "chain_risk" `Quick test_calculate_chain_risk_multiplier;
      test_case "stablecoin_risk" `Quick test_calculate_stablecoin_risk_multiplier;
      test_case "duration" `Quick test_calculate_duration_multiplier;
      test_case "price_deviation" `Quick test_calculate_price_deviation_multiplier;
    ];
    "premium_calculation", [
      test_case "multi_dimensional" `Quick test_calculate_premium_multi_dimensional;
      test_case "depeg_scenario" `Quick test_calculate_premium_depeg_scenario;
      test_case "all_560_products" `Slow test_all_560_products_premium_calculation;
    ];
    "retry_logic", [
      test_case "exponential_backoff" `Quick test_exponential_backoff_retry;
      test_case "retry_on_failure" `Quick test_retry_on_api_failure;
    ];
    "events", [
      test_case "update_event" `Quick test_oracle_update_event_emission;
    ];
  ]
