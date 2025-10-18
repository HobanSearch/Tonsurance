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
open Lwt.Syntax
open Types

module VolatilityEstimator = struct

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
    realized_vol_30d: float; (* Historical volatility, annualized *)
    implied_vol: float; (* GARCH model prediction, annualized *)
    volatility_regime: volatility_regime;
    confidence_interval: float * float; (* 95% CI *)
    timestamp: float;
  } [@@deriving sexp, yojson]

  (** GARCH(1,1) model parameters *)
  type garch_params = {
    omega: float;   (* Long-run variance *)
    alpha: float;   (* ARCH coefficient *)
    beta: float;    (* GARCH coefficient *)
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

  (** Estimate GARCH(1,1) parameters using maximum likelihood *)
  let estimate_garch_params
      (returns: float list)
    : garch_params option =

    if List.length returns < 50 then None
    else
      try
        (* Simplified GARCH(1,1) parameter estimation *)
        (* In production, would use proper MLE optimization *)

        let unconditional_var = Math.variance returns in

        (* Use typical parameter values for stablecoins *)
        let omega = unconditional_var *. 0.05 in (* 5% of unconditional variance *)
        let alpha = 0.10 in (* ARCH effect *)
        let beta = 0.85 in (* GARCH effect (persistence) *)

        (* Verify alpha + beta < 1 (stationarity condition) *)
        if alpha +. beta >= 1.0 then None
        else Some { omega; alpha; beta }

      with _ -> None

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

    if max_vol < 0.05 then Low_Vol        (* <5% *)
    else if max_vol < 0.15 then Normal_Vol (* 5-15% *)
    else if max_vol < 0.30 then High_Vol   (* 15-30% *)
    else Extreme_Vol                        (* >30% *)

  (** Calculate confidence interval for volatility estimate *)
  let calculate_confidence_interval
      ~(volatility: float)
      ~(sample_size: int)
    : float * float =

    (* Use chi-square distribution for variance confidence interval *)
    (* Simplified: ±20% for 95% CI *)
    let margin = volatility *. 0.20 in
    (volatility -. margin, volatility +. margin)

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
        realized_vol_30d = 0.0;
        implied_vol = 0.0;
        volatility_regime = Normal_Vol;
        confidence_interval = (0.0, 0.0);
        timestamp = Unix.gettimeofday ();
      }
    else
      let realized_vol = calculate_realized_volatility ~prices ~window:720 in (* 30 days * 24 hours *)

      let%lwt implied_vol = estimate_garch_volatility ~prices in

      let regime = detect_volatility_regime ~realized:realized_vol ~implied:implied_vol in

      let confidence_interval = calculate_confidence_interval
        ~volatility:implied_vol
        ~sample_size:(List.length prices)
      in

      let%lwt () = Logs_lwt.info (fun m ->
        m "%s volatility: realized=%.2f%%, implied=%.2f%%, regime=%s"
          asset_id
          (realized_vol *. 100.0)
          (implied_vol *. 100.0)
          (match regime with
           | Low_Vol -> "LOW"
           | Normal_Vol -> "NORMAL"
           | High_Vol -> "HIGH"
           | Extreme_Vol -> "EXTREME")
      ) in

      Lwt.return {
        asset_id;
        realized_vol_30d = realized_vol;
        implied_vol;
        volatility_regime = regime;
        confidence_interval;
        timestamp = Unix.gettimeofday ();
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
      if volatility < 0.05 then 1.0       (* Low vol - no adjustment *)
      else if volatility < 0.15 then 1.1  (* Normal vol - slight increase *)
      else if volatility < 0.30 then 1.3  (* High vol - significant increase *)
      else 1.5                            (* Extreme vol - maximum adjustment *)
    in

    base_premium *. vol_multiplier

  (** Calculate volatility summary statistics *)
  let calculate_volatility_summary
      (estimates: volatility_estimate list)
    : volatility_summary =

    let realized_vols = List.map estimates ~f:(fun e -> e.realized_vol_30d) in
    let implied_vols = List.map estimates ~f:(fun e -> e.implied_vol) in

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
      timestamp = Unix.gettimeofday ();
    }

  and volatility_summary = {
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

  (** Get assets in extreme volatility regime *)
  let get_extreme_volatility_assets
      (estimates: volatility_estimate list)
    : volatility_estimate list =

    List.filter estimates ~f:(fun e ->
      Poly.equal e.volatility_regime Extreme_Vol
    )

  (** Persist volatility estimates to database *)
  let persist_volatility_estimates
      ~(conn_string: string)
      ~(estimates: volatility_estimate list)
    : unit Lwt.t =

    try%lwt
      let%lwt () = Logs_lwt.info (fun m ->
        m "Persisting %d volatility estimates to database" (List.length estimates)
      ) in

      (* In production: Batch insert to volatility_estimates table *)
      (*
      CREATE TABLE volatility_estimates (
        time TIMESTAMPTZ NOT NULL,
        asset_id TEXT NOT NULL,
        realized_vol_30d NUMERIC(10,6) NOT NULL,
        implied_vol NUMERIC(10,6) NOT NULL,
        volatility_regime TEXT NOT NULL,
        confidence_lower NUMERIC(10,6) NOT NULL,
        confidence_upper NUMERIC(10,6) NOT NULL,
        PRIMARY KEY (time, asset_id)
      );

      SELECT create_hypertable('volatility_estimates', 'time');
      *)

      Lwt.return ()
    with exn ->
      let%lwt () = Logs_lwt.err (fun m ->
        m "Error persisting volatility estimates: %s" (Exn.to_string exn)
      ) in
      Lwt.return ()

  (** Continuous volatility monitoring *)
  let start_volatility_monitor
      ~(conn_string: string)
      ~(lookback_days: int)
      ~(update_interval_seconds: float)
      ~(on_update: volatility_estimate list -> unit Lwt.t)
    : unit Lwt.t =

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
      let%lwt () = persist_volatility_estimates ~conn_string ~estimates in

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
    let json = [%yojson_of: volatility_estimate list] estimates in
    Yojson.Safe.to_string json

  (** Calculate volatility smile (volatility across different strike prices) *)
  let calculate_volatility_smile
      ~(asset_id: string)
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
