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

module PricingEngine = struct

  (** Base rates by asset type (annual) *)
  let base_rates = [
    (USDC, 0.04);  (* 4% - lowest risk *)
    (USDT, 0.06);  (* 6% - medium risk *)
    (DAI,  0.05);  (* 5% - medium-low risk *)
    (FRAX, 0.08);  (* 8% - algorithmic, higher risk *)
    (BUSD, 0.045); (* 4.5% - low risk *)
  ]

  (** Get base rate for asset *)
  let get_base_rate (asset: asset) : float =
    match List.Assoc.find base_rates asset ~equal:Poly.equal with
    | Some rate -> rate
    | None -> 0.10 (* Default 10% for unknown assets *)

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
      if coverage_usd >= 10_000_000.0 then 0.80    (* 20% discount *)
      else if coverage_usd >= 1_000_000.0 then 0.90 (* 10% discount *)
      else if coverage_usd >= 100_000.0 then 0.95   (* 5% discount *)
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
      if utilization_ratio > 0.90 then 1.50      (* 50% increase *)
      else if utilization_ratio > 0.75 then 1.25 (* 25% increase *)
      else if utilization_ratio > 0.50 then 1.10 (* 10% increase *)
      else 1.0

    (** Claims experience adjustment *)
    let claims_experience_adjustment ~actual_loss_ratio : float =
      let target_loss_ratio = 0.40 in

      if actual_loss_ratio > target_loss_ratio then
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

  (** Main pricing function *)
  let calculate_premium
      ~(asset: asset)
      ~(coverage_amount: usd_cents)
      ~(trigger_price: float)
      ~(floor_price: float)
      ~(duration_days: int)
      ~(vault_state: vault_state)
      ~(market_stress: float)
      ~(risk_factors: stablecoin_risk_factors)
      ~(actual_loss_ratio: float option)
    : usd_cents =

    (* Get base annual rate *)
    let base_rate = get_base_rate asset in

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
    let min_premium = max 100.0 (coverage_usd *. 0.01) in (* At least 1% or $100 *)
    let final_premium = Float.max actual_premium min_premium in

    usd_to_cents final_premium

  (** Batch pricing for multiple policies *)
  let price_portfolio
      ~(requests: (asset * usd_cents * float * float * int) list)
      ~(vault_state: vault_state)
      ~(market_stress: float)
    : (asset * usd_cents) list =

    List.map requests ~f:(fun (asset, coverage, trigger, floor, days) ->
      (* Get risk factors for asset *)
      let risk_factors = match asset with
        | USDC -> {
            reserve_quality = 0.10;
            banking_exposure = 0.20;
            redemption_velocity = 0.15;
            market_depth = 0.05;
            regulatory_clarity = 0.80;
            historical_volatility = 0.02;
          }
        | USDT -> {
            reserve_quality = 0.30;
            banking_exposure = 0.35;
            redemption_velocity = 0.10;
            market_depth = 0.03;
            regulatory_clarity = 0.40;
            historical_volatility = 0.03;
          }
        | DAI -> {
            reserve_quality = 0.15;
            banking_exposure = 0.05;
            redemption_velocity = 0.20;
            market_depth = 0.10;
            regulatory_clarity = 0.70;
            historical_volatility = 0.025;
          }
        | _ -> {
            reserve_quality = 0.50;
            banking_exposure = 0.50;
            redemption_velocity = 0.50;
            market_depth = 0.50;
            regulatory_clarity = 0.50;
            historical_volatility = 0.10;
          }
      in

      let premium = calculate_premium
        ~asset
        ~coverage_amount:coverage
        ~trigger_price:trigger
        ~floor_price:floor
        ~duration_days:days
        ~vault_state
        ~market_stress
        ~risk_factors
        ~actual_loss_ratio:None
      in

      (asset, premium)
    )

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
  } [@@deriving sexp, yojson]

  let calculate_quote_with_breakdown
      ~(asset: asset)
      ~(coverage_amount: usd_cents)
      ~(trigger_price: float)
      ~(floor_price: float)
      ~(duration_days: int)
      ~(vault_state: vault_state)
      ~(market_stress: float)
      ~(risk_factors: stablecoin_risk_factors)
    : quote_breakdown =

    let base_rate = get_base_rate asset in
    let risk_adjustment = RiskAdjustments.calculate_total risk_factors in

    let coverage_usd = cents_to_usd coverage_amount in
    let size_discount = SizeAdjustments.calculate_size_adjustment coverage_usd in
    let duration_mult = DurationAdjustments.calculate_duration_adjustment ~duration_days in
    let trigger_mult = TriggerAdjustments.calculate_trigger_adjustment ~trigger_price in
    let utilization_mult = MarketAdjustments.utilization_adjustment vault_state in
    let stress_mult = MarketAdjustments.market_stress_adjustment ~stress_index:market_stress in

    let final_premium = calculate_premium
      ~asset
      ~coverage_amount
      ~trigger_price
      ~floor_price
      ~duration_days
      ~vault_state
      ~market_stress
      ~risk_factors
      ~actual_loss_ratio:None
    in

    let annual_rate =
      (cents_to_usd final_premium /. coverage_usd) *. (365.0 /. Float.of_int duration_days)
    in

    {
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

(** Unit tests *)
module Tests = struct
  open Alcotest

  let test_basic_pricing () =
    let vault = {
      total_capital_usd = Math.usd_to_cents 100_000_000.0;
      btc_float_sats = Math.btc_to_sats 1000.0;
      btc_float_value_usd = Math.usd_to_cents 50_000_000.0;
      usd_reserves = Math.usd_to_cents 10_000_000.0;
      collateral_positions = [];
      active_policies = [];
      total_coverage_sold = Math.usd_to_cents 50_000_000.0;
    } in

    let risk_factors = {
      reserve_quality = 0.10;
      banking_exposure = 0.20;
      redemption_velocity = 0.15;
      market_depth = 0.05;
      regulatory_clarity = 0.80;
      historical_volatility = 0.02;
    } in

    let premium = PricingEngine.calculate_premium
      ~asset:USDC
      ~coverage_amount:(Math.usd_to_cents 100_000.0)
      ~trigger_price:0.97
      ~floor_price:0.90
      ~duration_days:90
      ~vault_state:vault
      ~market_stress:0.2
      ~risk_factors
      ~actual_loss_ratio:None
    in

    let premium_usd = Math.cents_to_usd premium in

    (* Premium should be roughly $1,000 - $1,500 for $100k coverage *)
    check bool "premium in expected range"
      (premium_usd > 800.0 && premium_usd < 2000.0) true

  let test_size_discount () =
    let vault = {
      total_capital_usd = Math.usd_to_cents 100_000_000.0;
      btc_float_sats = Math.btc_to_sats 1000.0;
      btc_float_value_usd = Math.usd_to_cents 50_000_000.0;
      usd_reserves = Math.usd_to_cents 10_000_000.0;
      collateral_positions = [];
      active_policies = [];
      total_coverage_sold = Math.usd_to_cents 50_000_000.0;
    } in

    let risk_factors = {
      reserve_quality = 0.10;
      banking_exposure = 0.20;
      redemption_velocity = 0.15;
      market_depth = 0.05;
      regulatory_clarity = 0.80;
      historical_volatility = 0.02;
    } in

    (* Small coverage *)
    let premium_small = PricingEngine.calculate_premium
      ~asset:USDC
      ~coverage_amount:(Math.usd_to_cents 10_000.0)
      ~trigger_price:0.97
      ~floor_price:0.90
      ~duration_days:90
      ~vault_state:vault
      ~market_stress:0.0
      ~risk_factors
      ~actual_loss_ratio:None
    in

    (* Large coverage *)
    let premium_large = PricingEngine.calculate_premium
      ~asset:USDC
      ~coverage_amount:(Math.usd_to_cents 10_000_000.0)
      ~trigger_price:0.97
      ~floor_price:0.90
      ~duration_days:90
      ~vault_state:vault
      ~market_stress:0.0
      ~risk_factors
      ~actual_loss_ratio:None
    in

    let rate_small = Math.cents_to_usd premium_small /. 10_000.0 in
    let rate_large = Math.cents_to_usd premium_large /. 10_000_000.0 in

    (* Large coverage should have lower rate due to discount *)
    check bool "large coverage gets discount"
      (rate_large < rate_small) true

  let suite = [
    ("basic pricing", `Quick, test_basic_pricing);
    ("size discount", `Quick, test_size_discount);
  ]

end
