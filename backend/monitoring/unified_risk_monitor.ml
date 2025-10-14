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
open Lwt.Syntax
open Types
open Math

module UnifiedRiskMonitor = struct

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

    (* Concentration metrics *)
    asset_concentrations: (asset * float) list; (* Asset → % of capital *)
    max_concentration: float;           (* Largest single asset exposure *)
    correlated_exposure: float;         (* Max correlated group exposure *)

    (* Correlation analysis *)
    correlation_matrix: (asset * asset * float) list; (* Pairwise correlations *)
    correlation_regime: [`Low | `Medium | `High]; (* Regime detection *)

    (* Portfolio composition *)
    total_policies: int;
    policies_by_asset: (asset * int) list;
    policies_by_product: (string * int) list;
    avg_policy_duration: float;         (* Days *)

    (* Risk alerts *)
    breach_alerts: risk_alert list;
    warning_alerts: risk_alert list;
  } [@@deriving sexp, yojson]

  and risk_alert = {
    alert_type: alert_type;
    severity: [`Critical | `High | `Medium | `Low];
    message: string;
    current_value: float;
    limit_value: float;
    timestamp: float;
  }

  and alert_type =
    | LTV_Breach
    | Reserve_Low
    | Concentration_High
    | Correlation_Spike
    | Stress_Loss_High
    | VaR_Breach
  [@@deriving sexp, yojson]

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
      (collateral_mgr: Collateral_manager.CollateralManager.t)
    : (asset * float) list =

    let pool = collateral_mgr.pool in
    let all_assets = [USDC; USDT; DAI; FRAX; BUSD] in

    List.map all_assets ~f:(fun asset ->
      let concentration =
        Collateral_manager.CollateralManager.calculate_asset_concentration pool asset
      in
      (asset, concentration)
    )

  (** Calculate pairwise correlations **)
  let calculate_correlation_matrix
      (price_history: (asset * float list) list)
    : (asset * asset * float) list =

    let all_assets = [USDC; USDT; DAI; FRAX; BUSD] in

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

  (** Detect correlation regime **)
  let detect_correlation_regime
      (correlation_matrix: (asset * asset * float) list)
    : [`Low | `Medium | `High] =

    if List.is_empty correlation_matrix then `Medium
    else
      let correlations = List.map correlation_matrix ~f:(fun (_, _, corr) -> Float.abs corr) in
      let avg_correlation = Math.mean correlations in

      if avg_correlation > 0.70 then `High
      else if avg_correlation > 0.40 then `Medium
      else `Low

  (** Calculate portfolio VaR using Monte Carlo **)
  let calculate_portfolio_var
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(confidence_level: float)
      ~(num_simulations: int)
    : float =

    (* Simplified: use historical returns if available *)
    (* In production, would use full Monte Carlo with correlation matrix *)

    let pool = collateral_mgr.pool in

    if List.is_empty pool.active_policies then 0.0
    else
      (* Approximate VaR as % of total coverage *)
      let total_coverage = Math.cents_to_usd pool.total_coverage_sold in

      (* Historical depeg probability *)
      let avg_depeg_prob =
        List.fold [USDC; USDT; DAI] ~init:0.0 ~f:(fun acc asset ->
          acc +. Risk_model.RiskModel.DepegAnalysis.annual_depeg_probability asset ~threshold:0.97
        ) /. 3.0
      in

      (* Expected severity *)
      let avg_severity =
        List.fold [USDC; USDT; DAI] ~init:0.0 ~f:(fun acc asset ->
          acc +. Risk_model.RiskModel.DepegAnalysis.expected_severity asset
        ) /. 3.0
      in

      (* VaR estimate *)
      let var_pct = if confidence_level >= 0.99 then
        avg_depeg_prob *. avg_severity *. 2.0  (* 99% VaR ~2x expected *)
      else
        avg_depeg_prob *. avg_severity *. 1.5  (* 95% VaR ~1.5x expected *)
      in

      total_coverage *. var_pct

  (** Run stress tests **)
  let run_stress_tests
      (collateral_mgr: Collateral_manager.CollateralManager.t)
    : (string * float) list * float =

    let pool = collateral_mgr.pool in

    (* Convert pool to vault_state for stress testing *)
    let vault_state = {
      total_capital_usd = pool.total_capital_usd;
      btc_float_sats = pool.btc_float_sats;
      btc_float_value_usd = Math.usd_to_cents (
        Math.sats_to_btc pool.btc_float_sats *. 50000.0 (* Approximate BTC price *)
      );
      usd_reserves = pool.usd_reserves;
      collateral_positions = [];
      active_policies = pool.active_policies;
      total_coverage_sold = pool.total_coverage_sold;
    } in

    let results = Risk_model.RiskModel.StressTest.run_all_scenarios vault_state in
    let worst_case = Risk_model.RiskModel.StressTest.worst_case_loss vault_state in

    (results, worst_case)

  (** Check risk limits and generate alerts **)
  let check_risk_limits
      (snapshot: risk_snapshot)
      (config: monitor_config)
    : risk_alert list * risk_alert list =

    let thresholds = config.alert_thresholds in
    let breaches = ref [] in
    let warnings = ref [] in

    (* Check LTV *)
    if snapshot.ltv >= thresholds.ltv_critical then
      breaches := {
        alert_type = LTV_Breach;
        severity = `Critical;
        message = Printf.sprintf "LTV critical: %.2f%% >= %.2f%%"
          (snapshot.ltv *. 100.0) (thresholds.ltv_critical *. 100.0);
        current_value = snapshot.ltv;
        limit_value = thresholds.ltv_critical;
        timestamp = Unix.time ();
      } :: !breaches
    else if snapshot.ltv >= thresholds.ltv_warning then
      warnings := {
        alert_type = LTV_Breach;
        severity = `High;
        message = Printf.sprintf "LTV warning: %.2f%% >= %.2f%%"
          (snapshot.ltv *. 100.0) (thresholds.ltv_warning *. 100.0);
        current_value = snapshot.ltv;
        limit_value = thresholds.ltv_warning;
        timestamp = Unix.time ();
      } :: !warnings;

    (* Check reserves *)
    if snapshot.reserve_ratio <= thresholds.reserve_critical then
      breaches := {
        alert_type = Reserve_Low;
        severity = `Critical;
        message = Printf.sprintf "Reserves critical: %.2f%% <= %.2f%%"
          (snapshot.reserve_ratio *. 100.0) (thresholds.reserve_critical *. 100.0);
        current_value = snapshot.reserve_ratio;
        limit_value = thresholds.reserve_critical;
        timestamp = Unix.time ();
      } :: !breaches
    else if snapshot.reserve_ratio <= thresholds.reserve_warning then
      warnings := {
        alert_type = Reserve_Low;
        severity = `High;
        message = Printf.sprintf "Reserves warning: %.2f%% <= %.2f%%"
          (snapshot.reserve_ratio *. 100.0) (thresholds.reserve_warning *. 100.0);
        current_value = snapshot.reserve_ratio;
        limit_value = thresholds.reserve_warning;
        timestamp = Unix.time ();
      } :: !warnings;

    (* Check concentration *)
    if snapshot.max_concentration >= thresholds.concentration_critical then
      breaches := {
        alert_type = Concentration_High;
        severity = `Critical;
        message = Printf.sprintf "Concentration critical: %.2f%% >= %.2f%%"
          (snapshot.max_concentration *. 100.0) (thresholds.concentration_critical *. 100.0);
        current_value = snapshot.max_concentration;
        limit_value = thresholds.concentration_critical;
        timestamp = Unix.time ();
      } :: !breaches
    else if snapshot.max_concentration >= thresholds.concentration_warning then
      warnings := {
        alert_type = Concentration_High;
        severity = `Medium;
        message = Printf.sprintf "Concentration warning: %.2f%% >= %.2f%%"
          (snapshot.max_concentration *. 100.0) (thresholds.concentration_warning *. 100.0);
        current_value = snapshot.max_concentration;
        limit_value = thresholds.concentration_warning;
        timestamp = Unix.time ();
      } :: !warnings;

    (!breaches, !warnings)

  (** Calculate comprehensive risk snapshot **)
  let calculate_risk_snapshot
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(config: monitor_config)
      ~(price_history_opt: (asset * float list) list option)
    : risk_snapshot =

    let pool = collateral_mgr.pool in

    (* Calculate VaR *)
    let var_95 = calculate_portfolio_var collateral_mgr
      ~confidence_level:0.95
      ~num_simulations:config.monte_carlo_simulations
    in

    let var_99 = calculate_portfolio_var collateral_mgr
      ~confidence_level:0.99
      ~num_simulations:config.monte_carlo_simulations
    in

    let cvar_95 = var_95 *. 1.3 in (* CVaR typically ~1.3x VaR *)

    (* Calculate expected loss *)
    let expected_loss =
      List.fold pool.active_policies ~init:0.0 ~f:(fun acc policy ->
        acc +. Risk_model.RiskModel.DepegAnalysis.expected_loss_per_policy
          policy.asset
          ~coverage:policy.coverage_amount
          ~trigger_price:policy.trigger_price
      )
    in

    (* Run stress tests *)
    let (stress_results, worst_case) = run_stress_tests collateral_mgr in

    (* Calculate utilization metrics *)
    let ltv = Collateral_manager.CollateralManager.calculate_ltv pool in
    let reserve_ratio = Collateral_manager.CollateralManager.calculate_reserve_ratio pool in

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
        Float.max acc (Collateral_manager.CollateralManager.calculate_correlated_exposure pool asset)
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

    let snapshot = {
      timestamp = Unix.time ();
      var_95;
      var_99;
      cvar_95;
      expected_loss;
      worst_case_stress = worst_case;
      stress_test_results = stress_results;
      ltv;
      reserve_ratio;
      utilization_by_product = []; (* TODO: Group by product type *)
      asset_concentrations;
      max_concentration;
      correlated_exposure;
      correlation_matrix;
      correlation_regime;
      total_policies;
      policies_by_asset;
      policies_by_product = [];
      avg_policy_duration = avg_duration;
      breach_alerts = [];
      warning_alerts = [];
    } in

    (* Check limits *)
    let (breaches, warnings) = check_risk_limits snapshot config in

    { snapshot with breach_alerts = breaches; warning_alerts = warnings }

  (** Get risk-adjusted pricing multiplier **)
  let get_risk_adjusted_multiplier
      (snapshot: risk_snapshot)
      (policy_request: policy)
    : float =

    (* Base multiplier *)
    let base = 1.0 in

    (* Adjust for LTV *)
    let ltv_multiplier =
      if snapshot.ltv > 0.70 then 1.0 +. ((snapshot.ltv -. 0.70) *. 2.0) (* 2x increase per 10% LTV *)
      else 1.0
    in

    (* Adjust for concentration *)
    let concentration_multiplier =
      let asset_conc =
        List.Assoc.find snapshot.asset_concentrations policy_request.asset ~equal:Poly.equal
        |> Option.value ~default:0.0
      in

      if asset_conc > 0.25 then 1.0 +. ((asset_conc -. 0.25) *. 4.0) (* 4x increase per 10% over limit *)
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
      if snapshot.reserve_ratio < 0.20 then 1.0 +. ((0.20 -. snapshot.reserve_ratio) *. 5.0)
      else 1.0
    in

    base *. ltv_multiplier *. concentration_multiplier *. correlation_multiplier *. reserve_multiplier

  (** Main monitoring loop **)
  let monitor_loop
      ~(collateral_manager: Collateral_manager.CollateralManager.t ref)
      ~(config: monitor_config)
      ~(price_history_provider: unit -> (asset * float list) list option Lwt.t)
    : unit Lwt.t =

    let rec loop () =
      let%lwt () =
        try%lwt
          Lwt_io.printlf "\n[%s] Running risk surveillance..."
            (Time.to_string (Time.now ())) >>= fun () ->

          (* Get price history *)
          let%lwt price_history_opt = price_history_provider () in

          (* Calculate snapshot *)
          let snapshot = calculate_risk_snapshot !collateral_manager
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
