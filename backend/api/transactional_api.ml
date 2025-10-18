open Core
open Lwt.Syntax
open Types
open Db

(* JSON and Error response helpers *)
let json_response ~status json = Dream.json ~status (Yojson.Safe.to_string json)
let ok_json json = json_response ~status:`OK json
let error_response message = json_response ~status:`Bad_Request (`Assoc [("error", `String message)])

let parse_json_body req = 
    Dream.body req 
    >>= fun body ->
        try Lwt.return (Ok (Yojson.Safe.from_string body))
        with _ -> Lwt.return (Error "Invalid JSON")

(* Handler for buying a policy - provides a signed quote *)
let buy_policy_handler (pricing_engine: Pricing_engine.PricingEngine.t) (req: Dream.request) =
    let open Lwt_result.Infix in
    parse_json_body req
    >>= fun json ->
        try
            (* ... parsing logic ... *)
            let user_address = Yojson.Safe.Util.member "user_address" json |> Yojson.Safe.Util.to_string in
            (* ... more parsing ... *)

            (* 1. Get premium from the real pricing engine *)
            let calculated_premium_cents = (* ... call pricing engine ... *) 1000L in

            (* 2. Create and sign the quote data *)
            let deadline = Unix.time () +. 300.0 in
            let quote_data = `Assoc [("premium", `Int (Int64.to_int_exn calculated_premium_cents)); ("deadline", `Int (Int.of_float deadline))] in
            let quote_hash = Digest.string (Yojson.Safe.to_string quote_data) |> Digest.to_hex in
            let signature = "mock_signature_for_" ^ quote_hash in (* Stub for key management *)

            let response = `Assoc [("quote", quote_data); ("signature", `String signature)] in
            Lwt.return (Ok (ok_json response))
        with exn -> Lwt.return (Error (error_response (Exn.to_string exn)))

(* Handler for polling transaction status *)
let poll_transaction_handler (db_pool: Db.db_pool) (req: Dream.request) =
    let tx_hash = Dream.param req "tx_hash" in
    let%lwt tx_res = Transaction_db.get_transaction db_pool tx_hash in
    match tx_res with
    | Ok (Some tx) -> 
        (* TODO: Add logic to check blockchain if still pending *)
        let response = `Assoc [("tx_hash", `String tx.tx_hash); ("status", `String (Transaction_db.tx_status_to_string tx.status))] in
        Lwt.return (ok_json response)
    | Ok None -> Lwt.return (error_response "Transaction not found")
    | Error e -> Lwt.return (error_response (Caqti_error.show e))


(* ... other handlers like file_claim, vault_deposit would be similarly refactored ... *)

let routes (db_pool: Db.db_pool) (pricing_engine: Pricing_engine.PricingEngine.t) = [
  Dream.post "/api/v2/policies" (buy_policy_handler pricing_engine);
  Dream.get "/api/v2/transactions/:tx_hash" (poll_transaction_handler db_pool);
  (* ... other routes ... *)
]
