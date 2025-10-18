(* Collateral Manager Tests - 6-Tier Model Validation
 *
 * Tests:
 * 1. Effective capital calculation (waterfall risk weighting)
 * 2. Coverage limit checks (85% max, per-tranche 95%)
 * 3. Tranche-specific utilization
 * 4. Capital adequacy scenarios
 *)

open Core
open OUnit2
open Pool.Collateral_manager
open Types
open Math
open Pricing.Tranche_pricing

module CM = CollateralManager

(** Test fixtures **)

(* Create a pool with initial capital distributed across tranches *)
let create_test_pool_with_capital
    ?(btc_capital = 25_000_00L)
    ?(snr_capital = 20_000_00L)
    ?(mezz_capital = 18_000_00L)
    ?(jnr_capital = 15_000_00L)
    ?(jnr_plus_capital = 12_000_00L)
    ?(eqt_capital = 10_000_00L)
    ()
  : CM.unified_pool =

  let pool = CM.create_pool ~initial_capital:0L () in

  (* Update tranche capitals *)
  let updated_tranches = List.map pool.virtual_tranches ~f:(fun tranche ->
    let allocated_capital = match tranche.tranche_id with
      | SURE_BTC -> btc_capital
      | SURE_SNR -> snr_capital
      | SURE_MEZZ -> mezz_capital
      | SURE_JNR -> jnr_capital
      | SURE_JNR_PLUS -> jnr_plus_capital
      | SURE_EQT -> eqt_capital
    in
    { tranche with allocated_capital }
  ) in

  let total_capital = Int64.(
    btc_capital + snr_capital + mezz_capital +
    jnr_capital + jnr_plus_capital + eqt_capital
  ) in

  {
    pool with
    virtual_tranches = updated_tranches;
    total_capital_usd = total_capital;
    usd_reserves = total_capital;
  }

(* Create a sample policy *)
let create_test_policy ~coverage_amount =
  {
    policy_id = 1L;
    policyholder = "EQTest...";
    beneficiary = None;
    coverage_type = Depeg;
    chain = TON;
    asset = USDC;
    coverage_amount;
    premium_paid = 0L;
    trigger_price = 0.98;
    floor_price = 0.95;
    start_time = Unix.time ();
    expiry_time = Unix.time () +. 2592000.0; (* 30 days *)
    status = Active;
    payout_amount = None;
    payout_time = None;
    is_gift = false;
    gift_message = None;
  }

(** Test 1: Effective Capital Calculation **)

let test_effective_capital_calculation _ctx =
  (* Scenario: $100M total capital distributed across 6 tranches
   * Expected effective capital:
   *   BTC  (25M × 0.50) = 12.5M
   *   SNR  (20M × 0.60) = 12.0M
   *   MEZZ (18M × 0.70) = 12.6M
   *   JNR  (15M × 0.80) = 12.0M
   *   JNR+ (12M × 0.90) = 10.8M
   *   EQT  (10M × 1.00) = 10.0M
   *   Total = 69.9M
   *)

  let pool = create_test_pool_with_capital
    ~btc_capital:25_000_000_00L
    ~snr_capital:20_000_000_00L
    ~mezz_capital:18_000_000_00L
    ~jnr_capital:15_000_000_00L
    ~jnr_plus_capital:12_000_000_00L
    ~eqt_capital:10_000_000_00L
    ()
  in

  let effective_capital = CM.calculate_effective_capital pool in

  (* Expected: 69.9M in cents *)
  let expected = 69_900_000_00L in

  assert_equal ~printer:Int64.to_string expected effective_capital

let test_effective_capital_zero_state _ctx =
  let pool = CM.create_pool ~initial_capital:0L () in
  let effective_capital = CM.calculate_effective_capital pool in
  assert_equal ~printer:Int64.to_string 0L effective_capital

(** Test 2: Coverage Limit Checks **)

let test_can_accept_coverage_under_limit _ctx =
  (* Scenario: 80% utilization → Should accept *)
  let pool = create_test_pool_with_capital
    ~btc_capital:25_000_000_00L
    ~snr_capital:20_000_000_00L
    ~mezz_capital:18_000_000_00L
    ~jnr_capital:15_000_000_00L
    ~jnr_plus_capital:12_000_000_00L
    ~eqt_capital:10_000_000_00L
    ()
  in

  let effective_capital = CM.calculate_effective_capital pool in
  (* 80% of 69.9M = 55.92M *)
  let coverage_amount = Int64.(effective_capital * 80L / 100L) in

  let pool_with_coverage = {
    pool with
    total_coverage_sold = coverage_amount;
  } in

  let manager = CM.create ~pool_opt:(Some pool_with_coverage) () in
  let policy = create_test_policy ~coverage_amount:1_000_000_00L in

  let (can_underwrite, reason) = CM.can_underwrite manager policy in

  assert_bool
    (Printf.sprintf "Should accept coverage at 80%% utilization: %s" reason)
    can_underwrite

let test_reject_coverage_over_limit _ctx =
  (* Scenario: 90% utilization → Should reject *)
  let pool = create_test_pool_with_capital
    ~btc_capital:25_000_000_00L
    ~snr_capital:20_000_000_00L
    ~mezz_capital:18_000_000_00L
    ~jnr_capital:15_000_000_00L
    ~jnr_plus_capital:12_000_000_00L
    ~eqt_capital:10_000_000_00L
    ()
  in

  let effective_capital = CM.calculate_effective_capital pool in
  (* 90% of 69.9M = 62.91M (exceeds 85% limit) *)
  let coverage_amount = Int64.(effective_capital * 90L / 100L) in

  let pool_with_coverage = {
    pool with
    total_coverage_sold = coverage_amount;
  } in

  let manager = CM.create ~pool_opt:(Some pool_with_coverage) () in
  let policy = create_test_policy ~coverage_amount:1_000_000_00L in

  let (can_underwrite, _reason) = CM.can_underwrite manager policy in

  assert_bool
    "Should reject coverage at 90% utilization (exceeds 85% limit)"
    (not can_underwrite)

let test_reject_eqt_over_capacity _ctx =
  (* Scenario: EQT 95% utilized → Should reject *)
  let pool = create_test_pool_with_capital
    ~eqt_capital:10_000_000_00L
    ()
  in

  (* Find EQT tranche and set allocated coverage to 95% *)
  let eqt_tranche = List.find_exn pool.virtual_tranches ~f:(fun t ->
    Poly.equal t.tranche_id SURE_EQT
  ) in

  let eqt_coverage = Int64.(eqt_tranche.allocated_capital * 95L / 100L) in

  let updated_tranches = List.map pool.virtual_tranches ~f:(fun t ->
    if Poly.equal t.tranche_id SURE_EQT then
      { t with allocated_coverage = eqt_coverage }
    else
      t
  ) in

  let pool_with_coverage = {
    pool with
    virtual_tranches = updated_tranches;
  } in

  let manager = CM.create ~pool_opt:(Some pool_with_coverage) () in
  let policy = create_test_policy ~coverage_amount:1_000_000_00L in

  let (can_underwrite, _reason) = CM.can_underwrite manager policy in

  assert_bool
    "Should reject when EQT tranche at 95% utilization"
    (not can_underwrite)

(** Test 3: Tranche-Specific Utilization **)

let test_tranche_utilization_calculation _ctx =
  (* Scenario: SURE_BTC with 25M capital, 50% risk capacity, 10M coverage
   * Expected: utilization = 10M / (25M × 0.5) = 10M / 12.5M = 80%
   *)

  let pool = create_test_pool_with_capital
    ~btc_capital:25_000_000_00L
    ()
  in

  (* Set BTC coverage to 10M *)
  let btc_coverage = 10_000_000_00L in

  let updated_tranches = List.map pool.virtual_tranches ~f:(fun t ->
    if Poly.equal t.tranche_id SURE_BTC then
      { t with allocated_coverage = btc_coverage }
    else
      t
  ) in

  let pool_with_coverage = {
    pool with
    virtual_tranches = updated_tranches;
  } in

  let tranche_util = CM.get_tranche_utilization pool_with_coverage ~tranche_id:SURE_BTC in

  (* Expected: 80% utilization *)
  let expected_utilization = 0.80 in

  assert_equal
    ~cmp:(fun a b -> Float.abs (a -. b) < 0.01)
    ~printer:Float.to_string
    expected_utilization
    tranche_util.utilization_pct

let test_all_tranche_utilizations _ctx =
  let pool = create_test_pool_with_capital
    ~btc_capital:25_000_000_00L
    ~snr_capital:20_000_000_00L
    ~mezz_capital:18_000_000_00L
    ~jnr_capital:15_000_000_00L
    ~jnr_plus_capital:12_000_000_00L
    ~eqt_capital:10_000_000_00L
    ()
  in

  let all_utils = CM.get_all_tranche_utilizations pool in

  (* Should have 6 tranche utilizations *)
  assert_equal ~printer:Int.to_string 6 (List.length all_utils);

  (* Verify all tranche IDs are present *)
  let tranche_ids = List.map all_utils ~f:(fun u -> u.tranche_id) in
  assert_bool "Should have SURE_BTC" (List.mem tranche_ids SURE_BTC ~equal:Poly.equal);
  assert_bool "Should have SURE_SNR" (List.mem tranche_ids SURE_SNR ~equal:Poly.equal);
  assert_bool "Should have SURE_MEZZ" (List.mem tranche_ids SURE_MEZZ ~equal:Poly.equal);
  assert_bool "Should have SURE_JNR" (List.mem tranche_ids SURE_JNR ~equal:Poly.equal);
  assert_bool "Should have SURE_JNR_PLUS" (List.mem tranche_ids SURE_JNR_PLUS ~equal:Poly.equal);
  assert_bool "Should have SURE_EQT" (List.mem tranche_ids SURE_EQT ~equal:Poly.equal)

(** Test 4: Capital Adequacy Scenarios **)

let test_capital_adequacy_scenario_healthy _ctx =
  (* Scenario: 50% utilization → Healthy *)
  let pool = create_test_pool_with_capital
    ~btc_capital:25_000_000_00L
    ~snr_capital:20_000_000_00L
    ~mezz_capital:18_000_000_00L
    ~jnr_capital:15_000_000_00L
    ~jnr_plus_capital:12_000_000_00L
    ~eqt_capital:10_000_000_00L
    ()
  in

  let effective_capital = CM.calculate_effective_capital pool in
  let coverage_amount = Int64.(effective_capital * 50L / 100L) in

  let pool_with_coverage = {
    pool with
    total_coverage_sold = coverage_amount;
  } in

  let manager = CM.create ~pool_opt:(Some pool_with_coverage) () in
  let utilization = CM.get_total_utilization manager in

  (* Expected: 50% utilization *)
  assert_equal
    ~cmp:(fun a b -> Float.abs (a -. b) < 0.01)
    ~printer:Float.to_string
    0.50
    utilization

let test_capital_adequacy_scenario_warning _ctx =
  (* Scenario: 80% utilization → Warning (but acceptable) *)
  let pool = create_test_pool_with_capital
    ~btc_capital:25_000_000_00L
    ~snr_capital:20_000_000_00L
    ~mezz_capital:18_000_000_00L
    ~jnr_capital:15_000_000_00L
    ~jnr_plus_capital:12_000_000_00L
    ~eqt_capital:10_000_000_00L
    ()
  in

  let effective_capital = CM.calculate_effective_capital pool in
  let coverage_amount = Int64.(effective_capital * 80L / 100L) in

  let pool_with_coverage = {
    pool with
    total_coverage_sold = coverage_amount;
  } in

  let manager = CM.create ~pool_opt:(Some pool_with_coverage) () in
  let policy = create_test_policy ~coverage_amount:1_000_000_00L in

  let (can_underwrite, _reason) = CM.can_underwrite manager policy in

  (* Should still accept at 80% *)
  assert_bool "Should accept at 80% utilization" can_underwrite

let test_capital_adequacy_scenario_critical _ctx =
  (* Scenario: 90% utilization → Critical (reject) *)
  let pool = create_test_pool_with_capital
    ~btc_capital:25_000_000_00L
    ~snr_capital:20_000_000_00L
    ~mezz_capital:18_000_000_00L
    ~jnr_capital:15_000_000_00L
    ~jnr_plus_capital:12_000_000_00L
    ~eqt_capital:10_000_000_00L
    ()
  in

  let effective_capital = CM.calculate_effective_capital pool in
  let coverage_amount = Int64.(effective_capital * 90L / 100L) in

  let pool_with_coverage = {
    pool with
    total_coverage_sold = coverage_amount;
  } in

  let manager = CM.create ~pool_opt:(Some pool_with_coverage) () in
  let policy = create_test_policy ~coverage_amount:1_000_000_00L in

  let (can_underwrite, _reason) = CM.can_underwrite manager policy in

  (* Should reject at 90% *)
  assert_bool "Should reject at 90% utilization" (not can_underwrite)

(** Test 5: Waterfall Integration **)

let test_waterfall_allocation _ctx =
  (* Scenario: Verify coverage is properly allocated across tranches *)
  let pool = create_test_pool_with_capital
    ~btc_capital:25_000_000_00L
    ~snr_capital:20_000_000_00L
    ~mezz_capital:18_000_000_00L
    ~jnr_capital:15_000_000_00L
    ~jnr_plus_capital:12_000_000_00L
    ~eqt_capital:10_000_000_00L
    ()
  in

  let manager = CM.create ~pool_opt:(Some pool) () in
  let policy = create_test_policy ~coverage_amount:10_000_000_00L in

  let manager_with_policy = CM.allocate_coverage manager policy in

  (* Verify total coverage sold increased *)
  assert_equal
    ~printer:Int64.to_string
    10_000_000_00L
    manager_with_policy.pool.total_coverage_sold;

  (* Verify policy was added to active policies *)
  assert_equal
    ~printer:Int.to_string
    1
    (List.length manager_with_policy.pool.active_policies)

(** Test Suite **)

let suite =
  "Collateral Manager 6-Tier Tests" >::: [
    "test_effective_capital_calculation" >:: test_effective_capital_calculation;
    "test_effective_capital_zero_state" >:: test_effective_capital_zero_state;
    "test_can_accept_coverage_under_limit" >:: test_can_accept_coverage_under_limit;
    "test_reject_coverage_over_limit" >:: test_reject_coverage_over_limit;
    "test_reject_eqt_over_capacity" >:: test_reject_eqt_over_capacity;
    "test_tranche_utilization_calculation" >:: test_tranche_utilization_calculation;
    "test_all_tranche_utilizations" >:: test_all_tranche_utilizations;
    "test_capital_adequacy_scenario_healthy" >:: test_capital_adequacy_scenario_healthy;
    "test_capital_adequacy_scenario_warning" >:: test_capital_adequacy_scenario_warning;
    "test_capital_adequacy_scenario_critical" >:: test_capital_adequacy_scenario_critical;
    "test_waterfall_allocation" >:: test_waterfall_allocation;
  ]

let () =
  run_test_tt_main suite
