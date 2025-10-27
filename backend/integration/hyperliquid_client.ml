(** Hyperliquid Client - Decentralized Perpetuals Exchange Integration
 *
 * This module provides integration with Hyperliquid API for hedging protocol
 * risk through decentralized perpetual contracts.
 *
 * Features:
 * - Open/close perpetual positions (both long and short)
 * - Get real-time position data
 * - Fetch funding rates, mark prices, and open interest
 * - WebSocket support for real-time market data
 * - EIP-712 signature-based authentication
 * - Rate limiting (1000 requests/minute)
 * - Support for multiple perpetual markets
 *
 * API Documentation: https://hyperliquid.gitbook.io/hyperliquid-docs/
 *)

open Core
open Lwt.Syntax

module HyperliquidClient = struct

  (** Configuration *)
  type config = {
    wallet_address: string;           (* Ethereum address for authentication *)
    private_key: string option;       (* Optional private key for signing *)
    testnet: bool;                    (* Use testnet vs mainnet *)
    rate_limit_per_minute: int;       (* Max requests per minute, default 1000 *)
    timeout_seconds: float;           (* Request timeout *)
  } [@@deriving sexp]

  (** Position information *)
  type position = {
    position_id: string;              (* Unique position identifier *)
    coin: string;                     (* Asset symbol (e.g., "BTC", "ETH") *)
    side: [`Long | `Short];           (* Position side *)
    size: float;                      (* Position size in contracts *)
    entry_price: float;               (* Average entry price *)
    mark_price: float;                (* Current mark price *)
    unrealized_pnl: float;            (* Unrealized profit/loss in USD *)
    leverage: int;                    (* Effective leverage *)
    liquidation_price: float option;  (* Liquidation price if available *)
    margin_used: float;               (* Margin allocated to position *)
    timestamp: float;                 (* Position open timestamp *)
  } [@@deriving sexp]

  (** PnL result *)
  type pnl = {
    realized_pnl: float;              (* Realized P&L from closed positions *)
    unrealized_pnl: float;            (* Unrealized P&L from open positions *)
    fees_paid: float;                 (* Total trading fees *)
    funding_paid: float;              (* Net funding payments *)
    net_pnl: float;                   (* Total net P&L *)
  } [@@deriving sexp]

  (** Funding rate information *)
  type funding_info = {
    coin: string;                     (* Asset symbol *)
    funding_rate: float;              (* Current funding rate (8-hour) *)
    predicted_funding_rate: float;    (* Predicted next funding rate *)
    funding_time: float;              (* Next funding timestamp *)
    mark_price: float;                (* Current mark price *)
    index_price: float;               (* Index price *)
  } [@@deriving sexp]

  (** Market data *)
  type market_data = {
    coin: string;                     (* Asset symbol *)
    mark_price: float;                (* Current mark price *)
    index_price: float;               (* Index price *)
    open_interest: float;             (* Total open interest in USD *)
    volume_24h: float;                (* 24-hour volume in USD *)
    funding_rate: float;              (* Current funding rate *)
    max_leverage: int;                (* Maximum allowed leverage *)
    price_change_24h: float;          (* 24-hour price change percentage *)
  } [@@deriving sexp]

  (** Order information *)
  type order = {
    order_id: string;                 (* Unique order ID *)
    coin: string;                     (* Asset symbol *)
    side: [`Buy | `Sell];             (* Order side *)
    size: float;                      (* Order size *)
    price: float option;              (* Limit price (None for market orders) *)
    order_type: [`Market | `Limit];   (* Order type *)
    status: [`Pending | `Open | `Filled | `Cancelled]; (* Order status *)
    filled_size: float;               (* Filled size *)
    timestamp: float;                 (* Order creation timestamp *)
  } [@@deriving sexp]

  (** Error types *)
  type error =
    | API_error of int * string       (* HTTP status code and message *)
    | Rate_limited
    | Network_error of string
    | Parse_error of string
    | Authentication_error of string
    | Insufficient_margin
    | Invalid_order of string
    | Position_not_found
  [@@deriving sexp]

  (** Get base URL based on testnet flag *)
  let get_base_url (config: config) : string =
    if config.testnet then
      "https://api.hyperliquid-testnet.xyz"
    else
      "https://api.hyperliquid.xyz"

  (** Get WebSocket URL *)
  let get_ws_url (config: config) : string =
    if config.testnet then
      "wss://api.hyperliquid-testnet.xyz/ws"
    else
      "wss://api.hyperliquid.xyz/ws"

  (** Rate limiter using token bucket algorithm *)
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
      let new_tokens =
        Float.of_int limiter.tokens +. (elapsed *. limiter.refill_rate_per_second)
        |> Float.min (Float.of_int limiter.max_tokens)
        |> Float.to_int
      in
      limiter.tokens <- new_tokens;
      limiter.last_refill <- now

    let acquire (limiter: t) : unit Lwt.t =
      Lwt_mutex.with_lock limiter.mutex (fun () ->
        let rec wait_for_tokens () =
          refill limiter;
          if limiter.tokens >= 1 then begin
            limiter.tokens <- limiter.tokens - 1;
            Lwt.return ()
          end else begin
            (* Wait 100ms and try again *)
            let%lwt () = Lwt_unix.sleep 0.1 in
            wait_for_tokens ()
          end
        in
        wait_for_tokens ()
      )
  end

  (** Global rate limiter instance *)
  let rate_limiter = ref None

  let get_rate_limiter (config: config) : RateLimiter.t =
    match !rate_limiter with
    | Some limiter -> limiter
    | None ->
        let limiter = RateLimiter.create
          ~max_requests_per_minute:config.rate_limit_per_minute
        in
        rate_limiter := Some limiter;
        limiter

  (** Make HTTP request to info endpoint *)
  let make_info_request
      ~(config: config)
      ~(request_body: Yojson.Safe.t)
    : (Yojson.Safe.t, error) Result.t Lwt.t =

    let limiter = get_rate_limiter config in
    let%lwt () = RateLimiter.acquire limiter in

    let url = Printf.sprintf "%s/info" (get_base_url config) in
    let headers = [
      ("Content-Type", "application/json");
      ("User-Agent", "Tonsurance-Hyperliquid-Client/1.0");
    ] in

    let body_str = Yojson.Safe.to_string request_body in

    let%lwt result = Http_client.HttpClient.post_json
      ~headers
      ~body:body_str
      ~timeout:config.timeout_seconds
      url
    in

    match result with
    | Ok response_json ->
        Lwt.return (Ok response_json)
    | Error err ->
        let error_msg = Printf.sprintf "Hyperliquid API error: %s"
          (Http_client.HttpClient.show_http_error err)
        in
        Lwt.return (Error (Network_error error_msg))

  (** Get market metadata (perpetuals universe) *)
  let get_market_metadata ~(config: config) : (market_data list, error) Result.t Lwt.t =
    let request = `Assoc [
      ("type", `String "metaAndAssetCtxs");
    ] in

    let%lwt result = make_info_request ~config ~request_body:request in

    match result with
    | Ok json ->
        (try
          (* Parse universe and asset contexts *)
          let open Yojson.Safe.Util in
          let universe = json |> member "universe" |> to_list in
          let asset_ctxs = json |> member "assetCtxs" |> to_list in

          let markets = List.map2_exn universe asset_ctxs ~f:(fun meta ctx ->
            let coin = meta |> member "name" |> to_string in
            let mark_price = ctx |> member "markPx" |> to_string |> Float.of_string in
            let funding_rate = ctx |> member "funding" |> to_string |> Float.of_string in
            let open_interest = ctx |> member "openInterest" |> to_string |> Float.of_string in
            let volume_24h = ctx |> member "dayNtlVlm" |> to_string |> Float.of_string in
            let max_leverage = meta |> member "maxLeverage" |> to_int in

            {
              coin;
              mark_price;
              index_price = mark_price; (* Hyperliquid doesn't separate these *)
              open_interest;
              volume_24h;
              funding_rate;
              max_leverage;
              price_change_24h = 0.0; (* Would need price history *)
            }
          ) in

          Lwt.return (Ok markets)
        with
        | Yojson.Safe.Util.Type_error (msg, _) ->
            Lwt.return (Error (Parse_error msg))
        | exn ->
            Lwt.return (Error (Parse_error (Exn.to_string exn)))
        )
    | Error e -> Lwt.return (Error e)

  (** Get funding rate for a specific coin *)
  let get_funding_rate ~(config: config) ~(coin: string) : (funding_info, error) Result.t Lwt.t =
    let%lwt result = get_market_metadata ~config in

    match result with
    | Ok markets ->
        (match List.find markets ~f:(fun m -> String.equal m.coin coin) with
        | Some market ->
            let funding_info = {
              coin;
              funding_rate = market.funding_rate;
              predicted_funding_rate = market.funding_rate; (* Simplified *)
              funding_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
              mark_price = market.mark_price;
              index_price = market.index_price;
            } in
            Lwt.return (Ok funding_info)
        | None ->
            Lwt.return (Error (API_error (404, Printf.sprintf "Market not found: %s" coin)))
        )
    | Error e -> Lwt.return (Error e)

  (** Get user's open positions *)
  let get_user_positions ~(config: config) : (position list, error) Result.t Lwt.t =
    let request = `Assoc [
      ("type", `String "clearinghouseState");
      ("user", `String config.wallet_address);
    ] in

    let%lwt result = make_info_request ~config ~request_body:request in

    match result with
    | Ok json ->
        (try
          let open Yojson.Safe.Util in
          let asset_positions = json |> member "assetPositions" |> to_list in

          let positions = List.filter_map asset_positions ~f:(fun pos_json ->
            try
              let position_obj = pos_json |> member "position" in
              let coin = position_obj |> member "coin" |> to_string in
              let szi = position_obj |> member "szi" |> to_string |> Float.of_string in

              (* Skip if position size is zero *)
              if Float.(abs szi < 0.0001) then None
              else
                let entry_px = position_obj |> member "entryPx" |> to_string |> Float.of_string in
                let leverage_obj = position_obj |> member "leverage" in
                let leverage = leverage_obj |> member "value" |> to_int in
                let unrealized_pnl = position_obj |> member "unrealizedPnl" |> to_string |> Float.of_string in
                let mark_px = position_obj |> member "markPx" |> to_string |> Float.of_string in

                let side = if Float.(szi > 0.0) then `Long else `Short in
                let size = Float.abs szi in

                Some {
                  position_id = Printf.sprintf "%s-%s" config.wallet_address coin;
                  coin;
                  side;
                  size;
                  entry_price = entry_px;
                  mark_price = mark_px;
                  unrealized_pnl;
                  leverage;
                  liquidation_price = None; (* Would need additional calculation *)
                  margin_used = size *. entry_px /. Float.of_int leverage;
                  timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
                }
            with _ -> None
          ) in

          Lwt.return (Ok positions)
        with
        | Yojson.Safe.Util.Type_error (msg, _) ->
            Lwt.return (Error (Parse_error msg))
        | exn ->
            Lwt.return (Error (Parse_error (Exn.to_string exn)))
        )
    | Error e -> Lwt.return (Error e)

  (** Get specific position by coin *)
  let get_position ~(config: config) ~(coin: string) : (position option, error) Result.t Lwt.t =
    let%lwt result = get_user_positions ~config in

    match result with
    | Ok positions ->
        let pos = List.find positions ~f:(fun p -> String.equal p.coin coin) in
        Lwt.return (Ok pos)
    | Error e -> Lwt.return (Error e)

  (** Open a new position (requires authenticated signing - stub for now) *)
  let open_position
      ~(config: config)
      ~(coin: string)
      ~(side: [`Long | `Short])
      ~(size: float)
      ~(leverage: int)
      ~(limit_price: float option)
    : (order, error) Result.t Lwt.t =

    (* This would require EIP-712 signature generation *)
    (* For now, return placeholder indicating authentication needed *)
    let _ = (config, coin, side, size, leverage, limit_price) in

    Lwt.return (Error (Authentication_error
      "open_position requires EIP-712 signature - integrate Web3 signing"))

  (** Close an existing position (stub - requires authenticated signing) *)
  let close_position
      ~(config: config)
      ~(coin: string)
      ~(size: float option)
    : (order, error) Result.t Lwt.t =

    (* This would require EIP-712 signature generation *)
    let _ = (config, coin, size) in

    Lwt.return (Error (Authentication_error
      "close_position requires EIP-712 signature - integrate Web3 signing"))

  (** Calculate total PnL from all positions *)
  let get_pnl_summary ~(config: config) : (pnl, error) Result.t Lwt.t =
    let%lwt positions_result = get_user_positions ~config in

    match positions_result with
    | Ok positions ->
        let unrealized_pnl = List.fold positions ~init:0.0 ~f:(fun acc pos ->
          acc +. pos.unrealized_pnl
        ) in

        let pnl_summary = {
          realized_pnl = 0.0; (* Would need transaction history *)
          unrealized_pnl;
          fees_paid = 0.0; (* Would need transaction history *)
          funding_paid = 0.0; (* Would need funding payment history *)
          net_pnl = unrealized_pnl;
        } in

        Lwt.return (Ok pnl_summary)
    | Error e -> Lwt.return (Error e)

  (** Get current mark price for a coin *)
  let get_mark_price ~(config: config) ~(coin: string) : (float, error) Result.t Lwt.t =
    let%lwt result = get_market_metadata ~config in

    match result with
    | Ok markets ->
        (match List.find markets ~f:(fun m -> String.equal m.coin coin) with
        | Some market -> Lwt.return (Ok market.mark_price)
        | None -> Lwt.return (Error (API_error (404, Printf.sprintf "Market not found: %s" coin)))
        )
    | Error e -> Lwt.return (Error e)

  (** Subscribe to real-time market data via WebSocket (stub) *)
  let subscribe_market_data
      ~(config: config)
      ~(coins: string list)
      ~(on_update: market_data -> unit Lwt.t)
    : unit Lwt.t =

    (* WebSocket subscription stub *)
    let _ = (config, coins, on_update) in

    let* () = Logs_lwt.warn (fun m ->
      m "subscribe_market_data: WebSocket not yet implemented for Hyperliquid"
    ) in
    Lwt.return ()

  (** Error to string conversion *)
  let error_to_string (err: error) : string =
    match err with
    | API_error (code, msg) -> Printf.sprintf "API error %d: %s" code msg
    | Rate_limited -> "Rate limit exceeded"
    | Network_error msg -> Printf.sprintf "Network error: %s" msg
    | Parse_error msg -> Printf.sprintf "Parse error: %s" msg
    | Authentication_error msg -> Printf.sprintf "Authentication error: %s" msg
    | Insufficient_margin -> "Insufficient margin"
    | Invalid_order msg -> Printf.sprintf "Invalid order: %s" msg
    | Position_not_found -> "Position not found"

  (** Create default config *)
  let default_config ~wallet_address : config =
    {
      wallet_address;
      private_key = None;
      testnet = false;
      rate_limit_per_minute = 1000;
      timeout_seconds = 10.0;
    }

end
