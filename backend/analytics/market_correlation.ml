(** Market Correlation Analysis
 *
 * Calculates correlation matrices for:
 * - Stablecoin price movements
 * - Bridge health scores
 * - Cross-asset correlations
 *
 * Detects correlation regimes:
 * - Low Correlation (<0.3) - Diversification works
 * - Medium Correlation (0.3-0.7) - Normal market
 * - High Correlation (>0.7) - Systemic risk
 *
 * Update frequency: Every 5 minutes
 * Time window: 30 days rolling
 *)

open Core
open Lwt.Syntax
open Types

module MarketCorrelation = struct

  (** Correlation regime classification *)
  type correlation_regime =
    | Low_Correlation   (* <0.3 - diversification works *)
    | Medium_Correlation (* 0.3-0.7 - normal market *)
    | High_Correlation   (* >0.7 - systemic risk *)
  [@@deriving sexp, yojson]

  (** Correlation matrix *)
  type correlation_matrix = {
    stablecoin_correlations: (string * string * float) list; (* asset1, asset2, correlation *)
    bridge_correlations: (string * string * float) list;
    cross_asset_correlations: (string * string * float) list;
    regime: correlation_regime;
    avg_correlation: float;
    max_correlation: float;
    min_correlation: float;
    timestamp: float;
  } [@@deriving sexp, yojson]

  (** Portfolio diversification metrics *)
  type diversification_metrics = {
    effective_assets: float; (* Effective number of independent assets *)
    diversification_ratio: float; (* 0.0 - 1.0, higher = better *)
    concentration_risk: float; (* 0.0 - 1.0, higher = worse *)
    systemic_risk_score: float; (* 0.0 - 1.0, higher = worse *)
  } [@@deriving sexp, yojson]

  (** Time series data fetching *)
  let fetch_stablecoin_price_history
      ~(conn_string: string)
      ~(stablecoin_id: string)
      ~(time_window_days: int)
    : float list Lwt.t =

    try%lwt
      (* In production: Query TimescaleDB *)
      (*
      SELECT time_bucket('1 hour', time) AS bucket, AVG(price) AS avg_price
      FROM stablecoin_prices
      WHERE stablecoin_id = $1
        AND time > NOW() - INTERVAL '$2 days'
      GROUP BY bucket
      ORDER BY bucket ASC;
      *)

      (* Generate mock data for now *)
      let base_price = 1.0 in
      let volatility = 0.02 in
      let num_samples = time_window_days * 24 in (* Hourly data *)

      let prices = List.init num_samples ~f:(fun _ ->
        base_price +. (Random.float volatility -. volatility /. 2.0)
      ) in

      let%lwt () = Logs_lwt.debug (fun m ->
        m "Fetched %d price samples for %s" (List.length prices) stablecoin_id
      ) in

      Lwt.return prices

    with exn ->
      let%lwt () = Logs_lwt.err (fun m ->
        m "Error fetching price history for %s: %s" stablecoin_id (Exn.to_string exn)
      ) in
      Lwt.return []

  let fetch_bridge_health_history
      ~(conn_string: string)
      ~(bridge_id: string)
      ~(time_window_days: int)
    : float list Lwt.t =

    try%lwt
      (* In production: Query TimescaleDB bridge_health_history *)
      (* Generate mock data *)
      let base_health = 0.85 in
      let volatility = 0.10 in
      let num_samples = time_window_days * 24 in

      let healths = List.init num_samples ~f:(fun _ ->
        Float.max 0.0 (Float.min 1.0 (base_health +. (Random.float volatility -. volatility /. 2.0)))
      ) in

      Lwt.return healths

    with exn ->
      let%lwt () = Logs_lwt.err (fun m ->
        m "Error fetching bridge health history for %s: %s" bridge_id (Exn.to_string exn)
      ) in
      Lwt.return []

  (** Calculate correlation between two time series *)
  let calculate_correlation (xs: float list) (ys: float list) : float option =
    if List.length xs <> List.length ys || List.length xs < 10 then None
    else Math.correlation xs ys

  (** Calculate pairwise correlations for a list of time series *)
  let calculate_pairwise_correlations
      (data: (string * float list) list)
    : (string * string * float) list =

    List.concat_map data ~f:(fun (id1, series1) ->
      List.filter_map data ~f:(fun (id2, series2) ->
        if String.compare id1 id2 >= 0 then None (* Skip diagonal and duplicates *)
        else
          match calculate_correlation series1 series2 with
          | Some corr -> Some (id1, id2, corr)
          | None -> None
      )
    )

  (** Build stablecoin correlation matrix *)
  let build_stablecoin_correlation_matrix
      ~(conn_string: string)
      ~(time_window_days: int)
    : (string * string * float) list Lwt.t =

    let stablecoins = [
      "USDC"; "USDT"; "DAI"; "FRAX"; "BUSD"; "USDe"; "sUSDe";
      "USDY"; "PYUSD"; "GHO"; "LUSD"; "crvUSD"; "mkUSD"; "USDP"
    ] in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Building stablecoin correlation matrix for %d assets..." (List.length stablecoins)
    ) in

    (* Fetch price histories for all stablecoins *)
    let%lwt price_histories =
      Lwt_list.map_p (fun stablecoin_id ->
        let%lwt prices = fetch_stablecoin_price_history ~conn_string ~stablecoin_id ~time_window_days in
        Lwt.return (stablecoin_id, prices)
      ) stablecoins
    in

    (* Filter out assets with insufficient data *)
    let valid_histories = List.filter price_histories ~f:(fun (_, prices) ->
      List.length prices >= 100
    ) in

    (* Calculate pairwise correlations *)
    let correlations = calculate_pairwise_correlations valid_histories in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Calculated %d stablecoin correlations" (List.length correlations)
    ) in

    Lwt.return correlations

  (** Build bridge correlation matrix *)
  let build_bridge_correlation_matrix
      ~(conn_string: string)
      ~(time_window_days: int)
    : (string * string * float) list Lwt.t =

    let bridges = [
      "Wormhole"; "LayerZero"; "Axelar"; "Stargate";
      "Hop"; "Across"; "Synapse"; "Multichain"; "Rainbow"
    ] in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Building bridge correlation matrix for %d bridges..." (List.length bridges)
    ) in

    let%lwt health_histories =
      Lwt_list.map_p (fun bridge_id ->
        let%lwt healths = fetch_bridge_health_history ~conn_string ~bridge_id ~time_window_days in
        Lwt.return (bridge_id, healths)
      ) bridges
    in

    let valid_histories = List.filter health_histories ~f:(fun (_, healths) ->
      List.length healths >= 100
    ) in

    let correlations = calculate_pairwise_correlations valid_histories in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Calculated %d bridge correlations" (List.length correlations)
    ) in

    Lwt.return correlations

  (** Detect correlation regime *)
  let detect_regime (correlations: (string * string * float) list) : correlation_regime =
    if List.is_empty correlations then Medium_Correlation
    else
      let corr_values = List.map correlations ~f:(fun (_, _, corr) -> Float.abs corr) in
      let avg_corr = Math.mean corr_values in

      if avg_corr < 0.3 then Low_Correlation
      else if avg_corr < 0.7 then Medium_Correlation
      else High_Correlation

  (** Calculate average correlation *)
  let calculate_avg_correlation (correlations: (string * string * float) list) : float =
    if List.is_empty correlations then 0.0
    else
      let corr_values = List.map correlations ~f:(fun (_, _, corr) -> Float.abs corr) in
      Math.mean corr_values

  (** Build complete correlation matrix *)
  let build_correlation_matrix
      ~(conn_string: string)
      ~(time_window_days: int)
    : correlation_matrix Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "Building complete correlation matrix (time window: %d days)..." time_window_days
    ) in

    let%lwt stablecoin_correlations =
      build_stablecoin_correlation_matrix ~conn_string ~time_window_days
    in

    let%lwt bridge_correlations =
      build_bridge_correlation_matrix ~conn_string ~time_window_days
    in

    (* For cross-asset correlations, we can compare stablecoin prices to bridge health *)
    let cross_asset_correlations = [] in (* TODO: Implement if needed *)

    let all_correlations = stablecoin_correlations @ bridge_correlations @ cross_asset_correlations in

    let regime = detect_regime all_correlations in
    let avg_correlation = calculate_avg_correlation all_correlations in

    let corr_values = List.map all_correlations ~f:(fun (_, _, corr) -> Float.abs corr) in
    let max_correlation = if List.is_empty corr_values then 0.0
      else List.fold corr_values ~init:Float.neg_infinity ~f:Float.max
    in
    let min_correlation = if List.is_empty corr_values then 0.0
      else List.fold corr_values ~init:Float.infinity ~f:Float.min
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Correlation matrix complete: regime=%s, avg=%.2f, max=%.2f, min=%.2f"
        (match regime with
         | Low_Correlation -> "LOW"
         | Medium_Correlation -> "MEDIUM"
         | High_Correlation -> "HIGH")
        avg_correlation
        max_correlation
        min_correlation
    ) in

    Lwt.return {
      stablecoin_correlations;
      bridge_correlations;
      cross_asset_correlations;
      regime;
      avg_correlation;
      max_correlation;
      min_correlation;
      timestamp = Unix.gettimeofday ();
    }

  (** Calculate portfolio diversification metrics *)
  let get_portfolio_diversification
      ~(policies: (string * float) list) (* asset -> exposure in USD *)
      ~(correlation_matrix: correlation_matrix)
    : diversification_metrics =

    if List.is_empty policies then
      { effective_assets = 0.0; diversification_ratio = 0.0;
        concentration_risk = 1.0; systemic_risk_score = 0.0 }
    else
      (* Calculate total exposure *)
      let total_exposure = List.fold policies ~init:0.0 ~f:(fun acc (_, exposure) ->
        acc +. exposure
      ) in

      (* Calculate concentration (Herfindahl index) *)
      let concentration = List.fold policies ~init:0.0 ~f:(fun acc (_, exposure) ->
        let weight = exposure /. total_exposure in
        acc +. (weight *. weight)
      ) in

      (* Effective number of assets (inverse of concentration) *)
      let effective_assets = if concentration > 0.0 then 1.0 /. concentration else 0.0 in

      (* Diversification ratio (effective assets / actual assets) *)
      let actual_assets = Float.of_int (List.length policies) in
      let diversification_ratio = if actual_assets > 0.0 then effective_assets /. actual_assets else 0.0 in

      (* Systemic risk score (based on correlation regime) *)
      let systemic_risk_score = match correlation_matrix.regime with
        | Low_Correlation -> 0.2
        | Medium_Correlation -> 0.5
        | High_Correlation -> 0.9
      in

      {
        effective_assets;
        diversification_ratio;
        concentration_risk = concentration;
        systemic_risk_score;
      }

  (** Find highly correlated asset pairs (potential contagion risk) *)
  let find_highly_correlated_pairs
      ~(correlation_matrix: correlation_matrix)
      ~(threshold: float)
    : (string * string * float) list =

    List.filter correlation_matrix.stablecoin_correlations ~f:(fun (_, _, corr) ->
      Float.abs corr > threshold
    )
    |> List.sort ~compare:(fun (_, _, c1) (_, _, c2) ->
      Float.compare (Float.abs c2) (Float.abs c1)
    )

  (** Calculate correlation breakdown by regime *)
  let calculate_correlation_breakdown
      (correlations: (string * string * float) list)
    : (correlation_regime * int * float) list =

    let low_corr = List.filter correlations ~f:(fun (_, _, c) -> Float.abs c < 0.3) in
    let med_corr = List.filter correlations ~f:(fun (_, _, c) ->
      let abs_c = Float.abs c in abs_c >= 0.3 && abs_c < 0.7
    ) in
    let high_corr = List.filter correlations ~f:(fun (_, _, c) -> Float.abs c >= 0.7) in

    [
      (Low_Correlation, List.length low_corr, Math.mean (List.map low_corr ~f:(fun (_, _, c) -> Float.abs c)));
      (Medium_Correlation, List.length med_corr, Math.mean (List.map med_corr ~f:(fun (_, _, c) -> Float.abs c)));
      (High_Correlation, List.length high_corr, Math.mean (List.map high_corr ~f:(fun (_, _, c) -> Float.abs c)));
    ]

  (** Persist correlation matrix to database *)
  let persist_correlation_matrix
      ~(conn_string: string)
      ~(matrix: correlation_matrix)
    : unit Lwt.t =

    try%lwt
      let%lwt () = Logs_lwt.info (fun m ->
        m "Persisting correlation matrix to database"
      ) in

      (* In production: Insert to correlation_matrix table *)
      (*
      CREATE TABLE correlation_matrices (
        time TIMESTAMPTZ NOT NULL,
        asset1 TEXT NOT NULL,
        asset2 TEXT NOT NULL,
        correlation NUMERIC(5,4) NOT NULL,
        matrix_type TEXT NOT NULL, -- 'stablecoin', 'bridge', 'cross_asset'
        regime TEXT NOT NULL,
        PRIMARY KEY (time, asset1, asset2, matrix_type)
      );

      SELECT create_hypertable('correlation_matrices', 'time');
      *)

      Lwt.return ()
    with exn ->
      let%lwt () = Logs_lwt.err (fun m ->
        m "Error persisting correlation matrix: %s" (Exn.to_string exn)
      ) in
      Lwt.return ()

  (** Continuous correlation monitoring *)
  let start_correlation_monitor
      ~(conn_string: string)
      ~(time_window_days: int)
      ~(update_interval_seconds: float)
      ~(on_update: correlation_matrix -> unit Lwt.t)
    : unit Lwt.t =

    let rec monitor_loop () =
      let%lwt () = Logs_lwt.info (fun m ->
        m "Calculating correlation matrix..."
      ) in

      let%lwt matrix = build_correlation_matrix ~conn_string ~time_window_days in

      (* Alert on regime changes *)
      let%lwt () = match matrix.regime with
        | High_Correlation ->
            Logs_lwt.warn (fun m ->
              m "HIGH CORRELATION REGIME DETECTED: avg=%.2f - systemic risk elevated"
                matrix.avg_correlation
            )
        | Low_Correlation ->
            Logs_lwt.info (fun m ->
              m "Low correlation regime: avg=%.2f - good diversification"
                matrix.avg_correlation
            )
        | Medium_Correlation ->
            Logs_lwt.info (fun m ->
              m "Medium correlation regime: avg=%.2f - normal market conditions"
                matrix.avg_correlation
            )
      in

      (* Find highly correlated pairs *)
      let high_corr_pairs = find_highly_correlated_pairs ~correlation_matrix:matrix ~threshold:0.8 in
      let%lwt () =
        if not (List.is_empty high_corr_pairs) then
          Logs_lwt.warn (fun m ->
            m "Found %d highly correlated pairs (>0.8): potential contagion risk"
              (List.length high_corr_pairs)
          )
        else
          Lwt.return ()
      in

      (* Persist to database *)
      let%lwt () = persist_correlation_matrix ~conn_string ~matrix in

      (* Call update callback *)
      let%lwt () = on_update matrix in

      (* Wait for next update *)
      let%lwt () = Lwt_unix.sleep update_interval_seconds in

      monitor_loop ()
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Starting correlation monitor (interval: %.0fs, window: %d days)"
        update_interval_seconds time_window_days
    ) in

    monitor_loop ()

  (** Export correlation matrix to JSON *)
  let export_to_json (matrix: correlation_matrix) : string =
    let json = [%yojson_of: correlation_matrix] matrix in
    Yojson.Safe.to_string json

end
