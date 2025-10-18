(** WebSocket Server v2 for Real-Time Updates
 *
 * Provides real-time streaming of:
 * - bridge_health: Bridge security status changes
 * - risk_alerts: Critical risk threshold breaches
 * - top_products: Top 10 product ranking changes
 * - tranche_apy: APY updates every 60 seconds
 *
 * Architecture: Dream WebSocket with channel-based subscriptions
 * Authentication: JWT token validation (optional)
 *)

open Core
open Lwt.Syntax
open Types

(** WebSocket client state *)
type client_state = {
  client_id: string;
  websocket: Dream.websocket;
  subscribed_channels: string list;
  connected_at: float;
  mutable last_ping: float;
}

(** Server state *)
type websocket_server_state = {
  mutable clients: client_state list;
  mutable bridge_states: Bridge_monitor.bridge_health list;
  mutable last_risk_snapshot: Unified_risk_monitor.UnifiedRiskMonitor.risk_snapshot option;
  collateral_manager: Collateral_manager.CollateralManager.t ref;
}

(** Generate unique client ID *)
let generate_client_id () =
  Printf.sprintf "client_%s_%f"
    (Digest.string (string_of_float (Unix.time ())) |> Digest.to_hex |> String.prefix 8)
    (Unix.time ())

(** Parse subscription message *)
let parse_subscribe_message msg =
  try
    let json = Yojson.Safe.from_string msg in
    let open Yojson.Safe.Util in
    let action = json |> member "action" |> to_string in
    let channel = json |> member "channel" |> to_string in
    Ok (action, channel)
  with _ ->
    Error "Invalid subscription message format"

(** Validate channel name *)
let is_valid_channel channel =
  List.mem ~equal:String.equal
    ["bridge_health"; "risk_alerts"; "top_products"; "tranche_apy"]
    channel

(** Broadcast message to all clients subscribed to channel *)
let broadcast_to_channel state channel message =
  let msg_json = Yojson.Safe.to_string message in

  let subscribed_clients = List.filter state.clients ~f:(fun client ->
    List.mem ~equal:String.equal client.subscribed_channels channel
  ) in

  Lwt_list.iter_p (fun client ->
    try%lwt
      Dream.send client.websocket msg_json
    with _ ->
      (* Client disconnected, remove from list *)
      state.clients <- List.filter state.clients ~f:(fun c ->
        not (String.equal c.client_id client.client_id)
      );
      Lwt.return_unit
  ) subscribed_clients

(** Handle client messages *)
let handle_client_message state client msg =
  match parse_subscribe_message msg with
  | Error err ->
      let error_msg = `Assoc [
        ("type", `String "error");
        ("message", `String err);
        ("timestamp", `Float (Unix.time ()));
      ] in
      Dream.send client.websocket (Yojson.Safe.to_string error_msg)

  | Ok ("subscribe", channel) ->
      if is_valid_channel channel then (
        (* Add channel to client's subscriptions *)
        let updated_client = {
          client with
          subscribed_channels = channel :: client.subscribed_channels
        } in

        state.clients <- List.map state.clients ~f:(fun c ->
          if String.equal c.client_id client.client_id then updated_client else c
        );

        (* Send confirmation *)
        let confirm_msg = `Assoc [
          ("type", `String "subscribed");
          ("channel", `String channel);
          ("timestamp", `Float (Unix.time ()));
        ] in
        Dream.send client.websocket (Yojson.Safe.to_string confirm_msg)
      ) else (
        let error_msg = `Assoc [
          ("type", `String "error");
          ("message", `String (Printf.sprintf "Invalid channel: %s" channel));
          ("valid_channels", `List [
            `String "bridge_health";
            `String "risk_alerts";
            `String "top_products";
            `String "tranche_apy";
          ]);
          ("timestamp", `Float (Unix.time ()));
        ] in
        Dream.send client.websocket (Yojson.Safe.to_string error_msg)
      )

  | Ok ("unsubscribe", channel) ->
      (* Remove channel from client's subscriptions *)
      let updated_client = {
        client with
        subscribed_channels = List.filter client.subscribed_channels
          ~f:(fun ch -> not (String.equal ch channel))
      } in

      state.clients <- List.map state.clients ~f:(fun c ->
        if String.equal c.client_id client.client_id then updated_client else c
      );

      (* Send confirmation *)
      let confirm_msg = `Assoc [
        ("type", `String "unsubscribed");
        ("channel", `String channel);
        ("timestamp", `Float (Unix.time ()));
      ] in
      Dream.send client.websocket (Yojson.Safe.to_string confirm_msg)

  | Ok ("ping", _) ->
      (* Update last ping time *)
      List.iter state.clients ~f:(fun c ->
        if String.equal c.client_id client.client_id then
          c.last_ping <- Unix.time ()
      );

      (* Send pong *)
      let pong_msg = `Assoc [
        ("type", `String "pong");
        ("timestamp", `Float (Unix.time ()));
      ] in
      Dream.send client.websocket (Yojson.Safe.to_string pong_msg)

  | Ok (action, _) ->
      let error_msg = `Assoc [
        ("type", `String "error");
        ("message", `String (Printf.sprintf "Unknown action: %s" action));
        ("timestamp", `Float (Unix.time ()));
      ] in
      Dream.send client.websocket (Yojson.Safe.to_string error_msg)

(** WebSocket connection handler *)
let websocket_handler state websocket =
  let client_id = generate_client_id () in
  let client = {
    client_id;
    websocket;
    subscribed_channels = [];
    connected_at = Unix.time ();
    last_ping = Unix.time ();
  } in

  (* Add client to state *)
  state.clients <- client :: state.clients;

  (* Send welcome message *)
  let welcome_msg = `Assoc [
    ("type", `String "welcome");
    ("client_id", `String client_id);
    ("available_channels", `List [
      `String "bridge_health";
      `String "risk_alerts";
      `String "top_products";
      `String "tranche_apy";
    ]);
    ("timestamp", `Float (Unix.time ()));
  ] in

  let* () = Dream.send websocket (Yojson.Safe.to_string welcome_msg) in

  (* Listen for messages *)
  let rec message_loop () =
    match%lwt Dream.receive websocket with
    | Some msg ->
        let* () = handle_client_message state client msg in
        message_loop ()
    | None ->
        (* Client disconnected *)
        state.clients <- List.filter state.clients ~f:(fun c ->
          not (String.equal c.client_id client.client_id)
        );
        Printf.printf "[WebSocket] Client %s disconnected\n%!" client_id;
        Lwt.return_unit
  in

  Printf.printf "[WebSocket] Client %s connected\n%!" client_id;
  message_loop ()

(** ========================================
 * BACKGROUND BROADCASTING TASKS
 * ========================================
 *)

(** Task 1: Monitor bridge health and broadcast changes *)
let bridge_health_broadcaster state =
  let rec loop prev_states =
    let* () = Lwt_unix.sleep 60.0 in

    (* Monitor all bridges *)
    let* new_states = Bridge_monitor.monitor_all_bridges ~previous_states:prev_states in
    state.bridge_states <- new_states;

    (* Detect changes and broadcast *)
    List.iter new_states ~f:(fun bridge ->
      (* Find previous state *)
      let prev_health = List.find prev_states ~f:(fun (id, _) ->
        String.equal id bridge.bridge_id
      ) in

      match prev_health with
      | None -> () (* New bridge, skip *)
      | Some (_, prev) ->
          (* Check for health score changes *)
          if Float.abs (bridge.health_score -. prev.health_score) > 0.05 then (
            let msg = `Assoc [
              ("channel", `String "bridge_health");
              ("type", `String "health_change");
              ("bridge_id", `String bridge.bridge_id);
              ("previous_score", `Float prev.health_score);
              ("current_score", `Float bridge.health_score);
              ("exploit_detected", `Bool bridge.exploit_detected);
              ("timestamp", `Float (Unix.time ()));
            ] in

            Lwt.async (fun () -> broadcast_to_channel state "bridge_health" msg)
          );

          (* Broadcast new critical alerts *)
          List.iter bridge.alerts ~f:(fun alert ->
            if not alert.resolved && Poly.equal alert.severity Bridge_monitor.Critical then (
              let msg = `Assoc [
                ("channel", `String "bridge_health");
                ("type", `String "critical_alert");
                ("bridge_id", `String bridge.bridge_id);
                ("alert_id", `String alert.alert_id);
                ("message", `String alert.message);
                ("severity", `String "Critical");
                ("timestamp", `Float alert.timestamp);
              ] in

              Lwt.async (fun () -> broadcast_to_channel state "bridge_health" msg)
            )
          );
    );

    let state_map = List.map new_states ~f:(fun h -> (h.bridge_id, h)) in
    loop state_map
  in

  loop []

(** Task 2: Monitor risk alerts and broadcast *)
let risk_alerts_broadcaster state =
  let rec loop prev_snapshot =
    let* () = Lwt_unix.sleep 60.0 in

    (* Calculate new risk snapshot *)
    let new_snapshot = Unified_risk_monitor.UnifiedRiskMonitor.calculate_risk_snapshot
      !(state.collateral_manager)
      ~config:Unified_risk_monitor.UnifiedRiskMonitor.default_config
      ~price_history_opt:None
    in

    state.last_risk_snapshot <- Some new_snapshot;

    (* Broadcast critical alerts *)
    List.iter new_snapshot.breach_alerts ~f:(fun alert ->
      (* Check if this is a new alert *)
      let is_new = match prev_snapshot with
        | None -> true
        | Some prev ->
            not (List.exists prev.breach_alerts ~f:(fun prev_alert ->
              Float.abs (prev_alert.timestamp -. alert.timestamp) < 10.0 &&
              String.equal prev_alert.message alert.message
            ))
      in

      if is_new then (
        let severity_str = match alert.severity with
          | `Critical -> "Critical"
          | `High -> "High"
          | `Medium -> "Medium"
          | `Low -> "Low"
        in

        let alert_type_str = match alert.alert_type with
          | Unified_risk_monitor.UnifiedRiskMonitor.LTV_Breach -> "LTV_Breach"
          | Reserve_Low -> "Reserve_Low"
          | Concentration_High -> "Concentration_High"
          | Correlation_Spike -> "Correlation_Spike"
          | Stress_Loss_High -> "Stress_Loss_High"
          | VaR_Breach -> "VaR_Breach"
        in

        let msg = `Assoc [
          ("channel", `String "risk_alerts");
          ("type", `String "new_alert");
          ("alert_type", `String alert_type_str);
          ("severity", `String severity_str);
          ("message", `String alert.message);
          ("current_value", `Float alert.current_value);
          ("limit_value", `Float alert.limit_value);
          ("timestamp", `Float alert.timestamp);
        ] in

        Lwt.async (fun () -> broadcast_to_channel state "risk_alerts" msg)
      )
    );

    loop (Some new_snapshot)
  in

  loop None

(** Task 3: Broadcast top 10 products changes *)
let top_products_broadcaster state =
  let rec loop prev_top10 =
    let* () = Lwt_unix.sleep 120.0 in (* Every 2 minutes *)

    match state.last_risk_snapshot with
    | None -> loop None
    | Some snapshot ->
        let current_top10 = snapshot.top_10_products in

        (* Check if rankings changed *)
        let rankings_changed = match prev_top10 with
          | None -> true
          | Some prev ->
              not (List.equal
                (fun (k1, _, _) (k2, _, _) ->
                  String.equal k1.coverage_type k2.coverage_type &&
                  Poly.equal k1.chain k2.chain &&
                  Poly.equal k1.stablecoin k2.stablecoin
                )
                current_top10
                prev
              )
        in

        if rankings_changed then (
          let top10_json = List.map current_top10 ~f:(fun (product_key, exposure, count) ->
            `Assoc [
              ("coverage_type", `String product_key.coverage_type);
              ("chain", `String (blockchain_to_string product_key.chain));
              ("stablecoin", `String (asset_to_string product_key.stablecoin));
              ("exposure_usd", `Float exposure);
              ("policy_count", `Int count);
            ]
          ) in

          let msg = `Assoc [
            ("channel", `String "top_products");
            ("type", `String "ranking_update");
            ("products", `List top10_json);
            ("timestamp", `Float (Unix.time ()));
          ] in

          let* () = broadcast_to_channel state "top_products" msg in
          loop (Some current_top10)
        ) else
          loop prev_top10
  in

  loop None

(** Task 4: Broadcast tranche APY updates *)
let tranche_apy_broadcaster _state =
  let rec loop () =
    let* () = Lwt_unix.sleep 60.0 in

    (* Fetch all tranche utilizations *)
    let* all_utilizations = Pool.UtilizationTracker.get_all_utilizations () in

    let tranches_json = List.map all_utilizations ~f:(fun util ->
      `Assoc [
        ("tranche_id", `String (tranche_to_string util.tranche_id));
        ("apy", `Float (util.current_apy *. 100.0));
        ("utilization", `Float util.utilization_ratio);
        ("last_updated", `Float util.last_updated);
      ]
    ) in

    let msg = `Assoc [
      ("channel", `String "tranche_apy");
      ("type", `String "apy_update");
      ("tranches", `List tranches_json);
      ("timestamp", `Float (Unix.time ()));
    ] in

    let* () = broadcast_to_channel _state "tranche_apy" msg in
    loop ()
  in

  loop ()

(** Task 5: Heartbeat/ping disconnected clients *)
let heartbeat_task state =
  let rec loop () =
    let* () = Lwt_unix.sleep 30.0 in

    let now = Unix.time () in

    (* Remove stale clients (no ping in 5 minutes) *)
    let active_clients = List.filter state.clients ~f:(fun client ->
      (now -. client.last_ping) < 300.0
    ) in

    if List.length active_clients < List.length state.clients then (
      Printf.printf "[WebSocket] Removed %d stale clients\n%!"
        (List.length state.clients - List.length active_clients);
      state.clients <- active_clients;
    );

    loop ()
  in

  loop ()

(** ========================================
 * START WEBSOCKET SERVER
 * ========================================
 *)
let start_websocket_server ~collateral_manager () =
  let state = {
    clients = [];
    bridge_states = [];
    last_risk_snapshot = None;
    collateral_manager;
  } in

  (* Start broadcasting tasks *)
  Lwt.async (fun () -> bridge_health_broadcaster state);
  Lwt.async (fun () -> risk_alerts_broadcaster state);
  Lwt.async (fun () -> top_products_broadcaster state);
  Lwt.async (fun () -> tranche_apy_broadcaster state);
  Lwt.async (fun () -> heartbeat_task state);

  Printf.printf "\n╔════════════════════════════════════════╗\n";
  Printf.printf "║  WebSocket Server v2 Started           ║\n";
  Printf.printf "╚════════════════════════════════════════╝\n";
  Printf.printf "\nChannels:\n";
  Printf.printf "  - bridge_health: Bridge security updates\n";
  Printf.printf "  - risk_alerts: Critical risk alerts\n";
  Printf.printf "  - top_products: Top 10 product rankings\n";
  Printf.printf "  - tranche_apy: APY updates (60s interval)\n";
  Printf.printf "\nConnection: ws://localhost:8080/ws\n\n";

  (* Return WebSocket handler *)
  websocket_handler state

(** ========================================
 * EXAMPLE CLIENT USAGE
 * ========================================
 *)

(*
  JavaScript client example:

  const ws = new WebSocket('ws://localhost:8080/ws');

  ws.onopen = () => {
    console.log('Connected to Tonsurance WebSocket');

    // Subscribe to channels
    ws.send(JSON.stringify({
      action: 'subscribe',
      channel: 'bridge_health'
    }));

    ws.send(JSON.stringify({
      action: 'subscribe',
      channel: 'risk_alerts'
    }));

    // Send periodic pings
    setInterval(() => {
      ws.send(JSON.stringify({
        action: 'ping',
        channel: 'heartbeat'
      }));
    }, 30000);
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    console.log('Received:', data);

    switch(data.channel) {
      case 'bridge_health':
        handleBridgeUpdate(data);
        break;
      case 'risk_alerts':
        handleRiskAlert(data);
        break;
      case 'top_products':
        handleProductRanking(data);
        break;
      case 'tranche_apy':
        handleAPYUpdate(data);
        break;
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('WebSocket connection closed');
  };
*)
