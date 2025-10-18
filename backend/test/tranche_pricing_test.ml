(* Unit tests for Tranche Pricing Module *)

open OUnit2
open Tranche_pricing

(* Helper function to check float equality with tolerance *)
let assert_float_equal ?(tolerance = 0.001) expected actual =
  let diff = Float.abs (expected -. actual) in
  assert_bool
    (Printf.sprintf "Expected %.6f but got %.6f (diff: %.6f, tolerance: %.6f)"
       expected actual diff tolerance)
    (diff <= tolerance)

(* ========================================
   FLAT CURVE TESTS (SURE-BTC)
   ======================================== *)

let test_flat_curve_u0 _ =
  let apy = calculate_apy ~tranche:SURE_BTC ~utilization:0.0 in
  assert_float_equal 4.0 apy

let test_flat_curve_u50 _ =
  let apy = calculate_apy ~tranche:SURE_BTC ~utilization:0.5 in
  assert_float_equal 4.0 apy

let test_flat_curve_u100 _ =
  let apy = calculate_apy ~tranche:SURE_BTC ~utilization:1.0 in
  assert_float_equal 4.0 apy

(* ========================================
   LOGARITHMIC CURVE TESTS (SURE-SNR)
   ======================================== *)

let test_logarithmic_curve_u0 _ =
  (* log(1 + 0) / log(2) = 0, so APY = 6.5 + (10 - 6.5) * 0 = 6.5 *)
  let apy = calculate_apy ~tranche:SURE_SNR ~utilization:0.0 in
  assert_float_equal 6.5 apy

let test_logarithmic_curve_u50 _ =
  (* log(1.5) / log(2) ≈ 0.585, so APY = 6.5 + 3.5 * 0.585 ≈ 8.548 *)
  let apy = calculate_apy ~tranche:SURE_SNR ~utilization:0.5 in
  assert_float_equal 8.548 apy ~tolerance:0.01

let test_logarithmic_curve_u100 _ =
  (* log(2) / log(2) = 1.0, so APY = 6.5 + 3.5 * 1.0 = 10.0 *)
  let apy = calculate_apy ~tranche:SURE_SNR ~utilization:1.0 in
  assert_float_equal 10.0 apy

(* ========================================
   LINEAR CURVE TESTS (SURE-MEZZ)
   ======================================== *)

let test_linear_curve_u0 _ =
  let apy = calculate_apy ~tranche:SURE_MEZZ ~utilization:0.0 in
  assert_float_equal 9.0 apy

let test_linear_curve_u50 _ =
  (* APY = 9.0 + (15.0 - 9.0) * 0.5 = 9.0 + 3.0 = 12.0 *)
  let apy = calculate_apy ~tranche:SURE_MEZZ ~utilization:0.5 in
  assert_float_equal 12.0 apy

let test_linear_curve_u100 _ =
  let apy = calculate_apy ~tranche:SURE_MEZZ ~utilization:1.0 in
  assert_float_equal 15.0 apy

(* ========================================
   SIGMOIDAL CURVE TESTS (SURE-JNR)
   ======================================== *)

let test_sigmoidal_curve_u0 _ =
  (* At U=0: 1/(1 + exp(-10*(-0.5))) = 1/(1 + exp(5)) ≈ 0.0067 *)
  (* APY = 12.5 + (16 - 12.5) * 0.0067 ≈ 12.52 *)
  let apy = calculate_apy ~tranche:SURE_JNR ~utilization:0.0 in
  assert_float_equal 12.5 apy ~tolerance:0.05

let test_sigmoidal_curve_u50 _ =
  (* At U=0.5: 1/(1 + exp(0)) = 0.5 *)
  (* APY = 12.5 + 3.5 * 0.5 = 14.25 *)
  let apy = calculate_apy ~tranche:SURE_JNR ~utilization:0.5 in
  assert_float_equal 14.25 apy ~tolerance:0.01

let test_sigmoidal_curve_u100 _ =
  (* At U=1.0: 1/(1 + exp(-10*0.5)) = 1/(1 + exp(-5)) ≈ 0.9933 *)
  (* APY = 12.5 + 3.5 * 0.9933 ≈ 15.98 *)
  let apy = calculate_apy ~tranche:SURE_JNR ~utilization:1.0 in
  assert_float_equal 16.0 apy ~tolerance:0.05

(* ========================================
   QUADRATIC CURVE TESTS (SURE-JNR+)
   ======================================== *)

let test_quadratic_curve_u0 _ =
  let apy = calculate_apy ~tranche:SURE_JNR_PLUS ~utilization:0.0 in
  assert_float_equal 16.0 apy

let test_quadratic_curve_u50 _ =
  (* APY = 16.0 + (22.0 - 16.0) * 0.5^2 = 16.0 + 6.0 * 0.25 = 17.5 *)
  let apy = calculate_apy ~tranche:SURE_JNR_PLUS ~utilization:0.5 in
  assert_float_equal 17.5 apy

let test_quadratic_curve_u100 _ =
  let apy = calculate_apy ~tranche:SURE_JNR_PLUS ~utilization:1.0 in
  assert_float_equal 22.0 apy

(* ========================================
   EXPONENTIAL CURVE TESTS (SURE-EQT)
   ======================================== *)

let test_exponential_curve_u0 _ =
  (* At U=0: (exp(0) - 1) / (exp(2) - 1) = 0 / 6.389 = 0 *)
  (* APY = 15.0 + 10.0 * 0 = 15.0 *)
  let apy = calculate_apy ~tranche:SURE_EQT ~utilization:0.0 in
  assert_float_equal 15.0 apy

let test_exponential_curve_u50 _ =
  (* At U=0.5: (exp(1) - 1) / (exp(2) - 1) = 1.718 / 6.389 ≈ 0.269 *)
  (* APY = 15.0 + 10.0 * 0.269 = 17.69 *)
  let apy = calculate_apy ~tranche:SURE_EQT ~utilization:0.5 in
  assert_float_equal 17.69 apy ~tolerance:0.05

let test_exponential_curve_u100 _ =
  (* At U=1.0: (exp(2) - 1) / (exp(2) - 1) = 1.0 *)
  (* APY = 15.0 + 10.0 * 1.0 = 25.0 *)
  let apy = calculate_apy ~tranche:SURE_EQT ~utilization:1.0 in
  assert_float_equal 25.0 apy

(* ========================================
   UTILIZATION CALCULATION TESTS
   ======================================== *)

let test_utilization_zero_capital _ =
  let util = calculate_utilization ~total_capital:0L ~coverage_sold:0L in
  assert_float_equal 0.0 util

let test_utilization_50_percent _ =
  let util = calculate_utilization ~total_capital:100_000L ~coverage_sold:50_000L in
  assert_float_equal 0.5 util

let test_utilization_100_percent _ =
  let util = calculate_utilization ~total_capital:100_000L ~coverage_sold:100_000L in
  assert_float_equal 1.0 util

let test_utilization_over_100_percent _ =
  (* Should cap at 1.0 *)
  let util = calculate_utilization ~total_capital:100_000L ~coverage_sold:150_000L in
  assert_float_equal 1.0 util

(* ========================================
   TRANCHE CONFIG TESTS
   ======================================== *)

let test_get_tranche_config_btc _ =
  let config = get_tranche_config ~tranche:SURE_BTC in
  assert_equal SURE_BTC config.tranche_id;
  assert_float_equal 4.0 config.apy_min;
  assert_float_equal 4.0 config.apy_max;
  assert_equal 25 config.allocation_percent

let test_get_tranche_config_snr _ =
  let config = get_tranche_config ~tranche:SURE_SNR in
  assert_equal SURE_SNR config.tranche_id;
  assert_float_equal 6.5 config.apy_min;
  assert_float_equal 10.0 config.apy_max;
  assert_equal 20 config.allocation_percent

let test_get_tranche_config_eqt _ =
  let config = get_tranche_config ~tranche:SURE_EQT in
  assert_equal SURE_EQT config.tranche_id;
  assert_float_equal 15.0 config.apy_min;
  assert_float_equal 25.0 config.apy_max;
  assert_equal 10 config.allocation_percent

(* ========================================
   STRING CONVERSION TESTS
   ======================================== *)

let test_tranche_to_string _ =
  assert_equal "SURE-BTC" (tranche_to_string SURE_BTC);
  assert_equal "SURE-SNR" (tranche_to_string SURE_SNR);
  assert_equal "SURE-MEZZ" (tranche_to_string SURE_MEZZ);
  assert_equal "SURE-JNR" (tranche_to_string SURE_JNR);
  assert_equal "SURE-JNR+" (tranche_to_string SURE_JNR_PLUS);
  assert_equal "SURE-EQT" (tranche_to_string SURE_EQT)

let test_tranche_of_string _ =
  assert_equal (Ok SURE_BTC) (tranche_of_string "SURE-BTC");
  assert_equal (Ok SURE_SNR) (tranche_of_string "SURE-SNR");
  assert_equal (Ok SURE_MEZZ) (tranche_of_string "SURE-MEZZ");
  assert_equal (Ok SURE_JNR) (tranche_of_string "SURE-JNR");
  assert_equal (Ok SURE_JNR_PLUS) (tranche_of_string "SURE-JNR+");
  assert_equal (Ok SURE_EQT) (tranche_of_string "SURE-EQT");
  match tranche_of_string "INVALID" with
  | Error _ -> ()
  | Ok _ -> assert_failure "Expected error for invalid tranche"

let test_curve_type_to_string _ =
  assert_equal "FLAT" (curve_type_to_string `Flat);
  assert_equal "LOGARITHMIC" (curve_type_to_string `Logarithmic);
  assert_equal "LINEAR" (curve_type_to_string `Linear);
  assert_equal "SIGMOIDAL" (curve_type_to_string `Sigmoidal);
  assert_equal "QUADRATIC" (curve_type_to_string `Quadratic);
  assert_equal "EXPONENTIAL" (curve_type_to_string `Exponential)

(* ========================================
   BOUNDARY TESTS
   ======================================== *)

let test_utilization_bounds_negative _ =
  (* Negative utilization should be clamped to 0 *)
  let apy = calculate_apy ~tranche:SURE_MEZZ ~utilization:(-0.5) in
  assert_float_equal 9.0 apy

let test_utilization_bounds_above_one _ =
  (* Utilization > 1.0 should be clamped to 1.0 *)
  let apy = calculate_apy ~tranche:SURE_MEZZ ~utilization:1.5 in
  assert_float_equal 15.0 apy

(* ========================================
   TEST SUITE
   ======================================== *)

let suite = "Tranche Pricing Tests" >::: [
  (* FLAT curve tests *)
  "test_flat_curve_u0" >:: test_flat_curve_u0;
  "test_flat_curve_u50" >:: test_flat_curve_u50;
  "test_flat_curve_u100" >:: test_flat_curve_u100;

  (* LOGARITHMIC curve tests *)
  "test_logarithmic_curve_u0" >:: test_logarithmic_curve_u0;
  "test_logarithmic_curve_u50" >:: test_logarithmic_curve_u50;
  "test_logarithmic_curve_u100" >:: test_logarithmic_curve_u100;

  (* LINEAR curve tests *)
  "test_linear_curve_u0" >:: test_linear_curve_u0;
  "test_linear_curve_u50" >:: test_linear_curve_u50;
  "test_linear_curve_u100" >:: test_linear_curve_u100;

  (* SIGMOIDAL curve tests *)
  "test_sigmoidal_curve_u0" >:: test_sigmoidal_curve_u0;
  "test_sigmoidal_curve_u50" >:: test_sigmoidal_curve_u50;
  "test_sigmoidal_curve_u100" >:: test_sigmoidal_curve_u100;

  (* QUADRATIC curve tests *)
  "test_quadratic_curve_u0" >:: test_quadratic_curve_u0;
  "test_quadratic_curve_u50" >:: test_quadratic_curve_u50;
  "test_quadratic_curve_u100" >:: test_quadratic_curve_u100;

  (* EXPONENTIAL curve tests *)
  "test_exponential_curve_u0" >:: test_exponential_curve_u0;
  "test_exponential_curve_u50" >:: test_exponential_curve_u50;
  "test_exponential_curve_u100" >:: test_exponential_curve_u100;

  (* Utilization calculation tests *)
  "test_utilization_zero_capital" >:: test_utilization_zero_capital;
  "test_utilization_50_percent" >:: test_utilization_50_percent;
  "test_utilization_100_percent" >:: test_utilization_100_percent;
  "test_utilization_over_100_percent" >:: test_utilization_over_100_percent;

  (* Tranche config tests *)
  "test_get_tranche_config_btc" >:: test_get_tranche_config_btc;
  "test_get_tranche_config_snr" >:: test_get_tranche_config_snr;
  "test_get_tranche_config_eqt" >:: test_get_tranche_config_eqt;

  (* String conversion tests *)
  "test_tranche_to_string" >:: test_tranche_to_string;
  "test_tranche_of_string" >:: test_tranche_of_string;
  "test_curve_type_to_string" >:: test_curve_type_to_string;

  (* Boundary tests *)
  "test_utilization_bounds_negative" >:: test_utilization_bounds_negative;
  "test_utilization_bounds_above_one" >:: test_utilization_bounds_above_one;
]

let () =
  run_test_tt_main suite
