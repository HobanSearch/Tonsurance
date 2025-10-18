(**
 * Integration Tests for Dispute Resolution System
 *
 * Tests the complete dispute flow:
 * 1. Dispute initiation
 * 2. Evidence submission
 * 3. Arbiter selection and assignment
 * 4. Dispute resolution
 * 5. Resolution execution
 * 6. Arbiter reputation updates
 * 7. Slashing for frivolous disputes
 *)

open Lwt.Syntax
open Types

(** Test helpers *)
module TestHelpers = struct

  let create_test_escrow ~escrow_id ~amount =
    {
      escrow_id;
      payer = "EQPayer123...";
      payee = "EQPayee456...";
      amount;
      asset = USDC;
      created_at = Unix.time ();
      release_conditions = [];
      timeout_action = ReleaseToPayee;
      timeout_seconds = 86400 * 7; (* 7 days *)
      additional_parties = [];
      status = EscrowActive;
      conditions_met = 0;
      released_at = None;
      funded_at = Some (Unix.time ());
      timeout_at = Unix.time () +. 86400.0 *. 7.0;
      protection_enabled = false;
      protection_covers = PayerOnly;
      protection_policy_id = None;
    }

  let create_test_arbiter ~address ~stake ~specializations ~reputation =
    {
      arbiter_address = address;
      staked_amount = stake;
      reputation_score = reputation;
      disputes_resolved = 0;
      successful_resolutions = 0;
      average_resolution_time = 0.0;
      specializations;
      is_active = true;
      registered_at = Unix.time ();
    }

  let print_test_header name =
    Printf.printf "\n========================================\n";
    Printf.printf "TEST: %s\n" name;
    Printf.printf "========================================\n"

  let print_test_result success message =
    let status = if success then "✓ PASS" else "✗ FAIL" in
    Printf.printf "%s: %s\n" status message

end

(** Test 1: Dispute Initiation *)
module TestDisputeInitiation = struct
  open TestHelpers
  open Dispute_engine.DisputeOps

  let test_valid_dispute_initiation () =
    print_test_header "Valid Dispute Initiation";

    let escrow = create_test_escrow ~escrow_id:1L ~amount:100000L in
    let reason = WorkNotCompleted {
      expected_deliverable = "React app with authentication";
      actual_state = "Only login page completed";
    } in

    let%lwt result = initiate_dispute
      ~escrow
      ~initiated_by:escrow.payer
      ~reason
    in

    match result with
    | Ok dispute ->
        let checks = [
          (dispute.escrow_id = escrow.escrow_id, "Dispute linked to escrow");
          (dispute.initiated_by = escrow.payer, "Initiator set correctly");
          (dispute.status = EvidenceCollection, "Status is EvidenceCollection");
          (dispute.assigned_arbiter = None, "No arbiter assigned yet");
          (List.length dispute.evidence = 0, "No evidence submitted yet");
        ] in

        List.iter (fun (success, msg) ->
          print_test_result success msg
        ) checks;

        Printf.printf "\nDispute Details:\n";
        Printf.printf "  Dispute ID: %Ld\n" dispute.dispute_id;
        Printf.printf "  Escrow ID: %Ld\n" dispute.escrow_id;
        Printf.printf "  Initiated By: %s\n" dispute.initiated_by;
        Printf.printf "  Status: %s\n" (match dispute.status with EvidenceCollection -> "Evidence Collection" | _ -> "Other");

        Lwt.return_unit

    | Error msg ->
        print_test_result false (Printf.sprintf "Failed to initiate dispute: %s" msg);
        Lwt.return_unit

  let test_invalid_initiator () =
    print_test_header "Invalid Dispute Initiator";

    let escrow = create_test_escrow ~escrow_id:2L ~amount:100000L in
    let reason = WorkNotCompleted {
      expected_deliverable = "Bug fixes";
      actual_state = "Not started";
    } in

    let%lwt result = initiate_dispute
      ~escrow
      ~initiated_by:"EQRandomPerson..."
      ~reason
    in

    match result with
    | Ok _ ->
        print_test_result false "Should have rejected invalid initiator";
        Lwt.return_unit
    | Error msg ->
        print_test_result true (Printf.sprintf "Correctly rejected: %s" msg);
        Lwt.return_unit

  let run_all () =
    let%lwt () = test_valid_dispute_initiation () in
    let%lwt () = test_invalid_initiator () in
    Lwt.return_unit

end

(** Test 2: Evidence Submission *)
module TestEvidenceSubmission = struct
  open TestHelpers
  open Dispute_engine.DisputeOps

  let test_submit_evidence () =
    print_test_header "Evidence Submission";

    (* Create dispute *)
    let escrow = create_test_escrow ~escrow_id:3L ~amount:150000L in
    let reason = WorkQualityIssue {
      agreed_standard = "Production-ready code with tests";
      actual_quality = "Untested code with bugs";
    } in

    let%lwt dispute_result = initiate_dispute
      ~escrow
      ~initiated_by:escrow.payer
      ~reason
    in

    match dispute_result with
    | Error msg ->
        print_test_result false (Printf.sprintf "Failed to create dispute: %s" msg);
        Lwt.return_unit
    | Ok dispute ->
        (* Submit evidence *)
        let%lwt evidence_result = submit_evidence
          ~dispute
          ~submitted_by:escrow.payer
          ~evidence_type:GitHubCommit
          ~content_url:"ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"
          ~description:"Git log showing only 10 commits, no tests"
        in

        match evidence_result with
        | Ok updated_dispute ->
            let checks = [
              (List.length updated_dispute.evidence = 1, "Evidence added to dispute");
              (updated_dispute.status = EvidenceCollection, "Status still EvidenceCollection");
            ] in

            List.iter (fun (success, msg) ->
              print_test_result success msg
            ) checks;

            Printf.printf "\nEvidence Details:\n";
            List.iter (fun ev ->
              Printf.printf "  Evidence ID: %Ld\n" ev.evidence_id;
              Printf.printf "  Type: %s\n" (match ev.evidence_type with GitHubCommit -> "GitHub Commit" | _ -> "Other");
              Printf.printf "  Submitted By: %s\n" ev.submitted_by;
              Printf.printf "  Description: %s\n" ev.description;
            ) updated_dispute.evidence;

            Lwt.return_unit

        | Error msg ->
            print_test_result false (Printf.sprintf "Failed to submit evidence: %s" msg);
            Lwt.return_unit

  let run_all () =
    test_submit_evidence ()

end

(** Test 3: Arbiter Selection *)
module TestArbiterSelection = struct
  open TestHelpers
  open Arbiter_registry.ArbiterRegistry

  let test_register_and_select_arbiter () =
    print_test_header "Arbiter Registration and Selection";

    (* Create registry *)
    let registry = create () in

    (* Register arbiters *)
    let%lwt result1 = register_arbiter registry
      ~address:"EQArbiterFreelance1..."
      ~stake_amount:1000000L (* $10k *)
      ~specializations:[FreelanceDisputes; TechnicalDisputes]
    in

    let%lwt result2 = register_arbiter registry
      ~address:"EQArbiterTradeFin1..."
      ~stake_amount:1500000L (* $15k *)
      ~specializations:[TradeFinDisputes; LegalDisputes]
    in

    match result1, result2 with
    | Ok arbiter1, Ok arbiter2 ->
        print_test_result true "Arbiters registered successfully";

        Printf.printf "\nArbiter 1:\n";
        Printf.printf "  Address: %s\n" arbiter1.arbiter_address;
        Printf.printf "  Stake: $%.2f\n" (Int64.to_float arbiter1.staked_amount /. 100.0);
        Printf.printf "  Reputation: %.2f\n" arbiter1.reputation_score;
        Printf.printf "  Specializations: %d\n" (List.length arbiter1.specializations);

        Printf.printf "\nArbiter 2:\n";
        Printf.printf "  Address: %s\n" arbiter2.arbiter_address;
        Printf.printf "  Stake: $%.2f\n" (Int64.to_float arbiter2.staked_amount /. 100.0);
        Printf.printf "  Reputation: %.2f\n" arbiter2.reputation_score;

        (* Test selection *)
        let%lwt selected = select_arbiter registry
          ~required_specialization:FreelanceDisputes
        in

        print_test_result
          (selected.arbiter_address = arbiter1.arbiter_address)
          "Selected correct arbiter for FreelanceDisputes";

        Printf.printf "\nSelected Arbiter: %s\n" selected.arbiter_address;

        Lwt.return_unit

    | _ ->
        print_test_result false "Failed to register arbiters";
        Lwt.return_unit

  let test_insufficient_stake () =
    print_test_header "Arbiter Registration - Insufficient Stake";

    let registry = create () in

    let%lwt result = register_arbiter registry
      ~address:"EQArbiterPoor..."
      ~stake_amount:500000L (* Only $5k, minimum is $10k *)
      ~specializations:[FreelanceDisputes]
    in

    match result with
    | Ok _ ->
        print_test_result false "Should have rejected insufficient stake";
        Lwt.return_unit
    | Error msg ->
        print_test_result true (Printf.sprintf "Correctly rejected: %s" msg);
        Lwt.return_unit

  let run_all () =
    let%lwt () = test_register_and_select_arbiter () in
    let%lwt () = test_insufficient_stake () in
    Lwt.return_unit

end

(** Test 4: Dispute Resolution *)
module TestDisputeResolution = struct
  open TestHelpers
  open Dispute_engine.DisputeOps

  let test_resolve_dispute () =
    print_test_header "Dispute Resolution";

    (* Create dispute *)
    let escrow = create_test_escrow ~escrow_id:4L ~amount:200000L in
    let reason = PaymentDispute {
      agreed_amount = 200000L;
      disputed_amount = 150000L;
    } in

    let%lwt dispute_result = initiate_dispute
      ~escrow
      ~initiated_by:escrow.payee
      ~reason
    in

    match dispute_result with
    | Error msg ->
        print_test_result false (Printf.sprintf "Failed to create dispute: %s" msg);
        Lwt.return_unit
    | Ok dispute ->
        (* Assign arbiter *)
        let arbiter_address = "EQArbiter123..." in
        let%lwt assigned_result = assign_arbiter
          ~dispute
          ~arbiter_address
        in

        match assigned_result with
        | Error msg ->
            print_test_result false (Printf.sprintf "Failed to assign arbiter: %s" msg);
            Lwt.return_unit
        | Ok assigned_dispute ->
            print_test_result true "Arbiter assigned successfully";

            (* Resolve dispute *)
            let outcome = PartialSplit { payee_pct = 0.75; payer_pct = 0.25 } in
            let reasoning = "Evidence shows 75% of work completed. Fair split: 75% to payee, 25% refund to payer." in

            let%lwt resolved_result = resolve_dispute
              ~dispute:assigned_dispute
              ~arbiter:arbiter_address
              ~outcome
              ~reasoning
            in

            match resolved_result with
            | Ok resolved_dispute ->
                let checks = [
                  (resolved_dispute.status = Resolved, "Status updated to Resolved");
                  (resolved_dispute.resolution = Some outcome, "Resolution outcome set");
                  (resolved_dispute.resolution_reasoning = Some reasoning, "Reasoning recorded");
                  (resolved_dispute.resolved_at <> None, "Resolution timestamp set");
                  (resolved_dispute.appeal_deadline <> None, "Appeal deadline set");
                ] in

                List.iter (fun (success, msg) ->
                  print_test_result success msg
                ) checks;

                Printf.printf "\nResolution Details:\n";
                Printf.printf "  Outcome: %s\n" (match outcome with
                  | PartialSplit { payee_pct; payer_pct } ->
                      Printf.sprintf "Partial Split (%.0f%% / %.0f%%)"
                        (payee_pct *. 100.0) (payer_pct *. 100.0)
                  | _ -> "Other"
                );
                Printf.printf "  Reasoning: %s\n" reasoning;

                (match resolved_dispute.appeal_deadline with
                | Some deadline ->
                    let hours_until = (deadline -. Unix.time ()) /. 3600.0 in
                    Printf.printf "  Appeal Deadline: %.1f hours from now\n" hours_until
                | None -> ());

                Lwt.return_unit

            | Error msg ->
                print_test_result false (Printf.sprintf "Failed to resolve dispute: %s" msg);
                Lwt.return_unit

  let run_all () =
    test_resolve_dispute ()

end

(** Test 5: Resolution Execution *)
module TestResolutionExecution = struct
  open TestHelpers
  open Dispute_engine.ResolutionExecutor

  let test_execute_partial_split () =
    print_test_header "Resolution Execution - Partial Split";

    let escrow = create_test_escrow ~escrow_id:5L ~amount:100000L in
    let outcome = PartialSplit { payee_pct = 0.60; payer_pct = 0.40 } in

    let distributions = calculate_distribution ~escrow ~outcome in

    let checks = [
      (List.length distributions = 2, "Two distributions calculated");
    ] in

    List.iter (fun (success, msg) ->
      print_test_result success msg
    ) checks;

    Printf.printf "\nDistribution Breakdown:\n";
    List.iter (fun (recipient, amount) ->
      let percentage = (Int64.to_float amount /. Int64.to_float escrow.amount) *. 100.0 in
      Printf.printf "  %s: $%.2f (%.0f%%)\n"
        (if recipient = escrow.payee then "Payee" else "Payer")
        (Int64.to_float amount /. 100.0)
        percentage
    ) distributions;

    Lwt.return_unit

  let test_arbiter_fee_calculation () =
    print_test_header "Arbiter Fee Calculation";

    let escrow_amount = 100000L in (* $1,000 *)

    (* Standard resolution (slow) *)
    let standard_fee = calculate_arbiter_fee
      ~escrow_amount
      ~resolution_time:172800.0 (* 48 hours *)
    in

    (* Fast resolution *)
    let fast_fee = calculate_arbiter_fee
      ~escrow_amount
      ~resolution_time:18000.0 (* 5 hours *)
    in

    let base_fee_expected = Int64.div escrow_amount 100L in (* 1% = $10 *)
    let fast_bonus_expected = Int64.div base_fee_expected 2L in (* 50% = $5 *)

    let checks = [
      (standard_fee = base_fee_expected, "Standard fee is 1% of escrow");
      (fast_fee = Int64.add base_fee_expected fast_bonus_expected, "Fast resolution gets 50% bonus");
    ] in

    List.iter (fun (success, msg) ->
      print_test_result success msg
    ) checks;

    Printf.printf "\nFee Breakdown:\n";
    Printf.printf "  Escrow Amount: $%.2f\n" (Int64.to_float escrow_amount /. 100.0);
    Printf.printf "  Standard Fee (48h): $%.2f\n" (Int64.to_float standard_fee /. 100.0);
    Printf.printf "  Fast Fee (5h): $%.2f\n" (Int64.to_float fast_fee /. 100.0);
    Printf.printf "  Bonus for speed: $%.2f\n" (Int64.to_float fast_bonus_expected /. 100.0);

    Lwt.return_unit

  let run_all () =
    let%lwt () = test_execute_partial_split () in
    let%lwt () = test_arbiter_fee_calculation () in
    Lwt.return_unit

end

(** Test 6: Arbiter Reputation *)
module TestArbiterReputation = struct
  open TestHelpers
  open Arbiter_registry.ReputationSystem

  let test_reputation_update () =
    print_test_header "Arbiter Reputation Update";

    let arbiter = create_test_arbiter
      ~address:"EQArbiterTest..."
      ~stake:1000000L
      ~specializations:[FreelanceDisputes]
      ~reputation:0.80
    in

    (* Simulate successful resolution in 6 hours *)
    let updated_arbiter = update_reputation
      ~arbiter
      ~resolution_time:21600.0 (* 6 hours *)
      ~both_parties_satisfied:true
    in

    let checks = [
      (updated_arbiter.disputes_resolved = 1, "Disputes resolved incremented");
      (updated_arbiter.successful_resolutions = 1, "Successful resolutions incremented");
      (updated_arbiter.reputation_score > arbiter.reputation_score, "Reputation increased");
      (updated_arbiter.average_resolution_time = 21600.0, "Average resolution time set");
    ] in

    List.iter (fun (success, msg) ->
      print_test_result success msg
    ) checks;

    Printf.printf "\nReputation Changes:\n";
    Printf.printf "  Initial Reputation: %.2f\n" arbiter.reputation_score;
    Printf.printf "  Updated Reputation: %.2f\n" updated_arbiter.reputation_score;
    Printf.printf "  Disputes Resolved: %d\n" updated_arbiter.disputes_resolved;
    Printf.printf "  Success Rate: %.0f%%\n"
      (float_of_int updated_arbiter.successful_resolutions /.
       float_of_int updated_arbiter.disputes_resolved *. 100.0);

    Lwt.return_unit

  let test_multiple_resolutions () =
    print_test_header "Multiple Resolutions - Reputation Tracking";

    let arbiter = create_test_arbiter
      ~address:"EQArbiterVeteran..."
      ~stake:2000000L
      ~specializations:[FreelanceDisputes; TechnicalDisputes]
      ~reputation:0.80
    in

    (* Simulate 10 resolutions *)
    let resolutions = [
      (14400.0, true);  (* 4h, successful *)
      (28800.0, true);  (* 8h, successful *)
      (10800.0, true);  (* 3h, successful *)
      (43200.0, false); (* 12h, unsuccessful *)
      (7200.0, true);   (* 2h, successful *)
      (36000.0, true);  (* 10h, successful *)
      (18000.0, true);  (* 5h, successful *)
      (50400.0, false); (* 14h, unsuccessful *)
      (21600.0, true);  (* 6h, successful *)
      (9000.0, true);   (* 2.5h, successful *)
    ] in

    let final_arbiter = List.fold_left (fun arb (time, success) ->
      update_reputation ~arbiter:arb ~resolution_time:time ~both_parties_satisfied:success
    ) arbiter resolutions in

    let success_rate = float_of_int final_arbiter.successful_resolutions /.
                       float_of_int final_arbiter.disputes_resolved *. 100.0 in

    let checks = [
      (final_arbiter.disputes_resolved = 10, "Resolved 10 disputes");
      (final_arbiter.successful_resolutions = 8, "8 successful resolutions");
      (success_rate = 80.0, "80% success rate");
      (final_arbiter.reputation_score > arbiter.reputation_score, "Reputation improved overall");
    ] in

    List.iter (fun (success, msg) ->
      print_test_result success msg
    ) checks;

    Printf.printf "\nVeteran Arbiter Stats:\n";
    Printf.printf "  Disputes Resolved: %d\n" final_arbiter.disputes_resolved;
    Printf.printf "  Successful: %d\n" final_arbiter.successful_resolutions;
    Printf.printf "  Success Rate: %.1f%%\n" success_rate;
    Printf.printf "  Avg Resolution Time: %.1f hours\n"
      (final_arbiter.average_resolution_time /. 3600.0);
    Printf.printf "  Initial Reputation: %.2f\n" arbiter.reputation_score;
    Printf.printf "  Final Reputation: %.2f\n" final_arbiter.reputation_score;

    Lwt.return_unit

  let run_all () =
    let%lwt () = test_reputation_update () in
    let%lwt () = test_multiple_resolutions () in
    Lwt.return_unit

end

(** Test 7: Frivolous Dispute Detection *)
module TestFrivolousDetection = struct
  open TestHelpers
  open Dispute_engine.FrivolousDetection

  let test_frivolous_detection () =
    print_test_header "Frivolous Dispute Detection";

    (* Create dispute with minimal evidence and losing outcome *)
    let escrow = create_test_escrow ~escrow_id:6L ~amount:50000L in
    let reason = WorkNotCompleted {
      expected_deliverable = "Website";
      actual_state = "Not done";
    } in

    (* Dispute with only 1 piece of evidence *)
    let dispute = {
      dispute_id = 100L;
      escrow_id = escrow.escrow_id;
      initiated_by = escrow.payer;
      reason;
      evidence = [{
        evidence_id = 1L;
        submitted_by = escrow.payer;
        evidence_type = Document;
        content_url = "ipfs://...";
        description = "Complaint";
        submitted_at = Unix.time ();
      }];
      assigned_arbiter = Some "EQArbiter...";
      status = Resolved;
      resolution = Some FullRelease; (* Payer lost *)
      resolution_reasoning = Some "This dispute has no merit. Frivolous claim.";
      created_at = Unix.time ();
      resolved_at = Some (Unix.time ());
      appeal_deadline = None;
    } in

    let outcome = FullRelease in
    let is_frivolous_result = is_frivolous ~dispute ~outcome in

    print_test_result is_frivolous_result "Detected frivolous dispute";

    let slashing_amount = calculate_slashing ~escrow_amount:escrow.amount in
    let expected_slashing = Int64.of_float (Int64.to_float escrow.amount *. 0.05) in

    print_test_result
      (slashing_amount = expected_slashing)
      "Slashing amount is 5% of escrow";

    Printf.printf "\nFrivolous Dispute Analysis:\n";
    Printf.printf "  Evidence Count: %d (threshold: 2)\n" (List.length dispute.evidence);
    Printf.printf "  Outcome: Full Release to opposing party\n";
    Printf.printf "  Reasoning contains 'frivolous': %b\n"
      (match dispute.resolution_reasoning with
       | Some r -> String.lowercase_ascii r |> fun s -> Str.string_match (Str.regexp ".*frivolous.*") s 0
       | None -> false);
    Printf.printf "  Is Frivolous: %b\n" is_frivolous_result;
    Printf.printf "  Slashing Amount: $%.2f (5%%)\n" (Int64.to_float slashing_amount /. 100.0);

    Lwt.return_unit

  let run_all () =
    test_frivolous_detection ()

end

(** Test 8: Complete Dispute Flow *)
module TestCompleteFlow = struct
  open TestHelpers

  let test_end_to_end_dispute_flow () =
    print_test_header "End-to-End Dispute Flow";

    Printf.printf "\nStep 1: Create Escrow\n";
    let escrow = create_test_escrow ~escrow_id:999L ~amount:500000L in
    Printf.printf "  Escrow created: $%.2f between %s and %s\n"
      (Int64.to_float escrow.amount /. 100.0)
      (String.sub escrow.payer 0 12)
      (String.sub escrow.payee 0 12);

    Printf.printf "\nStep 2: Initialize Arbiter Registry\n";
    let registry = Arbiter_registry.ArbiterRegistry.create () in
    let%lwt arbiter_result = Arbiter_registry.ArbiterRegistry.register_arbiter registry
      ~address:"EQArbiterEndToEnd..."
      ~stake_amount:1500000L
      ~specializations:[FreelanceDisputes; TechnicalDisputes]
    in

    match arbiter_result with
    | Error msg ->
        print_test_result false (Printf.sprintf "Failed to register arbiter: %s" msg);
        Lwt.return_unit
    | Ok arbiter ->
        Printf.printf "  Arbiter registered: %s (reputation: %.2f)\n"
          (String.sub arbiter.arbiter_address 0 20)
          arbiter.reputation_score;

        Printf.printf "\nStep 3: Initiate Dispute\n";
        let reason = WorkQualityIssue {
          agreed_standard = "Enterprise-grade React application";
          actual_quality = "Buggy prototype with missing features";
        } in

        let%lwt dispute_result = Dispute_engine.DisputeOps.initiate_dispute
          ~escrow
          ~initiated_by:escrow.payer
          ~reason
        in

        match dispute_result with
        | Error msg ->
            print_test_result false (Printf.sprintf "Failed to initiate dispute: %s" msg);
            Lwt.return_unit
        | Ok dispute ->
            Printf.printf "  Dispute initiated by payer (ID: %Ld)\n" dispute.dispute_id;

            Printf.printf "\nStep 4: Submit Evidence (Payer)\n";
            let%lwt evidence1_result = Dispute_engine.DisputeOps.submit_evidence
              ~dispute
              ~submitted_by:escrow.payer
              ~evidence_type:ScreenRecording
              ~content_url:"ipfs://QmPayerEvidence1..."
              ~description:"Screen recording showing critical bugs and missing features"
            in

            (match evidence1_result with
            | Ok dispute_with_ev1 ->
                Printf.printf "  Payer submitted screen recording evidence\n";

                Printf.printf "\nStep 5: Submit Evidence (Payee)\n";
                let%lwt evidence2_result = Dispute_engine.DisputeOps.submit_evidence
                  ~dispute:dispute_with_ev1
                  ~submitted_by:escrow.payee
                  ~evidence_type:GitHubCommit
                  ~content_url:"ipfs://QmPayeeEvidence1..."
                  ~description:"Git commits showing 90% feature completion"
                in

                (match evidence2_result with
                | Ok dispute_with_ev2 ->
                    Printf.printf "  Payee submitted GitHub commit evidence\n";
                    Printf.printf "  Total evidence count: %d\n" (List.length dispute_with_ev2.evidence);

                    Printf.printf "\nStep 6: Assign Arbiter\n";
                    let%lwt assigned_result = Dispute_engine.DisputeOps.assign_arbiter
                      ~dispute:dispute_with_ev2
                      ~arbiter_address:arbiter.arbiter_address
                    in

                    (match assigned_result with
                    | Ok assigned_dispute ->
                        Printf.printf "  Arbiter assigned: %s\n"
                          (match assigned_dispute.assigned_arbiter with
                           | Some a -> String.sub a 0 20
                           | None -> "None");

                        Printf.printf "\nStep 7: Resolve Dispute\n";
                        let outcome = PartialSplit { payee_pct = 0.70; payer_pct = 0.30 } in
                        let reasoning = "After reviewing evidence, work is 70% complete with some bugs. Fair split: 70% to payee for substantial work done, 30% refund to payer for quality issues." in

                        let%lwt resolved_result = Dispute_engine.DisputeOps.resolve_dispute
                          ~dispute:assigned_dispute
                          ~arbiter:arbiter.arbiter_address
                          ~outcome
                          ~reasoning
                        in

                        (match resolved_result with
                        | Ok resolved_dispute ->
                            Printf.printf "  Dispute resolved: %s\n"
                              (match outcome with
                               | PartialSplit { payee_pct; payer_pct } ->
                                   Printf.sprintf "%.0f%% / %.0f%% split"
                                     (payee_pct *. 100.0) (payer_pct *. 100.0)
                               | _ -> "Other");

                            Printf.printf "\nStep 8: Calculate Distributions\n";
                            let distributions = Dispute_engine.ResolutionExecutor.calculate_distribution
                              ~escrow
                              ~outcome
                            in

                            List.iter (fun (recipient, amount) ->
                              Printf.printf "  %s receives: $%.2f\n"
                                (if recipient = escrow.payee then "Payee" else "Payer")
                                (Int64.to_float amount /. 100.0)
                            ) distributions;

                            Printf.printf "\nStep 9: Calculate Arbiter Reward\n";
                            let resolution_time = match resolved_dispute.resolved_at with
                              | Some t -> t -. resolved_dispute.created_at
                              | None -> 0.0
                            in

                            let reward = Arbiter_registry.RewardCalculation.calculate_reward
                              ~escrow_amount:escrow.amount
                              ~resolution_time
                              ~evidence_count:(List.length resolved_dispute.evidence)
                              ~both_parties_satisfied:true
                            in

                            Printf.printf "  Resolution time: %.1f hours\n" (resolution_time /. 3600.0);
                            Printf.printf "  Arbiter reward: $%.2f\n" (Int64.to_float reward /. 100.0);

                            Printf.printf "\nStep 10: Update Arbiter Reputation\n";
                            let updated_arbiter = Arbiter_registry.ReputationSystem.update_reputation
                              ~arbiter
                              ~resolution_time
                              ~both_parties_satisfied:true
                            in

                            Printf.printf "  Reputation: %.2f → %.2f\n"
                              arbiter.reputation_score
                              updated_arbiter.reputation_score;
                            Printf.printf "  Disputes resolved: %d\n" updated_arbiter.disputes_resolved;

                            Printf.printf "\n";
                            print_test_result true "Complete dispute flow executed successfully";

                            Lwt.return_unit

                        | Error msg ->
                            print_test_result false (Printf.sprintf "Resolution failed: %s" msg);
                            Lwt.return_unit)

                    | Error msg ->
                        print_test_result false (Printf.sprintf "Arbiter assignment failed: %s" msg);
                        Lwt.return_unit)

                | Error msg ->
                    print_test_result false (Printf.sprintf "Evidence submission failed: %s" msg);
                    Lwt.return_unit)

            | Error msg ->
                print_test_result false (Printf.sprintf "Evidence submission failed: %s" msg);
                Lwt.return_unit)

  let run_all () =
    test_end_to_end_dispute_flow ()

end

(** Main test runner *)
let run_all_tests () =
  Printf.printf "\n";
  Printf.printf "================================================================================\n";
  Printf.printf "DISPUTE RESOLUTION SYSTEM - INTEGRATION TESTS\n";
  Printf.printf "================================================================================\n";

  let%lwt () = TestDisputeInitiation.run_all () in
  let%lwt () = TestEvidenceSubmission.run_all () in
  let%lwt () = TestArbiterSelection.run_all () in
  let%lwt () = TestDisputeResolution.run_all () in
  let%lwt () = TestResolutionExecution.run_all () in
  let%lwt () = TestArbiterReputation.run_all () in
  let%lwt () = TestFrivolousDetection.run_all () in
  let%lwt () = TestCompleteFlow.run_all () in

  Printf.printf "\n";
  Printf.printf "================================================================================\n";
  Printf.printf "ALL TESTS COMPLETED\n";
  Printf.printf "================================================================================\n";

  Lwt.return_unit

(** Entry point *)
let () =
  Lwt_main.run (run_all_tests ())
