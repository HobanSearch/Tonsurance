(**
 * Unified Risk Monitor Test Suite
 * Tests real-time risk monitoring across all protocols, bridges, and chains
 *
 * Covers:
 * - Aggregate exposure calculation
 * - Risk concentration detection
 * - Circuit breaker triggers
 * - Multi-chain risk aggregation
 * - Bridge health monitoring
 * - Protocol exploit detection
 *)

open Core
open Alcotest
open Lwt.Infix

(** Test exposure calculation across multiple policies *)

let test_calculate_total_exposure () =
  (* Create 100 mock policies across different products *)
  let policies = List.init 100 ~f:(fun i ->
    {
      policy_id = Int64.of_int i;
      coverage_type = i mod 5;
      chain_id = i mod 8;
      stablecoin_id = i mod 14;
      coverage_amount = Int64.of_int ((i + 1) * 1000_00000000);  (* $1k-$100k *)
      status = "active";
    }
  ) in

  let total_exposure = Unified_risk_monitor.calculate_total_exposure policies in

  (* Expected: Sum of all coverage amounts *)
  let expected = Int64.of_int (List.fold policies ~init:0 ~f:(fun acc p ->
    acc + Int64.to_int_exn p.coverage_amount
  )) in

  Alcotest.(check int64) "total exposure" expected total_exposure

let test_concentration_risk_detection () =
  (* Scenario: 70% of exposure is USDC on Ethereum *)
  let policies = [
    { policy_id = 1L; coverage_type = 0; chain_id = 0; stablecoin_id = 0;
      coverage_amount = 7000_00000000L; status = "active" };  (* $7M USDC on ETH *)
    { policy_id = 2L; coverage_type = 0; chain_id = 1; stablecoin_id = 1;
      coverage_amount = 2000_00000000L; status = "active" };  (* $2M USDT on Arbitrum *)
    { policy_id = 3L; coverage_type = 1; chain_id = 2; stablecoin_id = 3;
      coverage_amount = 1000_00000000L; status = "active" };  (* $1M DAI on Base *)
  ] in

  let concentration = Unified_risk_monitor.calculate_concentration_risk policies in

  (* Should flag high concentration (>50%) on USDC/ETH *)
  Alcotest.(check bool) "concentration detected" true concentration.has_high_concentration;
  Alcotest.(check int) "concentrated chain" 0 concentration.primary_chain_id;
  Alcotest.(check int) "concentrated stablecoin" 0 concentration.primary_stablecoin_id;
  Alcotest.(check (float 0.01)) "concentration percentage" 0.70 concentration.percentage

let test_circuit_breaker_10_percent_threshold () =
  (* Total capital: $10M, Loss in 24h: $1.1M (11%) *)
  let total_capital = 10000_00000000L in
  let losses_24h = 1100_00000000L in

  let should_trigger = Unified_risk_monitor.should_trigger_circuit_breaker
    ~total_capital
    ~losses_24h
    ~threshold:0.10
  in

  Alcotest.(check bool) "circuit breaker triggers" true should_trigger

let test_circuit_breaker_below_threshold () =
  (* Total capital: $10M, Loss in 24h: $900k (9%) *)
  let total_capital = 10000_00000000L in
  let losses_24h = 900_00000000L in

  let should_trigger = Unified_risk_monitor.should_trigger_circuit_breaker
    ~total_capital
    ~losses_24h
    ~threshold:0.10
  in

  Alcotest.(check bool) "circuit breaker not triggered" false should_trigger

let test_multi_chain_risk_aggregation () =
  (* Calculate risk across 8 chains *)
  let policies_by_chain = List.init 8 ~f:(fun chain_id ->
    (chain_id, List.init 10 ~f:(fun i ->
      {
        policy_id = Int64.of_int (chain_id * 10 + i);
        coverage_type = 0;
        chain_id;
        stablecoin_id = 0;
        coverage_amount = 1000_00000000L;  (* $1M each *)
        status = "active";
      }
    ))
  ) in

  let chain_exposures = List.map policies_by_chain ~f:(fun (chain_id, policies) ->
    (chain_id, Unified_risk_monitor.calculate_total_exposure policies)
  ) in

  (* Each chain should have $10M exposure *)
  List.iter chain_exposures ~f:(fun (chain_id, exposure) ->
    Alcotest.(check int64) (sprintf "chain %d exposure" chain_id) 10000_00000000L exposure
  );

  (* Total exposure across all chains: $80M *)
  let total = List.fold chain_exposures ~init:0L ~f:(fun acc (_, exp) -> Int64.(acc + exp)) in
  Alcotest.(check int64) "total multi-chain exposure" 80000_00000000L total

let test_bridge_health_monitoring () =
  (* Mock bridge health data *)
  let healthy_bridge = {
    bridge_id = 0;
    name = "CCIP";
    is_healthy = true;
    failed_transactions = 0;
    avg_confirmation_time = 120;
    security_score = 98;
    last_heartbeat = Int64.of_float (Unix.time ());
  } in

  let degraded_bridge = {
    bridge_id = 1;
    name = "Wormhole";
    is_healthy = true;
    failed_transactions = 45;  (* Elevated *)
    avg_confirmation_time = 600;  (* Slow *)
    security_score = 72;  (* Degraded *)
    last_heartbeat = Int64.of_float (Unix.time ());
  } in

  let compromised_bridge = {
    bridge_id = 2;
    name = "Compromised Bridge";
    is_healthy = false;
    failed_transactions = 157;
    avg_confirmation_time = 9999;
    security_score = 12;  (* Critical *)
    last_heartbeat = Int64.of_float (Unix.time ()) - 3600L;  (* Stale *)
  } in

  let health_healthy = Unified_risk_monitor.assess_bridge_health healthy_bridge in
  Alcotest.(check string) "healthy bridge status" "healthy" health_healthy.status;

  let health_degraded = Unified_risk_monitor.assess_bridge_health degraded_bridge in
  Alcotest.(check string) "degraded bridge status" "degraded" health_degraded.status;

  let health_compromised = Unified_risk_monitor.assess_bridge_health compromised_bridge in
  Alcotest.(check string) "compromised bridge status" "compromised" health_compromised.status

let test_protocol_exploit_detection () =
  (* Mock exploit data *)
  let minor_exploit = {
    protocol_name = "TestDeFi";
    chain_id = 1;
    exploit_amount = 500000_00000000L;  (* $500k *)
    timestamp = Int64.of_float (Unix.time ());
    severity = "MEDIUM";
  } in

  let major_exploit = {
    protocol_name = "MegaProtocol";
    chain_id = 0;
    exploit_amount = 120000000_00000000L;  (* $120M *)
    timestamp = Int64.of_float (Unix.time ());
    severity = "CRITICAL";
  } in

  let should_pause_minor = Unified_risk_monitor.should_pause_for_exploit minor_exploit in
  Alcotest.(check bool) "minor exploit no pause" false should_pause_minor;

  let should_pause_major = Unified_risk_monitor.should_pause_for_exploit major_exploit in
  Alcotest.(check bool) "major exploit triggers pause" true should_pause_major

let test_utilization_rate_calculation () =
  (* Total capital: $10M, Active coverage: $7M *)
  let total_capital = 10000_00000000L in
  let active_coverage = 7000_00000000L in

  let utilization = Unified_risk_monitor.calculate_utilization_rate
    ~total_capital
    ~active_coverage
  in

  Alcotest.(check (float 0.01)) "utilization rate" 0.70 utilization

let test_risk_score_calculation () =
  (* Calculate composite risk score from multiple factors *)
  let risk_factors = {
    concentration_risk = 0.75;  (* 75% concentration *)
    utilization_rate = 0.85;    (* 85% utilization *)
    bridge_risk = 0.60;         (* Moderate bridge risk *)
    price_volatility = 0.40;    (* Low volatility *)
    historical_losses = 0.05;   (* 5% historical loss rate *)
  } in

  let risk_score = Unified_risk_monitor.calculate_composite_risk_score risk_factors in

  (* Expected: Weighted average with concentration & utilization having higher weight *)
  (* Risk score should be HIGH (>0.60) *)
  Alcotest.(check bool) "high risk score" true (risk_score >= 0.60)

let test_monitor_realtime_updates () =
  Lwt_main.run (
    (* Simulate real-time monitoring *)
    let monitor_state = ref {
      total_exposure = 0L;
      active_policies = 0;
      circuit_breaker_triggered = false;
      last_update = Int64.of_float (Unix.time ());
    } in

    (* Update 1: Add policies *)
    let%lwt () = Unified_risk_monitor.update_monitor_state
      ~add_exposure:5000_00000000L
      ~add_policies:10
      monitor_state
    in

    Alcotest.(check int64) "exposure after add" 5000_00000000L !monitor_state.total_exposure;
    Alcotest.(check int) "policies after add" 10 !monitor_state.active_policies;

    (* Update 2: Absorb loss *)
    let%lwt () = Unified_risk_monitor.process_loss
      ~loss_amount:600_00000000L  (* $600M *)
      ~total_capital:5000_00000000L  (* 12% loss - triggers CB *)
      monitor_state
    in

    Alcotest.(check bool) "circuit breaker triggered" true !monitor_state.circuit_breaker_triggered;

    Lwt.return ()
  )

let test_alert_generation () =
  (* Test alert generation for various risk events *)
  let high_concentration_alert = Unified_risk_monitor.generate_alert
    ~alert_type:"HIGH_CONCENTRATION"
    ~severity:"WARNING"
    ~message:"70% of exposure concentrated in USDC on Ethereum"
    ~metadata:["chain_id", "0"; "stablecoin_id", "0"; "percentage", "0.70"]
  in

  Alcotest.(check string) "alert type" "HIGH_CONCENTRATION" high_concentration_alert.alert_type;
  Alcotest.(check string) "alert severity" "WARNING" high_concentration_alert.severity;

  let circuit_breaker_alert = Unified_risk_monitor.generate_alert
    ~alert_type:"CIRCUIT_BREAKER"
    ~severity:"CRITICAL"
    ~message:"11% loss in 24h - circuit breaker triggered"
    ~metadata:["loss_percentage", "11.0"; "threshold", "10.0"]
  in

  Alcotest.(check string) "CB alert severity" "CRITICAL" circuit_breaker_alert.severity

(** Test Runner *)

let () =
  run "UnifiedRiskMonitor" [
    "exposure_calculation", [
      test_case "total_exposure" `Quick test_calculate_total_exposure;
      test_case "multi_chain_aggregation" `Quick test_multi_chain_risk_aggregation;
    ];
    "concentration_risk", [
      test_case "detect_concentration" `Quick test_concentration_risk_detection;
    ];
    "circuit_breaker", [
      test_case "trigger_at_10_percent" `Quick test_circuit_breaker_10_percent_threshold;
      test_case "below_threshold" `Quick test_circuit_breaker_below_threshold;
    ];
    "bridge_monitoring", [
      test_case "health_assessment" `Quick test_bridge_health_monitoring;
    ];
    "protocol_exploits", [
      test_case "exploit_detection" `Quick test_protocol_exploit_detection;
    ];
    "risk_metrics", [
      test_case "utilization_rate" `Quick test_utilization_rate_calculation;
      test_case "composite_risk_score" `Quick test_risk_score_calculation;
    ];
    "realtime_monitoring", [
      test_case "monitor_updates" `Quick test_monitor_realtime_updates;
    ];
    "alerting", [
      test_case "alert_generation" `Quick test_alert_generation;
    ];
  ]
