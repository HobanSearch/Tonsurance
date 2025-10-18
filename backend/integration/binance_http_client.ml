(** Binance Futures API Client with Resilient HTTP
 *
 * Binance Futures API client for perpetual contract hedging.
 * Features:
 * - Connection pooling and retry logic via ResilientHttpClient
 * - Weight-based rate limiting (1200 weight/minute)
 * - HMAC-SHA256 signature authentication
 * - Position management (open, close, modify)
 * - Real-time funding rates
 * - Account balance and P&L tracking
 *)

open Core
open Resilient_http_client.ResilientHttpClient

module BinanceFuturesClient = struct

  type position_side = Long | Short [@@deriving sexp]
  type order_side = Buy | Sell [@@deriving sexp]
  type order_type = Limit | Market | StopMarket [@@deriving sexp]

  type position = {
    symbol: string;
    side: position_side;
    size: float;
    entry_price: float;
    mark_price: float;
    unrealized_pnl: float;
    leverage: int;
    liquidation_price: float;
  } [@@deriving sexp]

  type order = {
    order_id: string;
    symbol: string;
    side: order_side;
    order_type: order_type;
    price: float;
    quantity: float;
    filled_quantity: float;
    status: string;
    timestamp: int64;
  } [@@deriving sexp]

  type funding_rate = {
    symbol: string;
    funding_rate: float;
    funding_time: int64;
    mark_price: float;
  } [@@deriving sexp]

  type config = {
    api_key: string;
    api_secret: string;
    http_client: t;
    testnet: bool;
  }

  let create ~(api_key: string) ~(api_secret: string) ?(testnet=false) () : config Lwt.t =
    let endpoints = if testnet then
      ["https://testnet.binancefuture.com"]
    else
      ["https://fapi.binance.com"; "https://fapi1.binance.com"; "https://fapi2.binance.com"]
    in

    let client_config = {
      name = "binance_futures";
      endpoints;
      timeout_seconds = 15.0;
      retry_policy = {
        max_attempts = 4;
        base_delay_ms = 500;
        max_delay_ms = 8000;
        backoff_multiplier = 2.0;
        jitter_factor = 0.25;
        retry_on_timeout = true;
        retry_on_connection_error = true;
        retry_on_5xx = true;
        retry_on_4xx = false;
      };
      circuit_breaker = {
        failure_threshold = 8;
        success_threshold = 4;
        timeout_seconds = 45.0;
        half_open_max_requests = 2;
      };
      pool = {
        max_connections = 20;
        max_idle_time_seconds = 240.0;
        connection_timeout_seconds = 4.0;
        health_check_interval_seconds = 30.0;
      };
      default_headers = [
        ("User-Agent", "Tonsurance/1.0 HedgeBot");
        ("Accept", "application/json");
        ("Content-Type", "application/json");
      ];
    } in

    let http_client = create client_config in
    Lwt.return { api_key; api_secret; http_client; testnet }

  (** Generate request signature *)
  let sign_request (secret: string) (query_string: string) : string =
    Digestif.SHA256.(hmac_string ~key:secret query_string |> to_hex)

  (** Build query string with signature *)
  let build_signed_query (config: config) (params: (string * string) list) : string =
    let timestamp = Int64.of_float ((Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) *. 1000.0) in
    let params_with_timestamp = ("timestamp", Int64.to_string timestamp) :: params in
    let query_string = List.map params_with_timestamp ~f:(fun (k, v) ->
      Printf.sprintf "%s=%s" k v
    ) |> String.concat ~sep:"&" in
    let signature = sign_request config.api_secret query_string in
    query_string ^ "&signature=" ^ signature

  (** Auth headers *)
  let auth_headers (config: config) : (string * string) list =
    [("X-MBX-APIKEY", config.api_key)]

  (** Get current position *)
  let get_position (config: config) ~(symbol: string) : (position option, error_type) Result.t Lwt.t =
    let query = build_signed_query config [("symbol", symbol)] in
    let url = Printf.sprintf "/fapi/v2/positionRisk?%s" query in
    let headers = auth_headers config in

    let%lwt result = get_json config.http_client ~headers url in
    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let positions = to_list json in
          match List.hd positions with
          | Some pos_json when (let amt_str = pos_json |> member "positionAmt" |> to_string in Float.(Float.of_string amt_str <> 0.0)) ->
              let pos_amt = pos_json |> member "positionAmt" |> to_float in
              let position = {
                symbol;
                side = if Float.(pos_amt > 0.0) then Long else Short;
                size = Float.abs pos_amt;
                entry_price = pos_json |> member "entryPrice" |> to_string |> Float.of_string;
                mark_price = pos_json |> member "markPrice" |> to_string |> Float.of_string;
                unrealized_pnl = pos_json |> member "unRealizedProfit" |> to_string |> Float.of_string;
                leverage = pos_json |> member "leverage" |> to_string |> Int.of_string;
                liquidation_price = pos_json |> member "liquidationPrice" |> to_string |> Float.of_string;
              } in
              Lwt.return (Ok (Some position))
          | _ -> Lwt.return (Ok None)
        with exn ->
          Lwt.return (Error (ParseError (Printf.sprintf "Parse error: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Create market order *)
  let create_market_order
      (config: config)
      ~(symbol: string)
      ~(side: order_side)
      ~(quantity: float)
    : (order, error_type) Result.t Lwt.t =

    let side_str = match side with Buy -> "BUY" | Sell -> "SELL" in
    let query = build_signed_query config [
      ("symbol", symbol);
      ("side", side_str);
      ("type", "MARKET");
      ("quantity", Printf.sprintf "%.4f" quantity);
    ] in

    let url = Printf.sprintf "/fapi/v1/order?%s" query in
    let headers = auth_headers config in

    let%lwt result = post config.http_client ~headers ~body:"" url in
    match result with
    | Ok response ->
        (try
          let json = Yojson.Safe.from_string response.body in
          let open Yojson.Safe.Util in
          let order = {
            order_id = json |> member "orderId" |> to_string;
            symbol;
            side;
            order_type = Market;
            price = 0.0;
            quantity;
            filled_quantity = json |> member "executedQty" |> to_string |> Float.of_string;
            status = json |> member "status" |> to_string;
            timestamp = json |> member "updateTime" |> to_int |> Int64.of_int;
          } in
          let%lwt () = Logs_lwt.info (fun m ->
            m "[BinanceFutures] Created %s market order: %s (qty: %.4f)"
              side_str order.order_id quantity
          ) in
          Lwt.return (Ok order)
        with exn ->
          Lwt.return (Error (ParseError (Printf.sprintf "Parse error: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Close position *)
  let close_position (config: config) ~(symbol: string) : (bool, error_type) Result.t Lwt.t =
    let%lwt pos_result = get_position config ~symbol in
    match pos_result with
    | Ok (Some position) ->
        let close_side = match position.side with Long -> Sell | Short -> Buy in
        let%lwt order_result = create_market_order config ~symbol ~side:close_side ~quantity:position.size in
        (match order_result with
        | Ok _ -> Lwt.return (Ok true)
        | Error e -> Lwt.return (Error e))
    | Ok None -> Lwt.return (Ok true) (* No position *)
    | Error e -> Lwt.return (Error e)

  (** Get funding rate *)
  let get_funding_rate (config: config) ~(symbol: string) : (funding_rate, error_type) Result.t Lwt.t =
    let url = Printf.sprintf "/fapi/v1/premiumIndex?symbol=%s" symbol in

    let%lwt result = get_json config.http_client url in
    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let fr = {
            symbol;
            funding_rate = json |> member "lastFundingRate" |> to_string |> Float.of_string;
            funding_time = json |> member "nextFundingTime" |> to_int |> Int64.of_int;
            mark_price = json |> member "markPrice" |> to_string |> Float.of_string;
          } in
          Lwt.return (Ok fr)
        with exn ->
          Lwt.return (Error (ParseError (Printf.sprintf "Parse error: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Get account balance *)
  let get_balance (config: config) : (float, error_type) Result.t Lwt.t =
    let query = build_signed_query config [] in
    let url = Printf.sprintf "/fapi/v2/account?%s" query in
    let headers = auth_headers config in

    let%lwt result = get_json config.http_client ~headers url in
    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let balance = json |> member "totalWalletBalance" |> to_string |> Float.of_string in
          Lwt.return (Ok balance)
        with exn ->
          Lwt.return (Error (ParseError (Printf.sprintf "Parse error: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  let get_metrics (config: config) : string Lwt.t =
    get_metrics config.http_client

  let health_check (config: config) : bool Lwt.t =
    health_check config.http_client

end
