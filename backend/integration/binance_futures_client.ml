(** Binance Futures Client - Real Exchange Integration
 *
 * This module provides integration with Binance Futures API for hedging
 * Tonsurance's bitcoin float exposure through short BTC futures positions.
 *
 * Features:
 * - Open/close short positions
 * - Get real-time position data
 * - Fetch funding rates and mark prices
 * - WebSocket support for real-time updates
 * - Rate limiting (1200 weight/minute)
 * - Exponential backoff on errors
 *
 * API Documentation: https://binance-docs.github.io/apidocs/futures/en/
 *)

open Core

module BinanceFuturesClient = struct

  (** Configuration *)
  type config = {
    api_key: string;
    api_secret: string;
    testnet: bool;
    rate_limit_weight_per_minute: int;
    timeout_seconds: float;
  } [@@deriving sexp]

  (** Position information *)
  type position = {
    position_id: string;
    symbol: string;
    side: [`Short | `Long];
    quantity: float;
    entry_price: float;
    mark_price: float;
    unrealized_pnl: float;
    leverage: int;
    liquidation_price: float;
    margin: float;
    timestamp: float;
  } [@@deriving sexp]

  (** PnL result *)
  type pnl = {
    realized_pnl: float;
    unrealized_pnl: float;
    fees: float;
    net_pnl: float;
  } [@@deriving sexp]

  (** Funding rate info *)
  type funding_info = {
    symbol: string;
    funding_rate: float;
    funding_time: float;
    mark_price: float;
  } [@@deriving sexp]

  (** Error types *)
  type error =
    | API_error of int * string
    | Rate_limited
    | Network_error of string
    | Parse_error of string
    | Authentication_error of string
    | Insufficient_margin
  [@@deriving sexp]

  (** Get base URL based on testnet flag *)
  let get_base_url (config: config) : string =
    if config.testnet then
      "https://testnet.binancefuture.com"
    else
      "https://fapi.binance.com"

  (** Generate HMAC-SHA256 signature for authenticated requests *)
  let generate_signature (secret: string) (query_string: string) : string =
    let open Digestif.SHA256 in
    let hmac_key = hmac_string ~key:secret query_string in
    to_hex hmac_key

  (** Rate limiter using token bucket *)
  module RateLimiter = struct
    type t = {
      mutable tokens: int;
      max_tokens: int;
      refill_rate_per_second: float;
      mutable last_refill: float;
      mutex: Lwt_mutex.t;
    }

    let create ~(max_weight_per_minute: int) : t =
      {
        tokens = max_weight_per_minute;
        max_tokens = max_weight_per_minute;
        refill_rate_per_second = Float.of_int max_weight_per_minute /. 60.0;
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

    let acquire (limiter: t) ~(weight: int) : unit Lwt.t =
      Lwt_mutex.with_lock limiter.mutex (fun () ->
        let rec wait_for_tokens () =
          refill limiter;
          if limiter.tokens >= weight then begin
            limiter.tokens <- limiter.tokens - weight;
            Lwt.return ()
          end else begin
            (* Wait until enough tokens available *)
            let wait_time =
              Float.of_int (weight - limiter.tokens) /. limiter.refill_rate_per_second
            in
            let%lwt () = Lwt_unix.sleep (Float.max 0.1 wait_time) in
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
          ~max_weight_per_minute:config.rate_limit_weight_per_minute
        in
        rate_limiter := Some limiter;
        limiter

  (** Make authenticated request with signature *)
  let make_signed_request
      ~(config: config)
      ~(method_: Http_client.HttpClient.http_method)
      ~(endpoint: string)
      ~(params: (string * string) list)
      ~(weight: int)
    : (Yojson.Safe.t, error) Result.t Lwt.t =

    (* Acquire rate limit tokens *)
    let limiter = get_rate_limiter config in
    let%lwt () = RateLimiter.acquire limiter ~weight in

    (* Add timestamp *)
    let timestamp = Int64.of_float ((Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) *. 1000.0) in
    let params_with_ts = params @ [("timestamp", Int64.to_string timestamp)] in

    (* Generate query string *)
    let query_string =
      List.map params_with_ts ~f:(fun (k, v) ->
        Printf.sprintf "%s=%s" k (Uri.pct_encode v)
      )
      |> String.concat ~sep:"&"
    in

    (* Generate signature *)
    let signature = generate_signature config.api_secret query_string in
    let signed_query = Printf.sprintf "%s&signature=%s" query_string signature in

    (* Make request *)
    let base_url = get_base_url config in
    let url = Printf.sprintf "%s%s?%s" base_url endpoint signed_query in

    let headers = [
      ("X-MBX-APIKEY", config.api_key);
      ("Content-Type", "application/x-www-form-urlencoded");
    ] in

    let request_config = {
      Http_client.HttpClient.url;
      method_;
      headers;
      body = None;
      timeout_seconds = config.timeout_seconds;
      retry_attempts = 3;
      retry_delays = [1.0; 2.0; 4.0];
    } in

    let%lwt result = Http_client.HttpClient.execute_with_retry ~config:request_config in

    match result with
    | Ok response ->
        begin match Http_client.HttpClient.parse_json_response response with
        | Ok json -> Lwt.return (Ok json)
        | Error http_error ->
            let err = match http_error with
              | Http_client.HttpClient.Parse_error msg -> Parse_error msg
              | Http_client.HttpClient.Timeout -> Network_error "Request timeout"
              | Http_client.HttpClient.Connection_error msg -> Network_error msg
              | Http_client.HttpClient.HTTP_error (code, msg) -> API_error (code, msg)
              | Http_client.HttpClient.Rate_limited -> Rate_limited
            in
            Lwt.return (Error err)
        end
    | Error http_error ->
        let err = match http_error with
          | Http_client.HttpClient.Timeout -> Network_error "Request timeout"
          | Http_client.HttpClient.Connection_error msg -> Network_error msg
          | Http_client.HttpClient.HTTP_error (429, _) -> Rate_limited
          | Http_client.HttpClient.HTTP_error (code, msg) -> API_error (code, msg)
          | Http_client.HttpClient.Parse_error msg -> Parse_error msg
          | Http_client.HttpClient.Rate_limited -> Rate_limited
        in
        Lwt.return (Error err)

  (** Make unsigned public request *)
  let make_public_request
      ~(config: config)
      ~(endpoint: string)
      ~(params: (string * string) list)
      ~(weight: int)
    : (Yojson.Safe.t, error) Result.t Lwt.t =

    let limiter = get_rate_limiter config in
    let%lwt () = RateLimiter.acquire limiter ~weight in

    let base_url = get_base_url config in
    let query_string =
      List.map params ~f:(fun (k, v) ->
        Printf.sprintf "%s=%s" k (Uri.pct_encode v)
      )
      |> String.concat ~sep:"&"
    in
    let url =
      if String.is_empty query_string then
        Printf.sprintf "%s%s" base_url endpoint
      else
        Printf.sprintf "%s%s?%s" base_url endpoint query_string
    in

    let%lwt result = Http_client.HttpClient.get_json ~timeout:config.timeout_seconds url in

    match result with
    | Ok json -> Lwt.return (Ok json)
    | Error http_error ->
        let err = match http_error with
          | Http_client.HttpClient.Timeout -> Network_error "Request timeout"
          | Http_client.HttpClient.Connection_error msg -> Network_error msg
          | Http_client.HttpClient.HTTP_error (429, _) -> Rate_limited
          | Http_client.HttpClient.HTTP_error (code, msg) -> API_error (code, msg)
          | Http_client.HttpClient.Parse_error msg -> Parse_error msg
          | Http_client.HttpClient.Rate_limited -> Rate_limited
        in
        Lwt.return (Error err)

  (** Open short position *)
  let open_short
      ~(config: config)
      ~(symbol: string)
      ~(quantity: float)
      ~(leverage: int)
    : (position, error) Result.t Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "Opening short position: %s, qty: %.8f, leverage: %dx" symbol quantity leverage
    ) in

    (* Set leverage first *)
    let%lwt leverage_result = make_signed_request
      ~config
      ~method_:POST
      ~endpoint:"/fapi/v1/leverage"
      ~params:[
        ("symbol", symbol);
        ("leverage", Int.to_string leverage);
      ]
      ~weight:1
    in

    match leverage_result with
    | Error e -> Lwt.return (Error e)
    | Ok _ ->
        (* Open short position using market order *)
        let%lwt order_result = make_signed_request
          ~config
          ~method_:POST
          ~endpoint:"/fapi/v1/order"
          ~params:[
            ("symbol", symbol);
            ("side", "SELL");  (* SELL = short *)
            ("type", "MARKET");
            ("quantity", Float.to_string quantity);
            ("newOrderRespType", "RESULT");
          ]
          ~weight:1
        in

        match order_result with
        | Error e -> Lwt.return (Error e)
        | Ok json ->
            try
              let open Yojson.Safe.Util in

              let order_id = json |> member "orderId" |> to_int |> Int.to_string in
              let avg_price = json |> member "avgPrice" |> to_string |> Float.of_string in
              let executed_qty = json |> member "executedQty" |> to_string |> Float.of_string in

              (* Construct position from order result *)
              let position = {
                position_id = order_id;
                symbol;
                side = `Short;
                quantity = executed_qty;
                entry_price = avg_price;
                mark_price = avg_price;
                unrealized_pnl = 0.0;
                leverage;
                liquidation_price = 0.0;
                margin = (executed_qty *. avg_price) /. Float.of_int leverage;
                timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
              } in
              Lwt.return (Ok position)

            with exn ->
              let%lwt () = Logs_lwt.err (fun m ->
                m "Failed to parse order response: %s" (Exn.to_string exn)
              ) in
              Lwt.return (Error (Parse_error (Exn.to_string exn)))

  (** Close position *)
  let close_position
      ~(config: config)
      ~(position_id: string)
    : (pnl, error) Result.t Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "Closing position: %s" position_id
    ) in

    (* Get current position to determine quantity *)
    let%lwt positions_result = make_signed_request
      ~config
      ~method_:GET
      ~endpoint:"/fapi/v2/positionRisk"
      ~params:[]
      ~weight:5
    in

    match positions_result with
    | Error e -> Lwt.return (Error e)
    | Ok json ->
        try
          let open Yojson.Safe.Util in
          let positions = json |> to_list in

          (* Find position with non-zero quantity *)
          let position_opt =
            List.find positions ~f:(fun pos ->
              let qty = pos |> member "positionAmt" |> to_string |> Float.of_string in
              Float.(abs qty > 0.0001)
            )
          in

          match position_opt with
          | None ->
              Lwt.return (Error (API_error (400, "Position not found or already closed")))
          | Some pos ->
              let symbol = pos |> member "symbol" |> to_string in
              let position_amt = pos |> member "positionAmt" |> to_string |> Float.of_string in
              let unrealized_pnl = pos |> member "unRealizedProfit" |> to_string |> Float.of_string in

              (* Close position by opening opposite side *)
              let close_side = if Float.(position_amt < 0.0) then "BUY" else "SELL" in
              let close_qty = Float.abs position_amt in

              let%lwt close_result = make_signed_request
                ~config
                ~method_:POST
                ~endpoint:"/fapi/v1/order"
                ~params:[
                  ("symbol", symbol);
                  ("side", close_side);
                  ("type", "MARKET");
                  ("quantity", Float.to_string close_qty);
                  ("reduceOnly", "true");
                ]
                ~weight:1
              in

              match close_result with
              | Error e -> Lwt.return (Error e)
              | Ok close_json ->
                  let commission =
                    try close_json |> member "commission" |> to_string |> Float.of_string
                    with _ -> close_qty *. 0.0004  (* Assume 0.04% fee *)
                  in

                  let pnl_result = {
                    realized_pnl = unrealized_pnl;
                    unrealized_pnl = 0.0;
                    fees = commission;
                    net_pnl = unrealized_pnl -. commission;
                  } in

                  let%lwt () = Logs_lwt.info (fun m ->
                    m "Position closed: realized PnL: $%.2f, fees: $%.2f, net: $%.2f"
                      pnl_result.realized_pnl pnl_result.fees pnl_result.net_pnl
                  ) in

                  Lwt.return (Ok pnl_result)

        with exn ->
          let%lwt () = Logs_lwt.err (fun m ->
            m "Failed to close position: %s" (Exn.to_string exn)
          ) in
          Lwt.return (Error (Parse_error (Exn.to_string exn)))

  (** Get position by symbol *)
  and get_position
      ~(config: config)
      ~(symbol: string)
    : (position option, error) Result.t Lwt.t =

    let%lwt result = make_signed_request
      ~config
      ~method_:GET
      ~endpoint:"/fapi/v2/positionRisk"
      ~params:[("symbol", symbol)]
      ~weight:5
    in

    match result with
    | Error e -> Lwt.return (Error e)
    | Ok json ->
        try
          let open Yojson.Safe.Util in
          let positions = json |> to_list in

          let position_opt =
            List.find positions ~f:(fun pos ->
              let qty = pos |> member "positionAmt" |> to_string |> Float.of_string in
              Float.(abs qty > 0.0001)
            )
          in

          match position_opt with
          | None -> Lwt.return (Ok None)
          | Some pos ->
              let position_amt = pos |> member "positionAmt" |> to_string |> Float.of_string in
              let entry_price = pos |> member "entryPrice" |> to_string |> Float.of_string in
              let mark_price = pos |> member "markPrice" |> to_string |> Float.of_string in
              let unrealized_pnl = pos |> member "unRealizedProfit" |> to_string |> Float.of_string in
              let leverage_val = pos |> member "leverage" |> to_string |> Int.of_string in
              let liquidation_price = pos |> member "liquidationPrice" |> to_string |> Float.of_string in
              let margin = pos |> member "isolatedMargin" |> to_string |> Float.of_string in

              let side = if Float.(position_amt < 0.0) then `Short else `Long in

              let position = {
                position_id = symbol;
                symbol;
                side;
                quantity = Float.abs position_amt;
                entry_price;
                mark_price;
                unrealized_pnl;
                leverage = leverage_val;
                liquidation_price;
                margin;
                timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
              } in

              Lwt.return (Ok (Some position))

        with exn ->
          let%lwt () = Logs_lwt.err (fun m ->
            m "Failed to parse position data: %s" (Exn.to_string exn)
          ) in
          Lwt.return (Error (Parse_error (Exn.to_string exn)))

  (** Get funding rate *)
  let get_funding_rate
      ~(config: config)
      ~(symbol: string)
    : (float, error) Result.t Lwt.t =

    let%lwt result = make_public_request
      ~config
      ~endpoint:"/fapi/v1/premiumIndex"
      ~params:[("symbol", symbol)]
      ~weight:1
    in

    match result with
    | Error e -> Lwt.return (Error e)
    | Ok json ->
        try
          let open Yojson.Safe.Util in
          let funding_rate = json |> member "lastFundingRate" |> to_string |> Float.of_string in
          Lwt.return (Ok funding_rate)
        with exn ->
          Lwt.return (Error (Parse_error (Exn.to_string exn)))

  (** Get mark price *)
  let get_mark_price
      ~(config: config)
      ~(symbol: string)
    : (float, error) Result.t Lwt.t =

    let%lwt result = make_public_request
      ~config
      ~endpoint:"/fapi/v1/premiumIndex"
      ~params:[("symbol", symbol)]
      ~weight:1
    in

    match result with
    | Error e -> Lwt.return (Error e)
    | Ok json ->
        try
          let open Yojson.Safe.Util in
          let mark_price = json |> member "markPrice" |> to_string |> Float.of_string in
          Lwt.return (Ok mark_price)
        with exn ->
          Lwt.return (Error (Parse_error (Exn.to_string exn)))

  (** Get funding info (rate, time, and mark price) *)
  let get_funding_info
      ~(config: config)
      ~(symbol: string)
    : (funding_info, error) Result.t Lwt.t =

    let%lwt result = make_public_request
      ~config
      ~endpoint:"/fapi/v1/premiumIndex"
      ~params:[("symbol", symbol)]
      ~weight:1
    in

    match result with
    | Error e -> Lwt.return (Error e)
    | Ok json ->
        try
          let open Yojson.Safe.Util in
          let funding_rate = json |> member "lastFundingRate" |> to_string |> Float.of_string in
          let funding_time = json |> member "nextFundingTime" |> to_int |> Float.of_int in
          let mark_price = json |> member "markPrice" |> to_string |> Float.of_string in

          let info = {
            symbol;
            funding_rate;
            funding_time = funding_time /. 1000.0;
            mark_price;
          } in

          Lwt.return (Ok info)
        with exn ->
          Lwt.return (Error (Parse_error (Exn.to_string exn)))

  (** Test connectivity *)
  let test_connectivity
      ~(config: config)
    : (bool, error) Result.t Lwt.t =

    let%lwt result = make_public_request
      ~config
      ~endpoint:"/fapi/v1/ping"
      ~params:[]
      ~weight:1
    in

    match result with
    | Ok _ ->
        let%lwt () = Logs_lwt.info (fun m ->
          m "Binance Futures API connectivity: OK"
        ) in
        Lwt.return (Ok true)
    | Error e -> Lwt.return (Error e)

  (** Helper: Error to string *)
  let error_to_string = function
    | API_error (code, msg) -> Printf.sprintf "API error %d: %s" code msg
    | Rate_limited -> "Rate limited"
    | Network_error msg -> Printf.sprintf "Network error: %s" msg
    | Parse_error msg -> Printf.sprintf "Parse error: %s" msg
    | Authentication_error msg -> Printf.sprintf "Authentication error: %s" msg
    | Insufficient_margin -> "Insufficient margin"

end
