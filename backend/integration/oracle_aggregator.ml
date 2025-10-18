(* Oracle Aggregator - Multi-Source Price Feed Consensus

   Aggregates price data from multiple oracle providers:
   - RedStone (TON-native, low latency)
   - Pyth Network (High frequency, institutional grade)
   - Chainlink (Most established, wide coverage)

   Features:
   - Weighted average consensus
   - Outlier detection and removal
   - Circuit breakers for extreme volatility
   - Time-weighted average price (TWAP)
   - Staleness checks
   - Data quality scoring

   Safety:
   - Never trust single source
   - Require 2+ sources for any price
   - Reject prices >10% from median
   - 5-minute staleness limit
*)

open Core
open Lwt.Syntax
open Types
open Math

module OracleAggregator = struct

  (** Oracle provider types **)
  type oracle_provider =
    | Chainlink
    | Pyth
    | Binance
    | RedStone
    | Custom of string
  [@@deriving sexp]

  (** Price data point from single oracle **)
  type price_point = {
    provider: oracle_provider;
    asset: asset;
    price: float;
    timestamp: float;
    confidence: float; (* 0.0 to 1.0 *)
    source_signature: string option;
  } [@@deriving sexp]

  (** Aggregated consensus price **)
  type consensus_price = {
    asset: asset;
    price: float;
    weighted_price: float;
    median_price: float;
    std_deviation: float;
    num_sources: int;
    sources: price_point list;
    timestamp: float;
    confidence: float;
    is_stale: bool;
    has_anomaly: bool;
  } [@@deriving sexp]

  (** Oracle configuration **)
  type oracle_config = {
    providers: oracle_provider list;
    weights: (oracle_provider * float) list; (* Provider → Weight *)
    staleness_threshold: float; (* Seconds *)
    outlier_threshold: float; (* e.g., 0.10 = 10% *)
    min_sources: int;
    circuit_breaker_threshold: float; (* Max price change per update *)
  } [@@deriving sexp]

  (** Default configuration - Median-of-3: Chainlink + Pyth + Binance **)
  let default_config = {
    providers = [Chainlink; Pyth; Binance];
    weights = [
      (Chainlink, 0.35);  (* 35% - Most established, on-chain verification *)
      (Pyth, 0.35);       (* 35% - High frequency, institutional grade *)
      (Binance, 0.30);    (* 30% - High volume, real market prices *)
    ];
    staleness_threshold = 300.0; (* 5 minutes *)
    outlier_threshold = 0.02; (* 2% - tighter for median-of-3 *)
    min_sources = 2; (* Require at least 2 sources *)
    circuit_breaker_threshold = 0.05; (* 5% max change per update *)
  }

  (** Provider-specific API endpoints **)
  module Endpoints = struct
    let redstone_url asset =
      match asset with
      | USDC -> "https://api.redstone.finance/prices?symbol=USDC&provider=redstone-primary"
      | USDT -> "https://api.redstone.finance/prices?symbol=USDT&provider=redstone-primary"
      | USDP -> "https://api.redstone.finance/prices?symbol=USDP&provider=redstone-primary"
      | DAI -> "https://api.redstone.finance/prices?symbol=DAI&provider=redstone-primary"
      | FRAX -> "https://api.redstone.finance/prices?symbol=FRAX&provider=redstone-primary"
      | BUSD -> "https://api.redstone.finance/prices?symbol=BUSD&provider=redstone-primary"
      | USDe -> "https://api.redstone.finance/prices?symbol=USDe&provider=redstone-primary"
      | SUSDe -> "https://api.redstone.finance/prices?symbol=sUSDe&provider=redstone-primary"
      | USDY -> "https://api.redstone.finance/prices?symbol=USDY&provider=redstone-primary"
      | PYUSD -> "https://api.redstone.finance/prices?symbol=PYUSD&provider=redstone-primary"
      | GHO -> "https://api.redstone.finance/prices?symbol=GHO&provider=redstone-primary"
      | LUSD -> "https://api.redstone.finance/prices?symbol=LUSD&provider=redstone-primary"
      | CrvUSD -> "https://api.redstone.finance/prices?symbol=crvUSD&provider=redstone-primary"
      | MkUSD -> "https://api.redstone.finance/prices?symbol=mkUSD&provider=redstone-primary"
      | BTC -> "https://api.redstone.finance/prices?symbol=BTC&provider=redstone-primary"
      | ETH -> "https://api.redstone.finance/prices?symbol=ETH&provider=redstone-primary"

    let pyth_url asset =
      match asset with
      | USDC -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a"
      | USDT -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b"
      | USDP -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x09f7c1d7dfbb7df2b8fe3d3d87ee94a2259d212da4f30c1f0540d066dfa44723"
      | DAI -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0xb0948a5e5313200c632b51bb5ca32f6de0d36e9950a942d19751e833f70dabfd"
      | FRAX -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x735f591e4fed988cd38df74d8fcedecf2fe8d9111664e0fd500db9aa78b316b1"
      | BUSD -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x5bc91f13e412c07599167bae86f07543f076a638962b8d6017ec19dab4a82814"
      | USDe -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x6ec879b1e9963de5ee97e9c8710b742d6228252a5e2ca12d4ae81d7fe5ee8c5d"
      | SUSDe -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0xca3ba9a619a4b3755c10ac7d5e760275aa95e9823d38a84fedd416856cdba37c"
      | USDY -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0xc54b2e5af29b5f171bece8d1518bb65f6cce1b08d456d54c2fe8f3f55c4cb7be"
      | PYUSD -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x3b1ada3f7ad66275f0fa5d3cb68d22fb369c9570dc1f99d09e3fa000c6ee369f"
      | GHO -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x8963217838ab4cf5cadc172203c1f0b763fbaa45f346d8ee50ba994bbcac3026"
      | LUSD -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x67be9f519b95cf24338801051f9a808eff0a578ccb388db73b7f6fe1de019ffb"
      | CrvUSD -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x02e7c1c6d8cc1671b5fd1e2e4a7a5c4c67d49aeb53df8c8d33509b7c8e042c22"
      | MkUSD -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0x345c5a8e70fb89d18b5bc6d4626db673259f54231e67dc38f81e9f3b4a3c0446"
      | BTC -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
      | ETH -> "https://hermes.pyth.network/api/latest_price_feeds?ids[]=0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"

    let chainlink_url asset =
      match asset with
      | USDC -> "https://api.chain.link/price/USDC_USD"
      | USDT -> "https://api.chain.link/price/USDT_USD"
      | USDP -> "https://api.chain.link/price/USDP_USD"
      | DAI -> "https://api.chain.link/price/DAI_USD"
      | FRAX -> "https://api.chain.link/price/FRAX_USD"
      | BUSD -> "https://api.chain.link/price/BUSD_USD"
      | USDe -> "https://api.chain.link/price/USDe_USD"
      | SUSDe -> "https://api.chain.link/price/sUSDe_USD"
      | USDY -> "https://api.chain.link/price/USDY_USD"
      | PYUSD -> "https://api.chain.link/price/PYUSD_USD"
      | GHO -> "https://api.chain.link/price/GHO_USD"
      | LUSD -> "https://api.chain.link/price/LUSD_USD"
      | CrvUSD -> "https://api.chain.link/price/crvUSD_USD"
      | MkUSD -> "https://api.chain.link/price/mkUSD_USD"
      | BTC -> "https://api.chain.link/price/BTC_USD"
      | ETH -> "https://api.chain.link/price/ETH_USD"
  end

  (** Fetch price from RedStone **)
  let fetch_redstone_price (asset: asset) : price_point Lwt.t =
    let url = Endpoints.redstone_url asset in

    let%lwt response = Cohttp_lwt_unix.Client.get (Uri.of_string url) in
    let%lwt body = Cohttp_lwt.Body.to_string (snd response) in

    let json = Yojson.Safe.from_string body in
    let open Yojson.Safe.Util in

    let price = json |> member "value" |> to_float in
    let timestamp = json |> member "timestamp" |> to_float in

    Lwt.return {
      provider = RedStone;
      asset;
      price;
      timestamp;
      confidence = 0.95; (* RedStone has high confidence *)
      source_signature = None;
    }

  (** Fetch price from Pyth **)
  let fetch_pyth_price (asset: asset) : price_point Lwt.t =
    let url = Endpoints.pyth_url asset in

    let%lwt response = Cohttp_lwt_unix.Client.get (Uri.of_string url) in
    let%lwt body = Cohttp_lwt.Body.to_string (snd response) in

    let json = Yojson.Safe.from_string body in
    let open Yojson.Safe.Util in

    let price_data = json |> member "data" |> to_list |> List.hd_exn in
    let price_obj = price_data |> member "price" in

    let price_raw = price_obj |> member "price" |> to_string |> Int64.of_string in
    let expo = price_obj |> member "expo" |> to_int in
    let price = Int64.to_float price_raw *. (10.0 ** (Float.of_int expo)) in

    let timestamp = price_obj |> member "publish_time" |> to_float in
    let conf = price_obj |> member "conf" |> to_string |> Int64.of_string |> Int64.to_float in

    (* Confidence = 1 - (conf / price) *)
    let confidence = 1.0 -. (conf /. Float.abs price) in

    Lwt.return {
      provider = Pyth;
      asset;
      price;
      timestamp;
      confidence;
      source_signature = None;
    }

  (** Fetch price from Chainlink (using chainlink_client.ml) **)
  let fetch_chainlink_price (asset: asset) : price_point Lwt.t =
    let open Chainlink_client.ChainlinkClient in

    (* Create config with multiple RPC endpoints *)
    let config = {
      rpc_endpoints = [
        (Ethereum, [
          "https://eth-mainnet.g.alchemy.com/v2/demo";
          "https://mainnet.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161";
          "https://cloudflare-eth.com";
        ]);
      ];
      api_keys = [];
      rate_limit_per_second = 10;
      timeout_seconds = 10.0;
      retry_attempts = 3;
      cache_ttl_seconds = 300;
    } in

    (* Find feed for this asset on Ethereum *)
    let feed_opt = List.find ethereum_feeds ~f:(fun f -> Poly.equal f.asset asset) in

    match feed_opt with
    | None ->
        (* Asset not supported by Chainlink *)
        let timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
        Lwt.return {
          provider = Chainlink;
          asset;
          price = 0.0;
          timestamp;
          confidence = 0.0;
          source_signature = None;
        }
    | Some feed ->
        let%lwt result = fetch_chainlink_price ~config ~feed in

        match result with
        | Some data ->
            Lwt.return {
              provider = Chainlink;
              asset = data.asset;
              price = data.price;
              timestamp = data.timestamp;
              confidence = data.confidence;
              source_signature = None;
            }
        | None ->
            let timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
            Lwt.return {
              provider = Chainlink;
              asset;
              price = 0.0;
              timestamp;
              confidence = 0.0;
              source_signature = None;
            }

  (** Fetch price from Binance Spot **)
  let fetch_binance_price (asset: asset) : price_point Lwt.t =
    (* Map asset to Binance trading pair *)
    let symbol = match asset with
      | BTC -> "BTCUSDT"
      | ETH -> "ETHUSDT"
      | USDC -> "USDCUSDT"
      | USDT -> "USDTUSDT" (* Note: USDT/USDT doesn't exist, use 1.0 *)
      | BUSD -> "BUSDUSDT"
      | DAI -> "DAIUSDT"
      | _ -> "" (* Not all stablecoins have Binance pairs *)
    in

    if String.is_empty symbol || String.equal symbol "USDTUSDT" then
      (* Return 1.0 for stablecoins without pairs *)
      Lwt.return {
        provider = Binance;
        asset;
        price = 1.0;
        timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
        confidence = 0.95;
        source_signature = None;
      }
    else
      try%lwt
        let url = Printf.sprintf "https://api.binance.com/api/v3/ticker/price?symbol=%s" symbol in

        let%lwt (_resp, body) = Cohttp_lwt_unix.Client.get (Uri.of_string url) in
        let%lwt body_string = Cohttp_lwt.Body.to_string body in

        let json = Yojson.Safe.from_string body_string in
        let open Yojson.Safe.Util in

        let price = json |> member "price" |> to_string |> Float.of_string in

        Lwt.return {
          provider = Binance;
          asset;
          price;
          timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
          confidence = 0.95; (* Binance has high liquidity *)
          source_signature = None;
        }

      with exn ->
        let () = Logs.err (fun m ->
          m "Binance fetch failed for %s: %s" symbol (Exn.to_string exn)
        ) in
        Lwt.return {
          provider = Binance;
          asset;
          price = 0.0;
          timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
          confidence = 0.0;
          source_signature = None;
        }

  (** Fetch price from Pyth (using pyth_client.ml) **)
  let fetch_pyth_price_updated (asset: asset) : price_point Lwt.t =
    let open Pyth_client.PythClient in

    let%lwt result = get_price asset () in

    match result with
    | Some data ->
        Lwt.return {
          provider = Pyth;
          asset = data.asset;
          price = data.price;
          timestamp = data.publish_time;
          confidence = data.confidence;
          source_signature = None;
        }
    | None ->
        let timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
        Lwt.return {
          provider = Pyth;
          asset;
          price = 0.0;
          timestamp;
          confidence = 0.0;
          source_signature = None;
        }

  (** Fetch from single provider with error handling **)
  let fetch_from_provider
      (provider: oracle_provider)
      (asset: asset)
    : price_point option Lwt.t =

    try%lwt
      match provider with
      | Chainlink ->
          let%lwt p = fetch_chainlink_price asset in
          if Float.(p.confidence > 0.0) then Lwt.return (Some p) else Lwt.return None
      | Pyth ->
          let%lwt p = fetch_pyth_price_updated asset in
          if Float.(p.confidence > 0.0) then Lwt.return (Some p) else Lwt.return None
      | Binance ->
          let%lwt p = fetch_binance_price asset in
          if Float.(p.confidence > 0.0) then Lwt.return (Some p) else Lwt.return None
      | RedStone ->
          let%lwt p = fetch_redstone_price asset in Lwt.return (Some p)
      | Custom _ -> Lwt.return None (* Custom providers not yet implemented *)
    with exn ->
      let () = Logs.err (fun m ->
        m "Provider fetch error for %s: %s"
          (match provider with
           | Chainlink -> "Chainlink"
           | Pyth -> "Pyth"
           | Binance -> "Binance"
           | RedStone -> "RedStone"
           | Custom s -> s)
          (Exn.to_string exn)
      ) in
      Lwt.return None (* Swallow errors, return None *)

  (** Fetch prices from all configured providers **)
  let fetch_all_prices
      (config: oracle_config)
      (asset: asset)
    : price_point list Lwt.t =

    let%lwt results =
      Lwt_list.map_p
        (fun provider -> fetch_from_provider provider asset)
        config.providers
    in

    (* Filter out None values *)
    let prices = List.filter_map results ~f:Fn.id in

    Lwt.return prices

  (** Check if price is stale **)
  let is_stale (price: price_point) ~(threshold: float) : bool =
    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    Float.((now -. price.timestamp) > threshold)

  (** Detect outliers using median absolute deviation **)
  let detect_outliers
      (prices: price_point list)
      ~(threshold: float)
    : price_point list * price_point list =

    if List.length prices < 3 then
      (prices, []) (* Need at least 3 for outlier detection *)
    else
      let price_values = List.map prices ~f:(fun p -> p.price) in
      let median = median price_values in

      (* Partition into normal and outliers *)
      let (normal, outliers) =
        List.partition_tf prices ~f:(fun p ->
          let deviation = Float.abs (p.price -. median) /. median in
          Float.(deviation <= threshold)
        )
      in

      (normal, outliers)

  (** Calculate weighted average **)
  let weighted_average
      (prices: price_point list)
      ~(weights: (oracle_provider * float) list)
    : float =

    let total_weight = ref 0.0 in
    let weighted_sum = ref 0.0 in

    List.iter prices ~f:(fun p ->
      let weight =
        List.Assoc.find weights p.provider ~equal:Poly.equal
        |> Option.value ~default:0.0
      in

      let adjusted_weight = weight *. p.confidence in

      weighted_sum := !weighted_sum +. (p.price *. adjusted_weight);
      total_weight := !total_weight +. adjusted_weight;
    );

    if Float.(!total_weight > 0.0) then
      !weighted_sum /. !total_weight
    else
      0.0

  (** Calculate consensus confidence score **)
  let calculate_confidence
      (prices: price_point list)
      (std_dev: float)
      (median: float)
    : float =

    (* More sources = higher confidence *)
    let source_factor =
      Float.min 1.0 (Float.of_int (List.length prices) /. 3.0)
    in

    (* Lower std dev = higher confidence *)
    let volatility_factor =
      1.0 -. Float.min 1.0 (std_dev /. median)
    in

    (* Average provider confidence *)
    let avg_confidence =
      mean (List.map prices ~f:(fun p -> p.confidence))
    in

    (* Combined *)
    (source_factor +. volatility_factor +. avg_confidence) /. 3.0

  (** Aggregate prices into consensus **)
  let aggregate
      (config: oracle_config)
      (prices: price_point list)
      ~(previous_price: float option)
    : consensus_price option =

    (* Filter stale prices *)
    let fresh_prices =
      List.filter prices ~f:(fun p ->
        not (is_stale p ~threshold:config.staleness_threshold)
      )
    in

    (* Need minimum sources *)
    if List.length fresh_prices < config.min_sources then
      None
    else
      (* Detect and remove outliers *)
      let (normal_prices, outlier_prices) =
        detect_outliers fresh_prices ~threshold:config.outlier_threshold
      in

      let has_anomaly = not (List.is_empty outlier_prices) in

      if List.length normal_prices < config.min_sources then
        None (* Too many outliers *)
      else
        let price_values = List.map normal_prices ~f:(fun p -> p.price) in

        let median = median price_values in
        let weighted = weighted_average normal_prices ~weights:config.weights in
        let std_dev = std_dev price_values in

        (* Circuit breaker check *)
        let price_change_ok = match previous_price with
          | None -> true
          | Some prev ->
              let change = Float.abs (weighted -. prev) /. prev in
              Float.(change <= config.circuit_breaker_threshold)
        in

        if not price_change_ok then
          None (* Circuit breaker triggered *)
        else
          let confidence = calculate_confidence normal_prices std_dev median in

          let asset = (List.hd_exn normal_prices).asset in

          Some {
            asset;
            price = median; (* Use median as primary (most robust) *)
            weighted_price = weighted;
            median_price = median;
            std_deviation = std_dev;
            num_sources = List.length normal_prices;
            sources = normal_prices;
            timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
            confidence;
            is_stale = false;
            has_anomaly;
          }

  (** Main entry point: Fetch and aggregate consensus price **)
  let get_consensus_price
      ?(config = default_config)
      (asset: asset)
      ~(previous_price: float option)
    : consensus_price option Lwt.t =

    let%lwt prices = fetch_all_prices config asset in

    let consensus = aggregate config prices ~previous_price in

    Lwt.return consensus

  (** Calculate time-weighted average price (TWAP) **)
  let calculate_twap
      (price_history: consensus_price list)
      ~(window_seconds: float)
    : float option =

    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let cutoff = now -. window_seconds in

    (* Filter to window *)
    let recent_prices =
      List.filter price_history ~f:(fun p -> Float.(p.timestamp >= cutoff))
    in

    if List.is_empty recent_prices then
      None
    else
      (* Weight by time interval *)
      let rec calc_twap acc total_time = function
        | [] -> if Float.(total_time > 0.0) then Some (acc /. total_time) else None
        | [p] ->
            let duration = now -. p.timestamp in
            Some ((acc +. (p.price *. duration)) /. (total_time +. duration))
        | p1 :: p2 :: rest ->
            let duration = p1.timestamp -. p2.timestamp in
            let weighted_price = p2.price *. duration in
            calc_twap (acc +. weighted_price) (total_time +. duration) (p2 :: rest)
      in

      calc_twap 0.0 0.0 (List.sort recent_prices ~compare:(fun a b ->
        Float.compare b.timestamp a.timestamp
      ))

  (** Check if depeg condition is met with confirmation **)
  let check_depeg_condition
      (price_history: consensus_price list)
      ~(trigger_price: float)
      ~(confirmation_seconds: float)
    : bool =

    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let confirmation_start = now -. confirmation_seconds in

    (* Check if ALL prices in confirmation window are below trigger *)
    let confirmation_prices =
      List.filter price_history ~f:(fun p ->
        Float.(p.timestamp >= confirmation_start && p.timestamp <= now)
      )
    in

    if List.is_empty confirmation_prices then
      false
    else
      List.for_all confirmation_prices ~f:(fun p ->
        Float.(p.price < trigger_price)
      )

end

(** Multi-Chain Oracle Extension **)
module MultiChainOracle = struct

  (** Chain-specific price data *)
  type chain_price = {
    chain: blockchain;
    asset: asset;
    price: float;
    timestamp: float;
    consensus: OracleAggregator.consensus_price option;
  }

  (** Multi-chain price state *)
  type multi_chain_state = {
    prices: (blockchain * asset * chain_price) list;
    last_updated: float;
  }

  (** Chain-specific oracle endpoints *)
  let get_chain_oracle_endpoints (chain: blockchain) (asset: asset) : string list =
    match chain with
    | Ethereum -> [
        Printf.sprintf "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";
        Printf.sprintf "https://api.coinbase.com/v2/prices/ETH-USD/spot";
      ]
    | Bitcoin -> [
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
        "https://api.coinbase.com/v2/prices/BTC-USD/spot";
      ]
    | Arbitrum | Base | Polygon | Optimism -> [
        (* These chains use same stablecoin prices as Ethereum *)
        Printf.sprintf "https://api.coingecko.com/api/v3/simple/price?ids=%s&vs_currencies=usd"
          (match asset with
           | USDC -> "usd-coin"
           | USDT -> "tether"
           | DAI -> "dai"
           | USDP -> "paxos-standard"
           | FRAX -> "frax"
           | BUSD -> "binance-usd"
           | USDe | SUSDe | USDY | PYUSD | GHO | LUSD | CrvUSD | MkUSD -> "usd-coin"
           | BTC -> "bitcoin"
           | ETH -> "ethereum");
      ]
    | Lightning -> [
        (* Lightning uses Bitcoin as base *)
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd";
      ]
    | TON -> [
        (* TON oracle endpoints *)
        "https://api.redstone.finance/prices?symbol=TON&provider=redstone-primary";
      ]
    | Solana -> [
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";
      ]

  (** Fetch price for specific chain and asset *)
  let fetch_chain_price
      ?(config = OracleAggregator.default_config)
      (chain: blockchain)
      (asset: asset)
      ~(previous_price: float option)
    : chain_price option Lwt.t =

    let%lwt consensus_opt =
      OracleAggregator.get_consensus_price ~config asset ~previous_price
    in

    match consensus_opt with
    | None -> Lwt.return None
    | Some consensus ->
        Lwt.return (Some {
          chain;
          asset;
          price = consensus.price;
          timestamp = consensus.timestamp;
          consensus = Some consensus;
        })

  (** Fetch prices for all chains and assets *)
  let fetch_all_chain_prices
      ?(chains = [Ethereum; Arbitrum; Base; Polygon; Bitcoin; Lightning; TON])
      ?(assets = [USDC; USDT; DAI; USDP; FRAX])
      ~(previous_state: multi_chain_state option)
      ()
    : multi_chain_state Lwt.t =

    let get_previous_price chain asset =
      match previous_state with
      | None -> None
      | Some state ->
          List.find state.prices ~f:(fun (c, a, _) -> equal_blockchain c chain && equal_asset a asset)
          |> Option.map ~f:(fun (_, _, cp) -> cp.price)
    in

    let fetch_pairs =
      List.concat_map chains ~f:(fun chain ->
        List.map assets ~f:(fun asset -> (chain, asset))
      )
    in

    let%lwt results =
      Lwt_list.map_p (fun (chain, asset) ->
        let prev = get_previous_price chain asset in
        let%lwt price_opt = fetch_chain_price chain asset ~previous_price:prev in
        Lwt.return (chain, asset, price_opt)
      ) fetch_pairs
    in

    let prices =
      List.filter_map results ~f:(fun (chain, asset, price_opt) ->
        Option.map price_opt ~f:(fun p -> (chain, asset, p))
      )
    in

    Lwt.return {
      prices;
      last_updated = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    }

  (** Get price for specific chain and asset *)
  let get_chain_price
      (state: multi_chain_state)
      (chain: blockchain)
      (asset: asset)
    : chain_price option =
    List.find state.prices ~f:(fun (c, a, _) -> equal_blockchain c chain && equal_asset a asset)
    |> Option.map ~f:(fun (_, _, p) -> p)

  (** Check if cross-chain price discrepancy exists *)
  let check_cross_chain_discrepancy
      (state: multi_chain_state)
      (asset: asset)
      ~(threshold: float)
    : bool * (blockchain * float) list =

    (* Get all prices for this asset across chains *)
    let asset_prices =
      List.filter_map state.prices ~f:(fun (chain, a, price) ->
        if equal_asset a asset then Some (chain, price.price) else None
      )
    in

    if List.length asset_prices < 2 then
      (false, [])
    else
      let prices_only = List.map asset_prices ~f:snd in
      let mean_price = mean prices_only in

      (* Find chains with significant deviation *)
      let deviations =
        List.filter_map asset_prices ~f:(fun (chain, price) ->
          let deviation = Float.abs (price -. mean_price) /. mean_price in
          if Float.(deviation > threshold) then
            Some (chain, deviation)
          else
            None
        )
      in

      (not (List.is_empty deviations), deviations)

  (** Monitor cross-chain prices continuously *)
  let start_cross_chain_monitoring
      ?(update_interval = 60.0) (* 1 minute *)
      ?(chains = [Ethereum; Arbitrum; Base; Polygon; Bitcoin; TON])
      ?(assets = [USDC; USDT; DAI; USDP; FRAX])
      ~(on_update: multi_chain_state -> unit Lwt.t)
      ()
    : unit Lwt.t =

    let rec monitoring_loop state_opt =
      let* state = fetch_all_chain_prices ~chains ~assets ~previous_state:state_opt () in

      (* Notify update *)
      let* () = on_update state in

      (* Log summary *)
      let () =
        Printf.printf "[Multi-Chain Oracle] Updated %d price pairs at %s\n"
          (List.length state.prices)
          (string_of_float state.last_updated);
        Out_channel.flush Out_channel.stdout
      in

      (* Wait before next update *)
      let* () = Lwt_unix.sleep update_interval in

      monitoring_loop (Some state)
    in

    monitoring_loop None

  (** Generate cross-chain event from price update *)
  let price_to_event (chain_price: chain_price) : cross_chain_event =
    PriceUpdate {
      chain = chain_price.chain;
      asset = chain_price.asset;
      price = chain_price.price;
      timestamp = chain_price.timestamp;
    }

  (** Check if chain-specific policy trigger is activated *)
  let check_chain_policy_trigger
      (state: multi_chain_state)
      (policy: chain_specific_policy)
    : bool * float option =

    let price_opt = get_chain_price state policy.monitored_chain policy.asset in

    match price_opt with
    | None -> (false, None) (* No price data *)
    | Some chain_price ->
        let triggered =
          match policy.trigger_condition with
          | PriceDepeg { trigger_price; floor_price; _ } ->
              Float.(chain_price.price < trigger_price && chain_price.price >= floor_price)
          | BridgeFailure _ | ContractExploit _ | NetworkFailure _ ->
              false (* Handled by other monitors *)
        in

        (triggered, Some chain_price.price)

end

