(* Bridge Exploit Hedge Executor - Polymarket Integration for Bridge Coverage
 *
 * Executes hedges for cross-chain bridge exploit coverage using Polymarket prediction markets.
 *
 * Hedging Strategy:
 * - Monitor all active bridge coverage policies
 * - Buy YES shares on "Will [Bridge] be hacked in [Timeframe]?" markets
 * - Track bridge-specific risk factors (TVL, security audits, hack history)
 *
 * Bridge Categories:
 * 1. **Token Bridges**: Wormhole, Multichain, Synapse (highest risk)
 * 2. **Messaging Bridges**: LayerZero, Axelar (medium risk)
 * 3. **Native Bridges**: Optimism, Arbitrum official bridges (lowest risk)
 *
 * Example Scenario:
 * - User buys $100,000 Wormhole bridge exploit coverage (ETH→Solana)
 * - Executor buys $20,000 worth of YES shares on "Wormhole hack in Q1 2025"
 * - Market odds: 8% (based on hack history and TVL)
 * - If hacked → User gets $100k, hedge pays $250k (12.5x return)
 * - Net vault cost: -$150k (vault profits!)
 *
 * Risk Factors:
 * - Bridge TVL (higher = more attractive target)
 * - Audit quality (Certik, Trail of Bits, etc.)
 * - Hack history (previously exploited bridges = higher risk)
 * - Code complexity (# of contracts, lines of code)
 * - Governance model (multisig vs DAO vs centralized)
 *)

let unix_time = Unix.time

open Core
open Types



module BridgeHedgeExecutor = struct

  (** Bridge metadata *)
  type bridge_info = {
    bridge_name: string;
    bridge_type: [`Token | `Messaging | `Native];
    source_chain: blockchain;
    dest_chain: blockchain;
    tvl_usd: float;
    security_score: float; (* 0.0-1.0, higher = safer *)
    hack_history: int; (* Number of previous exploits *)
    last_audit_date: float; (* Unix timestamp *)
    governance: [`Multisig | `DAO | `Centralized];
  } [@@deriving sexp, yojson]

  (** Polymarket bridge exploit market *)
  type bridge_market = {
    market_id: string;
    question: string; (* e.g., "Will Wormhole be hacked in Q1 2025?" *)
    bridge: bridge_info;
    timeframe_start: float;
    timeframe_end: float;
    yes_price: float; (* Current YES price, 0.0-1.0 *)
    no_price: float;
    liquidity: float; (* USD *)
    volume_24h: float;
    last_update: float;
  } [@@deriving sexp, yojson]

  (** Bridge hedge execution result *)
  type bridge_hedge_result = {
    order_id: string;
    market_id: string;
    bridge_name: string;
    shares_bought: float;
    avg_price: float;
    total_cost_usd: float;
    estimated_payout: float; (* If YES wins *)
    expected_return_multiple: float; (* payout / cost *)
    timestamp: float;
  } [@@deriving sexp, yojson]

  (** ============================================
   * BRIDGE MAPPING & RISK ASSESSMENT
   * ============================================ *)

  (** Get bridge info for coverage *)
  let get_bridge_info
      ~(source_chain: blockchain)
      ~(dest_chain: blockchain)
    : bridge_info option =

    (* Map chain pairs to dominant bridges *)
    match (source_chain, dest_chain) with
    | (Ethereum, Solana) | (Solana, Ethereum) ->
        Some {
          bridge_name = "Wormhole";
          bridge_type = `Token;
          source_chain = Ethereum;
          dest_chain = Solana;
          tvl_usd = 800_000_000.0; (* $800M TVL *)
          security_score = 0.65; (* Medium-high risk, has been hacked before *)
          hack_history = 1; (* $325M hack in Feb 2022 *)
          last_audit_date = 1704067200.0; (* Jan 2024 *)
          governance = `Multisig;
        }

    | (Ethereum, Arbitrum) | (Arbitrum, Ethereum) ->
        Some {
          bridge_name = "Arbitrum Official Bridge";
          bridge_type = `Native;
          source_chain = Ethereum;
          dest_chain = Arbitrum;
          tvl_usd = 3_500_000_000.0; (* $3.5B TVL *)
          security_score = 0.90; (* Native L2 bridge, very safe *)
          hack_history = 0;
          last_audit_date = 1704067200.0;
          governance = `DAO;
        }

    | (Ethereum, Polygon) | (Polygon, Ethereum) ->
        Some {
          bridge_name = "Polygon PoS Bridge";
          bridge_type = `Native;
          source_chain = Ethereum;
          dest_chain = Polygon;
          tvl_usd = 5_200_000_000.0; (* $5.2B TVL *)
          security_score = 0.85; (* Well-audited native bridge *)
          hack_history = 0;
          last_audit_date = 1704067200.0;
          governance = `Multisig;
        }

    | (Ethereum, Base) | (Base, Ethereum) ->
        Some {
          bridge_name = "Base Official Bridge";
          bridge_type = `Native;
          source_chain = Ethereum;
          dest_chain = Base;
          tvl_usd = 2_800_000_000.0; (* $2.8B TVL *)
          security_score = 0.92; (* Coinbase-backed, very safe *)
          hack_history = 0;
          last_audit_date = 1704067200.0;
          governance = `Centralized;
        }

    | (Ethereum, Optimism) | (Optimism, Ethereum) ->
        Some {
          bridge_name = "Optimism Official Bridge";
          bridge_type = `Native;
          source_chain = Ethereum;
          dest_chain = Optimism;
          tvl_usd = 1_900_000_000.0; (* $1.9B TVL *)
          security_score = 0.88;
          hack_history = 0;
          last_audit_date = 1704067200.0;
          governance = `DAO;
        }

    | (Ethereum, TON) | (TON, Ethereum) ->
        Some {
          bridge_name = "TON Bridge";
          bridge_type = `Token;
          source_chain = Ethereum;
          dest_chain = TON;
          tvl_usd = 150_000_000.0; (* $150M TVL *)
          security_score = 0.70; (* Newer bridge, less battle-tested *)
          hack_history = 0;
          last_audit_date = 1704067200.0;
          governance = `Multisig;
        }

    | (Arbitrum, Base) | (Base, Arbitrum) ->
        Some {
          bridge_name = "Across Protocol";
          bridge_type = `Messaging;
          source_chain = Arbitrum;
          dest_chain = Base;
          tvl_usd = 400_000_000.0; (* $400M TVL *)
          security_score = 0.78;
          hack_history = 0;
          last_audit_date = 1704067200.0;
          governance = `DAO;
        }

    | _ -> None (* No dominant bridge for this pair *)

  (** Calculate bridge risk score *)
  let calculate_bridge_risk_score
      ~(bridge: bridge_info)
    : float =

    (* Risk factors (higher = more risky) *)
    let tvl_risk = Float.min 1.0 (bridge.tvl_usd /. 10_000_000_000.0) in (* Normalize to $10B *)
    let security_risk = 1.0 -. bridge.security_score in
    let hack_risk = Float.min 1.0 (Float.of_int bridge.hack_history *. 0.5) in
    let audit_age = (unix_time () -. bridge.last_audit_date) /. 31536000.0 in (* Years since audit *)
    let audit_risk = Float.min 1.0 (audit_age /. 2.0) in (* Max risk at 2 years *)

    let governance_risk = match bridge.governance with
      | `Centralized -> 0.3 (* Lower risk - faster response *)
      | `Multisig -> 0.5 (* Medium risk *)
      | `DAO -> 0.7 (* Higher risk - slower governance *)
    in

    (* Weighted average *)
    let total_risk =
      (tvl_risk *. 0.25) +.
      (security_risk *. 0.30) +.
      (hack_risk *. 0.25) +.
      (audit_risk *. 0.10) +.
      (governance_risk *. 0.10)
    in

    total_risk

  (** ============================================
   * MARKET DISCOVERY
   * ============================================ *)

  (** Find Polymarket markets for bridge exploits *)
  let find_bridge_markets
      ~(bridge: bridge_info)
    : bridge_market list Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "[Polymarket] Searching bridge exploit markets for %s" bridge.bridge_name
    ) in

    try%lwt
      (* Get Polymarket credentials from environment *)
      let api_key = Option.value (Sys.getenv "POLYMARKET_API_KEY") ~default:"demo_key" in
      let api_secret = Option.value (Sys.getenv "POLYMARKET_API_SECRET") ~default:"demo_secret" in

      (* Create Polymarket client *)
      let%lwt poly_client = Polymarket_http_client.PolymarketClient.create
        ~api_key
        ~api_secret
      in

      (* Build search query for bridge exploit markets *)
      let search_queries = [
        Printf.sprintf "%s hack" bridge.bridge_name;
        Printf.sprintf "%s exploit" bridge.bridge_name;
        Printf.sprintf "%s bridge security" bridge.bridge_name;
      ] in

      (* Search for markets using multiple queries *)
      let%lwt all_results = Lwt_list.map_s (fun query ->
        let%lwt search_result = Polymarket_http_client.PolymarketClient.search_markets
          poly_client
          ~query
          ~limit:5
        in
        match search_result with
        | Ok markets -> Lwt.return markets
        | Error _ -> Lwt.return []
      ) search_queries in

      (* Flatten and deduplicate results *)
      let polymarket_markets = List.concat all_results
        |> List.dedup_and_sort ~compare:(fun a b ->
          String.compare a.Polymarket_http_client.PolymarketClient.condition_id
                        b.Polymarket_http_client.PolymarketClient.condition_id)
      in

      (* Convert Polymarket API results to our bridge_market type *)
      let markets = List.filter_map polymarket_markets ~f:(fun pm_market ->
        (* Check if question matches bridge name and contains hack/exploit keywords *)
        let question_upper = String.uppercase pm_market.Polymarket_http_client.PolymarketClient.question in
        let bridge_upper = String.uppercase bridge.bridge_name in
        let matches_bridge = String.is_substring question_upper ~substring:bridge_upper in
        let is_hack_market =
          String.is_substring question_upper ~substring:"HACK" ||
          String.is_substring question_upper ~substring:"EXPLOIT" ||
          String.is_substring question_upper ~substring:"SECURITY"
        in

        (* Check minimum liquidity ($5k) *)
        if matches_bridge && is_hack_market && Float.(pm_market.liquidity >= 5_000.0) then
          (* Parse timeframe from question (estimate if not available) *)
          let now = unix_time () in
          let timeframe_start = now in
          let timeframe_end = now +. (86400.0 *. 90.0) in (* Default 90 days *)

          Some {
            market_id = pm_market.condition_id;
            question = pm_market.question;
            bridge;
            timeframe_start;
            timeframe_end;
            yes_price = pm_market.yes_price;
            no_price = pm_market.no_price;
            liquidity = pm_market.liquidity;
            volume_24h = pm_market.volume_24h;
            last_update = unix_time ();
          }
        else
          None
      ) in

      let%lwt () = Logs_lwt.info (fun m ->
        m "[Polymarket] Found %d viable bridge exploit markets for %s"
          (List.length markets) bridge.bridge_name
      ) in

      Lwt.return markets

    with exn ->
      let%lwt () = Logs_lwt.warn (fun m ->
        m "[Polymarket] Error searching bridge markets: %s, falling back to mock data"
          (Exn.to_string exn)
      ) in

      (* Fallback: Return mock markets *)
      let mock_markets = match bridge.bridge_name with
        | "Wormhole" -> [
            {
              market_id = "wormhole_hack_q1_2025";
              question = "Will Wormhole be hacked in Q1 2025?";
              bridge;
              timeframe_start = 1704067200.0;
              timeframe_end = 1711929600.0;
              yes_price = 0.08;
              no_price = 0.92;
              liquidity = 300_000.0;
              volume_24h = 15_000.0;
              last_update = unix_time ();
            }
          ]

        | "Arbitrum Official Bridge" -> [
            {
              market_id = "arbitrum_bridge_hack_q1_2025";
              question = "Will Arbitrum official bridge be hacked in Q1 2025?";
              bridge;
              timeframe_start = 1704067200.0;
              timeframe_end = 1711929600.0;
              yes_price = 0.02;
              no_price = 0.98;
              liquidity = 150_000.0;
              volume_24h = 5_000.0;
              last_update = unix_time ();
            }
          ]

        | "Polygon PoS Bridge" -> [
            {
              market_id = "polygon_bridge_hack_q1_2025";
              question = "Will Polygon bridge be exploited in Q1 2025?";
              bridge;
              timeframe_start = 1704067200.0;
              timeframe_end = 1711929600.0;
              yes_price = 0.03;
              no_price = 0.97;
              liquidity = 200_000.0;
              volume_24h = 8_000.0;
              last_update = unix_time ();
            }
          ]

        | "TON Bridge" -> [
            {
              market_id = "ton_bridge_hack_q1_2025";
              question = "Will TON Bridge be hacked in Q1 2025?";
              bridge;
              timeframe_start = 1704067200.0;
              timeframe_end = 1711929600.0;
              yes_price = 0.05;
              no_price = 0.95;
              liquidity = 80_000.0;
              volume_24h = 3_000.0;
              last_update = unix_time ();
            }
          ]

        | _ -> []
      in

      Lwt.return mock_markets

  (** Select best market for hedging *)
  let select_best_market
      ~(markets: bridge_market list)
      ~(coverage_amount: usd_cents)
      ~(policy_expiry: float)
    : bridge_market option =

    let hedge_size = Math.cents_to_usd coverage_amount *. 0.20 in (* 20% hedge *)

    (* Filter viable markets *)
    let viable = List.filter markets ~f:(fun m ->
      Float.(m.liquidity >= hedge_size *. 0.10) && (* 10% of liquidity *)
      Float.(m.timeframe_end >= policy_expiry) (* Covers policy duration *)
    ) in

    (* Sort by expected value: (1.0 / yes_price) = payout multiple *)
    (* Higher multiple = better hedge *)
    let sorted = List.sort viable ~compare:(fun a b ->
      Float.compare (1.0 /. a.yes_price) (1.0 /. b.yes_price)
    ) in

    List.hd sorted

  (** ============================================
   * ORDER EXECUTION
   * ============================================ *)

  (** Execute bridge hedge order *)
  let execute_bridge_hedge_order
      ~(market: bridge_market)
      ~(order_size_usd: float)
    : bridge_hedge_result Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "[Polymarket] Executing bridge hedge: %s at %.4f odds"
        market.bridge.bridge_name market.yes_price
    ) in

    (* Calculate shares *)
    let shares_to_buy = order_size_usd /. market.yes_price in
    let avg_price = market.yes_price *. 1.015 in (* 1.5% slippage *)
    let total_cost = shares_to_buy *. avg_price in
    let estimated_payout = shares_to_buy *. 1.0 in (* YES pays $1.00 *)
    let return_multiple = estimated_payout /. total_cost in

    let%lwt () = Lwt_unix.sleep 0.5 in (* Simulate API latency *)

    Lwt.return {
      order_id = Printf.sprintf "bridge_hedge_%Ld" (Random.int64 1_000_000L);
      market_id = market.market_id;
      bridge_name = market.bridge.bridge_name;
      shares_bought = shares_to_buy;
      avg_price;
      total_cost_usd = total_cost;
      estimated_payout;
      expected_return_multiple = return_multiple;
      timestamp = unix_time ();
    }

  (** ============================================
   * MAIN EXECUTION
   * ============================================ *)

  (** Execute bridge hedge for a policy *)
  let execute_bridge_hedge
      ~(policy: policy)
      ~(hedge_ratio: float)
    : bridge_hedge_result option Lwt.t =

    (* Verify this is a bridge policy *)
    if not (equal_coverage_type policy.coverage_type Bridge) then
      Lwt.return None
    else
      let%lwt () = Logs_lwt.info (fun m ->
        m "Executing bridge hedge for policy %Ld: %s chain coverage"
          policy.policy_id
          (blockchain_to_string policy.chain)
      ) in

      (* Determine source/dest chains from policy metadata *)
      (* For now, assume policy.chain is dest_chain, Ethereum is source *)
      let source_chain = Ethereum in
      let dest_chain = policy.chain in

      (* Get bridge info *)
      match get_bridge_info ~source_chain ~dest_chain with
      | None ->
          let%lwt () = Logs_lwt.warn (fun m ->
            m "No bridge found for %s → %s"
              (blockchain_to_string source_chain)
              (blockchain_to_string dest_chain)
          ) in
          Lwt.return None

      | Some bridge ->
          (* Calculate risk score *)
          let risk_score = calculate_bridge_risk_score ~bridge in

          let%lwt () = Logs_lwt.info (fun m ->
            m "Bridge: %s (TVL: $%s, Security: %.0f%%, Risk: %.0f%%)"
              bridge.bridge_name
              (Float.to_string_hum ~decimals:0 ~delimiter:',' bridge.tvl_usd)
              (bridge.security_score *. 100.0)
              (risk_score *. 100.0)
          ) in

          (* Find markets *)
          let%lwt markets = find_bridge_markets ~bridge in

          match select_best_market
            ~markets
            ~coverage_amount:policy.coverage_amount
            ~policy_expiry:policy.expiry_time
          with
          | None ->
              let%lwt () = Logs_lwt.warn (fun m ->
                m "No suitable Polymarket market for %s bridge hedge" bridge.bridge_name
              ) in
              Lwt.return None

          | Some market ->
              (* Calculate order size *)
              let coverage_usd = Math.cents_to_usd policy.coverage_amount in
              let order_size = coverage_usd *. hedge_ratio in

              (* Cap at 5% of market liquidity *)
              let max_size = market.liquidity *. 0.05 in
              let final_size = Float.min order_size max_size in

              let%lwt () = Logs_lwt.info (fun m ->
                m "Selected market: %s (YES: %.4f, liquidity: $%s)"
                  market.market_id
                  market.yes_price
                  (Float.to_string_hum ~decimals:0 ~delimiter:',' market.liquidity)
              ) in

              (* Execute order *)
              let%lwt result = execute_bridge_hedge_order ~market ~order_size_usd:final_size in

              let%lwt () = Logs_lwt.info (fun m ->
                m "Bridge hedge executed: %.2f shares at $%.4f (total: $%.2f, %.1fx return potential)"
                  result.shares_bought result.avg_price result.total_cost_usd
                  result.expected_return_multiple
              ) in

              Lwt.return (Some result)

  (** ============================================
   * BATCH OPERATIONS
   * ============================================ *)

  (** Execute hedges for multiple bridge policies *)
  let execute_batch_bridge_hedges
      ~(policies: policy list)
      ~(hedge_ratio: float)
    : bridge_hedge_result list Lwt.t =

    let bridge_policies = List.filter policies ~f:(fun p ->
      equal_coverage_type p.coverage_type Bridge && is_active p
    ) in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Executing batch bridge hedges for %d policies" (List.length bridge_policies)
    ) in

    let%lwt results = Lwt_list.filter_map_p (fun policy ->
      execute_bridge_hedge ~policy ~hedge_ratio
    ) bridge_policies in

    (* Calculate aggregates *)
    let total_cost = List.fold results ~init:0.0 ~f:(fun acc r -> acc +. r.total_cost_usd) in
    let total_shares = List.fold results ~init:0.0 ~f:(fun acc r -> acc +. r.shares_bought) in
    let avg_multiple =
      if List.length results > 0 then
        List.fold results ~init:0.0 ~f:(fun acc r -> acc +. r.expected_return_multiple) /.
        Float.of_int (List.length results)
      else 0.0
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Batch complete: %d hedges, %.2f shares, $%.2f cost, %.1fx avg return"
        (List.length results) total_shares total_cost avg_multiple
    ) in

    Lwt.return results

  (** ============================================
   * LIQUIDATION
   * ============================================ *)

  (** Liquidate bridge hedge position on claim *)
  let liquidate_bridge_hedge
      ~(execution: bridge_hedge_result)
    : float Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "[Polymarket] Liquidating bridge hedge: %s (%.2f shares)"
        execution.bridge_name execution.shares_bought
    ) in

    (* Simulate liquidation *)
    (* If bridge was hacked, YES price should be close to 1.00 *)
    let current_yes_price = 0.98 in (* Bridge hacked, market settling *)
    let sale_proceeds = execution.shares_bought *. current_yes_price in

    let realized_pnl = sale_proceeds -. execution.total_cost_usd in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Liquidation complete: Sold %.2f shares at $%.4f = $%.2f (P&L: %+.2f, %.1fx return)"
        execution.shares_bought current_yes_price sale_proceeds realized_pnl
        (sale_proceeds /. execution.total_cost_usd)
    ) in

    Lwt.return realized_pnl

  (** ============================================
   * MONITORING & ALERTS
   * ============================================ *)

  (** Monitor bridge health and alert on anomalies *)
  let monitor_bridge_health
      ~(bridge: bridge_info)
    : [`Healthy | `Warning | `Critical] Lwt.t =

    (* TODO: Integrate with backend/monitoring/bridge_monitor.ml
     * - Check bridge health scores
     * - Monitor TVL changes (>20% drop = warning)
     * - Track transaction failures
     * - Alert on governance proposals
     *)

    let%lwt () = Logs_lwt.info (fun m ->
      m "Monitoring bridge health: %s (TVL: $%s)"
        bridge.bridge_name
        (Float.to_string_hum ~decimals:0 ~delimiter:',' bridge.tvl_usd)
    ) in

    (* Stub: Random health check *)
    let health = if Float.(bridge.security_score > 0.8) then `Healthy
                 else if Float.(bridge.security_score > 0.6) then `Warning
                 else `Critical
    in

    Lwt.return health

  (** Generate bridge hedge report *)
  let generate_bridge_hedge_report
      ~(executions: bridge_hedge_result list)
    : unit =

    Printf.printf "\n╔══════════════════════════════════════════════════════════╗\n";
    Printf.printf "║  BRIDGE HEDGE REPORT                                     ║\n";
    Printf.printf "╚══════════════════════════════════════════════════════════╝\n\n";

    Printf.printf "Total Hedges: %d\n" (List.length executions);

    (* Group by bridge *)
    let by_bridge = List.fold executions ~init:(Map.empty (module String)) ~f:(fun acc exec ->
      Map.add_multi acc ~key:exec.bridge_name ~data:exec
    ) in

    Printf.printf "\n=== Hedges by Bridge ===\n";
    Map.iteri by_bridge ~f:(fun ~key:bridge_name ~data:execs ->
      let total_cost = List.fold execs ~init:0.0 ~f:(fun acc e -> acc +. e.total_cost_usd) in
      let total_payout = List.fold execs ~init:0.0 ~f:(fun acc e -> acc +. e.estimated_payout) in
      let avg_multiple = total_payout /. total_cost in

      Printf.printf "  %s:\n" bridge_name;
      Printf.printf "    Hedges: %d\n" (List.length execs);
      Printf.printf "    Total Cost: $%.2f\n" total_cost;
      Printf.printf "    Potential Payout: $%.2f\n" total_payout;
      Printf.printf "    Return Multiple: %.1fx\n\n" avg_multiple;
    );

    flush stdout

end
