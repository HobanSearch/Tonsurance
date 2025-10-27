(* Unified Risk Monitor - Real-Time Portfolio Risk Surveillance

   Continuously monitors risk across the ENTIRE unified pool:
   - All products (depeg, flash, escrow, etc.)
   - All assets (USDC, USDT, DAI, etc.)
   - All tranches (senior, mezzanine, junior)

   Calculates portfolio-level metrics every 60 seconds:
   - VaR (95%, 99%) using Monte Carlo simulation
   - Stress test losses (4 scenarios)
   - Concentration limits (single asset, correlated)
   - Correlation matrix (detect regime changes)
   - LTV and reserve ratios

   Provides risk-adjusted pricing signals to pricing engine.
   Generates alerts when limits approached.
*)

open Core
open Lwt.Infix
open Types
open Math
open Db

module UnifiedRiskMonitor = struct

  (** Product key for 560 combinations *)
  type product_key = {
    coverage_type: string;              (* depeg, bridge_exploit, smart_contract, oracle_failure, cex_liquidation *)
    chain: blockchain;
    stablecoin: asset;
  } [@@deriving sexp, compare]

  (** Risk snapshot at point in time **)
  type risk_snapshot = {
    timestamp: float;

    (* VaR metrics *)
    var_95: float;                      (* 95% VaR in USD *)
    var_99: float;                      (* 99% VaR *)
    cvar_95: float;                     (* Conditional VaR *)
    expected_loss: float;               (* Expected loss *)

    (* Stress test results *)
    worst_case_stress: float;           (* Worst stress scenario loss *)
    stress_test_results: (string * float) list; (* All scenarios *)

    (* Utilization metrics *)
    ltv: float;                         (* Loan-to-value ratio *)
    reserve_ratio: float;               (* Liquid reserves / total capital *)
    utilization_by_product: (string * float) list; (* Product-specific *)

    (* Concentration metrics - EXPANDED *)
    asset_concentrations: (asset * float) list; (* Asset → % of capital *)
    chain_concentrations: (blockchain * float) list; (* Chain → % of capital *)
    max_concentration: float;           (* Largest single asset exposure *)
    correlated_exposure: float;         (* Max correlated group exposure *)
    cross_chain_bridge_exposure: float; (* Total bridge risk exposure *)

    (* Multi-dimensional exposure - NEW *)
    exposure_by_product: (product_key * float) list; (* 560 products → USD exposure *)
    top_10_products: (product_key * float * int) list; (* Top products by exposure (key, usd, policy_count) *)

    (* Correlation analysis *)
    correlation_matrix: (asset * asset * float) list; (* Pairwise correlations *)
    correlation_regime: [`Low | `Medium | `High]; (* Regime detection *)

    (* Portfolio composition *)
    total_policies: int;
    policies_by_asset: (asset * int) list;
    policies_by_chain: (blockchain * int) list; (* NEW *)
    policies_by_product: (string * int) list;
    avg_policy_duration: float;         (* Days *)

    (* Risk alerts *)
    breach_alerts: risk_alert list;
    warning_alerts: risk_alert list;
  } [@@deriving sexp]

  and risk_alert = {
    alert_type: alert_type;
    severity: [`Critical | `High | `Medium | `Low];
    message: string;
    current_value: float;
    limit_value: float;
    alert_timestamp: float;
  }

  and alert_type =
    | LTV_Breach
    | Reserve_Low
    | Concentration_High
    | Correlation_Spike
    | Stress_Loss_High
    | VaR_Breach
  [@@deriving sexp]

  (** Monitor configuration **)
  type monitor_config = {
    check_interval_seconds: float;
    var_confidence_levels: float list;
    monte_carlo_simulations: int;
    correlation_lookback_days: int;
    alert_thresholds: alert_thresholds;
  }

  and alert_thresholds = {
    ltv_warning: float;           (* 0.70 = warn at 70% *)
    ltv_critical: float;          (* 0.75 = critical at 75% *)
    reserve_warning: float;       (* 0.20 = warn if <20% *)
    reserve_critical: float;      (* 0.15 = critical if <15% *)
    concentration_warning: float; (* 0.25 = warn at 25% *)
    concentration_critical: float;(* 0.30 = critical at 30% *)
    correlation_warning: float;   (* 0.70 = warn if >70% correlated *)
    correlation_critical: float;  (* 0.85 = critical if >85% *)
  } [@@deriving sexp]

  let default_config = {
    check_interval_seconds = 60.0;
    var_confidence_levels = [0.95; 0.99];
    monte_carlo_simulations = 10_000;
    correlation_lookback_days = 30;
    alert_thresholds = {
      ltv_warning = 0.70;
      ltv_critical = 0.75;
      reserve_warning = 0.20;
      reserve_critical = 0.15;
      concentration_warning = 0.25;
      concentration_critical = 0.30;
      correlation_warning = 0.70;
      correlation_critical = 0.85;
    };
  }

  (** Calculate asset concentrations **)
  let calculate_asset_concentrations
      (collateral_mgr: Pool.Collateral_manager.CollateralManager.t)
    : (asset * float) list =

    let pool = collateral_mgr.pool in
    (* All 14 stablecoins *)
    let all_assets = [USDC; USDT; USDP; DAI; FRAX; BUSD; USDe; USDY; PYUSD; GHO; LUSD] in

    List.map all_assets ~f:(fun asset ->
      let concentration =
        Pool.Collateral_manager.CollateralManager.calculate_asset_concentration pool asset
      in
      (asset, concentration)
    )

  (** Calculate pairwise correlations **)
  let calculate_correlation_matrix
      (price_history: (asset * float list) list)
    : (asset * asset * float) list =

    (* All 14 stablecoins *)
    let all_assets = [USDC; USDT; USDP; DAI; FRAX; BUSD; USDe; USDY; PYUSD; GHO; LUSD] in

    (* Generate all pairs *)
    let pairs = List.cartesian_product all_assets all_assets in

    List.filter_map pairs ~f:(fun (asset1, asset2) ->
      if Poly.equal asset1 asset2 then None
      else
        let prices1_opt = List.Assoc.find price_history asset1 ~equal:Poly.equal in
        let prices2_opt = List.Assoc.find price_history asset2 ~equal:Poly.equal in

        match (prices1_opt, prices2_opt) with
        | (Some p1, Some p2) ->
            let corr_opt = Math.correlation p1 p2 in
            Option.map corr_opt ~f:(fun corr -> (asset1, asset2, corr))
        | _ -> None
    )

  (** Calculate chain concentrations - NEW **)
  let calculate_chain_concentrations
      (policies: policy list)
    : (blockchain * float) list =

    if List.is_empty policies then []
    else
      let total_exposure =
        List.fold policies ~init:0.0 ~f:(fun acc policy ->
          acc +. Math.cents_to_usd policy.coverage_amount
        )
      in

      let exposure_by_chain =
        List.fold policies ~init:[] ~f:(fun acc policy ->
          let chain = policy.chain in
          let exposure = Math.cents_to_usd policy.coverage_amount in
          let current_exposure = List.Assoc.find acc chain ~equal:Poly.equal |> Option.value ~default:0.0 in
          List.Assoc.add acc chain (current_exposure +. exposure) ~equal:Poly.equal
        )
      in

      List.map exposure_by_chain ~f:(fun (chain, exposure) ->
        let concentration = if Float.(total_exposure > 0.0) then exposure /. total_exposure else 0.0 in
        (chain, concentration)
      )

  (** Calculate product exposures (560 combinations) - NEW **)
  let calculate_product_exposures
      (policies: policy list)
    : (product_key * float) list =

    if List.is_empty policies then []
    else
      let exposure_map = Hashtbl.create (module struct
        type t = product_key [@@deriving sexp, compare]
        let hash (t : product_key) =
          Hashtbl.hash (t.coverage_type, t.chain, t.stablecoin)
      end) in

      List.iter policies ~f:(fun policy ->
        let key = {
          coverage_type = coverage_type_to_string policy.coverage_type;
          chain = policy.chain;
          stablecoin = policy.asset;
        } in

        let current_exposure = Hashtbl.find exposure_map key |> Option.value ~default:0.0 in
        let new_exposure = current_exposure +. Math.cents_to_usd policy.coverage_amount in
        Hashtbl.set exposure_map ~key ~data:new_exposure
      );

      Hashtbl.to_alist exposure_map

  (** Calculate top 10 products by exposure - NEW **)
  let calculate_top_products
      (exposure_by_product: (product_key * float) list)
      (policies: policy list)
    : (product_key * float * int) list =

    let with_counts =
      List.map exposure_by_product ~f:(fun (key, exposure) ->
        let count =
          List.count policies ~f:(fun policy ->
            Poly.equal (coverage_type_to_string policy.coverage_type) key.coverage_type &&
            Poly.equal policy.chain key.chain &&
            Poly.equal policy.asset key.stablecoin
          )
        in
        (key, exposure, count)
      )
    in

    List.sort with_counts ~compare:(fun (_, exp1, _) (_, exp2, _) ->
      Float.compare exp2 exp1
    )
    |> (fun lst -> List.take lst 10)

  (** Detect correlation regime **)
  let detect_correlation_regime
      (correlation_matrix: (asset * asset * float) list)
    : [`Low | `Medium | `High] =

    if List.is_empty correlation_matrix then `Medium
    else
      let correlations = List.map correlation_matrix ~f:(fun (_, _, corr) -> Float.abs corr) in
      let avg_correlation = Math.mean correlations in

      if Float.(avg_correlation > 0.70) then `High
      else if Float.(avg_correlation > 0.40) then `Medium
      else `Low

  (** Calculate portfolio VaR using Monte Carlo **)
  let calculate_portfolio_var
      (pool: (((Caqti_lwt.connection, [> Caqti_error.t]) Caqti_lwt_unix.Pool.t), [> Caqti_error.t]) Result.t)
      (collateral_mgr: Pool.Collateral_manager.CollateralManager.t)
      ~(_confidence_level: float)
    : (Risk_model.RiskModel.risk_assessment_result, [> Caqti_error.t]) Result.t Lwt.t =

    let vault_state : Monte_carlo_enhanced.MonteCarloEnhanced.vault_state = {
      active_policies = collateral_mgr.pool.active_policies;
      total_capital_usd = collateral_mgr.pool.total_capital_usd;
      btc_float_value_usd = collateral_mgr.pool.btc_cost_basis_usd;
    } in

    (* Fetch real-time market conditions for risk-adjusted VaR
       NOTE: This uses default configurations. In production, these should be
       loaded from environment variables or config service. *)
    let%lwt market_conditions =
      try%lwt
        let cex_config : Cex_liquidation_client.CEXLiquidationClient.client_config = {
          binance_api_key = Some "";
          okx_api_key = Some "";
          bybit_api_key = Some "";
          deribit_api_key = Some "";
          aggregation_window_seconds = 3600;
          rate_limit_per_minute = 60;
          timeout_seconds = 10.0;
        } in
        let bridge_config : Bridge_health_client.BridgeHealthClient.client_config = {
          defillama_api_key = None;
          l2beat_api_url = "https://api.l2beat.com/api/v1";
          custom_rpc_endpoints = [];
          rate_limit_per_minute = 60;
          timeout_seconds = 10.0;
          cache_ttl_seconds = 300;
        } in
        let chain_config : Chain_metrics_client.ChainMetricsClient.client_config = {
          etherscan_api_key = "";
          arbiscan_api_key = "";
          basescan_api_key = "";
          polygonscan_api_key = "";
          solana_rpc_url = "https://api.mainnet-beta.solana.com";
          ton_api_url = "https://toncenter.com/api/v2";
          ton_api_key = None;
          rate_limit_per_minute = 60;
          timeout_seconds = 10.0;
        } in

        (* Fetch market risk multipliers for primary bridge and chain *)
        let%lwt multipliers = Market_data_risk_integration.MarketDataRiskIntegration.fetch_market_risk_multipliers
          ~cex_config
          ~bridge_config
          ~chain_config
          ~bridge_id:Wormhole  (* Primary bridge *)
          ~chain:Ethereum  (* Primary chain *)
          ~assets:["BTC"; "ETH"]  (* Primary assets *)
        in
        Lwt.return multipliers
      with exn ->
        (* On error, use conservative defaults (no multipliers) *)
        let%lwt () = Logs_lwt.warn (fun m ->
          m "[RiskMonitor] Failed to fetch market conditions: %s. Using defaults."
            (Exn.to_string exn)
        ) in
        let default_multipliers : Market_data_risk_integration.MarketDataRiskIntegration.market_risk_multipliers = {
          bridge_multiplier = 1.0;
          chain_multiplier = 1.0;
          market_stress_multiplier = 1.0;
          combined_multiplier = 1.0;
          timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
          bridge_health_score = None;
          chain_congestion_score = None;
          market_stress_level = Normal;
        } in
        Lwt.return default_multipliers
    in

    Risk_model.RiskModel.calculate_risk_assessment
      ~db_pool:pool
      ~vault:vault_state
      ~market_conditions

  (** Run stress tests **)
  let run_stress_tests
      (db_pool: Connection_pool.ConnectionPool.t)
      (collateral_mgr: Pool.Collateral_manager.CollateralManager.t)
    : ((string * float) list * float) Lwt.t =

    let pool = collateral_mgr.pool in

    let vault_state : Monte_carlo_enhanced.MonteCarloEnhanced.vault_state = {
      active_policies = pool.active_policies;
      total_capital_usd = pool.total_capital_usd;
      btc_float_value_usd = Math.usd_to_cents (
        Math.sats_to_btc pool.btc_float_sats *. 50000.0 (* Approximate BTC price *)
      );
    } in

    (* Create a Caqti pool for monte_carlo (legacy API requirement)
       TODO: Refactor monte_carlo to accept Connection_pool directly *)
    let db_uri = db_pool.db_uri in
    let%lwt caqti_pool_result = Connection_pool.ConnectionPool.create_caqti_pool db_uri in

    match caqti_pool_result with
    | Error e ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "[RiskMonitor] Failed to create Caqti pool for stress tests: %s"
            (Caqti_error.show e)
        ) in
        Lwt.return ([], 0.0)  (* Return empty on pool creation failure *)

    | Ok caqti_pool ->
        let%lwt results = Monte_carlo_enhanced.MonteCarloEnhanced.run_stress_test_suite
          (Ok caqti_pool)
          ~vault:vault_state
        in

        match results with
        | Ok stress_results ->
            Lwt.return (stress_results.scenarios, stress_results.worst_loss)
        | Error err ->
            let%lwt () = Logs_lwt.err (fun m ->
              m "[RiskMonitor] Stress test failed: %s" (Caqti_error.show err)
            ) in
            Lwt.return ([], 0.0)

  (** Check risk limits and generate alerts **)
  let check_risk_limits
      (snapshot: risk_snapshot)
      (config: monitor_config)
    : risk_alert list * risk_alert list =

    let thresholds = config.alert_thresholds in
    let breaches = ref [] in
    let warnings = ref [] in

    (* Check LTV *)
    if Float.(snapshot.ltv >= thresholds.ltv_critical) then
      breaches := {
        alert_type = LTV_Breach;
        severity = `Critical;
        message = Printf.sprintf "LTV critical: %.2f%% >= %.2f%%"
          (snapshot.ltv *. 100.0) (thresholds.ltv_critical *. 100.0);
        current_value = snapshot.ltv;
        limit_value = thresholds.ltv_critical;
        alert_timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      } :: !breaches
    else if Float.(snapshot.ltv >= thresholds.ltv_warning) then
      warnings := {
        alert_type = LTV_Breach;
        severity = `High;
        message = Printf.sprintf "LTV warning: %.2f%% >= %.2f%%"
          (snapshot.ltv *. 100.0) (thresholds.ltv_warning *. 100.0);
        current_value = snapshot.ltv;
        limit_value = thresholds.ltv_warning;
        alert_timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      } :: !warnings;

    (* Check reserves *)
    if Float.(snapshot.reserve_ratio <= thresholds.reserve_critical) then
      breaches := {
        alert_type = Reserve_Low;
        severity = `Critical;
        message = Printf.sprintf "Reserves critical: %.2f%% <= %.2f%%"
          (snapshot.reserve_ratio *. 100.0) (thresholds.reserve_critical *. 100.0);
        current_value = snapshot.reserve_ratio;
        limit_value = thresholds.reserve_critical;
        alert_timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      } :: !breaches
    else if Float.(snapshot.reserve_ratio <= thresholds.reserve_warning) then
      warnings := {
        alert_type = Reserve_Low;
        severity = `High;
        message = Printf.sprintf "Reserves warning: %.2f%% <= %.2f%%"
          (snapshot.reserve_ratio *. 100.0) (thresholds.reserve_warning *. 100.0);
        current_value = snapshot.reserve_ratio;
        limit_value = thresholds.reserve_warning;
        alert_timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      } :: !warnings;

    (* Check concentration *)
    if Float.(snapshot.max_concentration >= thresholds.concentration_critical) then
      breaches := {
        alert_type = Concentration_High;
        severity = `Critical;
        message = Printf.sprintf "Concentration critical: %.2f%% >= %.2f%%"
          (snapshot.max_concentration *. 100.0) (thresholds.concentration_critical *. 100.0);
        current_value = snapshot.max_concentration;
        limit_value = thresholds.concentration_critical;
        alert_timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      } :: !breaches
    else if Float.(snapshot.max_concentration >= thresholds.concentration_warning) then
      warnings := {
        alert_type = Concentration_High;
        severity = `Medium;
        message = Printf.sprintf "Concentration warning: %.2f%% >= %.2f%%"
          (snapshot.max_concentration *. 100.0) (thresholds.concentration_warning *. 100.0);
        current_value = snapshot.max_concentration;
        limit_value = thresholds.concentration_warning;
        alert_timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      } :: !warnings;

    (!breaches, !warnings)

  (** Calculate comprehensive risk snapshot **)
  let calculate_risk_snapshot
      (db_pool: Connection_pool.ConnectionPool.t)
      (collateral_mgr: Pool.Collateral_manager.CollateralManager.t)
      ~(config: monitor_config)
      ~(price_history_opt: (asset * float list) list option)
    : risk_snapshot Lwt.t =

    let pool = collateral_mgr.pool in

    (* Create Caqti pool for VaR calculation (legacy API) *)
    let%lwt caqti_pool_result = Connection_pool.ConnectionPool.create_caqti_pool db_pool.db_uri in

    (* Calculate VaR *)
    let%lwt var_result = calculate_portfolio_var caqti_pool_result collateral_mgr
      ~_confidence_level:0.95
    in

    let (var_95, var_99, cvar_95, expected_loss) = match var_result with
      | Ok res -> (res.var_95, res.var_99, res.cvar_95, res.expected_loss)
      | Error err ->
          (* Log critical error - VaR calculation is essential for risk assessment *)
          Logs.err (fun m ->
            m "[RiskMonitor] CRITICAL: VaR calculation failed: %s. Using NaN for risk metrics!"
              (Caqti_error.show err));
          (* Return NaN to signal invalid data rather than misleading zeros *)
          (Float.nan, Float.nan, Float.nan, Float.nan)
    in

    (* Run stress tests *)
    let%lwt (stress_results, worst_case) = run_stress_tests db_pool collateral_mgr in

    (* Calculate utilization metrics *)
    let ltv = Pool.Collateral_manager.CollateralManager.calculate_ltv pool in
    let reserve_ratio = Pool.Collateral_manager.CollateralManager.calculate_reserve_ratio pool in

    (* Calculate concentrations *)
    let asset_concentrations = calculate_asset_concentrations collateral_mgr in
    let max_concentration =
      List.fold asset_concentrations ~init:0.0 ~f:(fun acc (_, conc) ->
        Float.max acc conc
      )
    in

    (* Calculate correlated exposure *)
    let correlated_exposure =
      List.fold asset_concentrations ~init:0.0 ~f:(fun acc (asset, _) ->
        Float.max acc (Pool.Collateral_manager.CollateralManager.calculate_correlated_exposure pool asset)
      )
    in

    (* Correlation analysis *)
    let correlation_matrix = match price_history_opt with
      | Some history -> calculate_correlation_matrix history
      | None -> []
    in

    let correlation_regime = detect_correlation_regime correlation_matrix in

    (* Portfolio composition *)
    let total_policies = List.length pool.active_policies in

    let policies_by_asset =
      List.fold pool.active_policies ~init:[] ~f:(fun acc policy ->
        let count = List.Assoc.find acc policy.asset ~equal:Poly.equal |> Option.value ~default:0 in
        List.Assoc.add acc policy.asset (count + 1) ~equal:Poly.equal
      )
    in

    let avg_duration =
      if List.is_empty pool.active_policies then 0.0
      else
        let total_duration =
          List.fold pool.active_policies ~init:0.0 ~f:(fun acc policy ->
            acc +. (policy.expiry_time -. policy.start_time)
          )
        in
        total_duration /. Float.of_int total_policies /. 86400.0 (* Convert to days *)
    in

    (* Calculate utilization by product type *)
    let utilization_by_product =
      List.fold pool.active_policies ~init:[] ~f:(fun acc policy ->
        let product_name = coverage_type_to_string policy.coverage_type in
        let coverage_usd = cents_to_usd policy.coverage_amount in
        let current = List.Assoc.find acc product_name ~equal:String.equal |> Option.value ~default:0.0 in
        List.Assoc.add acc product_name (current +. coverage_usd) ~equal:String.equal
      )
    in

    let snapshot = {
      timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      var_95;
      var_99;
      cvar_95;
      expected_loss;
      worst_case_stress = worst_case;
      stress_test_results = stress_results;
      ltv;
      reserve_ratio;
      utilization_by_product;
      asset_concentrations;
      chain_concentrations = [];  (* TODO: Implement chain-specific concentrations *)
      max_concentration;
      correlated_exposure;
      cross_chain_bridge_exposure = 0.0;  (* TODO: Calculate bridge risk exposure *)
      exposure_by_product = [];  (* TODO: Implement 560-product exposure tracking *)
      top_10_products = [];  (* TODO: Calculate top products by exposure *)
      correlation_matrix;
      correlation_regime;
      total_policies;
      policies_by_asset;
      policies_by_chain = [];  (* TODO: Implement chain-specific policy counts *)
      policies_by_product = [];
      avg_policy_duration = avg_duration;
      breach_alerts = [];
      warning_alerts = [];
    } in

    (* Check limits *)
    let (breaches, warnings) = check_risk_limits snapshot config in

    Lwt.return { snapshot with breach_alerts = breaches; warning_alerts = warnings }

  (** Get risk-adjusted pricing multiplier **)
  let get_risk_adjusted_multiplier
      (snapshot: risk_snapshot)
      (policy_request: policy)
    : float =

    (* Base multiplier *)
    let base = 1.0 in

    (* Adjust for LTV *)
    let ltv_multiplier =
      if Float.(snapshot.ltv > 0.70) then 1.0 +. ((snapshot.ltv -. 0.70) *. 2.0) (* 2x increase per 10% LTV *)
      else 1.0
    in

    (* Adjust for concentration *)
    let concentration_multiplier =
      let asset_conc =
        List.Assoc.find snapshot.asset_concentrations policy_request.asset ~equal:Poly.equal
        |> Option.value ~default:0.0
      in

      if Float.(asset_conc > 0.25) then 1.0 +. ((asset_conc -. 0.25) *. 4.0) (* 4x increase per 10% over limit *)
      else 1.0
    in

    (* Adjust for correlation regime *)
    let correlation_multiplier = match snapshot.correlation_regime with
      | `High -> 1.3  (* 30% higher premium in high correlation *)
      | `Medium -> 1.1
      | `Low -> 1.0
    in

    (* Adjust for reserves *)
    let reserve_multiplier =
      if Float.(snapshot.reserve_ratio < 0.20) then 1.0 +. ((0.20 -. snapshot.reserve_ratio) *. 5.0)
      else 1.0
    in

    base *. ltv_multiplier *. concentration_multiplier *. correlation_multiplier *. reserve_multiplier

  (** Main monitoring loop **)
  let monitor_loop
      ~(db_pool: Connection_pool.ConnectionPool.t)
      ~(collateral_manager: Pool.Collateral_manager.CollateralManager.t ref)
      ~(config: monitor_config)
      ~(price_history_provider: unit -> (asset * float list) list option Lwt.t)
    : unit Lwt.t =

    let rec loop () =
      let%lwt () =
        try%lwt
          let now_sec = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
          Lwt_io.printlf "\n[%.0f] Running risk surveillance..." now_sec >>= fun () ->

          (* Get price history *)
          let%lwt price_history_opt = price_history_provider () in

          (* Calculate snapshot *)
          let%lwt snapshot = calculate_risk_snapshot db_pool !collateral_manager
            ~config
            ~price_history_opt
          in

          (* Log metrics *)
          Lwt_io.printlf "=== Risk Snapshot ===" >>= fun () ->
          Lwt_io.printlf "VaR 95%%: $%.2f" snapshot.var_95 >>= fun () ->
          Lwt_io.printlf "VaR 99%%: $%.2f" snapshot.var_99 >>= fun () ->
          Lwt_io.printlf "Worst-case stress: $%.2f" snapshot.worst_case_stress >>= fun () ->
          Lwt_io.printlf "LTV: %.2f%%" (snapshot.ltv *. 100.0) >>= fun () ->
          Lwt_io.printlf "Reserves: %.2f%%" (snapshot.reserve_ratio *. 100.0) >>= fun () ->
          Lwt_io.printlf "Max concentration: %.2f%%" (snapshot.max_concentration *. 100.0) >>= fun () ->
          Lwt_io.printlf "Correlation regime: %s"
            (match snapshot.correlation_regime with
              | `High -> "HIGH"
              | `Medium -> "MEDIUM"
              | `Low -> "LOW") >>= fun () ->

          (* Log alerts *)
          (if not (List.is_empty snapshot.breach_alerts) then
            Lwt_io.printlf "\n🚨 CRITICAL ALERTS:" >>= fun () ->
            Lwt_list.iter_s (fun alert ->
              Lwt_io.printlf "  - %s" alert.message
            ) snapshot.breach_alerts
          else Lwt.return ()) >>= fun () ->

          (if not (List.is_empty snapshot.warning_alerts) then
            Lwt_io.printlf "\n⚠️  WARNINGS:" >>= fun () ->
            Lwt_list.iter_s (fun alert ->
              Lwt_io.printlf "  - %s" alert.message
            ) snapshot.warning_alerts
          else Lwt.return ()) >>= fun () ->

          Lwt_io.printlf "=====================\n"

        with exn ->
          Lwt_io.eprintlf "Error in risk monitor: %s" (Exn.to_string exn)
      in

      let%lwt () = Lwt_unix.sleep config.check_interval_seconds in
      loop ()
    in

    Lwt_io.printlf "\n╔════════════════════════════════════════╗" >>= fun () ->
    Lwt_io.printlf "║  Unified Risk Monitor Started          ║" >>= fun () ->
    Lwt_io.printlf "╚════════════════════════════════════════╝\n" >>= fun () ->
    Lwt_io.printlf "Check interval: %.0f seconds\n" config.check_interval_seconds >>= fun () ->

    loop ()

end
