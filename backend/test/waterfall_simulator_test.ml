(* Unit tests for Waterfall Simulator Module *)

open Core
open OUnit2
open Tranche_pricing
open Pool.Waterfall_simulator
open WaterfallSimulator
open Types

(* Import all_of_tranche from Tranche_pricing module *)
let all_of_tranche = Tranche_pricing.all_of_tranche

(* Helper function to check float equality with tolerance *)
let assert_float_equal ?(tolerance = 0.001) expected actual =
  let diff = Float.abs (expected -. actual) in
  assert_bool
    (Printf.sprintf "Expected %.6f but got %.6f (diff: %.6f, tolerance: %.6f)"
       expected actual diff tolerance)
    Float.(diff <= tolerance)

(* Helper function to check int64 equality *)
let assert_int64_equal expected actual =
  assert_equal ~printer:Int64.to_string expected actual

(* ========================================
   INITIALIZATION TESTS
   ======================================== *)

let test_create_initial_vault _ =
  let vault = create_initial_vault () in
  assert_int64_equal 0L vault.total_capital;
  assert_int64_equal 0L vault.total_coverage_sold;
  assert_int64_equal 0L vault.accumulated_losses;
  assert_equal 6 (List.length vault.tranches);

  (* Check that all tranches are initialized *)
  List.iter all_of_tranche ~f:(fun tranche ->
    let tranche_str = tranche_to_string tranche in
    match get_tranche vault ~tranche:tranche_str with
    | Some t ->
        assert_int64_equal 0L t.capital;
        assert_int64_equal 0L t.accumulated_yield;
        assert_float_equal 0.0 t.utilization
    | None -> assert_failure (Printf.sprintf "Tranche %s not found" tranche_str)
  )

let test_set_tranche_capital _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in

  match get_tranche vault ~tranche:"SURE-BTC" with
  | Some t ->
      assert_int64_equal 100_000_000_000L t.capital;
      assert_int64_equal 100_000_000_000L vault.total_capital
  | None -> assert_failure "SURE_BTC not found"

let test_set_multiple_tranche_capitals _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-SNR" ~capital:80_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:10_000_000_000L in

  assert_int64_equal 190_000_000_000L vault.total_capital;

  match get_tranche vault ~tranche:"SURE-SNR" with
  | Some t -> assert_int64_equal 80_000_000_000L t.capital
  | None -> assert_failure "SURE_SNR not found"

(* ========================================
   PREMIUM DISTRIBUTION TESTS
   ======================================== *)

let test_premium_distribution_single_tranche _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in

  let result = simulate_premium_distribution vault ~premium:10_000_000_000L in
  match result with
  | Ok (dist, new_vault) ->
      (* BTC should receive some premium *)
      assert_bool "BTC should receive premium"
        (List.exists dist.distributions ~f:(fun (t, _) -> String.equal t "SURE-BTC"));

      (* Check that accumulated yield increased *)
      (match get_tranche new_vault ~tranche:"SURE-BTC" with
      | Some t -> assert_bool "Accumulated yield should be positive" Int64.(t.accumulated_yield > 0L)
      | None -> assert_failure "SURE_BTC not found")
  | Error e -> assert_failure (Printf.sprintf "Distribution failed: %s" (error_to_string e))

let test_premium_distribution_multiple_tranches _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-SNR" ~capital:80_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-MEZZ" ~capital:60_000_000_000L in

  let result = simulate_premium_distribution vault ~premium:50_000_000_000L in
  match result with
  | Ok (dist, new_vault) ->
      (* BTC should get paid first (senior-most) *)
      (match List.hd dist.distributions with
      | Some (t, _) -> assert_bool "First distribution should be to BTC" (String.equal t "SURE-BTC")
      | None -> assert_failure "No distributions found");

      (* Total capital should be unchanged *)
      assert_int64_equal vault.total_capital new_vault.total_capital
  | Error e -> assert_failure (Printf.sprintf "Distribution failed: %s" (error_to_string e))

let test_premium_distribution_exhausted _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:1_000_000_000L in (* Small capital *)

  let result = simulate_premium_distribution vault ~premium:100_000_000L in
  match result with
  | Ok (dist, _) ->
      (* Premium should be distributed *)
      assert_bool "Should have distributions" (List.length dist.distributions > 0);
      (* Some premium might remain if yield target is less than premium *)
      assert_bool "Remaining should be non-negative" Int64.(dist.remaining >= 0L)
  | Error e -> assert_failure (Printf.sprintf "Distribution failed: %s" (error_to_string e))

let test_premium_distribution_zero_premium _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in

  let result = simulate_premium_distribution vault ~premium:0L in
  match result with
  | Ok _ -> assert_failure "Should fail with zero premium"
  | Error (InvalidPrice _) -> () (* Expected *)
  | Error e -> assert_failure (Printf.sprintf "Wrong error type: %s" (error_to_string e))

let test_premium_distribution_negative_premium _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in

  let result = simulate_premium_distribution vault ~premium:(-1000L) in
  match result with
  | Ok _ -> assert_failure "Should fail with negative premium"
  | Error (InvalidPrice _) -> () (* Expected *)
  | Error e -> assert_failure (Printf.sprintf "Wrong error type: %s" (error_to_string e))

(* ========================================
   LOSS ABSORPTION TESTS
   ======================================== *)

let test_loss_absorption_single_tranche _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:10_000_000_000L in

  let result = simulate_loss_absorption vault ~loss:5_000_000_000L in
  match result with
  | Ok (absorption, new_vault) ->
      (* EQT should absorb the loss *)
      assert_bool "EQT should absorb loss"
        (List.exists absorption.absorptions ~f:(fun (t, _) -> String.equal t "SURE-EQT"));

      (* Check capital reduced *)
      (match get_tranche new_vault ~tranche:"SURE-EQT" with
      | Some t -> assert_int64_equal 5_000_000_000L t.capital
      | None -> assert_failure "SURE_EQT not found");

      (* Check total capital reduced *)
      assert_int64_equal 5_000_000_000L new_vault.total_capital
  | Error e -> assert_failure (Printf.sprintf "Absorption failed: %s" (error_to_string e))

let test_loss_absorption_wipes_tranche _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:10_000_000_000L in

  let result = simulate_loss_absorption vault ~loss:10_000_000_000L in
  match result with
  | Ok (absorption, new_vault) ->
      (* EQT should be wiped *)
      assert_bool "EQT should be wiped"
        (List.mem absorption.wiped_tranches "SURE-EQT" ~equal:String.equal);

      (* Check capital is zero *)
      (match get_tranche new_vault ~tranche:"SURE-EQT" with
      | Some t -> assert_int64_equal 0L t.capital
      | None -> assert_failure "SURE_EQT not found");

      (* No remaining loss *)
      assert_int64_equal 0L absorption.remaining
  | Error e -> assert_failure (Printf.sprintf "Absorption failed: %s" (error_to_string e))

let test_loss_absorption_cascades _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:10_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-JNR+" ~capital:12_000_000_000L in

  (* Loss exceeds EQT capital, should cascade to JNR+ *)
  let result = simulate_loss_absorption vault ~loss:15_000_000_000L in
  match result with
  | Ok (absorption, new_vault) ->
      (* EQT should be wiped *)
      assert_bool "EQT should be wiped"
        (List.mem absorption.wiped_tranches "SURE-EQT" ~equal:String.equal);

      (* JNR+ should absorb remaining *)
      assert_bool "JNR+ should absorb loss"
        (List.exists absorption.absorptions ~f:(fun (t, _) -> String.equal t "SURE-JNR+"));

      (* Check JNR+ capital reduced by 5B *)
      (match get_tranche new_vault ~tranche:"SURE-JNR+" with
      | Some t -> assert_int64_equal 7_000_000_000L t.capital
      | None -> assert_failure "SURE_JNR_PLUS not found");

      (* No remaining loss *)
      assert_int64_equal 0L absorption.remaining
  | Error e -> assert_failure (Printf.sprintf "Absorption failed: %s" (error_to_string e))

let test_loss_absorption_insolvency _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:10_000_000_000L in

  (* Loss exceeds all capital *)
  let result = simulate_loss_absorption vault ~loss:50_000_000_000L in
  match result with
  | Ok (absorption, new_vault) ->
      (* EQT should be wiped *)
      assert_bool "EQT should be wiped"
        (List.mem absorption.wiped_tranches "SURE-EQT" ~equal:String.equal);

      (* Should have remaining loss (insolvency) *)
      assert_int64_equal 40_000_000_000L absorption.remaining;

      (* All capital should be wiped *)
      assert_int64_equal 0L new_vault.total_capital
  | Error e -> assert_failure (Printf.sprintf "Absorption failed: %s" (error_to_string e))

let test_loss_absorption_zero_loss _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:10_000_000_000L in

  let result = simulate_loss_absorption vault ~loss:0L in
  match result with
  | Ok _ -> assert_failure "Should fail with zero loss"
  | Error (InvalidPrice _) -> () (* Expected *)
  | Error e -> assert_failure (Printf.sprintf "Wrong error type: %s" (error_to_string e))

(* ========================================
   SCENARIO SIMULATION TESTS
   ======================================== *)

let test_scenario_premium_then_loss _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:10_000_000_000L in

  let events = [
    `Premium 5_000_000_000L;
    `Loss 3_000_000_000L;
  ] in

  let result = simulate_scenario vault ~events in
  match result with
  | Ok (final_vault, log) ->
      (* Log should contain both events *)
      assert_bool "Log should mention premium" (String.is_substring log ~substring:"Premium");
      assert_bool "Log should mention loss" (String.is_substring log ~substring:"Loss");

      (* Total capital should be reduced by loss *)
      assert_bool "Capital should be reduced" Int64.(final_vault.total_capital < vault.total_capital);

      (* Accumulated losses should be tracked *)
      assert_int64_equal 3_000_000_000L final_vault.accumulated_losses
  | Error e -> assert_failure (Printf.sprintf "Scenario failed: %s" (error_to_string e))

let test_scenario_multiple_events _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-SNR" ~capital:80_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:20_000_000_000L in

  let events = [
    `Premium 10_000_000_000L;
    `Premium 5_000_000_000L;
    `Loss 8_000_000_000L;
    `Premium 3_000_000_000L;
  ] in

  let result = simulate_scenario vault ~events in
  match result with
  | Ok (final_vault, log) ->
      (* Log should contain all 4 events *)
      let premium_count = String.count log ~f:(fun c -> Char.equal c 'P') in
      assert_bool "Log should have multiple entries" (premium_count >= 3);

      (* Vault should still be valid *)
      assert_bool "Capital should be positive" Int64.(final_vault.total_capital > 0L)
  | Error e -> assert_failure (Printf.sprintf "Scenario failed: %s" (error_to_string e))

let test_scenario_empty_events _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in

  let events = [] in

  let result = simulate_scenario vault ~events in
  match result with
  | Ok (final_vault, log) ->
      (* Vault should be unchanged *)
      assert_int64_equal vault.total_capital final_vault.total_capital;
      (* Log should be empty *)
      assert_equal "" log
  | Error e -> assert_failure (Printf.sprintf "Scenario failed: %s" (error_to_string e))

(* ========================================
   UTILITY FUNCTION TESTS
   ======================================== *)

let test_calculate_vault_utilization _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in
  let vault = { vault with total_coverage_sold = 50_000_000_000L } in

  let util = calculate_vault_utilization vault in
  assert_float_equal 0.5 util

let test_calculate_vault_utilization_zero_capital _ =
  let vault = create_initial_vault () in

  let util = calculate_vault_utilization vault in
  assert_float_equal 0.0 util

let test_is_solvent_true _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in
  let vault = { vault with total_coverage_sold = 50_000_000_000L } in

  assert_bool "Vault should be solvent" (is_solvent vault)

let test_is_solvent_false _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:50_000_000_000L in
  let vault = { vault with total_coverage_sold = 100_000_000_000L } in

  assert_bool "Vault should not be solvent" (not (is_solvent vault))

let test_is_solvent_exact _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in
  let vault = { vault with total_coverage_sold = 100_000_000_000L } in

  assert_bool "Vault should be solvent at exact match" (is_solvent vault)

let test_get_tranche_exists _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in

  match get_tranche vault ~tranche:"SURE-BTC" with
  | Some t -> assert_int64_equal 100_000_000_000L t.capital
  | None -> assert_failure "SURE_BTC should exist"

let test_generate_report _ =
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:10_000_000_000L in

  let report = generate_report vault in

  (* Report should contain key information *)
  assert_bool "Report should mention total capital" (String.is_substring report ~substring:"Total Capital");
  assert_bool "Report should mention SURE-BTC" (String.is_substring report ~substring:"SURE-BTC");
  assert_bool "Report should mention SURE-EQT" (String.is_substring report ~substring:"SURE-EQT");
  assert_bool "Report should mention solvent status" (String.is_substring report ~substring:"Solvent")

(* ========================================
   COMPLEX INTEGRATION TESTS
   ======================================== *)

let test_full_waterfall_integration _ =
  (* Setup vault with all tranches *)
  let vault = create_initial_vault () in
  let vault = set_tranche_capital vault ~tranche:"SURE-BTC" ~capital:100_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-SNR" ~capital:80_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-MEZZ" ~capital:60_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-JNR" ~capital:40_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-JNR+" ~capital:30_000_000_000L in
  let vault = set_tranche_capital vault ~tranche:"SURE-EQT" ~capital:20_000_000_000L in

  (* Total capital: 330B nanoTON *)
  assert_int64_equal 330_000_000_000L vault.total_capital;

  (* Distribute premium *)
  let result1 = simulate_premium_distribution vault ~premium:20_000_000_000L in
  let vault = match result1 with
    | Ok (_, v) -> v
    | Error e -> assert_failure (Printf.sprintf "Premium distribution failed: %s" (error_to_string e))
  in

  (* Absorb loss *)
  let result2 = simulate_loss_absorption vault ~loss:50_000_000_000L in
  let vault = match result2 with
    | Ok (absorption, v) ->
        (* EQT and JNR+ should be wiped *)
        assert_bool "Should have wiped tranches" (List.length absorption.wiped_tranches > 0);
        v
    | Error e -> assert_failure (Printf.sprintf "Loss absorption failed: %s" (error_to_string e))
  in

  (* Final capital should be 280B (330B - 50B loss) *)
  assert_int64_equal 280_000_000_000L vault.total_capital;
  assert_int64_equal 50_000_000_000L vault.accumulated_losses

(* ========================================
   TEST SUITE
   ======================================== *)

let suite = "Waterfall Simulator Tests" >::: [
  (* Initialization tests *)
  "test_create_initial_vault" >:: test_create_initial_vault;
  "test_set_tranche_capital" >:: test_set_tranche_capital;
  "test_set_multiple_tranche_capitals" >:: test_set_multiple_tranche_capitals;

  (* Premium distribution tests *)
  "test_premium_distribution_single_tranche" >:: test_premium_distribution_single_tranche;
  "test_premium_distribution_multiple_tranches" >:: test_premium_distribution_multiple_tranches;
  "test_premium_distribution_exhausted" >:: test_premium_distribution_exhausted;
  "test_premium_distribution_zero_premium" >:: test_premium_distribution_zero_premium;
  "test_premium_distribution_negative_premium" >:: test_premium_distribution_negative_premium;

  (* Loss absorption tests *)
  "test_loss_absorption_single_tranche" >:: test_loss_absorption_single_tranche;
  "test_loss_absorption_wipes_tranche" >:: test_loss_absorption_wipes_tranche;
  "test_loss_absorption_cascades" >:: test_loss_absorption_cascades;
  "test_loss_absorption_insolvency" >:: test_loss_absorption_insolvency;
  "test_loss_absorption_zero_loss" >:: test_loss_absorption_zero_loss;

  (* Scenario simulation tests *)
  "test_scenario_premium_then_loss" >:: test_scenario_premium_then_loss;
  "test_scenario_multiple_events" >:: test_scenario_multiple_events;
  "test_scenario_empty_events" >:: test_scenario_empty_events;

  (* Utility function tests *)
  "test_calculate_vault_utilization" >:: test_calculate_vault_utilization;
  "test_calculate_vault_utilization_zero_capital" >:: test_calculate_vault_utilization_zero_capital;
  "test_is_solvent_true" >:: test_is_solvent_true;
  "test_is_solvent_false" >:: test_is_solvent_false;
  "test_is_solvent_exact" >:: test_is_solvent_exact;
  "test_get_tranche_exists" >:: test_get_tranche_exists;
  "test_generate_report" >:: test_generate_report;

  (* Complex integration tests *)
  "test_full_waterfall_integration" >:: test_full_waterfall_integration;
]

let () =
  run_test_tt_main suite
