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
open Lwt.Syntax
open Types
open Math

module RiskReportGenerator = struct

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

  (** Calculate portfolio metrics *)
  let calculate_portfolio_metrics
      (vault: vault_state)
    : portfolio_metrics =

    let total_capital = cents_to_usd vault.total_capital_usd in
    let total_coverage = cents_to_usd vault.total_coverage_sold in
    let active_count = List.length vault.active_policies in

    let ltv =
      if total_capital > 0.0 then
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
          if p > 0.0 then acc +. (p *. Float.log p) else acc
        ) in
        let max_entropy = Float.log (Float.of_int (List.length coverage_by_asset)) in
        if max_entropy > 0.0 then entropy /. max_entropy else 0.0
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

    let now = Unix.time () in
    let alerts = ref [] in

    (* LTV alert *)
    if portfolio.ltv_ratio > 0.8 then
      alerts := {
        severity = "critical";
        category = "Capital";
        message = Printf.sprintf "LTV ratio %.1f%% exceeds 80%% threshold"
          (portfolio.ltv_ratio *. 100.0);
        timestamp = now;
      } :: !alerts
    else if portfolio.ltv_ratio > 0.7 then
      alerts := {
        severity = "high";
        category = "Capital";
        message = Printf.sprintf "LTV ratio %.1f%% approaching 80%% limit"
          (portfolio.ltv_ratio *. 100.0);
        timestamp = now;
      } :: !alerts;

    (* VaR trend alert *)
    if var_analysis.var_trend_30d > 0.20 then
      alerts := {
        severity = "high";
        category = "Risk Metrics";
        message = Printf.sprintf "VaR increased %.1f%% in last 30 days"
          (var_analysis.var_trend_30d *. 100.0);
        timestamp = now;
      } :: !alerts;

    (* Diversification alert *)
    if portfolio.diversification_score < 0.5 then
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
    if worst_stress_loss > portfolio.total_capital_usd *. 0.5 then
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
      (pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
      ~(vault: vault_state)
    : (risk_report, [> Caqti_error.t]) result Lwt.t =

    Logs_lwt.info (fun m ->
      m "Generating daily risk report"
    ) >>= fun () ->

    let portfolio_metrics = calculate_portfolio_metrics vault in

    (* Run VaR analysis *)
    let%lwt var_result =
      Risk.MonteCarloEnhanced.calculate_adaptive_var
        pool ~vault ~confidence_level:0.95
    in

    (* Run stress tests *)
    let%lwt stress_result =
      Risk.MonteCarloEnhanced.run_stress_test_suite pool ~vault
    in

    match (var_result, stress_result) with
    | (Error e, _) | (_, Error e) ->
        Lwt.return (Error e)

    | (Ok var_res, Ok stress_res) ->
        let var_analysis = {
          var_95 = var_res.var_95;
          var_99 = var_res.var_99;
          cvar_95 = var_res.cvar_95;
          expected_loss = var_res.expected_loss;
          var_trend_30d = 0.0; (* TODO: Calculate from historical VaR *)
          scenarios_used = var_res.scenarios_used;
        } in

        let historical_comparison = {
          var_95_vs_30d_avg = 0.0; (* TODO: Calculate *)
          correlation_regime_change = false; (* TODO: Detect *)
          new_depeg_events_7d = 0; (* TODO: Query *)
          portfolio_growth_7d = 0.0; (* TODO: Calculate *)
        } in

        let alerts =
          generate_risk_alerts
            ~portfolio:portfolio_metrics
            ~var_analysis
            ~stress_results:stress_res.scenarios
        in

        let recommendations = [
          if portfolio_metrics.ltv_ratio > 0.75 then
            "Consider raising additional capital or reducing coverage limits"
          else
            "LTV ratio within acceptable range";

          if portfolio_metrics.diversification_score < 0.6 then
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
          generated_at = Unix.time ();
          report_date = Core_unix.strftime (Core_unix.localtime (Unix.time ())) "%Y-%m-%d";
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
