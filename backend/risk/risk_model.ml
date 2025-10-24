open Core
open Types
open Monte_carlo_enhanced
open Market_data_risk_integration.MarketDataRiskIntegration

let get_risk_factors (asset: asset) : stablecoin_risk_factors =
  match asset with
  | USDC -> {
      reserve_quality = 0.10;
      banking_exposure = 0.20;
      redemption_velocity = 0.15;
      market_depth = 0.05;
      regulatory_clarity = 0.80;
      historical_volatility = 0.02;
      audit_frequency = 12.0;
      transparency_score = 0.90;
    }
  | USDT -> {
      reserve_quality = 0.30;
      banking_exposure = 0.35;
      redemption_velocity = 0.10;
      market_depth = 0.03;
      regulatory_clarity = 0.40;
      historical_volatility = 0.03;
      audit_frequency = 4.0;
      transparency_score = 0.60;
    }
  | DAI -> {
      reserve_quality = 0.15;
      banking_exposure = 0.05;
      redemption_velocity = 0.20;
      market_depth = 0.10;
      regulatory_clarity = 0.70;
      historical_volatility = 0.025;
      audit_frequency = 6.0;
      transparency_score = 0.85;
    }
  | _ -> default_risk_factors

module RiskModel = struct

  type risk_assessment_result = {
    var_95: float;
    var_99: float;
    cvar_95: float;
    expected_loss: float;
    risk_level: string;
    market_stress_multiplier: float;
  } [@@deriving yojson]

  let calculate_risk_assessment
      ~db_pool
      ~(vault: MonteCarloEnhanced.vault_state)
      ~(market_conditions: market_risk_multipliers) =

    let%lwt var_result_lwt = MonteCarloEnhanced.calculate_adaptive_var
      db_pool
      ~vault
      ~confidence_level:0.95
    in

    match var_result_lwt with
    | Ok var_result ->
        let vault_capital_usd = Math.cents_to_usd vault.total_capital_usd in
        let var_99_ratio = var_result.var_99 /. vault_capital_usd in

        let risk_level =
          if Float.(var_99_ratio > 0.5) then "High"
          else if Float.(var_99_ratio > 0.2) then "Medium"
          else "Low"
        in

        let assessment = {
          var_95 = var_result.var_95;
          var_99 = var_result.var_99;
          cvar_95 = var_result.cvar_95;
          expected_loss = var_result.expected_loss;
          risk_level;
          market_stress_multiplier = market_conditions.market_stress_multiplier;
        } in
        Lwt.return (Ok assessment)

    | Error e -> Lwt.return (Error e)

end
