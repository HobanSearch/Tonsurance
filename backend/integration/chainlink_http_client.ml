(** Chainlink Oracle Client with Resilient HTTP
 *
 * Ethereum RPC client for reading Chainlink price feeds.
 * Features:
 * - Connection pooling and retry logic via ResilientHttpClient
 * - Multiple RPC endpoints (Alchemy, Infura, Ankr)
 * - Automatic failover between providers
 * - Price feed aggregation from multiple Chainlink oracles
 * - Staleness checks and validation
 *)

open Core
open Resilient_http_client.ResilientHttpClient

module ChainlinkClient = struct

  (** Price feed data *)
  type price_feed = {
    asset_pair: string;
    price: float; (* USD with 8 decimals *)
    decimals: int;
    updated_at: int64; (* Unix timestamp *)
    round_id: int64;
  } [@@deriving sexp]

  (** Chainlink feed addresses on Ethereum Mainnet *)
  let feed_addresses = [
    ("ETH/USD", "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419");
    ("BTC/USD", "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c");
    ("TON/USD", "0x0000000000000000000000000000000000000000"); (* Placeholder *)
    ("USDT/USD", "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D");
    ("USDC/USD", "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6");
  ]

  type config = {
    http_client: t;
    chain_id: int; (* 1 = Mainnet, 5 = Goerli *)
  }

  let create ?(chain_id=1) () : config Lwt.t =
    let client_config = {
      name = "chainlink_oracle";
      endpoints = [
        "https://eth-mainnet.g.alchemy.com/v2/demo";
        "https://mainnet.infura.io/v3/demo";
        "https://rpc.ankr.com/eth";
      ];
      timeout_seconds = 25.0;
      retry_policy = {
        max_attempts = 3;
        base_delay_ms = 800;
        max_delay_ms = 6000;
        backoff_multiplier = 2.0;
        jitter_factor = 0.2;
        retry_on_timeout = true;
        retry_on_connection_error = true;
        retry_on_5xx = true;
        retry_on_4xx = false;
      };
      circuit_breaker = {
        failure_threshold = 5;
        success_threshold = 2;
        timeout_seconds = 40.0;
        half_open_max_requests = 1;
      };
      pool = {
        max_connections = 8;
        max_idle_time_seconds = 300.0;
        connection_timeout_seconds = 5.0;
        health_check_interval_seconds = 60.0;
      };
      default_headers = [
        ("User-Agent", "Tonsurance/1.0");
        ("Accept", "application/json");
        ("Content-Type", "application/json");
      ];
    } in

    let http_client = create client_config in
    Lwt.return { http_client; chain_id }

  (** Call Ethereum RPC method *)
  let eth_call
      (config: config)
      ~(to_address: string)
      ~(data: string)
    : (string, error_type) Result.t Lwt.t =

    let body_json = `Assoc [
      ("jsonrpc", `String "2.0");
      ("method", `String "eth_call");
      ("params", `List [
        `Assoc [
          ("to", `String to_address);
          ("data", `String data);
        ];
        `String "latest";
      ]);
      ("id", `Int 1);
    ] in

    let%lwt result = post_json config.http_client
      ~body:body_json
      "/"
    in

    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let result_hex = json |> member "result" |> to_string in
          Lwt.return (Ok result_hex)
        with exn ->
          Lwt.return (Error (ParseError (Printf.sprintf "Parse error: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Decode hex string to int64 *)
  let hex_to_int64 (hex: string) : int64 =
    let hex_clean = String.substr_replace_all hex ~pattern:"0x" ~with_:"" in
    Int64.of_string ("0x" ^ hex_clean)

  (** Get latest price from Chainlink feed *)
  let get_latest_price
      (config: config)
      ~(feed_address: string)
      ~(asset_pair: string)
    : (price_feed, error_type) Result.t Lwt.t =

    (* latestRoundData() function signature *)
    let function_selector = "0xfeaf968c" in

    let%lwt result = eth_call config ~to_address:feed_address ~data:function_selector in

    match result with
    | Ok hex_result ->
        (try
          (* Decode ABI-encoded response: (roundId, answer, startedAt, updatedAt, answeredInRound) *)
          (* Each value is 32 bytes (64 hex chars) *)
          let hex_clean = String.substr_replace_all hex_result ~pattern:"0x" ~with_:"" in

          let round_id_hex = "0x" ^ String.sub hex_clean ~pos:0 ~len:64 in
          let answer_hex = "0x" ^ String.sub hex_clean ~pos:64 ~len:64 in
          let updated_at_hex = "0x" ^ String.sub hex_clean ~pos:192 ~len:64 in

          let round_id = hex_to_int64 round_id_hex in
          let answer_raw = hex_to_int64 answer_hex in
          let updated_at = hex_to_int64 updated_at_hex in

          (* Chainlink feeds typically have 8 decimals *)
          let decimals = 8 in
          let price = (Int64.to_float answer_raw) /. (10.0 ** Float.of_int decimals) in

          let feed = {
            asset_pair;
            price;
            decimals;
            updated_at;
            round_id;
          } in

          let%lwt () = Logs_lwt.debug (fun m ->
            m "[ChainlinkClient] %s price: $%.2f (updated: %Ld)"
              asset_pair price updated_at
          ) in

          Lwt.return (Ok feed)
        with exn ->
          Lwt.return (Error (ParseError (Printf.sprintf "Decode error: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  (** Get price for asset pair *)
  let get_price (config: config) ~(asset_pair: string) : (price_feed, error_type) Result.t Lwt.t =
    match List.Assoc.find feed_addresses ~equal:String.equal asset_pair with
    | Some feed_address ->
        get_latest_price config ~feed_address ~asset_pair
    | None ->
        Lwt.return (Error (ParseError (Printf.sprintf "Unknown asset pair: %s" asset_pair)))

  (** Get multiple prices in parallel *)
  let get_prices (config: config) ~(asset_pairs: string list) : (price_feed list, error_type) Result.t Lwt.t =
    let%lwt results = Lwt_list.map_p (fun pair -> get_price config ~asset_pair:pair) asset_pairs in

    (* Separate successes and failures *)
    let (successes, _failures) = List.partition_map results ~f:(function
      | Ok feed -> First feed
      | Error e -> Second e
    ) in

    if List.is_empty successes then
      Lwt.return (Error (ConnectionError "Failed to fetch all prices"))
    else
      Lwt.return (Ok successes)

  (** Check if price is stale (> 1 hour old) *)
  let is_price_stale (feed: price_feed) : bool =
    let now = Int64.of_float (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) in
    let age = Int64.(-) now feed.updated_at in
    Int64.(age > 3600L) (* 1 hour *)

  (** Get ETH balance of address *)
  let get_eth_balance (config: config) ~(address: string) : (float, error_type) Result.t Lwt.t =
    let body_json = `Assoc [
      ("jsonrpc", `String "2.0");
      ("method", `String "eth_getBalance");
      ("params", `List [`String address; `String "latest"]);
      ("id", `Int 1);
    ] in

    let%lwt result = post_json config.http_client ~body:body_json "/" in

    match result with
    | Ok json ->
        let open Yojson.Safe.Util in
        (try
          let balance_hex = json |> member "result" |> to_string in
          let balance_wei = hex_to_int64 balance_hex in
          let balance_eth = (Int64.to_float balance_wei) /. 1e18 in
          Lwt.return (Ok balance_eth)
        with exn ->
          Lwt.return (Error (ParseError (Printf.sprintf "Parse error: %s" (Exn.to_string exn)))))
    | Error e -> Lwt.return (Error e)

  let get_metrics (config: config) : string Lwt.t =
    get_metrics config.http_client

  let health_check (config: config) : bool Lwt.t =
    health_check config.http_client

end
