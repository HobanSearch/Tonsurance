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
(* open Lwt.Syntax *)
(* open Types *)

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
  type ton_address = string [@@deriving sexp]

  (** Contract state **)
  type contract_state = {
    address: ton_address;
    balance: int64; (* in nanotons *)
    code: string option;
    data: string option;
    last_transaction_id: string option;
  } [@@deriving sexp]

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
  } [@@deriving sexp]

  (** Transaction result for confirmation **)
  type transaction_result = {
    tx: transaction;
    exit_code: int;
    is_bounced: bool;
    error_message: string option;
  } [@@deriving sexp]

  (** Cell - base64-encoded BOC **)
  type cell = string [@@deriving sexp]

  (** Contract event **)
  type event = {
    event_id: int;
    data: string; (* JSON string *)
    timestamp: float;
    transaction_hash: string;
  } [@@deriving sexp]

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
      ~(_address: ton_address)
    : contract_state option Lwt.t =

    try%lwt
      let%lwt response = make_request config
        ~method_name:"getAddressInformation"
        ~params:[("address", `String _address)]
      in

      let open Yojson.Safe.Util in
      let result = response |> member "result" in

      let balance = result |> member "balance" |> to_string |> Int64.of_string in
      let code = result |> member "code" |> to_string_option in
      let data = result |> member "data" |> to_string_option in
      let last_tx_id = result |> member "last_transaction_id" |> member "hash" |> to_string_option in

      Lwt.return (Some {
        address = _address;
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
      ~(_address: ton_address)
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
      ~(_address: ton_address)
      ~(method_name: string)
      ~(params: Yojson.Safe.t list)
    : Yojson.Safe.t option Lwt.t =

    try%lwt
      let params_json = `List params in

      let%lwt response = make_request config
        ~method_name:"runGetMethod"
        ~params:[
          ("address", `String _address);
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
      ~(_address: ton_address)
      ~(limit: int)
    : transaction list Lwt.t =

    try%lwt
      let%lwt response = make_request config
        ~method_name:"getTransactions"
        ~params:[
          ("address", `String _address);
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

  (** ========================================
      WRITE OPERATIONS
      ======================================== *)

  (** Build internal message cell **)
  let build_internal_message
      ~(dest: ton_address)
      ~(value: int64)
      ~(body: cell)
    : cell =
    (* In production, this would use proper BOC serialization *)
    (* For now, construct a pseudo-cell representation *)
    let msg_json = `Assoc [
      ("dest", `String dest);
      ("value", `String (Int64.to_string value));
      ("body", `String body);
      ("bounce", `Bool true);
    ] in
    Yojson.Safe.to_string msg_json |> Base64.encode_exn

  (** Build message payload for contract calls **)
  let build_message_payload
      ~(_op_code: int)
      ~(params: (string * Yojson.Safe.t) list)
    : cell =
    (* Build payload with op_code + parameters *)
    let payload_json = `Assoc ([
      ("op", `Int _op_code);
    ] @ params) in
    Yojson.Safe.to_string payload_json |> Base64.encode_exn

  (** Parse bounce message to extract error **)
  let parse_bounce_error (_tx: transaction) : string option =
    (* Bounced messages have specific format in TON *)
    (* Check if this was a bounced message by examining transaction flags *)
    (* In a real implementation, would decode the bounce body *)
    if _tx.success then
      None
    else
      (* Parse common error codes *)
      Some "Transaction bounced - contract rejected the message"

  (** Detect if transaction was bounced **)
  let is_bounced (_tx: transaction) : bool =
    (* In TON, bounced messages are marked in the transaction flags *)
    (* For now, we check if transaction failed *)
    not _tx.success

  (** Parse exit code from transaction **)
  let parse_exit_code (tx_json: Yojson.Safe.t) : int =
    try
      let open Yojson.Safe.Util in
      tx_json |> member "description" |> member "compute_ph"
              |> member "exit_code" |> to_int
    with _ -> -1 (* Unknown exit code *)

  (** Get descriptive error message from exit code **)
  let error_message_from_exit_code (exit_code: int) : string option =
    match exit_code with
    | 0 -> None (* Success *)
    | 1 -> Some "Alternative success (non-standard)"
    | 2 -> Some "Stack underflow"
    | 3 -> Some "Stack overflow"
    | 4 -> Some "Integer overflow"
    | 5 -> Some "Integer out of range"
    | 6 -> Some "Invalid opcode"
    | 7 -> Some "Type check error"
    | 8 -> Some "Cell overflow"
    | 9 -> Some "Cell underflow"
    | 10 -> Some "Dictionary error"
    | 11 -> Some "Unknown error"
    | 12 -> Some "Fatal error"
    | 13 -> Some "Out of gas"
    | 32 -> Some "Action list invalid"
    | 33 -> Some "Action invalid or not supported"
    | 34 -> Some "Invalid source address"
    | 35 -> Some "Invalid destination address"
    | 36 -> Some "Not enough TON"
    | 37 -> Some "Not enough extra currencies"
    | 38 -> Some "Outbound message does not fit"
    | 40 -> Some "Not enough funds to process message"
    | 43 -> Some "Library reference expected"
    | 50 -> Some "Account frozen"
    | 100 -> Some "Access denied"
    | 101 -> Some "Insufficient balance"
    | 102 -> Some "Invalid argument"
    | _ -> Some (Printf.sprintf "Unknown exit code: %d" exit_code)

  (** Send transaction with retry logic **)
  let send_transaction
      (config: ton_config)
      ~(wallet_address: ton_address)
      ~(contract_address: ton_address)
      ~(_op_code: int)
      ~(payload: cell)
      ~(amount: int64)
    : transaction Lwt.t =

    let rec attempt_send retries_left last_error =
      if retries_left <= 0 then
        Lwt.fail_with (Printf.sprintf "Failed to send transaction after retries: %s"
                        (Option.value last_error ~default:"unknown error"))
      else
        try%lwt
          (* Build the message *)
          let message_body = payload in
          let internal_msg = build_internal_message
            ~dest:contract_address
            ~value:amount
            ~body:message_body
          in

          (* Send via sendBoc endpoint *)
          let%lwt response = make_request config
            ~method_name:"sendBoc"
            ~params:[("boc", `String internal_msg)]
          in

          let open Yojson.Safe.Util in
          let result = response |> member "result" in

          (* Extract transaction hash *)
          let hash = result |> member "hash" |> to_string in

          (* Return transaction (note: lt will be updated after confirmation) *)
          Lwt.return {
            hash;
            lt = 0L; (* Will be set after confirmation *)
            from_addr = Some wallet_address;
            to_addr = contract_address;
            value = amount;
            fee = 0L; (* Will be set after confirmation *)
            success = true; (* Assume success until confirmation *)
            timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
          }

        with
        | Failure msg when String.is_substring msg ~substring:"network" ->
            (* Network error - retry with exponential backoff *)
            let backoff = Float.of_int (6 - retries_left) in
            let%lwt () = Lwt_unix.sleep backoff in
            attempt_send (retries_left - 1) (Some msg)
        | exn ->
            (* Contract revert or other permanent error - don't retry *)
            Lwt.fail exn
    in

    attempt_send 5 None

  (** Wait for confirmation and get full transaction result **)
  let wait_for_confirmation
      (config: ton_config)
      ~(tx_hash: string)
      ~(max_attempts: int)
    : transaction_result Lwt.t =

    let rec poll attempts_left =
      if attempts_left <= 0 then
        Lwt.fail_with (Printf.sprintf "Transaction confirmation timeout: %s" tx_hash)
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
              (* Transaction not found yet, keep polling *)
              let%lwt () = Lwt_unix.sleep 1.0 in
              poll (attempts_left - 1)
          | tx_json ->
              (* Parse transaction details *)
              let hash = tx_json |> member "transaction_id" |> member "hash" |> to_string in
              let lt = tx_json |> member "transaction_id" |> member "lt"
                       |> to_string |> Int64.of_string in

              let in_msg = tx_json |> member "in_msg" in
              let from_addr = in_msg |> member "source" |> to_string_option in
              let to_addr = in_msg |> member "destination" |> to_string in
              let value = in_msg |> member "value" |> to_string |> Int64.of_string in

              let fee = tx_json |> member "fee" |> to_string |> Int64.of_string in
              let success =
                try tx_json |> member "description" |> member "aborted"
                    |> to_bool |> not
                with _ -> true
              in
              let timestamp = tx_json |> member "utime" |> to_float in

              let tx = {
                hash;
                lt;
                from_addr;
                to_addr;
                value;
                fee;
                success;
                timestamp;
              } in

              (* Parse exit code and error details *)
              let exit_code = parse_exit_code tx_json in
              let is_bounced = is_bounced tx in
              let error_message =
                if success then None
                else if is_bounced then parse_bounce_error tx
                else error_message_from_exit_code exit_code
              in

              Lwt.return { tx; exit_code; is_bounced; error_message }

        with _ ->
          let%lwt () = Lwt_unix.sleep 1.0 in
          poll (attempts_left - 1)
    in

    poll max_attempts

  (** Parse event log from transaction **)
  let parse_event_log
      (_tx: transaction)
      ~(_event_id: int)
    : event option =

    (* In production, this would:
       1. Fetch the transaction messages
       2. Look for emit_log operations in out_msgs
       3. Decode the log data from the message body
       4. Match against expected event_id

       For now, return None - to be implemented with proper BOC parsing *)
    None

  (** Send transaction and wait for confirmation (convenience function) **)
  let send_and_confirm
      (config: ton_config)
      ~(wallet_address: ton_address)
      ~(contract_address: ton_address)
      ~(_op_code: int)
      ~(payload: cell)
      ~(amount: int64)
      ~(max_attempts: int option)
    : transaction_result Lwt.t =

    let max_attempts = Option.value max_attempts ~default:30 in

    (* Send transaction *)
    let%lwt tx = send_transaction config
      ~wallet_address
      ~contract_address
      ~_op_code
      ~payload
      ~amount
    in

    (* Wait for confirmation *)
    let%lwt result = wait_for_confirmation config
      ~tx_hash:tx.hash
      ~max_attempts
    in

    (* Log result *)
    let%lwt () =
      if result.tx.success then
        Lwt_io.printlf "Transaction confirmed: %s (exit_code=%d)"
          result.tx.hash result.exit_code
      else
        Lwt_io.eprintlf "Transaction failed: %s - %s"
          result.tx.hash
          (Option.value result.error_message ~default:"unknown error")
    in

    Lwt.return result

  (** Policy Manager Contract Interface **)
  module PolicyManager = struct

    (* Operation codes for PolicyFactory contract *)
    let op_create_policy = 0x01
    let op_execute_payout = 0x02
    let op_cancel_policy = 0x03

    (** Create policy (WRITE operation) **)
    let create_policy
        (config: ton_config)
        ~(wallet_address: ton_address)
        ~(contract_address: ton_address)
        ~(beneficiary: ton_address)
        ~(asset_type: int)
        ~(coverage_amount: int64)
        ~(premium_amount: int64)
        ~(trigger_price: int)
        ~(floor_price: int)
        ~(duration_seconds: int)
      : transaction_result Lwt.t =

      (* Build payload with policy parameters *)
      let payload = build_message_payload
        ~_op_code:op_create_policy
        ~params:[
          ("beneficiary", `String beneficiary);
          ("asset_type", `Int asset_type);
          ("coverage_amount", `String (Int64.to_string coverage_amount));
          ("trigger_price", `Int trigger_price);
          ("floor_price", `Int floor_price);
          ("duration_seconds", `Int duration_seconds);
        ]
      in

      (* Send transaction and wait for confirmation *)
      send_and_confirm config
        ~wallet_address
        ~contract_address
        ~_op_code:op_create_policy
        ~payload
        ~amount:premium_amount
        ~max_attempts:(Some 30)

    (** Get policy details **)
    let get_policy
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(policy_id: int64)
      : Yojson.Safe.t option Lwt.t =

      call_get_method config
        ~_address:contract_address
        ~method_name:"get_policy"
        ~params:[`List [`String "num"; `String (Int64.to_string policy_id)]]

    (** Check if policy is active **)
    let is_policy_active
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(policy_id: int64)
      : bool Lwt.t =

      let%lwt result = call_get_method config
        ~_address:contract_address
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

    (** Execute payout (WRITE operation) **)
    let execute_payout
        (config: ton_config)
        ~(wallet_address: ton_address)
        ~(contract_address: ton_address)
        ~(policy_id: int64)
        ~(current_price: int)
      : transaction_result Lwt.t =

      (* Build payload with payout parameters *)
      let payload = build_message_payload
        ~_op_code:op_execute_payout
        ~params:[
          ("policy_id", `String (Int64.to_string policy_id));
          ("current_price", `Int current_price);
        ]
      in

      (* Send transaction (small amount for gas fees) *)
      send_and_confirm config
        ~wallet_address
        ~contract_address
        ~_op_code:op_execute_payout
        ~payload
        ~amount:100_000_000L (* 0.1 TON for gas *)
        ~max_attempts:(Some 30)

  end

  (** Multi-Tranche Vault Contract Interface **)
  module MultiTrancheVault = struct

    (* Operation codes for MultiTrancheVault contract *)
    let op_deposit = 0x10
    let op_withdraw = 0x11
    let op_claim_yield = 0x12

    (** Deposit to tranche (WRITE operation) **)
    let deposit
        (config: ton_config)
        ~(wallet_address: ton_address)
        ~(contract_address: ton_address)
        ~(tranche_id: int)
        ~(amount: int64)
      : transaction_result Lwt.t =

      (* Build payload with deposit parameters *)
      let payload = build_message_payload
        ~_op_code:op_deposit
        ~params:[
          ("tranche_id", `Int tranche_id);
        ]
      in

      (* Send transaction with deposit amount *)
      send_and_confirm config
        ~wallet_address
        ~contract_address
        ~_op_code:op_deposit
        ~payload
        ~amount
        ~max_attempts:(Some 30)

    (** Withdraw from tranche (WRITE operation) **)
    let withdraw
        (config: ton_config)
        ~(wallet_address: ton_address)
        ~(contract_address: ton_address)
        ~(tranche_id: int)
        ~(lp_tokens: int64)
      : transaction_result Lwt.t =

      (* Build payload with withdrawal parameters *)
      let payload = build_message_payload
        ~_op_code:op_withdraw
        ~params:[
          ("tranche_id", `Int tranche_id);
          ("lp_tokens", `String (Int64.to_string lp_tokens));
        ]
      in

      (* Send transaction (small amount for gas) *)
      send_and_confirm config
        ~wallet_address
        ~contract_address
        ~_op_code:op_withdraw
        ~payload
        ~amount:50_000_000L (* 0.05 TON for gas *)
        ~max_attempts:(Some 30)

    (** Get tranche details **)
    let get_tranche
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(tranche_id: int)
      : Yojson.Safe.t option Lwt.t =

      call_get_method config
        ~_address:contract_address
        ~method_name:"get_tranche"
        ~params:[`List [`String "num"; `String (Int.to_string tranche_id)]]

    (** Get total capital **)
    let get_total_capital
        (config: ton_config)
        ~(contract_address: ton_address)
      : int64 option Lwt.t =

      let%lwt result = call_get_method config
        ~_address:contract_address
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
        ~_address:contract_address
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

    (* Operation codes for BitcoinFloatManager contract *)
    let op_rebalance = 0x20
    let op_emergency_pause = 0x21

    (** Trigger rebalance (WRITE operation) **)
    let rebalance
        (config: ton_config)
        ~(wallet_address: ton_address)
        ~(contract_address: ton_address)
        ~(btc_price: int64)
      : transaction_result Lwt.t =

      (* Build payload with BTC price *)
      let payload = build_message_payload
        ~_op_code:op_rebalance
        ~params:[
          ("btc_price", `String (Int64.to_string btc_price));
        ]
      in

      (* Send transaction (small amount for gas) *)
      send_and_confirm config
        ~wallet_address
        ~contract_address
        ~_op_code:op_rebalance
        ~payload
        ~amount:100_000_000L (* 0.1 TON for gas *)
        ~max_attempts:(Some 30)

    (** Get trade signal **)
    let get_trade_signal
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(btc_price: int64)
      : (int * int64) option Lwt.t =

      let%lwt result = call_get_method config
        ~_address:contract_address
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
        ~_address:contract_address
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
        ~_address:contract_address
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
      | PolicyCreated of {
          policy_id: int64;
          buyer: ton_address;
          coverage_type: int;
          chain_id: int;
          stablecoin_id: int;
          coverage_amount: int64;
          premium: int64;
          duration: int;
        }
      | PayoutExecuted of {
          policy_id: int64;
          beneficiary: ton_address;
          amount: int64;
        }
      | DepositMade of {
          tranche_id: int;
          depositor: ton_address;
          amount: int64;
        }
      | WithdrawalMade of {
          tranche_id: int;
          withdrawer: ton_address;
          amount: int64;
        }
      | LossAbsorbed of {
          tranche_id: int;
          loss_amount: int64;
        }
      | PremiumsDistributed of {
          premium_amount: int64;
        }
    [@@deriving sexp]

    (** Parse policy_created event from transaction body *)
    let parse_policy_created (_tx: transaction) : event_type option =
      (* In production, would decode BOC and extract fields *)
      (* For now, return None - to be implemented with proper BOC parsing *)
      None

    (** Parse deposit event from transaction *)
    let parse_deposit (_tx: transaction) : event_type option =
      None

    (** Parse withdrawal event from transaction *)
    let parse_withdrawal (_tx: transaction) : event_type option =
      None

    (** Parse event from transaction based on operation code *)
    let parse_event (_tx: transaction) : event_type option =
      (* Would inspect tx body to determine event type *)
      (* Operation codes:
         0x01 = create_policy
         0x02 = execute_payout
         0x03 = deposit
         0x04 = withdraw
         0x05 = absorb_loss
         0x06 = distribute_premiums
      *)
      None

    (** Poll for new events **)
    let poll_events
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(since_lt: int64)
      : event_type list Lwt.t =

      let%lwt transactions = get_transactions config
        ~_address:contract_address
        ~limit:50
      in

      (* Filter transactions after since_lt *)
      let new_transactions =
        List.filter transactions ~f:(fun tx -> Int64.(tx.lt > since_lt) && tx.success)
      in

      (* Parse events from transactions *)
      let events = List.filter_map new_transactions ~f:parse_event in

      Lwt.return events

    (** Get latest logical time for contract *)
    let get_latest_lt
        (config: ton_config)
        ~(contract_address: ton_address)
      : int64 option Lwt.t =

      let%lwt transactions = get_transactions config
        ~_address:contract_address
        ~limit:1
      in

      match List.hd transactions with
      | Some tx -> Lwt.return (Some tx.lt)
      | None -> Lwt.return None

    (** Subscribe to events with callback *)
    let subscribe
        (config: ton_config)
        ~(contract_address: ton_address)
        ~(initial_lt: int64 option)
        ~(poll_interval_seconds: float)
        ~(callback: event_type -> unit Lwt.t)
      : unit Lwt.t =

      (* Get starting logical time *)
      let%lwt start_lt = match initial_lt with
        | Some lt -> Lwt.return lt
        | None ->
            let%lwt latest_opt = get_latest_lt config ~contract_address in
            Lwt.return (Option.value latest_opt ~default:0L)
      in

      let last_lt = ref start_lt in

      let rec poll_loop () =
        let%lwt () =
          try%lwt
            let%lwt events = poll_events config
              ~contract_address
              ~since_lt:!last_lt
            in

            (* Process each event *)
            let%lwt () = Lwt_list.iter_s callback events in

            (* Update last_lt to latest *)
            let%lwt latest_opt = get_latest_lt config ~contract_address in
            (match latest_opt with
            | Some lt -> last_lt := lt
            | None -> ());

            Lwt.return ()
          with exn ->
            Lwt_io.eprintlf "Error polling events: %s" (Exn.to_string exn)
        in

        let%lwt () = Lwt_unix.sleep poll_interval_seconds in
        poll_loop ()
      in

      poll_loop ()

  end

end
