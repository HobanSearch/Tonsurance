(**
 * Escrow REST API
 * Provides endpoints for creating, managing, and querying escrow contracts
 *)

open Core
open Lwt.Syntax
open Lwt.Infix
open Types

(** JSON helpers *)
let json_response ~status json =
  Dream.json ~status (Yojson.Safe.to_string json)

let ok_json json = json_response ~status:`OK json
let bad_request_json json = json_response ~status:`Bad_Request json
let not_found_json json = json_response ~status:`Not_Found json
let forbidden_json json = json_response ~status:`Forbidden json

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
  let%lwt body = Dream.body req in
  try
    Lwt.return (Ok (Yojson.Safe.from_string body))
  with _ ->
    Lwt.return (Error "Invalid JSON")

(** Mock database pool - in production, get from Dream.sql *)
let get_db_pool (_req: Dream.request) : Db.Escrow_db.db_pool =
  Db.Escrow_db.create_mock_pool ()

(** Mock signature verifier *)
module SignatureVerifier = struct
  let verify_ed25519
      ~(_message: string)
      ~(signature: string)
      ~(public_key: string)
    : bool =
    (* In production, use actual cryptographic verification *)
    String.length signature > 0 && String.length public_key > 0
end

(** Mock contract deployment *)
let deploy_escrow_contract ~(escrow: escrow_contract) : string Lwt.t =
  (* In production, deploy actual TON smart contract *)
  let contract_address = Printf.sprintf "EQEscrow_%Ld" escrow.escrow_id in
  Lwt.return contract_address

let send_cancel_to_contract ~(escrow: escrow_contract) : unit Lwt.t =
  let () = Printf.printf "[Contract] Sending cancel to contract for escrow %Ld\n"
    escrow.escrow_id in
  Lwt.return ()

let send_freeze_to_contract ~(escrow: escrow_contract) : unit Lwt.t =
  let () = Printf.printf "[Contract] Sending freeze to contract for escrow %Ld\n"
    escrow.escrow_id in
  Lwt.return ()

(** Serialize escrow to JSON *)
let serialize_escrow_to_json (escrow: escrow_contract) (conditions: release_condition list) : Yojson.Safe.t =
  let conditions_json = List.mapi ~f:(fun idx cond ->
    let (cond_type, is_met, description) = match cond with
      | OracleVerification { oracle_endpoint; verified; _ } ->
          ("oracle", verified, Printf.sprintf "Oracle verification: %s" oracle_endpoint)
      | TimeElapsed { seconds; start_time } ->
          let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
          let elapsed = current_time -. start_time in
          let is_met = Float.(elapsed >= float_of_int seconds) in
          ("time_elapsed", is_met, Printf.sprintf "Time elapsed: %d seconds" seconds)
      | ManualApproval { approver; approved; _ } ->
          ("manual_approval", approved, Printf.sprintf "Manual approval from: %s" approver)
      | ChainEvent { chain; event_type; occurred; _ } ->
          ("chain_event", occurred, Printf.sprintf "Chain event: %s on %s" event_type (blockchain_to_string chain))
      | MultisigApproval { required_signatures; signatures_received; _ } ->
          let is_met = List.length signatures_received >= required_signatures in
          ("multisig", is_met, Printf.sprintf "Multisig: %d/%d signatures" (List.length signatures_received) required_signatures)
    in
    `Assoc [
      ("index", `Int idx);
      ("type", `String cond_type);
      ("is_met", `Bool is_met);
      ("description", `String description);
    ]
  ) conditions in

  `Assoc [
    ("escrow_id", `Int (Int64.to_int_exn escrow.escrow_id));
    ("payer", `String escrow.payer);
    ("payee", `String escrow.payee);
    ("amount_usd", `Float (float_of_int (Int64.to_int_exn escrow.amount) /. 100.0));
    ("asset", `String (asset_to_string escrow.asset));
    ("status", `String (escrow_status_to_string escrow.status));
    ("conditions_met", `Int escrow.conditions_met);
    ("total_conditions", `Int (List.length conditions));
    ("conditions", `List conditions_json);
    ("created_at", `Float escrow.created_at);
    ("timeout_at", `Float escrow.timeout_at);
    ("protection_enabled", `Bool escrow.protection_enabled);
  ]

let serialize_escrow_summary (escrow: escrow_contract) : Yojson.Safe.t =
  `Assoc [
    ("escrow_id", `Int (Int64.to_int_exn escrow.escrow_id));
    ("payer", `String escrow.payer);
    ("payee", `String escrow.payee);
    ("amount_usd", `Float (float_of_int (Int64.to_int_exn escrow.amount) /. 100.0));
    ("asset", `String (asset_to_string escrow.asset));
    ("status", `String (escrow_status_to_string escrow.status));
    ("created_at", `Float escrow.created_at);
    ("timeout_at", `Float escrow.timeout_at);
  ]

(** Parse release condition from JSON *)
let parse_condition_from_json (json: Yojson.Safe.t) : release_condition =
  let open Yojson.Safe.Util in
  let cond_type = json |> member "type" |> to_string in

  match cond_type with
  | "oracle" ->
      OracleVerification {
        oracle_endpoint = json |> member "oracle_endpoint" |> to_string;
        expected_value = json |> member "expected_value" |> to_string;
        verified = false;
        last_check = None;
      }

  | "time_elapsed" ->
      TimeElapsed {
        seconds = json |> member "seconds" |> to_int;
        start_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      }

  | "manual_approval" ->
      ManualApproval {
        approver = json |> member "approver" |> to_string;
        approved = false;
        approval_deadline = json |> member "approval_deadline" |> to_float_option;
        signature = None;
      }

  | "chain_event" ->
      let chain_str = json |> member "chain" |> to_string in
      ChainEvent {
        chain = blockchain_of_string chain_str |> Result.ok_or_failwith;
        event_type = json |> member "event_type" |> to_string;
        contract_address = json |> member "contract_address" |> to_string;
        occurred = false;
        verified_at = None;
      }

  | "multisig" ->
      MultisigApproval {
        required_signatures = json |> member "required_signatures" |> to_int;
        signers = json |> member "signers" |> to_list |> List.map ~f:to_string;
        signatures_received = [];
      }

  | _ -> failwith (Printf.sprintf "Unknown condition type: %s" cond_type)

(** POST /api/v1/escrow/create - Create new escrow *)
let create_escrow_handler (req: Dream.request) =
  parse_json_body req >>= function
  | Error err -> error_response err
  | Ok json ->
      try
        let open Yojson.Safe.Util in
        let payer = json |> member "payer_address" |> to_string in
        let payee = json |> member "payee_address" |> to_string in
        let amount_usd = json |> member "amount_usd" |> to_float in
        let asset_str = json |> member "asset" |> to_string in
        let duration_days = json |> member "duration_days" |> to_int in
        let _protection_enabled = json |> member "protection_enabled" |> to_bool_option |> Option.value ~default:false in
        let conditions_json = json |> member "conditions" |> to_list in

        (* Parse asset *)
        match asset_of_string asset_str with
        | Error err -> error_response err
        | Ok asset ->
            (* Parse conditions *)
            let conditions = List.map ~f:parse_condition_from_json conditions_json in

            (* Get database pool *)
            let db_pool = get_db_pool req in

            (* Create escrow using escrow_engine *)
            let%lwt escrow_result = Escrow.Escrow_engine.EscrowOps.create_escrow
              ~db_pool
              ~payer
              ~payee
              ~amount:(Int64.of_float (amount_usd *. 100.0)) (* USD to cents *)
              ~asset
              ~release_conditions:conditions
              ~timeout_action:ReturnToPayer
              ~timeout_seconds:(duration_days * 86400)
            in

            (* Handle result *)
            match escrow_result with
            | Error err -> error_response (Caqti_error.show err)
            | Ok escrow ->
            let escrow_id = escrow.escrow_id in

            (* TODO: Deploy smart contract *)
            let contract_address = Printf.sprintf "EQEscrow_%Ld" escrow_id in

            (* Return response *)
            let response = `Assoc [
              ("success", `Bool true);
              ("escrow_id", `Int (Int64.to_int_exn escrow_id));
              ("payer", `String payer);
              ("payee", `String payee);
              ("amount_usd", `Float amount_usd);
              ("status", `String "active");
              ("contract_address", `String contract_address);
              ("conditions_count", `Int (List.length conditions));
            ] in

            ok_json response

      with exn ->
        error_response (Exn.to_string exn)

(** GET /api/v1/escrow/:id - Get escrow details *)
let get_escrow_handler (req: Dream.request) =
  let escrow_id_str = Dream.param req "id" in
  try
    let escrow_id = Int64.of_string escrow_id_str in
    let db_pool = get_db_pool req in

    let%lwt escrow_result = Db.Escrow_db.EscrowDb.get_escrow ~escrow_id ~db_pool in

    match escrow_result with
    | Error err -> error_response (Caqti_error.show err)
    | Ok None -> not_found_json (`Assoc [("error", `String "Escrow not found")])
    | Ok (Some escrow) ->
        let json = serialize_escrow_to_json escrow escrow.release_conditions in
        ok_json json

  with exn ->
    error_response (Exn.to_string exn)

(** GET /api/v1/escrow/user/:address - List user's escrows *)
let list_user_escrows_handler (req: Dream.request) =
  let user_address = Dream.param req "address" in
  let _db_pool = get_db_pool req in

  (* TODO: Implement get_user_escrows in escrow_db.ml *)
  let escrows = [] in

  let json = `Assoc [
    ("escrows", `List (List.map ~f:serialize_escrow_summary escrows));
    ("count", `Int (List.length escrows));
    ("user_address", `String user_address);
  ] in

  ok_json json

(** POST /api/v1/escrow/:id/approve - Approve escrow (manual approval condition) *)
let approve_escrow_handler (_req: Dream.request) =
  (* TODO: Implement missing DB functions *)
  error_response "Not implemented: requires find_manual_approval_condition, insert_signature, mark_condition_met"

(** POST /api/v1/escrow/:id/sign - Add signature to multisig condition *)
let sign_multisig_handler (_req: Dream.request) =
  (* TODO: Fix Result type handling *)
  error_response "Not implemented"

(** POST /api/v1/escrow/:id/cancel - Cancel escrow *)
let cancel_escrow_handler (_req: Dream.request) =
  (* TODO: Fix Result type handling and implement update_status *)
  error_response "Not implemented"

(** POST /api/v1/escrow/:id/dispute - Initiate dispute *)
let dispute_escrow_handler (_req: Dream.request) =
  (* TODO: Fix Result type handling and implement insert_dispute, update_status *)
  error_response "Not implemented"

(** GET /api/v1/escrow/:id/status - Get escrow status with condition details *)
let get_escrow_status_handler (_req: Dream.request) =
  (* TODO: Fix Result type handling and implement get_conditions *)
  error_response "Not implemented"

(** GET /api/v1/escrow/analytics - Get escrow analytics *)
let analytics_handler (_req: Dream.request) =
  (* TODO: Implement get_analytics *)
  error_response "Not implemented"

(** Register all escrow routes *)
let routes = [
  Dream.post "/api/v1/escrow/create" create_escrow_handler;
  Dream.get "/api/v1/escrow/:id" get_escrow_handler;
  Dream.get "/api/v1/escrow/user/:address" list_user_escrows_handler;
  Dream.post "/api/v1/escrow/:id/approve" approve_escrow_handler;
  Dream.post "/api/v1/escrow/:id/sign" sign_multisig_handler;
  Dream.post "/api/v1/escrow/:id/cancel" cancel_escrow_handler;
  Dream.post "/api/v1/escrow/:id/dispute" dispute_escrow_handler;
  Dream.get "/api/v1/escrow/:id/status" get_escrow_status_handler;
  Dream.get "/api/v1/escrow/analytics" analytics_handler;
]
