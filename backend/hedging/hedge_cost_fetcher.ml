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

(** Venue allocation weights type *)
type venue_weights = {
  polymarket: float;
  hyperliquid: float;
  binance: float;
  allianz: float;
}

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

  let open Depeg_hedge_executor.DepegHedgeExecutor in

  try%lwt
    let%lwt () = Logs_lwt.debug (fun m ->
      m "[HedgeCost] Fetching Polymarket depeg cost for %s" (asset_to_string stablecoin)
    ) in

    (* Find relevant Polymarket markets for this stablecoin *)
    let%lwt markets = find_depeg_markets ~asset:stablecoin in

    match markets with
    | [] ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "[HedgeCost] No Polymarket depeg markets found for %s" (asset_to_string stablecoin)
        ) in
        Lwt.return None

    | markets ->
        (* Calculate hedge cost based on market odds *)
        (* Use the best (cheapest) market available *)
        let best_market = List.fold markets ~init:None ~f:(fun acc market ->
          match acc with
          | None -> Some market
          | Some best ->
              (* Lower yes_price = cheaper hedge *)
              if Float.(market.yes_price < best.yes_price) then Some market else Some best
        ) in

        (match best_market with
        | None -> Lwt.return None
        | Some market ->
            (* Calculate cost:
             * - Polymarket odds (yes_price) represent probability of depeg
             * - Cost = coverage_amount * hedge_ratio * polymarket_weight * yes_price
             * - hedge_ratio = 0.20 (20% externally hedged)
             * - polymarket_weight = 0.30 (30% allocated to Polymarket) *)
            let hedge_ratio = default_hedge_ratio in
            let polymarket_weight = venue_weights.polymarket in
            let hedged_amount = coverage_amount *. hedge_ratio *. polymarket_weight in
            let cost = hedged_amount *. market.yes_price in

            let%lwt () = Logs_lwt.info (fun m ->
              m "[HedgeCost] Polymarket depeg: %s at %.4f odds, cost: $%.2f for $%.2f coverage"
                (asset_to_string stablecoin) market.yes_price cost coverage_amount
            ) in

            Lwt.return (Some cost)
        )

  with exn ->
    let%lwt () = Logs_lwt.err (fun m ->
      m "[HedgeCost] Exception fetching Polymarket depeg cost: %s" (Exn.to_string exn)
    ) in
    Lwt.return None

(** Fetch Polymarket hedge cost for bridge coverage *)
let fetch_polymarket_bridge_cost
    ~(source_chain: blockchain)
    ~(dest_chain: blockchain)
    ~(coverage_amount: float)
  : float option Lwt.t =

  let open Bridge_hedge_executor.BridgeHedgeExecutor in

  try%lwt
    let%lwt () = Logs_lwt.debug (fun m ->
      m "[HedgeCost] Fetching Polymarket bridge cost for %s → %s"
        (blockchain_to_string source_chain) (blockchain_to_string dest_chain)
    ) in

    (* Determine which bridge is being used based on chains *)
    let bridge_info = {
      bridge_name = (match (source_chain, dest_chain) with
        | (TON, _) | (_, TON) -> "TON Bridge"
        | (Ethereum, Arbitrum) | (Arbitrum, Ethereum) -> "Arbitrum Official Bridge"
        | (Ethereum, Polygon) | (Polygon, Ethereum) -> "Polygon PoS Bridge"
        | _ -> "Wormhole" (* Default to Wormhole for other chains *)
      );
      bridge_type = `Token;
      source_chain;
      dest_chain;
      tvl_usd = 0.0; (* Not needed for cost calculation *)
      security_score = 0.85; (* Estimated score *)
      hack_history = 0;
      last_audit_date = 0.0;
      governance = `Multisig;
    } in

    (* Find relevant Polymarket markets for this bridge *)
    let%lwt markets = find_bridge_markets ~bridge:bridge_info in

    match markets with
    | [] ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "[HedgeCost] No Polymarket bridge markets found for %s" bridge_info.bridge_name
        ) in
        Lwt.return None

    | markets ->
        (* Calculate hedge cost based on market odds *)
        (* Use the best (cheapest) market available *)
        let best_market = List.fold markets ~init:None ~f:(fun acc market ->
          match acc with
          | None -> Some market
          | Some best ->
              (* Lower yes_price = cheaper hedge *)
              if Float.(market.yes_price < best.yes_price) then Some market else Some best
        ) in

        (match best_market with
        | None -> Lwt.return None
        | Some market ->
            (* Calculate cost:
             * - Polymarket odds (yes_price) represent probability of bridge hack
             * - Cost = coverage_amount * hedge_ratio * polymarket_weight * yes_price
             * - hedge_ratio = 0.20 (20% externally hedged)
             * - polymarket_weight = 0.30 (30% allocated to Polymarket) *)
            let hedge_ratio = default_hedge_ratio in
            let polymarket_weight = venue_weights.polymarket in
            let hedged_amount = coverage_amount *. hedge_ratio *. polymarket_weight in
            let cost = hedged_amount *. market.yes_price in

            let%lwt () = Logs_lwt.info (fun m ->
              m "[HedgeCost] Polymarket bridge: %s at %.4f odds, cost: $%.2f for $%.2f coverage"
                bridge_info.bridge_name market.yes_price cost coverage_amount
            ) in

            Lwt.return (Some cost)
        )

  with exn ->
    let%lwt () = Logs_lwt.err (fun m ->
      m "[HedgeCost] Exception fetching Polymarket bridge cost: %s" (Exn.to_string exn)
    ) in
    Lwt.return None

(** ============================================
 * HYPERLIQUID COST FETCHING
 * ============================================ *)

(** Fetch Hyperliquid hedge cost for smart contract coverage *)
let fetch_hyperliquid_smart_contract_cost
    ~(chain: blockchain)
    ~(coverage_amount: float)
  : float option Lwt.t =

  let open Protocol_short_executor.ProtocolShortExecutor in

  try%lwt
    let%lwt () = Logs_lwt.debug (fun m ->
      m "[HedgeCost] Fetching Hyperliquid smart contract cost for %s" (blockchain_to_string chain)
    ) in

    (* Get protocol token for this chain *)
    let token_opt = get_protocol_token
      ~coverage_type:Smart_contract
      ~chain
      ~asset:USDC (* Asset not relevant for smart contract coverage *)
    in

    match token_opt with
    | None ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "[HedgeCost] No protocol token found for %s smart contract coverage" (blockchain_to_string chain)
        ) in
        Lwt.return None

    | Some token ->
        (* Fetch market data from Hyperliquid *)
        let%lwt market_opt = fetch_hyperliquid_market ~token_symbol:token.token_symbol in

        (match market_opt with
        | None ->
            let%lwt () = Logs_lwt.warn (fun m ->
              m "[HedgeCost] No Hyperliquid market found for %s" token.token_symbol
            ) in
            Lwt.return None

        | Some market ->
            (* Calculate hedge cost:
             * - Funding rate cost per hour * duration (assume 30 days)
             * - Entry slippage (estimate 0.1% for limit orders)
             * - Total cost = (funding_rate * hours * hedged_amount) + (slippage * hedged_amount) *)
            let hedge_ratio = default_hedge_ratio in
            let hyperliquid_weight = venue_weights.hyperliquid in
            let hedged_amount = coverage_amount *. hedge_ratio *. hyperliquid_weight in

            let duration_hours = 30.0 *. 24.0 in (* 30 days *)
            let funding_cost = market.funding_rate_hourly *. duration_hours *. hedged_amount in
            let slippage_cost = 0.001 *. hedged_amount in (* 0.1% slippage *)
            let total_cost = funding_cost +. slippage_cost in

            let%lwt () = Logs_lwt.info (fun m ->
              m "[HedgeCost] Hyperliquid smart contract: %s funding %.4f%%/hr, cost: $%.2f for $%.2f coverage"
                token.token_symbol (market.funding_rate_hourly *. 100.0) total_cost coverage_amount
            ) in

            Lwt.return (Some total_cost)
        )

  with exn ->
    let%lwt () = Logs_lwt.err (fun m ->
      m "[HedgeCost] Exception fetching Hyperliquid smart contract cost: %s" (Exn.to_string exn)
    ) in
    Lwt.return None

(** Fetch Hyperliquid hedge cost for oracle coverage *)
let fetch_hyperliquid_oracle_cost
    ~(coverage_amount: float)
  : float option Lwt.t =

  let open Protocol_short_executor.ProtocolShortExecutor in

  try%lwt
    let%lwt () = Logs_lwt.debug (fun m ->
      m "[HedgeCost] Fetching Hyperliquid oracle cost (LINK short)"
    ) in

    (* Oracle coverage is hedged by shorting LINK *)
    let%lwt market_opt = fetch_hyperliquid_market ~token_symbol:"LINK" in

    match market_opt with
    | None ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "[HedgeCost] No Hyperliquid market found for LINK"
        ) in
        Lwt.return None

    | Some market ->
        (* Calculate hedge cost:
         * - Funding rate cost per hour * duration (assume 30 days)
         * - Entry slippage (estimate 0.1% for limit orders)
         * - Total cost = (funding_rate * hours * hedged_amount) + (slippage * hedged_amount) *)
        let hedge_ratio = default_hedge_ratio in
        let hyperliquid_weight = venue_weights.hyperliquid in
        let hedged_amount = coverage_amount *. hedge_ratio *. hyperliquid_weight in

        let duration_hours = 30.0 *. 24.0 in (* 30 days *)
        let funding_cost = market.funding_rate_hourly *. duration_hours *. hedged_amount in
        let slippage_cost = 0.001 *. hedged_amount in (* 0.1% slippage *)
        let total_cost = funding_cost +. slippage_cost in

        let%lwt () = Logs_lwt.info (fun m ->
          m "[HedgeCost] Hyperliquid oracle: LINK funding %.4f%%/hr, cost: $%.2f for $%.2f coverage"
            (market.funding_rate_hourly *. 100.0) total_cost coverage_amount
        ) in

        Lwt.return (Some total_cost)

  with exn ->
    let%lwt () = Logs_lwt.err (fun m ->
      m "[HedgeCost] Exception fetching Hyperliquid oracle cost: %s" (Exn.to_string exn)
    ) in
    Lwt.return None

(** ============================================
 * BINANCE FUTURES COST FETCHING
 * ============================================ *)

(** Fetch Binance Futures hedge cost for CEX liquidation coverage *)
let fetch_binance_cex_liquidation_cost
    ~(coverage_amount: float)
  : float option Lwt.t =

  let open Cex_liquidation_executor.CexLiquidationExecutor in

  try%lwt
    let%lwt () = Logs_lwt.debug (fun m ->
      m "[HedgeCost] Fetching Binance CEX liquidation cost"
    ) in

    (* Fetch liquidation risk metrics for BTC (primary CEX cascade indicator) *)
    let%lwt btc_metrics = fetch_binance_liquidation_risk ~symbol:"BTCUSDT" in

    (* Calculate hedge cost:
     * - Funding rate cost per hour * duration (assume 30 days)
     * - Entry slippage (estimate 0.05% for major pairs)
     * - Total cost = (funding_rate * hours * hedged_amount) + (slippage * hedged_amount) *)
    let hedge_ratio = default_hedge_ratio in
    let binance_weight = venue_weights.binance in
    let hedged_amount = coverage_amount *. hedge_ratio *. binance_weight in

    let duration_hours = 30.0 *. 24.0 in (* 30 days *)
    let funding_cost = btc_metrics.funding_rate_hourly *. duration_hours *. hedged_amount in
    let slippage_cost = 0.0005 *. hedged_amount in (* 0.05% slippage *)
    let total_cost = funding_cost +. slippage_cost in

    let%lwt () = Logs_lwt.info (fun m ->
      m "[HedgeCost] Binance CEX liquidation: BTCUSDT funding %.4f%%/hr, risk %.2f, cost: $%.2f for $%.2f coverage"
        (btc_metrics.funding_rate_hourly *. 100.0) btc_metrics.risk_score total_cost coverage_amount
    ) in

    Lwt.return (Some total_cost)

  with exn ->
    let%lwt () = Logs_lwt.err (fun m ->
      m "[HedgeCost] Exception fetching Binance CEX liquidation cost: %s" (Exn.to_string exn)
    ) in
    Lwt.return None

(** ============================================
 * ALLIANZ COST FETCHING (FUTURE)
 * ============================================ *)

(** Fetch Allianz parametric insurance cost *)
let fetch_allianz_parametric_cost
    ~(coverage_type: coverage_type)
    ~(coverage_amount: float)
  : float option Lwt.t =

  try%lwt
    let%lwt () = Logs_lwt.debug (fun m ->
      m "[HedgeCost] Fetching Allianz parametric cost for %s" (coverage_type_to_string coverage_type)
    ) in

    (* Get Allianz config from environment *)
    let api_key = Option.value (Sys.getenv "ALLIANZ_API_KEY") ~default:"demo_key" in
    let api_secret = Option.value (Sys.getenv "ALLIANZ_API_SECRET") ~default:"demo_secret" in
    let partner_id = Option.value (Sys.getenv "ALLIANZ_PARTNER_ID") ~default:"TONSURANCE" in
    let endpoint = Option.value (Sys.getenv "ALLIANZ_ENDPOINT")
      ~default:"https://api.allianz.com/parametric/v1" in
    let testnet = Option.value_map (Sys.getenv "ALLIANZ_TESTNET")
      ~default:false ~f:(fun v -> String.(v = "true" || v = "1")) in

    let allianz_config = Allianz_parametric_client.{
      api_key;
      api_secret;
      partner_id;
      endpoint;
      testnet;
      timeout_seconds = 10.0;
    } in

    (* Calculate hedged amount (Allianz covers 10% of 20% hedge ratio) *)
    let hedge_ratio = default_hedge_ratio in
    let allianz_weight = venue_weights.allianz in
    let hedged_amount = coverage_amount *. hedge_ratio *. allianz_weight in

    (* Request quote from Allianz API *)
    let%lwt quote_result = Allianz_parametric_client.AllianzClient.request_quote
      ~_config:allianz_config
      ~coverage_type
      ~coverage_amount_usd:hedged_amount
      ~duration_days:30
    in

    match quote_result with
    | Ok quote ->
        let%lwt () = Logs_lwt.info (fun m ->
          m "[HedgeCost] Allianz parametric: %s rate %.4f%%, cost: $%.2f for $%.2f coverage (quote: %s)"
            (coverage_type_to_string coverage_type)
            (quote.premium_rate *. 100.0)
            quote.premium_usd
            coverage_amount
            quote.quote_id
        ) in

        Lwt.return (Some quote.premium_usd)

    | Error err ->
        let error_msg = match err with
          | API_error (code, msg) -> Printf.sprintf "API %d: %s" code msg
          | Authentication_error msg -> Printf.sprintf "Auth: %s" msg
          | Invalid_coverage_type -> "Invalid coverage type"
          | Insufficient_capacity -> "Insufficient capacity"
          | Quote_expired -> "Quote expired"
          | Policy_not_found -> "Policy not found"
          | Claim_already_filed -> "Claim already filed"
          | Network_error msg -> Printf.sprintf "Network: %s" msg
          | Parse_error msg -> Printf.sprintf "Parse: %s" msg
        in

        let%lwt () = Logs_lwt.warn (fun m ->
          m "[HedgeCost] Allianz API error: %s, using fallback estimated rate" error_msg
        ) in

        (* Fallback to estimated rates *)
        let estimated_rate = Allianz_parametric_client.AllianzClient.get_estimated_rate
          (Allianz_parametric_client.AllianzClient.coverage_type_to_allianz coverage_type)
        in
        let cost = hedged_amount *. estimated_rate in
        Lwt.return (Some cost)

  with exn ->
    let%lwt () = Logs_lwt.warn (fun m ->
      m "[HedgeCost] Exception fetching Allianz cost: %s, using fallback" (Exn.to_string exn)
    ) in

    (* Final fallback to estimated rates *)
    let hedge_ratio = default_hedge_ratio in
    let allianz_weight = venue_weights.allianz in
    let hedged_amount = coverage_amount *. hedge_ratio *. allianz_weight in

    let estimated_rate = match coverage_type with
      | Depeg -> 0.0045 (* 0.45% of coverage *)
      | Bridge -> 0.0065 (* 0.65% of coverage *)
      | Smart_contract -> 0.0085 (* 0.85% of coverage *)
      | Oracle -> 0.0075 (* 0.75% of coverage *)
      | CEX_liquidation -> 0.0055 (* 0.55% of coverage *)
    in
    let cost = hedged_amount *. estimated_rate in
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
    timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
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
  let stablecoins = [USDC; USDT; DAI; FRAX; BUSD; USDe; USDY; PYUSD; GHO; LUSD; USDP] in

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
  Printf.printf "  Amount:       $%.2f\n" coverage_amount;
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
