(** Dynamic Pricing API v2
 *
 * REST endpoints and WebSocket channel for real-time premium quotes
 * Integrates with DynamicPricingOracle for market-responsive pricing
 *
 * Endpoints:
 * - GET  /api/v2/pricing/dynamic-quote - Get current premium with breakdown
 * - GET  /api/v2/pricing/product-multiplier - Get current multiplier for product
 * - POST /api/v2/pricing/lock-price - Lock price for 2 minutes
 * - GET  /api/v2/pricing/market-conditions - Get current market snapshot
 *
 * WebSocket Channel:
 * - pricing_updates - Broadcasts whenever oracle updates (every 60s)
 *)

open Core
open Lwt.Syntax
open Types
open Dream

(** Price lock entry (2-minute validity) *)
type price_lock = {
  lock_id: string;
  user_address: string;
  coverage_type: coverage_type;
  chain: blockchain;
  stablecoin: asset;
  coverage_amount: usd_cents;
  duration_days: int;
  locked_premium: usd_cents;
  locked_rate_bps: int;
  multiplier_snapshot: int;
  created_at: float;
  expires_at: float;
}

(** Quote response with full breakdown *)
type dynamic_quote_response = {
  base_premium: float;
  market_adjustment_pct: float;
  volatility_premium_pct: float;
  final_premium: float;
  effective_apr: float;
  valid_until: float;
  multiplier_components: multiplier_breakdown;
  market_factors: market_factor_summary;
}
[@@deriving yojson]

and multiplier_breakdown = {
  base: int;
  market_adj: int;
  volatility: int;
  total: int;
}
[@@deriving yojson]

and market_factor_summary = {
  stablecoin_price: float;
  bridge_health: float option;
  cex_liquidation_rate: float;
  chain_congestion: string; (* "low" | "medium" | "high" *)
  overall_volatility: float;
}
[@@deriving yojson]

(** Price lock cache (in-memory for now, use Redis in production) *)
let price_locks : (string, price_lock) Hashtbl.t = Hashtbl.create (module String)

(** Premium cache (30-second TTL) *)
type cached_quote = {
  quote: dynamic_quote_response;
  cached_at: float;
}

let quote_cache : (string, cached_quote) Hashtbl.t = Hashtbl.create (module String)
let cache_ttl = 30.0 (* 30 seconds *)

(** ============================================
 * HELPER FUNCTIONS
 * ============================================ *)

(** Generate cache key for quote *)
let make_cache_key ~coverage_type ~chain ~stablecoin ~amount ~duration =
  Printf.sprintf "%s:%s:%s:%Ld:%d"
    (coverage_type_to_string coverage_type)
    (blockchain_to_string chain)
    (asset_to_string stablecoin)
    amount
    duration

(** Check if cached quote is fresh *)
let is_cache_fresh ~cached_at =
  let now = Unix.time () in
  (now -. cached_at) < cache_ttl

(** Get current market conditions (from keeper) *)
let get_current_market_conditions () : Pricing_oracle_keeper.market_conditions Lwt.t =
  (* In production: fetch from shared state or Redis *)
  Pricing_oracle_keeper.fetch_market_conditions ()

(** Get product multiplier from oracle *)
let get_product_multiplier_from_oracle
    ~coverage_type ~chain ~stablecoin : multiplier_breakdown Lwt.t =

  (* In production: Call DynamicPricingOracle.get_product_multiplier()
   * via TON blockchain RPC
   *)

  (* Mock: Calculate using keeper logic *)
  let* conditions = get_current_market_conditions () in
  let mult = Pricing_oracle_keeper.calculate_product_multiplier
    ~coverage_type ~chain ~stablecoin ~conditions
  in

  Lwt.return {
    base = mult.base_multiplier;
    market_adj = mult.market_adjustment;
    volatility = mult.volatility_premium;
    total = mult.total;
  }

(** Calculate base premium (from risk_multipliers.fc logic) *)
let calculate_base_premium
    ~coverage_type ~chain ~stablecoin ~coverage_amount ~duration_days : float =

  (* Base rates (in bps) *)
  let base_rate = match coverage_type with
    | Depeg -> 80
    | Smart_contract -> 200
    | Oracle -> 180
    | Bridge -> 200
    | CEX_liquidation -> 300
  in

  (* Chain multipliers *)
  let chain_mult = match chain with
    | Ethereum -> 10000
    | Arbitrum -> 11000
    | Base -> 11000
    | Polygon -> 12000
    | Bitcoin -> 9000
    | Lightning -> 13000
    | TON -> 11500
    | Solana -> 14000
    | _ -> 10000
  in

  (* Stablecoin adjustments *)
  let stable_adj = match stablecoin with
    | USDC | USDT | USDP | DAI -> 0
    | LUSD -> 10
    | PYUSD -> 25
    | BUSD -> 50
    | FRAX -> 75
    | GHO -> 50
    | crvUSD -> 60
    | mkUSD -> 70
    | USDe -> 100
    | sUSDe -> 125
    | USDY -> 110
    | _ -> 0
  in

  (* Calculate adjusted rate *)
  let adjusted_rate = Float.of_int (base_rate * chain_mult / 10000 + stable_adj) in

  (* Calculate premium *)
  let coverage_usd = Math.cents_to_usd coverage_amount in
  let annual_premium = coverage_usd *. adjusted_rate /. 10000.0 in
  let prorated_premium = annual_premium *. (Float.of_int duration_days /. 365.0) in

  prorated_premium

(** ============================================
 * API HANDLERS
 * ============================================ *)

(** GET /api/v2/pricing/dynamic-quote *)
let handle_dynamic_quote request =
  let coverage_type_str = Dream.query request "coverage_type" |> Option.value ~default:"depeg" in
  let chain_str = Dream.query request "chain" |> Option.value ~default:"ethereum" in
  let stablecoin_str = Dream.query request "stablecoin" |> Option.value ~default:"USDC" in
  let amount_str = Dream.query request "amount" |> Option.value ~default:"10000" in
  let duration_str = Dream.query request "duration_days" |> Option.value ~default:"30" in

  (* Parse parameters *)
  let coverage_type = match coverage_type_of_string coverage_type_str with
    | Ok ct -> ct
    | Error _ -> Depeg
  in
  let chain = match blockchain_of_string (String.capitalize chain_str) with
    | Ok ch -> ch
    | Error _ -> Ethereum
  in
  let stablecoin = match asset_of_string stablecoin_str with
    | Ok s -> s
    | Error _ -> USDC
  in
  let coverage_amount = Math.usd_to_cents (Float.of_string amount_str) in
  let duration_days = Int.of_string duration_str in

  let%lwt () = Lwt_io.printf "[Dynamic Pricing API] Quote request: %s/%s/%s $%s for %d days\n"
    coverage_type_str chain_str stablecoin_str amount_str duration_days
  in

  (* Check cache *)
  let cache_key = make_cache_key ~coverage_type ~chain ~stablecoin
    ~amount:coverage_amount ~duration:duration_days
  in

  match Hashtbl.find quote_cache cache_key with
  | Some cached when is_cache_fresh ~cached_at:cached.cached_at ->
      let%lwt () = Lwt_io.printf "[Dynamic Pricing API] Cache hit\n" in
      Dream.json (Yojson.Safe.to_string (dynamic_quote_response_to_yojson cached.quote))

  | _ ->
      (* Fetch multiplier from oracle *)
      let* multiplier = get_product_multiplier_from_oracle
        ~coverage_type ~chain ~stablecoin
      in

      (* Fetch market conditions *)
      let* conditions = get_current_market_conditions () in

      (* Calculate base premium *)
      let base_premium = calculate_base_premium
        ~coverage_type ~chain ~stablecoin ~coverage_amount ~duration_days
      in

      (* Apply dynamic multiplier *)
      let multiplier_factor = Float.of_int multiplier.total /. 10000.0 in
      let final_premium = base_premium *. multiplier_factor in

      (* Calculate adjustments as percentages *)
      let market_adjustment_pct = Float.of_int multiplier.market_adj /. 100.0 in
      let volatility_premium_pct = Float.of_int multiplier.volatility /. 100.0 in

      (* Calculate effective APR *)
      let coverage_usd = Math.cents_to_usd coverage_amount in
      let effective_apr = (final_premium /. coverage_usd) *.
        (365.0 /. Float.of_int duration_days) *. 100.0
      in

      (* Find stablecoin price *)
      let stablecoin_price = List.find_map conditions.stablecoin_prices
        ~f:(fun (a, p, _) -> if equal_asset a stablecoin then Some p else None)
        |> Option.value ~default:1.0
      in

      (* Find bridge health *)
      let bridge_health = if equal_coverage_type coverage_type Bridge then
        let bridge_id = Printf.sprintf "wormhole_%s_ton"
          (blockchain_to_string chain |> String.lowercase)
        in
        List.find_map conditions.bridge_health_scores
          ~f:(fun (id, h) -> if String.equal id bridge_id then Some h else None)
      else None
      in

      (* Classify chain congestion *)
      let chain_congestion = match List.find conditions.chain_gas_prices
        ~f:(fun (c, _) -> equal_blockchain c chain) with
        | Some (Ethereum, gas) when gas > 100.0 -> "high"
        | Some (Ethereum, gas) when gas > 50.0 -> "medium"
        | Some (_, gas) when gas > 100.0 -> "high"
        | _ -> "low"
      in

      let quote = {
        base_premium;
        market_adjustment_pct;
        volatility_premium_pct;
        final_premium;
        effective_apr;
        valid_until = Unix.time () +. cache_ttl;
        multiplier_components = multiplier;
        market_factors = {
          stablecoin_price;
          bridge_health;
          cex_liquidation_rate = conditions.cex_liquidation_rate;
          chain_congestion;
          overall_volatility = conditions.overall_volatility_index;
        };
      } in

      (* Cache quote *)
      Hashtbl.set quote_cache ~key:cache_key
        ~data:{ quote; cached_at = Unix.time () };

      let%lwt () = Lwt_io.printf "[Dynamic Pricing API] Quote calculated: $%.2f (%.2f%% APR)\n"
        final_premium effective_apr
      in

      Dream.json (Yojson.Safe.to_string (dynamic_quote_response_to_yojson quote))

(** GET /api/v2/pricing/product-multiplier *)
let handle_product_multiplier request =
  let coverage_type_str = Dream.query request "coverage_type" |> Option.value ~default:"depeg" in
  let chain_str = Dream.query request "chain" |> Option.value ~default:"ethereum" in
  let stablecoin_str = Dream.query request "stablecoin" |> Option.value ~default:"USDC" in

  let coverage_type = match coverage_type_of_string coverage_type_str with
    | Ok ct -> ct | Error _ -> Depeg
  in
  let chain = match blockchain_of_string (String.capitalize chain_str) with
    | Ok ch -> ch | Error _ -> Ethereum
  in
  let stablecoin = match asset_of_string stablecoin_str with
    | Ok s -> s | Error _ -> USDC
  in

  let* multiplier = get_product_multiplier_from_oracle
    ~coverage_type ~chain ~stablecoin
  in

  let response = `Assoc [
    ("coverage_type", `String coverage_type_str);
    ("chain", `String chain_str);
    ("stablecoin", `String stablecoin_str);
    ("multiplier", `Assoc [
      ("base", `Int multiplier.base);
      ("market_adjustment", `Int multiplier.market_adj);
      ("volatility_premium", `Int multiplier.volatility);
      ("total", `Int multiplier.total);
      ("total_factor", `Float (Float.of_int multiplier.total /. 10000.0));
    ]);
    ("timestamp", `Float (Unix.time ()));
  ] in

  Dream.json (Yojson.Safe.to_string response)

(** POST /api/v2/pricing/lock-price *)
let handle_lock_price request =
  let%lwt body = Dream.body request in

  try%lwt
    let json = Yojson.Safe.from_string body in
    let open Yojson.Safe.Util in

    let user_address = json |> member "user_address" |> to_string in
    let coverage_type_str = json |> member "coverage_type" |> to_string in
    let chain_str = json |> member "chain" |> to_string in
    let stablecoin_str = json |> member "stablecoin" |> to_string in
    let amount_usd = json |> member "amount" |> to_float in
    let duration_days = json |> member "duration_days" |> to_int in

    (* Parse types *)
    let coverage_type = match coverage_type_of_string coverage_type_str with
      | Ok ct -> ct | Error _ -> failwith "Invalid coverage_type"
    in
    let chain = match blockchain_of_string (String.capitalize chain_str) with
      | Ok ch -> ch | Error _ -> failwith "Invalid chain"
    in
    let stablecoin = match asset_of_string stablecoin_str with
      | Ok s -> s | Error _ -> failwith "Invalid stablecoin"
    in
    let coverage_amount = Math.usd_to_cents amount_usd in

    (* Get current quote *)
    let* multiplier = get_product_multiplier_from_oracle
      ~coverage_type ~chain ~stablecoin
    in

    let base_premium = calculate_base_premium
      ~coverage_type ~chain ~stablecoin ~coverage_amount ~duration_days
    in

    let multiplier_factor = Float.of_int multiplier.total /. 10000.0 in
    let final_premium = base_premium *. multiplier_factor in
    let locked_premium = Math.usd_to_cents final_premium in

    (* Create price lock *)
    let lock_id = Digest.string (Printf.sprintf "%s:%f" user_address (Unix.time ()))
      |> Digest.to_hex
    in

    let now = Unix.time () in
    let lock = {
      lock_id;
      user_address;
      coverage_type;
      chain;
      stablecoin;
      coverage_amount;
      duration_days;
      locked_premium;
      locked_rate_bps = multiplier.total;
      multiplier_snapshot = multiplier.total;
      created_at = now;
      expires_at = now +. 120.0; (* 2 minutes *)
    } in

    Hashtbl.set price_locks ~key:lock_id ~data:lock;

    let%lwt () = Lwt_io.printf "[Dynamic Pricing API] Price locked for %s: $%.2f (expires in 2min)\n"
      user_address final_premium
    in

    let response = `Assoc [
      ("success", `Bool true);
      ("lock_id", `String lock_id);
      ("locked_premium", `Float final_premium);
      ("locked_rate_bps", `Int multiplier.total);
      ("valid_until", `Float lock.expires_at);
      ("expires_in_seconds", `Int 120);
    ] in

    Dream.json (Yojson.Safe.to_string response)

  with exn ->
    let error_response = `Assoc [
      ("success", `Bool false);
      ("error", `String (Exn.to_string exn));
    ] in
    Dream.json ~status:`Bad_Request (Yojson.Safe.to_string error_response)

(** GET /api/v2/pricing/market-conditions *)
let handle_market_conditions _request =
  let* conditions = get_current_market_conditions () in

  let stablecoin_prices_json = List.map conditions.stablecoin_prices
    ~f:(fun (asset, price, confidence) ->
      `Assoc [
        ("asset", `String (asset_to_string asset));
        ("price", `Float price);
        ("confidence", `Float confidence);
        ("deviation_pct", `Float ((price -. 1.0) *. 100.0));
      ]
    )
  in

  let bridge_health_json = List.map conditions.bridge_health_scores
    ~f:(fun (bridge_id, health) ->
      `Assoc [
        ("bridge_id", `String bridge_id);
        ("health_score", `Float health);
        ("status", `String (
          if health > 0.9 then "healthy"
          else if health > 0.7 then "caution"
          else if health > 0.5 then "warning"
          else "critical"
        ));
      ]
    )
  in

  let gas_prices_json = List.map conditions.chain_gas_prices
    ~f:(fun (chain, gas) ->
      `Assoc [
        ("chain", `String (blockchain_to_string chain));
        ("gas_price_gwei", `Float gas);
      ]
    )
  in

  let response = `Assoc [
    ("stablecoin_prices", `List stablecoin_prices_json);
    ("bridge_health_scores", `List bridge_health_json);
    ("cex_liquidation_rate", `Float conditions.cex_liquidation_rate);
    ("chain_gas_prices", `List gas_prices_json);
    ("protocol_exploit_count_24h", `Int conditions.protocol_exploit_count_24h);
    ("overall_volatility_index", `Float conditions.overall_volatility_index);
    ("timestamp", `Float conditions.timestamp);
  ] in

  Dream.json (Yojson.Safe.to_string response)

(** ============================================
 * WEBSOCKET BROADCASTER
 * ============================================ *)

(** Broadcast pricing update to WebSocket subscribers *)
let broadcast_pricing_update
    ~(websocket_state: Websocket_v2.websocket_server_state)
    ~(conditions: Pricing_oracle_keeper.market_conditions) : unit Lwt.t =

  (* Sample a few representative products for broadcast *)
  let sample_products = [
    (Depeg, Ethereum, USDC);
    (Depeg, Ethereum, USDT);
    (Bridge, Solana, USDC);
    (CEX_liquidation, Ethereum, USDT);
  ] in

  let* product_updates = Lwt_list.map_s (fun (coverage_type, chain, stablecoin) ->
    let* multiplier = get_product_multiplier_from_oracle
      ~coverage_type ~chain ~stablecoin
    in

    Lwt.return (`Assoc [
      ("coverage_type", `String (coverage_type_to_string coverage_type));
      ("chain", `String (blockchain_to_string chain));
      ("stablecoin", `String (asset_to_string stablecoin));
      ("multiplier", `Float (Float.of_int multiplier.total /. 10000.0));
      ("market_adjustment", `Float (Float.of_int multiplier.market_adj /. 100.0));
      ("volatility_premium", `Float (Float.of_int multiplier.volatility /. 100.0));
    ])
  ) sample_products in

  let broadcast_msg = `Assoc [
    ("channel", `String "pricing_updates");
    ("type", `String "multiplier_update");
    ("products", `List product_updates);
    ("volatility_index", `Float conditions.overall_volatility_index);
    ("timestamp", `Float conditions.timestamp);
  ] in

  Websocket_v2.broadcast_to_channel websocket_state "pricing_updates" broadcast_msg

(** ============================================
 * REGISTER ROUTES
 * ============================================ *)

let register_routes app =
  Dream.get "/api/v2/pricing/dynamic-quote" handle_dynamic_quote app;
  Dream.get "/api/v2/pricing/product-multiplier" handle_product_multiplier app;
  Dream.post "/api/v2/pricing/lock-price" handle_lock_price app;
  Dream.get "/api/v2/pricing/market-conditions" handle_market_conditions app;
  app
