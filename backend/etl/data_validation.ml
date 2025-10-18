(** Data Validation and Quality Checks
 *
 * This module provides validation functions for:
 * - Price data (outlier detection, bounds checking)
 * - Depeg events (minimum duration, valid timestamps)
 * - Correlation matrices (valid bounds, symmetry)
 * - Scenario probabilities (sum to 1.0)
 * - Data freshness checks
 *
 * Quality Standards:
 * - Price outliers: > 5σ from mean
 * - Depeg minimum duration: 1 hour
 * - Correlation bounds: -1.0 to 1.0
 * - Scenario probabilities: sum ≈ 1.0 (within 0.01)
 * - Data freshness: < 24 hours old
 *)

open Core
open Types
open Math

module DataValidation = struct

  (** Validation result *)
  type validation_result =
    | Valid
    | Invalid of string
  [@@deriving sexp]

  let is_valid = function
    | Valid -> true
    | Invalid _ -> false

  let error_message = function
    | Valid -> None
    | Invalid msg -> Some msg

  (** Validate price data for outliers *)
  let validate_price_data
      (prices: (float * float) list) (* timestamp * price *)
    : validation_result =

    if List.is_empty prices then
      Invalid "Empty price data"
    else
      (* Extract prices *)
      let price_values = List.map prices ~f:snd in

      (* Calculate mean and std dev *)
      let price_mean = mean price_values in
      let price_std = std_dev price_values in

      (* Check for outliers (> 5σ) *)
      let outliers =
        List.filter prices ~f:(fun (_, price) ->
          Float.(abs (price -. price_mean) > (5.0 *. price_std))
        )
      in

      if List.length outliers > (List.length prices / 10) then
        (* More than 10% outliers = bad data *)
        Invalid (Printf.sprintf
          "Too many outliers: %d/%d (mean=%.4f, std=%.4f)"
          (List.length outliers)
          (List.length prices)
          price_mean
          price_std
        )
      else
        Valid

  (** Validate individual price point *)
  let validate_price_point
      ~(_asset: asset)
      ~(price: float)
      ~(timestamp: float)
    : validation_result =

    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

    (* Check timestamp is not in future *)
    if Float.(timestamp > now +. 3600.0) then
      Invalid "Price timestamp in future"

    (* Check timestamp is not too old (> 1 year) *)
    else if Float.(timestamp < now -. (365.0 *. 86400.0)) then
      Invalid "Price timestamp too old"

    (* Check price bounds based on asset type *)
    else
      match _asset with
      | USDC | USDT | DAI | USDP | FRAX | BUSD
      | USDe | SUSDe | USDY | PYUSD | GHO | LUSD | CrvUSD | MkUSD ->
          (* Stablecoins: $0.50 to $1.50 *)
          if Float.O.(price < 0.50 || price > 1.50) then
            Invalid (Printf.sprintf "Price %.4f outside stablecoin bounds [0.50, 1.50]" price)
          else
            Valid

      | BTC ->
          (* Bitcoin: $1,000 to $1,000,000 *)
          if Float.O.(price < 1000.0 || price > 1_000_000.0) then
            Invalid (Printf.sprintf "BTC price %.2f outside reasonable bounds" price)
          else
            Valid

      | ETH ->
          (* Ethereum: $100 to $100,000 *)
          if Float.O.(price < 100.0 || price > 100_000.0) then
            Invalid (Printf.sprintf "ETH price %.2f outside reasonable bounds" price)
          else
            Valid

  (** Validate depeg event *)
  let validate_depeg_event
      ~(_asset: asset)
      ~(min_price: float)
      ~(duration_seconds: int)
      ~(recovery_time_seconds: int)
      ~(start_timestamp: float)
      ~(end_timestamp: float)
    : validation_result =

    (* Minimum duration: 1 hour *)
    if duration_seconds < 3600 then
      Invalid (Printf.sprintf "Duration %d seconds < 1 hour minimum" duration_seconds)

    (* Price bounds for stablecoins *)
    else if Float.O.(min_price < 0.50 || min_price > 1.50) then
      Invalid (Printf.sprintf "Min price %.4f outside valid range [0.50, 1.50]" min_price)

    (* Recovery time must be >= duration *)
    else if recovery_time_seconds < duration_seconds then
      Invalid (Printf.sprintf
        "Recovery time %d < duration %d"
        recovery_time_seconds duration_seconds
      )

    (* Timestamps must be ordered *)
    else if Float.O.(end_timestamp < start_timestamp) then
      Invalid "End timestamp before start timestamp"

    (* Duration must match timestamps *)
    else
      let calculated_duration = Int.of_float (end_timestamp -. start_timestamp) in
      if Int.abs (calculated_duration - duration_seconds) > 60 then
        Invalid (Printf.sprintf
          "Duration mismatch: stored=%d calculated=%d"
          duration_seconds calculated_duration
        )
      else
        Valid

  (** Validate correlation coefficient *)
  let validate_correlation
      (correlation: float)
    : validation_result =

    if Float.is_nan correlation then
      Invalid "Correlation is NaN"
    else if Float.is_inf correlation then
      Invalid "Correlation is infinite"
    else if Float.O.(correlation < -1.0 || correlation > 1.0) then
      Invalid (Printf.sprintf "Correlation %.6f outside bounds [-1.0, 1.0]" correlation)
    else
      Valid

  (** Validate correlation matrix *)
  let validate_correlation_matrix
      (matrix: float list list)
    : validation_result =

    if List.is_empty matrix then
      Invalid "Empty correlation matrix"
    else
      let n = List.length matrix in

      (* Check square matrix *)
      let all_same_length =
        List.for_all matrix ~f:(fun row -> List.length row = n)
      in

      if not all_same_length then
        Invalid "Non-square correlation matrix"
      else
        (* Check diagonal is all 1.0 *)
        let diagonal_ok =
          List.for_alli matrix ~f:(fun i row ->
            match List.nth row i with
            | Some value -> Float.O.(Float.abs (value -. 1.0) < 0.01)
            | None -> false
          )
        in

        if not diagonal_ok then
          Invalid "Correlation matrix diagonal not 1.0"
        else
          (* Check symmetry *)
          let symmetric_ok =
            List.for_alli matrix ~f:(fun i row ->
              List.for_alli row ~f:(fun j value ->
                match List.nth matrix j with
                | Some other_row ->
                    (match List.nth other_row i with
                    | Some other_value ->
                        Float.O.(Float.abs (value -. other_value) < 0.0001)
                    | None -> false
                    )
                | None -> false
              )
            )
          in

          if not symmetric_ok then
            Invalid "Correlation matrix not symmetric"
          else
            (* Check all values in bounds *)
            let all_valid =
              List.for_all matrix ~f:(fun row ->
                List.for_all row ~f:(fun value ->
                  is_valid (validate_correlation value)
                )
              )
            in

            if not all_valid then
              Invalid "Some correlation values out of bounds"
            else
              Valid

  (** Validate scenario probabilities sum to ~1.0 *)
  let validate_scenario_probabilities
      (scenarios: (string * float * float) list) (* name, probability, weight *)
    : validation_result =

    if List.is_empty scenarios then
      Invalid "No scenarios provided"
    else
      (* Calculate weighted probability sum *)
      let total_weighted_prob =
        List.fold scenarios ~init:0.0 ~f:(fun acc (_, prob, weight) ->
          acc +. (prob *. weight)
        )
      in

      (* Should sum to ~1.0 (within 0.05 tolerance) *)
      if Float.O.(Float.abs (total_weighted_prob -. 1.0) > 0.05) then
        Invalid (Printf.sprintf
          "Scenario probabilities sum to %.4f, expected ~1.0"
          total_weighted_prob
        )
      else
        (* Check individual probabilities *)
        let all_valid =
          List.for_all scenarios ~f:(fun (_, prob, weight) ->
            Float.O.(prob >= 0.0 && prob <= 1.0 && weight >= 0.0 && weight <= 10.0)
          )
        in

        if not all_valid then
          Invalid "Some scenario probabilities or weights out of bounds"
        else
          Valid

  (** Check data freshness *)
  let validate_data_freshness
      ~(timestamp: float)
      ~(max_age_seconds: float)
    : validation_result =

    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let age = now -. timestamp in

    if Float.O.(age > max_age_seconds) then
      Invalid (Printf.sprintf
        "Data is %.1f hours old (max: %.1f hours)"
        (age /. 3600.0)
        (max_age_seconds /. 3600.0)
      )
    else if Float.O.(timestamp > now +. 3600.0) then
      Invalid "Data timestamp in future"
    else
      Valid

  (** Validate minimum data points for statistical significance *)
  let validate_data_points
      ~(count: int)
      ~(minimum: int)
    : validation_result =

    if count < minimum then
      Invalid (Printf.sprintf
        "Insufficient data points: %d (minimum: %d)"
        count minimum
      )
    else
      Valid

  (** Comprehensive validation report *)
  type validation_report = {
    total_checks: int;
    passed: int;
    failed: int;
    errors: (string * string) list; (* check_name * error_message *)
    overall_valid: bool;
  } [@@deriving sexp, yojson]

  let create_validation_report
      (checks: (string * validation_result) list)
    : validation_report =

    let errors =
      List.filter_map checks ~f:(fun (name, result) ->
        match result with
        | Valid -> None
        | Invalid msg -> Some (name, msg)
      )
    in

    let passed = List.count checks ~f:(fun (_, result) -> is_valid result) in
    let failed = List.length errors in

    {
      total_checks = List.length checks;
      passed;
      failed;
      errors;
      overall_valid = failed = 0;
    }

  (** Log validation report *)
  let log_validation_report
      ~(component: string)
      (report: validation_report)
    : unit =

    if report.overall_valid then
      Logs.info (fun m ->
        m "[%s] Validation PASSED: %d/%d checks"
          component report.passed report.total_checks
      )
    else
      begin
        Logs.warn (fun m ->
          m "[%s] Validation FAILED: %d/%d checks passed, %d errors"
            component report.passed report.total_checks report.failed
        );
        List.iter report.errors ~f:(fun (check_name, error_msg) ->
          Logs.err (fun m ->
            m "[%s] %s: %s" component check_name error_msg
          )
        )
      end

end
