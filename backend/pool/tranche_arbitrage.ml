(* Tranche Arbitrage Engine - Market Making for Virtual Tranches

   Automatically detects and captures arbitrage opportunities when
   tranche NAVs diverge from their risk-adjusted fair values.

   Key Concepts:
   1. Fair Value = Expected return for risk taken
   2. Mispricing = Current NAV vs Fair Value
   3. Arbitrage = Buy undervalued, sell overvalued

   Strategy:
   - Calculate fair value for each tranche based on risk contribution
   - Detect when market price (NAV) differs from fair value
   - Execute internal capital reallocation to capture spread
   - Optimize portfolio allocation for maximum Sharpe ratio

   Example:
   Junior tranche: NAV $0.90, Fair Value $0.95 → Buy (5.6% arbitrage)
   Senior tranche: NAV $1.05, Fair Value $1.02 → Sell (2.9% arbitrage)
   Net: Capture 8.5% spread by rotating capital
*)

open Core
open Types
open Math

module TrancheArbitrage = struct

  (** Fair value analysis for single tranche **)
  type fair_value_analysis = {
    tranche_id: int;
    tranche_name: string;

    (* Current market values *)
    current_nav: float;
    current_yield_bps: int;

    (* Risk metrics *)
    risk_contribution_pct: float;    (* % of total VaR from this tranche *)
    loss_absorption_capacity: float; (* % of losses this tranche can absorb *)
    expected_loss_rate: float;       (* Expected annual loss rate *)

    (* Fair value calculation *)
    fair_value_nav: float;
    fair_value_yield_bps: int;
    mispricing_pct: float;           (* (fair - current) / current *)

    (* Trading recommendation *)
    recommendation: [`Buy | `Sell | `Hold];
    confidence: float;               (* 0.0 to 1.0 *)
    expected_return: float;          (* Expected return from arbitrage *)
  } [@@deriving sexp, yojson]

  (** Arbitrage opportunity **)
  type arbitrage_opportunity = {
    from_tranche: int;
    to_tranche: int;
    amount: usd_cents;
    expected_profit: float;
    sharpe_improvement: float;
    reason: string;
  } [@@deriving sexp, yojson]

  (** Arbitrage configuration **)
  type arbitrage_config = {
    check_interval_seconds: float;
    min_mispricing_threshold: float; (* 0.02 = 2% minimum mispricing to trade *)
    max_reallocation_pct: float;     (* 0.20 = max 20% capital reallocation *)
    target_sharpe_ratio: float;      (* 1.5 = target Sharpe ratio *)
    risk_free_rate: float;           (* 0.05 = 5% risk-free rate *)
  } [@@deriving sexp]

  let default_config = {
    check_interval_seconds = 900.0; (* 15 minutes *)
    min_mispricing_threshold = 0.02;
    max_reallocation_pct = 0.20;
    target_sharpe_ratio = 1.5;
    risk_free_rate = 0.05;
  }

  (** Calculate risk contribution for each tranche **)
  let calculate_risk_contributions
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(total_var: float)
    : (int * float) list =

    let pool = collateral_mgr.pool in

    (* For each tranche, calculate its contribution to portfolio VaR *)
    List.map pool.virtual_tranches ~f:(fun tranche ->
      let tranche_capital = cents_to_usd tranche.allocated_capital in
      let total_capital = cents_to_usd pool.total_capital_usd in

      (* Risk contribution = (tranche_capital / total_capital) * seniority_weight *)
      (* Junior tranches contribute more to risk *)
      let seniority_weight = Float.of_int tranche.seniority in
      let base_contribution = tranche_capital /. total_capital in
      let risk_contribution = base_contribution *. seniority_weight in

      (tranche.tranche_id, risk_contribution)
    )

  (** Calculate expected loss rate for tranche **)
  let calculate_expected_loss_rate
      (tranche: Collateral_manager.CollateralManager.virtual_tranche)
      (pool: Collateral_manager.CollateralManager.unified_pool)
    : float =

    (* Calculate historical loss rate *)
    let losses = cents_to_usd tranche.accumulated_losses in
    let capital = cents_to_usd tranche.allocated_capital in

    if capital <= 0.0 then 0.0
    else
      let time_elapsed = Unix.time () -. pool.created_at in
      let years = time_elapsed /. (365.25 *. 86400.0) in

      if years < 0.01 then 0.0 (* Too early *)
      else losses /. capital /. years (* Annualized loss rate *)

  (** Calculate fair value for tranche based on risk-return **)
  let calculate_fair_value
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(tranche_id: int)
      ~(total_var: float)
      ~(config: arbitrage_config)
    : fair_value_analysis option =

    let pool = collateral_mgr.pool in

    let tranche_opt =
      List.find pool.virtual_tranches ~f:(fun t -> t.tranche_id = tranche_id)
    in

    match tranche_opt with
    | None -> None
    | Some tranche ->
        (* Current NAV *)
        let net_value =
          Int64.(tranche.allocated_capital - tranche.accumulated_losses + tranche.accumulated_yields)
        in

        let current_nav =
          if tranche.lp_token_supply = 0L then 1.0
          else cents_to_usd net_value /. Int64.to_float tranche.lp_token_supply
        in

        (* Risk contribution *)
        let risk_contributions = calculate_risk_contributions collateral_mgr ~total_var in
        let risk_contribution =
          List.Assoc.find risk_contributions tranche_id ~equal:Int.equal
          |> Option.value ~default:0.0
        in

        (* Loss absorption capacity (based on seniority) *)
        let total_tranches = List.length pool.virtual_tranches in
        let loss_absorption = Float.of_int tranche.seniority /. Float.of_int total_tranches in

        (* Expected loss rate *)
        let expected_loss_rate = calculate_expected_loss_rate tranche pool in

        (* Fair value yield = risk_free_rate + risk_premium *)
        (* Risk premium based on risk contribution and loss absorption *)
        let risk_premium =
          config.risk_free_rate +.
          (risk_contribution *. 0.20) +.        (* 20% yield per unit of risk *)
          (loss_absorption *. 0.15) +.          (* 15% yield per unit of loss exposure *)
          (expected_loss_rate *. 2.0)           (* 2x expected losses *)
        in

        let fair_yield = config.risk_free_rate +. risk_premium in
        let fair_yield_bps = Float.to_int (fair_yield *. 10000.0) in

        (* Fair value NAV = current NAV adjusted for yield differential *)
        let current_yield = Float.of_int tranche.target_yield_bps /. 10000.0 in
        let yield_diff = fair_yield -. current_yield in

        (* NAV adjustment based on yield differential *)
        (* If fair yield > current yield, tranche is underpriced *)
        let fair_nav = current_nav *. (1.0 +. yield_diff) in

        (* Mispricing *)
        let mispricing_pct =
          if current_nav > 0.0 then
            (fair_nav -. current_nav) /. current_nav
          else 0.0
        in

        (* Recommendation *)
        let recommendation =
          if mispricing_pct > config.min_mispricing_threshold then `Buy
          else if mispricing_pct < -.config.min_mispricing_threshold then `Sell
          else `Hold
        in

        (* Confidence based on data quality *)
        let time_elapsed = Unix.time () -. pool.created_at in
        let days_elapsed = time_elapsed /. 86400.0 in
        let confidence = Float.min 1.0 (days_elapsed /. 90.0) in (* Max confidence after 90 days *)

        (* Expected return from arbitrage *)
        let expected_return = Float.abs mispricing_pct *. confidence in

        Some {
          tranche_id;
          tranche_name = tranche.name;
          current_nav;
          current_yield_bps = tranche.target_yield_bps;
          risk_contribution_pct = risk_contribution *. 100.0;
          loss_absorption_capacity = loss_absorption *. 100.0;
          expected_loss_rate = expected_loss_rate *. 100.0;
          fair_value_nav = fair_nav;
          fair_value_yield_bps = fair_yield_bps;
          mispricing_pct = mispricing_pct *. 100.0;
          recommendation;
          confidence;
          expected_return = expected_return *. 100.0;
        }

  (** Scan all tranches for arbitrage opportunities **)
  let scan_arbitrage_opportunities
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(total_var: float)
      ~(config: arbitrage_config)
    : fair_value_analysis list =

    let pool = collateral_mgr.pool in

    List.filter_map pool.virtual_tranches ~f:(fun tranche ->
      calculate_fair_value collateral_mgr
        ~tranche_id:tranche.tranche_id
        ~total_var
        ~config
    )

  (** Find best arbitrage pairs **)
  let find_arbitrage_pairs
      (analyses: fair_value_analysis list)
      ~(config: arbitrage_config)
    : arbitrage_opportunity list =

    (* Find overvalued (sell) and undervalued (buy) tranches *)
    let overvalued =
      List.filter analyses ~f:(fun a ->
        Poly.equal a.recommendation `Sell &&
        Float.abs a.mispricing_pct > config.min_mispricing_threshold *. 100.0
      )
    in

    let undervalued =
      List.filter analyses ~f:(fun a ->
        Poly.equal a.recommendation `Buy &&
        a.mispricing_pct > config.min_mispricing_threshold *. 100.0
      )
    in

    (* Generate arbitrage pairs *)
    List.concat_map overvalued ~f:(fun sell_tranche ->
      List.map undervalued ~f:(fun buy_tranche ->
        let spread = buy_tranche.mispricing_pct +. Float.abs sell_tranche.mispricing_pct in
        let avg_confidence = (buy_tranche.confidence +. sell_tranche.confidence) /. 2.0 in

        {
          from_tranche = sell_tranche.tranche_id;
          to_tranche = buy_tranche.tranche_id;
          amount = 0L; (* Will be calculated based on available capital *)
          expected_profit = spread *. avg_confidence;
          sharpe_improvement = spread *. 0.1; (* Approximate *)
          reason = Printf.sprintf "Sell %s (%.2f%% overvalued) → Buy %s (%.2f%% undervalued)"
            sell_tranche.tranche_name
            (Float.abs sell_tranche.mispricing_pct)
            buy_tranche.tranche_name
            buy_tranche.mispricing_pct;
        }
      )
    )
    |> List.sort ~compare:(fun a b ->
        Float.compare b.expected_profit a.expected_profit
      )

  (** Calculate optimal amount to reallocate **)
  let calculate_optimal_amount
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(from_tranche: int)
      ~(to_tranche: int)
      ~(config: arbitrage_config)
    : usd_cents =

    let pool = collateral_mgr.pool in

    let from_tranche_opt =
      List.find pool.virtual_tranches ~f:(fun t -> t.tranche_id = from_tranche)
    in

    match from_tranche_opt with
    | None -> 0L
    | Some tranche ->
        let available_capital = Int64.(tranche.allocated_capital - tranche.accumulated_losses) in
        let max_realloc = Float.to_int64 (
          cents_to_usd available_capital *. config.max_reallocation_pct
        ) in

        Int64.min available_capital max_realloc

  (** Execute internal capital reallocation **)
  let execute_arbitrage
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(opportunity: arbitrage_opportunity)
    : Collateral_manager.CollateralManager.t =

    let pool = collateral_mgr.pool in

    (* Find tranches *)
    let from_tranche_opt =
      List.find pool.virtual_tranches ~f:(fun t -> t.tranche_id = opportunity.from_tranche)
    in

    let to_tranche_opt =
      List.find pool.virtual_tranches ~f:(fun t -> t.tranche_id = opportunity.to_tranche)
    in

    match (from_tranche_opt, to_tranche_opt) with
    | (Some from_t, Some to_t) ->
        (* Update from tranche *)
        let updated_from = {
          from_t with
          allocated_capital = Int64.(from_t.allocated_capital - opportunity.amount);
        } in

        (* Update to tranche *)
        let updated_to = {
          to_t with
          allocated_capital = Int64.(to_t.allocated_capital + opportunity.amount);
        } in

        (* Update tranches list *)
        let updated_tranches =
          List.map pool.virtual_tranches ~f:(fun t ->
            if t.tranche_id = opportunity.from_tranche then updated_from
            else if t.tranche_id = opportunity.to_tranche then updated_to
            else t
          )
        in

        let new_pool = { pool with virtual_tranches = updated_tranches } in

        { collateral_mgr with pool = new_pool }

    | _ -> collateral_mgr (* Tranches not found, no change *)

  (** Calculate portfolio Sharpe ratio **)
  let calculate_portfolio_sharpe
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(config: arbitrage_config)
    : float =

    let pool = collateral_mgr.pool in

    (* Calculate weighted portfolio return and risk *)
    let total_capital = cents_to_usd pool.total_capital_usd in

    if total_capital <= 0.0 then 0.0
    else
      let (weighted_return, weighted_variance) =
        List.fold pool.virtual_tranches ~init:(0.0, 0.0) ~f:(fun (ret_acc, var_acc) tranche ->
          let weight = cents_to_usd tranche.allocated_capital /. total_capital in
          let tranche_return = Float.of_int tranche.target_yield_bps /. 10000.0 in

          (* Risk proxy: higher seniority = lower risk *)
          let tranche_risk = 0.05 +. (Float.of_int tranche.seniority *. 0.05) in
          let tranche_variance = tranche_risk *. tranche_risk in

          (ret_acc +. (weight *. tranche_return),
           var_acc +. (weight *. weight *. tranche_variance))
        )
      in

      let portfolio_std = Float.sqrt weighted_variance in

      if portfolio_std > 0.0 then
        (weighted_return -. config.risk_free_rate) /. portfolio_std
      else
        0.0

  (** Optimize tranche allocation for maximum Sharpe ratio **)
  let optimize_tranche_allocation
      (collateral_mgr: Collateral_manager.CollateralManager.t)
      ~(config: arbitrage_config)
    : (int * float) list =

    let pool = collateral_mgr.pool in

    (* Simple optimization: allocate more to high Sharpe tranches *)
    let tranche_sharpes =
      List.map pool.virtual_tranches ~f:(fun tranche ->
        let tranche_return = Float.of_int tranche.target_yield_bps /. 10000.0 in
        let tranche_risk = 0.05 +. (Float.of_int tranche.seniority *. 0.05) in
        let sharpe = (tranche_return -. config.risk_free_rate) /. tranche_risk in

        (tranche.tranche_id, sharpe)
      )
    in

    (* Normalize to percentages *)
    let total_sharpe = List.fold tranche_sharpes ~init:0.0 ~f:(fun acc (_, s) ->
      acc +. Float.max 0.0 s
    ) in

    if total_sharpe <= 0.0 then
      (* Equal allocation if no positive Sharpe *)
      List.map pool.virtual_tranches ~f:(fun t ->
        (t.tranche_id, 1.0 /. Float.of_int (List.length pool.virtual_tranches))
      )
    else
      List.map tranche_sharpes ~f:(fun (id, sharpe) ->
        (id, Float.max 0.0 sharpe /. total_sharpe)
      )

  (** Main arbitrage loop **)
  let arbitrage_loop
      ~(collateral_manager: Collateral_manager.CollateralManager.t ref)
      ~(config: arbitrage_config)
      ~(var_provider: unit -> float Lwt.t)
    : unit Lwt.t =

    let rec loop () =
      let%lwt () =
        try%lwt
          Lwt_io.printlf "\n[%s] Scanning for tranche arbitrage..."
            (Time.to_string (Time.now ())) >>= fun () ->

          (* Get current VaR *)
          let%lwt total_var = var_provider () in

          (* Scan for opportunities *)
          let analyses = scan_arbitrage_opportunities !collateral_manager
            ~total_var
            ~config
          in

          (* Log fair value analysis *)
          let%lwt () = Lwt_io.printlf "\n=== Tranche Fair Values ===" in
          let%lwt () = Lwt_list.iter_s (fun analysis ->
            Lwt_io.printlf "%s (ID: %d):"
              analysis.tranche_name analysis.tranche_id >>= fun () ->
            Lwt_io.printlf "  Current NAV: $%.4f | Fair NAV: $%.4f"
              analysis.current_nav analysis.fair_value_nav >>= fun () ->
            Lwt_io.printlf "  Mispricing: %.2f%% | Recommendation: %s"
              analysis.mispricing_pct
              (match analysis.recommendation with
                | `Buy -> "BUY ⬆️"
                | `Sell -> "SELL ⬇️"
                | `Hold -> "HOLD ➡️") >>= fun () ->
            Lwt_io.printlf "  Risk: %.2f%% | Loss Absorption: %.2f%%"
              analysis.risk_contribution_pct
              analysis.loss_absorption_capacity >>= fun () ->
            Lwt_io.printlf ""
          ) analyses in

          (* Find arbitrage pairs *)
          let opportunities = find_arbitrage_pairs analyses ~config in

          match opportunities with
          | [] ->
              Lwt_io.printlf "✓ No arbitrage opportunities detected\n"

          | opp :: _ ->
              (* Take best opportunity *)
              Lwt_io.printlf "\n💰 ARBITRAGE OPPORTUNITY FOUND:" >>= fun () ->
              Lwt_io.printlf "  %s" opp.reason >>= fun () ->
              Lwt_io.printlf "  Expected profit: %.2f%%" opp.expected_profit >>= fun () ->

              (* Calculate optimal amount *)
              let amount = calculate_optimal_amount !collateral_manager
                ~from_tranche:opp.from_tranche
                ~to_tranche:opp.to_tranche
                ~config
              in

              let opp_with_amount = { opp with amount } in

              Lwt_io.printlf "  Amount: $%s" (Int64.to_string_hum ~delimiter:',' amount) >>= fun () ->

              (* Execute arbitrage *)
              collateral_manager := execute_arbitrage !collateral_manager ~opportunity:opp_with_amount;

              Lwt_io.printlf "✓ Arbitrage executed successfully\n"

        with exn ->
          Lwt_io.eprintlf "Error in arbitrage engine: %s" (Exn.to_string exn)
      in

      (* Calculate and display portfolio Sharpe *)
      let sharpe = calculate_portfolio_sharpe !collateral_manager ~config in
      let%lwt () = Lwt_io.printlf "Portfolio Sharpe Ratio: %.2f (target: %.2f)\n"
        sharpe config.target_sharpe_ratio
      in

      let%lwt () = Lwt_unix.sleep config.check_interval_seconds in
      loop ()
    in

    Lwt_io.printlf "\n╔════════════════════════════════════════╗" >>= fun () ->
    Lwt_io.printlf "║  Tranche Arbitrage Engine Started     ║" >>= fun () ->
    Lwt_io.printlf "╚════════════════════════════════════════╝\n" >>= fun () ->
    Lwt_io.printlf "Check interval: %.0f seconds\n" config.check_interval_seconds >>= fun () ->

    loop ()

end
