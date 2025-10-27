open Core
open Lwt.Infix
open Types
open Crypto

(* JSON and Error response helpers *)
let json_response ~status json = Dream.json ~status (Yojson.Safe.to_string json)
let ok_json json = json_response ~status:`OK json
let error_response message = json_response ~status:`Bad_Request (`Assoc [("error", `String message)])

(* Helper to get current market stress index *)
let get_market_stress () : float Lwt.t =
  (* TODO: Implement proper market stress calculation with risk integration *)
  (* For now, return neutral stress level *)
  Lwt.return 0.0

let parse_json_body req =
    Lwt.bind (Dream.body req) (fun body ->
        try Lwt.return (Ok (Yojson.Safe.from_string body))
        with _ -> Lwt.return (Error "Invalid JSON")
    )

(* Handler for buying a policy - provides a signed quote *)
let buy_policy_handler (collateral_manager: Pool.Collateral_manager.CollateralManager.t ref) (req: Dream.request) : Dream.response Lwt.t =
  parse_json_body req >>= fun result ->
  match result with
  | Error err ->
      error_response err
  | Ok json ->
      let open Yojson.Safe.Util in
      let user_address = json |> member "user_address" |> to_string in
      let asset_str = json |> member "asset" |> to_string in
      let coverage_amount_usd = json |> member "coverage_amount" |> to_float in
      let duration_days = json |> member "duration_days" |> to_int in
      let trigger_price = json |> member "trigger_price" |> to_float in
      let floor_price = json |> member "floor_price" |> to_float in

      let asset = match asset_of_string asset_str with
        | Ok asset -> asset
        | Error msg -> failwith msg
      in

      let risk_factors = Risk_model.get_risk_factors asset in
      let pool_state = (!collateral_manager).pool in
      let vault_state = {
        Pricing_engine.total_capital_usd = pool_state.total_capital_usd;
        total_coverage_sold = pool_state.total_coverage_sold;
      } in
      let coverage_amount_cents = Math.usd_to_cents coverage_amount_usd in

      get_market_stress () >>= fun market_stress ->
      Pricing_engine.PricingEngine.calculate_premium_async
        ~asset
        ~coverage_amount:coverage_amount_cents
        ~trigger_price
        ~_floor_price:floor_price
        ~duration_days
        ~vault_state
        ~market_stress
        ~risk_factors
        ~actual_loss_ratio:None
      >>= fun calculated_premium_cents ->
      let signer_config = Quote_signer.QuoteSigner.load_config () in
      let response_json =
        Quote_signer.QuoteSigner.create_signed_quote
          signer_config
          ~premium_cents:calculated_premium_cents
          ~user_address
          ~coverage_amount_cents
          ~trigger_price
          ~floor_price
          ~duration_days
          ~asset
          ~quote_validity_seconds:300.0
      in
      ok_json response_json

(* Handler for filing a claim - STUBBED *)
let file_claim_handler (req: Dream.request) =
    let open Lwt.Syntax in
    let* result = parse_json_body req in
    match result with
    | Error err -> error_response err
    | Ok json ->
        Lwt.catch
          (fun () ->
            let open Yojson.Safe.Util in
            let _policy_id = json |> member "policy_id" |> to_string in
            let _claim_details = json |> member "claim_details" |> to_string in
            error_response "Claim filing is not yet implemented."
          )
          (fun exn -> error_response (Exn.to_string exn))

(* Handler for vault deposit - STUBBED *)
let vault_deposit_handler (req: Dream.request) =
    let open Lwt.Syntax in
    let* result = parse_json_body req in
    match result with
    | Error err -> error_response err
    | Ok json ->
        Lwt.catch
          (fun () ->
            let open Yojson.Safe.Util in
            let _lp_address = json |> member "lp_address" |> to_string in
            let _amount_usd = json |> member "amount_usd" |> to_float in
            let _tranche_id = json |> member "tranche_id" |> to_int in
            error_response "Vault deposits are not yet implemented."
          )
          (fun exn -> error_response (Exn.to_string exn))

(* Handler for vault withdrawal - STUBBED *)
let vault_withdraw_handler (req: Dream.request) =
    let open Lwt.Syntax in
    let* result = parse_json_body req in
    match result with
    | Error err -> error_response err
    | Ok json ->
        Lwt.catch
          (fun () ->
            let open Yojson.Safe.Util in
            let _lp_address = json |> member "lp_address" |> to_string in
            let _lp_tokens = json |> member "lp_tokens" |> to_int in
            let _tranche_id = json |> member "tranche_id" |> to_int in
            error_response "Vault withdrawals are not yet implemented."
          )
          (fun exn -> error_response (Exn.to_string exn))

(* Handler for polling transaction status - STUBBED *)
let poll_transaction_handler (_req: Dream.request) =
    error_response "Transaction polling is not yet implemented."

let routes (collateral_manager: Pool.Collateral_manager.CollateralManager.t ref) = [
  Dream.post "/api/v2/policies" (buy_policy_handler collateral_manager);
  Dream.post "/api/v2/claims" file_claim_handler;
  Dream.post "/api/v2/vault/deposit" vault_deposit_handler;
  Dream.post "/api/v2/vault/withdraw" vault_withdraw_handler;
  Dream.get "/api/v2/transactions/:tx_hash" poll_transaction_handler;
]