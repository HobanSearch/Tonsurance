(** Polymarket CLOB API Client with Resilient HTTP
 *
 * Polymarket Central Limit Order Book (CLOB) API client for hedge execution.
 * Features:
 * - Connection pooling and retry logic via ResilientHttpClient
 * - Rate limiting (10 req/s, burst 20)
 * - API key authentication
 * - Order management (create, cancel, status)
 * - Market data fetching
 * - Signature-based authentication for private endpoints
 *)

open Core
open Resilient_http_client.ResilientHttpClient

module PolymarketClient = struct

  (** ============================================
      TYPE DEFINITIONS
      ============================================ *)

  (** Market side *)
  type side =
    | Buy
    | Sell
  [@@deriving sexp]

  let side_to_string = function
    | Buy -> "BUY"
    | Sell -> "SELL"

  (** Order type *)
  type order_type =
    | Limit
    | Market
  [@@deriving sexp]

  let order_type_to_string = function
    | Limit -> "LIMIT"
    | Market -> "MARKET"

  (** Order status *)
  type order_status =
    | Open
    | Filled
    | PartiallyFilled
    | Cancelled
    | Expired
  [@@deriving sexp]

  (** Market info *)
  type market_info = {
    condition_id: string;
    question: string;
    outcome: string;
    yes_price: float;
    no_price: float;
    volume_24h: float;
    liquidity: float;
  } [@@deriving sexp]

  (** Order *)
  type order = {
    order_id: string;
    market_id: string;
    side: side;
    order_type: order_type;
    price: float;
    size: float;
    filled_size: float;
    status: order_status;
    created_at: float;
    updated_at: float;
  } [@@deriving sexp]

  (** Trade *)
  type trade = {
    trade_id: string;
    order_id: string;
    market_id: string;
    side: side;
    price: float;
    size: float;
    fee: float;
    timestamp: float;
  } [@@deriving sexp]

  (** Client configuration *)
  type config = {
    api_key: string;
    api_secret: string; (* For signing requests *)
    http_client: t;
  }

  (** ============================================
      CLIENT CREATION
      ============================================ *)

  let create
      ~(api_key: string)
      ~(api_secret: string)
    : config Lwt.t =

    (* Load configuration from http_clients.json *)
    let client_config = {
      name = "polymarket_clob";
      endpoints = [
        "https://clob.polymarket.com";
        "https://api.polymarket.com";
      ];
      timeout_seconds = 20.0;
      retry_policy = {
        max_attempts = 3;
        base_delay_ms = 500;
        max_delay_ms = 5000;
        backoff_multiplier = 2.0;
        jitter_factor = 0.3;
        retry_on_timeout = true;
        retry_on_connection_error = true;
        retry_on_5xx = true;
        retry_on_4xx = false;
      };
      circuit_breaker = {
        failure_threshold = 10;
        success_threshold = 3;
        timeout_seconds = 60.0;
        half_open_max_requests = 2;
      };
      pool = {
        max_connections = 15;
        max_idle_time_seconds = 180.0;
        connection_timeout_seconds = 3.0;
        health_check_interval_seconds = 45.0;
      };
      default_headers = [
        ("User-Agent", "Tonsurance/1.0 HedgeBot");
        ("Accept", "application/json");
        ("Content-Type", "application/json");
      ];
    } in

    let http_client = create client_config in

    Lwt.return { api_key; api_secret; http_client }

  (** ============================================
      AUTHENTICATION
      ============================================ *)

  (** Generate request signature *)
  let sign_request
      (secret: string)
      (timestamp: int)
      (method_: string)
      (path: string)
      (body: string option)
    : string =
    (* HMAC-SHA256 signature *)
    let body_str = Option.value body ~default:"" in
    let message = Printf.sprintf "%d%s%s%s" timestamp method_ path body_str in
    let hmac = Digestif.SHA256.(hmac_string ~key:secret message |> to_hex) in
    hmac

  (** Add authentication headers *)
  let auth_headers (config: config) (method_: string) (path: string) (body: string option) : (string * string) list =
    let timestamp = Int.of_float (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) in
    let signature = sign_request config.api_secret timestamp method_ path body in
    [
      ("X-API-Key", config.api_key);
      ("X-Timestamp", Int.to_string timestamp);
      ("X-Signature", signature);
    ]

  (** ============================================
      MARKET DATA (PUBLIC)
      ============================================ *)

  (** Get market information *)
  let get_market
      (config: config)
      ~(condition_id: string)
    : (market_info, error_type) Result.t Lwt.t =

    let url = Printf.sprintf "/markets/%s" condition_id in
    let%lwt result = get_json config.http_client url in

    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let market = {
            condition_id = json |> member "condition_id" |> to_string;
            question = json |> member "question" |> to_string;
            outcome = json |> member "outcome" |> to_string;
            yes_price = json |> member "yes_price" |> to_float;
            no_price = json |> member "no_price" |> to_float;
            volume_24h = json |> member "volume_24h" |> to_float;
            liquidity = json |> member "liquidity" |> to_float;
          } in
          Lwt.return (Ok market)
        with exn ->
          Lwt.return (Error (ParseError (
            Printf.sprintf "Failed to parse market info: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Get order book *)
  let get_orderbook
      (config: config)
      ~(market_id: string)
    : (Yojson.Safe.t, error_type) Result.t Lwt.t =

    let url = Printf.sprintf "/book/%s" market_id in
    get_json config.http_client url

  (** Get recent trades *)
  let get_trades
      (config: config)
      ~(market_id: string)
      ~(limit: int)
    : (Yojson.Safe.t, error_type) Result.t Lwt.t =

    let url = Printf.sprintf "/trades/%s?limit=%d" market_id limit in
    get_json config.http_client url

  (** ============================================
      ORDER MANAGEMENT (PRIVATE)
      ============================================ *)

  (** Create limit order *)
  let create_limit_order
      (config: config)
      ~(market_id: string)
      ~(side: side)
      ~(price: float)
      ~(size: float)
    : (order, error_type) Result.t Lwt.t =

    let path = "/orders" in
    let body_json = `Assoc [
      ("market_id", `String market_id);
      ("side", `String (side_to_string side));
      ("type", `String "LIMIT");
      ("price", `Float price);
      ("size", `Float size);
    ] in
    let body_str = Yojson.Safe.to_string body_json in

    let headers = auth_headers config "POST" path (Some body_str) in

    let%lwt result = post_json config.http_client
      ~headers
      ~body:body_json
      path
    in

    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let order = {
            order_id = json |> member "order_id" |> to_string;
            market_id = json |> member "market_id" |> to_string;
            side = (match json |> member "side" |> to_string with
              | "BUY" -> Buy
              | "SELL" -> Sell
              | _ -> failwith "Invalid side");
            order_type = Limit;
            price = json |> member "price" |> to_float;
            size = json |> member "size" |> to_float;
            filled_size = json |> member "filled_size" |> to_float;
            status = Open;
            created_at = json |> member "created_at" |> to_float;
            updated_at = json |> member "updated_at" |> to_float;
          } in
          let%lwt () = Logs_lwt.info (fun m ->
            m "[PolymarketClient] Created %s order: %s @ %.4f (size: %.2f)"
              (side_to_string side) order.order_id price size
          ) in
          Lwt.return (Ok order)
        with exn ->
          Lwt.return (Error (ParseError (
            Printf.sprintf "Failed to parse order response: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Create market order *)
  let create_market_order
      (config: config)
      ~(market_id: string)
      ~(side: side)
      ~(size: float)
    : (order, error_type) Result.t Lwt.t =

    let path = "/orders" in
    let body_json = `Assoc [
      ("market_id", `String market_id);
      ("side", `String (side_to_string side));
      ("type", `String "MARKET");
      ("size", `Float size);
    ] in
    let body_str = Yojson.Safe.to_string body_json in

    let headers = auth_headers config "POST" path (Some body_str) in

    let%lwt result = post_json config.http_client
      ~headers
      ~body:body_json
      path
    in

    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let order = {
            order_id = json |> member "order_id" |> to_string;
            market_id = json |> member "market_id" |> to_string;
            side = (match json |> member "side" |> to_string with
              | "BUY" -> Buy
              | "SELL" -> Sell
              | _ -> failwith "Invalid side");
            order_type = Market;
            price = 0.0; (* Market order *)
            size = json |> member "size" |> to_float;
            filled_size = json |> member "filled_size" |> to_float;
            status = Open;
            created_at = json |> member "created_at" |> to_float;
            updated_at = json |> member "updated_at" |> to_float;
          } in
          let%lwt () = Logs_lwt.info (fun m ->
            m "[PolymarketClient] Created %s market order: %s (size: %.2f)"
              (side_to_string side) order.order_id size
          ) in
          Lwt.return (Ok order)
        with exn ->
          Lwt.return (Error (ParseError (
            Printf.sprintf "Failed to parse order response: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Cancel order *)
  let cancel_order
      (config: config)
      ~(order_id: string)
    : (bool, error_type) Result.t Lwt.t =

    let path = Printf.sprintf "/orders/%s" order_id in
    let headers = auth_headers config "DELETE" path None in

    let%lwt result = delete config.http_client ~headers path in

    match result with
    | Ok response when response.status_code = 200 ->
        let%lwt () = Logs_lwt.info (fun m ->
          m "[PolymarketClient] Cancelled order: %s" order_id
        ) in
        Lwt.return (Ok true)
    | Ok response ->
        Lwt.return (Error (HttpError (response.status_code,
          Printf.sprintf "Failed to cancel order: %s" response.body)))
    | Error e -> Lwt.return (Error e)

  (** Get order status *)
  let get_order
      (config: config)
      ~(order_id: string)
    : (order, error_type) Result.t Lwt.t =

    let path = Printf.sprintf "/orders/%s" order_id in
    let headers = auth_headers config "GET" path None in

    let%lwt result = get_json config.http_client ~headers path in

    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let order = {
            order_id = json |> member "order_id" |> to_string;
            market_id = json |> member "market_id" |> to_string;
            side = (match json |> member "side" |> to_string with
              | "BUY" -> Buy
              | "SELL" -> Sell
              | _ -> failwith "Invalid side");
            order_type = (match json |> member "type" |> to_string with
              | "LIMIT" -> Limit
              | "MARKET" -> Market
              | _ -> failwith "Invalid order type");
            price = json |> member "price" |> to_float;
            size = json |> member "size" |> to_float;
            filled_size = json |> member "filled_size" |> to_float;
            status = (match json |> member "status" |> to_string with
              | "OPEN" -> Open
              | "FILLED" -> Filled
              | "PARTIALLY_FILLED" -> PartiallyFilled
              | "CANCELLED" -> Cancelled
              | "EXPIRED" -> Expired
              | _ -> Open);
            created_at = json |> member "created_at" |> to_float;
            updated_at = json |> member "updated_at" |> to_float;
          } in
          Lwt.return (Ok order)
        with exn ->
          Lwt.return (Error (ParseError (
            Printf.sprintf "Failed to parse order: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Get all open orders *)
  let get_open_orders
      (config: config)
    : (order list, error_type) Result.t Lwt.t =

    let path = "/orders?status=OPEN" in
    let headers = auth_headers config "GET" path None in

    let%lwt result = get_json config.http_client ~headers path in

    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let orders_json = json |> member "orders" |> to_list in
          let orders = List.map orders_json ~f:(fun order_json ->
            {
              order_id = order_json |> member "order_id" |> to_string;
              market_id = order_json |> member "market_id" |> to_string;
              side = (match order_json |> member "side" |> to_string with
                | "BUY" -> Buy
                | "SELL" -> Sell
                | _ -> failwith "Invalid side");
              order_type = (match order_json |> member "type" |> to_string with
                | "LIMIT" -> Limit
                | "MARKET" -> Market
                | _ -> failwith "Invalid order type");
              price = order_json |> member "price" |> to_float;
              size = order_json |> member "size" |> to_float;
              filled_size = order_json |> member "filled_size" |> to_float;
              status = Open;
              created_at = order_json |> member "created_at" |> to_float;
              updated_at = order_json |> member "updated_at" |> to_float;
            }
          ) in
          Lwt.return (Ok orders)
        with exn ->
          Lwt.return (Error (ParseError (
            Printf.sprintf "Failed to parse orders: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Get account balance *)
  let get_balance
      (config: config)
    : (float, error_type) Result.t Lwt.t =

    let path = "/account/balance" in
    let headers = auth_headers config "GET" path None in

    let%lwt result = get_json config.http_client ~headers path in

    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let balance = json |> member "balance" |> to_float in
          Lwt.return (Ok balance)
        with exn ->
          Lwt.return (Error (ParseError (
            Printf.sprintf "Failed to parse balance: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** ============================================
      MARKET SEARCH
      ============================================ *)

  (** Search for markets by keywords *)
  let search_markets
      (config: config)
      ~(query: string)
      ~(limit: int)
    : (market_info list, error_type) Result.t Lwt.t =

    let path = Printf.sprintf "/markets?search=%s&limit=%d"
      (Uri.pct_encode query) limit
    in

    let%lwt result = get_json config.http_client path in

    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let markets_json = json |> member "markets" |> to_list in
          let markets = List.map markets_json ~f:(fun market_json ->
            {
              condition_id = market_json |> member "condition_id" |> to_string;
              question = market_json |> member "question" |> to_string;
              outcome = market_json |> member "outcome" |> to_string_option |> Option.value ~default:"YES";
              yes_price = market_json |> member "yes_price" |> to_float_option |> Option.value ~default:0.5;
              no_price = market_json |> member "no_price" |> to_float_option |> Option.value ~default:0.5;
              volume_24h = market_json |> member "volume_24h" |> to_float_option |> Option.value ~default:0.0;
              liquidity = market_json |> member "liquidity" |> to_float_option |> Option.value ~default:0.0;
            }
          ) in
          Lwt.return (Ok markets)
        with exn ->
          Lwt.return (Error (ParseError (
            Printf.sprintf "Failed to parse markets: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** ============================================
      UTILITY FUNCTIONS
      ============================================ *)

  (** Get client metrics *)
  let get_metrics (config: config) : string Lwt.t =
    get_metrics config.http_client

  (** Health check *)
  let health_check (config: config) : bool Lwt.t =
    health_check config.http_client

end
