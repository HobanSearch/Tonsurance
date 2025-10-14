(* Float Rebalancer - Automated USD/BTC Allocation Management

   Dynamically rebalances between USD and BTC based on:
   1. Required liquidity for active policy portfolio
   2. BTC price volatility (high vol = more USD reserves)
   3. Market conditions (stress = more liquidity)
   4. Float performance (accumulate during surplus)

   Integrates bitcoin_float_manager.ml with collateral_manager.ml
   to execute automated rebalancing of the unified pool.

   Key Innovation: Liquidity-driven allocation
   - Calculate worst-case payout needs
   - Ensure USD reserves always cover 150% of required liquidity
   - Excess capital allocated to BTC for appreciation
   - Rebalance when allocation drifts >10% from target
*)

open Core
open Lwt.Syntax
open Types
open Math

module FloatRebalancer = struct

  (** Rebalancing action **)
  type rebalance_action = {
    action: [`Buy_BTC of float | `Sell_BTC of float | `Hold];
    usd_amount: float;
    btc_amount: float;
    reason: string;
    urgency: [`Low | `Medium | `High | `Critical];
    expected_benefit: float; (* Expected improvement in capital efficiency *)
  } [@@deriving sexp, yojson]

  (** Rebalancer configuration **)
  type rebalancer_config = {
    check_interval_seconds: float;
    base_target_usd_pct: float;      (* 0.40 = 40% USD base *)
    base_target_btc_pct: float;      (* 0.60 = 60% BTC base *)
    rebalance_threshold: float;      (* 0.10 = 10% drift triggers *)
    min_btc_float: float;            (* Minimum BTC to hold *)
    liquidity_buffer_multiplier: float; (* 1.5 = 150% of required liquidity *)
    volatility_adjustment_factor: float; (* How much to adjust for volatility *)
    dca_enabled: bool;
    max_trade_size_pct: float;      (* 0.25 = max 25% of capital per trade *)
  } [@@deriving sexp]

  let default_config = {
    check_interval_seconds = 300.0; (* 5 minutes *)
    base_target_usd_pct = 0.40;
    base_target_btc_pct = 0.60;
    rebalance_threshold = 0.10;
    min_btc_float = 50.0;
    liquidity_buffer_multiplier = 1.5;
    volatility_adjustment_factor = 0.5;
    dca_enabled = true;
    max_trade_size_pct = 0.25;
  }

  (** Calculate required USD liquidity for policy portfolio **)
  let calculate_required_liquidity
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(price_scenarios: (asset * float) list)
    : float =

    let pool = collateral_mgr.pool in

    (* For each policy, calculate expected payout under stress scenarios *)
    let total_required =
      List.fold pool.active_policies ~init:0.0 ~f:(fun acc policy ->
        (* Get stress price for this asset *)
        let stress_price_opt =
          List.Assoc.find price_scenarios policy.asset ~equal:Poly.equal
        in

        let stress_price = Option.value stress_price_opt ~default:0.95 in

        (* Calculate payout if triggered *)
        let payout =
          if stress_price < policy.trigger_price then
            let payout_ratio =
              (policy.trigger_price -. stress_price) /.
              (policy.trigger_price -. policy.floor_price)
            in
            let clamped = Float.min 1.0 (Float.max 0.0 payout_ratio) in
            cents_to_usd policy.coverage_amount *. clamped
          else
            0.0
        in

        acc +. payout
      )
    in

    (* Add reserve buffer *)
    total_required *. 0.50 (* Assume 50% of policies trigger simultaneously *)

  (** Calculate BTC volatility from recent price history **)
  let calculate_btc_volatility
      (price_history: float list)
    : float =

    if List.length price_history < 2 then 0.15 (* Default 15% *)
    else
      (* Calculate returns *)
      let returns =
        List.zip_exn (List.drop price_history 1) price_history
        |> List.map ~f:(fun (current, previous) ->
            (current -. previous) /. previous
          )
      in

      (* Annualized volatility *)
      Math.std_dev returns *. Float.sqrt 365.0

  (** Calculate dynamic target allocation based on market conditions **)
  let calculate_dynamic_allocation
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(btc_price: float)
      ~(btc_volatility: float)
      ~(config: rebalancer_config)
      ~(price_scenarios: (asset * float) list)
    : (float * float) = (* (target_usd_pct, target_btc_pct) *)

    (* Calculate required liquidity *)
    let required_liquidity = calculate_required_liquidity collateral_mgr ~price_scenarios in
    let total_capital = cents_to_usd collateral_mgr.pool.total_capital_usd in

    (* Minimum USD based on liquidity needs *)
    let min_usd_pct =
      (required_liquidity *. config.liquidity_buffer_multiplier) /. total_capital
    in

    (* Adjust for volatility *)
    let volatility_adjustment =
      (btc_volatility -. 0.30) *. config.volatility_adjustment_factor
    in

    (* Calculate target USD allocation *)
    let target_usd_pct =
      Float.max min_usd_pct
        (config.base_target_usd_pct +. volatility_adjustment)
      |> Float.min 0.80 (* Never go above 80% USD *)
    in

    let target_btc_pct = 1.0 -. target_usd_pct in

    (target_usd_pct, target_btc_pct)

  (** Calculate current allocation **)
  let calculate_current_allocation
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(btc_price: float)
    : (float * float) =

    let pool = collateral_mgr.pool in

    let current_usd = cents_to_usd pool.usd_reserves in
    let current_btc_value = sats_to_btc pool.btc_float_sats *. btc_price in
    let total = current_usd +. current_btc_value in

    if total <= 0.0 then (0.50, 0.50)
    else (current_usd /. total, current_btc_value /. total)

  (** Determine rebalancing urgency **)
  let calculate_urgency
      (drift: float)
      (reserve_ratio: float)
      (ltv: float)
    : [`Low | `Medium | `High | `Critical] =

    (* Critical if reserves low AND drift high *)
    if reserve_ratio < 0.15 && drift > 0.15 then `Critical
    else if reserve_ratio < 0.20 && drift > 0.10 then `High
    else if ltv > 0.70 && drift > 0.10 then `High
    else if drift > 0.15 then `High
    else if drift > 0.10 then `Medium
    else `Low

  (** Generate rebalancing action **)
  let generate_rebalance_action
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(btc_price: float)
      ~(btc_volatility: float)
      ~(config: rebalancer_config)
      ~(price_scenarios: (asset * float) list)
    : rebalance_action option =

    let pool = collateral_mgr.pool in

    (* Calculate target allocation *)
    let (target_usd_pct, target_btc_pct) =
      calculate_dynamic_allocation collateral_mgr
        ~btc_price
        ~btc_volatility
        ~config
        ~price_scenarios
    in

    (* Calculate current allocation *)
    let (current_usd_pct, current_btc_pct) =
      calculate_current_allocation collateral_mgr ~btc_price
    in

    (* Calculate drift *)
    let drift = Float.abs (current_usd_pct -. target_usd_pct) in

    (* Check if rebalancing needed *)
    if drift < config.rebalance_threshold then
      None (* No rebalancing needed *)
    else
      let total_capital = cents_to_usd pool.total_capital_usd in
      let reserve_ratio = Collateral_manager.CollateralManager.calculate_reserve_ratio pool in
      let ltv = Collateral_manager.CollateralManager.calculate_ltv pool in

      let urgency = calculate_urgency drift reserve_ratio ltv in

      if current_usd_pct > target_usd_pct then
        (* Too much USD → Buy BTC *)
        let excess_usd = (current_usd_pct -. target_usd_pct) *. total_capital in

        (* Apply DCA if enabled *)
        let trade_amount =
          if config.dca_enabled then
            Float.min excess_usd (total_capital *. config.max_trade_size_pct)
          else
            excess_usd
        in

        let btc_to_buy = trade_amount /. btc_price in

        Some {
          action = `Buy_BTC trade_amount;
          usd_amount = trade_amount;
          btc_amount = btc_to_buy;
          reason = Printf.sprintf "Excess USD: %.2f%% > target %.2f%%"
            (current_usd_pct *. 100.0) (target_usd_pct *. 100.0);
          urgency;
          expected_benefit = drift *. total_capital *. btc_volatility;
        }

      else
        (* Too much BTC → Sell BTC *)
        let deficit_usd = (target_usd_pct -. current_usd_pct) *. total_capital in

        let btc_to_sell = deficit_usd /. btc_price in
        let current_btc = sats_to_btc pool.btc_float_sats in

        (* Check minimum float *)
        if (current_btc -. btc_to_sell) < config.min_btc_float then
          let max_sellable = Float.max 0.0 (current_btc -. config.min_btc_float) in
          let actual_usd = max_sellable *. btc_price in

          if max_sellable > 0.01 then
            Some {
              action = `Sell_BTC actual_usd;
              usd_amount = actual_usd;
              btc_amount = max_sellable;
              reason = Printf.sprintf "Insufficient USD: %.2f%% < target %.2f%% (min BTC limit)"
                (current_usd_pct *. 100.0) (target_usd_pct *. 100.0);
              urgency;
              expected_benefit = drift *. total_capital *. 0.5;
            }
          else
            None (* Can't sell - at minimum *)
        else
          (* Apply DCA *)
          let trade_amount =
            if config.dca_enabled then
              Float.min btc_to_sell (current_btc *. config.max_trade_size_pct)
            else
              btc_to_sell
          in

          let usd_received = trade_amount *. btc_price in

          Some {
            action = `Sell_BTC usd_received;
            usd_amount = usd_received;
            btc_amount = trade_amount;
            reason = Printf.sprintf "Insufficient USD: %.2f%% < target %.2f%%"
              (current_usd_pct *. 100.0) (target_usd_pct *. 100.0);
            urgency;
            expected_benefit = drift *. total_capital *. 0.5;
          }

  (** Execute rebalancing action **)
  let execute_rebalance
      (collateral_manager: Collateral_manager.CollateralManager.t ref)
      (action: rebalance_action)
      ~(btc_price: float)
    : unit =

    let pool = !collateral_manager.pool in

    match action.action with
    | `Buy_BTC usd_amount ->
        (* Convert USD → BTC *)
        let btc_sats = btc_to_sats action.btc_amount in
        let usd_cents = usd_to_cents usd_amount in

        let new_pool = {
          pool with
          btc_float_sats = Int64.(pool.btc_float_sats + btc_sats);
          btc_cost_basis_usd = Int64.(pool.btc_cost_basis_usd + usd_cents);
          usd_reserves = Int64.(pool.usd_reserves - usd_cents);
          last_rebalance_time = Unix.time ();
        } in

        collateral_manager := { !collateral_manager with pool = new_pool }

    | `Sell_BTC usd_amount ->
        (* Convert BTC → USD *)
        let btc_sats = btc_to_sats action.btc_amount in
        let usd_cents = usd_to_cents usd_amount in

        (* Calculate cost basis reduction (proportional) *)
        let cost_basis_reduction =
          if pool.btc_float_sats = 0L then 0L
          else
            Int64.(pool.btc_cost_basis_usd * btc_sats / pool.btc_float_sats)
        in

        let new_pool = {
          pool with
          btc_float_sats = Int64.(pool.btc_float_sats - btc_sats);
          btc_cost_basis_usd = Int64.(pool.btc_cost_basis_usd - cost_basis_reduction);
          usd_reserves = Int64.(pool.usd_reserves + usd_cents);
          last_rebalance_time = Unix.time ();
        } in

        collateral_manager := { !collateral_manager with pool = new_pool }

    | `Hold -> ()

  (** Get rebalancing statistics **)
  let get_rebalance_stats
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(btc_price: float)
    : (string * string) list =

    let pool = collateral_mgr.pool in

    let (current_usd_pct, current_btc_pct) =
      calculate_current_allocation collateral_mgr ~btc_price
    in

    let current_btc = sats_to_btc pool.btc_float_sats in
    let btc_value_usd = current_btc *. btc_price in
    let cost_basis = cents_to_usd pool.btc_cost_basis_usd in
    let unrealized_pnl = btc_value_usd -. cost_basis in
    let pnl_pct = if cost_basis > 0.0 then (unrealized_pnl /. cost_basis) *. 100.0 else 0.0 in

    [
      ("Current USD %", Printf.sprintf "%.2f%%" (current_usd_pct *. 100.0));
      ("Current BTC %", Printf.sprintf "%.2f%%" (current_btc_pct *. 100.0));
      ("BTC Holdings", Printf.sprintf "%.8f BTC" current_btc);
      ("BTC Value", Printf.sprintf "$%.2f" btc_value_usd);
      ("Cost Basis", Printf.sprintf "$%.2f" cost_basis);
      ("Unrealized P&L", Printf.sprintf "$%.2f (%.2f%%)" unrealized_pnl pnl_pct);
      ("Last Rebalance", Time.to_string (Time.of_float pool.last_rebalance_time));
    ]

  (** Main rebalancing loop **)
  let rebalance_loop
      ~(collateral_manager: Collateral_manager.CollateralManager.t ref)
      ~(config: rebalancer_config)
      ~(btc_price_provider: unit -> float Lwt.t)
      ~(btc_volatility_provider: unit -> float Lwt.t)
      ~(price_scenarios_provider: unit -> (asset * float) list Lwt.t)
    : unit Lwt.t =

    let rec loop () =
      let%lwt () =
        try%lwt
          Lwt_io.printlf "\n[%s] Checking rebalancing needs..."
            (Time.to_string (Time.now ())) >>= fun () ->

          (* Get market data *)
          let%lwt btc_price = btc_price_provider () in
          let%lwt btc_volatility = btc_volatility_provider () in
          let%lwt price_scenarios = price_scenarios_provider () in

          (* Generate action *)
          let action_opt = generate_rebalance_action !collateral_manager
            ~btc_price
            ~btc_volatility
            ~config
            ~price_scenarios
          in

          match action_opt with
          | None ->
              Lwt_io.printlf "✓ Allocation balanced - no action needed"

          | Some action ->
              let urgency_str = match action.urgency with
                | `Critical -> "🚨 CRITICAL"
                | `High -> "⚠️  HIGH"
                | `Medium -> "⚡ MEDIUM"
                | `Low -> "ℹ️  LOW"
              in

              Lwt_io.printlf "\n%s REBALANCE NEEDED:" urgency_str >>= fun () ->
              Lwt_io.printlf "  Action: %s"
                (match action.action with
                  | `Buy_BTC amt -> Printf.sprintf "Buy %.8f BTC ($%.2f)" action.btc_amount amt
                  | `Sell_BTC amt -> Printf.sprintf "Sell %.8f BTC ($%.2f)" action.btc_amount amt
                  | `Hold -> "Hold") >>= fun () ->
              Lwt_io.printlf "  Reason: %s" action.reason >>= fun () ->
              Lwt_io.printlf "  Expected benefit: $%.2f" action.expected_benefit >>= fun () ->

              (* Execute rebalance *)
              execute_rebalance collateral_manager action ~btc_price;

              Lwt_io.printlf "✓ Rebalance executed successfully"

        with exn ->
          Lwt_io.eprintlf "Error in rebalancer: %s" (Exn.to_string exn)
      in

      (* Print stats *)
      let%lwt btc_price = btc_price_provider () in
      let stats = get_rebalance_stats !collateral_manager ~btc_price in

      let%lwt () = Lwt_io.printlf "\n=== Float Status ===" in
      let%lwt () = Lwt_list.iter_s (fun (key, value) ->
        Lwt_io.printlf "%s: %s" key value
      ) stats in
      let%lwt () = Lwt_io.printlf "==================\n" in

      let%lwt () = Lwt_unix.sleep config.check_interval_seconds in
      loop ()
    in

    Lwt_io.printlf "\n╔════════════════════════════════════════╗" >>= fun () ->
    Lwt_io.printlf "║  Float Rebalancer Started              ║" >>= fun () ->
    Lwt_io.printlf "╚════════════════════════════════════════╝\n" >>= fun () ->
    Lwt_io.printlf "Check interval: %.0f seconds\n" config.check_interval_seconds >>= fun () ->

    loop ()

end
