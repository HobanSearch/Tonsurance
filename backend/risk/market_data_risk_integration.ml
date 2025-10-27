(* Market Data Risk Integration
 *
 * Integrates real-time market data into risk calculations:
 * - CEX liquidation volume → Market stress multiplier
 * - Bridge health scores → Bridge risk multiplier
 * - Chain congestion → Chain risk multiplier
 *
 * All multipliers feed into premium calculations:
 * Final Premium = Base Premium × Bridge Mult × Chain Mult × Market Stress Mult
 *)

open Core
open Types

module MarketDataRiskIntegration = struct

  (* Import market data clients *)
  module CEXClient = Cex_liquidation_client.CEXLiquidationClient
  module BridgeClient = Bridge_health_client.BridgeHealthClient
  module ChainClient = Chain_metrics_client.ChainMetricsClient

  (** Risk multipliers from market data *)
  type market_risk_multipliers = {
    bridge_multiplier: float;           (* 1.0 - 2.0 based on health *)
    chain_multiplier: float;            (* 1.0 - 1.3 based on congestion *)
    market_stress_multiplier: float;    (* 1.0 - 2.5 based on liquidations *)
    combined_multiplier: float;         (* Product of all multipliers *)
    timestamp: float;

    (* Component scores for transparency *)
    bridge_health_score: float option;
    chain_congestion_score: float option;
    market_stress_level: market_stress_level;
  } [@@deriving sexp, yojson]

  (** Calculate market stress multiplier from liquidation data *)
  let calculate_market_stress_multiplier
      (liquidation_metrics: CEXClient.liquidation_metrics list)
    : (float * market_stress_level) Lwt.t =

    (* Sum total liquidations across all exchanges *)
    let total_liquidated_cents = List.fold liquidation_metrics ~init:0L ~f:(fun acc m ->
      Int64.(acc + m.total_liquidated_usd)
    ) in

    let total_liquidated_usd = Int64.to_float total_liquidated_cents /. 100.0 in

    (* Determine stress level and multiplier *)
    let (stress_level, multiplier) =
      if Float.(total_liquidated_usd > 1_000_000_000.0) then
        (Extreme, 2.5)  (* >$1B liquidated = extreme stress *)
      else if Float.(total_liquidated_usd > 500_000_000.0) then
        (High, 2.0)     (* >$500M = high stress *)
      else if Float.(total_liquidated_usd > 100_000_000.0) then
        (Elevated, 1.5) (* >$100M = elevated *)
      else
        (Normal, 1.0)   (* Normal market *)
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Market stress: %s ($%.2fM liquidated) → %.2fx multiplier"
        (match stress_level with
         | Normal -> "NORMAL"
         | Elevated -> "ELEVATED"
         | High -> "HIGH"
         | Extreme -> "EXTREME")
        (total_liquidated_usd /. 1_000_000.0)
        multiplier
    ) in

    Lwt.return (multiplier, stress_level)

  (** Fetch and calculate all risk multipliers *)
  let fetch_market_risk_multipliers
      ~(cex_config: CEXClient.client_config)
      ~(bridge_config: BridgeClient.client_config)
      ~(chain_config: ChainClient.client_config)
      ~(bridge_id: BridgeClient.bridge_id)
      ~(chain: blockchain)
      ~(assets: string list)
    : market_risk_multipliers Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "Fetching market data for risk calculations..."
    ) in

    (* Fetch liquidation data *)
    let%lwt liquidation_metrics = CEXClient.fetch_all_metrics
      ~config:cex_config
      ~assets
    in

    (* Fetch bridge health *)
    let%lwt bridge_metrics_opt = BridgeClient.fetch_bridge_metrics
      ~config:bridge_config
      ~bridge_id
    in

    (* Fetch chain metrics *)
    let%lwt chain_metrics_opt = ChainClient.fetch_chain_metrics
      ~config:chain_config
      ~chain
    in

    (* Calculate individual multipliers *)
    let%lwt bridge_multiplier = match bridge_metrics_opt with
      | Some metrics -> Lwt.return (BridgeClient.calculate_bridge_risk_multiplier metrics)
      | None ->
          let%lwt () = Logs_lwt.warn (fun m ->
            m "Bridge health unavailable, using conservative 1.5x"
          ) in
          Lwt.return 1.5
    in

    let bridge_health_score = match bridge_metrics_opt with
      | Some m -> Some m.health_score
      | None -> None
    in

    let%lwt chain_multiplier = match chain_metrics_opt with
      | Some metrics -> Lwt.return (ChainClient.calculate_chain_risk_multiplier metrics)
      | None ->
          let%lwt () = Logs_lwt.warn (fun m ->
            m "Chain metrics unavailable, using default 1.1x"
          ) in
          Lwt.return 1.1
    in

    let chain_congestion_score = match chain_metrics_opt with
      | Some m -> Some m.congestion_score
      | None -> None
    in

    let%lwt (market_stress_multiplier, market_stress_level) =
      calculate_market_stress_multiplier liquidation_metrics
    in

    (* Combined multiplier *)
    let combined_multiplier =
      bridge_multiplier *. chain_multiplier *. market_stress_multiplier
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Risk multipliers: bridge=%.2fx, chain=%.2fx, market_stress=%.2fx → combined=%.2fx"
        bridge_multiplier
        chain_multiplier
        market_stress_multiplier
        combined_multiplier
    ) in

    Lwt.return {
      bridge_multiplier;
      chain_multiplier;
      market_stress_multiplier;
      combined_multiplier;
      timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      bridge_health_score;
      chain_congestion_score;
      market_stress_level;
    }

  (** Apply risk multipliers to base premium *)
  let calculate_risk_adjusted_premium
      ~(base_premium_cents: int64)
      ~(multipliers: market_risk_multipliers)
    : int64 Lwt.t =

    let base_premium_usd = Int64.to_float base_premium_cents /. 100.0 in
    let adjusted_premium_usd = base_premium_usd *. multipliers.combined_multiplier in
    let adjusted_premium_cents = Int64.of_float (adjusted_premium_usd *. 100.0) in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Premium adjustment: $%.2f → $%.2f (%.1fx multiplier)"
        base_premium_usd
        adjusted_premium_usd
        multipliers.combined_multiplier
    ) in

    Lwt.return adjusted_premium_cents

  (** Cache for multipliers (updated every 5 minutes) *)
  type multiplier_cache = {
    mutable cached_multipliers: (string, market_risk_multipliers) Hashtbl.t;
    mutable last_update: float;
    cache_ttl_seconds: float;
  }

  let create_multiplier_cache ~(ttl_seconds: float) : multiplier_cache =
    {
      cached_multipliers = Hashtbl.create (module String);
      last_update = 0.0;
      cache_ttl_seconds = ttl_seconds;
    }

  (** Get cached or fresh multipliers *)
  let get_cached_multipliers
      (cache: multiplier_cache)
      ~(cex_config: CEXClient.client_config)
      ~(bridge_config: BridgeClient.client_config)
      ~(chain_config: ChainClient.client_config)
      ~(bridge_id: BridgeClient.bridge_id)
      ~(chain: blockchain)
      ~(assets: string list)
    : market_risk_multipliers Lwt.t =

    let cache_key = Printf.sprintf "%s_%s"
      (BridgeClient.bridge_id_to_string bridge_id)
      (blockchain_to_string chain)
    in

    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let is_stale = Float.((now -. cache.last_update) > cache.cache_ttl_seconds) in

    match Hashtbl.find cache.cached_multipliers cache_key with
    | Some multipliers when not is_stale ->
        let%lwt () = Logs_lwt.debug (fun m ->
          m "Using cached multipliers (age: %.0fs)" (now -. cache.last_update)
        ) in
        Lwt.return multipliers

    | _ ->
        let%lwt () = Logs_lwt.info (fun m ->
          m "Cache stale or missing, fetching fresh market data..."
        ) in

        let%lwt fresh_multipliers = fetch_market_risk_multipliers
          ~cex_config
          ~bridge_config
          ~chain_config
          ~bridge_id
          ~chain
          ~assets
        in

        (* Update cache *)
        Hashtbl.set cache.cached_multipliers ~key:cache_key ~data:fresh_multipliers;
        cache.last_update <- now;

        Lwt.return fresh_multipliers

  (** Monitor market data and update risk multipliers continuously *)
  let start_market_risk_monitor
      ~(cex_config: CEXClient.client_config)
      ~(bridge_config: BridgeClient.client_config)
      ~(chain_config: ChainClient.client_config)
      ~(update_interval_seconds: float)
      ~(on_update: market_risk_multipliers -> unit Lwt.t)
    : unit Lwt.t =

    let rec monitor_loop () =
      let%lwt () = Logs_lwt.info (fun m ->
        m "Updating market risk multipliers..."
      ) in

      (* Update for all major bridges and chains *)
      let bridge_chain_pairs = [
        (BridgeClient.Wormhole, Ethereum);
        (BridgeClient.LayerZero, Arbitrum);
        (BridgeClient.Axelar, Base);
        (BridgeClient.Stargate, Polygon);
      ] in

      let%lwt () = Lwt_list.iter_s (fun (bridge_id, chain) ->
        let%lwt multipliers = fetch_market_risk_multipliers
          ~cex_config
          ~bridge_config
          ~chain_config
          ~bridge_id
          ~chain
          ~assets:["BTC"; "ETH"; "USDC"; "USDT"]
        in

        on_update multipliers
      ) bridge_chain_pairs in

      (* Wait for next update *)
      let%lwt () = Lwt_unix.sleep update_interval_seconds in

      monitor_loop ()
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "Starting market risk monitor (interval: %.0fs)" update_interval_seconds
    ) in

    monitor_loop ()

  (** Get current market stress summary *)
  let get_market_stress_summary
      ~(cex_config: CEXClient.client_config)
      ~(assets: string list)
    : (market_stress_level * float * string) Lwt.t =

    let%lwt liquidation_metrics = CEXClient.fetch_all_metrics
      ~config:cex_config
      ~assets
    in

    let%lwt (multiplier, stress_level) = calculate_market_stress_multiplier liquidation_metrics in

    let total_liquidated_cents = List.fold liquidation_metrics ~init:0L ~f:(fun acc m ->
      Int64.(acc + m.total_liquidated_usd)
    ) in

    let total_liquidated_usd = Int64.to_float total_liquidated_cents /. 100.0 in

    let summary = Printf.sprintf
      "Market Stress: %s | 24h Liquidations: $%.2fM | Risk Multiplier: %.2fx"
      (match stress_level with
       | Normal -> "NORMAL"
       | Elevated -> "ELEVATED"
       | High -> "HIGH"
       | Extreme -> "EXTREME")
      (total_liquidated_usd /. 1_000_000.0)
      multiplier
    in

    Lwt.return (stress_level, total_liquidated_usd, summary)

end
