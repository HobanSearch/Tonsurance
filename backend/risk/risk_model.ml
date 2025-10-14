(* Risk Model - Comprehensive Risk Assessment

   This module calculates:
   - Value at Risk (VaR) at 95% and 99% confidence levels
   - Conditional Value at Risk (CVaR / Expected Shortfall)
   - Stress testing under 4 scenarios
   - Expected loss calculations
   - Portfolio risk metrics
   - Correlation analysis

   Used for:
   - Setting reserve requirements
   - Determining acceptable coverage amounts
   - Risk-based capital allocation
   - Regulatory reporting
*)

open Core
open Types
open Math

module RiskModel = struct

  (** Historical depeg analysis *)
  module DepegAnalysis = struct

    type depeg_event = {
      timestamp: float;
      min_price: float;
      duration_seconds: int;
      recovery_time_seconds: int;
    } [@@deriving sexp]

    (** Historical depeg events by asset *)
    let historical_depegs (asset: asset) : depeg_event list =
      match asset with
      | USDC -> [
          (* SVB Crisis - March 2023 *)
          {
            timestamp = 1678406400.0; (* March 10, 2023 *)
            min_price = 0.88;
            duration_seconds = 172800; (* 48 hours *)
            recovery_time_seconds = 259200; (* 72 hours *)
          };
          (* Minor depeg - May 2022 *)
          {
            timestamp = 1651363200.0;
            min_price = 0.96;
            duration_seconds = 14400; (* 4 hours *)
            recovery_time_seconds = 28800; (* 8 hours *)
          };
        ]

      | USDT -> [
          (* May 2022 UST collapse contagion *)
          {
            timestamp = 1652054400.0;
            min_price = 0.95;
            duration_seconds = 86400; (* 24 hours *)
            recovery_time_seconds = 172800; (* 48 hours *)
          };
          (* Minor depeg *)
          {
            timestamp = 1640995200.0;
            min_price = 0.97;
            duration_seconds = 7200;
            recovery_time_seconds = 21600;
          };
        ]

      | DAI -> [
          (* March 2020 COVID *)
          {
            timestamp = 1584144000.0;
            min_price = 0.96;
            duration_seconds = 43200;
            recovery_time_seconds = 86400;
          };
        ]

      | _ -> []

    (** Calculate annual depeg probability *)
    let annual_depeg_probability (asset: asset) ~(threshold: float) : float =
      let events = historical_depegs asset in
      let years_of_data = 5.0 in

      let significant_events =
        List.filter events ~f:(fun e -> e.min_price <= threshold)
      in

      Float.of_int (List.length significant_events) /. years_of_data

    (** Expected severity (how far below peg) *)
    let expected_severity (asset: asset) : float =
      let events = historical_depegs asset in

      if List.is_empty events then 0.0
      else
        let severities = List.map events ~f:(fun e -> 1.0 -. e.min_price) in
        mean severities

    (** Expected loss per policy *)
    let expected_loss_per_policy
        (asset: asset)
        ~(coverage: usd_cents)
        ~(trigger_price: float)
      : float =

      let prob = annual_depeg_probability asset ~threshold:trigger_price in
      let severity = expected_severity asset in
      let expected_payout = cents_to_usd coverage *. severity in

      prob *. expected_payout

  end

  (** Value at Risk (VaR) calculations *)
  module VaR = struct

    (** Historical simulation VaR *)
    let calculate_var
        ~(returns: float list)
        ~(confidence_level: float)
      : float =

      let sorted_returns = List.sort returns ~compare:Float.compare in
      let index =
        Float.to_int ((1.0 -. confidence_level) *. Float.of_int (List.length returns))
        |> min (List.length returns - 1)
        |> max 0
      in

      List.nth_exn sorted_returns index

    (** Monte Carlo VaR simulation *)
    let monte_carlo_var
        ~(mean_return: float)
        ~(std_dev: float)
        ~(num_simulations: int)
        ~(confidence_level: float)
      : float =

      Random.self_init ();

      let simulations =
        List.init num_simulations ~f:(fun _ ->
          normal_random ~mean:mean_return ~std_dev
        )
      in

      calculate_var ~returns:simulations ~confidence_level

    (** Portfolio VaR with correlations *)
    let portfolio_var
        ~(positions: (float * float * float) list) (* (value, return, std_dev) *)
        ~(correlation_matrix: float list list)
        ~(confidence_level: float)
      : float =

      let total_value =
        List.fold positions ~init:0.0 ~f:(fun acc (v, _, _) -> acc +. v)
      in

      (* Calculate portfolio return *)
      let weighted_returns =
        List.map positions ~f:(fun (v, r, _) ->
          (v /. total_value) *. r
        )
      in
      let portfolio_return = List.fold weighted_returns ~init:0.0 ~f:(+.) in

      (* Calculate portfolio volatility *)
      let weights = List.map positions ~f:(fun (v, _, _) -> v /. total_value) in

      (* Portfolio variance = w^T * Cov * w *)
      let portfolio_variance =
        List.foldi weights ~init:0.0 ~f:(fun i acc_i w_i ->
          acc_i +. List.foldi weights ~init:0.0 ~f:(fun j acc_j w_j ->
            let (_, _, std_i) = List.nth_exn positions i in
            let (_, _, std_j) = List.nth_exn positions j in
            let correlation = List.nth_exn (List.nth_exn correlation_matrix i) j in

            acc_j +. (w_i *. w_j *. std_i *. std_j *. correlation)
          )
        )
      in

      let portfolio_std = Float.sqrt portfolio_variance in

      (* Use Monte Carlo with portfolio parameters *)
      monte_carlo_var
        ~mean_return:portfolio_return
        ~std_dev:portfolio_std
        ~num_simulations:10000
        ~confidence_level

    (** Conditional VaR (Expected Shortfall / CVaR) *)
    let conditional_var
        ~(returns: float list)
        ~(confidence_level: float)
      : float =

      let var_cutoff = calculate_var ~returns ~confidence_level in

      (* Average of all returns worse than VaR *)
      let tail_losses =
        List.filter returns ~f:(fun r -> r <= var_cutoff)
      in

      if List.is_empty tail_losses then var_cutoff
      else mean tail_losses

  end

  (** Stress testing under extreme scenarios *)
  module StressTest = struct

    type stress_scenario = {
      name: string;
      btc_change: float;       (* e.g., -0.50 for 50% drop *)
      usdc_depeg: float;        (* e.g., 0.88 for depeg to $0.88 *)
      usdt_depeg: float;
      dai_depeg: float;
      correlation_shift: float; (* How correlations change *)
    } [@@deriving sexp]

    (** Predefined stress scenarios *)
    let scenarios = [
      (* Scenario 1: Banking Crisis (SVB-style) *)
      {
        name = "Banking Crisis (SVB)";
        btc_change = 0.27;      (* BTC up 27% - flight to safety *)
        usdc_depeg = 0.88;
        usdt_depeg = 1.02;      (* USDT premium during USDC stress *)
        dai_depeg = 1.01;
        correlation_shift = -0.3; (* Correlations break down *)
      };

      (* Scenario 2: Crypto Crash *)
      {
        name = "Crypto Crash";
        btc_change = -0.50;      (* BTC down 50% *)
        usdc_depeg = 0.98;       (* Minor stress *)
        usdt_depeg = 0.97;
        dai_depeg = 0.96;
        correlation_shift = 0.5; (* Everything moves together *)
      };

      (* Scenario 3: Regulatory Crackdown *)
      {
        name = "Regulatory Shutdown";
        btc_change = -0.30;
        usdc_depeg = 0.80;       (* Major depeg *)
        usdt_depeg = 0.85;
        dai_depeg = 0.90;
        correlation_shift = 0.0;
      };

      (* Scenario 4: Multiple Stablecoin Failure *)
      {
        name = "Multiple Stable Failure";
        btc_change = 0.50;       (* Flight to BTC *)
        usdc_depeg = 0.75;
        usdt_depeg = 0.75;
        dai_depeg = 0.80;
        correlation_shift = 0.8; (* High correlation in crisis *)
      };
    ]

    (** Calculate policy payout under scenario *)
    let calculate_policy_payout (policy: policy) ~(current_price: float) : float =
      if current_price >= policy.trigger_price then 0.0
      else
        let payout_ratio =
          (policy.trigger_price -. current_price) /.
          (policy.trigger_price -. policy.floor_price)
        in
        let clamped_ratio = Float.min 1.0 (Float.max 0.0 payout_ratio) in
        cents_to_usd policy.coverage_amount *. clamped_ratio

    (** Calculate total losses under stress scenario *)
    let calculate_stress_loss
        (scenario: stress_scenario)
        (vault: vault_state)
      : float =

      (* Calculate claims from depegs *)
      let usdc_policies =
        List.filter vault.active_policies ~f:(fun p -> Poly.equal p.asset USDC)
      in
      let usdt_policies =
        List.filter vault.active_policies ~f:(fun p -> Poly.equal p.asset USDT)
      in
      let dai_policies =
        List.filter vault.active_policies ~f:(fun p -> Poly.equal p.asset DAI)
      in

      let usdc_claims =
        List.fold usdc_policies ~init:0.0 ~f:(fun acc p ->
          acc +. calculate_policy_payout p ~current_price:scenario.usdc_depeg
        )
      in

      let usdt_claims =
        List.fold usdt_policies ~init:0.0 ~f:(fun acc p ->
          acc +. calculate_policy_payout p ~current_price:scenario.usdt_depeg
        )
      in

      let dai_claims =
        List.fold dai_policies ~init:0.0 ~f:(fun acc p ->
          acc +. calculate_policy_payout p ~current_price:scenario.dai_depeg
        )
      in

      let total_claims = usdc_claims +. usdt_claims +. dai_claims in

      (* Account for BTC float appreciation/depreciation *)
      let btc_float_change =
        cents_to_usd vault.btc_float_value_usd *. scenario.btc_change
      in

      (* Net loss (negative = gain) *)
      total_claims -. btc_float_change

    (** Run all stress scenarios *)
    let run_all_scenarios (vault: vault_state) : (string * float) list =
      List.map scenarios ~f:(fun s ->
        (s.name, calculate_stress_loss s vault)
      )

    (** Calculate worst-case loss across all scenarios *)
    let worst_case_loss (vault: vault_state) : float =
      let results = run_all_scenarios vault in
      let losses = List.map results ~f:snd in
      List.fold losses ~init:Float.neg_infinity ~f:Float.max

  end

  (** Portfolio risk metrics *)
  module PortfolioMetrics = struct

    (** Calculate Sharpe ratio *)
    let sharpe_ratio
        ~(returns: float list)
        ~(risk_free_rate: float)
      : float =

      let mean_return = mean returns in
      let std_return = std_dev returns in

      if Float.abs std_return < Float.epsilon then 0.0
      else (mean_return -. risk_free_rate) /. std_return

    (** Calculate maximum drawdown *)
    let max_drawdown (values: float list) : float =
      let rec calc_dd peak current_dd = function
        | [] -> current_dd
        | value :: rest ->
            let new_peak = Float.max peak value in
            let drawdown = (new_peak -. value) /. new_peak in
            let new_dd = Float.max current_dd drawdown in
            calc_dd new_peak new_dd rest
      in

      match values with
      | [] -> 0.0
      | first :: rest -> calc_dd first 0.0 rest

    (** Calculate Sortino ratio (like Sharpe but only downside volatility) *)
    let sortino_ratio
        ~(returns: float list)
        ~(risk_free_rate: float)
      : float =

      let mean_return = mean returns in

      (* Downside deviation (only negative returns) *)
      let negative_returns =
        List.filter returns ~f:(fun r -> r < risk_free_rate)
      in

      if List.is_empty negative_returns then Float.infinity
      else
        let downside_std = std_dev negative_returns in

        if Float.abs downside_std < Float.epsilon then 0.0
        else (mean_return -. risk_free_rate) /. downside_std

    (** Calculate beta (systematic risk) *)
    let beta
        ~(portfolio_returns: float list)
        ~(market_returns: float list)
      : float option =

      match correlation portfolio_returns market_returns with
      | None -> None
      | Some corr ->
          let portfolio_std = std_dev portfolio_returns in
          let market_std = std_dev market_returns in

          Some (corr *. portfolio_std /. market_std)

  end

  (** Comprehensive risk assessment *)
  type risk_assessment = {
    var_95: float;
    var_99: float;
    cvar_95: float;
    expected_loss: float;
    worst_case_stress_loss: float;
    stress_test_results: (string * float) list;
    sharpe_ratio: float option;
    max_drawdown: float option;
    recommended_reserves: usd_cents;
  } [@@deriving sexp, yojson]

  let calculate_risk_assessment
      ~(vault: vault_state)
      ~(historical_returns: float list option)
    : risk_assessment =

    (* Calculate expected loss across all policies *)
    let expected_loss =
      List.fold vault.active_policies ~init:0.0 ~f:(fun acc policy ->
        acc +. DepegAnalysis.expected_loss_per_policy
          policy.asset
          ~coverage:policy.coverage_amount
          ~trigger_price:policy.trigger_price
      )
    in

    (* Run stress tests *)
    let stress_results = StressTest.run_all_scenarios vault in
    let worst_case = StressTest.worst_case_loss vault in

    (* VaR calculations (if we have historical return data) *)
    let (var_95, var_99, cvar_95, sharpe, max_dd) = match historical_returns with
      | None -> (0.0, 0.0, 0.0, None, None)
      | Some returns ->
          let v95 = VaR.calculate_var ~returns ~confidence_level:0.95 in
          let v99 = VaR.calculate_var ~returns ~confidence_level:0.99 in
          let cv95 = VaR.conditional_var ~returns ~confidence_level:0.95 in
          let sr = PortfolioMetrics.sharpe_ratio ~returns ~risk_free_rate:0.05 in
          let mdd = PortfolioMetrics.max_drawdown returns in

          (v95, v99, cv95, Some sr, Some mdd)
    in

    (* Recommended reserves = Expected Loss + Buffer for worst-case *)
    let recommended_reserves =
      let base_reserves = expected_loss *. 1.5 in (* 150% of expected loss *)
      let stress_buffer = Float.max 0.0 worst_case *. 0.5 in (* 50% of worst-case *)
      usd_to_cents (base_reserves +. stress_buffer)
    in

    {
      var_95;
      var_99;
      cvar_95;
      expected_loss;
      worst_case_stress_loss = worst_case;
      stress_test_results = stress_results;
      sharpe_ratio = sharpe;
      max_drawdown = max_dd;
      recommended_reserves;
    }

end

(** Unit tests *)
module Tests = struct
  open Alcotest

  let test_depeg_probability () =
    let prob = RiskModel.DepegAnalysis.annual_depeg_probability
      USDC
      ~threshold:0.97
    in

    (* USDC has 2 historical depegs below $0.97 in 5 years *)
    (* Expected: 2/5 = 0.4 per year *)
    check bool "USDC depeg probability reasonable"
      (prob > 0.2 && prob < 0.6) true

  let test_expected_loss () =
    let loss = RiskModel.DepegAnalysis.expected_loss_per_policy
      USDC
      ~coverage:(Math.usd_to_cents 100_000.0)
      ~trigger_price:0.97
    in

    (* Should be positive but << coverage amount *)
    check bool "expected loss is positive" (loss > 0.0) true;
    check bool "expected loss < coverage" (loss < 100_000.0) true

  let test_var_calculation () =
    (* Simulate returns *)
    Random.init 42;
    let returns = List.init 1000 ~f:(fun _ ->
      Math.normal_random ~mean:0.05 ~std_dev:0.10
    ) in

    let var_95 = RiskModel.VaR.calculate_var ~returns ~confidence_level:0.95 in

    (* VaR should be negative (loss) and within reasonable range *)
    check bool "VaR is negative" (var_95 < 0.0) true;
    check bool "VaR magnitude reasonable"
      (Float.abs var_95 < 0.50) true (* Less than 50% loss *)

  let suite = [
    ("depeg probability", `Quick, test_depeg_probability);
    ("expected loss", `Quick, test_expected_loss);
    ("VaR calculation", `Quick, test_var_calculation);
  ]

end
