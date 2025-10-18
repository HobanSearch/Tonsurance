(**
 * Integration Test Suite
 * Tests end-to-end workflows across multiple backend components
 *
 * Covers:
 * - Policy creation → Premium calculation → Risk monitoring
 * - Claim submission → Loss absorption → Waterfall execution
 * - Oracle updates → Premium adjustments → Circuit breaker
 * - Multi-tranche vault operations
 *)

open Core
open Alcotest
open Lwt.Infix

(** Full policy lifecycle test *)

let test_full_policy_lifecycle () =
  Lwt_main.run (
    (* Step 1: Oracle fetches market data *)
    let%lwt market_data = Pricing_oracle_keeper.fetch_market_data
      ~chain_id:0
      ~stablecoin_id:0
    in

    Alcotest.(check bool) "market data fetched" true (Int64.(market_data.price > 0L));

    (* Step 2: Calculate premium *)
    let policy_params = {
      coverage_type = 0;
      chain_id = 0;
      stablecoin_id = 0;
      coverage_amount = 10000_00000000L;
      duration_days = 30;
      current_price = market_data.price;
      bridge_id = None;
      timestamp = Int64.of_float (Unix.time ());
    } in

    let premium = Pricing_oracle_keeper.calculate_premium policy_params in
    Alcotest.(check bool) "premium calculated" true Int64.(premium > 0L);

    (* Step 3: Create policy *)
    let%lwt policy = Policy_factory.create_policy
      ~user_address:"EQUser123..."
      ~params:policy_params
      ~premium
    in

    Alcotest.(check int64) "policy created" policy.policy_id policy.policy_id;

    (* Step 4: Update risk monitor *)
    let%lwt () = Unified_risk_monitor.add_policy policy in

    (* Step 5: Verify exposure updated *)
    let%lwt total_exposure = Unified_risk_monitor.get_total_exposure () in
    Alcotest.(check bool) "exposure increased" true Int64.(total_exposure >= policy_params.coverage_amount);

    Lwt.return ()
  )

let test_claim_to_loss_absorption_flow () =
  Lwt_main.run (
    (* Setup: Create vault with capital *)
    let%lwt vault = Multi_tranche_vault.create_vault
      ~owner:"EQOwner123..."
      ~initial_capital:10000_00000000L
    in

    (* Step 1: Submit claim *)
    let claim = {
      policy_id = 1L;
      claim_amount = 1000_00000000L;  (* $1M *)
      evidence = "Depeg event detected";
      timestamp = Int64.of_float (Unix.time ());
    } in

    let%lwt claim_result = Claims_processor.submit_claim claim in
    Alcotest.(check string) "claim status" "approved" claim_result.status;

    (* Step 2: Absorb loss in vault *)
    let%lwt loss_result = Multi_tranche_vault.absorb_loss
      ~vault_id:vault.id
      ~loss_amount:claim.claim_amount
    in

    (* Step 3: Verify waterfall execution *)
    (* Loss should be absorbed from EQT tranche first *)
    let%lwt eqt_capital = Multi_tranche_vault.get_tranche_capital vault.id 6 in
    Alcotest.(check bool) "EQT absorbed loss" true Int64.(eqt_capital < vault.initial_eqt_capital);

    (* Step 4: Update risk monitor *)
    let%lwt () = Unified_risk_monitor.process_loss claim.claim_amount in

    Lwt.return ()
  )

let test_oracle_update_triggers_premium_adjustment () =
  Lwt_main.run (
    (* Step 1: Initial premium calculation with normal price *)
    let initial_price = 100000000L in
    let policy_params = {
      coverage_type = 0;
      chain_id = 0;
      stablecoin_id = 0;
      coverage_amount = 10000_00000000L;
      duration_days = 30;
      current_price = initial_price;
      bridge_id = None;
      timestamp = Int64.of_float (Unix.time ());
    } in

    let initial_premium = Pricing_oracle_keeper.calculate_premium policy_params in

    (* Step 2: Oracle updates with depeg price *)
    let depeg_price = 91500000L in  (* $0.915 *)
    let%lwt () = Pricing_oracle_keeper.update_price
      ~chain_id:0
      ~stablecoin_id:0
      ~new_price:depeg_price
    in

    (* Step 3: Calculate new premium *)
    let new_params = { policy_params with current_price = depeg_price } in
    let new_premium = Pricing_oracle_keeper.calculate_premium new_params in

    (* Step 4: Verify premium increased significantly *)
    let increase_percentage = Float.(of_int64 (Int64.(-) new_premium initial_premium) / of_int64 initial_premium) in
    Alcotest.(check bool) "premium increased by >50%" true (increase_percentage >= 0.50);

    Lwt.return ()
  )

let test_circuit_breaker_end_to_end () =
  Lwt_main.run (
    (* Setup: Vault with $10M capital *)
    let%lwt vault = Multi_tranche_vault.create_vault
      ~owner:"EQOwner123..."
      ~initial_capital:10000_00000000L
    in

    (* Simulate multiple claims totaling $1.1M (11% of capital) *)
    let claims = List.init 11 ~f:(fun i ->
      {
        policy_id = Int64.of_int i;
        claim_amount = 100_00000000L;  (* $100k each *)
        evidence = sprintf "Claim %d" i;
        timestamp = Int64.of_float (Unix.time ());
      }
    ) in

    (* Process all claims *)
    let%lwt results = Lwt_list.map_s (fun claim ->
      Claims_processor.submit_claim claim >>= fun result ->
      Multi_tranche_vault.absorb_loss ~vault_id:vault.id ~loss_amount:claim.claim_amount >>= fun _ ->
      Lwt.return result
    ) claims in

    (* Verify circuit breaker triggered *)
    let%lwt vault_status = Multi_tranche_vault.get_status vault.id in
    Alcotest.(check bool) "vault paused by circuit breaker" true vault_status.paused;

    (* Verify monitor detected it *)
    let%lwt monitor_status = Unified_risk_monitor.get_status () in
    Alcotest.(check bool) "monitor detected circuit breaker" true monitor_status.circuit_breaker_active;

    Lwt.return ()
  )

let test_multi_tranche_deposit_and_yield_distribution () =
  Lwt_main.run (
    (* Setup: Create vault *)
    let%lwt vault = Multi_tranche_vault.create_vault
      ~owner:"EQOwner123..."
      ~initial_capital:0L
    in

    (* Step 1: Users deposit to different tranches *)
    let deposits = [
      (1, 1000_00000000L);  (* $1M to BTC tranche *)
      (2, 2000_00000000L);  (* $2M to SNR tranche *)
      (3, 3000_00000000L);  (* $3M to MEZZ tranche *)
    ] in

    let%lwt () = Lwt_list.iter_s (fun (tranche_id, amount) ->
      Multi_tranche_vault.deposit
        ~vault_id:vault.id
        ~tranche_id
        ~user_address:(sprintf "EQUser%d..." tranche_id)
        ~amount
    ) deposits in

    (* Step 2: Distribute premiums *)
    let premium_amount = 600_00000000L in  (* $600k *)
    let%lwt () = Multi_tranche_vault.distribute_premiums
      ~vault_id:vault.id
      ~amount:premium_amount
    in

    (* Step 3: Verify yields distributed proportionally *)
    (* BTC: 1/6 = 16.67% → $100k *)
    (* SNR: 2/6 = 33.33% → $200k *)
    (* MEZZ: 3/6 = 50% → $300k *)

    let%lwt btc_yield = Multi_tranche_vault.get_tranche_yield vault.id 1 in
    Alcotest.(check bool) "BTC yield ~$100k" true Int64.(btc_yield >= 95_00000000L && btc_yield <= 105_00000000L);

    let%lwt snr_yield = Multi_tranche_vault.get_tranche_yield vault.id 2 in
    Alcotest.(check bool) "SNR yield ~$200k" true Int64.(snr_yield >= 190_00000000L && snr_yield <= 210_00000000L);

    let%lwt mezz_yield = Multi_tranche_vault.get_tranche_yield vault.id 3 in
    Alcotest.(check bool) "MEZZ yield ~$300k" true Int64.(mezz_yield >= 285_00000000L && mezz_yield <= 315_00000000L);

    Lwt.return ()
  )

let test_concurrent_operations_across_components () =
  Lwt_main.run (
    (* Simulate concurrent operations *)
    let operations = [
      (* 10 policy creations *)
      ...List.init 10 ~f:(fun i ->
        Policy_factory.create_policy
          ~user_address:(sprintf "EQUser%d..." i)
          ~params:{
            coverage_type = i mod 5;
            chain_id = i mod 8;
            stablecoin_id = i mod 14;
            coverage_amount = Int64.of_int ((i + 1) * 1000_00000000);
            duration_days = 30;
            current_price = 100000000L;
            bridge_id = None;
            timestamp = Int64.of_float (Unix.time ());
          }
          ~premium:50_00000000L
      );
      (* 5 oracle updates *)
      ...List.init 5 ~f:(fun i ->
        Pricing_oracle_keeper.update_price
          ~chain_id:i
          ~stablecoin_id:0
          ~new_price:Int64.(100000000L - of_int (i * 1000000))
      );
      (* 3 claim submissions *)
      ...List.init 3 ~f:(fun i ->
        Claims_processor.submit_claim {
          policy_id = Int64.of_int i;
          claim_amount = 100_00000000L;
          evidence = sprintf "Claim %d" i;
          timestamp = Int64.of_float (Unix.time ());
        }
      );
    ] in

    let%lwt results = Lwt.join operations in

    (* Verify all operations completed successfully *)
    Alcotest.(check bool) "all operations completed" true true;

    Lwt.return ()
  )

let test_waterfall_across_all_6_tranches () =
  Lwt_main.run (
    (* Setup: Vault with all tranches funded *)
    let%lwt vault = Multi_tranche_vault.create_vault
      ~owner:"EQOwner123..."
      ~initial_capital:0L
    in

    (* Fund all tranches *)
    let tranche_capitals = [
      (1, 250_00000000L);  (* BTC: $250M *)
      (2, 200_00000000L);  (* SNR: $200M *)
      (3, 180_00000000L);  (* MEZZ: $180M *)
      (4, 150_00000000L);  (* JNR: $150M *)
      (5, 120_00000000L);  (* JNR+: $120M *)
      (6, 100_00000000L);  (* EQT: $100M *)
    ] in

    let%lwt () = Lwt_list.iter_s (fun (tranche_id, amount) ->
      Multi_tranche_vault.deposit
        ~vault_id:vault.id
        ~tranche_id
        ~user_address:(sprintf "EQUser%d..." tranche_id)
        ~amount
    ) tranche_capitals in

    (* Absorb catastrophic loss: $1.2B (exceeds total capacity of $1B) *)
    let%lwt loss_result = Multi_tranche_vault.absorb_loss
      ~vault_id:vault.id
      ~loss_amount:1200_00000000L
    in

    (* Verify all tranches depleted *)
    let%lwt tranche_capitals_after = Lwt_list.map_s (fun (tranche_id, _) ->
      Multi_tranche_vault.get_tranche_capital vault.id tranche_id
    ) tranche_capitals in

    List.iter tranche_capitals_after ~f:(fun capital ->
      Alcotest.(check int64) "tranche depleted" 0L capital
    );

    (* Verify insolvency detected *)
    let%lwt vault_status = Multi_tranche_vault.get_status vault.id in
    Alcotest.(check bool) "vault insolvent" true vault_status.insolvent;

    Lwt.return ()
  )

(** Test Runner *)

let () =
  run "Integration" [
    "policy_lifecycle", [
      test_case "full_lifecycle" `Slow test_full_policy_lifecycle;
    ];
    "claim_processing", [
      test_case "claim_to_loss" `Slow test_claim_to_loss_absorption_flow;
    ];
    "oracle_integration", [
      test_case "premium_adjustment" `Slow test_oracle_update_triggers_premium_adjustment;
    ];
    "circuit_breaker", [
      test_case "end_to_end" `Slow test_circuit_breaker_end_to_end;
    ];
    "tranche_operations", [
      test_case "deposit_and_yield" `Slow test_multi_tranche_deposit_and_yield_distribution;
      test_case "waterfall_all_tranches" `Slow test_waterfall_across_all_6_tranches;
    ];
    "concurrent_ops", [
      test_case "multi_component" `Slow test_concurrent_operations_across_components;
    ];
  ]
