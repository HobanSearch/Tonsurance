(** API Server v2 for 560-Product Multi-Dimensional System
 *
 * Exposes comprehensive REST + WebSocket endpoints for:
 * - Multi-dimensional premium quotes (coverage_type × chain × stablecoin)
 * - Risk exposure aggregation (by type, chain, asset)
 * - Bridge health monitoring
 * - Real-time risk alerts
 * - Tranche APY with utilization tracking
 *
 * Architecture: OCaml Dream framework with WebSocket support
 *)

open Core
open Lwt.Syntax
open Lwt.Infix
open Types

(** Server state *)
type server_state = {
  mutable collateral_manager: Pool.Collateral_manager.CollateralManager.t ref;
  mutable bridge_states: Monitoring.Bridge_monitor.bridge_health list;
  mutable last_risk_snapshot: Monitoring.Unified_risk_monitor.UnifiedRiskMonitor.risk_snapshot option;
  mutable websocket_clients: Dream.websocket list;
  pricing_config: Pricing_engine.PricingEngine.pricing_config;
}

(** JSON helpers *)
let json_response ~status json =
  Dream.json ~status (Yojson.Safe.to_string json)

let ok_json json = json_response ~status:`OK json
let bad_request_json json = json_response ~status:`Bad_Request json
let internal_error_json json = json_response ~status:`Internal_Server_Error json

let error_response message =
  bad_request_json (`Assoc [("error", `String message)])

let success_response ?data message =
  let base = [("success", `Bool true); ("message", `String message)] in
  let fields = match data with
    | None -> base
    | Some d -> ("data", d) :: base
  in
  ok_json (`Assoc fields)

(** Parse JSON request body *)
let parse_json_body req =
  Dream.body req >>= fun body ->
  try
    Lwt.return (Ok (Yojson.Safe.from_string body))
  with _ ->
    Lwt.return (Error "Invalid JSON")

(** ========================================
 * ENDPOINT 1: POST /api/v2/quote/multi-dimensional
 * ========================================
 * Calculate premium for 560-product matrix
 *)
let multi_dimensional_quote_handler _state req =
  parse_json_body req >>= function
  | Error err -> error_response err
  | Ok json ->
      try
        let open Yojson.Safe.Util in
        let coverage_type_str = json |> member "coverage_type" |> to_string in
        let chain_str = json |> member "chain" |> to_string in
        let stablecoin_str = json |> member "stablecoin" |> to_string in
        let coverage_amount = json |> member "coverage_amount" |> to_float in
        let duration_days = json |> member "duration_days" |> to_int in

        (* Parse coverage_type *)
        let coverage_type = match coverage_type_of_string coverage_type_str with
          | Ok ct -> ct
          | Error msg -> failwith msg
        in

        (* Parse blockchain *)
        let chain = match blockchain_of_string chain_str with
          | Ok bc -> bc
          | Error msg -> failwith msg
        in

        (* Parse stablecoin *)
        let stablecoin = match asset_of_string stablecoin_str with
          | Ok asset -> asset
          | Error msg -> failwith msg
        in

        (* Get base rate for coverage type *)
        let base_rate = match coverage_type with
          | Depeg -> 0.008 (* 0.8% APR *)
          | Smart_contract -> 0.015 (* 1.5% APR *)
          | Oracle -> 0.012 (* 1.2% APR *)
          | Bridge -> 0.020 (* 2.0% APR *)
          | CEX_liquidation -> 0.025 (* 2.5% APR *)
        in

        (* Chain risk multiplier *)
        let chain_multiplier = match chain with
          | Ethereum -> 1.0
          | Arbitrum -> 1.1
          | Base -> 1.1
          | Polygon -> 1.2
          | Optimism -> 1.1
          | Bitcoin -> 0.9
          | Lightning -> 1.3
          | Solana -> 1.4
          | TON -> 1.0
        in

        (* Stablecoin risk adjustment *)
        let stablecoin_adjustment = match stablecoin with
          | USDC -> 0.0
          | USDT -> 0.0005
          | DAI -> 0.0002
          | FRAX -> 0.0003
          | USDP -> 0.0001
          | BUSD -> 0.0010
          | USDe -> 0.0015
          | SUSDe -> 0.0020
          | USDY -> 0.0008
          | PYUSD -> 0.0005
          | GHO -> 0.0004
          | LUSD -> 0.0003
          | CrvUSD -> 0.0006
          | MkUSD -> 0.0007
          | _ -> 0.0 (* BTC/ETH not stablecoins *)
        in

        (* Total rate *)
        let total_rate = (base_rate *. chain_multiplier) +. stablecoin_adjustment in

        (* Calculate annualized premium *)
        let annual_premium = coverage_amount *. total_rate in
        let premium = annual_premium *. (Float.of_int duration_days /. 365.0) in

        (* Generate product hash *)
        let product_hash = Printf.sprintf "0x%s_%s_%s"
          coverage_type_str
          (blockchain_to_string chain)
          (asset_to_string stablecoin)
          |> Md5.digest_string
          |> Md5.to_hex
        in

        (* Build response *)
        let response = `Assoc [
          ("premium", `Float premium);
          ("breakdown", `Assoc [
            ("base_rate", `Float base_rate);
            ("chain_multiplier", `Float chain_multiplier);
            ("stablecoin_adjustment", `Float stablecoin_adjustment);
            ("total_rate", `Float total_rate);
            ("coverage_amount", `Float coverage_amount);
            ("duration_days", `Int duration_days);
          ]);
          ("product_hash", `String product_hash);
          ("coverage_type", `String coverage_type_str);
          ("chain", `String (blockchain_to_string chain));
          ("stablecoin", `String (asset_to_string stablecoin));
          ("timestamp", `Float (Time_float.now ()
            |> Time_float.to_span_since_epoch
            |> Time_float.Span.to_sec));
        ] in

        ok_json response

      with exn ->
        error_response (Exn.to_string exn)

(** ========================================
 * ENDPOINT 2: GET /api/v2/risk/exposure
 * ========================================
 * Aggregate exposure by coverage_type, chain, and stablecoin
 *)
let risk_exposure_handler state _req =
  try
    let pool = (!(state.collateral_manager)).pool in

    (* Aggregate by coverage_type *)
    let exposure_by_type = Hashtbl.Poly.create () in

    (* Aggregate by chain *)
    let exposure_by_chain = Hashtbl.Poly.create () in

    (* Aggregate by stablecoin *)
    let exposure_by_asset = Hashtbl.Poly.create () in

    (* Process all policies *)
    List.iter pool.active_policies ~f:(fun policy ->
      let exposure_usd = Math.cents_to_usd policy.coverage_amount in

      (* By coverage type *)
      let type_exposure = Hashtbl.find exposure_by_type policy.coverage_type
        |> Option.value ~default:0.0 in
      Hashtbl.set exposure_by_type ~key:policy.coverage_type
        ~data:(type_exposure +. exposure_usd);

      (* By chain *)
      let chain_exposure = Hashtbl.find exposure_by_chain policy.chain
        |> Option.value ~default:0.0 in
      Hashtbl.set exposure_by_chain ~key:policy.chain
        ~data:(chain_exposure +. exposure_usd);

      (* By asset *)
      let asset_exposure = Hashtbl.find exposure_by_asset policy.asset
        |> Option.value ~default:0.0 in
      Hashtbl.set exposure_by_asset ~key:policy.asset
        ~data:(asset_exposure +. exposure_usd);
    );

    (* Convert to JSON *)
    let type_json = Hashtbl.to_alist exposure_by_type
      |> List.map ~f:(fun (ct, exp) ->
        `Assoc [
          ("coverage_type", `String (coverage_type_to_string ct));
          ("exposure_usd", `Float exp);
        ])
    in

    let chain_json = Hashtbl.to_alist exposure_by_chain
      |> List.map ~f:(fun (chain, exp) ->
        `Assoc [
          ("chain", `String (blockchain_to_string chain));
          ("exposure_usd", `Float exp);
        ])
    in

    let asset_json = Hashtbl.to_alist exposure_by_asset
      |> List.map ~f:(fun (asset, exp) ->
        `Assoc [
          ("stablecoin", `String (asset_to_string asset));
          ("exposure_usd", `Float exp);
        ])
    in

    (* Get top 10 products from risk monitor *)
    let top_10_json = match state.last_risk_snapshot with
      | None -> `List []
      | Some snapshot ->
          snapshot.top_10_products
          |> List.map ~f:(fun ((product_key : Monitoring.Unified_risk_monitor.UnifiedRiskMonitor.product_key), exposure, count) ->
            let cov_type = product_key.coverage_type in
            let chain_str = blockchain_to_string product_key.chain in
            let asset_str = asset_to_string product_key.stablecoin in
            `Assoc [
              ("coverage_type", `String cov_type);
              ("chain", `String chain_str);
              ("stablecoin", `String asset_str);
              ("exposure_usd", `Float exposure);
              ("policy_count", `Int count);
            ])
          |> fun lst -> `List lst
    in

    let response = `Assoc [
      ("by_coverage_type", `List type_json);
      ("by_chain", `List chain_json);
      ("by_stablecoin", `List asset_json);
      ("top_10_products", top_10_json);
      ("total_policies", `Int (List.length pool.active_policies));
      ("timestamp", `Float (Time_float.now ()
        |> Time_float.to_span_since_epoch
        |> Time_float.Span.to_sec));
    ] in

    ok_json response

  with exn ->
    error_response (Exn.to_string exn)

(** ========================================
 * ENDPOINT 3: GET /api/v2/bridge-health/:bridge_id
 * ========================================
 * Real-time bridge health score and alerts
 *)
let bridge_health_handler state req =
  try
    let bridge_id = Dream.param req "bridge_id" in

    (* Find bridge in state *)
    let bridge_opt = List.find state.bridge_states ~f:(fun h ->
      String.equal h.bridge_id bridge_id
    ) in

    match bridge_opt with
    | None -> error_response "Bridge not found"
    | Some bridge ->
        (* Calculate TVL change percentage *)
        let tvl_change_pct =
          if Int64.(bridge.previous_tvl_usd = 0L) then 0.0
          else
            let prev = Int64.to_float bridge.previous_tvl_usd in
            let curr = Int64.to_float bridge.current_tvl_usd in
            ((curr -. prev) /. prev) *. 100.0
        in

        (* Map alerts to JSON *)
        let alerts_json = List.map bridge.alerts ~f:(fun alert ->
          let severity_str = match alert.severity with
            | Monitoring.Bridge_monitor.Critical -> "Critical"
            | High -> "High"
            | Medium -> "Medium"
            | Low -> "Low"
          in
          `Assoc [
            ("alert_id", `String alert.alert_id);
            ("severity", `String severity_str);
            ("message", `String alert.message);
            ("timestamp", `Float alert.timestamp);
            ("resolved", `Bool alert.resolved);
          ]
        ) in

        let response = `Assoc [
          ("bridge_id", `String bridge.bridge_id);
          ("source_chain", `String (blockchain_to_string bridge.source_chain));
          ("dest_chain", `String (blockchain_to_string bridge.dest_chain));
          ("health_score", `Float bridge.health_score);
          ("health_status", `String (
            if Float.(bridge.health_score >= 0.9) then "Healthy"
            else if Float.(bridge.health_score >= 0.7) then "Caution"
            else if Float.(bridge.health_score >= 0.5) then "Warning"
            else "Critical"
          ));
          ("tvl_usd", `Float (Int64.to_float bridge.current_tvl_usd /. 100.0));
          ("tvl_change_pct", `Float tvl_change_pct);
          ("exploit_detected", `Bool bridge.exploit_detected);
          ("active_alerts", `List (List.filter alerts_json ~f:(fun a ->
            match Yojson.Safe.Util.member "resolved" a |> Yojson.Safe.Util.to_bool with
            | false -> true
            | true -> false
          )));
          ("last_updated", `Float bridge.last_updated);
          ("oracle_consensus", `Float 0.95); (* TODO: Extract from monitor *)
          ("timestamp", `Float (Time_float.now ()
            |> Time_float.to_span_since_epoch
            |> Time_float.Span.to_sec));
        ] in

        ok_json response

  with exn ->
    error_response (Exn.to_string exn)

(** ========================================
 * ENDPOINT 4: GET /api/v2/risk/alerts
 * ========================================
 * Active risk alerts from unified monitor
 *)
let risk_alerts_handler state req =
  try
    let severity_filter = Dream.query req "severity" in
    let alert_type_filter = Dream.query req "alert_type" in

    match state.last_risk_snapshot with
    | None ->
        ok_json (`Assoc [
          ("alerts", `List []);
          ("message", `String "No risk snapshot available yet");
          ("timestamp", `Float (Time_float.now ()
            |> Time_float.to_span_since_epoch
            |> Time_float.Span.to_sec));
        ])
    | Some snapshot ->
        let all_alerts = snapshot.breach_alerts @ snapshot.warning_alerts in

        (* Filter by severity if provided *)
        let filtered_alerts = match severity_filter with
          | None -> all_alerts
          | Some sev_str ->
              let sev = match String.lowercase sev_str with
                | "critical" -> `Critical
                | "high" -> `High
                | "medium" -> `Medium
                | "low" -> `Low
                | _ -> `Medium
              in
              List.filter all_alerts ~f:(fun alert ->
                Poly.equal alert.severity sev
              )
        in

        (* Filter by alert_type if provided *)
        let filtered_alerts = match alert_type_filter with
          | None -> filtered_alerts
          | Some _ -> filtered_alerts (* TODO: Implement type filtering *)
        in

        (* Convert to JSON *)
        let alerts_json = List.map filtered_alerts ~f:(fun alert ->
          let severity_str = match alert.severity with
            | `Critical -> "Critical"
            | `High -> "High"
            | `Medium -> "Medium"
            | `Low -> "Low"
          in

          let alert_type_str = match alert.alert_type with
            | Monitoring.Unified_risk_monitor.UnifiedRiskMonitor.LTV_Breach -> "LTV_Breach"
            | Reserve_Low -> "Reserve_Low"
            | Concentration_High -> "Concentration_High"
            | Correlation_Spike -> "Correlation_Spike"
            | Stress_Loss_High -> "Stress_Loss_High"
            | VaR_Breach -> "VaR_Breach"
          in

          `Assoc [
            ("alert_type", `String alert_type_str);
            ("severity", `String severity_str);
            ("message", `String alert.message);
            ("current_value", `Float alert.current_value);
            ("limit_value", `Float alert.limit_value);
            ("timestamp", `Float alert.alert_timestamp);
          ]
        ) in

        let response = `Assoc [
          ("alerts", `List alerts_json);
          ("total_alerts", `Int (List.length alerts_json));
          ("critical_count", `Int (List.count alerts_json ~f:(fun a ->
            match Yojson.Safe.Util.member "severity" a |> Yojson.Safe.Util.to_string with
            | "Critical" -> true
            | _ -> false
          )));
          ("timestamp", `Float (Time_float.now ()
            |> Time_float.to_span_since_epoch
            |> Time_float.Span.to_sec));
        ] in

        ok_json response

  with exn ->
    error_response (Exn.to_string exn)

(** ========================================
 * ENDPOINT 5: GET /api/v2/tranches/apy
 * ========================================
 * Real-time APY for all 6 tranches with utilization
 *)
let tranches_apy_handler _state _req =
  try
    let* all_utilizations = Pool.Utilization_tracker.UtilizationTracker.get_all_utilizations () in

    let tranches_json = List.map all_utilizations ~f:(fun util ->
      let* available_capacity = Pool.Utilization_tracker.UtilizationTracker.get_available_capacity
        ~tranche:util.tranche_id in

      Lwt.return (`Assoc [
        ("tranche_id", `String util.tranche_id);
        ("apy", `Float (util.current_apy *. 100.0)); (* Convert to percentage *)
        ("utilization", `Float util.utilization_ratio);
        ("total_capital_ton", `Float (Int64.to_float util.total_capital /. 1_000_000_000.0));
        ("coverage_sold_ton", `Float (Int64.to_float util.coverage_sold /. 1_000_000_000.0));
        ("available_capacity_ton", `Float (Int64.to_float available_capacity /. 1_000_000_000.0));
        ("last_updated", `Float util.last_updated);
      ])
    ) in

    let* tranches_list = Lwt_list.map_s (fun x -> x) tranches_json in

    let response = `Assoc [
      ("tranches", `List tranches_list);
      ("timestamp", `Float (Time_float.now ()
        |> Time_float.to_span_since_epoch
        |> Time_float.Span.to_sec));
    ] in

    ok_json response

  with exn ->
    error_response (Exn.to_string exn)

(** ========================================
 * HEALTH CHECK ENDPOINT
 * ========================================
 *)
let health_handler _req =
  ok_json (`Assoc [
    ("status", `String "healthy");
    ("service", `String "tonsurance-api-v2");
    ("version", `String "2.0.0");
    ("timestamp", `Float (Time_float.now ()
      |> Time_float.to_span_since_epoch
      |> Time_float.Span.to_sec));
  ])

(** ========================================
 * ROUTER SETUP
 * ========================================
 *)
let router state _ton_config = [
  Dream.get "/health" health_handler;

  (* v2 GET endpoints *)
  Dream.post "/api/v2/quote/multi-dimensional"
    (multi_dimensional_quote_handler state);

  Dream.get "/api/v2/risk/exposure"
    (risk_exposure_handler state);

  Dream.get "/api/v2/bridge-health/:bridge_id"
    (bridge_health_handler state);

  Dream.get "/api/v2/risk/alerts"
    (risk_alerts_handler state);

  Dream.get "/api/v2/tranches/apy"
    (tranches_apy_handler state);
] @ Escrow_api.routes
  @ Transactional_api.routes state.collateral_manager
  @ Hedging_api.routes state

(** ========================================
 * BACKGROUND MONITORING TASKS
 * ========================================
 *)
let start_monitoring_tasks state =
  (* Task 1: Update bridge states every 60 seconds *)
  let bridge_monitor_task () =
    let rec loop prev_states =
      let* () = Lwt_unix.sleep 60.0 in
      let* new_states = Monitoring.Bridge_monitor.monitor_all_bridges ~previous_states:prev_states in
      state.bridge_states <- new_states;

      (* Broadcast bridge health updates via WebSocket *)
      let critical_alerts = Monitoring.Bridge_monitor.get_critical_alerts ~states:new_states in
      List.iter critical_alerts ~f:(fun alert ->
        let msg = Yojson.Safe.to_string (`Assoc [
          ("channel", `String "bridge_health");
          ("alert", `String alert.message);
          ("severity", `String "Critical");
          ("timestamp", `Float (Time_float.now ()
            |> Time_float.to_span_since_epoch
            |> Time_float.Span.to_sec));
        ]) in
        List.iter state.websocket_clients ~f:(fun ws ->
          Lwt.async (fun () -> Dream.send ws msg)
        )
      );

      let state_map = List.map new_states ~f:(fun h -> (h.bridge_id, h)) in
      loop state_map
    in
    loop []
  in

  (* Task 2: Update risk snapshot every 60 seconds *)
  (* TODO: Re-enable when db_pool is available in server_state *)
  let risk_monitor_task () =
    let rec loop () =
      let* () = Lwt_unix.sleep 60.0 in

      (* Calculate risk snapshot - DISABLED: requires db_pool *)
      (* let snapshot = Monitoring.Unified_risk_monitor.UnifiedRiskMonitor.calculate_risk_snapshot
        db_pool
        !(state.collateral_manager)
        ~config:Monitoring.Unified_risk_monitor.UnifiedRiskMonitor.default_config
        ~price_history_opt:None
      in
      state.last_risk_snapshot <- Some snapshot; *)

      (* Broadcast risk alerts via WebSocket - DISABLED *)
      (* if not (List.is_empty snapshot.breach_alerts) then (
        let msg = Yojson.Safe.to_string (`Assoc [
          ("channel", `String "risk_alerts");
          ("alerts", `Int (List.length snapshot.breach_alerts));
          ("severity", `String "Critical");
          ("timestamp", `Float (Time_float.now ()
            |> Time_float.to_span_since_epoch
            |> Time_float.Span.to_sec));
        ]) in
        List.iter state.websocket_clients ~f:(fun ws ->
          Lwt.async (fun () -> Dream.send ws msg)
        )
      ); *)

      loop ()
    in
    loop ()
  in

  (* Task 3: Broadcast APY updates every 60 seconds *)
  let apy_broadcast_task () =
    let rec loop () =
      let* () = Lwt_unix.sleep 60.0 in

      let msg = Yojson.Safe.to_string (`Assoc [
        ("channel", `String "tranche_apy");
        ("message", `String "APY updated");
        ("timestamp", `Float (Time_float.now ()
        |> Time_float.to_span_since_epoch
        |> Time_float.Span.to_sec));
      ]) in

      List.iter state.websocket_clients ~f:(fun ws ->
        Lwt.async (fun () -> Dream.send ws msg)
      );

      loop ()
    in
    loop ()
  in

  (* Start all tasks *)
  Lwt.async bridge_monitor_task;
  Lwt.async risk_monitor_task;
  Lwt.async apy_broadcast_task;

  Lwt.return_unit

(** ========================================
 * START SERVER
 * ========================================
 *)
let start_server ?(port = 8080) ~collateral_manager ~ton_config () =
  let state = {
    collateral_manager;
    bridge_states = [];
    last_risk_snapshot = None;
    websocket_clients = [];
    pricing_config = Pricing_engine.PricingEngine.default_config;
  } in

  (* Start background monitoring *)
  Lwt.async (fun () -> start_monitoring_tasks state);

  Printf.printf "\n╔════════════════════════════════════════╗\n";
  Printf.printf "║  Tonsurance API v2 Server Started     ║\n";
  Printf.printf "╚════════════════════════════════════════╝\n";
  Printf.printf "Port: %d\n" port;
  Printf.printf "Base URL: http://localhost:%d\n" port;
  Printf.printf "\nRead-Only Endpoints:\n";
  Printf.printf "  POST /api/v2/quote/multi-dimensional\n";
  Printf.printf "  GET  /api/v2/risk/exposure\n";
  Printf.printf "  GET  /api/v2/bridge-health/:bridge_id\n";
  Printf.printf "  GET  /api/v2/risk/alerts\n";
  Printf.printf "  GET  /api/v2/tranches/apy\n";
  Printf.printf "  GET  /api/v2/hedging/swing-quote (Phase 4 Hedged Insurance)\n";
  Printf.printf "  GET  /api/v2/hedging/policy/:policy_id/status\n";
  Printf.printf "\nTransactional Endpoints:\n";
  Printf.printf "  POST /api/v2/policies (Buy Policy)\n";
  Printf.printf "  POST /api/v2/claims (File Claim)\n";
  Printf.printf "  POST /api/v2/vault/deposit\n";
  Printf.printf "  POST /api/v2/vault/withdraw\n";
  Printf.printf "  GET  /api/v2/transactions/:tx_hash (Poll Status)\n";
  Printf.printf "\n  Rate Limits:\n";
  Printf.printf "    - 100 requests/minute per IP\n";
  Printf.printf "    - 20 transactions/hour per user\n";
  Printf.printf "  WS   /ws (WebSocket connection)\n\n";

  Dream.run ~port
    @@ Dream.logger
    @@ Dream.router (router state ton_config)
