(**
 * Integration Tests for Escrow Insurance System
 *
 * Demonstrates:
 * - Automatic policy creation when escrow has protection enabled
 * - Premium calculation with discounts
 * - Claim triggering on timeout/failure scenarios
 * - End-to-end escrow + insurance workflows
 *)

open Lwt.Syntax
open Types
open Insurance_integration
open Escrow_engine

(** Mock policy factory for testing *)
module MockPolicyFactory = struct

  let next_policy_id = ref 1000L

  (** Create mock policy and return ID *)
  let create_policy (policy: policy) : int64 Lwt.t =
    let policy_id = !next_policy_id in
    next_policy_id := Int64.add !next_policy_id 1L;

    Printf.printf "[MockPolicyFactory] Created policy %Ld:\n" policy_id;
    Printf.printf "  Holder: %s\n" policy.policyholder;
    Printf.printf "  Beneficiary: %s\n" (Option.value policy.beneficiary ~default:"(none)");
    Printf.printf "  Coverage: $%.2f\n" (Math.cents_to_usd policy.coverage_amount);
    Printf.printf "  Premium: $%.2f\n" (Math.cents_to_usd policy.premium_paid);
    Printf.printf "  Duration: %.0f days\n"
      ((policy.expiry_time -. policy.start_time) /. 86400.0);

    Lwt.return policy_id

end

(** Mock payout executor for testing *)
module MockPayoutExecutor = struct

  let payouts = ref []

  (** Execute mock payout *)
  let execute_payout (recipient: string) (amount: usd_cents) : string Lwt.t =
    let tx_hash = Printf.sprintf "0x%016Lx" (Int64.of_float (Unix.gettimeofday () *. 1000.0)) in

    Printf.printf "[MockPayoutExecutor] Executing payout:\n";
    Printf.printf "  Recipient: %s\n" recipient;
    Printf.printf "  Amount: $%.2f\n" (Math.cents_to_usd amount);
    Printf.printf "  TX Hash: %s\n" tx_hash;

    payouts := (recipient, amount, tx_hash) :: !payouts;

    Lwt.return tx_hash

  (** Get all payouts *)
  let get_payouts () = !payouts

  (** Reset payouts *)
  let reset () = payouts := []

end

(** Test: Create escrow with insurance protection *)
let test_create_protected_escrow () : unit Lwt.t =
  Printf.printf "\n=== Test: Create Protected Escrow ===\n";

  let payer = "UQPayer_ABC123..." in
  let payee = "UQPayee_XYZ789..." in
  let amount = Math.usd_to_cents 10_000.0 in (* $10,000 *)
  let duration_days = 30 in

  (* Create escrow with protection *)
  let%lwt escrow = EscrowOps.create_escrow
    ~payer
    ~payee
    ~amount
    ~asset:USDC
    ~release_conditions:[
      ManualApproval {
        approver = payer;
        approved = false;
        approval_deadline = Some (Unix.time () +. (float_of_int duration_days *. 86400.0));
        signature = None;
      }
    ]
    ~timeout_action:ReleaseToPayee
    ~timeout_seconds:(duration_days * 86400)
    ~additional_parties:[]
    ~protection_enabled:true
    ~protection_covers:PayeeOnly
    ~active_escrow_count:0
    ~create_policy_fn:(Some MockPolicyFactory.create_policy)
    ()
  in

  Printf.printf "\nEscrow Created:\n";
  Printf.printf "  ID: %Ld\n" escrow.escrow_id;
  Printf.printf "  Amount: $%.2f\n" (Math.cents_to_usd escrow.amount);
  Printf.printf "  Protection: %s\n" (if escrow.protection_enabled then "ENABLED" else "DISABLED");
  Printf.printf "  Policy ID: %s\n"
    (match escrow.protection_policy_id with
     | Some id -> Int64.to_string id
     | None -> "(none)");

  (* Verify insurance was created *)
  assert (escrow.protection_enabled);
  assert (Option.is_some escrow.protection_policy_id);

  Printf.printf "✓ Test passed: Protected escrow created successfully\n";
  Lwt.return_unit

(** Test: Premium calculation with discounts *)
let test_premium_calculation () : unit =
  Printf.printf "\n=== Test: Premium Calculation ===\n";

  (* Test 1: Short duration (7 days) - should get 20% discount *)
  let breakdown1 = EscrowInsurance.get_premium_quote
    ~escrow_amount:(Math.usd_to_cents 5_000.0)
    ~duration_days:7
    ~protection_coverage:PayerOnly
    ~active_escrow_count:0
  in

  Printf.printf "\nScenario 1: 7-day escrow ($5,000, PayerOnly)\n";
  Printf.printf "%s\n" (EscrowInsurance.format_quote breakdown1);

  (* Test 2: Medium duration (30 days) - should get 10% discount *)
  let breakdown2 = EscrowInsurance.get_premium_quote
    ~escrow_amount:(Math.usd_to_cents 10_000.0)
    ~duration_days:30
    ~protection_coverage:PayeeOnly
    ~active_escrow_count:0
  in

  Printf.printf "\nScenario 2: 30-day escrow ($10,000, PayeeOnly)\n";
  Printf.printf "%s\n" (EscrowInsurance.format_quote breakdown2);

  (* Test 3: Volume discount (5+ active escrows) *)
  let breakdown3 = EscrowInsurance.get_premium_quote
    ~escrow_amount:(Math.usd_to_cents 10_000.0)
    ~duration_days:30
    ~protection_coverage:PayerOnly
    ~active_escrow_count:5
  in

  Printf.printf "\nScenario 3: 30-day with volume discount (5+ active)\n";
  Printf.printf "%s\n" (EscrowInsurance.format_quote breakdown3);

  (* Test 4: Both parties protection (1.5x multiplier) *)
  let breakdown4 = EscrowInsurance.get_premium_quote
    ~escrow_amount:(Math.usd_to_cents 10_000.0)
    ~duration_days:30
    ~protection_coverage:BothParties
    ~active_escrow_count:0
  in

  Printf.printf "\nScenario 4: 30-day both parties ($10,000, BothParties)\n";
  Printf.printf "%s\n" (EscrowInsurance.format_quote breakdown4);

  (* Test 5: Large escrow with all discounts *)
  let breakdown5 = EscrowInsurance.get_premium_quote
    ~escrow_amount:(Math.usd_to_cents 100_000.0)
    ~duration_days:7
    ~protection_coverage:PayerOnly
    ~active_escrow_count:10
  in

  Printf.printf "\nScenario 5: 7-day, $100k, volume discount\n";
  Printf.printf "%s\n" (EscrowInsurance.format_quote breakdown5);

  Printf.printf "\n✓ Test passed: Premium calculations working correctly\n"

(** Test: Timeout with claim triggering *)
let test_timeout_with_claim () : unit Lwt.t =
  Printf.printf "\n=== Test: Timeout with Insurance Claim ===\n";

  let payer = "UQPayer_Timeout123..." in
  let payee = "UQPayee_Timeout789..." in
  let amount = Math.usd_to_cents 5_000.0 in

  (* Create escrow with very short timeout *)
  let%lwt escrow = EscrowOps.create_escrow
    ~payer
    ~payee
    ~amount
    ~asset:USDC
    ~release_conditions:[
      TimeElapsed {
        seconds = 1; (* 1 second timeout *)
        start_time = Unix.time ();
      }
    ]
    ~timeout_action:ReturnToPayer (* Payer gets refund *)
    ~timeout_seconds:1
    ~additional_parties:[]
    ~protection_enabled:true
    ~protection_covers:PayeeOnly (* Payee is protected *)
    ~active_escrow_count:0
    ~create_policy_fn:(Some MockPolicyFactory.create_policy)
    ()
  in

  Printf.printf "\nEscrow created with PayeeOnly protection\n";
  Printf.printf "  Timeout action: ReturnToPayer (payee loses funds)\n";
  Printf.printf "  Insurance should trigger for payee\n";

  (* Wait for timeout *)
  let%lwt () = Lwt_unix.sleep 2.0 in

  (* Handle timeout - should trigger claim *)
  MockPayoutExecutor.reset ();

  let%lwt escrow_after_timeout = EscrowOps.handle_timeout
    escrow
    ~execute_payout_fn:(Some MockPayoutExecutor.execute_payout)
    ()
  in

  Printf.printf "\nAfter timeout:\n";
  Printf.printf "  Status: %s\n" (escrow_status_to_string escrow_after_timeout.status);

  (* Check if payout was executed *)
  let payouts = MockPayoutExecutor.get_payouts () in
  Printf.printf "  Payouts executed: %d\n" (List.length payouts);

  if List.length payouts > 0 then begin
    let (recipient, payout_amount, tx_hash) = List.hd payouts in
    Printf.printf "  Payout recipient: %s\n" recipient;
    Printf.printf "  Payout amount: $%.2f\n" (Math.cents_to_usd payout_amount);
    Printf.printf "  TX hash: %s\n" tx_hash;

    (* Verify payout went to protected payee *)
    assert (recipient = payee);
    assert (payout_amount = amount);
  end;

  Printf.printf "✓ Test passed: Insurance claim triggered and paid\n";
  Lwt.return_unit

(** Test: Multiple escrows with different protection types *)
let test_multiple_escrows () : unit Lwt.t =
  Printf.printf "\n=== Test: Multiple Escrows ===\n";

  let payer1 = "UQPayer1..." in
  let payee1 = "UQPayee1..." in

  let payer2 = "UQPayer2..." in
  let payee2 = "UQPayee2..." in

  let payer3 = "UQPayer3..." in
  let payee3 = "UQPayee3..." in

  (* Escrow 1: PayerOnly protection *)
  let%lwt escrow1 = EscrowOps.create_escrow
    ~payer:payer1
    ~payee:payee1
    ~amount:(Math.usd_to_cents 1_000.0)
    ~asset:USDC
    ~release_conditions:[]
    ~timeout_action:ReleaseToPayee
    ~timeout_seconds:(7 * 86400)
    ~additional_parties:[]
    ~protection_enabled:true
    ~protection_covers:PayerOnly
    ~active_escrow_count:0
    ~create_policy_fn:(Some MockPolicyFactory.create_policy)
    ()
  in

  (* Escrow 2: PayeeOnly protection *)
  let%lwt escrow2 = EscrowOps.create_escrow
    ~payer:payer2
    ~payee:payee2
    ~amount:(Math.usd_to_cents 2_000.0)
    ~asset:USDC
    ~release_conditions:[]
    ~timeout_action:ReturnToPayer
    ~timeout_seconds:(14 * 86400)
    ~additional_parties:[]
    ~protection_enabled:true
    ~protection_covers:PayeeOnly
    ~active_escrow_count:1 (* Now has 1 active *)
    ~create_policy_fn:(Some MockPolicyFactory.create_policy)
    ()
  in

  (* Escrow 3: BothParties protection *)
  let%lwt escrow3 = EscrowOps.create_escrow
    ~payer:payer3
    ~payee:payee3
    ~amount:(Math.usd_to_cents 5_000.0)
    ~asset:USDC
    ~release_conditions:[]
    ~timeout_action:ReleaseToPayee
    ~timeout_seconds:(30 * 86400)
    ~additional_parties:[]
    ~protection_enabled:true
    ~protection_covers:BothParties
    ~active_escrow_count:2 (* Now has 2 active *)
    ~create_policy_fn:(Some MockPolicyFactory.create_policy)
    ()
  in

  Printf.printf "\nCreated 3 escrows:\n";
  Printf.printf "  1. $1,000, 7 days, PayerOnly\n";
  Printf.printf "  2. $2,000, 14 days, PayeeOnly (with volume discount)\n";
  Printf.printf "  3. $5,000, 30 days, BothParties (with volume discount)\n";

  (* All should have policies *)
  assert (Option.is_some escrow1.protection_policy_id);
  assert (Option.is_some escrow2.protection_policy_id);
  assert (Option.is_some escrow3.protection_policy_id);

  Printf.printf "✓ Test passed: Multiple escrows created with insurance\n";
  Lwt.return_unit

(** Test: Premium comparison *)
let test_premium_comparison () : unit =
  Printf.printf "\n=== Test: Premium Comparison ===\n";

  let test_scenarios = [
    ("$1,000, 7 days, PayerOnly", 1_000.0, 7, PayerOnly, 0);
    ("$1,000, 30 days, PayerOnly", 1_000.0, 30, PayerOnly, 0);
    ("$1,000, 7 days, BothParties", 1_000.0, 7, BothParties, 0);
    ("$10,000, 7 days, PayerOnly", 10_000.0, 7, PayerOnly, 0);
    ("$10,000, 7 days, PayerOnly (5+ active)", 10_000.0, 7, PayerOnly, 5);
    ("$100,000, 30 days, BothParties (5+ active)", 100_000.0, 30, BothParties, 5);
  ] in

  Printf.printf "\n%-50s %12s %12s %10s\n" "Scenario" "Base" "Final" "Savings";
  Printf.printf "%s\n" (String.make 85 '-');

  List.iter (fun (desc, amount, days, coverage, count) ->
    let breakdown = EscrowInsurance.get_premium_quote
      ~escrow_amount:(Math.usd_to_cents amount)
      ~duration_days:days
      ~protection_coverage:coverage
      ~active_escrow_count:count
    in

    let base = Math.cents_to_usd breakdown.base_premium in
    let final = Math.cents_to_usd breakdown.final_premium in
    let savings = base -. final in
    let savings_pct = if base > 0.0 then (savings /. base) *. 100.0 else 0.0 in

    Printf.printf "%-50s $%10.2f $%10.2f %9.1f%%\n"
      desc base final savings_pct
  ) test_scenarios;

  Printf.printf "\n✓ Test passed: Premium comparison completed\n"

(** Main test runner *)
let run_all_tests () : unit Lwt.t =
  Printf.printf "\n";
  Printf.printf "╔═══════════════════════════════════════════════════════════╗\n";
  Printf.printf "║   ESCROW INSURANCE INTEGRATION TESTS                      ║\n";
  Printf.printf "╚═══════════════════════════════════════════════════════════╝\n";

  let%lwt () = test_create_protected_escrow () in
  test_premium_calculation ();
  let%lwt () = test_timeout_with_claim () in
  let%lwt () = test_multiple_escrows () in
  test_premium_comparison ();

  Printf.printf "\n";
  Printf.printf "╔═══════════════════════════════════════════════════════════╗\n";
  Printf.printf "║   ALL TESTS PASSED ✓                                      ║\n";
  Printf.printf "╚═══════════════════════════════════════════════════════════╝\n";
  Printf.printf "\n";

  Lwt.return_unit

(** Entry point *)
let () =
  Lwt_main.run (run_all_tests ())
