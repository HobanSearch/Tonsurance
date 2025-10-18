(** Chainlink Price Feed Client
 *
 * Fetches real-time stablecoin prices from Chainlink oracles across multiple chains.
 * Supports 14 stablecoins: USDC, USDT, USDP, DAI, FRAX, BUSD, USDe, sUSDe, USDY, PYUSD, GHO, LUSD, crvUSD, mkUSD
 *
 * Networks: Ethereum, Arbitrum, Base, Polygon
 * Update frequency: 10 seconds
 * Fallback: CoinGecko API if Chainlink unavailable
 *)

open Core
open Types

module ChainlinkClient = struct

  (** Price feed configuration *)
  type feed_config = {
    asset: asset;
    chain: blockchain;
    contract_address: string;
    decimals: int;
    heartbeat_seconds: int; (* Max age before considered stale *)
  } [@@deriving sexp, compare]

  (** Price data point *)
  type price_data = {
    asset: asset;
    chain: blockchain;
    price: float;
    timestamp: float;
    round_id: int64;
    source: string;
    confidence: float;
  } [@@deriving sexp]

  (** Client configuration *)
  type client_config = {
    rpc_endpoints: (blockchain * string list) list; (* Chain -> RPC URLs *)
    api_keys: (string * string) list; (* Provider -> API key *)
    rate_limit_per_second: int;
    timeout_seconds: float;
    retry_attempts: int;
    cache_ttl_seconds: int;
  } [@@deriving sexp]

  (** Price cache entry *)
  type cache_entry = {
    price_data: price_data;
    cached_at: float;
  }

  (** Global price cache with 5-minute TTL *)
  let price_cache : (feed_config, cache_entry) Hashtbl.t = Hashtbl.create (module struct
    type t = feed_config
    let compare = compare_feed_config
    let sexp_of_t = sexp_of_feed_config
    let t_of_sexp = feed_config_of_sexp [@@ocaml.warning "-32"]
    let hash = Hashtbl.hash
  end)

  (** Chainlink price feed addresses on Ethereum mainnet *)
  let ethereum_feeds = [
    { asset = USDC; chain = Ethereum; contract_address = "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6"; decimals = 8; heartbeat_seconds = 86400 };
    { asset = USDT; chain = Ethereum; contract_address = "0x3E7d1eAB13ad0104d2750B8863b489D65364e32D"; decimals = 8; heartbeat_seconds = 86400 };
    { asset = DAI; chain = Ethereum; contract_address = "0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"; decimals = 8; heartbeat_seconds = 3600 };
    { asset = FRAX; chain = Ethereum; contract_address = "0xB9E1E3A9feFf48998E45Fa90847ed4D467E8BcfD"; decimals = 8; heartbeat_seconds = 3600 };
    { asset = LUSD; chain = Ethereum; contract_address = "0x3D7aE7E594f2f2091Ad8798313450130d0Aba3a0"; decimals = 8; heartbeat_seconds = 86400 };
  ]

  (** Arbitrum price feeds *)
  let arbitrum_feeds = [
    { asset = USDC; chain = Arbitrum; contract_address = "0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3"; decimals = 8; heartbeat_seconds = 86400 };
    { asset = USDT; chain = Arbitrum; contract_address = "0x3f3f5dF88dC9F13eac63DF89EC16ef6e7E25DdE7"; decimals = 8; heartbeat_seconds = 86400 };
    { asset = DAI; chain = Arbitrum; contract_address = "0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB"; decimals = 8; heartbeat_seconds = 86400 };
  ]

  (** Base price feeds *)
  let base_feeds = [
    { asset = USDC; chain = Base; contract_address = "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B"; decimals = 8; heartbeat_seconds = 86400 };
  ]

  (** Polygon price feeds *)
  let polygon_feeds = [
    { asset = USDC; chain = Polygon; contract_address = "0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7"; decimals = 8; heartbeat_seconds = 86400 };
    { asset = USDT; chain = Polygon; contract_address = "0x0A6513e40db6EB1b165753AD52E80663aeA50545"; decimals = 8; heartbeat_seconds = 86400 };
    { asset = DAI; chain = Polygon; contract_address = "0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D"; decimals = 8; heartbeat_seconds = 86400 };
  ]

  (** All price feeds *)
  let all_feeds = ethereum_feeds @ arbitrum_feeds @ base_feeds @ polygon_feeds

  (** Get all RPC endpoints for chain *)
  let get_rpc_endpoints (config: client_config) (chain: blockchain) : string list =
    List.Assoc.find config.rpc_endpoints chain ~equal:Poly.equal
    |> Option.value ~default:[]

  (** Check if cached price is still valid *)
  let is_cache_valid (entry: cache_entry) ~(ttl_seconds: int) : bool =
    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let age = now -. entry.cached_at in
    Float.(age < of_int ttl_seconds)

  (** Get price from cache if valid *)
  let get_cached_price (feed: feed_config) ~(ttl_seconds: int) : price_data option =
    match Hashtbl.find price_cache feed with
    | Some entry when is_cache_valid entry ~ttl_seconds -> Some entry.price_data
    | _ -> None

  (** Store price in cache *)
  let cache_price (feed: feed_config) (data: price_data) : unit =
    Hashtbl.set price_cache ~key:feed ~data:{
      price_data = data;
      cached_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    }

  (** Exponential backoff delay calculation *)
  let calculate_backoff_delay (attempt: int) : float =
    let base_delay = 0.5 in
    let max_delay = 8.0 in
    Float.min max_delay (base_delay *. (2.0 ** Float.of_int attempt))

  (** Decode hex string to int64 *)
  let hex_to_int64 (hex_str: string) : int64 =
    let cleaned = String.strip hex_str in
    let cleaned = if String.is_prefix cleaned ~prefix:"0x"
      then String.sub cleaned ~pos:2 ~len:(String.length cleaned - 2)
      else cleaned
    in
    Int64.of_string ("0x" ^ cleaned)

  (** Parse Chainlink ABI-encoded response from eth_call
   *  latestRoundData() returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
   *  Response format: 0x + 5 x 64 hex chars (32 bytes each)
   *)
  let parse_aggregator_abi_response
      ~(feed: feed_config)
      ~(hex_response: string)
      ~(timestamp: float)
    : price_data option =

    try
      (* Remove 0x prefix *)
      let hex_data = if String.is_prefix hex_response ~prefix:"0x"
        then String.sub hex_response ~pos:2 ~len:(String.length hex_response - 2)
        else hex_response
      in

      (* Each ABI return value is 32 bytes (64 hex chars) *)
      if String.length hex_data < 320 then None (* Need at least 5 * 64 chars *)
      else
        let round_id_hex = String.sub hex_data ~pos:0 ~len:64 in
        let answer_hex = String.sub hex_data ~pos:64 ~len:64 in
        let _started_at_hex = String.sub hex_data ~pos:128 ~len:64 in
        let updated_at_hex = String.sub hex_data ~pos:192 ~len:64 in

        let round_id = hex_to_int64 round_id_hex in
        let answer = hex_to_int64 answer_hex in
        let updated_at = hex_to_int64 updated_at_hex in

        (* Convert from feed decimals to USD *)
        let price = Int64.to_float answer /. (10.0 ** Float.of_int feed.decimals) in

        (* Calculate confidence based on data freshness *)
        let age_seconds = timestamp -. Int64.to_float updated_at in
        let confidence =
          if Float.(age_seconds < of_int feed.heartbeat_seconds) then 1.0
          else if Float.(age_seconds < of_int feed.heartbeat_seconds *. 2.0) then 0.8
          else 0.5
        in

        Some {
          asset = feed.asset;
          chain = feed.chain;
          price;
          timestamp = Int64.to_float updated_at;
          round_id;
          source = "chainlink";
          confidence;
        }
    with
    | exn ->
        let () = Logs.err (fun m ->
          m "Error parsing Chainlink ABI response: %s" (Exn.to_string exn)
        ) in
        None

  (** Fetch from single RPC endpoint *)
  let fetch_from_rpc
      ~(rpc_url: string)
      ~(feed: feed_config)
      ~(timeout_seconds: float)
    : price_data option Lwt.t =

    try%lwt
      (* ABI-encoded call to latestRoundData() *)
      let method_signature = "0xfeaf968c" in (* latestRoundData() *)

      let json_rpc = `Assoc [
        ("jsonrpc", `String "2.0");
        ("method", `String "eth_call");
        ("params", `List [
          `Assoc [
            ("to", `String feed.contract_address);
            ("data", `String method_signature);
          ];
          `String "latest"
        ]);
        ("id", `Int 1);
      ] in

      let body = Yojson.Safe.to_string json_rpc in
      let headers = Cohttp.Header.of_list [
        ("Content-Type", "application/json");
      ] in

      (* Add timeout to prevent hanging *)
      let fetch_promise =
        Cohttp_lwt_unix.Client.post
          ~body:(`String body)
          ~headers
          (Uri.of_string rpc_url)
      in

      let timeout_promise =
        let%lwt () = Lwt_unix.sleep timeout_seconds in
        Lwt.fail (Failure "RPC request timeout")
      in

      let%lwt (_resp, body) = Lwt.pick [fetch_promise; timeout_promise] in
      let%lwt body_string = Cohttp_lwt.Body.to_string body in

      (* Parse JSON-RPC response *)
      let json = Yojson.Safe.from_string body_string in
      let timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

      let open Yojson.Safe.Util in
      let hex_result = json |> member "result" |> to_string in

      Lwt.return (parse_aggregator_abi_response ~feed ~hex_response:hex_result ~timestamp)

    with exn ->
      let%lwt () = Logs_lwt.debug (fun m ->
        m "RPC call failed for %s: %s" rpc_url (Exn.to_string exn)
      ) in
      Lwt.return None

  (** Fetch with retry and multi-RPC fallback *)
  let rec fetch_with_retry
      ~(rpc_urls: string list)
      ~(feed: feed_config)
      ~(timeout_seconds: float)
      ~(retry_attempts: int)
      ~(current_attempt: int)
    : price_data option Lwt.t =

    match rpc_urls with
    | [] -> Lwt.return None (* No more RPCs to try *)
    | rpc_url :: remaining_rpcs ->
        let%lwt result = fetch_from_rpc ~rpc_url ~feed ~timeout_seconds in

        match result with
        | Some data -> Lwt.return (Some data) (* Success! *)
        | None when current_attempt >= retry_attempts ->
            (* Max retries reached for this RPC, try next *)
            let%lwt () = Logs_lwt.warn (fun m ->
              m "Max retries (%d) reached for RPC %s, trying next endpoint"
                retry_attempts rpc_url
            ) in
            fetch_with_retry ~rpc_urls:remaining_rpcs ~feed ~timeout_seconds
              ~retry_attempts ~current_attempt:0
        | None ->
            (* Retry with exponential backoff *)
            let delay = calculate_backoff_delay current_attempt in
            let%lwt () = Logs_lwt.debug (fun m ->
              m "Retrying RPC %s after %.2fs (attempt %d/%d)"
                rpc_url delay (current_attempt + 1) retry_attempts
            ) in
            let%lwt () = Lwt_unix.sleep delay in
            fetch_with_retry ~rpc_urls ~feed ~timeout_seconds ~retry_attempts
              ~current_attempt:(current_attempt + 1)

  (** Fetch latest round data from Chainlink aggregator *)
  let fetch_chainlink_price
      ~(config: client_config)
      ~(feed: feed_config)
    : price_data option Lwt.t =

    let%lwt () = Logs_lwt.debug (fun m ->
      m "Fetching Chainlink price for %s on %s"
        (asset_to_string feed.asset)
        (blockchain_to_string feed.chain)
    ) in

    (* Check cache first *)
    match get_cached_price feed ~ttl_seconds:config.cache_ttl_seconds with
    | Some cached_data ->
        let%lwt () = Logs_lwt.debug (fun m ->
          m "Using cached price for %s/%s (age: %.0fs)"
            (asset_to_string feed.asset)
            (blockchain_to_string feed.chain)
            ((Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) -. cached_data.timestamp)
        ) in
        Lwt.return (Some cached_data)
    | None ->
        let rpc_urls = get_rpc_endpoints config feed.chain in

        if List.is_empty rpc_urls then begin
          let%lwt () = Logs_lwt.warn (fun m ->
            m "No RPC endpoints configured for %s" (blockchain_to_string feed.chain)
          ) in
          Lwt.return None
        end else begin
          let%lwt result = fetch_with_retry
            ~rpc_urls
            ~feed
            ~timeout_seconds:config.timeout_seconds
            ~retry_attempts:config.retry_attempts
            ~current_attempt:0
          in

          (* Cache successful result *)
          (match result with
           | Some data ->
               cache_price feed data;
               let%lwt () = Logs_lwt.info (fun m ->
                 m "Successfully fetched %s/%s: $%.6f (confidence: %.2f)"
                   (asset_to_string feed.asset)
                   (blockchain_to_string feed.chain)
                   data.price
                   data.confidence
               ) in
               Lwt.return (Some data)
           | None ->
               let%lwt () = Logs_lwt.err (fun m ->
                 m "Failed to fetch price for %s/%s after trying all RPCs"
                   (asset_to_string feed.asset)
                   (blockchain_to_string feed.chain)
               ) in
               Lwt.return None)
        end

  (** CoinGecko fallback client *)
  module CoinGeckoFallback = struct

    let coingecko_api_base = "https://api.coingecko.com/api/v3"

    let asset_to_coingecko_id = function
      | USDC -> "usd-coin"
      | USDT -> "tether"
      | USDP -> "paxos-standard"
      | DAI -> "dai"
      | FRAX -> "frax"
      | BUSD -> "binance-usd"
      | USDe -> "ethena-usde"
      | SUSDe -> "ethena-staked-usde"
      | USDY -> "ondo-us-dollar-yield"
      | PYUSD -> "paypal-usd"
      | GHO -> "gho"
      | LUSD -> "liquity-usd"
      | CrvUSD -> "crvusd"
      | MkUSD -> "prisma-mkusd"
      | BTC -> "bitcoin"
      | ETH -> "ethereum"

    let fetch_coingecko_price
        ~(asset: asset)
        ~(api_key: string option)
      : price_data option Lwt.t =

      try%lwt
        let coin_id = asset_to_coingecko_id asset in
        let url = Printf.sprintf "%s/simple/price?ids=%s&vs_currencies=usd&include_last_updated_at=true"
          coingecko_api_base coin_id
        in

        let headers = match api_key with
          | Some key -> Cohttp.Header.of_list [("x-cg-pro-api-key", key)]
          | None -> Cohttp.Header.init ()
        in

        let%lwt (_resp, body) =
          Cohttp_lwt_unix.Client.get ~headers (Uri.of_string url)
        in

        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let json = Yojson.Safe.from_string body_string in

        let open Yojson.Safe.Util in
        let price = json |> member coin_id |> member "usd" |> to_float in
        let updated_at = json |> member coin_id |> member "last_updated_at" |> to_float in

        Lwt.return (Some {
          asset;
          chain = Ethereum; (* Default *)
          price;
          timestamp = updated_at;
          round_id = 0L;
          source = "coingecko";
          confidence = 0.9; (* Slightly lower confidence for fallback *)
        })

      with exn ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "CoinGecko fallback failed: %s" (Exn.to_string exn)
        ) in
        Lwt.return None
  end

  (** Fetch price with fallback *)
  let fetch_price_with_fallback
      ~(config: client_config)
      ~(feed: feed_config)
    : price_data option Lwt.t =

    (* Try Chainlink first *)
    let%lwt chainlink_result = fetch_chainlink_price ~config ~feed in

    match chainlink_result with
    | Some data when Float.(data.confidence >= 0.8) ->
        Lwt.return (Some data)

    | _ ->
        (* Fall back to CoinGecko *)
        let%lwt () = Logs_lwt.info (fun m ->
          m "Falling back to CoinGecko for %s" (asset_to_string feed.asset)
        ) in

        let api_key = List.Assoc.find config.api_keys "coingecko" ~equal:String.equal in
        CoinGeckoFallback.fetch_coingecko_price ~asset:feed.asset ~api_key

  (** Fetch all stablecoin prices *)
  let fetch_all_prices
      ~(config: client_config)
    : price_data list Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "Fetching prices for %d feeds" (List.length all_feeds)
    ) in

    (* Fetch prices in parallel with rate limiting *)
    let fetch_batches = List.chunks_of all_feeds ~length:config.rate_limit_per_second in

    let rec fetch_with_delay batches acc =
      match batches with
      | [] -> Lwt.return (List.concat (List.rev acc))
      | batch :: rest ->
          let%lwt results =
            Lwt_list.map_p (fun feed ->
              fetch_price_with_fallback ~config ~feed
            ) batch
          in

          let valid_results = List.filter_map results ~f:Fn.id in

          (* Rate limit delay *)
          let%lwt () = Lwt_unix.sleep 1.0 in

          fetch_with_delay rest (valid_results :: acc)
    in

    fetch_with_delay fetch_batches []

  (** Calculate consensus price across multiple sources *)
  let calculate_consensus_price
      (prices: price_data list)
      ~(asset: asset)
    : oracle_consensus option =

    let asset_prices = List.filter prices ~f:(fun p -> Poly.equal p.asset asset) in

    if List.is_empty asset_prices then None
    else
      let values = List.map asset_prices ~f:(fun p -> p.price) in
      let mean_price = Math.mean values in
      let std_dev = Math.std_dev values in

      (* Weighted average confidence *)
      let total_confidence =
        List.fold asset_prices ~init:0.0 ~f:(fun acc p -> acc +. p.confidence)
      in
      let avg_confidence = total_confidence /. Float.of_int (List.length asset_prices) in

      (* Build source list *)
      let sources = List.map asset_prices ~f:(fun p ->
        (p.source, p.price, p.confidence)
      ) in

      let latest_timestamp =
        List.fold asset_prices ~init:0.0 ~f:(fun acc p -> Float.max acc p.timestamp)
      in

      Some {
        asset;
        price = mean_price;
        timestamp = latest_timestamp;
        sources;
        confidence = avg_confidence;
        deviation = std_dev;
      }

  (** Start continuous price feed monitoring *)
  let start_price_monitor
      ~(config: client_config)
      ~(update_interval_seconds: float)
      ~(on_prices: price_data list -> unit Lwt.t)
    : unit Lwt.t =

    let rec monitor_loop () =
      let%lwt () = Logs_lwt.info (fun m ->
        m "Fetching latest stablecoin prices..."
      ) in

      let%lwt prices = fetch_all_prices ~config in

      let%lwt () = Logs_lwt.info (fun m ->
        m "Fetched %d prices successfully" (List.length prices)
      ) in

      (* Call callback *)
      let%lwt () = on_prices prices in

      (* Wait for next update *)
      let%lwt () = Lwt_unix.sleep update_interval_seconds in

      monitor_loop ()
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Starting Chainlink price monitor (interval: %.0fs)" update_interval_seconds
    ) in

    monitor_loop ()

  (** Detect if price data is stale *)
  let is_price_stale (price: price_data) ~(max_age_seconds: float) : bool =
    let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let age_seconds = current_time -. price.timestamp in
    Float.(age_seconds > max_age_seconds)

  (** Validate price data quality *)
  let validate_price_data (price: price_data) ~(max_age_seconds: float option) : bool =
    (* Check asset-specific price ranges *)
    let is_price_range_valid = match price.asset with
      | USDC | USDT | USDP | DAI | FRAX | BUSD | USDe | SUSDe | USDY | PYUSD | GHO | LUSD | CrvUSD | MkUSD ->
          (* Stablecoins should be close to $1.00 *)
          Float.(price.price >= 0.70 && price.price <= 1.30)
      | BTC ->
          (* BTC should be in reasonable range *)
          Float.(price.price >= 10000.0 && price.price <= 200000.0)
      | ETH ->
          (* ETH should be in reasonable range *)
          Float.(price.price >= 500.0 && price.price <= 20000.0)
    in

    (* Data shouldn't be too stale *)
    let max_age = Option.value max_age_seconds ~default:300.0 in (* Default 5 minutes *)
    let is_fresh = not (is_price_stale price ~max_age_seconds:max_age) in

    (* Confidence threshold *)
    let has_confidence = Float.(price.confidence >= 0.5) in

    is_price_range_valid && is_fresh && has_confidence

  (** Detect price anomalies *)
  let detect_anomaly
      ~(current_price: float)
      ~(historical_prices: float list)
      ~(sigma_threshold: float)
    : bool =

    if List.length historical_prices < 10 then false
    else
      let mean = Math.mean historical_prices in
      let std_dev = Math.std_dev historical_prices in

      let z_score = (current_price -. mean) /. std_dev in

      Float.(abs z_score > sigma_threshold)

end
