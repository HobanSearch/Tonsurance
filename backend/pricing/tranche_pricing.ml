(* Tranche Pricing Module - Bonding Curve Calculations

   Calculates APY for each tranche based on utilization.
   Mirrors FunC bonding curve implementations for consistency.
*)

open Core

type tranche =
  | SURE_BTC    (* Tier 1: 4% flat *)
  | SURE_SNR    (* Tier 2: 6.5% -> 10% log *)
  | SURE_MEZZ   (* Tier 3: 9% -> 15% linear *)
  | SURE_JNR    (* Tier 4: 12.5% -> 16% sigmoidal *)
  | SURE_JNR_PLUS  (* Tier 5: 16% -> 22% quadratic *)
  | SURE_EQT    (* Tier 6: 15% -> 25% exponential *)
[@@deriving sexp, compare, enumerate, equal]

type curve_type =
  [ `Flat
  | `Logarithmic
  | `Linear
  | `Sigmoidal
  | `Quadratic
  | `Exponential
  ]
[@@deriving sexp]

type tranche_config = {
  tranche_id: tranche;
  apy_min: float;  (* Minimum APY in percent (e.g., 4.0 for 4%) *)
  apy_max: float;  (* Maximum APY in percent *)
  curve_type: curve_type;
  allocation_percent: int;  (* Capital allocation (25, 20, 18, 15, 12, 10) *)
}
[@@deriving sexp]

(* Configuration for all 6 tranches *)
let tranche_configs : tranche_config list = [
  {
    tranche_id = SURE_BTC;
    apy_min = 4.0;
    apy_max = 4.0;
    curve_type = `Flat;
    allocation_percent = 25;
  };
  {
    tranche_id = SURE_SNR;
    apy_min = 6.5;
    apy_max = 10.0;
    curve_type = `Logarithmic;
    allocation_percent = 20;
  };
  {
    tranche_id = SURE_MEZZ;
    apy_min = 9.0;
    apy_max = 15.0;
    curve_type = `Linear;
    allocation_percent = 18;
  };
  {
    tranche_id = SURE_JNR;
    apy_min = 12.5;
    apy_max = 16.0;
    curve_type = `Sigmoidal;
    allocation_percent = 15;
  };
  {
    tranche_id = SURE_JNR_PLUS;
    apy_min = 16.0;
    apy_max = 22.0;
    curve_type = `Quadratic;
    allocation_percent = 12;
  };
  {
    tranche_id = SURE_EQT;
    apy_min = 15.0;
    apy_max = 25.0;
    curve_type = `Exponential;
    allocation_percent = 10;
  };
]

(* Get tranche configuration *)
let get_tranche_config ~tranche : tranche_config =
  match List.find tranche_configs ~f:(fun c -> Poly.equal c.tranche_id tranche) with
  | Some config -> config
  | None -> failwith "Invalid tranche - this should never happen"

(* Bonding curve implementations *)
module BondingCurves = struct

  (* FLAT: Always returns min APY *)
  let flat ~min_apy ~max_apy:_ ~utilization:_ =
    min_apy

  (* LOGARITHMIC: min + (max - min) * log(1 + U) / log(2) *)
  let logarithmic ~min_apy ~max_apy ~utilization =
    let u = Float.max 0.0 (Float.min 1.0 utilization) in
    min_apy +. (max_apy -. min_apy) *. (Float.log (1.0 +. u) /. Float.log 2.0)

  (* LINEAR: min + (max - min) * U *)
  let linear ~min_apy ~max_apy ~utilization =
    let u = Float.max 0.0 (Float.min 1.0 utilization) in
    min_apy +. (max_apy -. min_apy) *. u

  (* SIGMOIDAL: min + (max - min) / (1 + exp(-10 * (U - 0.5))) *)
  let sigmoidal ~min_apy ~max_apy ~utilization =
    let u = Float.max 0.0 (Float.min 1.0 utilization) in
    let sigmoid_term = 1.0 /. (1.0 +. Float.exp (-.10.0 *. (u -. 0.5))) in
    min_apy +. (max_apy -. min_apy) *. sigmoid_term

  (* QUADRATIC: min + (max - min) * U^2 *)
  let quadratic ~min_apy ~max_apy ~utilization =
    let u = Float.max 0.0 (Float.min 1.0 utilization) in
    min_apy +. (max_apy -. min_apy) *. (u *. u)

  (* EXPONENTIAL: min + (max - min) * (exp(2U) - 1) / (exp(2) - 1) *)
  let exponential ~min_apy ~max_apy ~utilization =
    let u = Float.max 0.0 (Float.min 1.0 utilization) in
    let numerator = Float.exp (2.0 *. u) -. 1.0 in
    let denominator = Float.exp 2.0 -. 1.0 in
    min_apy +. (max_apy -. min_apy) *. (numerator /. denominator)

end

(* Calculate APY for a tranche given utilization ratio *)
let calculate_apy ~tranche ~utilization : float =
  let config = get_tranche_config ~tranche in
  match config.curve_type with
  | `Flat ->
      BondingCurves.flat
        ~min_apy:config.apy_min
        ~max_apy:config.apy_max
        ~utilization
  | `Logarithmic ->
      BondingCurves.logarithmic
        ~min_apy:config.apy_min
        ~max_apy:config.apy_max
        ~utilization
  | `Linear ->
      BondingCurves.linear
        ~min_apy:config.apy_min
        ~max_apy:config.apy_max
        ~utilization
  | `Sigmoidal ->
      BondingCurves.sigmoidal
        ~min_apy:config.apy_min
        ~max_apy:config.apy_max
        ~utilization
  | `Quadratic ->
      BondingCurves.quadratic
        ~min_apy:config.apy_min
        ~max_apy:config.apy_max
        ~utilization
  | `Exponential ->
      BondingCurves.exponential
        ~min_apy:config.apy_min
        ~max_apy:config.apy_max
        ~utilization

(* Calculate utilization for a tranche *)
let calculate_utilization ~total_capital ~coverage_sold : float =
  if Int64.(total_capital = 0L) then
    0.0
  else
    let capital_f = Int64.to_float total_capital in
    let coverage_f = Int64.to_float coverage_sold in
    Float.min 1.0 (coverage_f /. capital_f)

(* Helper function to convert tranche to string *)
let tranche_to_string = function
  | SURE_BTC -> "SURE-BTC"
  | SURE_SNR -> "SURE-SNR"
  | SURE_MEZZ -> "SURE-MEZZ"
  | SURE_JNR -> "SURE-JNR"
  | SURE_JNR_PLUS -> "SURE-JNR+"
  | SURE_EQT -> "SURE-EQT"

(* Helper function to convert string to tranche *)
let tranche_of_string = function
  | "SURE-BTC" -> Ok SURE_BTC
  | "SURE-SNR" -> Ok SURE_SNR
  | "SURE-MEZZ" -> Ok SURE_MEZZ
  | "SURE-JNR" -> Ok SURE_JNR
  | "SURE-JNR+" -> Ok SURE_JNR_PLUS
  | "SURE-EQT" -> Ok SURE_EQT
  | s -> Error (Printf.sprintf "Unknown tranche: %s" s)

(* Helper function to convert curve_type to string *)
let curve_type_to_string = function
  | `Flat -> "FLAT"
  | `Logarithmic -> "LOGARITHMIC"
  | `Linear -> "LINEAR"
  | `Sigmoidal -> "SIGMOIDAL"
  | `Quadratic -> "QUADRATIC"
  | `Exponential -> "EXPONENTIAL"
