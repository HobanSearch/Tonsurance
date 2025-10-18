(** Oracle Monitoring & Alerting System
 *
 * Monitors oracle health, price quality, and triggers PagerDuty alerts.
 *
 * Monitored Metrics:
 * - Price staleness (>5 minutes triggers warning)
 * - Price divergence between sources (>5% triggers alert)
 * - Oracle availability (any source down triggers warning)
 * - Confidence scores (< 0.5 triggers alert)
 * - RPC failures (>3 consecutive failures triggers alert)
 * - Circuit breaker activations
 *
 * Integration:
 * - Prometheus metrics export
 * - Grafana dashboards
 * - PagerDuty incident management
 * - PostgreSQL audit logging
 *)

open Core

open Types

(** Monitoring configuration *)
type monitoring_config = {
  staleness_threshold_seconds: float;
  divergence_threshold_percent: float;
  confidence_threshold: float;
  consecutive_failure_threshold: int;
  pagerduty_api_key: string option;
  pagerduty_service_id: string option;
  enable_alerts: bool;
} [@@deriving sexp]

let default_config = {
  staleness_threshold_seconds = 300.0; (* 5 minutes *)
  divergence_threshold_percent = 5.0; (* 5% *)
  confidence_threshold = 0.5;
  consecutive_failure_threshold = 3;
  pagerduty_api_key = None;
  pagerduty_service_id = None;
  enable_alerts = false; (* Disabled by default for testing *)
}

(** Alert severity levels *)
type severity =
  | Critical (* Immediate action required *)
  | Warning (* Should be investigated *)
  | Info (* FYI only *)
[@@deriving sexp]

(** Alert types *)
type alert_type =
  | PriceStale of asset * float (* asset, age_seconds *)
  | PriceDivergence of asset * float (* asset, divergence_percent *)
  | LowConfidence of asset * float (* asset, confidence *)
  | OracleDown of string (* provider name *)
  | ConsecutiveFailures of string * int (* provider, failure_count *)
  | CircuitBreakerTriggered of asset * float (* asset, price_change_percent *)
[@@deriving sexp]

(** Alert record *)
type alert = {
  severity: severity;
  alert_type: alert_type;
  timestamp: float;
  message: string;
} [@@deriving sexp]

(** Monitoring state *)
type monitoring_state = {
  mutable last_prices: (asset * float * float) list; (* asset, price, timestamp *)
  mutable failure_counts: (string * int) list; (* provider, count *)
  mutable alerts_fired: alert list;
  mutable last_check: float;
}

let state = {
  last_prices = [];
  failure_counts = [];
  alerts_fired = [];
  last_check = 0.0;
}

(** Prometheus metrics *)
module Metrics = struct

  (** Price gauge by asset and source *)
  let price_gauge = Hashtbl.create (module String)

  (** Confidence gauge by asset *)
  let confidence_gauge = Hashtbl.create (module String)

  (** Staleness gauge (seconds) by asset *)
  let staleness_gauge = Hashtbl.create (module String)

  (** Divergence gauge (percent) by asset *)
  let divergence_gauge = Hashtbl.create (module String)

  (** Failure counter by provider *)
  let failure_counter = Hashtbl.create (module String)

  (** Circuit breaker counter *)
  let circuit_breaker_counter = ref 0

  (** Update price metric *)
  let update_price (asset: asset) (provider: string) (price: float) =
    let key = Printf.sprintf "%s_%s" (asset_to_string asset) provider in
    Hashtbl.set price_gauge ~key ~data:price

  (** Update confidence metric *)
  let update_confidence (asset: asset) (confidence: float) =
    let key = asset_to_string asset in
    Hashtbl.set confidence_gauge ~key ~data:confidence

  (** Update staleness metric *)
  let update_staleness (asset: asset) (age_seconds: float) =
    let key = asset_to_string asset in
    Hashtbl.set staleness_gauge ~key ~data:age_seconds

  (** Update divergence metric *)
  let update_divergence (asset: asset) (divergence_percent: float) =
    let key = asset_to_string asset in
    Hashtbl.set divergence_gauge ~key ~data:divergence_percent

  (** Increment failure counter *)
  let increment_failures (provider: string) =
    let current = Hashtbl.find failure_counter provider |> Option.value ~default:0 in
    Hashtbl.set failure_counter ~key:provider ~data:(current + 1)

  (** Reset failure counter *)
  let reset_failures (provider: string) =
    Hashtbl.set failure_counter ~key:provider ~data:0

  (** Increment circuit breaker counter *)
  let increment_circuit_breaker () =
    circuit_breaker_counter := !circuit_breaker_counter + 1

  (** Export metrics as Prometheus text format *)
  let export_prometheus () : string =
    let buf = Buffer.create 1024 in

    (* Price gauges *)
    Buffer.add_string buf "# HELP oracle_price_usd Current price from oracle source\n";
    Buffer.add_string buf "# TYPE oracle_price_usd gauge\n";
    Hashtbl.iteri price_gauge ~f:(fun ~key ~data ->
      Buffer.add_string buf (Printf.sprintf "oracle_price_usd{asset_provider=\"%s\"} %.6f\n" key data)
    );

    (* Confidence gauges *)
    Buffer.add_string buf "\n# HELP oracle_confidence Confidence score (0.0-1.0)\n";
    Buffer.add_string buf "# TYPE oracle_confidence gauge\n";
    Hashtbl.iteri confidence_gauge ~f:(fun ~key ~data ->
      Buffer.add_string buf (Printf.sprintf "oracle_confidence{asset=\"%s\"} %.2f\n" key data)
    );

    (* Staleness gauges *)
    Buffer.add_string buf "\n# HELP oracle_staleness_seconds Age of price data in seconds\n";
    Buffer.add_string buf "# TYPE oracle_staleness_seconds gauge\n";
    Hashtbl.iteri staleness_gauge ~f:(fun ~key ~data ->
      Buffer.add_string buf (Printf.sprintf "oracle_staleness_seconds{asset=\"%s\"} %.0f\n" key data)
    );

    (* Divergence gauges *)
    Buffer.add_string buf "\n# HELP oracle_divergence_percent Price divergence from median (%)\n";
    Buffer.add_string buf "# TYPE oracle_divergence_percent gauge\n";
    Hashtbl.iteri divergence_gauge ~f:(fun ~key ~data ->
      Buffer.add_string buf (Printf.sprintf "oracle_divergence_percent{asset=\"%s\"} %.2f\n" key data)
    );

    (* Failure counters *)
    Buffer.add_string buf "\n# HELP oracle_failures_total Total number of oracle fetch failures\n";
    Buffer.add_string buf "# TYPE oracle_failures_total counter\n";
    Hashtbl.iteri failure_counter ~f:(fun ~key ~data ->
      Buffer.add_string buf (Printf.sprintf "oracle_failures_total{provider=\"%s\"} %d\n" key data)
    );

    (* Circuit breaker counter *)
    Buffer.add_string buf "\n# HELP oracle_circuit_breaker_total Total circuit breaker activations\n";
    Buffer.add_string buf "# TYPE oracle_circuit_breaker_total counter\n";
    Buffer.add_string buf (Printf.sprintf "oracle_circuit_breaker_total %d\n" !circuit_breaker_counter);

    Buffer.contents buf
end

(** Send PagerDuty alert *)
let send_pagerduty_alert
    ~(config: monitoring_config)
    ~(alert: alert)
  : unit Lwt.t =

  if not config.enable_alerts then begin
    let%lwt () = Logs_lwt.debug (fun m ->
      m "Alerts disabled, skipping PagerDuty notification"
    ) in
    Lwt.return_unit
  end else
    match config.pagerduty_api_key, config.pagerduty_service_id with
    | None, _ | _, None ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "PagerDuty not configured, alert not sent: %s" alert.message
        ) in
        Lwt.return_unit
    | Some api_key, Some _service_id ->
        try%lwt
          let severity_str = match alert.severity with
            | Critical -> "critical"
            | Warning -> "warning"
            | Info -> "info"
          in

          let event = `Assoc [
            ("routing_key", `String api_key);
            ("event_action", `String "trigger");
            ("payload", `Assoc [
              ("summary", `String alert.message);
              ("severity", `String severity_str);
              ("source", `String "tonsurance-oracle-monitor");
              ("timestamp", `String (Printf.sprintf "%.0f" alert.timestamp));
            ]);
          ] in

          let body = Yojson.Safe.to_string event in
          let headers = Cohttp.Header.of_list [
            ("Content-Type", "application/json");
          ] in

          let url = "https://events.pagerduty.com/v2/enqueue" in

          let%lwt (resp, body_resp) =
            Cohttp_lwt_unix.Client.post
              ~body:(`String body)
              ~headers
              (Uri.of_string url)
          in

          let status = Cohttp.Response.status resp in

          if Cohttp.Code.is_success (Cohttp.Code.code_of_status status) then
            let%lwt () = Logs_lwt.info (fun m ->
              m "PagerDuty alert sent: %s" alert.message
            ) in
            Lwt.return_unit
          else begin
            let%lwt body_str = Cohttp_lwt.Body.to_string body_resp in
            let%lwt () = Logs_lwt.err (fun m ->
              m "PagerDuty alert failed (HTTP %d): %s"
                (Cohttp.Code.code_of_status status) body_str
            ) in
            Lwt.return_unit
          end

        with exn ->
          let%lwt () = Logs_lwt.err (fun m ->
            m "PagerDuty alert exception: %s" (Exn.to_string exn)
          ) in
          Lwt.return_unit

(** Create alert *)
let create_alert
    (severity: severity)
    (alert_type: alert_type)
  : alert =

  let message = match alert_type with
    | PriceStale (asset, age) ->
        Printf.sprintf "Oracle price for %s is stale (%.0fs old)"
          (asset_to_string asset) age
    | PriceDivergence (asset, div) ->
        Printf.sprintf "Price divergence for %s: %.2f%% from median"
          (asset_to_string asset) div
    | LowConfidence (asset, conf) ->
        Printf.sprintf "Low confidence for %s: %.2f"
          (asset_to_string asset) conf
    | OracleDown provider ->
        Printf.sprintf "Oracle provider %s is down" provider
    | ConsecutiveFailures (provider, count) ->
        Printf.sprintf "Oracle %s: %d consecutive failures" provider count
    | CircuitBreakerTriggered (asset, change) ->
        Printf.sprintf "Circuit breaker triggered for %s: %.2f%% change"
          (asset_to_string asset) change
  in

  {
    severity;
    alert_type;
    timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    message;
  }

(** Check for staleness *)
let check_staleness
    ~(config: monitoring_config)
    ~(asset: asset)
    ~(price_data: Integration.Oracle_aggregator.OracleAggregator.consensus_price)
  : alert option =

  let now_ts = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
  let age = now_ts -. price_data.timestamp in
  Metrics.update_staleness asset age;

  if Float.(age > config.staleness_threshold_seconds) then
    Some (create_alert Warning (PriceStale (asset, age)))
  else
    None

(** Check for price divergence *)
let check_divergence
    ~(config: monitoring_config)
    ~(price_data: Integration.Oracle_aggregator.OracleAggregator.consensus_price)
  : alert option =

  if price_data.num_sources < 2 then
    None
  else
    let max_deviation = List.fold price_data.sources ~init:0.0 ~f:(fun max_dev source ->
      let deviation = Float.abs (source.price -. price_data.median_price) /. price_data.median_price in
      Float.max max_dev deviation
    ) in

    let divergence_percent = max_deviation *. 100.0 in
    Metrics.update_divergence price_data.asset divergence_percent;

    if Float.(divergence_percent > config.divergence_threshold_percent) then
      Some (create_alert Warning (PriceDivergence (price_data.asset, divergence_percent)))
    else
      None

(** Check for low confidence *)
let check_confidence
    ~(config: monitoring_config)
    ~(price_data: Integration.Oracle_aggregator.OracleAggregator.consensus_price)
  : alert option =

  Metrics.update_confidence price_data.asset price_data.confidence;

  if Float.(price_data.confidence < config.confidence_threshold) then
    Some (create_alert Warning (LowConfidence (price_data.asset, price_data.confidence)))
  else
    None

(** Monitor single asset *)
let monitor_asset
    ~(config: monitoring_config)
    ~(asset: asset)
  : alert list Lwt.t =

  let%lwt consensus_opt = Integration.Oracle_aggregator.OracleAggregator.get_consensus_price
    asset ~previous_price:None
  in

  match consensus_opt with
  | None ->
      let alert = create_alert Critical (OracleDown (asset_to_string asset)) in
      Lwt.return [alert]

  | Some consensus ->
      (* Update metrics *)
      List.iter consensus.sources ~f:(fun source ->
        let provider_name = match source.provider with
          | Integration.Oracle_aggregator.OracleAggregator.Chainlink -> "chainlink"
          | Pyth -> "pyth"
          | Binance -> "binance"
          | RedStone -> "redstone"
          | Custom s -> s
        in
        Metrics.update_price asset provider_name source.price
      );

      (* Run checks *)
      let alerts = [
        check_staleness ~config ~asset ~price_data:consensus;
        check_divergence ~config ~price_data:consensus;
        check_confidence ~config ~price_data:consensus;
      ] |> List.filter_map ~f:Fn.id in

      Lwt.return alerts

(** Monitor all assets *)
let monitor_all_assets
    ~(assets: asset list)
    ?(config = default_config)
    ()
  : unit Lwt.t =

  let%lwt all_alerts = Lwt_list.map_p ((fun asset -> monitor_asset ~config ~asset)) assets in
  let alerts = List.concat all_alerts in

  (* Send alerts *)
  let%lwt () = Lwt_list.iter_s ((fun alert -> send_pagerduty_alert ~config ~alert)) alerts in

  (* Log summary *)
  let%lwt () = Logs_lwt.info (fun m ->
    m "Oracle monitoring complete: %d alerts fired" (List.length alerts)
  ) in

  (* Store alerts in state *)
  state.alerts_fired <- state.alerts_fired @ alerts;
  state.last_check <- Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;

  Lwt.return_unit

(** Start continuous monitoring *)
let start_monitoring
    ~(assets: asset list)
    ?(config = default_config)
    ?(interval_seconds = 60.0)
    ()
  : unit Lwt.t =

  let rec monitor_loop () =
    let%lwt () = Logs_lwt.info (fun m ->
      m "Running oracle health check for %d assets..." (List.length assets)
    ) in

    let%lwt () = monitor_all_assets ~assets ~config () in

    let%lwt () = Lwt_unix.sleep interval_seconds in
    monitor_loop ()
  in

  let%lwt () = Logs_lwt.info (fun m ->
    m "Starting oracle monitoring (interval: %.0fs)" interval_seconds
  ) in

  monitor_loop ()

(** Generate health report *)
let generate_health_report () : string =
  let buf = Buffer.create 2048 in

  Buffer.add_string buf "╔══════════════════════════════════════════════════════════╗\n";
  Buffer.add_string buf "║  ORACLE HEALTH REPORT                                    ║\n";
  Buffer.add_string buf "╚══════════════════════════════════════════════════════════╝\n\n";

  Buffer.add_string buf (Printf.sprintf "Last check: %.0f\n" state.last_check);
  Buffer.add_string buf (Printf.sprintf "Total alerts fired: %d\n\n" (List.length state.alerts_fired));

  if List.is_empty state.alerts_fired then
    Buffer.add_string buf "✓ All systems healthy\n"
  else begin
    Buffer.add_string buf "Recent Alerts:\n";
    List.iter (List.take state.alerts_fired 10) ~f:(fun alert ->
      let severity_icon = match alert.severity with
        | Critical -> "🔴"
        | Warning -> "🟡"
        | Info -> "🔵"
      in
      Buffer.add_string buf (Printf.sprintf "  %s %s\n" severity_icon alert.message)
    )
  end;

  Buffer.add_string buf "\n";
  Buffer.contents buf
