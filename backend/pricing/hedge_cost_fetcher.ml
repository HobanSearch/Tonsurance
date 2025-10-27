(** Hedge Cost Fetcher
 *
 * Fetches real-time hedge costs from all 4 venues:
 * - Polymarket (depeg + bridge coverage)
 * - Hyperliquid (smart contract + oracle coverage)
 * - Binance Futures (CEX liquidation coverage)
 * - Allianz Parametric (all types, future)
 *
 * Integrates with hedge executors to get actual market costs
 * Updates pricing oracle with real hedge premiums
 *)

open Core
open Lwt.Syntax
open Types

(** Hedge cost breakdown by venue *)
type hedge_cost_breakdown = {
  polymarket_cost: float option; (* Cost for Polymarket hedge (30% allocation) *)
  hyperliquid_cost: float option; (* Cost for Hyperliquid hedge (30% allocation) *)
  binance_cost: float option; (* Cost for Binance Futures hedge (30% allocation) *)
  allianz_cost: float option; (* Cost for Allianz parametric (10% allocation) *)
  total_hedge_cost: float; (* Weighted sum of all venue costs *)
  hedge_ratio: float; (* What % of coverage is hedged (typically 20%) *)
  effective_premium_addition: float; (* What to add to base premium *)
  timestamp: float;
} [@@deriving sexp, yojson]

(** Venue allocation weights *)
let venue_weights = {
  polymarket = 0.30;
  hyperliquid = 0.30;
  binance = 0.30;
  allianz = 0.10;
}

(** Standard hedge ratio (20% of coverage externally hedged) *)
let default_hedge_ratio = 0.20

(** ============================================
 * POLYMARKET COST FETCHING
 * ============================================ *)

(** Fetch Polymarket hedge cost for depeg coverage *)
let fetch_polymarket_depeg_cost
    ~(stablecoin: asset)
    ~(coverage_amount: float)
  : float option Lwt.t =

  (* Use depeg_hedge_executor to get market odds *)
  let%lwt market_opt = Depeg_hedge_executor.find_best_depeg_market
    ~stablecoin
    ~required_liquidity:(coverage_amount *. venue_weights.polymarket *. default_hedge_ratio)
  in

  match market_opt with
  | Some market ->
      (* Cost = coverage_amount * venue_weight * hedge_ratio * market_odds *)
      let cost = coverage_amount *. venue_weights.polymarket *. default_hedge_ratio *. market.odds in
      Lwt.return (Some cost)
  | None ->
      (* No market found, can't hedge via Polymarket *)
      Lwt.return None

(** Fetch Polymarket hedge cost for bridge coverage *)
let fetch_polymarket_bridge_cost
    ~(source_chain: blockchain)
    ~(dest_chain: blockchain)
    ~(coverage_amount: float)
  : float option Lwt.t =

  (* Use bridge_hedge_executor to get market odds *)
  let bridge_info_opt = Bridge_hedge_executor.get_bridge_info
    ~source_chain
    ~dest_chain
  in

  match bridge_info_opt with
  | Some bridge_info ->
      let%lwt market_opt = Bridge_hedge_executor.find_best_bridge_market
        ~bridge_name:bridge_info.bridge_name
        ~required_liquidity:(coverage_amount *. venue_weights.polymarket *. default_hedge_ratio)
      in

      (match market_opt with
       | Some market ->
           let cost = coverage_amount *. venue_weights.polymarket *. default_hedge_ratio *. market.odds in
           Lwt.return (Some cost)
       | None -> Lwt.return None)
  | None ->
      Lwt.return None

(** ============================================
 * HYPERLIQUID COST FETCHING
 * ============================================ *)

(** Fetch Hyperliquid hedge cost for smart contract coverage *)
let fetch_hyperliquid_smart_contract_cost
    ~(chain: blockchain)
    ~(coverage_amount: float)
  : float option Lwt.t =

  (* Use protocol_short_executor to get funding rate + entry slippage *)
  let protocol_token_opt = Protocol_short_executor.get_protocol_token_for_chain chain in

  match protocol_token_opt with
  | Some protocol_token ->
      let%lwt market_data_opt = Protocol_short_executor.fetch_hyperliquid_market_data
        ~symbol:protocol_token
      in

      (match market_data_opt with
       | Some data ->
           (* Cost = funding rate * duration + entry slippage *)
           (* Simplified: funding_rate_daily * 30 days + 0.2% slippage *)
           let funding_cost = Float.abs data.funding_rate_daily *. 30.0 in
           let slippage_cost = 0.002 in (* 0.2% slippage *)
           let total_rate = funding_cost +. slippage_cost in
           let cost = coverage_amount *. venue_weights.hyperliquid *. default_hedge_ratio *. total_rate in
           Lwt.return (Some cost)
       | None -> Lwt.return None)
  | None ->
      Lwt.return None

(** Fetch Hyperliquid hedge cost for oracle coverage *)
let fetch_hyperliquid_oracle_cost
    ~(coverage_amount: float)
  : float option Lwt.t =

  (* Oracle coverage hedged by shorting LINK *)
  let%lwt market_data_opt = Protocol_short_executor.fetch_hyperliquid_market_data
    ~symbol:"LINK"
  in

  match market_data_opt with
  | Some data ->
      let funding_cost = Float.abs data.funding_rate_daily *. 30.0 in
      let slippage_cost = 0.002 in
      let total_rate = funding_cost +. slippage_cost in
      let cost = coverage_amount *. venue_weights.hyperliquid *. default_hedge_ratio *. total_rate in
      Lwt.return (Some cost)
  | None ->
      Lwt.return None

(** ============================================
 * BINANCE FUTURES COST FETCHING
 * ============================================ *)

(** Fetch Binance Futures hedge cost for CEX liquidation coverage *)
let fetch_binance_cex_liquidation_cost
    ~(coverage_amount: float)
  : float option Lwt.t =

  (* Use cex_liquidation_executor to get funding rate *)
  let%lwt risk_metrics_opt = Cex_liquidation_executor.fetch_binance_liquidation_risk
    ~symbol:"BTCUSDT"
  in

  match risk_metrics_opt with
  | Some metrics ->
      (* Cost = funding rate * duration + execution slippage *)
      let funding_cost = Float.abs metrics.funding_rate_hourly *. 24.0 *. 30.0 in (* 30 days *)
      let slippage_cost = 0.001 in (* 0.1% slippage on Binance *)
      let total_rate = funding_cost +. slippage_cost in
      let cost = coverage_amount *. venue_weights.binance *. default_hedge_ratio *. total_rate in
      Lwt.return (Some cost)
  | None ->
      Lwt.return None

(** ============================================
 * ALLIANZ COST FETCHING (FUTURE)
 * ============================================ *)

(** Fetch Allianz parametric insurance cost *)
let fetch_allianz_parametric_cost
    ~(coverage_type: coverage_type)
    ~(coverage_amount: float)
  : float option Lwt.t =

  (* TODO: Real Allianz API integration *)
  (* For now, use estimated rates based on coverage type *)
  let estimated_rate = match coverage_type with
    | Depeg -> 0.0045 (* 0.45% of coverage *)
    | Bridge -> 0.0065 (* 0.65% of coverage *)
    | Smart_contract -> 0.0085 (* 0.85% of coverage *)
    | Oracle -> 0.0075 (* 0.75% of coverage *)
    | CEX_liquidation -> 0.0055 (* 0.55% of coverage *)
  in

  let cost = coverage_amount *. venue_weights.allianz *. default_hedge_ratio *. estimated_rate in
  Lwt.return (Some cost)

(** ============================================
 * AGGREGATE HEDGE COST CALCULATION
 * ============================================ *)

(** Fetch total hedge cost for a product *)
let fetch_hedge_cost
    ~(coverage_type: coverage_type)
    ~(chain: blockchain)
    ~(stablecoin: asset)
    ~(coverage_amount: float)
  : hedge_cost_breakdown Lwt.t =

  (* Fetch costs from all applicable venues *)
  let%lwt polymarket_cost = match coverage_type with
    | Depeg ->
        fetch_polymarket_depeg_cost ~stablecoin ~coverage_amount
    | Bridge ->
        (* Bridge requires source/dest chains - simplified to TON <-> chain *)
        fetch_polymarket_bridge_cost ~source_chain:chain ~dest_chain:TON ~coverage_amount
    | _ ->
        Lwt.return None
  in

  let%lwt hyperliquid_cost = match coverage_type with
    | Smart_contract ->
        fetch_hyperliquid_smart_contract_cost ~chain ~coverage_amount
    | Oracle ->
        fetch_hyperliquid_oracle_cost ~coverage_amount
    | _ ->
        Lwt.return None
  in

  let%lwt binance_cost = match coverage_type with
    | CEX_liquidation ->
        fetch_binance_cex_liquidation_cost ~coverage_amount
    | _ ->
        Lwt.return None
  in

  let%lwt allianz_cost = fetch_allianz_parametric_cost ~coverage_type ~coverage_amount in

  (* Calculate total hedge cost (sum of all venue costs) *)
  let total_hedge_cost =
    (Option.value polymarket_cost ~default:0.0) +.
    (Option.value hyperliquid_cost ~default:0.0) +.
    (Option.value binance_cost ~default:0.0) +.
    (Option.value allianz_cost ~default:0.0)
  in

  (* Effective premium addition = total_hedge_cost / coverage_amount *)
  let effective_premium_addition = total_hedge_cost /. coverage_amount in

  Lwt.return {
    polymarket_cost;
    hyperliquid_cost;
    binance_cost;
    allianz_cost;
    total_hedge_cost;
    hedge_ratio = default_hedge_ratio;
    effective_premium_addition;
    timestamp = Unix.time ();
  }

(** ============================================
 * PREMIUM CALCULATION
 * ============================================ *)

(** Calculate total premium including hedge costs *)
let calculate_hedged_premium
    ~(coverage_type: coverage_type)
    ~(chain: blockchain)
    ~(stablecoin: asset)
    ~(coverage_amount: float)
    ~(duration_days: int)
    ~(base_apr: float) (* e.g., 0.008 for 0.8% APR *)
  : (float * hedge_cost_breakdown) Lwt.t =

  (* Base premium calculation *)
  let duration_fraction = Float.of_int duration_days /. 365.0 in
  let base_premium = coverage_amount *. base_apr *. duration_fraction in

  (* Fetch hedge costs *)
  let%lwt hedge_costs = fetch_hedge_cost
    ~coverage_type
    ~chain
    ~stablecoin
    ~coverage_amount
  in

  (* Total premium = base + hedge costs *)
  let total_premium = base_premium +. hedge_costs.total_hedge_cost in

  Lwt.return (total_premium, hedge_costs)

(** ============================================
 * BATCH COST FETCHING (For Oracle Updates)
 * ============================================ *)

(** Fetch hedge costs for all 560 products *)
let fetch_all_hedge_costs
    ~(reference_coverage_amount: float) (* Use standard amount for comparison *)
  : (string * hedge_cost_breakdown) list Lwt.t =

  let coverage_types = all_of_coverage_type in
  let chains = [Ethereum; Arbitrum; Base; Polygon; Bitcoin; Solana; TON; Lightning] in
  let stablecoins = [USDC; USDT; DAI; FRAX; BUSD; USDe; sUSDe; USDY; PYUSD; GHO; LUSD; crvUSD; mkUSD; USDP] in

  let%lwt () = Lwt_io.printf "Fetching hedge costs for 560 products (this may take 2-3 minutes)...\n" in

  let%lwt results = Lwt_list.map_p (fun coverage_type ->
    Lwt_list.map_p (fun chain ->
      Lwt_list.map_p (fun stablecoin ->
        let%lwt costs = fetch_hedge_cost
          ~coverage_type
          ~chain
          ~stablecoin
          ~coverage_amount:reference_coverage_amount
        in

        let product_id = Printf.sprintf "%s_%s_%s"
          (coverage_type_to_string coverage_type)
          (blockchain_to_string chain)
          (asset_to_string stablecoin)
        in

        Lwt.return (product_id, costs)
      ) stablecoins
    ) chains
  ) coverage_types in

  (* Flatten nested lists *)
  let flattened = List.concat (List.concat results) in

  let%lwt () = Lwt_io.printf "✅ Fetched %d hedge cost quotes\n" (List.length flattened) in

  Lwt.return flattened

(** ============================================
 * STATISTICS & REPORTING
 * ============================================ *)

(** Calculate hedge cost statistics *)
let calculate_hedge_cost_stats
    ~(all_costs: (string * hedge_cost_breakdown) list)
  : unit =

  Printf.printf "\n╔══════════════════════════════════════════════════════════╗\n";
  Printf.printf "║  HEDGE COST STATISTICS                                   ║\n";
  Printf.printf "╚══════════════════════════════════════════════════════════╝\n\n";

  (* Extract effective premium additions *)
  let additions = List.map all_costs ~f:(fun (_, costs) ->
    costs.effective_premium_addition
  ) in

  let min_addition = List.min_elt additions ~compare:Float.compare
    |> Option.value ~default:0.0
  in
  let max_addition = List.max_elt additions ~compare:Float.compare
    |> Option.value ~default:0.0
  in
  let avg_addition = List.fold additions ~init:0.0 ~f:(+.) /.
    Float.of_int (List.length additions)
  in

  Printf.printf "Effective Premium Addition (as %% of coverage):\n";
  Printf.printf "  Min:     %.4f%% (cheapest hedge)\n" (min_addition *. 100.0);
  Printf.printf "  Max:     %.4f%% (most expensive hedge)\n" (max_addition *. 100.0);
  Printf.printf "  Average: %.4f%%\n" (avg_addition *. 100.0);
  Printf.printf "\n";

  (* Venue breakdown *)
  let polymarket_available = List.count all_costs ~f:(fun (_, costs) ->
    Option.is_some costs.polymarket_cost
  ) in
  let hyperliquid_available = List.count all_costs ~f:(fun (_, costs) ->
    Option.is_some costs.hyperliquid_cost
  ) in
  let binance_available = List.count all_costs ~f:(fun (_, costs) ->
    Option.is_some costs.binance_cost
  ) in
  let allianz_available = List.count all_costs ~f:(fun (_, costs) ->
    Option.is_some costs.allianz_cost
  ) in

  Printf.printf "Venue Coverage (out of 560 products):\n";
  Printf.printf "  Polymarket:   %d products (%.1f%%)\n" polymarket_available
    (Float.of_int polymarket_available /. 560.0 *. 100.0);
  Printf.printf "  Hyperliquid:  %d products (%.1f%%)\n" hyperliquid_available
    (Float.of_int hyperliquid_available /. 560.0 *. 100.0);
  Printf.printf "  Binance:      %d products (%.1f%%)\n" binance_available
    (Float.of_int binance_available /. 560.0 *. 100.0);
  Printf.printf "  Allianz:      %d products (%.1f%%)\n" allianz_available
    (Float.of_int allianz_available /. 560.0 *. 100.0);
  Printf.printf "\n";

  (* Top 10 cheapest hedges *)
  Printf.printf "Top 10 Cheapest Hedges:\n";
  let sorted = List.sort all_costs ~compare:(fun (_, a) (_, b) ->
    Float.compare a.effective_premium_addition b.effective_premium_addition
  ) in
  List.take sorted 10
  |> List.iteri ~f:(fun i (product_id, costs) ->
      Printf.printf "  %2d. %s: %.4f%%\n"
        (i + 1) product_id (costs.effective_premium_addition *. 100.0)
    );
  Printf.printf "\n";

  (* Top 10 most expensive hedges *)
  Printf.printf "Top 10 Most Expensive Hedges:\n";
  let reversed = List.rev sorted in
  List.take reversed 10
  |> List.iteri ~f:(fun i (product_id, costs) ->
      Printf.printf "  %2d. %s: %.4f%%\n"
        (i + 1) product_id (costs.effective_premium_addition *. 100.0)
    );
  Printf.printf "\n"

(** ============================================
 * EXAMPLE SCENARIOS
 * ============================================ *)

(** Example: Fetch hedge cost for USDC depeg coverage *)
let example_usdc_depeg_hedge_cost () : unit Lwt.t =
  Printf.printf "\n📊 EXAMPLE: USDC Depeg Hedge Cost\n";
  Printf.printf "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  let coverage_amount = 100_000.0 in
  let duration_days = 30 in
  let base_apr = 0.008 in

  let%lwt (total_premium, hedge_costs) = calculate_hedged_premium
    ~coverage_type:Depeg
    ~chain:Ethereum
    ~stablecoin:USDC
    ~coverage_amount
    ~duration_days
    ~base_apr
  in

  let base_premium = coverage_amount *. base_apr *. (Float.of_int duration_days /. 365.0) in

  Printf.printf "Coverage Details:\n";
  Printf.printf "  Amount:       $%,.2f\n" coverage_amount;
  Printf.printf "  Duration:     %d days\n" duration_days;
  Printf.printf "  Base APR:     %.2f%%\n" (base_apr *. 100.0);
  Printf.printf "\n";

  Printf.printf "Premium Breakdown:\n";
  Printf.printf "  Base Premium: $%.2f\n" base_premium;
  Printf.printf "\n";

  Printf.printf "Hedge Costs (20%% hedge ratio):\n";
  (match hedge_costs.polymarket_cost with
   | Some cost -> Printf.printf "  Polymarket:   $%.2f (30%% allocation)\n" cost
   | None -> Printf.printf "  Polymarket:   N/A\n");
  (match hedge_costs.hyperliquid_cost with
   | Some cost -> Printf.printf "  Hyperliquid:  $%.2f (30%% allocation)\n" cost
   | None -> Printf.printf "  Hyperliquid:  N/A\n");
  (match hedge_costs.binance_cost with
   | Some cost -> Printf.printf "  Binance:      $%.2f (30%% allocation)\n" cost
   | None -> Printf.printf "  Binance:      N/A\n");
  (match hedge_costs.allianz_cost with
   | Some cost -> Printf.printf "  Allianz:      $%.2f (10%% allocation)\n" cost
   | None -> Printf.printf "  Allianz:      N/A\n");
  Printf.printf "  ────────────────────────\n";
  Printf.printf "  Total Hedge:  $%.2f\n" hedge_costs.total_hedge_cost;
  Printf.printf "\n";

  Printf.printf "Total Premium: $%.2f (%.2fx of unhedged)\n"
    total_premium (total_premium /. base_premium);
  Printf.printf "Effective Rate: %.4f%% (base + hedges)\n"
    (total_premium /. coverage_amount *. 100.0);
  Printf.printf "\n";

  Lwt.return ()
