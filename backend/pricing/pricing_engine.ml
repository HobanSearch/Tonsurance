(* Pricing Engine - Dynamic Premium Calculation

   This is the core revenue engine. Prices insurance policies based on:
   - Expected loss (historical depeg probability * severity)
   - Risk adjustments (reserve quality, market stress, etc.)
   - Size discounts (larger coverage = lower rate)
   - Duration adjustments (longer = higher risk)
   - Utilization (vault capacity constraint)
   - Claims experience (actual vs expected loss ratio)

   Formula:
   Premium = Expected_Loss * (1 + Risk_Load + Expense_Ratio) * Adjustments
*)

open Core
open Types
open Math

(** Vault state for utilization calculations *)
type vault_state = {
  total_capital_usd: usd_cents;
  total_coverage_sold: usd_cents;
}

module PricingEngine = struct

  open Lwt.Syntax

  (** Pricing engine configuration *)
  type pricing_config = {
    base_rates_source: [`Config | `Dynamic];
    enable_market_adjustments: bool;
    enable_size_discounts: bool;
    min_premium_usd: float;
    max_coverage_per_policy_usd: float;
  } [@@deriving sexp]

  (** Default configuration *)
  let default_config : pricing_config = {
    base_rates_source = `Config;
    enable_market_adjustments = true;
    enable_size_discounts = true;
    min_premium_usd = 10.0;
    max_coverage_per_policy_usd = 10_000_000.0;
  }

  (** Get base rate for asset from config *)
  let get_base_rate_async (asset: asset) : float Lwt.t =
    Config_manager.ConfigManager.Pricing.get_base_rate (asset_to_string asset)

  (** Risk adjustments based on current factors *)
  module RiskAdjustments = struct

    let reserve_quality_adjustment (factors: stablecoin_risk_factors) : float =
      (* Higher reserve quality score = lower adjustment *)
      factors.reserve_quality *. 0.30

    let banking_exposure_adjustment (factors: stablecoin_risk_factors) : float =
      factors.banking_exposure *. 0.25

    let redemption_velocity_adjustment (factors: stablecoin_risk_factors) : float =
      (* High redemption velocity = stress indicator *)
      factors.redemption_velocity *. 0.20

    let market_depth_adjustment (factors: stablecoin_risk_factors) : float =
      (* Poor market depth = higher risk *)
      factors.market_depth *. 0.15

    let regulatory_clarity_adjustment (factors: stablecoin_risk_factors) : float =
      (* Good regulatory standing = negative adjustment (lower premium) *)
      factors.regulatory_clarity *. (-0.10)

    (** Calculate total risk adjustment *)
    let calculate_total (factors: stablecoin_risk_factors) : float =
      reserve_quality_adjustment factors
      +. banking_exposure_adjustment factors
      +. redemption_velocity_adjustment factors
      +. market_depth_adjustment factors
      +. regulatory_clarity_adjustment factors

  end

  (** Size-based discounts *)
  module SizeAdjustments = struct

    let calculate_size_adjustment (coverage_usd: float) : float =
      if Float.(coverage_usd >= 10_000_000.0) then 0.80    (* 20% discount *)
      else if Float.(coverage_usd >= 1_000_000.0) then 0.90 (* 10% discount *)
      else if Float.(coverage_usd >= 100_000.0) then 0.95   (* 5% discount *)
      else 1.0 (* No discount *)

  end

  (** Duration adjustments - longer = more risk *)
  module DurationAdjustments = struct

    let calculate_duration_adjustment ~duration_days : float =
      let base_days = 90.0 in
      let actual_days = Float.of_int duration_days in

      (* Square root rule: risk grows as sqrt(time) *)
      Float.sqrt (actual_days /. base_days)

  end

  (** Trigger price adjustments *)
  module TriggerAdjustments = struct

    let calculate_trigger_adjustment ~trigger_price : float =
      let base_trigger = 0.97 in

      (* Lower trigger = more cushion = lower premium *)
      1.0 +. ((base_trigger -. trigger_price) /. 0.07) *. 0.5

  end

  (** Market conditions adjustments *)
  module MarketAdjustments = struct

    (** Vault utilization adjustment *)
    let utilization_adjustment (vault: vault_state) : float =
      let utilization_ratio =
        cents_to_usd vault.total_coverage_sold /.
        cents_to_usd vault.total_capital_usd
      in

      (* Increase premiums as vault gets more utilized *)
      if Float.(utilization_ratio > 0.90) then 1.50      (* 50% increase *)
      else if Float.(utilization_ratio > 0.75) then 1.25 (* 25% increase *)
      else if Float.(utilization_ratio > 0.50) then 1.10 (* 10% increase *)
      else 1.0

    (** Claims experience adjustment *)
    let claims_experience_adjustment ~actual_loss_ratio : float =
      let target_loss_ratio = 0.40 in

      if Float.(actual_loss_ratio > target_loss_ratio) then
        (* Claims higher than expected - increase premiums *)
        1.0 +. ((actual_loss_ratio -. target_loss_ratio) /. target_loss_ratio)
      else
        (* Claims lower than expected - can reduce premiums slightly *)
        1.0 -. ((target_loss_ratio -. actual_loss_ratio) /. target_loss_ratio) *. 0.5

    (** Market stress adjustment *)
    let market_stress_adjustment ~stress_index : float =
      (* stress_index: 0.0 = calm, 1.0 = crisis *)
      1.0 +. (stress_index *. 2.0) (* Up to 3x premium in crisis *)

  end

  (** Main pricing function (now async) *)
  let calculate_premium_async
      ~(asset: asset)
      ~(coverage_amount: usd_cents)
      ~(trigger_price: float)
      ~(_floor_price: float)
      ~(duration_days: int)
      ~(vault_state: vault_state)
      ~(market_stress: float)
      ~(risk_factors: stablecoin_risk_factors)
      ~(actual_loss_ratio: float option)
    : usd_cents Lwt.t =

    (* Get base annual rate *)
    let* base_rate = get_base_rate_async asset in

    (* Calculate risk adjustments *)
    let risk_adjustment = RiskAdjustments.calculate_total risk_factors in
    let risk_adjusted_rate = base_rate *. (1.0 +. risk_adjustment) in

    (* Apply size discount *)
    let coverage_usd = cents_to_usd coverage_amount in
    let size_adj = SizeAdjustments.calculate_size_adjustment coverage_usd in

    (* Apply duration adjustment *)
    let duration_adj = DurationAdjustments.calculate_duration_adjustment ~duration_days in

    (* Apply trigger adjustment *)
    let trigger_adj = TriggerAdjustments.calculate_trigger_adjustment ~trigger_price in

    (* Apply market adjustments *)
    let utilization_adj = MarketAdjustments.utilization_adjustment vault_state in
    let stress_adj = MarketAdjustments.market_stress_adjustment ~stress_index:market_stress in

    let claims_adj = match actual_loss_ratio with
      | Some ratio -> MarketAdjustments.claims_experience_adjustment ~actual_loss_ratio:ratio
      | None -> 1.0
    in

    (* Calculate final rate *)
    let final_rate =
      risk_adjusted_rate
      *. size_adj
      *. duration_adj
      *. trigger_adj
      *. utilization_adj
      *. stress_adj
      *. claims_adj
    in

    (* Convert to premium amount *)
    let annual_premium = coverage_usd *. final_rate in

    (* Prorate for duration *)
    let actual_premium = annual_premium *. (Float.of_int duration_days /. 365.0) in

    (* Floor at minimum premium (cover ops costs) *)
    let min_premium = Float.max 100.0 (coverage_usd *. 0.01) in (* At least 1% or $100 *)
    let final_premium = Float.max actual_premium min_premium in

    Lwt.return (usd_to_cents final_premium)

  (** Batch pricing for multiple policies (now async) *)
  let price_portfolio_async
      ~(requests: (asset * usd_cents * float * float * int) list)
      ~(vault_state: vault_state)
      ~(market_stress: float)
    : (asset * usd_cents) list Lwt.t =

    Lwt_list.map_p (fun (asset, coverage, trigger, floor, days) ->
      (* Get risk factors for asset *)
      let risk_factors = Risk_model.get_risk_factors asset in

      let* premium = calculate_premium_async
        ~asset
        ~coverage_amount:coverage
        ~trigger_price:trigger
        ~_floor_price:floor
        ~duration_days:days
        ~vault_state
        ~market_stress
        ~risk_factors
        ~actual_loss_ratio:None
      in

      Lwt.return (asset, premium)
    ) requests

  (** Quote with detailed breakdown (for transparency) *)
  type quote_breakdown = {
    base_rate: float;
    risk_adjustment: float;
    size_discount: float;
    duration_multiplier: float;
    trigger_multiplier: float;
    utilization_multiplier: float;
    stress_multiplier: float;
    final_premium: usd_cents;
    annual_equivalent_rate: float;
  } [@@deriving sexp]

  let calculate_quote_with_breakdown_async
      ~(asset: asset)
      ~(coverage_amount: usd_cents)
      ~(trigger_price: float)
      ~(floor_price: float)
      ~(duration_days: int)
      ~(vault_state: vault_state)
      ~(market_stress: float)
      ~(risk_factors: stablecoin_risk_factors)
    : quote_breakdown Lwt.t =

    let* base_rate = get_base_rate_async asset in
    let risk_adjustment = RiskAdjustments.calculate_total risk_factors in

    let coverage_usd = cents_to_usd coverage_amount in
    let size_discount = SizeAdjustments.calculate_size_adjustment coverage_usd in
    let duration_mult = DurationAdjustments.calculate_duration_adjustment ~duration_days in
    let trigger_mult = TriggerAdjustments.calculate_trigger_adjustment ~trigger_price in
    let utilization_mult = MarketAdjustments.utilization_adjustment vault_state in
    let stress_mult = MarketAdjustments.market_stress_adjustment ~stress_index:market_stress in

    let* final_premium = calculate_premium_async
      ~asset
      ~coverage_amount
      ~trigger_price
      ~_floor_price:floor_price
      ~duration_days
      ~vault_state
      ~market_stress
      ~risk_factors
      ~actual_loss_ratio:None
    in

    let annual_rate =
      (cents_to_usd final_premium /. coverage_usd) *. (365.0 /. Float.of_int duration_days)
    in

    Lwt.return {
      base_rate;
      risk_adjustment;
      size_discount;
      duration_multiplier = duration_mult;
      trigger_multiplier = trigger_mult;
      utilization_multiplier = utilization_mult;
      stress_multiplier = stress_mult;
      final_premium;
      annual_equivalent_rate = annual_rate;
    }

end

(** Escrow-specific pricing extensions *)
module EscrowPricing = struct

  open Lwt.Syntax

  (** Premium calculation result with breakdown *)
type escrow_premium_result = {
    base_premium: usd_cents;
    duration_discount: float;
    volume_discount: float;
    coverage_multiplier: float;
    final_premium: usd_cents;
    annual_rate: float;
  } [@@deriving sexp]

  (** Calculate duration-based discount *)
  let get_duration_discount ~duration_days ~(config: escrow_config) : float =
    if duration_days <= 7 then
      config.short_duration_discount (* 20% off *)
    else if duration_days <= 30 then
      config.medium_duration_discount (* 10% off *)
    else
      1.0 (* No discount for long escrows *)

  (** Calculate volume-based discount for power users *)
  let get_volume_discount ~active_count ~(config: escrow_config) : float =
    if active_count >= 5 then
      config.volume_discount (* 10% off for 5+ active escrows *)
    else
      1.0 (* No discount *)

  (** Get coverage multiplier based on who is protected *)
  let get_coverage_multiplier ~coverage ~(config: escrow_config) : float =
    match coverage with
    | PayerOnly -> 1.0
    | PayeeOnly -> 1.0
    | BothParties -> config.both_parties_multiplier (* 1.5x *)

  (** Main escrow premium calculation function (now async) *)
  let calculate_escrow_premium_async
      ~(escrow_amount: usd_cents)
      ~(duration_days: int)
      ~(protection_coverage: escrow_coverage)
      ~(active_escrow_count: int)
      ()
    : escrow_premium_result Lwt.t =

    let* config = Config_manager.ConfigManager.Pricing.get_escrow_config () in

    (* Base premium: amount × APR × (days/365) *)
    let amount_usd = cents_to_usd escrow_amount in
    let base_annual = amount_usd *. config.base_apr in
    let base_premium_usd = base_annual *. (Float.of_int duration_days /. 365.0) in
    let base_premium = usd_to_cents base_premium_usd in

    (* Get discount factors *)
    let duration_discount = get_duration_discount ~duration_days ~config in
    let volume_discount = get_volume_discount ~active_count:active_escrow_count ~config in
    let coverage_mult = get_coverage_multiplier ~coverage:protection_coverage ~config in

    (* Calculate final premium *)
    let final_premium_usd =
      base_premium_usd
      *. duration_discount
      *. volume_discount
      *. coverage_mult
    in
    let final_premium = usd_to_cents final_premium_usd in

    (* Apply minimum floor of $1.00 *)
    let final_premium = Int64.max final_premium 100_00L in

    (* Calculate annual rate for comparison *)
    let annual_rate =
      if Int64.(escrow_amount = 0L) then 0.0
      else
        (cents_to_usd final_premium /. amount_usd) *. (365.0 /. Float.of_int duration_days)
    in

    Lwt.return {
      base_premium;
      duration_discount;
      volume_discount;
      coverage_multiplier = coverage_mult;
      final_premium;
      annual_rate;
    }

  (** Format premium quote for user display *)
  let format_premium_quote (result: escrow_premium_result) : string =
    let base_usd = cents_to_usd result.base_premium in
    let final_usd = cents_to_usd result.final_premium in
    let savings = base_usd -. final_usd in
    let savings_pct = if Float.(base_usd > 0.0) then (savings /. base_usd) *. 100.0 else 0.0 in

    Printf.sprintf
      "Protection Premium: $%.2f\n\
       Base Cost: $%.2f\n\
       Savings: $%.2f (%.0f%% off)\n\
       \n\
       Discounts Applied:\n\
       - Duration: %.0f%%\n\
       - Volume: %.0f%%\n\
       \n\
       Coverage Level: %.1fx\n\
       Effective Annual Rate: %.2f%%"
      final_usd
      base_usd
      savings
      savings_pct
      ((1.0 -. result.duration_discount) *. 100.0)
      ((1.0 -. result.volume_discount) *. 100.0)
      result.coverage_multiplier
      (result.annual_rate *. 100.0)

  (** Batch quote for multiple escrows (now async) *)
  let calculate_batch_quotes_async
      ~(escrow_requests: (usd_cents * int * escrow_coverage) list)
      ~(active_escrow_count: int)
      ()
    : escrow_premium_result list Lwt.t =

    Lwt_list.map_p (fun (amount, days, coverage) ->
      calculate_escrow_premium_async
        ~escrow_amount:amount
        ~duration_days:days
        ~protection_coverage:coverage
        ~active_escrow_count
        ()
    ) escrow_requests

  (** Compare escrow premium to standard insurance (now async) *)
  let compare_to_standard_insurance_async
      ~(escrow_amount: usd_cents)
      ~(duration_days: int)
      ~(vault_state: vault_state)
    : (escrow_premium_result * usd_cents * float) Lwt.t =

    (* Calculate escrow premium *)
    let* escrow_result = calculate_escrow_premium_async
      ~escrow_amount
      ~duration_days
      ~protection_coverage:PayerOnly
      ~active_escrow_count:0
      ()
    in

    (* Calculate equivalent standard insurance premium *)
    let risk_factors = default_risk_factors in
    let* standard_premium = PricingEngine.calculate_premium_async
      ~asset:USDC (* Assume USDC *)
      ~coverage_amount:escrow_amount
      ~trigger_price:0.97
      ~_floor_price:0.90
      ~duration_days
      ~vault_state
      ~market_stress:0.0
      ~risk_factors
      ~actual_loss_ratio:None
    in

    (* Calculate savings percentage *)
    let escrow_usd = cents_to_usd escrow_result.final_premium in
    let standard_usd = cents_to_usd standard_premium in
    let savings_pct =
      if Float.(standard_usd > 0.0) then
        ((standard_usd -. escrow_usd) /. standard_usd) *. 100.0
      else
        0.0
    in

    Lwt.return (escrow_result, standard_premium, savings_pct)

end

(** Unit tests *)
(* module Tests = struct *)
(*   open Alcotest *)
(*  *)
(*   let test_basic_pricing () = *)
(*     let vault = { *)
(*       total_capital_usd = Math.usd_to_cents 100_000_000.0; *)
(*       btc_float_sats = Math.btc_to_sats 1000.0; *)
(*       btc_float_value_usd = Math.usd_to_cents 50_000_000.0; *)
(*       usd_reserves = Math.usd_to_cents 10_000_000.0; *)
(*       collateral_positions = []; *)
(*       active_policies = []; *)
(*       total_coverage_sold = Math.usd_to_cents 50_000_000.0; *)
(*     } in *)
(*  *)
(*     let risk_factors = { *)
(*       reserve_quality = 0.10; *)
(*       banking_exposure = 0.20; *)
(*       redemption_velocity = 0.15; *)
(*       market_depth = 0.05; *)
(*       regulatory_clarity = 0.80; *)
(*       historical_volatility = 0.02; *)
(*     } in *)
(*  *)
(*     let premium = PricingEngine.calculate_premium *)
(*       ~asset:USDC *)
(*       ~coverage_amount:(Math.usd_to_cents 100_000.0) *)
(*       ~trigger_price:0.97 *)
(*       ~floor_price:0.90 *)
(*       ~duration_days:90 *)
(*       ~vault_state:vault *)
(*       ~market_stress:0.2 *)
(*       ~risk_factors *)
(*       ~actual_loss_ratio:None *)
(*     in *)
(*  *)
(*     let premium_usd = Math.cents_to_usd premium in *)
(*  *)
(*     Premium should be roughly $1,000 - $1,500 for $100k coverage *)
(*     check bool "premium in expected range" *)
(*       (premium_usd > 800.0 && premium_usd < 2000.0) true *)
(*  *)
(*   let test_size_discount () = *)
(*     let vault = { *)
(*       total_capital_usd = Math.usd_to_cents 100_000_000.0; *)
(*       btc_float_sats = Math.btc_to_sats 1000.0; *)
(*       btc_float_value_usd = Math.usd_to_cents 50_000_000.0; *)
(*       usd_reserves = Math.usd_to_cents 10_000_000.0; *)
(*       collateral_positions = []; *)
(*       active_policies = []; *)
(*       total_coverage_sold = Math.usd_to_cents 50_000_000.0; *)
(*     } in *)
(*  *)
(*     let risk_factors = { *)
(*       reserve_quality = 0.10; *)
(*       banking_exposure = 0.20; *)
(*       redemption_velocity = 0.15; *)
(*       market_depth = 0.05; *)
(*       regulatory_clarity = 0.80; *)
(*       historical_volatility = 0.02; *)
(*     } in *)
(*  *)
(*     Small coverage *)
(*     let premium_small = PricingEngine.calculate_premium *)
(*       ~asset:USDC *)
(*       ~coverage_amount:(Math.usd_to_cents 10_000.0) *)
(*       ~trigger_price:0.97 *)
(*       ~floor_price:0.90 *)
(*       ~duration_days:90 *)
(*       ~vault_state:vault *)
(*       ~market_stress:0.0 *)
(*       ~risk_factors *)
(*       ~actual_loss_ratio:None *)
(*     in *)
(*  *)
(*     Large coverage *)
(*     let premium_large = PricingEngine.calculate_premium *)
(*       ~asset:USDC *)
(*       ~coverage_amount:(Math.usd_to_cents 10_000_000.0) *)
(*       ~trigger_price:0.97 *)
(*       ~floor_price:0.90 *)
(*       ~duration_days:90 *)
(*       ~vault_state:vault *)
(*       ~market_stress:0.0 *)
(*       ~risk_factors *)
(*       ~actual_loss_ratio:None *)
(*     in *)
(*  *)
(*     let rate_small = Math.cents_to_usd premium_small /. 10_000.0 in *)
(*     let rate_large = Math.cents_to_usd premium_large /. 10_000_000.0 in *)
(*  *)
(*     Large coverage should have lower rate due to discount *)
(*     check bool "large coverage gets discount" *)
(*       (rate_large < rate_small) true *)
(*  *)
(*   let suite = [ *)
(*     ("basic pricing", `Quick, test_basic_pricing); *)
(*     ("size discount", `Quick, test_size_discount); *)
(*   ] *)
(*  *)
(* end *)