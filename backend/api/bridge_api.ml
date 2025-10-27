(** Bridge API Module
 *
 * REST API endpoints for cross-chain bridge operations:
 * - Route discovery (find optimal bridge routes)
 * - Transaction initiation (execute bridge transfers)
 * - Status tracking (monitor transaction progress)
 * - Transaction history (list user's bridge transfers)
 * - Health monitoring (bridge provider health checks)
 * - Fee estimation (calculate bridge costs)
 *
 * Integrates with Phase 4 bridge infrastructure (Rubic aggregator).
 *)

open Core
open Lwt.Syntax
open Lwt.Infix
open Types

(** Bridge API state *)
type bridge_api_state = {
  db_pool: Db.Bridge_db.BridgeDb.pool;
  mutable bridge_health: Monitoring.Bridge_monitor.bridge_health list;
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
 * ENDPOINT 1: POST /api/bridge/routes/discover
 * ========================================
 * Discover optimal bridge routes between chains
 *
 * Request:
 * {
 *   "source_chain": "TON",
 *   "dest_chain": "Ethereum",
 *   "asset": "USDT",
 *   "amount": 10000.0,
 *   "min_security_score": 0.8
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "routes": [
 *     {
 *       "bridge_provider": "Symbiosis",
 *       "security_score": 0.92,
 *       "estimated_time_seconds": 180,
 *       "total_cost_usd": 12.50,
 *       "cost_percent": 0.125,
 *       "recommended": true
 *     }
 *   ]
 * }
 *)
let discover_routes_handler state req =
  parse_json_body req >>= function
  | Error err -> Lwt.return (error_response err)
  | Ok json ->
      try
        let open Yojson.Safe.Util in
        let source_chain = json |> member "source_chain" |> to_string in
        let dest_chain = json |> member "dest_chain" |> to_string in
        let asset = json |> member "asset" |> to_string in
        let amount = json |> member "amount" |> to_float in
        let min_security_score =
          json |> member "min_security_score" |> to_float_option
          |> Option.value ~default:0.8
        in

        (* Get best routes from database *)
        let%lwt routes_result = Db.Bridge_db.BridgeDb.get_best_routes
          ~pool:state.db_pool
          ~source_chain
          ~dest_chain
          ~asset
          ~limit:5
        in

        match routes_result with
        | Error err ->
            Lwt.return (internal_error_json (`Assoc [
              ("error", `String (Db.Bridge_db.BridgeDb.error_to_string err))
            ]))
        | Ok routes ->
            (* Filter by security score and format response *)
            let filtered_routes = List.filter routes ~f:(fun route ->
              Float.(route.security_score >= min_security_score)
            ) in

            let routes_json = List.map filtered_routes ~f:(fun route ->
              `Assoc [
                ("bridge_provider", `String route.bridge_provider);
                ("security_score", `Float route.security_score);
                ("estimated_time_seconds", `Int route.estimated_time_seconds);
                ("cost_percent", `Float route.cost_percent_of_amount);
                ("total_cost_usd", `Float (amount *. route.cost_percent_of_amount /. 100.0));
                ("recommended", `Bool route.recommended);
                ("min_amount", `Float (Option.value route.min_amount ~default:0.0));
                ("max_amount", `Float (Option.value route.max_amount ~default:Float.infinity));
              ]
            ) in

            Lwt.return (ok_json (`Assoc [
              ("success", `Bool true);
              ("routes", `List routes_json);
              ("source_chain", `String source_chain);
              ("dest_chain", `String dest_chain);
              ("asset", `String asset);
              ("amount", `Float amount);
            ]))

      with exn ->
        Lwt.return (error_response (Exn.to_string exn))

(** ========================================
 * ENDPOINT 2: POST /api/bridge/execute
 * ========================================
 * Initiate bridge transaction
 *
 * Request:
 * {
 *   "user_address": "0x...",
 *   "from_wallet": "0x...",
 *   "to_wallet": "0x...",
 *   "source_chain": "TON",
 *   "dest_chain": "Ethereum",
 *   "asset": "USDT",
 *   "amount": 10000.0,
 *   "bridge_provider": "Symbiosis",
 *   "slippage_tolerance": 0.5
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "transaction_id": 123,
 *   "status": "pending",
 *   "estimated_completion": "2024-02-01T12:05:00Z"
 * }
 *)
let execute_bridge_handler state req =
  parse_json_body req >>= function
  | Error err -> Lwt.return (error_response err)
  | Ok json ->
      try
        let open Yojson.Safe.Util in
        let user_address = json |> member "user_address" |> to_string_option in
        let from_wallet = json |> member "from_wallet" |> to_string in
        let to_wallet = json |> member "to_wallet" |> to_string_option in
        let source_chain = json |> member "source_chain" |> to_string in
        let dest_chain = json |> member "dest_chain" |> to_string in
        let asset = json |> member "asset" |> to_string in
        let amount = json |> member "amount" |> to_float in
        let bridge_provider = json |> member "bridge_provider" |> to_string in
        let slippage_tolerance =
          json |> member "slippage_tolerance" |> to_float_option
          |> Option.value ~default:0.5
        in

        (* Create bridge transaction record *)
        let tx: Db.Bridge_db.BridgeDb.bridge_transaction = {
          id = None;
          user_address;
          from_wallet_address = from_wallet;
          to_wallet_address = to_wallet;
          source_chain;
          dest_chain;
          asset;
          source_amount = amount;
          dest_amount = None;
          dest_amount_min = amount *. (1.0 -. slippage_tolerance /. 100.0);
          gas_fee_usd = None;
          bridge_fee_usd = None;
          protocol_fee_usd = None;
          total_fee_usd = None;
          price_impact_percent = None;
          slippage_tolerance_percent = Some slippage_tolerance;
          bridge_provider;
          bridge_type = None;
          quote_id = None;
          source_tx_hash = None;
          dest_tx_hash = None;
          transaction_status = "pending";
          failure_reason = None;
          started_at = 1706745600.0; (* TODO: Use actual timestamp in production *)
          completed_at = None;
          estimated_arrival_time = Some 1706745900.0; (* +5 minutes *)
          actual_duration_seconds = None;
          estimated_duration_seconds = Some 300;
          security_score = None;
          tvl_usd = None;
          route_details = None;
          purpose = Some "user_bridge";
          related_policy_id = None;
          related_hedge_position_id = None;
        } in

        (* Insert transaction into database *)
        let%lwt tx_result = Db.Bridge_db.BridgeDb.insert_bridge_transaction
          ~pool:state.db_pool
          ~tx
        in

        match tx_result with
        | Error err ->
            Lwt.return (internal_error_json (`Assoc [
              ("error", `String (Db.Bridge_db.BridgeDb.error_to_string err))
            ]))
        | Ok transaction_id ->
            (* TODO: Trigger actual bridge execution via keeper *)

            Lwt.return (ok_json (`Assoc [
              ("success", `Bool true);
              ("transaction_id", `Int transaction_id);
              ("status", `String "pending");
              ("message", `String "Bridge transaction initiated. Execution will begin shortly.");
            ]))

      with exn ->
        Lwt.return (error_response (Exn.to_string exn))

(** ========================================
 * ENDPOINT 3: GET /api/bridge/status/:id
 * ========================================
 * Get bridge transaction status
 *
 * Response:
 * {
 *   "success": true,
 *   "transaction": {
 *     "id": 123,
 *     "status": "pending",
 *     "source_chain": "TON",
 *     "dest_chain": "Ethereum",
 *     "asset": "USDT",
 *     "source_amount": 10000.0,
 *     "bridge_provider": "Symbiosis",
 *     "started_at": 1706745600.0,
 *     "elapsed_seconds": 45
 *   }
 * }
 *)
let get_status_handler state req =
  let transaction_id = Dream.param req "id" |> Int.of_string in

  let%lwt tx_result = Db.Bridge_db.BridgeDb.get_transaction
    ~pool:state.db_pool
    ~transaction_id
  in

  match tx_result with
  | Error err ->
      Lwt.return (internal_error_json (`Assoc [
        ("error", `String (Db.Bridge_db.BridgeDb.error_to_string err))
      ]))
  | Ok tx ->
      let elapsed = 1706745600.0 -. tx.started_at in (* TODO: Use actual current time *)

      Lwt.return (ok_json (`Assoc [
        ("success", `Bool true);
        ("transaction", `Assoc [
          ("id", `Int (Option.value_exn tx.id));
          ("status", `String tx.transaction_status);
          ("source_chain", `String tx.source_chain);
          ("dest_chain", `String tx.dest_chain);
          ("asset", `String tx.asset);
          ("source_amount", `Float tx.source_amount);
          ("dest_amount", match tx.dest_amount with Some a -> `Float a | None -> `Null);
          ("bridge_provider", `String tx.bridge_provider);
          ("source_tx_hash", match tx.source_tx_hash with Some h -> `String h | None -> `Null);
          ("dest_tx_hash", match tx.dest_tx_hash with Some h -> `String h | None -> `Null);
          ("started_at", `Float tx.started_at);
          ("elapsed_seconds", `Float elapsed);
          ("failure_reason", match tx.failure_reason with Some r -> `String r | None -> `Null);
        ]);
      ]))

(** ========================================
 * ENDPOINT 4: GET /api/bridge/transactions/:address
 * ========================================
 * Get user's bridge transaction history
 *
 * Response:
 * {
 *   "success": true,
 *   "transactions": [ ... ]
 * }
 *)
let get_user_transactions_handler state req =
  let user_address = Dream.param req "address" in

  let%lwt txs_result = Db.Bridge_db.BridgeDb.get_pending_transactions
    ~pool:state.db_pool
    ~user_address
  in

  match txs_result with
  | Error err ->
      Lwt.return (internal_error_json (`Assoc [
        ("error", `String (Db.Bridge_db.BridgeDb.error_to_string err))
      ]))
  | Ok transactions ->
      let txs_json = List.map transactions ~f:(fun tx ->
        `Assoc [
          ("id", `Int (Option.value_exn tx.id));
          ("status", `String tx.transaction_status);
          ("source_chain", `String tx.source_chain);
          ("dest_chain", `String tx.dest_chain);
          ("asset", `String tx.asset);
          ("source_amount", `Float tx.source_amount);
          ("bridge_provider", `String tx.bridge_provider);
          ("started_at", `Float tx.started_at);
        ]
      ) in

      Lwt.return (ok_json (`Assoc [
        ("success", `Bool true);
        ("transactions", `List txs_json);
        ("count", `Int (List.length transactions));
      ]))

(** ========================================
 * ENDPOINT 5: GET /api/bridge/health
 * ========================================
 * Get bridge health monitoring data
 *
 * Response:
 * {
 *   "success": true,
 *   "bridges": [
 *     {
 *       "name": "Symbiosis",
 *       "status": "healthy",
 *       "security_score": 0.92,
 *       "tvl_usd": 50000000.0
 *     }
 *   ]
 * }
 *)
let get_bridge_health_handler state _req =
  (* Use cached bridge health from state *)
  let bridges_json = List.map state.bridge_health ~f:(fun bridge ->
    `Assoc [
      ("bridge_id", `String bridge.bridge_id);
      ("source_chain", `String (blockchain_to_string bridge.source_chain));
      ("dest_chain", `String (blockchain_to_string bridge.dest_chain));
      ("health_score", `Float bridge.health_score);
      ("current_tvl_usd", `Float (Int64.to_float bridge.current_tvl_usd /. 100.0));
      ("exploit_detected", `Bool bridge.exploit_detected);
      ("alert_count", `Int (List.length bridge.alerts));
    ]
  ) in

  Lwt.return (ok_json (`Assoc [
    ("success", `Bool true);
    ("bridges", `List bridges_json);
    ("last_updated", `Float 1706745600.0); (* TODO: Use actual current time *)
  ]))

(** ========================================
 * ENDPOINT 6: POST /api/bridge/fees/estimate
 * ========================================
 * Estimate bridge fees for a route
 *
 * Request:
 * {
 *   "source_chain": "TON",
 *   "dest_chain": "Ethereum",
 *   "asset": "USDT",
 *   "amount": 10000.0,
 *   "bridge_provider": "Symbiosis"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "fees": {
 *     "gas_fee_usd": 5.20,
 *     "bridge_fee_usd": 4.50,
 *     "protocol_fee_usd": 2.80,
 *     "total_fee_usd": 12.50,
 *     "total_percent": 0.125
 *   }
 * }
 *)
let estimate_fees_handler _state req =
  parse_json_body req >>= function
  | Error err -> Lwt.return (error_response err)
  | Ok json ->
      try
        let open Yojson.Safe.Util in
        let _source_chain = json |> member "source_chain" |> to_string in
        let _dest_chain = json |> member "dest_chain" |> to_string in
        let _asset = json |> member "asset" |> to_string in
        let amount = json |> member "amount" |> to_float in
        let _bridge_provider = json |> member "bridge_provider" |> to_string in

        (* TODO: Implement actual fee estimation via Rubic API *)
        (* Mock fee calculation for now *)
        let gas_fee = 5.20 in
        let bridge_fee = 4.50 in
        let protocol_fee = 2.80 in
        let total_fee = gas_fee +. bridge_fee +. protocol_fee in
        let total_percent = (total_fee /. amount) *. 100.0 in

        Lwt.return (ok_json (`Assoc [
          ("success", `Bool true);
          ("fees", `Assoc [
            ("gas_fee_usd", `Float gas_fee);
            ("bridge_fee_usd", `Float bridge_fee);
            ("protocol_fee_usd", `Float protocol_fee);
            ("total_fee_usd", `Float total_fee);
            ("total_percent", `Float total_percent);
          ]);
        ]))

      with exn ->
        Lwt.return (error_response (Exn.to_string exn))

(** Initialize bridge API state *)
let init_bridge_api_state ~db_pool =
  {
    db_pool;
    bridge_health = [];
  }

(** Update bridge health in state (called periodically) *)
let update_bridge_health state health_list =
  state.bridge_health <- health_list;
  Lwt.return_unit
