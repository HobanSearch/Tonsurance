(** Rubic Bridge Client - Cross-Chain Bridge Aggregator Integration
 *
 * This module provides integration with Rubic API for cross-chain bridge operations
 * between TON and EVM chains (Ethereum, Arbitrum, Polygon, BNB Chain).
 *
 * Features:
 * - Best route aggregation across 360+ DEXs and 70+ bridges
 * - Quote fetching with fees, slippage, and execution time estimates
 * - Transaction execution with status tracking
 * - Support for 6 TON bridge providers (Retrobridge, Changelly, ChangeNOW, etc.)
 * - Automatic RPC provider configuration
 * - Rate limiting (300 requests/minute)
 *
 * API Documentation: https://docs.rubic.finance/rubic-api/api-integration
 *)

open Core
open Lwt.Syntax

module RubicBridgeClient = struct

  (** Blockchain identifiers *)
  type blockchain =
    | TON
    | Ethereum
    | Arbitrum
    | Polygon
    | BNB_Chain
    | Optimism
    | Base
  [@@deriving sexp, compare]

  (** RPC provider configuration *)
  type rpc_config = {
    blockchain: blockchain;
    rpc_urls: string list;
    api_key: string option;
  } [@@deriving sexp]

  (** Client configuration *)
  type config = {
    api_endpoint: string;
    referrer: string option; (* For fee sharing *)
    rpc_providers: rpc_config list;
    rate_limit_per_minute: int;
    timeout_seconds: float;
  } [@@deriving sexp]

  (** Token information *)
  type token = {
    blockchain: blockchain;
    address: string;
    symbol: string;
    decimals: int;
  } [@@deriving sexp]

  (** Bridge provider *)
  type bridge_provider =
    | Retrobridge
    | Changelly
    | ChangeNOW
    | SimpleSwap
    | Symbiosis
    | Bridgers
  [@@deriving sexp]

  (** Route quote from Rubic API *)
  type route_quote = {
    quote_id: string;
    src_token: token;
    dst_token: token;
    src_amount: float;
    dst_amount: float;
    dst_amount_min: float; (* After slippage *)
    provider: bridge_provider;
    execution_time_seconds: int;
    gas_fee_usd: float;
    bridge_fee_usd: float;
    protocol_fee_usd: float;
    total_fee_usd: float;
    price_impact_percent: float;
    slippage_tolerance_percent: float;
    estimated_arrival_time: float; (* Unix timestamp *)
  } [@@deriving sexp]

  (** Swap transaction data *)
  type swap_transaction = {
    tx_hash: string;
    src_tx_hash: string option;
    dst_tx_hash: string option;
    from_address: string;
    receiver_address: string;
    src_amount: float;
    dst_amount_expected: float;
    status: [`Pending | `Success | `Failed | `Refunded];
    created_at: float;
    updated_at: float;
  } [@@deriving sexp]

  (** Bridge transaction status *)
  type bridge_status = {
    src_tx_hash: string;
    dst_tx_hash: string option;
    status: [`Pending | `Confirming | `Success | `Failed | `Refunded | `Not_found];
    src_confirmations: int;
    dst_confirmations: int option;
    estimated_completion_time: float option;
    error_message: string option;
  } [@@deriving sexp]

  (** Error types *)
  type error =
    | API_error of int * string
    | Rate_limited
    | Network_error of string
    | Parse_error of string
    | Invalid_route of string
    | Insufficient_liquidity
    | Bridge_unavailable of string
  [@@deriving sexp]

  (** Convert blockchain to Rubic API identifier *)
  let blockchain_to_string (chain: blockchain) : string =
    match chain with
    | TON -> "TON"
    | Ethereum -> "ETH"
    | Arbitrum -> "ARBITRUM"
    | Polygon -> "POLYGON"
    | BNB_Chain -> "BSC"
    | Optimism -> "OPTIMISM"
    | Base -> "BASE"

  (** Convert string to blockchain *)
  let string_to_blockchain (s: string) : blockchain option =
    match String.uppercase s with
    | "TON" -> Some TON
    | "ETH" | "ETHEREUM" -> Some Ethereum
    | "ARBITRUM" -> Some Arbitrum
    | "POLYGON" | "MATIC" -> Some Polygon
    | "BSC" | "BNB" -> Some BNB_Chain
    | "OPTIMISM" -> Some Optimism
    | "BASE" -> Some Base
    | _ -> None

  (** Convert provider string to bridge_provider *)
  let string_to_provider (s: string) : bridge_provider =
    match String.lowercase s with
    | "retrobridge" -> Retrobridge
    | "changelly" -> Changelly
    | "changenow" -> ChangeNOW
    | "simpleswap" -> SimpleSwap
    | "symbiosis" -> Symbiosis
    | "bridgers" | "bridgers.xyz" -> Bridgers
    | _ -> Symbiosis (* Default fallback *)

  (** Rate limiter using token bucket *)
  module RateLimiter = struct
    type t = {
      mutable tokens: int;
      max_tokens: int;
      refill_rate_per_second: float;
      mutable last_refill: float;
      mutex: Lwt_mutex.t;
    }

    let create ~(max_requests_per_minute: int) : t =
      {
        tokens = max_requests_per_minute;
        max_tokens = max_requests_per_minute;
        refill_rate_per_second = Float.of_int max_requests_per_minute /. 60.0;
        last_refill = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        mutex = Lwt_mutex.create ();
      }

    let refill (limiter: t) : unit =
      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
      let elapsed = now -. limiter.last_refill in
      let new_tokens = Float.to_int (elapsed *. limiter.refill_rate_per_second) in
      if new_tokens > 0 then begin
        limiter.tokens <- Int.min (limiter.tokens + new_tokens) limiter.max_tokens;
        limiter.last_refill <- now
      end

    let acquire (limiter: t) ~(cost: int) : unit Lwt.t =
      Lwt_mutex.with_lock limiter.mutex (fun () ->
        let rec wait_for_tokens () =
          refill limiter;
          if limiter.tokens >= cost then begin
            limiter.tokens <- limiter.tokens - cost;
            Lwt.return ()
          end else
            let%lwt () = Lwt_unix.sleep 0.1 in
            wait_for_tokens ()
        in
        wait_for_tokens ()
      )
  end

  (** Global rate limiter instance *)
  let rate_limiter = RateLimiter.create ~max_requests_per_minute:300

  (** Get default RPC configuration *)
  let get_default_rpc_config (chain: blockchain) : rpc_config =
    let get_env_key _suffix =
      Printf.sprintf "%s_RPC_URL" (blockchain_to_string chain |> String.uppercase)
      |> Sys.getenv
    in
    let get_api_key _suffix =
      Printf.sprintf "%s_API_KEY" (blockchain_to_string chain |> String.uppercase)
      |> Sys.getenv
    in
    match chain with
    | TON ->
        let default_rpcs = [
          "https://toncenter.com/api/v2/jsonRPC";
          "https://mainnet.tonhubapi.com/jsonRPC"
        ] in
        let rpc_urls = Option.value_map (get_env_key "TON")
          ~default:default_rpcs
          ~f:(fun url -> [url] @ default_rpcs)
        in
        { blockchain = TON; rpc_urls; api_key = get_api_key "TON" }

    | Ethereum ->
        let default_rpcs = [
          "https://eth.llamarpc.com";
          "https://rpc.ankr.com/eth"
        ] in
        let rpc_urls = Option.value_map (get_env_key "ETH")
          ~default:default_rpcs
          ~f:(fun url -> [url] @ default_rpcs)
        in
        { blockchain = Ethereum; rpc_urls; api_key = get_api_key "ETH" }

    | Arbitrum ->
        let default_rpcs = [
          "https://arb1.arbitrum.io/rpc";
          "https://rpc.ankr.com/arbitrum"
        ] in
        let rpc_urls = Option.value_map (get_env_key "ARBITRUM")
          ~default:default_rpcs
          ~f:(fun url -> [url] @ default_rpcs)
        in
        { blockchain = Arbitrum; rpc_urls; api_key = get_api_key "ARBITRUM" }

    | Polygon ->
        let default_rpcs = [
          "https://polygon-rpc.com";
          "https://rpc.ankr.com/polygon"
        ] in
        let rpc_urls = Option.value_map (get_env_key "POLYGON")
          ~default:default_rpcs
          ~f:(fun url -> [url] @ default_rpcs)
        in
        { blockchain = Polygon; rpc_urls; api_key = get_api_key "POLYGON" }

    | BNB_Chain ->
        let default_rpcs = [
          "https://bsc-dataseed.binance.org";
          "https://rpc.ankr.com/bsc"
        ] in
        let rpc_urls = Option.value_map (get_env_key "BSC")
          ~default:default_rpcs
          ~f:(fun url -> [url] @ default_rpcs)
        in
        { blockchain = BNB_Chain; rpc_urls; api_key = get_api_key "BSC" }

    | Optimism ->
        let default_rpcs = [
          "https://mainnet.optimism.io";
          "https://rpc.ankr.com/optimism"
        ] in
        let rpc_urls = Option.value_map (get_env_key "OPTIMISM")
          ~default:default_rpcs
          ~f:(fun url -> [url] @ default_rpcs)
        in
        { blockchain = Optimism; rpc_urls; api_key = get_api_key "OPTIMISM" }

    | Base ->
        let default_rpcs = [
          "https://mainnet.base.org";
          "https://base.llamarpc.com"
        ] in
        let rpc_urls = Option.value_map (get_env_key "BASE")
          ~default:default_rpcs
          ~f:(fun url -> [url] @ default_rpcs)
        in
        { blockchain = Base; rpc_urls; api_key = get_api_key "BASE" }

  (** Create default configuration *)
  let create_default_config () : config =
    let chains = [TON; Ethereum; Arbitrum; Polygon; BNB_Chain] in
    let rpc_providers = List.map chains ~f:get_default_rpc_config in
    {
      api_endpoint = "https://api-v2.rubic.exchange/api";
      referrer = Some "tonsurance";
      rpc_providers;
      rate_limit_per_minute = 300;
      timeout_seconds = 30.0;
    }

  (** HTTP client helper using cohttp *)
  let http_post
      ~(config: config)
      ~(endpoint: string)
      ~(body: Yojson.Safe.t)
    : (Yojson.Safe.t, error) result Lwt.t =

    let open Cohttp in
    let open Cohttp_lwt_unix in

    try%lwt
      (* Acquire rate limit token *)
      let%lwt () = RateLimiter.acquire rate_limiter ~cost:1 in

      let url = Printf.sprintf "%s%s" config.api_endpoint endpoint in
      let headers = Header.init () in
      let headers = Header.add headers "Content-Type" "application/json" in
      let headers = Header.add headers "Accept" "application/json" in

      let body_string = Yojson.Safe.to_string body in
      let body_cohttp = Cohttp_lwt.Body.of_string body_string in

      (* Make HTTP request with timeout *)
      let request_promise = Client.post ~headers ~body:body_cohttp (Uri.of_string url) in
      let timeout_promise =
        let%lwt () = Lwt_unix.sleep config.timeout_seconds in
        Lwt.return (`Timeout)
      in

      let%lwt result = Lwt.pick [
        (let%lwt (resp, body) = request_promise in Lwt.return (`Response (resp, body)));
        timeout_promise
      ] in

      match result with
      | `Timeout ->
          Lwt.return (Error (Network_error "Request timeout"))

      | `Response (resp, body) ->
          let status = Response.status resp in
          let%lwt body_string = Cohttp_lwt.Body.to_string body in

          if Code.is_success (Code.code_of_status status) then
            try
              let json = Yojson.Safe.from_string body_string in
              Lwt.return (Ok json)
            with _ ->
              Lwt.return (Error (Parse_error "Failed to parse JSON response"))
          else if Code.code_of_status status = 429 then
            Lwt.return (Error Rate_limited)
          else
            let error_msg = Printf.sprintf "HTTP %d: %s"
              (Code.code_of_status status) body_string
            in
            Lwt.return (Error (API_error (Code.code_of_status status, error_msg)))

    with exn ->
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** HTTP GET helper *)
  let http_get
      ~(config: config)
      ~(endpoint: string)
    : (Yojson.Safe.t, error) result Lwt.t =

    let open Cohttp in
    let open Cohttp_lwt_unix in

    try%lwt
      let%lwt () = RateLimiter.acquire rate_limiter ~cost:1 in

      let url = Printf.sprintf "%s%s" config.api_endpoint endpoint in
      let headers = Header.init () in
      let headers = Header.add headers "Accept" "application/json" in

      let request_promise = Client.get ~headers (Uri.of_string url) in
      let timeout_promise =
        let%lwt () = Lwt_unix.sleep config.timeout_seconds in
        Lwt.return (`Timeout)
      in

      let%lwt result = Lwt.pick [
        (let%lwt (resp, body) = request_promise in Lwt.return (`Response (resp, body)));
        timeout_promise
      ] in

      match result with
      | `Timeout ->
          Lwt.return (Error (Network_error "Request timeout"))

      | `Response (resp, body) ->
          let status = Response.status resp in
          let%lwt body_string = Cohttp_lwt.Body.to_string body in

          if Code.is_success (Code.code_of_status status) then
            try
              let json = Yojson.Safe.from_string body_string in
              Lwt.return (Ok json)
            with _ ->
              Lwt.return (Error (Parse_error "Failed to parse JSON response"))
          else if Code.code_of_status status = 429 then
            Lwt.return (Error Rate_limited)
          else
            let error_msg = Printf.sprintf "HTTP %d: %s"
              (Code.code_of_status status) body_string
            in
            Lwt.return (Error (API_error (Code.code_of_status status, error_msg)))

    with exn ->
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** Parse route quote from JSON *)
  let parse_route_quote (json: Yojson.Safe.t) : (route_quote, error) result =
    try
      let open Yojson.Safe.Util in

      let src_blockchain_str = json |> member "fromBlockchain" |> to_string in
      let dst_blockchain_str = json |> member "toBlockchain" |> to_string in

      let src_blockchain =
        Option.value_exn (string_to_blockchain src_blockchain_str)
          ~message:"Invalid source blockchain"
      in
      let dst_blockchain =
        Option.value_exn (string_to_blockchain dst_blockchain_str)
          ~message:"Invalid destination blockchain"
      in

      let src_token = {
        blockchain = src_blockchain;
        address = json |> member "fromToken" |> member "address" |> to_string;
        symbol = json |> member "fromToken" |> member "symbol" |> to_string;
        decimals = json |> member "fromToken" |> member "decimals" |> to_int;
      } in

      let dst_token = {
        blockchain = dst_blockchain;
        address = json |> member "toToken" |> member "address" |> to_string;
        symbol = json |> member "toToken" |> member "symbol" |> to_string;
        decimals = json |> member "toToken" |> member "decimals" |> to_int;
      } in

      let provider_str = json |> member "provider" |> member "name" |> to_string in
      let provider = string_to_provider provider_str in

      let src_amount = json |> member "fromTokenAmount" |> to_string |> Float.of_string in
      let dst_amount = json |> member "toTokenAmount" |> to_string |> Float.of_string in
      let dst_amount_min = json |> member "toTokenAmountMin" |> to_string |> Float.of_string in

      let gas_fee_usd =
        json |> member "gasFee" |> member "amount" |> to_string
        |> Float.of_string_opt |> Option.value ~default:0.0
      in

      let bridge_fee_usd =
        json |> member "bridgeFee" |> member "amount" |> to_string
        |> Float.of_string_opt |> Option.value ~default:0.0
      in

      let protocol_fee_usd =
        json |> member "protocolFee" |> member "amount" |> to_string
        |> Float.of_string_opt |> Option.value ~default:0.0
      in

      let total_fee_usd = gas_fee_usd +. bridge_fee_usd +. protocol_fee_usd in

      let price_impact =
        json |> member "priceImpact" |> to_string |> Float.of_string_opt
        |> Option.value ~default:0.0
      in

      let slippage =
        json |> member "slippageTolerance" |> to_string |> Float.of_string_opt
        |> Option.value ~default:1.0
      in

      let execution_time =
        json |> member "estimatedExecutionTime" |> to_int_option
        |> Option.value ~default:300
      in

      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
      let estimated_arrival = now +. Float.of_int execution_time in

      let quote_id = json |> member "id" |> to_string_option |> Option.value ~default:"unknown" in

      Ok {
        quote_id;
        src_token;
        dst_token;
        src_amount;
        dst_amount;
        dst_amount_min;
        provider;
        execution_time_seconds = execution_time;
        gas_fee_usd;
        bridge_fee_usd;
        protocol_fee_usd;
        total_fee_usd;
        price_impact_percent = price_impact;
        slippage_tolerance_percent = slippage;
        estimated_arrival_time = estimated_arrival;
      }

    with
    | Yojson.Safe.Util.Type_error (msg, _) ->
        Error (Parse_error msg)
    | exn ->
        Error (Parse_error (Exn.to_string exn))

  (** Fetch best route quote from Rubic API
   *
   * Requests the best cross-chain bridge route between two tokens.
   * Rubic aggregates across 360+ DEXs and 70+ bridges.
   *)
  let get_best_quote
      ~(config: config)
      ~(src_token: token)
      ~(dst_token: token)
      ~(amount: float)
      ~(from_address: string option)
      ~(slippage_tolerance: float option)
    : (route_quote, error) result Lwt.t =

    try%lwt
      let slippage = Option.value slippage_tolerance ~default:1.0 in

      let request_body = `Assoc [
        ("srcTokenAddress", `String src_token.address);
        ("srcTokenAmount", `String (Float.to_string amount));
        ("srcTokenBlockchain", `String (blockchain_to_string src_token.blockchain));
        ("dstTokenAddress", `String dst_token.address);
        ("dstTokenBlockchain", `String (blockchain_to_string dst_token.blockchain));
        ("slippageTolerance", `Float slippage);
      ] in

      let request_body = match config.referrer with
        | Some ref ->
            let (`Assoc fields) = request_body in
            `Assoc (fields @ [("referrer", `String ref)])
        | None -> request_body
      in

      let request_body = match from_address with
        | Some addr ->
            let (`Assoc fields) = request_body in
            `Assoc (fields @ [("fromAddress", `String addr)])
        | None -> request_body
      in

      let%lwt response = http_post ~config ~endpoint:"/routes/quoteBest" ~body:request_body in

      match response with
      | Ok json ->
          let quote_result = parse_route_quote json in
          (match quote_result with
          | Ok quote -> Lwt.return (Ok quote)
          | Error err -> Lwt.return (Error err)
          )

      | Error err ->
          Lwt.return (Error err)

    with exn ->
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** Build swap transaction from quote
   *
   * Generates transaction data for executing the bridge swap.
   * Returns transaction that should be sent via wallet (TonConnect, MetaMask, etc.)
   *)
  let build_swap_transaction
      ~(config: config)
      ~(quote: route_quote)
      ~(from_address: string)
      ~(receiver_address: string option)
    : (Yojson.Safe.t, error) result Lwt.t =

    try%lwt
      let receiver = Option.value receiver_address ~default:from_address in

      let request_body = `Assoc [
        ("quoteId", `String quote.quote_id);
        ("fromAddress", `String from_address);
        ("receiverAddress", `String receiver);
        ("srcTokenAddress", `String quote.src_token.address);
        ("srcTokenAmount", `String (Float.to_string quote.src_amount));
        ("srcTokenBlockchain", `String (blockchain_to_string quote.src_token.blockchain));
        ("dstTokenAddress", `String quote.dst_token.address);
        ("dstTokenBlockchain", `String (blockchain_to_string quote.dst_token.blockchain));
      ] in

      let request_body = match config.referrer with
        | Some ref ->
            let (`Assoc fields) = request_body in
            `Assoc (fields @ [("referrer", `String ref)])
        | None -> request_body
      in

      let%lwt response = http_post ~config ~endpoint:"/routes/swap" ~body:request_body in

      match response with
      | Ok json -> Lwt.return (Ok json)
      | Error err -> Lwt.return (Error err)

    with exn ->
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** Get bridge transaction status
   *
   * Tracks the status of a cross-chain bridge transaction.
   * Bridge transactions have two tx hashes: source chain and destination chain.
   *)
  let get_transaction_status
      ~(config: config)
      ~(src_tx_hash: string)
    : (bridge_status, error) result Lwt.t =

    try%lwt
      let endpoint = Printf.sprintf "/routes/status?srcTxHash=%s" src_tx_hash in
      let%lwt response = http_get ~config ~endpoint in

      match response with
      | Ok json ->
          (try
            let open Yojson.Safe.Util in

            let status_str = json |> member "status" |> to_string in
            let status = match String.lowercase status_str with
              | "pending" -> `Pending
              | "confirming" -> `Confirming
              | "success" | "completed" -> `Success
              | "failed" -> `Failed
              | "refunded" -> `Refunded
              | _ -> `Not_found
            in

            let dst_tx_hash = json |> member "dstTxHash" |> to_string_option in

            let src_confirmations =
              json |> member "srcConfirmations" |> to_int_option |> Option.value ~default:0
            in

            let dst_confirmations = json |> member "dstConfirmations" |> to_int_option in

            let estimated_completion =
              json |> member "estimatedCompletionTime" |> to_float_option
            in

            let error_message = json |> member "errorMessage" |> to_string_option in

            let bridge_status = {
              src_tx_hash;
              dst_tx_hash;
              status;
              src_confirmations;
              dst_confirmations;
              estimated_completion_time = estimated_completion;
              error_message;
            } in

            Lwt.return (Ok bridge_status)

          with
          | Yojson.Safe.Util.Type_error (msg, _) ->
              Lwt.return (Error (Parse_error msg))
          | exn ->
              Lwt.return (Error (Parse_error (Exn.to_string exn)))
          )

      | Error err ->
          Lwt.return (Error err)

    with exn ->
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** Get supported tokens for a blockchain *)
  let get_supported_tokens
      ~(config: config)
      ~(blockchain: blockchain)
    : (token list, error) result Lwt.t =

    try%lwt
      let chain_str = blockchain_to_string blockchain in
      let endpoint = Printf.sprintf "/routes/tokens?blockchain=%s" chain_str in
      let%lwt response = http_get ~config ~endpoint in

      match response with
      | Ok json ->
          (try
            let open Yojson.Safe.Util in
            let tokens_json = json |> to_list in

            let tokens = List.filter_map tokens_json ~f:(fun token_json ->
              try
                let address = token_json |> member "address" |> to_string in
                let symbol = token_json |> member "symbol" |> to_string in
                let decimals = token_json |> member "decimals" |> to_int in
                Some { blockchain; address; symbol; decimals }
              with _ -> None
            ) in

            Lwt.return (Ok tokens)

          with
          | Yojson.Safe.Util.Type_error (msg, _) ->
              Lwt.return (Error (Parse_error msg))
          | exn ->
              Lwt.return (Error (Parse_error (Exn.to_string exn)))
          )

      | Error err ->
          Lwt.return (Error err)

    with exn ->
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** Estimate gas cost for bridge transaction *)
  let estimate_gas_cost
      ~(quote: route_quote)
    : float =
    quote.gas_fee_usd +. quote.bridge_fee_usd +. quote.protocol_fee_usd

  (** Calculate effective exchange rate including all fees *)
  let calculate_effective_rate
      ~(quote: route_quote)
    : float =
    let total_cost_in_src = quote.src_amount +. (quote.total_fee_usd /. quote.src_amount *. quote.src_amount) in
    quote.dst_amount /. total_cost_in_src

  (** Check if quote is still valid (quotes expire after 30 seconds) *)
  let is_quote_valid
      ~(quote: route_quote)
    : bool =
    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let quote_age = now -. (quote.estimated_arrival_time -. Float.of_int quote.execution_time_seconds) in
    Float.(quote_age < 30.0)

end
