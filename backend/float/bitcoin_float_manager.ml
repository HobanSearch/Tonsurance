(* Bitcoin Float Manager - The Core Innovation

   This module manages the Bitcoin float strategy that enables constant yields.

   The Problem:
   - BTC holders want 6% yield in BTC terms
   - As BTC appreciates, USD cost of yield increases
   - Traditional model: Yields decline (6% → 2% → 0%)

   The Solution:
   - Hold reserves in Bitcoin (not just USD)
   - As BTC appreciates, reserves appreciate too
   - Can maintain constant 6% yields indefinitely

   Strategy:
   - Target allocation: 40% USD, 60% BTC
   - Rebalance when drift >10%
   - Accumulate BTC during surplus periods
   - Use BTC float during shortfall periods

   This is inspired by Berkshire Hathaway's float strategy:
   - Collect premiums (float)
   - Invest float (we choose BTC)
   - Float appreciates over time
   - Enables long-term value creation
*)

open Core
open Types
open Math

module BitcoinFloatManager = struct

  (** Vault state for Bitcoin float management *)
  type vault_state = {
    total_capital_usd: usd_cents;
    btc_float_sats: int64;
    btc_float_value_usd: usd_cents;
    usd_reserves: usd_cents;
    collateral_positions: unit list; (* Placeholder *)
    active_policies: unit list; (* Placeholder *)
    total_coverage_sold: usd_cents;
  }

  (** Allocation strategy parameters *)
  module AllocationStrategy = struct

    type allocation_rule = {
      min_float_btc: float;        (* Minimum BTC to keep as buffer *)
      max_float_btc: float;        (* Maximum BTC to accumulate *)
      target_usd_pct: float;       (* Target % in USD vs BTC *)
      rebalance_threshold: float;  (* When to rebalance (as % drift) *)
      dca_enabled: bool;           (* Use dollar-cost averaging? *)
      dca_frequency_hours: int;    (* DCA purchase frequency *)
    } [@@deriving sexp]

    (** Default allocation rules *)
    let default_rule = {
      min_float_btc = 50.0;            (* Always keep >=50 BTC *)
      max_float_btc = 10_000.0;        (* Cap at 10,000 BTC *)
      target_usd_pct = 0.40;           (* 40% USD, 60% BTC *)
      rebalance_threshold = 0.10;      (* Rebalance if >10% drift *)
      dca_enabled = true;              (* Use DCA for accumulation *)
      dca_frequency_hours = 24;        (* Daily DCA *)
    }

    (** Calculate optimal allocation given current state *)
    let calculate_allocation
        ~(premiums_collected: usd_cents)
        ~(required_yield_usd: usd_cents)
        ~(claims_reserve: usd_cents)
        ~(rule: allocation_rule)
      : (usd_cents * usd_cents) = (* (to_usd, to_btc) *)

      (* Available after yields and reserves *)
      let available =
        Int64.(premiums_collected - (required_yield_usd + claims_reserve))
      in

      if Int64.(available <= 0L) then
        (available, 0L) (* No surplus, may need to use float *)
      else
        (* Split according to target allocation *)
        let available_float = cents_to_usd available in
        let to_usd = available_float *. rule.target_usd_pct in
        let to_btc = available_float *. (1.0 -. rule.target_usd_pct) in

        (usd_to_cents to_usd, usd_to_cents to_btc)

    (** Check if rebalancing is needed *)
    let needs_rebalancing
        (vault: vault_state)
        (rule: allocation_rule)
      : bool =

      let total_reserves = Int64.(vault.usd_reserves + vault.btc_float_value_usd) in

      if Int64.(total_reserves = 0L) then false
      else
        let usd_pct =
          cents_to_usd vault.usd_reserves /.
          cents_to_usd total_reserves
        in

        let drift = Float.abs (usd_pct -. rule.target_usd_pct) in
        Float.(drift > rule.rebalance_threshold)

  end

  (** Trading engine - generates buy/sell signals *)
  module TradingEngine = struct

    type trade_signal =
      | BuyBTC of float  (* USD amount to spend *)
      | SellBTC of float (* BTC amount to sell *)
      | Hold
    [@@deriving sexp]

    type trade_execution = {
      signal: trade_signal;
      btc_price: float;
      btc_amount: float;
      usd_amount: float;
      timestamp: float;
      reason: string;
    } [@@deriving sexp]

    (** Hedge position tracking *)
    type hedge_position = {
      binance_position_id: string;
      btc_amount: float;
      entry_price: float;
      unrealized_pnl: float;
      opened_at: float;
    } [@@deriving sexp]

    type hedge_state = {
      active_hedge: hedge_position option;
      total_hedged_btc: float;
      hedge_history: trade_execution list;
    } [@@deriving sexp]

    let empty_hedge_state = {
      active_hedge = None;
      total_hedged_btc = 0.0;
      hedge_history = [];
    }

    (** Generate trading signal based on current state *)
    let generate_signal
        (vault: vault_state)
        ~(btc_price: float)
        ~(rule: AllocationStrategy.allocation_rule)
      : trade_signal =

      let current_btc = sats_to_btc vault.btc_float_sats in
      let total_reserves = Int64.(vault.usd_reserves + vault.btc_float_value_usd) in

      if Int64.(total_reserves = 0L) then Hold
      else
        let current_usd_pct =
          cents_to_usd vault.usd_reserves /.
          cents_to_usd total_reserves
        in

        (* Check if rebalancing needed *)
        if AllocationStrategy.needs_rebalancing vault rule then
          if Float.O.(current_usd_pct > rule.target_usd_pct) then
            (* Too much USD, buy BTC *)
            let excess_usd =
              (current_usd_pct -. rule.target_usd_pct) *.
              cents_to_usd total_reserves
            in
            BuyBTC excess_usd
          else
            (* Too much BTC, sell some *)
            let excess_btc =
              ((rule.target_usd_pct -. current_usd_pct) *.
               cents_to_usd total_reserves) /. btc_price
            in

            (* Don't sell below minimum float *)
            if Float.O.(current_btc -. excess_btc < rule.min_float_btc) then
              Hold
            else
              SellBTC excess_btc
        else
          Hold

    (** Execute trade using Binance Futures (REAL INTEGRATION) *)
    let execute_trade_with_hedge
        (signal: trade_signal)
        (vault: vault_state)
        ~(btc_price: float)
        ~(reason: string)
        ~(binance_config: Integration.Binance_futures_client.BinanceFuturesClient.config)
        ~(hedge_state: hedge_state)
      : (vault_state * trade_execution option * hedge_state, string) Result.t Lwt.t =
      let open Lwt.Syntax in

      match signal with
      | BuyBTC usd_amount ->
          if Float.O.(usd_amount <= 0.0) then Lwt.return (Ok (vault, None, hedge_state))
          else
            let btc_amount = usd_amount /. btc_price in
            let btc_sats = btc_to_sats btc_amount in
            let usd_cents = usd_to_cents usd_amount in

            (* Open short hedge on Binance Futures *)
            let%lwt hedge_result = Integration.Binance_futures_client.BinanceFuturesClient.open_short
              ~config:binance_config
              ~symbol:"BTCUSDT"
              ~quantity:btc_amount
              ~leverage:5  (* Use 5x leverage for hedging *)
            in

            (match hedge_result with
            | Error e ->
                let err_msg = Integration.Binance_futures_client.BinanceFuturesClient.error_to_string e in
                let%lwt () = Logs_lwt.warn (fun m ->
                  m "Failed to open hedge position: %s (continuing without hedge)" err_msg
                ) in

                (* Continue without hedge *)
                let new_vault = {
                  vault with
                  btc_float_sats = Int64.(vault.btc_float_sats + btc_sats);
                  btc_float_value_usd = Int64.(vault.btc_float_value_usd + usd_cents);
                  usd_reserves = Int64.(vault.usd_reserves - usd_cents);
                } in

                let execution = {
                  signal;
                  btc_price;
                  btc_amount;
                  usd_amount;
                  timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
                  reason = reason ^ " (hedge failed)";
                } in

                Lwt.return (Ok (new_vault, Some execution, hedge_state))

            | Ok position ->
                let%lwt () = Logs_lwt.info (fun m ->
                  m "Hedge opened: %.8f BTC short @ $%.2f (position: %s)"
                    btc_amount position.entry_price position.position_id
                ) in

                (* Update vault state *)
                let new_vault = {
                  vault with
                  btc_float_sats = Int64.(vault.btc_float_sats + btc_sats);
                  btc_float_value_usd = Int64.(vault.btc_float_value_usd + usd_cents);
                  usd_reserves = Int64.(vault.usd_reserves - usd_cents);
                } in

                let execution = {
                  signal;
                  btc_price;
                  btc_amount;
                  usd_amount;
                  timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
                  reason = reason ^ " (hedged)";
                } in

                (* Update hedge state *)
                let hedge_pos = {
                  binance_position_id = position.position_id;
                  btc_amount;
                  entry_price = position.entry_price;
                  unrealized_pnl = position.unrealized_pnl;
                  opened_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
                } in

                let new_hedge_state = {
                  active_hedge = Some hedge_pos;
                  total_hedged_btc = hedge_state.total_hedged_btc +. btc_amount;
                  hedge_history = execution :: hedge_state.hedge_history;
                } in

                Lwt.return (Ok (new_vault, Some execution, new_hedge_state))
            )

      | SellBTC btc_amount ->
          if Float.O.(btc_amount <= 0.0) then Lwt.return (Ok (vault, None, hedge_state))
          else
            let btc_sats = btc_to_sats btc_amount in
            let usd_amount = btc_amount *. btc_price in
            let usd_cents = usd_to_cents usd_amount in

            (* Close hedge position if active *)
            let%lwt (hedge_pnl_opt, new_hedge_state) = match hedge_state.active_hedge with
            | None ->
                Lwt.return (None, hedge_state)
            | Some hedge_pos ->
                let%lwt close_result = Integration.Binance_futures_client.BinanceFuturesClient.close_position
                  ~config:binance_config
                  ~position_id:hedge_pos.binance_position_id
                in

                match close_result with
                | Error e ->
                    let%lwt () = Logs_lwt.warn (fun m ->
                      m "Failed to close hedge: %s"
                        (Integration.Binance_futures_client.BinanceFuturesClient.error_to_string e)
                    ) in
                    Lwt.return (None, hedge_state)
                | Ok pnl ->
                    let%lwt () = Logs_lwt.info (fun m ->
                      m "Hedge closed: realized PnL = $%.2f, fees = $%.2f, net = $%.2f"
                        pnl.realized_pnl pnl.fees pnl.net_pnl
                    ) in
                    let updated_state = {
                      active_hedge = None;
                      total_hedged_btc = hedge_state.total_hedged_btc;
                      hedge_history = hedge_state.hedge_history;
                    } in
                    Lwt.return (Some pnl, updated_state)
            in

            (* Update vault state *)
            let new_vault = {
              vault with
              btc_float_sats = Int64.(vault.btc_float_sats - btc_sats);
              btc_float_value_usd = Int64.(vault.btc_float_value_usd - usd_cents);
              usd_reserves = Int64.(vault.usd_reserves + usd_cents);
            } in

            let reason_with_pnl = match hedge_pnl_opt with
            | Some pnl -> Printf.sprintf "%s (hedge PnL: $%.2f)" reason pnl.net_pnl
            | None -> reason
            in

            let execution = {
              signal;
              btc_price;
              btc_amount;
              usd_amount;
              timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
              reason = reason_with_pnl;
            } in

            Lwt.return (Ok (new_vault, Some execution, new_hedge_state))

      | Hold ->
          Lwt.return (Ok (vault, None, hedge_state))

    (** Execute trade (legacy, without hedging) *)
    let execute_trade
        (signal: trade_signal)
        (vault: vault_state)
        ~(btc_price: float)
        ~(reason: string)
      : vault_state * trade_execution option =

      match signal with
      | BuyBTC usd_amount ->
          if Float.O.(usd_amount <= 0.0) then (vault, None)
          else
            let btc_amount = usd_amount /. btc_price in
            let btc_sats = btc_to_sats btc_amount in
            let usd_cents = usd_to_cents usd_amount in

            (* Update vault state *)
            let new_vault = {
              vault with
              btc_float_sats = Int64.(vault.btc_float_sats + btc_sats);
              btc_float_value_usd = Int64.(vault.btc_float_value_usd + usd_cents);
              usd_reserves = Int64.(vault.usd_reserves - usd_cents);
            } in

            let execution = {
              signal;
              btc_price;
              btc_amount;
              usd_amount;
              timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
              reason;
            } in

            (new_vault, Some execution)

      | SellBTC btc_amount ->
          if Float.O.(btc_amount <= 0.0) then (vault, None)
          else
            let btc_sats = btc_to_sats btc_amount in
            let usd_amount = btc_amount *. btc_price in
            let usd_cents = usd_to_cents usd_amount in

            (* Update vault state *)
            let new_vault = {
              vault with
              btc_float_sats = Int64.(vault.btc_float_sats - btc_sats);
              btc_float_value_usd = Int64.(vault.btc_float_value_usd - usd_cents);
              usd_reserves = Int64.(vault.usd_reserves + usd_cents);
            } in

            let execution = {
              signal;
              btc_price;
              btc_amount;
              usd_amount;
              timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
              reason;
            } in

            (new_vault, Some execution)

      | Hold ->
          (vault, None)

    (** Dollar-cost averaging strategy *)
    let dca_strategy
        ~(weekly_amount: float)
        ~(weeks: int)
        ~(btc_price_function: int -> float) (* Function: week -> price *)
      : float =

      (* Simulate DCA accumulation *)
      let rec accumulate week total_btc =
        if week >= weeks then total_btc
        else
          let price = btc_price_function week in
          let btc_bought = weekly_amount /. price in
          accumulate (week + 1) (total_btc +. btc_bought)
      in

      accumulate 0 0.0

  end

  (** Yield sustainability calculator *)
  module YieldSustainability = struct

    (** Calculate how many years float can sustain yields *)
    let sustainability_period
        (vault: vault_state)
        ~(btc_price: float)
        ~(required_annual_yield_btc: float)
        ~(annual_premiums_usd: float)
      : int =

      let btc_float = sats_to_btc vault.btc_float_sats in
      let btc_float_value = btc_float *. btc_price in

      (* Annual shortfall (negative = surplus) *)
      let required_yield_usd = required_annual_yield_btc *. btc_price in
      let shortfall = required_yield_usd -. annual_premiums_usd in

      if Float.O.(shortfall <= 0.0) then Int.max_value (* Sustainable indefinitely *)
      else
        (* How many years can we cover from float? *)
        let years = btc_float_value /. shortfall in
        Float.to_int years

    (** Simulate BTC float accumulation over time *)
    let simulate_float_accumulation
        ~(initial_vault: vault_state)
        ~(annual_premiums: float)
        ~(annual_btc_appreciation: float)
        ~(target_btc_yield: float) (* e.g., 60 BTC per year for 1000 BTC deposited *)
        ~(years: int)
      : (int * float * float * float) list = (* (year, btc_float, btc_value, btc_price) *)

      let rec simulate year btc_float btc_price acc =
        if year >= years then List.rev acc
        else
          (* BTC appreciates *)
          let new_price = btc_price *. (1.0 +. annual_btc_appreciation) in

          (* Required yield in USD (increases with BTC price) *)
          let required_yield_usd = target_btc_yield *. new_price in

          (* Calculate surplus/shortfall *)
          let surplus = annual_premiums -. required_yield_usd in

          (* Adjust BTC float *)
          let new_btc_float =
            if Float.O.(surplus > 0.0) then
              (* Surplus: Buy more BTC *)
              btc_float +. (surplus /. new_price)
            else
              (* Shortfall: Use float to cover *)
              let shortfall_btc = Float.abs surplus /. new_price in
              btc_float -. shortfall_btc
          in

          let btc_value = new_btc_float *. new_price in

          let result = (year + 1, new_btc_float, btc_value, new_price) in
          simulate (year + 1) new_btc_float new_price (result :: acc)
      in

      let initial_btc = sats_to_btc initial_vault.btc_float_sats in
      let initial_price = 50_000.0 in (* Starting price assumption *)

      simulate 0 initial_btc initial_price []

    (** Calculate break-even BTC price
        (At what BTC price do we need to start using float?) *)
    let break_even_btc_price
        ~(annual_premiums: float)
        ~(target_btc_yield: float)
      : float =

      (* Break-even when: annual_premiums = target_btc_yield * btc_price *)
      annual_premiums /. target_btc_yield

  end

  (** Rebalancing scheduler *)
  module RebalanceScheduler = struct

    type rebalance_recommendation = {
      should_rebalance: bool;
      signal: TradingEngine.trade_signal;
      urgency: [`Low | `Medium | `High | `Critical];
      reason: string;
      estimated_cost_usd: float;
    } [@@deriving sexp]

    (** Determine rebalancing urgency *)
    let calculate_urgency
        (vault: vault_state)
        ~(rule: AllocationStrategy.allocation_rule)
      : [`Low | `Medium | `High | `Critical] =

      let total_reserves = Int64.(vault.usd_reserves + vault.btc_float_value_usd) in

      if Int64.(total_reserves = 0L) then `Low
      else
        let current_usd_pct =
          cents_to_usd vault.usd_reserves /.
          cents_to_usd total_reserves
        in

        let drift = Float.abs (current_usd_pct -. rule.target_usd_pct) in

        if Float.O.(drift > 0.25) then `Critical      (* >25% drift *)
        else if Float.O.(drift > 0.18) then `High     (* >18% drift *)
        else if Float.O.(drift > 0.12) then `Medium   (* >12% drift *)
        else `Low

    (** Generate rebalancing recommendation *)
    let recommend_rebalance
        (vault: vault_state)
        ~(btc_price: float)
        ~(rule: AllocationStrategy.allocation_rule)
      : rebalance_recommendation =

      let signal = TradingEngine.generate_signal vault ~btc_price ~rule in
      let should_rebalance =
        AllocationStrategy.needs_rebalancing vault rule &&
        (match signal with Hold -> false | _ -> true)
      in

      let urgency = calculate_urgency vault ~rule in

      let (reason, estimated_cost) = match signal with
        | TradingEngine.BuyBTC usd_amount ->
            (Printf.sprintf "Over-allocated to USD (%.1f%% drift)"
               (Float.abs (cents_to_usd vault.usd_reserves /.
                          cents_to_usd Int64.(vault.usd_reserves + vault.btc_float_value_usd) -.
                          rule.target_usd_pct) *. 100.0),
             usd_amount *. 0.001) (* Assume 0.1% trading fee *)

        | TradingEngine.SellBTC btc_amount ->
            let usd_value = btc_amount *. btc_price in
            (Printf.sprintf "Under-allocated to USD (%.1f%% drift)"
               (Float.abs (cents_to_usd vault.usd_reserves /.
                          cents_to_usd Int64.(vault.usd_reserves + vault.btc_float_value_usd) -.
                          rule.target_usd_pct) *. 100.0),
             usd_value *. 0.001)

        | TradingEngine.Hold ->
            ("No rebalancing needed", 0.0)
      in

      {
        should_rebalance;
        signal;
        urgency;
        reason;
        estimated_cost_usd = estimated_cost;
      }

  end

  (** Performance tracking *)
  module PerformanceTracker = struct

    type performance_metrics = {
      total_btc_accumulated: float;
      current_btc_value_usd: float;
      total_cost_basis_usd: float;
      unrealized_gain_usd: float;
      unrealized_gain_pct: float;
      average_purchase_price: float;
      years_of_yield_coverage: int;
    } [@@deriving sexp]

    (** Calculate performance metrics *)
    let calculate_performance
        (vault: vault_state)
        ~(btc_price: float)
        ~(total_btc_purchased_usd: float)
        ~(annual_premiums: float)
        ~(required_annual_yield_btc: float)
      : performance_metrics =

      let total_btc = sats_to_btc vault.btc_float_sats in
      let current_value = total_btc *. btc_price in

      let unrealized_gain = current_value -. total_btc_purchased_usd in
      let unrealized_gain_pct =
        if Float.O.(total_btc_purchased_usd > 0.0) then
          (unrealized_gain /. total_btc_purchased_usd) *. 100.0
        else 0.0
      in

      let avg_price =
        if Float.O.(total_btc > 0.0) then
          total_btc_purchased_usd /. total_btc
        else 0.0
      in

      let years_coverage =
        YieldSustainability.sustainability_period
          vault
          ~btc_price
          ~required_annual_yield_btc
          ~annual_premiums_usd:annual_premiums
      in

      {
        total_btc_accumulated = total_btc;
        current_btc_value_usd = current_value;
        total_cost_basis_usd = total_btc_purchased_usd;
        unrealized_gain_usd = unrealized_gain;
        unrealized_gain_pct;
        average_purchase_price = avg_price;
        years_of_yield_coverage = years_coverage;
      }

  end

end

(* TODO: Move Tests module to separate test file
(** Unit tests *)
module Tests = struct
  open Alcotest
  open BitcoinFloatManager

  let test_allocation_calculation () =
    let rule = AllocationStrategy.default_rule in

    let (to_usd, to_btc) = AllocationStrategy.calculate_allocation
      ~premiums_collected:(Math.usd_to_cents 5_000_000.0)
      ~required_yield_usd:(Math.usd_to_cents 3_000_000.0)
      ~claims_reserve:(Math.usd_to_cents 1_000_000.0)
      ~rule
    in

    (* Available: $5M - $3M - $1M = $1M *)
    (* Should split: 40% USD ($400k), 60% BTC ($600k) *)
    let to_usd_float = Math.cents_to_usd to_usd in
    let to_btc_float = Math.cents_to_usd to_btc in

    check bool "USD allocation ~40%"
      (to_usd_float > 350_000.0 && to_usd_float < 450_000.0) true;
    check bool "BTC allocation ~60%"
      (to_btc_float > 550_000.0 && to_btc_float < 650_000.0) true

  let test_rebalancing_signal () =
    let rule = AllocationStrategy.default_rule in

    (* Vault with too much USD *)
    let vault = {
      total_capital_usd = Math.usd_to_cents 100_000_000.0;
      btc_float_sats = Math.btc_to_sats 100.0;
      btc_float_value_usd = Math.usd_to_cents 5_000_000.0;  (* 5% in BTC *)
      usd_reserves = Math.usd_to_cents 95_000_000.0;         (* 95% in USD *)
      collateral_positions = [];
      active_policies = [];
      total_coverage_sold = Math.usd_to_cents 50_000_000.0;
    } in

    let signal = TradingEngine.generate_signal vault
      ~btc_price:50_000.0
      ~rule
    in

    (* Should signal to buy BTC *)
    match signal with
    | TradingEngine.BuyBTC amount ->
        check bool "Buy BTC signal amount is positive" (amount > 0.0) true
    | _ ->
        check bool "Should generate BuyBTC signal" false true

  let test_sustainability_calculation () =
    let vault = {
      total_capital_usd = Math.usd_to_cents 100_000_000.0;
      btc_float_sats = Math.btc_to_sats 200.0;
      btc_float_value_usd = Math.usd_to_cents 10_000_000.0;
      usd_reserves = Math.usd_to_cents 10_000_000.0;
      collateral_positions = [];
      active_policies = [];
      total_coverage_sold = Math.usd_to_cents 50_000_000.0;
    } in

    let years = YieldSustainability.sustainability_period vault
      ~btc_price:50_000.0
      ~required_annual_yield_btc:60.0  (* Need to pay 60 BTC per year *)
      ~annual_premiums_usd:2_000_000.0 (* Only collecting $2M premiums *)
    in

    (* Required: 60 BTC * $50k = $3M *)
    (* Have: $2M premiums + $10M float *)
    (* Shortfall: $1M per year *)
    (* Years: $10M / $1M = 10 years *)
    check bool "Sustainability ~10 years"
      (years >= 8 && years <= 12) true

  let suite = [
    ("allocation calculation", `Quick, test_allocation_calculation);
    ("rebalancing signal", `Quick, test_rebalancing_signal);
    ("sustainability calculation", `Quick, test_sustainability_calculation);
  ]

end
*)
