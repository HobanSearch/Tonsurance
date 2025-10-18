(** Risk Score Calculator
 *
 * Calculates real-time risk multipliers for all 560 insurance products:
 * - 5 coverage types (Depeg, Smart_contract, Oracle, Bridge, CEX_liquidation)
 * - 8 chains (Ethereum, Arbitrum, Base, Polygon, Optimism, Solana, TON, Bitcoin)
 * - 14 stablecoins (USDC, USDT, DAI, FRAX, BUSD, USDe, sUSDe, USDY, PYUSD, GHO, LUSD, crvUSD, mkUSD, USDP)
 *
 * Risk Formula:
 * risk_multiplier = base_rate × price_depeg_factor × bridge_health_factor ×
 *                   chain_congestion_factor × exploit_frequency_factor × liquidation_stress_factor
 *
 * Update frequency: Real-time (every 30 seconds)
 *)

open Core
open Lwt.Syntax
open Types

module RiskScoreCalculator = struct
  (** Product key for identifying unique insurance products *)
  type product_key = {
    coverage_type: coverage_type;
    chain: blockchain;
    stablecoin: asset;
  } [@@deriving sexp, yojson, compare, equal, hash]

  (** Risk multiplier breakdown *)
  type risk_multiplier_breakdown = {
    product_key: product_key;
    final_multiplier: float;
    base_rate: float;
    price_depeg_factor: float;
    bridge_health_factor: float;
    chain_congestion_factor: float;
    exploit_frequency_factor: float;
    liquidation_stress_factor: float;
    risk_tier: risk_tier;
    timestamp: float;
  } [@@deriving sexp, yojson]

  and risk_tier =
    | Normal       (* 1.0x - 1.2x *)
    | Elevated     (* 1.2x - 1.5x *)
    | High         (* 1.5x - 2.0x *)
    | Extreme      (* >2.0x - circuit breaker *)
  [@@deriving sexp, yojson]

  (** Base rates by coverage type (annual rate) *)
  let get_base_rate (coverage: coverage_type) : float =
    match coverage with
    | Depeg -> 0.008              (* 0.8% APR for stablecoin depeg *)
    | Smart_contract -> 0.012     (* 1.2% APR for smart contract exploits *)
    | Oracle -> 0.010             (* 1.0% APR for oracle manipulation *)
    | Bridge -> 0.015             (* 1.5% APR for bridge exploits *)
    | CEX_liquidation -> 0.020    (* 2.0% APR for CEX liquidation protection *)

  (** Calculate price depeg factor (1.0x - 1.5x) *)
  let calculate_depeg_factor (price: float) : float =
    let deviation = Float.abs (1.0 -. price) in

    if Float.O.(deviation < 0.01) then 1.0       (* <1% depeg = normal *)
    else if Float.O.(deviation < 0.02) then 1.1  (* 1-2% depeg = slight risk *)
    else if Float.O.(deviation < 0.05) then 1.3  (* 2-5% depeg = elevated risk *)
    else 1.5                           (* >5% depeg = high risk *)

  (** Calculate bridge health factor (1.0x - 2.0x) *)
  let calculate_bridge_factor (health: float) : float =
    if Float.O.(health > 0.90) then 1.0       (* Excellent health *)
    else if Float.O.(health > 0.75) then 1.1  (* Good health *)
    else if Float.O.(health > 0.60) then 1.3  (* Moderate health *)
    else if Float.O.(health > 0.40) then 1.6  (* Poor health *)
    else 2.0                        (* Critical health *)

  (** Calculate chain congestion factor (1.0x - 1.3x) *)
  let calculate_congestion_factor (congestion: float) : float =
    if Float.O.(congestion < 0.3) then 1.0      (* Low congestion *)
    else if Float.O.(congestion < 0.5) then 1.05 (* Moderate *)
    else if Float.O.(congestion < 0.7) then 1.15 (* High *)
    else 1.30                          (* Extreme *)

  (** Calculate exploit frequency factor (1.0x - 1.2x) *)
  let calculate_exploit_factor
      ~(coverage_type: coverage_type)
      ~(chain: blockchain)
      ~(exploit_db: (string * float) list) (* protocol_type -> risk_multiplier *)
    : float =

    let protocol_type = match coverage_type with
      | Depeg -> "stablecoin"
      | Smart_contract -> "defi"
      | Oracle -> "oracle"
      | Bridge -> "bridge"
      | CEX_liquidation -> "cex"
    in

    let chain_name = blockchain_to_string chain in
    let key = protocol_type ^ "_" ^ chain_name in

    match List.Assoc.find exploit_db key ~equal:String.equal with
    | Some multiplier -> multiplier
    | None ->
        (* Default exploit multipliers by protocol type *)
        (match coverage_type with
         | Bridge -> 1.20          (* Bridges are highest risk *)
         | CEX_liquidation -> 1.15
         | Smart_contract -> 1.10
         | Oracle -> 1.08
         | Depeg -> 1.05)

  (** Calculate liquidation stress factor (1.0x - 1.5x) *)
  let calculate_liquidation_factor (stress_level: market_stress_level) : float =
    match stress_level with
    | Normal -> 1.0
    | Elevated -> 1.15
    | High -> 1.30
    | Extreme -> 1.50

  (** Determine risk tier *)
  let classify_risk_tier (multiplier: float) : risk_tier =
    if Float.O.(multiplier < 1.2) then Normal
    else if Float.O.(multiplier < 1.5) then Elevated
    else if Float.O.(multiplier < 2.0) then High
    else Extreme

  (** Calculate risk multiplier for a single product *)
  let calculate_product_risk_multiplier
      ~(coverage_type: coverage_type)
      ~(chain: blockchain)
      ~(stablecoin: asset)
      ~(market_data: unit) (* TODO: fix circular dependency with MarketDataAggregator *)
      ~(exploit_db: (string * float) list)
    : risk_multiplier_breakdown Lwt.t =

    let%lwt () = Logs_lwt.debug (fun m ->
      m "Calculating risk for: %s on %s for %s"
        (coverage_type_to_string coverage_type)
        (blockchain_to_string chain)
        (asset_to_string stablecoin)
    ) in

    (* Get base rate *)
    let base_rate = get_base_rate coverage_type in

    (* Get stablecoin price *)
    let _stablecoin_id = asset_to_string stablecoin in
    (* TODO: Fix circular dependency with MarketDataAggregator *)
    (* let price_opt = List.Assoc.find market_data.stablecoin_prices stablecoin_id
      ~equal:String.equal
      |> Option.map ~f:(fun (_, price, _) -> price)
    in *)
    let current_price = 1.0 in (* Default until circular dependency resolved *)
    let price_depeg_factor = calculate_depeg_factor current_price in

    (* Get bridge health (average across all bridges for this chain) *)
    let _chain_name = blockchain_to_string chain in
    (* TODO: Fix circular dependency - market_data is unit *)
    let bridge_healths = [] in
    (* List.filter_map market_data.bridge_health ~f:(fun (bridge_id, health, _) ->
      if String.is_substring bridge_id ~substring:chain_name then Some health
      else None
    ) *)
    let avg_bridge_health =
      if List.is_empty bridge_healths then 0.85 (* Default *)
      else Math.mean bridge_healths
    in
    let bridge_health_factor = calculate_bridge_factor avg_bridge_health in

    (* Get chain congestion *)
    (* TODO: Fix circular dependency - market_data is unit *)
    let congestion_opt = None in
    (* List.Assoc.find market_data.chain_metrics chain_name
      ~equal:String.equal
      |> Option.map ~f:(fun congestion -> congestion.congestion_score) *)
    let congestion = Option.value congestion_opt ~default:0.3 in
    let chain_congestion_factor = calculate_congestion_factor congestion in

    (* Get exploit frequency factor *)
    let exploit_frequency_factor = calculate_exploit_factor
      ~coverage_type
      ~chain
      ~exploit_db
    in

    (* Get liquidation stress factor *)
    (* TODO: Fix circular dependency - market_data is unit *)
    let stress_level : market_stress_level = Normal in (* Default stress level *)
    let liquidation_stress_factor =
      calculate_liquidation_factor stress_level
    in

    (* Calculate final multiplier *)
    let final_multiplier =
      base_rate *.
      price_depeg_factor *.
      bridge_health_factor *.
      chain_congestion_factor *.
      exploit_frequency_factor *.
      liquidation_stress_factor
    in

    let risk_tier = classify_risk_tier final_multiplier in

    Lwt.return {
      product_key = { coverage_type; chain; stablecoin };
      final_multiplier;
      base_rate;
      price_depeg_factor;
      bridge_health_factor;
      chain_congestion_factor;
      exploit_frequency_factor;
      liquidation_stress_factor;
      risk_tier;
      timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    }

  (** Calculate risk multipliers for all 560 products *)
  let calculate_all_560_products
      ~(market_data: unit) (* TODO: fix circular dependency with MarketDataAggregator *)
      ~(exploit_db: (string * float) list)
    : risk_multiplier_breakdown list Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "Calculating risk multipliers for all 560 products..."
    ) in

    (* Generate all product combinations *)
    let coverage_types = [Depeg; Smart_contract; Oracle; Bridge; CEX_liquidation] in
    let chains = [Ethereum; Arbitrum; Base; Polygon; Optimism; Solana; TON; Bitcoin] in
    let stablecoins = [USDC; USDT; DAI; FRAX; BUSD; USDe; SUSDe; USDY; PYUSD; GHO; LUSD; CrvUSD; MkUSD; USDP] in

    let all_products = List.concat_map coverage_types ~f:(fun coverage_type ->
      List.concat_map chains ~f:(fun chain ->
        List.map stablecoins ~f:(fun stablecoin ->
          (coverage_type, chain, stablecoin)
        )
      )
    ) in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Total products to calculate: %d" (List.length all_products)
    ) in

    (* Calculate risk for each product (batched for performance) *)
    let batch_size = 100 in
    let batches = List.chunks_of all_products ~length:batch_size in

    let rec process_batches batches acc =
      match batches with
      | [] -> Lwt.return (List.concat (List.rev acc))
      | batch :: rest ->
          let%lwt results = Lwt_list.map_p (fun (coverage_type, chain, stablecoin) ->
            calculate_product_risk_multiplier
              ~coverage_type
              ~chain
              ~stablecoin
              ~market_data
              ~exploit_db
          ) batch in

          process_batches rest (results :: acc)
    in

    let%lwt results = process_batches batches [] in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Calculated %d risk multipliers" (List.length results)
    ) in

    Lwt.return results

  (** Get risk multiplier for a specific product *)
  let get_product_risk_multiplier
      ~(coverage_type: coverage_type)
      ~(chain: blockchain)
      ~(stablecoin: asset)
      ~(all_multipliers: risk_multiplier_breakdown list)
    : risk_multiplier_breakdown option =

    let key = { coverage_type; chain; stablecoin } in
    List.find all_multipliers ~f:(fun breakdown ->
      equal_product_key breakdown.product_key key
    )

  (** Risk summary statistics *)
  type risk_summary = {
    total_products: int;
    avg_multiplier: float;
    min_multiplier: float;
    max_multiplier: float;
    std_dev_multiplier: float;
    normal_tier_count: int;
    elevated_tier_count: int;
    high_tier_count: int;
    extreme_tier_count: int;
    timestamp: float;
  } [@@deriving sexp, yojson]

  (** Calculate risk multiplier summary statistics *)
  let calculate_risk_summary
      (multipliers: risk_multiplier_breakdown list)
    : risk_summary =

    let all_multipliers = List.map multipliers ~f:(fun m -> m.final_multiplier) in

    let by_tier = List.fold multipliers ~init:(0, 0, 0, 0) ~f:(fun (normal, elevated, high, extreme) m ->
      match m.risk_tier with
      | Normal -> (normal + 1, elevated, high, extreme)
      | Elevated -> (normal, elevated + 1, high, extreme)
      | High -> (normal, elevated, high + 1, extreme)
      | Extreme -> (normal, elevated, high, extreme + 1)
    ) in

    let (normal_count, elevated_count, high_count, extreme_count) = by_tier in

    {
      total_products = List.length multipliers;
      avg_multiplier = Math.mean all_multipliers;
      min_multiplier = List.fold all_multipliers ~init:Float.infinity ~f:Float.min;
      max_multiplier = List.fold all_multipliers ~init:Float.neg_infinity ~f:Float.max;
      std_dev_multiplier = Math.std_dev all_multipliers;
      normal_tier_count = normal_count;
      elevated_tier_count = elevated_count;
      high_tier_count = high_count;
      extreme_tier_count = extreme_count;
      timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    }

  (** Get top N riskiest products *)
  let get_top_risky_products
      ~(multipliers: risk_multiplier_breakdown list)
      ~(count: int)
    : risk_multiplier_breakdown list =

    List.sort multipliers ~compare:(fun a b ->
      Float.compare b.final_multiplier a.final_multiplier
    )
    |> List.take
    |> (fun f -> f count)

  (** Get products by risk tier *)
  let get_products_by_tier
      ~(multipliers: risk_multiplier_breakdown list)
      ~(tier: risk_tier)
    : risk_multiplier_breakdown list =

    List.filter multipliers ~f:(fun m ->
      Poly.equal m.risk_tier tier
    )

  (** Export risk multipliers to JSON for frontend *)
  let export_to_json
      (multipliers: risk_multiplier_breakdown list)
    : string =

    Yojson.Safe.to_string (`List (List.map multipliers ~f:(fun m ->
      risk_multiplier_breakdown_to_yojson m
    )))

  (** Persist risk multipliers to database *)
  let persist_risk_multipliers
      ~(conn_string: string)
      ~(multipliers: risk_multiplier_breakdown list)
    : unit Lwt.t =

    try%lwt
      let%lwt () = Logs_lwt.info (fun m ->
        m "Persisting %d risk multipliers to database" (List.length multipliers)
      ) in

      (* In production: Batch insert to risk_multipliers table *)
      (*
      CREATE TABLE risk_multipliers (
        time TIMESTAMPTZ NOT NULL,
        coverage_type TEXT NOT NULL,
        chain TEXT NOT NULL,
        stablecoin TEXT NOT NULL,
        final_multiplier NUMERIC(10,4) NOT NULL,
        base_rate NUMERIC(10,6) NOT NULL,
        price_depeg_factor NUMERIC(5,2) NOT NULL,
        bridge_health_factor NUMERIC(5,2) NOT NULL,
        chain_congestion_factor NUMERIC(5,2) NOT NULL,
        exploit_frequency_factor NUMERIC(5,2) NOT NULL,
        liquidation_stress_factor NUMERIC(5,2) NOT NULL,
        risk_tier TEXT NOT NULL,
        PRIMARY KEY (time, coverage_type, chain, stablecoin)
      );

      SELECT create_hypertable('risk_multipliers', 'time');
      *)

      Lwt.return ()
    with exn ->
      let%lwt () = Logs_lwt.err (fun m ->
        m "Error persisting risk multipliers: %s" (Exn.to_string exn)
      ) in
      Lwt.return ()

  (** Continuous risk calculation monitor *)
  let start_risk_calculator_monitor
      ~(market_data_source: unit -> unit Lwt.t)  (* TODO: Fix circular dependency *)
      ~(exploit_db: (string * float) list)
      ~(update_interval_seconds: float)
      ~(on_update: risk_multiplier_breakdown list -> unit Lwt.t)
      ~(conn_string: string)
    : unit Lwt.t =

    let rec monitor_loop () =
      let%lwt () = Logs_lwt.info (fun m ->
        m "Calculating risk multipliers for all products..."
      ) in

      let%lwt market_data = market_data_source () in

      let%lwt multipliers = calculate_all_560_products ~market_data ~exploit_db in

      let summary = calculate_risk_summary multipliers in

      let%lwt () = Logs_lwt.info (fun m ->
        m "Risk calculation complete: avg=%.2fx, min=%.2fx, max=%.2fx, extreme=%d products"
          summary.avg_multiplier
          summary.min_multiplier
          summary.max_multiplier
          summary.extreme_tier_count
      ) in

      (* Persist to database *)
      let%lwt () = persist_risk_multipliers ~conn_string ~multipliers in

      (* Call update callback *)
      let%lwt () = on_update multipliers in

      (* Alert if extreme risk products found *)
      let%lwt () =
        if summary.extreme_tier_count > 0 then
          let extreme_products = get_products_by_tier ~multipliers ~tier:Extreme in
          Logs_lwt.warn (fun m ->
            m "ALERT: %d products in EXTREME risk tier (>2.0x multiplier)" summary.extreme_tier_count
          )
        else
          Lwt.return ()
      in

      (* Wait for next update *)
      let%lwt () = Lwt_unix.sleep update_interval_seconds in

      monitor_loop ()
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Starting risk calculator monitor (interval: %.0fs)" update_interval_seconds
    ) in

    monitor_loop ()

  (** Circuit breaker check - halt new policy sales if too many extreme risk products *)
  let check_circuit_breaker
      (multipliers: risk_multiplier_breakdown list)
      ~(threshold_pct: float)
    : [ `Normal | `CircuitBreaker of string ] =

    let summary = calculate_risk_summary multipliers in

    let extreme_pct = Float.of_int summary.extreme_tier_count /.
                      Float.of_int summary.total_products in

    if Float.O.(extreme_pct > threshold_pct) then
      `CircuitBreaker (Printf.sprintf
        "Circuit breaker triggered: %.1f%% of products in extreme risk tier (threshold: %.1f%%)"
        (extreme_pct *. 100.0)
        (threshold_pct *. 100.0))
    else
      `Normal

end
