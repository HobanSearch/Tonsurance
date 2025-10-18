(** Correlation Matrix Updater
 *
 * This module:
 * - Queries last 30/90/365 days of price data for all stablecoins
 * - Calculates Pearson correlation matrix
 * - Stores in asset_correlations table
 * - Detects regime changes (correlation > 0.8 = contagion risk)
 * - Updates daily via cron job
 *
 * Correlation Calculation:
 * - Pearson correlation coefficient: ρ(X,Y) = cov(X,Y) / (σ_X * σ_Y)
 * - Calculated on log returns: r_t = ln(P_t / P_{t-1})
 * - Minimum 20 data points required
 *
 * Contagion Detection:
 * - High correlation (> 0.8) indicates systemic risk
 * - Tracks correlation trends over time
 * - Alerts on sudden correlation spikes
 *)

open Core
open Lwt.Syntax
open Lwt.Infix
open Types
open Math

module CorrelationMatrixUpdater = struct

  (** Correlation window configuration *)
  type correlation_window =
    | Days_30
    | Days_90
    | Days_365
  [@@deriving sexp]

  let window_to_days = function
    | Days_30 -> 30
    | Days_90 -> 90
    | Days_365 -> 365

  let all_windows = [Days_30; Days_90; Days_365]

  (** Price return data *)
  type price_return = {
    timestamp: float;
    log_return: float;
  } [@@deriving sexp]

  (** Correlation result *)
  type correlation_result = {
    asset_1: asset;
    asset_2: asset;
    correlation: float;
    window_days: int;
    data_points: int;
    calculated_at: float;
  } [@@deriving sexp, yojson]

  (** Fetch price history from database *)
  let fetch_price_history
      (module Db : Caqti_lwt.CONNECTION)
      ~(asset: Types.asset)
      ~(window_days: int)
    : ((float * float) list, [> Caqti_error.t]) Result.t Lwt.t =

    let open Caqti_request.Infix in
    let open Caqti_type in

    let query =
      (t2 string int)
      ->* (t2 float float)
      @@ {|
        SELECT
          EXTRACT(EPOCH FROM timestamp) as ts,
          price
        FROM price_history
        WHERE asset = $1
          AND timestamp >= NOW() - INTERVAL '1 day' * $2
          AND is_outlier = false
          AND data_quality_score >= 0.8
        ORDER BY timestamp ASC
      |}
    in

    Db.collect_list query (asset_to_string asset, window_days)

  (** Calculate log returns from price series *)
  let calculate_log_returns
      (prices: (float * float) list)
    : price_return list =

    let rec calc_returns acc prev_prices =
      match prev_prices with
      | [] | [_] -> List.rev acc
      | (t1, p1) :: (t2, p2) :: rest ->
          if Float.O.(Float.abs p1 < 1e-10) then
            (* Skip zero prices *)
            calc_returns acc ((t2, p2) :: rest)
          else
            let log_return = Float.log (p2 /. p1) in
            let return_point = { timestamp = t2; log_return } in
            calc_returns (return_point :: acc) ((t2, p2) :: rest)
    in

    calc_returns [] prices

  (** Calculate Pearson correlation coefficient *)
  let calculate_pearson_correlation
      ~(returns_1: price_return list)
      ~(returns_2: price_return list)
    : float option =

    (* Align returns by timestamp *)
    let aligned_returns =
      List.filter_map returns_1 ~f:(fun r1 ->
        List.find returns_2 ~f:(fun r2 ->
          Float.O.(Float.abs (r1.timestamp -. r2.timestamp) < 60.0) (* Within 1 minute *)
        )
        |> Option.map ~f:(fun r2 -> (r1.log_return, r2.log_return))
      )
    in

    (* Need at least 20 data points *)
    if List.length aligned_returns < 20 then
      None
    else
      let values_1 = List.map aligned_returns ~f:fst in
      let values_2 = List.map aligned_returns ~f:snd in

      (* Calculate using Math.correlation *)
      correlation values_1 values_2

  (** Calculate correlation between two assets *)
  let calculate_correlation
      pool
      ~(asset_1: asset)
      ~(asset_2: asset)
      ~(window_days: int) =

    match pool with
    | Error _e ->
        Lwt.return None
    | Ok pool_unwrapped ->
        let%lwt result =
          Caqti_lwt_unix.Pool.use (fun (module Db : Caqti_lwt.CONNECTION) ->
            (* Fetch price history for both assets *)
            let%lwt prices_1_result = fetch_price_history (module Db) ~asset:asset_1 ~window_days in
            let%lwt prices_2_result = fetch_price_history (module Db) ~asset:asset_2 ~window_days in

            match (prices_1_result, prices_2_result) with
            | (Ok prices_1, Ok prices_2) ->
                if List.is_empty prices_1 || List.is_empty prices_2 then
                  Lwt.return (Ok None)
                else
                  (* Calculate log returns *)
                  let returns_1 = calculate_log_returns prices_1 in
                  let returns_2 = calculate_log_returns prices_2 in

                  (* Calculate correlation *)
                  (match calculate_pearson_correlation ~returns_1 ~returns_2 with
                  | None ->
                      Logs_lwt.warn (fun m ->
                        m "Insufficient data for correlation: %s vs %s (%d days)"
                          (asset_to_string asset_1)
                          (asset_to_string asset_2)
                          window_days
                      ) >>= fun () ->
                      Lwt.return (Ok None)

                  | Some corr ->
                      (* Align returns to count data points *)
                      let aligned_count =
                        List.count returns_1 ~f:(fun r1 ->
                          List.exists returns_2 ~f:(fun r2 ->
                            Float.O.(Float.abs (r1.timestamp -. r2.timestamp) < 60.0)
                          )
                        )
                      in

                      Lwt.return (Ok (Some {
                        asset_1;
                        asset_2;
                        correlation = corr;
                        window_days;
                        data_points = aligned_count;
                        calculated_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
                      }))
                  )

            | _ ->
                Logs_lwt.err (fun m ->
                  m "Failed to fetch price history for correlation calculation"
                ) >>= fun () ->
                Lwt.return (Ok None)
          ) pool_unwrapped
        in
        match result with
        | Ok opt -> Lwt.return opt
        | Error _e -> Lwt.return None

  (** Store correlation result in database *)
  let store_correlation
      pool
      (corr: correlation_result) =

    let open Caqti_request.Infix in
    let open Caqti_type in

    (* Ensure asset_1 < asset_2 alphabetically *)
    let (a1, a2) =
      if String.compare (asset_to_string corr.asset_1) (asset_to_string corr.asset_2) < 0 then
        (corr.asset_1, corr.asset_2)
      else
        (corr.asset_2, corr.asset_1)
    in

    let query =
      (t5 string string float int int)
      ->. unit
      @@ {|
        INSERT INTO asset_correlations (
          asset_1, asset_2, correlation, window_days, data_points, calculated_at
        ) VALUES (
          $1, $2, $3, $4, $5, NOW()
        )
        ON CONFLICT (asset_1, asset_2, window_days)
        DO UPDATE SET
          correlation = EXCLUDED.correlation,
          data_points = EXCLUDED.data_points,
          calculated_at = EXCLUDED.calculated_at
      |}
    in

    let params = (
      asset_to_string a1,
      asset_to_string a2,
      corr.correlation,
      corr.window_days,
      corr.data_points
    ) in

    match pool with
    | Error e -> Lwt.return (Error e)
    | Ok pool ->
        Caqti_lwt_unix.Pool.use (fun (module Db : Caqti_lwt.CONNECTION) ->
          Db.exec query params
        ) pool

  (** Update correlation matrix for all asset pairs *)
  let update_correlation_matrix
      pool
      ~(window_days: int) =

    let stablecoins = [
      USDC; USDT; DAI; USDP; FRAX; BUSD;
      USDe; SUSDe; USDY; PYUSD; GHO; LUSD; CrvUSD; MkUSD;
    ] in

    Logs_lwt.info (fun m ->
      m "Updating correlation matrix for %d assets (%d days window)"
        (List.length stablecoins) window_days
    ) >>= fun () ->

    (* Generate all unique pairs *)
    let asset_pairs =
      List.concat_map stablecoins ~f:(fun a1 ->
        List.filter_map stablecoins ~f:(fun a2 ->
          if String.compare (asset_to_string a1) (asset_to_string a2) < 0 then
            Some (a1, a2)
          else
            None
        )
      )
    in

    Logs_lwt.info (fun m ->
      m "Calculating %d correlation pairs" (List.length asset_pairs)
    ) >>= fun () ->

    (* Calculate correlations *)
    let%lwt results =
      Lwt_list.map_s (fun (asset_1, asset_2) ->
        let%lwt corr_opt =
          calculate_correlation pool ~asset_1 ~asset_2 ~window_days
        in

        match corr_opt with
        | None -> Lwt.return false
        | Some corr ->
            let%lwt result = store_correlation pool corr in
            match result with
            | Ok () ->
                Logs_lwt.debug (fun m ->
                  m "Stored correlation: %s vs %s = %.4f (%d points)"
                    (asset_to_string asset_1)
                    (asset_to_string asset_2)
                    corr.correlation
                    corr.data_points
                ) >>= fun () ->
                Lwt.return true
            | Error e ->
                Logs_lwt.err (fun m ->
                  m "Failed to store correlation: %s" (Caqti_error.show e)
                ) >>= fun () ->
                Lwt.return false
      ) asset_pairs
    in

    let success_count = List.count results ~f:Fn.id in

    Logs_lwt.info (fun m ->
      m "Correlation matrix update complete: %d/%d pairs stored (%d days)"
        success_count (List.length asset_pairs) window_days
    ) >>= fun () ->

    Lwt.return success_count

  (** Update all correlation windows (30, 90, 365 days) *)
  let update_all_windows
      pool
    : (int * int * int) Lwt.t =

    Logs_lwt.info (fun m ->
      m "Starting full correlation matrix update (all windows)"
    ) >>= fun () ->

    let%lwt count_30 = update_correlation_matrix pool ~window_days:30 in
    let%lwt count_90 = update_correlation_matrix pool ~window_days:90 in
    let%lwt count_365 = update_correlation_matrix pool ~window_days:365 in

    Logs_lwt.info (fun m ->
      m "Full correlation update complete: 30d=%d, 90d=%d, 365d=%d"
        count_30 count_90 count_365
    ) >>= fun () ->

    Lwt.return (count_30, count_90, count_365)

  (** Get correlation matrix for VaR calculation *)
  let get_correlation_matrix
      pool
      ~(assets: asset list)
      ~(window_days: int) =

    let open Caqti_request.Infix in
    let open Caqti_type in

    (* For each asset pair, get correlation *)
    let%lwt correlations =
      Lwt_list.map_s (fun asset_1 ->
        Lwt_list.map_s (fun asset_2 ->
          if Poly.equal asset_1 asset_2 then
            (* Self-correlation = 1.0 *)
            Lwt.return (Ok 1.0)
          else
            (* Query database *)
            let query =
              (t3 string string int)
              ->? float
              @@ {|
                SELECT get_correlation($1, $2, $3)
              |}
            in

            let params = (
              asset_to_string asset_1,
              asset_to_string asset_2,
              window_days
            ) in

            match pool with
            | Error e -> Lwt.return (Error e)
            | Ok pool ->
                Caqti_lwt_unix.Pool.use (fun (module Db : Caqti_lwt.CONNECTION) ->
                  Db.find_opt query params
                ) pool >>= function
                | Ok (Some corr) -> Lwt.return (Ok corr)
                | Ok None -> Lwt.return (Ok 0.0) (* Default to 0 if not found *)
                | Error e -> Lwt.return (Error e)
        ) assets
      ) assets
    in

    (* Transpose list of results to result of list *)
    let rec transpose = function
      | [] -> Ok []
      | row :: rows ->
          let rec transpose_row acc = function
            | [] -> Ok (List.rev acc)
            | Ok value :: rest -> transpose_row (value :: acc) rest
            | Error e :: _ -> Error e
          in
          match (transpose_row [] row, transpose rows) with
          | (Ok row_values, Ok rest_values) ->
              Ok (row_values :: rest_values)
          | (Error e, _) | (_, Error e) -> Error e
    in

    Lwt.return (transpose correlations)

  (** Detect contagion risk (high correlations) *)
  let detect_contagion_risk
      pool
      ~(threshold: float)
      ~(window_days: int) =

    let open Caqti_request.Infix in
    let open Caqti_type in

    let query =
      (t2 float int)
      ->* (t3 string string float)
      @@ {|
        SELECT asset_1, asset_2, correlation
        FROM latest_correlations
        WHERE correlation >= $1
          AND window_days = $2
        ORDER BY correlation DESC
      |}
    in

    match pool with
    | Error e -> Lwt.return (Error e)
    | Ok pool ->
        Caqti_lwt_unix.Pool.use (fun (module Db : Caqti_lwt.CONNECTION) ->
          let%lwt pairs = Db.collect_list query (threshold, window_days) in

          match pairs with
          | Ok pairs ->
              let parsed_pairs =
                List.filter_map pairs ~f:(fun (a1_str, a2_str, corr) ->
                  match (asset_of_string a1_str, asset_of_string a2_str) with
                  | (Ok a1, Ok a2) -> Some (a1, a2, corr)
                  | _ -> None
                )
              in
              Lwt.return (Ok parsed_pairs)
          | Error e -> Lwt.return (Error e)
        ) pool

end
