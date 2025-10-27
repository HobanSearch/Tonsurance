(** Hedging API - Phase 4 Hedged Insurance Endpoints
 *
 * REST endpoints for hedging operations:
 * - GET /api/v2/hedging/swing-quote - Calculate swing premium (base + hedge costs)
 * - GET /api/v2/hedging/policy/:id/status - Get hedge position status for a policy
 *
 * Integrates with:
 * - backend/hedging/hedge_cost_fetcher.ml - Real-time hedge cost calculation
 * - backend/hedging/hedge_orchestrator.ml - Hedge position tracking
 * - backend/pricing/pricing_engine.ml - Base premium calculation
 *)

open Core
open Lwt.Syntax
open Types
open Dream
open Ppx_yojson_conv_lib.Yojson_conv.Primitives

(** ============================================
 * ENDPOINT 1: GET /api/v2/hedging/swing-quote
 * ============================================
 * Calculate swing premium: base_premium + hedge_costs + protocol_margin
 *
 * Query params:
 * - coverage_type: depeg | exploit | bridge | cex_liquidation | oracle_failure
 * - chain: ton | ethereum | arbitrum | polygon | bsc | avalanche | optimism | base
 * - stablecoin: usdt | usdc | dai | frax | busd | tusd | usdp | lusd | gusd | usdd | fdusd | usdj | usde | other
 * - coverage_amount: float (USD amount)
 * - duration_days: int
 *
 * Response:
 * {
 *   "base_premium": 6.58,
 *   "hedge_costs": {
 *     "polymarket": 60.00,
 *     "hyperliquid": 60.00,
 *     "binance": 60.00,
 *     "allianz": 20.00,
 *     "total": 200.00
 *   },
 *   "protocol_margin": 10.00,
 *   "total_premium": 216.58,
 *   "savings_vs_core": 133.42,
 *   "savings_pct": 38.1,
 *   "valid_until": "2025-10-27T12:30:00Z",
 *   "hedge_ratio": 0.20,
 *   "timestamp": 1730000000.0
 * }
 *)

let swing_quote_handler _state req =
  try%lwt
    let coverage_type_str = Dream.query req "coverage_type" |> Option.value ~default:"depeg" in
    let chain_str = Dream.query req "chain" |> Option.value ~default:"ton" in
    let stablecoin_str = Dream.query req "stablecoin" |> Option.value ~default:"usdt" in
    let coverage_amount_str = Dream.query req "coverage_amount" |> Option.value ~default:"10000.0" in
    let duration_days_str = Dream.query req "duration_days" |> Option.value ~default:"30" in

    (* Parse parameters *)
    let coverage_type = coverage_type_of_string coverage_type_str in
    let chain = blockchain_of_string chain_str in
    let stablecoin = asset_of_string stablecoin_str in
    let coverage_amount = Float.of_string coverage_amount_str in
    let duration_days = Int.of_string duration_days_str in

    let%lwt () = Logs_lwt.info (fun m ->
      m "[HedgingAPI] Swing quote request: %s %s %s $%.2f %dd"
        coverage_type_str chain_str stablecoin_str coverage_amount duration_days
    ) in

    (* 1. Calculate base premium (0.8% APR for hedged insurance) *)
    let base_apr = 0.008 in (* 0.8% APR *)
    let base_premium = (coverage_amount *. base_apr *. Float.of_int duration_days) /. 365.0 in

    (* 2. Fetch real-time hedge costs from all venues *)
    let%lwt hedge_breakdown = Hedging.Hedge_cost_fetcher.fetch_hedge_cost
      ~coverage_type
      ~chain
      ~stablecoin
      ~coverage_amount
    in

    (* 3. Calculate protocol margin (5% of total hedge costs) *)
    let protocol_margin = hedge_breakdown.total_hedge_cost *. 0.05 in

    (* 4. Calculate total swing premium *)
    let total_premium = base_premium +. hedge_breakdown.effective_premium_addition +. protocol_margin in

    (* 5. Calculate savings vs Core Insurance (2% APR fixed) *)
    let core_apr = 0.02 in (* 2% APR for Core Insurance *)
    let core_premium = (coverage_amount *. core_apr *. Float.of_int duration_days) /. 365.0 in
    let savings = core_premium -. total_premium in
    let savings_pct = if Float.(core_premium > 0.0) then (savings /. core_premium) *. 100.0 else 0.0 in

    (* 6. Build response *)
    let response = `Assoc [
      ("base_premium", `Float base_premium);
      ("hedge_costs", `Assoc [
        ("polymarket", `Float (Option.value hedge_breakdown.polymarket_cost ~default:0.0));
        ("hyperliquid", `Float (Option.value hedge_breakdown.hyperliquid_cost ~default:0.0));
        ("binance", `Float (Option.value hedge_breakdown.binance_cost ~default:0.0));
        ("allianz", `Float (Option.value hedge_breakdown.allianz_cost ~default:0.0));
        ("total", `Float hedge_breakdown.total_hedge_cost);
      ]);
      ("protocol_margin", `Float protocol_margin);
      ("total_premium", `Float total_premium);
      ("savings_vs_core", `Float savings);
      ("savings_pct", `Float savings_pct);
      ("valid_until", `String (
        let now = Time_float.now () in
        let valid_until = Time_float.add now (Time_float.Span.of_sec (5.0 *. 60.0)) in (* 5 min *)
        Time_float.to_string_iso8601_basic valid_until ~zone:Time_float.Zone.utc
      ));
      ("hedge_ratio", `Float hedge_breakdown.hedge_ratio);
      ("timestamp", `Float hedge_breakdown.timestamp);
    ] in

    let%lwt () = Logs_lwt.info (fun m ->
      m "[HedgingAPI] Swing quote calculated: base=$%.2f hedges=$%.2f total=$%.2f (%.1f%% savings)"
        base_premium hedge_breakdown.total_hedge_cost total_premium savings_pct
    ) in

    Dream.json (Yojson.Safe.to_string response)
    |> Lwt.return

  with
  | exn ->
      let error_msg = Exn.to_string exn in
      let%lwt () = Logs_lwt.err (fun m ->
        m "[HedgingAPI] Swing quote error: %s" error_msg
      ) in
      Dream.json (Yojson.Safe.to_string (`Assoc [
        ("error", `String "Failed to calculate swing quote");
        ("message", `String error_msg);
      ]))
      |> Lwt.return

(** ============================================
 * ENDPOINT 2: GET /api/v2/hedging/policy/:policy_id/status
 * ============================================
 * Get hedge execution status for a specific policy
 *
 * Path param:
 * - policy_id: int64
 *
 * Response:
 * {
 *   "policy_id": "123456",
 *   "hedges_requested": true,
 *   "hedges_executed": {
 *     "polymarket": { "status": "active", "amount": 60.0, "external_id": "pm-123456" },
 *     "hyperliquid": { "status": "active", "amount": 60.0, "external_id": "hl-123456" },
 *     "binance": { "status": "active", "amount": 60.0, "external_id": "bn-123456" },
 *     "allianz": { "status": "pending", "amount": 20.0, "external_id": "alz-123456" }
 *   },
 *   "fully_hedged": false,
 *   "total_hedge_amount": 200.0,
 *   "timestamp": 1730000000.0
 * }
 *)

let hedge_status_handler state req =
  try%lwt
    let policy_id_str = Dream.param req "policy_id" in
    let policy_id = Int64.of_string policy_id_str in

    let%lwt () = Logs_lwt.info (fun m ->
      m "[HedgingAPI] Hedge status request for policy %Ld" policy_id
    ) in

    (* Get policy from collateral manager *)
    let pool = (!(state.Api_v2_server.StateV2.collateral_manager)).pool in

    (* Find policy *)
    let policy_opt = List.find pool.active_policies ~f:(fun p -> Int64.(p.policy_id = policy_id)) in

    (match policy_opt with
    | None ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "[HedgingAPI] Policy %Ld not found" policy_id
        ) in
        Dream.json (Yojson.Safe.to_string (`Assoc [
          ("error", `String "Policy not found");
          ("policy_id", `String policy_id_str);
        ]))
        |> Lwt.return

    | Some policy ->
        (* For now, return mock hedge positions since database tracking is Phase 4.5 *)
        (* TODO: Query hedge_positions table in db once backend/db/hedge_persistence.ml is integrated *)
        let hedges_requested = true in
        let fully_hedged = policy.policy_status = Active in

        let response = `Assoc [
          ("policy_id", `String (Int64.to_string policy_id));
          ("hedges_requested", `Bool hedges_requested);
          ("hedges_executed", `Assoc [
            ("polymarket", `Assoc [
              ("status", `String (if fully_hedged then "active" else "pending"));
              ("amount", `Float 60.0);
              ("external_id", `String (sprintf "pm-%Ld" policy_id));
            ]);
            ("hyperliquid", `Assoc [
              ("status", `String (if fully_hedged then "active" else "pending"));
              ("amount", `Float 60.0);
              ("external_id", `String (sprintf "hl-%Ld" policy_id));
            ]);
            ("binance", `Assoc [
              ("status", `String (if fully_hedged then "active" else "pending"));
              ("amount", `Float 60.0);
              ("external_id", `String (sprintf "bn-%Ld" policy_id));
            ]);
            ("allianz", `Assoc [
              ("status", `String "pending");
              ("amount", `Float 20.0);
              ("external_id", `String (sprintf "alz-%Ld" policy_id));
            ]);
          ]);
          ("fully_hedged", `Bool fully_hedged);
          ("total_hedge_amount", `Float 200.0);
          ("timestamp", `Float (Time_float.now ()
            |> Time_float.to_span_since_epoch
            |> Time_float.Span.to_sec));
        ] in

        let%lwt () = Logs_lwt.info (fun m ->
          m "[HedgingAPI] Hedge status for policy %Ld: fully_hedged=%b" policy_id fully_hedged
        ) in

        Dream.json (Yojson.Safe.to_string response)
        |> Lwt.return
    )

  with
  | exn ->
      let error_msg = Exn.to_string exn in
      let%lwt () = Logs_lwt.err (fun m ->
        m "[HedgingAPI] Hedge status error: %s" error_msg
      ) in
      Dream.json (Yojson.Safe.to_string (`Assoc [
        ("error", `String "Failed to fetch hedge status");
        ("message", `String error_msg);
      ]))
      |> Lwt.return

(** Routes *)
let routes state = [
  Dream.get "/api/v2/hedging/swing-quote" (swing_quote_handler state);
  Dream.get "/api/v2/hedging/policy/:policy_id/status" (hedge_status_handler state);
]
