(** Risk Report Generator
 *
 * Generates comprehensive daily risk reports with:
 * - Portfolio summary and metrics
 * - VaR analysis with historical context
 * - Stress test results
 * - Historical comparison
 * - Risk alerts and recommendations
 * - Chart data (JSON format for visualization)
 *)

open Core
open Lwt.Infix
open Types
open Math

module RiskReportGenerator = struct

  type vault_state = {
    total_capital_usd: int64;
    total_coverage_sold: int64;
    active_policies: policy list;
  }

  type portfolio_metrics = {
    total_capital_usd: float;
    total_coverage_sold_usd: float;
    active_policies_count: int;
    ltv_ratio: float;
    utilization_rate: float;
    diversification_score: float;
  } [@@deriving sexp, yojson]

  type var_analysis = {
    var_95: float;
    var_99: float;
    cvar_95: float;
    expected_loss: float;
    var_trend_30d: float; (* % change *)
    scenarios_used: int;
  } [@@deriving sexp, yojson]

  type historical_comparison = {
    var_95_vs_30d_avg: float; (* % difference *)
    correlation_regime_change: bool;
    new_depeg_events_7d: int;
    portfolio_growth_7d: float; (* % *)
  } [@@deriving sexp, yojson]

  type risk_alert = {
    severity: string; (* "low", "medium", "high", "critical" *)
    category: string;
    message: string;
    timestamp: float;
  } [@@deriving sexp, yojson]

  type risk_report = {
    generated_at: float;
    report_date: string;
    portfolio_summary: portfolio_metrics;
    var_analysis: var_analysis;
    stress_test_results: (string * float) list;
    historical_comparison: historical_comparison;
    risk_alerts: risk_alert list;
    recommendations: string list;
    chart_data: Yojson.Safe.t;
  } [@@deriving yojson]

  (** Calculate VaR trend from historical snapshots *)
  let calculate_var_trend_30d
      ~(current_var: float)
      ~(conn_string: string)
    : float Lwt.t =

    try%lwt
      (* Query historical VaR from 30 days ago *)
      let%lwt uri = Caqti_lwt_unix.connect (Uri.of_string conn_string) in

      match uri with
      | Error err ->
          Logs_lwt.warn (fun m ->
            m "Failed to connect for VaR trend: %s" (Caqti_error.show err)
          ) >>= fun () ->
          Lwt.return 0.0

      | Ok (module Db : Caqti_lwt.CONNECTION) ->
          let open Caqti_request.Infix in
          let open Caqti_type in

          let query =
            unit ->? float
            @@ {|
              SELECT var_95
              FROM risk_snapshots
              WHERE timestamp >= NOW() - INTERVAL '30 days'
              AND timestamp < NOW() - INTERVAL '29 days'
              ORDER BY timestamp ASC
              LIMIT 1
            |}
          in

          let%lwt result = Db.find_opt query () in

          match result with
          | Ok (Some historical_var) ->
              let trend = ((current_var -. historical_var) /. historical_var) *. 100.0 in
              Lwt.return trend
          | Ok None ->
              (* No historical data available *)
              Lwt.return 0.0
          | Error err ->
              Logs_lwt.warn (fun m ->
                m "Failed to query historical VaR: %s" (Caqti_error.show err)
              ) >>= fun () ->
              Lwt.return 0.0
    with exn ->
      Logs_lwt.err (fun m ->
        m "Exception calculating VaR trend: %s" (Exn.to_string exn)
      ) >>= fun () ->
      Lwt.return 0.0

  (** Calculate VaR comparison vs 30-day average *)
  let calculate_var_vs_30d_avg
      ~(current_var: float)
      ~(conn_string: string)
    : float Lwt.t =

    try%lwt
      let%lwt uri = Caqti_lwt_unix.connect (Uri.of_string conn_string) in

      match uri with
      | Error err ->
          Logs_lwt.warn (fun m ->
            m "Failed to connect for VaR comparison: %s" (Caqti_error.show err)
          ) >>= fun () ->
          Lwt.return 0.0

      | Ok (module Db : Caqti_lwt.CONNECTION) ->
          let open Caqti_request.Infix in
          let open Caqti_type in

          let query =
            unit ->? float
            @@ {|
              SELECT AVG(var_95)
              FROM risk_snapshots
              WHERE timestamp >= NOW() - INTERVAL '30 days'
            |}
          in

          let%lwt result = Db.find_opt query () in

          match result with
          | Ok (Some avg_var) when Float.(avg_var > 0.0) ->
              let diff = ((current_var -. avg_var) /. avg_var) *. 100.0 in
              Lwt.return diff
          | _ ->
              Lwt.return 0.0
    with _ ->
      Lwt.return 0.0

  (** Detect correlation regime change *)
  let detect_correlation_regime_change
      ~(conn_string: string)
    : bool Lwt.t =

    try%lwt
      let%lwt uri = Caqti_lwt_unix.connect (Uri.of_string conn_string) in

      match uri with
      | Error _ ->
          Lwt.return false

      | Ok (module Db : Caqti_lwt.CONNECTION) ->
          let open Caqti_request.Infix in
          let open Caqti_type in

          (* Check if average correlation increased significantly in past 7 days *)
          let query =
            unit ->? (t2 float float)
            @@ {|
              SELECT
                AVG(CASE WHEN calculated_at >= NOW() - INTERVAL '7 days' THEN correlation END) as recent_avg,
                AVG(CASE WHEN calculated_at >= NOW() - INTERVAL '30 days'
                         AND calculated_at < NOW() - INTERVAL '7 days' THEN correlation END) as baseline_avg
              FROM asset_correlations
              WHERE window_days = 30
            |}
          in

          let%lwt result = Db.find_opt query () in

          match result with
          | Ok (Some (recent_avg, baseline_avg)) ->
              (* Regime change if recent correlation > 0.8 and increased >20% *)
              let regime_change =
                Float.(recent_avg > 0.8) &&
                Float.((recent_avg -. baseline_avg) /. baseline_avg > 0.20)
              in
              Lwt.return regime_change
          | _ ->
              Lwt.return false
    with _ ->
      Lwt.return false

  (** Calculate portfolio growth over 7 days *)
  let calculate_portfolio_growth_7d
      ~(current_capital: float)
      ~(conn_string: string)
    : float Lwt.t =

    try%lwt
      let%lwt uri = Caqti_lwt_unix.connect (Uri.of_string conn_string) in

      match uri with
      | Error _ ->
          Lwt.return 0.0

      | Ok (module Db : Caqti_lwt.CONNECTION) ->
          let open Caqti_request.Infix in
          let open Caqti_type in

          let query =
            unit ->? float
            @@ {|
              SELECT total_capital_usd
              FROM risk_snapshots
              WHERE timestamp >= NOW() - INTERVAL '7 days'
              AND timestamp < NOW() - INTERVAL '6 days'
              ORDER BY timestamp ASC
              LIMIT 1
            |}
          in

          let%lwt result = Db.find_opt query () in

          match result with
          | Ok (Some historical_capital) when Float.(historical_capital > 0.0) ->
              let growth = ((current_capital -. historical_capital) /. historical_capital) *. 100.0 in
              Lwt.return growth
          | _ ->
              Lwt.return 0.0
    with _ ->
      Lwt.return 0.0

  (** Calculate portfolio metrics *)
  let calculate_portfolio_metrics
      (vault: vault_state)
    : portfolio_metrics =

    let total_capital = cents_to_usd vault.total_capital_usd in
    let total_coverage = cents_to_usd vault.total_coverage_sold in
    let active_count = List.length vault.active_policies in

    let ltv =
      if Float.(total_capital > 0.0) then
        total_coverage /. total_capital
      else 0.0
    in

    let utilization = ltv in

    (* Diversification: entropy of coverage by asset *)
    let coverage_by_asset =
      List.fold vault.active_policies ~init:[] ~f:(fun acc policy ->
        match List.Assoc.find acc ~equal:Poly.equal policy.asset with
        | Some existing ->
            List.Assoc.add acc ~equal:Poly.equal policy.asset
              Int64.(existing + policy.coverage_amount)
        | None ->
            (policy.asset, policy.coverage_amount) :: acc
      )
    in

    let diversification =
      if List.is_empty coverage_by_asset then 1.0
      else
        let total = List.fold coverage_by_asset ~init:0.0 ~f:(fun acc (_, amt) ->
          acc +. cents_to_usd amt
        ) in
        let proportions =
          List.map coverage_by_asset ~f:(fun (_, amt) ->
            cents_to_usd amt /. total
          )
        in
        (* Normalized entropy (0 = concentrated, 1 = perfectly diversified) *)
        let entropy = -. List.fold proportions ~init:0.0 ~f:(fun acc p ->
          if Float.(p > 0.0) then acc +. (p *. Float.log p) else acc
        ) in
        let max_entropy = Float.log (Float.of_int (List.length coverage_by_asset)) in
        if Float.(max_entropy > 0.0) then entropy /. max_entropy else 0.0
    in

    {
      total_capital_usd = total_capital;
      total_coverage_sold_usd = total_coverage;
      active_policies_count = active_count;
      ltv_ratio = ltv;
      utilization_rate = utilization;
      diversification_score = diversification;
    }

  (** Generate risk alerts based on metrics *)
  let generate_risk_alerts
      ~(portfolio: portfolio_metrics)
      ~(var_analysis: var_analysis)
      ~(stress_results: (string * float) list)
    : risk_alert list =

    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let alerts = ref [] in

    (* LTV alert *)
    if Float.(portfolio.ltv_ratio > 0.8) then
      alerts := {
        severity = "critical";
        category = "Capital";
        message = Printf.sprintf "LTV ratio %.1f%% exceeds 80%% threshold"
          (portfolio.ltv_ratio *. 100.0);
        timestamp = now;
      } :: !alerts
    else if Float.(portfolio.ltv_ratio > 0.7) then
      alerts := {
        severity = "high";
        category = "Capital";
        message = Printf.sprintf "LTV ratio %.1f%% approaching 80%% limit"
          (portfolio.ltv_ratio *. 100.0);
        timestamp = now;
      } :: !alerts;

    (* VaR trend alert *)
    if Float.(var_analysis.var_trend_30d > 0.20) then
      alerts := {
        severity = "high";
        category = "Risk Metrics";
        message = Printf.sprintf "VaR increased %.1f%% in last 30 days"
          (var_analysis.var_trend_30d *. 100.0);
        timestamp = now;
      } :: !alerts;

    (* Diversification alert *)
    if Float.(portfolio.diversification_score < 0.5) then
      alerts := {
        severity = "medium";
        category = "Portfolio";
        message = Printf.sprintf "Low diversification score: %.2f (target: >0.7)"
          portfolio.diversification_score;
        timestamp = now;
      } :: !alerts;

    (* Stress test alert *)
    let worst_stress_loss =
      List.fold stress_results ~init:0.0 ~f:(fun acc (_, loss) ->
        Float.max acc loss
      )
    in
    if Float.(worst_stress_loss > portfolio.total_capital_usd *. 0.5) then
      alerts := {
        severity = "critical";
        category = "Stress Test";
        message = Printf.sprintf "Worst-case stress loss $%.2f exceeds 50%% of capital"
          worst_stress_loss;
        timestamp = now;
      } :: !alerts;

    List.rev !alerts

  (** Generate chart data for visualization *)
  let generate_chart_data
      ~(portfolio: portfolio_metrics)
      ~(var_analysis: var_analysis)
      ~(stress_results: (string * float) list)
    : Yojson.Safe.t =

    `Assoc [
      ("portfolio", `Assoc [
        ("labels", `List [`String "Total Capital"; `String "Coverage Sold"]);
        ("values", `List [
          `Float portfolio.total_capital_usd;
          `Float portfolio.total_coverage_sold_usd;
        ]);
      ]);
      ("var_metrics", `Assoc [
        ("labels", `List [`String "VaR 95%"; `String "VaR 99%"; `String "CVaR 95%"]);
        ("values", `List [
          `Float var_analysis.var_95;
          `Float var_analysis.var_99;
          `Float var_analysis.cvar_95;
        ]);
      ]);
      ("stress_tests", `Assoc [
        ("scenarios", `List (List.map stress_results ~f:(fun (name, _) ->
          `String name
        )));
        ("losses", `List (List.map stress_results ~f:(fun (_, loss) ->
          `Float loss
        )));
      ]);
    ]

  (** Generate daily risk report *)
  let generate_daily_report
      (pool: ((Caqti_lwt.connection, Caqti_error.t) Caqti_lwt_unix.Pool.t, [> Caqti_error.t]) Result.t)
      ~(vault: vault_state)
    : (risk_report, [> Caqti_error.t]) Result.t Lwt.t =

    Logs_lwt.info (fun m ->
      m "Generating daily risk report"
    ) >>= fun () ->

    let portfolio_metrics = calculate_portfolio_metrics vault in

    (* Run VaR analysis *)
    (* Convert vault_state to Monte_carlo_enhanced vault format *)
    let mc_vault : Monte_carlo_enhanced.MonteCarloEnhanced.vault_state = {
      active_policies = vault.active_policies;
      total_capital_usd = vault.total_capital_usd;
      btc_float_value_usd = 0L; (* TODO: Get actual BTC float value *)
    } in

    let%lwt var_result =
      Monte_carlo_enhanced.MonteCarloEnhanced.calculate_adaptive_var
        pool ~vault:mc_vault ~confidence_level:0.95
    in

    (* Run stress tests *)
    let%lwt stress_result =
      Monte_carlo_enhanced.MonteCarloEnhanced.run_stress_test_suite pool ~vault:mc_vault
    in

    match (var_result, stress_result) with
    | (Error e, _) | (_, Error e) ->
        Lwt.return (Error e)

    | (Ok var_res, Ok stress_res) ->
        (* Query recent depeg claims from database *)
        (* TODO: Fix pool type mismatch - stub for now *)
        let new_depeg_events_7d = Lwt.return 0 in
        let%lwt new_depeg_events_7d = new_depeg_events_7d in

        (* Calculate historical trends *)
        (* TODO: Implement calculate_var_trend_30d with proper database connection *)
        let var_trend_30d = 0.0 in

        let var_analysis = {
          var_95 = var_res.var_95;
          var_99 = var_res.var_99;
          cvar_95 = var_res.cvar_95;
          expected_loss = var_res.expected_loss;
          var_trend_30d;
          scenarios_used = var_res.scenarios_used;
        } in

        (* TODO: Implement calculate_var_vs_30d_avg *)
        let var_95_vs_30d_avg = 1.0 in

        (* TODO: Implement detect_correlation_regime_change *)
        let correlation_regime_change = false in

        (* Get database connection string from environment *)
        let conn_string = match Sys.getenv "DATABASE_URL" with
          | Some url -> url
          | None -> "postgresql://localhost/tonsurance" (* Fallback for development *)
        in

        let%lwt portfolio_growth_7d = calculate_portfolio_growth_7d
          ~current_capital:(cents_to_usd vault.total_capital_usd)
          ~conn_string
        in

        let historical_comparison = {
          var_95_vs_30d_avg;
          correlation_regime_change;
          new_depeg_events_7d;
          portfolio_growth_7d;
        } in

        let alerts =
          generate_risk_alerts
            ~portfolio:portfolio_metrics
            ~var_analysis
            ~stress_results:stress_res.scenarios
        in

        let recommendations = [
          if Float.(portfolio_metrics.ltv_ratio > 0.75) then
            "Consider raising additional capital or reducing coverage limits"
          else
            "LTV ratio within acceptable range";

          if Float.(portfolio_metrics.diversification_score < 0.6) then
            "Increase portfolio diversification across assets"
          else
            "Portfolio diversification adequate";

          Printf.sprintf "Maintain reserves of at least $%.2f for 95%% VaR coverage"
            (var_analysis.var_95 *. 1.5);
        ] in

        let chart_data =
          generate_chart_data
            ~portfolio:portfolio_metrics
            ~var_analysis
            ~stress_results:stress_res.scenarios
        in

        let report = {
          generated_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
          report_date = Time_float.now () |> Time_float.to_date ~zone:Time_float.Zone.utc |> Date.to_string;
          portfolio_summary = portfolio_metrics;
          var_analysis;
          stress_test_results = stress_res.scenarios;
          historical_comparison;
          risk_alerts = alerts;
          recommendations;
          chart_data;
        } in

        Logs_lwt.info (fun m ->
          m "Risk report generated: %d alerts, VaR95=$%.2f"
            (List.length alerts) var_analysis.var_95
        ) >>= fun () ->

        Lwt.return (Ok report)

  (** Export report as JSON *)
  let export_to_json (report: risk_report) : Yojson.Safe.t =
    risk_report_to_yojson report

  (** Save report to file *)
  let save_report_to_file
      ~(report: risk_report)
      ~(output_path: string)
    : unit Lwt.t =

    let json = export_to_json report in
    let json_str = Yojson.Safe.to_string ~std:true json in

    let%lwt () =
      Lwt_io.with_file
        ~mode:Lwt_io.Output
        output_path
        (fun channel -> Lwt_io.write channel json_str)
    in

    Logs_lwt.info (fun m ->
      m "Risk report saved to %s" output_path
    )

end
