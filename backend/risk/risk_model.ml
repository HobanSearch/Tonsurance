open Core
open Lwt.Syntax
open Types
open Monte_carlo_enhanced

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
      ~(market_conditions: Market_data_risk_integration.market_risk_multipliers) =

    let%lwt var_result_lwt = MonteCarloEnhanced.calculate_adaptive_var
      db_pool
      ~vault
      ~confidence_level:0.95
    in

    match var_result_lwt with
    | Ok var_result ->
        let vault_capital_usd = cents_to_usd vault.total_capital_usd in
        let var_99_ratio = var_result.var_99 /. vault_capital_usd in

        let risk_level =
          if var_99_ratio > 0.5 then "High"
          else if var_99_ratio > 0.2 then "Medium"
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
