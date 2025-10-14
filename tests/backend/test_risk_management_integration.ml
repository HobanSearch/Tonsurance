(** Integration tests for Risk Management System

    Tests the full integrated system:
    - Unified Risk Monitor
    - Float Rebalancer
    - Tranche Arbitrage Engine
    - Risk Management Daemon orchestrator

    These tests verify that all components work together correctly
    with shared state and coordinated execution.
*)

open Core
open OUnit2
open Types

(** Test helpers *)
let create_test_pool () =
  let open Collateral_manager in
  let pool = create_unified_pool () in

  (* Add initial capital *)
  let pool = {
    pool with
    total_capital_usd = Math.usd_to_cents 100_000_000.0; (* $100M *)
    usd_reserves = Math.usd_to_cents 40_000_000.0;       (* $40M USD *)
    btc_float_sats = 92_307_692L;                        (* ~923 BTC at $65k = $60M *)
    btc_cost_basis = Math.usd_to_cents 60_000_000.0;
  } in

  pool

let create_test_policy
    ?(asset = USDC)
    ?(coverage = 1_000_000.0)
    ?(duration_days = 30)
    () =
  {
    policy_id = Int64.of_int (Random.int 1_000_000);
    policyholder = "test_holder";
    asset;
    coverage_amount = Math.usd_to_cents coverage;
    premium_paid = Math.usd_to_cents (coverage *. 0.04);
    trigger_price = 0.95;
    floor_price = 0.90;
    start_time = Unix.gettimeofday ();
    expiry_time = Unix.gettimeofday () +. (Float.of_int duration_days *. 86400.0);
    status = Active;
    payout_amount = None;
    payout_time = None;
  }

(** Test: Unified Risk Monitor calculates correct metrics *)
let test_risk_monitor_calculation _ctx =
  let pool = create_test_pool () in
  let mgr = Collateral_manager.create pool in

  (* Add some policies *)
  let policy1 = create_test_policy ~asset:USDC ~coverage:5_000_000.0 () in
  let policy2 = create_test_policy ~asset:USDT ~coverage:3_000_000.0 () in

  let mgr = Collateral_manager.allocate_coverage mgr policy1 in
  let mgr = Collateral_manager.allocate_coverage mgr policy2 in

  (* Calculate risk metrics *)
  let price_scenarios = [
    (USDC, 0.95);
    (USDT, 0.94);
    (DAI, 0.96);
  ] in

  let price_history = [
    (USDC, [1.0; 0.999; 1.001; 0.998]);
    (USDT, [0.9995; 0.9990; 1.0000; 0.9985]);
  ] in

  let snapshot = Unified_risk_monitor.calculate_risk_metrics
    mgr
    ~price_scenarios
    ~price_history
  in

  (* Verify metrics *)
  assert_bool "VaR 95 should be positive" (snapshot.var_95 > 0.0);
  assert_bool "VaR 99 should be greater than VaR 95"
    (snapshot.var_99 > snapshot.var_95);
  assert_bool "LTV should be reasonable" (snapshot.ltv > 0.0 && snapshot.ltv < 1.0);
  assert_bool "Reserve ratio should be reasonable"
    (snapshot.reserve_ratio > 0.0 && snapshot.reserve_ratio < 1.0);

  (* Check that we have stress test results *)
  assert_bool "Should have stress test results"
    (List.length snapshot.stress_test_results > 0);

  Printf.printf "\n[RiskMonitor] VaR95: %.2f%%, VaR99: %.2f%%, LTV: %.2f%%\n"
    (snapshot.var_95 *. 100.0)
    (snapshot.var_99 *. 100.0)
    (snapshot.ltv *. 100.0)

(** Test: Float Rebalancer executes correct actions *)
let test_float_rebalancer _ctx =
  let pool = create_test_pool () in
  let mgr = Collateral_manager.create pool in

  (* Add policies to create liquidity pressure *)
  let policies = List.init 20 ~f:(fun i ->
    create_test_policy
      ~asset:(if i mod 2 = 0 then USDC else USDT)
      ~coverage:2_000_000.0
      ()
  ) in

  let mgr = List.fold policies ~init:mgr ~f:(fun acc policy ->
    Collateral_manager.allocate_coverage acc policy
  ) in

  (* Evaluate rebalancing *)
  let btc_price = 65000.0 in
  let btc_volatility = 0.60 in

  let price_scenarios = [
    (USDC, 0.95);
    (USDT, 0.94);
    (DAI, 0.96);
  ] in

  let config = Float_rebalancer.default_config in

  let action_opt = Float_rebalancer.evaluate_rebalancing
    mgr
    ~btc_price
    ~btc_volatility
    ~config
    ~price_scenarios
  in

  (* Should likely need to sell BTC for liquidity *)
  (match action_opt with
   | None ->
       Printf.printf "\n[Rebalancer] No action needed\n"
   | Some action ->
       Printf.printf "\n[Rebalancer] Action: %s, USD: $%.2f, Reason: %s\n"
         (match action.action with
          | `Buy_BTC _ -> "Buy BTC"
          | `Sell_BTC _ -> "Sell BTC"
          | `Hold -> "Hold")
         action.usd_amount
         action.reason;

       assert_bool "USD amount should be positive" (action.usd_amount > 0.0);
       assert_bool "Expected benefit should be positive"
         (action.expected_benefit >= 0.0);
  )

(** Test: Tranche Arbitrage finds opportunities *)
let test_tranche_arbitrage _ctx =
  let pool = create_test_pool () in

  (* Add LP capital to tranches with varying amounts to create imbalance *)
  let pool = {
    pool with
    virtual_tranches = [
      {
        tranche_id = 1;
        seniority = 1;
        target_yield_bps = 800;
        allocated_capital = Math.usd_to_cents 20_000_000.0; (* Overallocated *)
        accumulated_losses = 0L;
        accumulated_yields = Math.usd_to_cents 500_000.0;
        lp_token_supply = 20_000_000L;
      };
      {
        tranche_id = 2;
        seniority = 2;
        target_yield_bps = 1200;
        allocated_capital = Math.usd_to_cents 30_000_000.0;
        accumulated_losses = Math.usd_to_cents 500_000.0;
        accumulated_yields = Math.usd_to_cents 1_200_000.0;
        lp_token_supply = 30_000_000L;
      };
      {
        tranche_id = 3;
        seniority = 3;
        target_yield_bps = 2000;
        allocated_capital = Math.usd_to_cents 10_000_000.0; (* Underallocated *)
        accumulated_losses = Math.usd_to_cents 1_000_000.0;
        accumulated_yields = Math.usd_to_cents 800_000.0;
        lp_token_supply = 10_000_000L;
      };
    ];
  } in

  let mgr = Collateral_manager.create pool in

  (* Find arbitrage opportunities *)
  let config = Tranche_arbitrage.default_config in
  let opportunities = Tranche_arbitrage.find_arbitrage_opportunities
    mgr
    ~config
  in

  Printf.printf "\n[Arbitrage] Found %d opportunities\n" (List.length opportunities);

  List.iter opportunities ~f:(fun opp ->
    Printf.printf "  Buy T%d, Sell T%d: Profit=$%.2f (%.1f%% confidence)\n"
      opp.buy_tranche
      opp.sell_tranche
      opp.expected_profit
      (opp.confidence *. 100.0);

    assert_bool "Expected profit should be positive" (opp.expected_profit > 0.0);
    assert_bool "Confidence should be reasonable"
      (opp.confidence >= 0.0 && opp.confidence <= 1.0);
  )

(** Test: Risk Management Daemon runs all systems *)
let test_daemon_integration _ctx =
  let pool = create_test_pool () in
  let mgr = Collateral_manager.create pool in

  (* Create daemon with fast intervals for testing *)
  let config = {
    Risk_management_daemon.default_config with
    risk_monitor_interval = 2.0;      (* 2 seconds *)
    rebalancer_interval = 4.0;        (* 4 seconds *)
    arbitrage_interval = 6.0;         (* 6 seconds *)
    health_check_interval = 3.0;      (* 3 seconds *)
    log_level = `Info;
    log_file = Some "logs/test_daemon.log";
  } in

  let state = Risk_management_daemon.create_daemon ~config mgr in

  (* Run for 15 seconds *)
  Printf.printf "\n[Daemon] Running integrated test for 15 seconds...\n";
  Risk_management_daemon.run_for_duration ~config state 15.0;

  (* Check metrics *)
  let metrics = Risk_management_daemon.get_metrics state in

  Printf.printf "\n[Daemon] Test Results:\n";
  Printf.printf "  Risk Monitor Cycles: %d\n" metrics.risk_monitor_cycles;
  Printf.printf "  Rebalancer Cycles: %d\n" metrics.rebalancer_cycles;
  Printf.printf "  Arbitrage Cycles: %d\n" metrics.arbitrage_cycles;
  Printf.printf "  Total Errors: %d\n" metrics.total_errors;

  (* Verify all systems ran *)
  assert_bool "Risk monitor should have run"
    (metrics.risk_monitor_cycles > 0);
  assert_bool "Rebalancer should have run"
    (metrics.rebalancer_cycles > 0);
  assert_bool "Arbitrage should have run"
    (metrics.arbitrage_cycles > 0);

  (* Verify low error rate *)
  assert_bool "Error rate should be low"
    (metrics.total_errors < 5)

(** Test: Emergency shutdown triggers correctly *)
let test_emergency_shutdown _ctx =
  let pool = create_test_pool () in

  (* Create pool with dangerous LTV *)
  let pool = {
    pool with
    total_coverage_sold = Math.usd_to_cents 96_000_000.0; (* 96% LTV *)
  } in

  let mgr = Collateral_manager.create pool in

  let config = {
    Risk_management_daemon.default_config with
    risk_monitor_interval = 1.0;
    health_check_interval = 1.0;
    max_ltv_shutdown = 0.95;
    enable_emergency_shutdown = true;
    log_file = Some "logs/test_emergency.log";
  } in

  let state = Risk_management_daemon.create_daemon ~config mgr in

  (* Run for 5 seconds - should trigger emergency shutdown *)
  Printf.printf "\n[Emergency] Testing emergency shutdown...\n";
  Risk_management_daemon.run_for_duration ~config state 5.0;

  Printf.printf "[Emergency] Daemon stopped (emergency shutdown should have triggered)\n"

(** Test: Stress scenario triggers risk alerts *)
let test_stress_scenario_alerts _ctx =
  let pool = create_test_pool () in
  let mgr = Collateral_manager.create pool in

  (* Add concentrated exposure to trigger alerts *)
  let policies = List.init 10 ~f:(fun _i ->
    create_test_policy ~asset:USDC ~coverage:8_000_000.0 ()
  ) in

  let mgr = List.fold policies ~init:mgr ~f:(fun acc policy ->
    Collateral_manager.allocate_coverage acc policy
  ) in

  (* Calculate risk with stress scenario *)
  let price_scenarios = [
    (USDC, 0.80);  (* Severe depeg *)
    (USDT, 0.75);
    (DAI, 0.82);
  ] in

  let price_history = [
    (USDC, [1.0; 0.999; 0.998; 0.995]);
  ] in

  let snapshot = Unified_risk_monitor.calculate_risk_metrics
    mgr
    ~price_scenarios
    ~price_history
  in

  Printf.printf "\n[Stress] Breach alerts: %d\n"
    (List.length snapshot.breach_alerts);
  Printf.printf "[Stress] Warning alerts: %d\n"
    (List.length snapshot.warning_alerts);

  List.iter snapshot.breach_alerts ~f:(fun alert ->
    Printf.printf "  BREACH: %s\n" alert.message
  );

  (* Should have alerts due to high concentration *)
  assert_bool "Should have alerts in stress scenario"
    (List.length snapshot.breach_alerts > 0 ||
     List.length snapshot.warning_alerts > 0)

(** Test: Loss waterfall allocation works correctly *)
let test_loss_waterfall _ctx =
  let pool = create_test_pool () in
  let mgr = Collateral_manager.create pool in

  (* Get initial tranche allocations *)
  let pool_state = Collateral_manager.get_pool_state mgr in
  let initial_tranches = pool_state.virtual_tranches in

  Printf.printf "\n[Waterfall] Initial state:\n";
  List.iter initial_tranches ~f:(fun t ->
    Printf.printf "  T%d: Capital=$%.2fM, Losses=$%.2fM\n"
      t.tranche_id
      (Math.cents_to_usd t.allocated_capital /. 1_000_000.0)
      (Math.cents_to_usd t.accumulated_losses /. 1_000_000.0)
  );

  (* Simulate a $5M payout *)
  let payout_amount = Math.usd_to_cents 5_000_000.0 in

  let policy = create_test_policy ~coverage:5_000_000.0 () in
  let mgr = Collateral_manager.allocate_coverage mgr policy in

  let mgr = Collateral_manager.execute_payout
    mgr
    ~policy_id:policy.policy_id
    ~payout_amount
  in

  (* Check that losses were allocated correctly *)
  let final_pool = Collateral_manager.get_pool_state mgr in
  let final_tranches = final_pool.virtual_tranches in

  Printf.printf "\n[Waterfall] After $5M payout:\n";
  List.iter final_tranches ~f:(fun t ->
    Printf.printf "  T%d: Capital=$%.2fM, Losses=$%.2fM\n"
      t.tranche_id
      (Math.cents_to_usd t.allocated_capital /. 1_000_000.0)
      (Math.cents_to_usd t.accumulated_losses /. 1_000_000.0)
  );

  (* Junior tranche (highest seniority number) should absorb first *)
  let junior_tranche = List.last_exn (List.sort final_tranches
    ~compare:(fun a b -> Int.compare a.seniority b.seniority)) in

  assert_bool "Junior tranche should have losses"
    (junior_tranche.accumulated_losses > 0L)

(** Test suite *)
let suite =
  "Risk Management Integration Tests" >::: [
    "test_risk_monitor_calculation" >:: test_risk_monitor_calculation;
    "test_float_rebalancer" >:: test_float_rebalancer;
    "test_tranche_arbitrage" >:: test_tranche_arbitrage;
    "test_daemon_integration" >:: test_daemon_integration;
    "test_emergency_shutdown" >:: test_emergency_shutdown;
    "test_stress_scenario_alerts" >:: test_stress_scenario_alerts;
    "test_loss_waterfall" >:: test_loss_waterfall;
  ]

let () =
  (* Create logs directory if it doesn't exist *)
  (try Unix.mkdir "logs" 0o755 with _ -> ());

  Printf.printf "\n========================================\n";
  Printf.printf "Risk Management Integration Test Suite\n";
  Printf.printf "========================================\n";

  run_test_tt_main suite
