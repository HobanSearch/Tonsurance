(** Volatility Estimator
 *
 * Estimates stablecoin price volatility using multiple models:
 * - Historical volatility (rolling 30-day standard deviation)
 * - GARCH(1,1) for implied volatility prediction
 * - Volatility regime detection (Low, Normal, High, Extreme)
 *
 * Volatility regimes:
 * - Low Volatility: <5% annualized (calm market)
 * - Normal Volatility: 5-15% (typical conditions)
 * - High Volatility: 15-30% (elevated risk)
 * - Extreme Volatility: >30% (crisis mode)
 *
 * Update frequency: Every 1 hour (GARCH is computationally expensive)
 *)

open Core

module VolatilityEstimator = struct

  (** Stub for market correlation functions until market_correlation.ml is re-enabled *)
  module MarketCorrelation = struct
    module MarketCorrelation = struct
      let fetch_stablecoin_price_history
          ~(conn_string: string)
          ~(stablecoin_id: string)
          ~(time_window_days: int)
        : float list Lwt.t =
        let _ = (conn_string, stablecoin_id, time_window_days) in
        (* TODO: Implement proper price history fetching with Caqti *)
        (* For now, return mock data with realistic stablecoin prices *)
        let mock_prices = List.init 240 ~f:(fun i ->
          1.0 +. (Float.sin (Float.of_int i /. 10.0) *. 0.002) +.
          (Random.float 0.004 -. 0.002)
        ) in
        Lwt.return mock_prices
    end
  end

  (** Volatility regime classification *)
  type volatility_regime =
    | Low_Vol      (* <5% annualized - calm market *)
    | Normal_Vol   (* 5-15% - typical conditions *)
    | High_Vol     (* 15-30% - elevated risk *)
    | Extreme_Vol  (* >30% - crisis mode *)
  [@@deriving sexp, yojson]

  (** Volatility estimate *)
  type volatility_estimate = {
    asset_id: string;
    realized_vol: float; (* Historical volatility, annualized - matches DB column realized_vol_30d *)
    implied_vol: float option; (* GARCH model prediction, annualized - optional *)
    volatility_regime: volatility_regime;
    confidence_interval_lower: float; (* 95% CI lower bound *)
    confidence_interval_upper: float; (* 95% CI upper bound *)
    garch_alpha: float option; (* GARCH alpha parameter *)
    garch_beta: float option; (* GARCH beta parameter *)
    timestamp: float;
  } [@@deriving sexp, yojson]

  (** GARCH(1,1) model parameters *)
  type garch_params = {
    omega: float;   (* Long-run variance *)
    alpha: float;   (* ARCH coefficient *)
    beta: float;    (* GARCH coefficient *)
  } [@@deriving sexp, yojson]

  (** Volatility summary statistics *)
  type volatility_summary = {
    total_assets: int;
    avg_realized_vol: float;
    avg_implied_vol: float;
    max_vol: float;
    min_vol: float;
    low_vol_count: int;
    normal_vol_count: int;
    high_vol_count: int;
    extreme_vol_count: int;
    timestamp: float;
  } [@@deriving sexp, yojson]

  (** Calculate realized volatility (historical) *)
  let calculate_realized_volatility
      ~(prices: float list)
      ~(window: int)
    : float =

    if List.length prices < window then 0.0
    else
      (* Calculate log returns *)
      let returns = List.mapi prices ~f:(fun i price ->
        if i = 0 then None
        else
          let prev_price = List.nth_exn prices (i - 1) in
          Some (Float.log (price /. prev_price))
      ) |> List.filter_opt in

      (* Take last 'window' returns *)
      let recent_returns = List.take (List.rev returns) window |> List.rev in

      if List.length recent_returns < 10 then 0.0
      else
        (* Calculate standard deviation of returns *)
        let std_dev = Math.std_dev recent_returns in

        (* Annualize (assuming hourly data, 24 * 365 = 8760 hours per year) *)
        let annualized_vol = std_dev *. Float.sqrt 8760.0 in

        annualized_vol

  (** Calculate GARCH(1,1) log-likelihood for MLE *)
  let garch_log_likelihood
      (returns: float list)
      (omega: float)
      (alpha: float)
      (beta: float)
    : float =

    if Float.O.(alpha < 0.0 || beta < 0.0 || omega < 0.0) then
      Float.neg_infinity (* Invalid parameters *)
    else if Float.O.(alpha +. beta >= 1.0) then
      Float.neg_infinity (* Non-stationary *)
    else
      (* Initialize variance with unconditional variance *)
      let unconditional_var =
        if Float.O.(alpha +. beta > 0.0) then
          omega /. (1.0 -. alpha -. beta)
        else
          Math.variance returns
      in

      (* Calculate log-likelihood *)
      let (log_lik, _final_var) = List.fold returns
        ~init:(0.0, unconditional_var)
        ~f:(fun (log_lik_acc, prev_var) ret ->
          (* GARCH(1,1): σ²(t) = ω + α*ε²(t-1) + β*σ²(t-1) *)
          let curr_var = omega +. (alpha *. ret *. ret) +. (beta *. prev_var) in
          let curr_var = Float.max curr_var 1e-10 in (* Avoid zero variance *)

          (* Add log-likelihood contribution: -0.5 * [log(2π) + log(σ²) + ε²/σ²] *)
          let ll_contrib = -0.5 *. (Float.log (2.0 *. Float.pi) +. Float.log curr_var +. (ret *. ret /. curr_var)) in

          (log_lik_acc +. ll_contrib, curr_var)
        )
      in

      log_lik

  (** Estimate GARCH(1,1) parameters using maximum likelihood *)
  let estimate_garch_params
      (returns: float list)
    : garch_params option =

    if List.length returns < 50 then None
    else
      try
        let unconditional_var = Math.variance returns in

        (* Grid search optimization for MLE
         * Search over reasonable parameter ranges for stablecoins *)
        let omega_values = [0.001 *. unconditional_var; 0.01 *. unconditional_var; 0.05 *. unconditional_var] in
        let alpha_values = [0.05; 0.10; 0.15; 0.20] in
        let beta_values = [0.70; 0.80; 0.85; 0.90] in

        (* Find parameters that maximize log-likelihood *)
        let best_params = ref None in
        let best_ll = ref Float.neg_infinity in

        List.iter omega_values ~f:(fun omega ->
          List.iter alpha_values ~f:(fun alpha ->
            List.iter beta_values ~f:(fun beta ->
              if Float.O.(alpha +. beta < 1.0) then begin
                let ll = garch_log_likelihood returns omega alpha beta in
                if Float.(ll > !best_ll) then begin
                  best_ll := ll;
                  best_params := Some { omega; alpha; beta }
                end
              end
            )
          )
        );

        (* If grid search found good parameters, refine with local optimization *)
        match !best_params with
        | None ->
            (* Fallback to typical stablecoin parameters *)
            let omega = unconditional_var *. 0.05 in
            let alpha = 0.10 in
            let beta = 0.85 in
            if Float.O.(alpha +. beta >= 1.0) then None
            else Some { omega; alpha; beta }

        | Some params ->
            (* Refine with small perturbations *)
            let refine_param base delta =
              let candidates = [base; base *. (1.0 +. delta); base *. (1.0 -. delta)] in
              candidates
            in

            let refined = ref params in
            let refined_ll = ref !best_ll in

            (* Simple hill-climbing refinement *)
            for _iter = 1 to 5 do
              let omega_candidates = refine_param !refined.omega 0.1 in
              let alpha_candidates = refine_param !refined.alpha 0.1 in
              let beta_candidates = refine_param !refined.beta 0.05 in

              List.iter omega_candidates ~f:(fun omega ->
                List.iter alpha_candidates ~f:(fun alpha ->
                  List.iter beta_candidates ~f:(fun beta ->
                    if Float.O.(alpha +. beta < 1.0 && alpha > 0.0 && beta > 0.0 && omega > 0.0) then begin
                      let ll = garch_log_likelihood returns omega alpha beta in
                      if Float.(ll > !refined_ll) then begin
                        refined_ll := ll;
                        refined := { omega; alpha; beta }
                      end
                    end
                  )
                )
              )
            done;

            Some !refined

      with _ ->
        (* Ultimate fallback *)
        let unconditional_var = Math.variance returns in
        let omega = unconditional_var *. 0.05 in
        let alpha = 0.10 in
        let beta = 0.85 in
        if Float.O.(alpha +. beta >= 1.0) then None
        else Some { omega; alpha; beta }

  (** Forecast volatility using GARCH(1,1) *)
  let forecast_garch_volatility
      ~(returns: float list)
      ~(params: garch_params)
    : float =

    if List.is_empty returns then 0.0
    else
      (* Calculate current conditional variance *)
      let recent_return = List.last_exn returns in
      let recent_return_squared = recent_return *. recent_return in

      (* Get previous conditional variance (simplified - use unconditional) *)
      let unconditional_var = Math.variance returns in

      (* GARCH(1,1) forecast: σ²(t+1) = ω + α*ε²(t) + β*σ²(t) *)
      let forecast_variance =
        params.omega +.
        (params.alpha *. recent_return_squared) +.
        (params.beta *. unconditional_var)
      in

      (* Convert to standard deviation and annualize *)
      let forecast_vol = Float.sqrt forecast_variance in
      let annualized = forecast_vol *. Float.sqrt 8760.0 in

      annualized

  (** Estimate GARCH volatility with fallback *)
  let estimate_garch_volatility
      ~(prices: float list)
    : float Lwt.t =

    let%lwt () = Logs_lwt.debug (fun m ->
      m "Estimating GARCH volatility from %d price samples" (List.length prices)
    ) in

    try%lwt
      (* Calculate log returns *)
      let returns = List.mapi prices ~f:(fun i price ->
        if i = 0 then None
        else
          let prev_price = List.nth_exn prices (i - 1) in
          Some (Float.log (price /. prev_price))
      ) |> List.filter_opt in

      match estimate_garch_params returns with
      | Some params ->
          let forecast = forecast_garch_volatility ~returns ~params in
          Lwt.return forecast

      | None ->
          (* Fallback to realized volatility *)
          let realized = calculate_realized_volatility ~prices ~window:720 in (* 30 days * 24 hours *)
          Lwt.return realized

    with exn ->
      let%lwt () = Logs_lwt.warn (fun m ->
        m "GARCH estimation failed, using realized volatility: %s" (Exn.to_string exn)
      ) in

      let realized = calculate_realized_volatility ~prices ~window:720 in
      Lwt.return realized

  (** Detect volatility regime *)
  let detect_volatility_regime
      ~(realized: float)
      ~(implied: float)
    : volatility_regime =

    (* Use max of realized and implied for regime classification *)
    let max_vol = Float.max realized implied in

    if Float.O.(max_vol < 0.05) then Low_Vol        (* <5% *)
    else if Float.O.(max_vol < 0.15) then Normal_Vol (* 5-15% *)
    else if Float.O.(max_vol < 0.30) then High_Vol   (* 15-30% *)
    else Extreme_Vol                        (* >30% *)

  (** Chi-square quantile approximation using Wilson-Hilferty transformation
   * For chi-square distribution with n degrees of freedom
   *)
  let chi_square_quantile (n: int) (p: float) : float =
    (* Wilson-Hilferty transformation for chi-square quantiles *)
    let df = Float.of_int n in

    (* Standard normal quantile approximation *)
    let z =
      if Float.O.(p <= 0.5) then
        (* Lower tail *)
        let t = Float.sqrt (Float.log (1.0 /. (p *. p))) in
        let c0 = 2.515517 in
        let c1 = 0.802853 in
        let c2 = 0.010328 in
        let d1 = 1.432788 in
        let d2 = 0.189269 in
        let d3 = 0.001308 in
        -.(t -. ((c0 +. c1 *. t +. c2 *. t *. t) /. (1.0 +. d1 *. t +. d2 *. t *. t +. d3 *. t *. t *. t)))
      else
        (* Upper tail *)
        let p_upper = 1.0 -. p in
        let t = Float.sqrt (Float.log (1.0 /. (p_upper *. p_upper))) in
        let c0 = 2.515517 in
        let c1 = 0.802853 in
        let c2 = 0.010328 in
        let d1 = 1.432788 in
        let d2 = 0.189269 in
        let d3 = 0.001308 in
        t -. ((c0 +. c1 *. t +. c2 *. t *. t) /. (1.0 +. d1 *. t +. d2 *. t *. t +. d3 *. t *. t *. t))
    in

    (* Wilson-Hilferty transformation *)
    let w = z *. Float.sqrt (2.0 /. (9.0 *. df)) -. (2.0 /. (9.0 *. df)) +. 1.0 in
    df *. (w ** 3.0)

  (** Calculate confidence interval for volatility estimate using chi-square distribution *)
  let calculate_confidence_interval
      ~(volatility: float)
      ~(sample_size: int)
    : float * float =

    (* For volatility, we need confidence interval for variance first, then take sqrt
     * The sample variance S² follows a chi-square distribution:
     * (n-1) * S² / σ² ~ χ²(n-1)
     *
     * 95% confidence interval for variance:
     * [(n-1) * S² / χ²_0.975, (n-1) * S² / χ²_0.025]
     *)

    if sample_size < 2 then
      (* Not enough data for CI *)
      (volatility, volatility)
    else
      let n = sample_size in
      let df = n - 1 in
      let variance = volatility *. volatility in

      (* Chi-square critical values for 95% CI *)
      let chi_sq_lower = chi_square_quantile df 0.025 in  (* 2.5th percentile *)
      let chi_sq_upper = chi_square_quantile df 0.975 in  (* 97.5th percentile *)

      (* Confidence interval for variance *)
      let var_lower = (Float.of_int df *. variance) /. chi_sq_upper in
      let var_upper = (Float.of_int df *. variance) /. chi_sq_lower in

      (* Convert to volatility (standard deviation) *)
      let vol_lower = Float.sqrt var_lower in
      let vol_upper = Float.sqrt var_upper in

      (vol_lower, vol_upper)

  (** Calculate volatility for a single asset *)
  let calculate_volatility
      ~(conn_string: string)
      ~(asset_id: string)
      ~(lookback_days: int)
    : volatility_estimate Lwt.t =

    let%lwt () = Logs_lwt.debug (fun m ->
      m "Calculating volatility for %s (lookback: %d days)" asset_id lookback_days
    ) in

    (* Fetch price history from TimescaleDB *)
    let%lwt prices =
      MarketCorrelation.MarketCorrelation.fetch_stablecoin_price_history
        ~conn_string
        ~stablecoin_id:asset_id
        ~time_window_days:lookback_days
    in

    if List.length prices < 100 then
      (* Insufficient data *)
      Lwt.return {
        asset_id;
        realized_vol = 0.0;
        implied_vol = None;
        volatility_regime = Normal_Vol;
        confidence_interval_lower = 0.0;
        confidence_interval_upper = 0.0;
        garch_alpha = None;
        garch_beta = None;
        timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      }
    else
      let realized_vol = calculate_realized_volatility ~prices ~window:720 in (* 30 days * 24 hours *)

      let%lwt implied_vol_value = estimate_garch_volatility ~prices in

      let regime = detect_volatility_regime ~realized:realized_vol ~implied:implied_vol_value in

      let (ci_lower, ci_upper) = calculate_confidence_interval
        ~volatility:implied_vol_value
        ~sample_size:(List.length prices)
      in

      let%lwt () = Logs_lwt.info (fun m ->
        m "%s volatility: realized=%.2f%%, implied=%.2f%%, regime=%s"
          asset_id
          (realized_vol *. 100.0)
          (implied_vol_value *. 100.0)
          (match regime with
           | Low_Vol -> "LOW"
           | Normal_Vol -> "NORMAL"
           | High_Vol -> "HIGH"
           | Extreme_Vol -> "EXTREME")
      ) in

      Lwt.return {
        asset_id;
        realized_vol;
        implied_vol = Some implied_vol_value;
        volatility_regime = regime;
        confidence_interval_lower = ci_lower;
        confidence_interval_upper = ci_upper;
        garch_alpha = None; (* TODO: Extract from GARCH model fitting *)
        garch_beta = None; (* TODO: Extract from GARCH model fitting *)
        timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      }

  (** Calculate volatility for all stablecoins *)
  let calculate_all_volatilities
      ~(conn_string: string)
      ~(lookback_days: int)
    : volatility_estimate list Lwt.t =

    let stablecoins = [
      "USDC"; "USDT"; "DAI"; "FRAX"; "BUSD"; "USDe"; "sUSDe";
      "USDY"; "PYUSD"; "GHO"; "LUSD"; "crvUSD"; "mkUSD"; "USDP"
    ] in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Calculating volatility for %d stablecoins..." (List.length stablecoins)
    ) in

    let%lwt estimates =
      Lwt_list.map_p (fun asset_id ->
        calculate_volatility ~conn_string ~asset_id ~lookback_days
      ) stablecoins
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Volatility calculation complete for %d assets" (List.length estimates)
    ) in

    Lwt.return estimates

  (** Calculate volatility-adjusted premium multiplier *)
  let volatility_adjusted_premium
      ~(base_premium: float)
      ~(volatility: float)
    : float =

    (* Adjust premium based on volatility regime *)
    (* Higher volatility = higher premium *)

    let vol_multiplier =
      if Float.(volatility < 0.05) then 1.0       (* Low vol - no adjustment *)
      else if Float.(volatility < 0.15) then 1.1  (* Normal vol - slight increase *)
      else if Float.(volatility < 0.30) then 1.3  (* High vol - significant increase *)
      else 1.5                                    (* Extreme vol - maximum adjustment *)
    in

    base_premium *. vol_multiplier

  (** Calculate volatility summary statistics *)
  let calculate_volatility_summary
      (estimates: volatility_estimate list)
    : volatility_summary =

    let realized_vols = List.map estimates ~f:(fun e -> e.realized_vol) in
    let implied_vols = List.filter_map estimates ~f:(fun e -> e.implied_vol) in

    let by_regime = List.fold estimates ~init:(0, 0, 0, 0) ~f:(fun (low, normal, high, extreme) e ->
      match e.volatility_regime with
      | Low_Vol -> (low + 1, normal, high, extreme)
      | Normal_Vol -> (low, normal + 1, high, extreme)
      | High_Vol -> (low, normal, high + 1, extreme)
      | Extreme_Vol -> (low, normal, high, extreme + 1)
    ) in

    let (low_count, normal_count, high_count, extreme_count) = by_regime in

    {
      total_assets = List.length estimates;
      avg_realized_vol = Math.mean realized_vols;
      avg_implied_vol = Math.mean implied_vols;
      max_vol = List.fold (realized_vols @ implied_vols) ~init:Float.neg_infinity ~f:Float.max;
      min_vol = List.fold (realized_vols @ implied_vols) ~init:Float.infinity ~f:Float.min;
      low_vol_count = low_count;
      normal_vol_count = normal_count;
      high_vol_count = high_count;
      extreme_vol_count = extreme_count;
      timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    }

  (** Get assets in extreme volatility regime *)
  let get_extreme_volatility_assets
      (estimates: volatility_estimate list)
    : volatility_estimate list =

    List.filter estimates ~f:(fun e ->
      Poly.equal e.volatility_regime Extreme_Vol
    )

  (** Persist volatility estimates to database using Caqti *)
  let persist_volatility_estimates
      ~(db_pool: (Caqti_lwt.connection, Caqti_error.t) Caqti_lwt_unix.Pool.t)
      ~(estimates: volatility_estimate list)
    : unit Lwt.t =

    let volatility_regime_to_string = function
      | Low_Vol -> "low"
      | Normal_Vol -> "medium"
      | High_Vol -> "high"
      | Extreme_Vol -> "extreme"
    in

    (* Caqti query for inserting/updating volatility estimate *)
    let open Caqti_request.Infix in
    let insert_estimate_query =
      Caqti_type.(t2
        (t2 float string)
        (t2
          (t2 float (option float))
          (t2
            (t2 string (t2 float float))
            (t2 (option float) (option float)))))
      ->. Caqti_type.unit
      @@ {|INSERT INTO volatility_estimates
            (time, asset_id, realized_vol_30d, implied_vol, volatility_regime,
             confidence_lower, confidence_upper, garch_alpha, garch_beta)
          VALUES (to_timestamp($1), $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (time, asset_id) DO UPDATE SET
            realized_vol_30d = EXCLUDED.realized_vol_30d,
            implied_vol = EXCLUDED.implied_vol,
            volatility_regime = EXCLUDED.volatility_regime,
            confidence_lower = EXCLUDED.confidence_lower,
            confidence_upper = EXCLUDED.confidence_upper,
            garch_alpha = EXCLUDED.garch_alpha,
            garch_beta = EXCLUDED.garch_beta|}
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Persisting %d volatility estimates to database" (List.length estimates)
    ) in

    let%lwt result = Caqti_lwt_unix.Pool.use (fun (module Db : Caqti_lwt.CONNECTION) ->
      Lwt_list.fold_left_s (fun acc_result (est: volatility_estimate) ->
        match acc_result with
        | Error e -> Lwt.return (Error e)  (* Stop on first error *)
        | Ok () ->
            let params = (
              (est.timestamp, est.asset_id),
              (
                (est.realized_vol, est.implied_vol),
                (
                  (volatility_regime_to_string est.volatility_regime,
                   (est.confidence_interval_lower, est.confidence_interval_upper)),
                  (est.garch_alpha, est.garch_beta)
                )
              )
            ) in
            Db.exec insert_estimate_query params
      ) (Ok ()) estimates
    ) db_pool in

    match result with
    | Ok () ->
        let%lwt () = Logs_lwt.info (fun m ->
          m "Successfully persisted %d volatility estimates" (List.length estimates)
        ) in
        Lwt.return ()
    | Error err ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "Failed to persist volatility estimates: %s" (Caqti_error.show err)
        ) in
        Lwt.return ()

  (** Continuous volatility monitoring *)
  let start_volatility_monitor
      ~(conn_string: string)
      ~(lookback_days: int)
      ~(update_interval_seconds: float)
      ~(on_update: volatility_estimate list -> unit Lwt.t)
    : unit Lwt.t =

    (* Create database pool *)
    let pool_config = Caqti_pool_config.create ~max_size:5 () in
    let db_pool_result = Caqti_lwt_unix.connect_pool ~pool_config (Uri.of_string conn_string) in

    match db_pool_result with
    | Error err ->
        Logs.err (fun m -> m "Failed to create database pool: %s" (Caqti_error.show err));
        Lwt.return_unit
    | Ok db_pool ->
        let rec monitor_loop () =
      let%lwt () = Logs_lwt.info (fun m ->
        m "Calculating volatility estimates for all assets..."
      ) in

      let%lwt estimates = calculate_all_volatilities ~conn_string ~lookback_days in

      let summary = calculate_volatility_summary estimates in

      let%lwt () = Logs_lwt.info (fun m ->
        m "Volatility summary: avg_realized=%.2f%%, avg_implied=%.2f%%, extreme=%d assets"
          (summary.avg_realized_vol *. 100.0)
          (summary.avg_implied_vol *. 100.0)
          summary.extreme_vol_count
      ) in

      (* Alert on extreme volatility *)
      let extreme_assets = get_extreme_volatility_assets estimates in
      let%lwt () =
        if not (List.is_empty extreme_assets) then
          Logs_lwt.warn (fun m ->
            m "EXTREME VOLATILITY ALERT: %d assets in extreme regime (>30%%)"
              (List.length extreme_assets)
          )
        else
          Lwt.return ()
      in

      (* Persist to database *)
      let%lwt () = persist_volatility_estimates ~db_pool ~estimates in

      (* Call update callback *)
      let%lwt () = on_update estimates in

      (* Wait for next update *)
      let%lwt () = Lwt_unix.sleep update_interval_seconds in

      monitor_loop ()
        in

        let%lwt () = Logs_lwt.info (fun m ->
          m "Starting volatility monitor (interval: %.0fs, lookback: %d days)"
            update_interval_seconds lookback_days
        ) in

        monitor_loop ()

  (** Export volatility estimates to JSON *)
  let export_to_json (estimates: volatility_estimate list) : string =
    let json = `List (List.map ~f:volatility_estimate_to_yojson estimates) in
    Yojson.Safe.to_string json

  (** Calculate volatility smile (volatility across different strike prices) *)
  let calculate_volatility_smile
      ~(_asset_id: string)  (* TODO: Use asset_id for asset-specific smile parameters *)
      ~(strikes: float list) (* Different strike prices *)
      ~(base_volatility: float)
    : (float * float) list =

    (* Simplified volatility smile - in practice would use option prices *)
    List.map strikes ~f:(fun strike ->
      let moneyness = Float.abs (strike -. 1.0) in (* Distance from $1.00 *)
      let vol_adjustment = 1.0 +. (moneyness *. 2.0) in (* Further OTM = higher vol *)
      (strike, base_volatility *. vol_adjustment)
    )

end
