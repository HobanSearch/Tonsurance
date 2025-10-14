(* TON Client - Blockchain Integration

   Provides interface to TON blockchain for:
   - Smart contract deployment
   - Contract method calls
   - Event subscriptions
   - Transaction monitoring
   - Wallet management

   Uses ton-http-api for HTTP-based communication.
*)

open Core
open Lwt.Syntax
open Types

module TonClient = struct

  (** Network configuration **)
  type network =
    | Mainnet
    | Testnet
    | Custom of string
  [@@deriving sexp]

  (** Client configuration **)
  type ton_config = {
    network: network;
    api_key: string option;
    timeout_seconds: int;
  } [@@deriving sexp]

  let default_config = {
    network = Testnet;
    api_key = None;
    timeout_seconds = 30;
  }

  (** Get API endpoint URL **)
  let get_endpoint (config: ton_config) : string =
    match config.network with
    | Mainnet -> "https://toncenter.com/api/v2"
    | Testnet -> "https://testnet.toncenter.com/api/v2"
    | Custom url -> url

  (** TON Address **)
  type ton_address = string [@@deriving sexp, yojson]

  (** Contract state **)
  type contract_state = {
    address: ton_address;
    balance: int64; (* in nanotons *)
    code: string option;
    data: string option;
    last_transaction_id: string option;
  } [@@deriving sexp, yojson]

  (** Transaction **)
  type transaction = {
    hash: string;
    lt: int64; (* Logical time *)
    from_addr: ton_address option;
    to_addr: ton_address;
    value: int64;
    fee: int64;
    success: bool;
    timestamp: float;
  } [@@deriving sexp, yojson]

  (** Make HTTP request to TON API **)
  let make_request
      (config: ton_config)
      ~(method_name: string)
      ~(params: (string * Yojson.Safe.t) list)
    : Yojson.Safe.t Lwt.t =

    let endpoint = get_endpoint config in
    let url = Printf.sprintf "%s/%s" endpoint method_name in

    (* Build query params *)
    let uri = Uri.of_string url in
    let uri_with_params =
      List.fold params ~init:uri ~f:(fun acc (key, value) ->
        let value_str = Yojson.Safe.to_string value in
        Uri.add_query_param acc (key, [value_str])
      )
    in

    (* Add API key if present *)
    let final_uri = match config.api_key with
      | None -> uri_with_params
      | Some key -> Uri.add_query_param uri_with_params ("api_key", [key])
    in

    let%lwt response = Cohttp_lwt_unix.Client.get final_uri in
    let%lwt body = Cohttp_lwt.Body.to_string (snd response) in

    let json = Yojson.Safe.from_string body in

    Lwt.return json

  (** Get contract state **)
  let get_contract_state
      (config: ton_config)
      ~(address: ton_address)
    : contract_state option Lwt.t =

    try%lwt
      let%lwt response = make_request config
        ~method_name:"getAddressInformation"
        ~params:[("address", `String address)]
      in

      let open Yojson.Safe.Util in
      let result = response |> member "result" in

      let balance = result |> member "balance" |> to_string |> Int64.of_string in
      let code = result |> member "code" |> to_string_option in
      let data = result |> member "data" |> to_string_option in
      let last_tx_id = result |> member "last_transaction_id" |> member "hash" |> to_string_option in

      Lwt.return (Some {
        address;
        balance;
        code;
        data;
        last_transaction_id = last_tx_id;
      })
    with
    | _ -> Lwt.return None

  (** Send message to contract **)
  let send_message
      (config: ton_config)
      ~(address: ton_address)
      ~(body: string) (* Base64-encoded BOC *)
    : string option Lwt.t =

    try%lwt
      let%lwt response = make_request config
        ~method_name:"sendBoc"
        ~params:[("boc", `String body)]
      in

      let open Yojson.Safe.Util in
      let result = response |> member "result" in
      let hash = result |> member "hash" |> to_string_option in

      Lwt.return hash
    with
    | _ -> Lwt.return None

  (** Call get method (read-only) **)
  let call_get_method
      (config: ton_config)
      ~(address: ton_address)
      ~(method_name: string)
      ~(params: Yojson.Safe.t list)
    : Yojson.Safe.t option Lwt.t =

    try%lwt
      let params_json = `List params in

      let%lwt response = make_request config
        ~method_name:"runGetMethod"
        ~params:[
          ("address", `String address);
          ("method", `String method_name);
          ("stack", params_json);
        ]
      in

      let open Yojson.Safe.Util in
      let stack = response |> member "result" |> member "stack" in

      Lwt.return (Some stack)
    with
    | _ -> Lwt.return None

  (** Get transactions for address **)
  let get_transactions
      (config: ton_config)
      ~(address: ton_address)
      ~(limit: int)
    : transaction list Lwt.t =

    try%lwt
      let%lwt response = make_request config
        ~method_name:"getTransactions"
        ~params:[
          ("address", `String address);
          ("limit", `Int limit);
        ]
      in

      let open Yojson.Safe.Util in
      let result = response |> member "result" |> to_list in

      let transactions =
        List.filter_map result ~f:(fun tx_json ->
          try
            let hash = tx_json |> member "transaction_id" |> member "hash" |> to_string in
            let lt = tx_json |> member "transaction_id" |> member "lt" |> to_string |> Int64.of_string in

            let in_msg = tx_json |> member "in_msg" in
            let from_addr = in_msg |> member "source" |> to_string_option in
            let to_addr = in_msg |> member "destination" |> to_string in
            let value = in_msg |> member "value" |> to_string |> Int64.of_string in

            let fee = tx_json |> member "fee" |> to_string |> Int64.of_string in
            let success = tx_json |> member "success" |> to_bool in
            let timestamp = tx_json |> member "utime" |> to_float in

            Some {
              hash;
              lt;
              from_addr;
              to_addr;
              value;
              fee;
              success;
              timestamp;
            }
          with _ -> None
        )
      in

      Lwt.return transactions
    with
    | _ -> Lwt.return []

  (** Wait for transaction confirmation **)
  let wait_for_transaction
      (config: ton_config)
      ~(tx_hash: string)
      ~(max_wait_seconds: int)
    : bool Lwt.t =

    let rec poll attempts_left =
      if attempts_left <= 0 then
        Lwt.return false
      else
        try%lwt
          let%lwt response = make_request config
            ~method_name:"getTransactionByHash"
            ~params:[("hash", `String tx_hash)]
          in

          let open Yojson.Safe.Util in
          let result = response |> member "result" in

          match result with
          | `Null ->
              let%lwt () = Lwt_unix.sleep 2.0 in
              poll (attempts_left - 1)
          | _ -> Lwt.return true
        with _ ->
          let%lwt () = Lwt_unix.sleep 2.0 in
          poll (attempts_left - 1)
    in

    poll (max_wait_seconds / 2)

  (** Policy Manager Contract Interface **)
  module PolicyManager = struct

    (** Create policy **)
    let create_policy
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(beneficiary: ton_address)
        ~(asset_type: int)
        ~(coverage_amount: int64)
        ~(premium_amount: int64)
        ~(trigger_price: int)
        ~(floor_price: int)
        ~(duration_seconds: int)
      : string option Lwt.t =

      (* In production, this would construct proper BOC message *)
      (* For now, placeholder *)

      let body = Printf.sprintf
        "create_policy_%s_%d_%Ld_%Ld_%d_%d_%d"
        beneficiary asset_type coverage_amount premium_amount
        trigger_price floor_price duration_seconds
      in

      send_message config ~address:contract_address ~body

    (** Get policy details **)
    let get_policy
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(policy_id: int64)
      : Yojson.Safe.t option Lwt.t =

      call_get_method config
        ~address:contract_address
        ~method_name:"get_policy"
        ~params:[`List [`String "num"; `String (Int64.to_string policy_id)]]

    (** Check if policy is active **)
    let is_policy_active
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(policy_id: int64)
      : bool Lwt.t =

      let%lwt result = call_get_method config
        ~address:contract_address
        ~method_name:"is_policy_active"
        ~params:[`List [`String "num"; `String (Int64.to_string policy_id)]]
      in

      match result with
      | Some json ->
          let open Yojson.Safe.Util in
          (try
            let is_active = json |> index 0 |> member "value" |> to_bool in
            Lwt.return is_active
          with _ -> Lwt.return false)
      | None -> Lwt.return false

    (** Execute payout **)
    let execute_payout
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(policy_id: int64)
        ~(current_price: int)
      : string option Lwt.t =

      let body = Printf.sprintf "execute_payout_%Ld_%d" policy_id current_price in
      send_message config ~address:contract_address ~body

  end

  (** Multi-Tranche Vault Contract Interface **)
  module MultiTrancheVault = struct

    (** Deposit to tranche **)
    let deposit
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(tranche_id: int)
        ~(amount: int64)
      : string option Lwt.t =

      let body = Printf.sprintf "deposit_%d_%Ld" tranche_id amount in
      send_message config ~address:contract_address ~body

    (** Withdraw from tranche **)
    let withdraw
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(tranche_id: int)
        ~(lp_tokens: int64)
      : string option Lwt.t =

      let body = Printf.sprintf "withdraw_%d_%Ld" tranche_id lp_tokens in
      send_message config ~address:contract_address ~body

    (** Get tranche details **)
    let get_tranche
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(tranche_id: int)
      : Yojson.Safe.t option Lwt.t =

      call_get_method config
        ~address:contract_address
        ~method_name:"get_tranche"
        ~params:[`List [`String "num"; `String (Int.to_string tranche_id)]]

    (** Get total capital **)
    let get_total_capital
        (config: ton_config)
        ~(contract_address: ton_address)
      : int64 option Lwt.t =

      let%lwt result = call_get_method config
        ~address:contract_address
        ~method_name:"get_total_capital"
        ~params:[]
      in

      match result with
      | Some json ->
          let open Yojson.Safe.Util in
          (try
            let capital = json |> index 0 |> member "value" |> to_string |> Int64.of_string in
            Lwt.return (Some capital)
          with _ -> Lwt.return None)
      | None -> Lwt.return None

    (** Get NAV per token **)
    let get_nav_per_token
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(tranche_id: int)
      : float option Lwt.t =

      let%lwt result = call_get_method config
        ~address:contract_address
        ~method_name:"get_nav_per_token"
        ~params:[`List [`String "num"; `String (Int.to_string tranche_id)]]
      in

      match result with
      | Some json ->
          let open Yojson.Safe.Util in
          (try
            let nav = json |> index 0 |> member "value" |> to_float in
            Lwt.return (Some nav)
          with _ -> Lwt.return None)
      | None -> Lwt.return None

  end

  (** Bitcoin Float Manager Contract Interface **)
  module BitcoinFloatManager = struct

    (** Trigger rebalance **)
    let rebalance
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(btc_price: int64)
      : string option Lwt.t =

      let body = Printf.sprintf "rebalance_%Ld" btc_price in
      send_message config ~address:contract_address ~body

    (** Get trade signal **)
    let get_trade_signal
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(btc_price: int64)
      : (int * int64) option Lwt.t =

      let%lwt result = call_get_method config
        ~address:contract_address
        ~method_name:"get_trade_signal"
        ~params:[`List [`String "num"; `String (Int64.to_string btc_price)]]
      in

      match result with
      | Some json ->
          let open Yojson.Safe.Util in
          (try
            let action = json |> index 0 |> member "value" |> to_int in
            let amount = json |> index 1 |> member "value" |> to_string |> Int64.of_string in
            Lwt.return (Some (action, amount))
          with _ -> Lwt.return None)
      | None -> Lwt.return None

    (** Get BTC float **)
    let get_btc_float_sats
        (config: ton_config)
        ~(contract_address: ton_address)
      : int64 option Lwt.t =

      let%lwt result = call_get_method config
        ~address:contract_address
        ~method_name:"get_btc_float_sats"
        ~params:[]
      in

      match result with
      | Some json ->
          let open Yojson.Safe.Util in
          (try
            let sats = json |> index 0 |> member "value" |> to_string |> Int64.of_string in
            Lwt.return (Some sats)
          with _ -> Lwt.return None)
      | None -> Lwt.return None

    (** Get unrealized P&L **)
    let get_unrealized_pnl
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(btc_price: int64)
      : int64 option Lwt.t =

      let%lwt result = call_get_method config
        ~address:contract_address
        ~method_name:"get_unrealized_pnl"
        ~params:[`List [`String "num"; `String (Int64.to_string btc_price)]]
      in

      match result with
      | Some json ->
          let open Yojson.Safe.Util in
          (try
            let pnl = json |> index 0 |> member "value" |> to_string |> Int64.of_string in
            Lwt.return (Some pnl)
          with _ -> Lwt.return None)
      | None -> Lwt.return None

  end

  (** Event subscription (polling-based) **)
  module Events = struct

    type event_type =
      | PolicyCreated of { policy_id: int64; buyer: ton_address }
      | PayoutExecuted of { policy_id: int64; amount: int64 }
      | DepositMade of { tranche_id: int; amount: int64 }
      | WithdrawalMade of { tranche_id: int; amount: int64 }
    [@@deriving sexp]

    (** Poll for new events **)
    let poll_events
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(since_lt: int64)
      : event_type list Lwt.t =

      let%lwt transactions = get_transactions config
        ~address:contract_address
        ~limit:50
      in

      (* Filter transactions after since_lt *)
      let new_transactions =
        List.filter transactions ~f:(fun tx -> tx.lt > since_lt)
      in

      (* Parse events from transactions *)
      (* This is simplified - real implementation would decode message bodies *)
      let events = List.filter_map new_transactions ~f:(fun tx ->
        (* Placeholder event parsing *)
        None
      ) in

      Lwt.return events

  end

end
