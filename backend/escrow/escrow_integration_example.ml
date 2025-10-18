(**
 * Escrow Integration Example
 *
 * Demonstrates real external dependency integration:
 * 1. Oracle verification (shipping API, GitHub, custom REST)
 * 2. Chain event queries (Ethereum, TON)
 * 3. Signature verification (Ed25519, ECDSA)
 *)

open Core
open Lwt.Syntax
open Types
open Integration

(** Example 1: Freelance escrow with GitHub milestone verification *)
let example_freelance_escrow () : unit Lwt.t =
  Printf.printf "\n=== Example 1: Freelance Escrow with GitHub Milestone ===\n";

  (* Create escrow contract *)
  let escrow = Escrow_engine.EscrowTemplates.create_freelance_escrow
    ~client:"0x1234567890123456789012345678901234567890"
    ~freelancer:"0x0987654321098765432109876543210987654321"
    ~amount:100000000L (* $1000 USD in cents *)
    ~milestone_url:"https://github.com/owner/repo/milestone/1"
    ~deadline_days:30
  in

  Printf.printf "Created escrow #%Ld\n" escrow.escrow_id;
  Printf.printf "Payer: %s\n" escrow.payer;
  Printf.printf "Payee: %s\n" escrow.payee;
  Printf.printf "Amount: $%.2f\n" (Int64.to_float escrow.amount /. 100.0);

  (* Check conditions with real implementations *)
  let%lwt (conditions_met, updated_escrow) =
    Escrow_engine.RealImplementation.check_escrow_conditions escrow
  in

  Printf.printf "Conditions met: %b\n" conditions_met;
  Printf.printf "Status: %s\n" (Types.escrow_status_to_string updated_escrow.status);

  Lwt.return ()

(** Example 2: Trade finance escrow with shipping oracle *)
let example_trade_escrow () : unit Lwt.t =
  Printf.printf "\n=== Example 2: Trade Finance Escrow with Shipping Oracle ===\n";

  (* Create trade escrow *)
  let escrow = Escrow_engine.EscrowTemplates.create_trade_escrow
    ~buyer:"0xBuyer1234567890123456789012345678901234"
    ~seller:"0xSeller0987654321098765432109876543210"
    ~amount:500000000L (* $5000 USD *)
    ~shipping_oracle:"https://api.fedex.com/track/v1/trackingnumbers"
    ~expected_delivery_date:(Unix.time () +. 86400.0 *. 7.0) (* 7 days *)
  in

  Printf.printf "Created trade escrow #%Ld\n" escrow.escrow_id;
  Printf.printf "Buyer: %s\n" escrow.payer;
  Printf.printf "Seller: %s\n" escrow.payee;
  Printf.printf "Amount: $%.2f\n" (Int64.to_float escrow.amount /. 100.0);

  (* Check shipping status via oracle *)
  let oracle_client = EscrowOracleClient.create () in
  let%lwt verification_result = EscrowOracleClient.fetch_and_verify
    ~client:oracle_client
    ~endpoint:"https://api.fedex.com/track/v1/trackingnumbers"
    ~expected_value:"DELIVERED"
  in

  Printf.printf "Oracle verification: %b\n" verification_result.verified;
  Printf.printf "Actual value: %s\n" verification_result.actual_value;
  Printf.printf "Confidence: %.2f\n" verification_result.confidence;

  Lwt.return ()

(** Example 3: Chain event verification for cross-chain escrow *)
let example_chain_event_escrow () : unit Lwt.t =
  Printf.printf "\n=== Example 3: Chain Event Verification ===\n";

  (* Check if Transfer event occurred on Ethereum *)
  let%lwt (occurred, block_number, timestamp) =
    ChainEventClient.check_event
      ~chain:Ethereum
      ~contract_address:"0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" (* USDC contract *)
      ~event_signature:"Transfer(address,address,uint256)"
      ~min_confirmations:6
  in

  Printf.printf "Event occurred: %b\n" occurred;
  Printf.printf "Block number: %d\n" block_number;
  Printf.printf "Timestamp: %.0f\n" timestamp;

  (* Check TON chain event *)
  let%lwt (ton_occurred, ton_block, ton_time) =
    ChainEventClient.check_event
      ~chain:TON
      ~contract_address:"EQD5_3__________________________________________"
      ~event_signature:"PaymentReceived"
      ~min_confirmations:3
  in

  Printf.printf "\nTON event occurred: %b\n" ton_occurred;
  Printf.printf "TON block: %d\n" ton_block;

  Lwt.return ()

(** Example 4: Signature verification for manual approval *)
let example_signature_verification () : unit Lwt.t =
  Printf.printf "\n=== Example 4: Signature Verification ===\n";

  (* Test Ed25519 signature (TON wallet) *)
  let ton_address = "EQD5_3__________________________________________" in
  let ed25519_signature = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" in

  let result_ed25519 = Crypto.SignatureVerifier.verify
    ~message:"I approve this escrow release"
    ~signature:ed25519_signature
    ~identifier:ton_address
    ~scheme:Ed25519
  in

  Printf.printf "Ed25519 verification valid: %b\n" result_ed25519.valid;
  (match result_ed25519.signer with
   | Some signer -> Printf.printf "Signer: %s\n" signer
   | None -> Printf.printf "Signer: None\n");

  (* Test ECDSA signature (Ethereum wallet) *)
  let eth_address = "0x1234567890123456789012345678901234567890" in
  let ecdsa_signature = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef01" in

  let result_ecdsa = Crypto.SignatureVerifier.verify
    ~message:"I approve this escrow release"
    ~signature:ecdsa_signature
    ~identifier:eth_address
    ~scheme:ECDSA_secp256k1
  in

  Printf.printf "\nECDSA verification valid: %b\n" result_ecdsa.valid;
  (match result_ecdsa.error_message with
   | Some err -> Printf.printf "Error: %s\n" err
   | None -> Printf.printf "No errors\n");

  Lwt.return ()

(** Example 5: Multisig escrow with threshold verification *)
let example_multisig_escrow () : unit Lwt.t =
  Printf.printf "\n=== Example 5: Multisig Escrow ===\n";

  (* Create real estate escrow with multisig *)
  let escrow = Escrow_engine.EscrowTemplates.create_real_estate_escrow
    ~buyer:"0xBuyer1234567890123456789012345678901234"
    ~seller:"0xSeller0987654321098765432109876543210"
    ~amount:10000000000L (* $100,000 USD *)
    ~title_company:"0xTitle1234567890123456789012345678901234"
    ~inspector:"0xInspector1234567890123456789012345678"
    ~signers:[
      "0xBuyer1234567890123456789012345678901234";
      "0xSeller0987654321098765432109876543210";
      "0xTitle1234567890123456789012345678901234";
    ]
  in

  Printf.printf "Created real estate escrow #%Ld\n" escrow.escrow_id;
  Printf.printf "Amount: $%.2f\n" (Int64.to_float escrow.amount /. 100.0);
  Printf.printf "Conditions: %d\n" (List.length escrow.release_conditions);

  (* Test multisig verification *)
  let signatures = [
    ("0xBuyer1234567890123456789012345678901234", "0xsig1...", Crypto.SignatureVerifier.ECDSA_secp256k1);
    ("0xSeller0987654321098765432109876543210", "0xsig2...", Crypto.SignatureVerifier.ECDSA_secp256k1);
    ("0xTitle1234567890123456789012345678901234", "0xsig3...", Crypto.SignatureVerifier.ECDSA_secp256k1);
  ] in

  let (valid_count, results) = Crypto.SignatureVerifier.verify_multisig
    ~message:"Approve real estate escrow release"
    ~signatures
    ~required_threshold:3
  in

  Printf.printf "Valid signatures: %d / 3 required\n" valid_count;
  Printf.printf "Threshold met: %b\n" (valid_count >= 3);

  Lwt.return ()

(** Example 6: Full escrow monitoring daemon *)
let example_monitoring_daemon () : unit Lwt.t =
  Printf.printf "\n=== Example 6: Escrow Monitoring Daemon ===\n";

  (* Mock escrow database *)
  let active_escrows = ref [
    Escrow_engine.EscrowTemplates.create_freelance_escrow
      ~client:"0xClient1"
      ~freelancer:"0xFreelancer1"
      ~amount:50000000L
      ~milestone_url:"https://github.com/test/repo/milestone/1"
      ~deadline_days:15;
  ] in

  (* Mock database functions *)
  let get_active_escrows () = Lwt.return !active_escrows in

  let update_escrow (escrow: escrow_contract) =
    Printf.printf "[DB] Updated escrow #%Ld status=%s\n"
      escrow.escrow_id
      (Types.escrow_status_to_string escrow.status);
    Lwt.return ()
  in

  let execute_release (escrow: escrow_contract) =
    Printf.printf "[RELEASE] Executing payout for escrow #%Ld: $%.2f to %s\n"
      escrow.escrow_id
      (Int64.to_float escrow.amount /. 100.0)
      escrow.payee;
    Lwt.return ()
  in

  Printf.printf "Starting monitoring daemon (will run 1 check)...\n";

  (* Run one monitoring cycle *)
  let%lwt escrows = get_active_escrows () in
  Printf.printf "Monitoring %d active escrows\n" (List.length escrows);

  let%lwt updated_escrows = Lwt_list.map_p (fun escrow ->
    let%lwt (conditions_met, updated) =
      Escrow_engine.RealImplementation.check_escrow_conditions escrow
    in
    Printf.printf "  Escrow #%Ld: conditions_met=%b\n"
      escrow.escrow_id conditions_met;
    Lwt.return updated
  ) escrows in

  Printf.printf "Monitoring cycle complete\n";

  Lwt.return ()

(** Example 7: Oracle types showcase *)
let example_oracle_types () : unit Lwt.t =
  Printf.printf "\n=== Example 7: Oracle Types Showcase ===\n";

  let oracle_client = EscrowOracleClient.create () in

  (* GitHub milestone check *)
  Printf.printf "\n1. GitHub Milestone Verification:\n";
  let%lwt github_result = EscrowOracleClient.fetch_and_verify
    ~client:oracle_client
    ~endpoint:"https://api.github.com/repos/owner/repo/milestones/1"
    ~expected_value:"closed"
  in
  Printf.printf "   GitHub milestone closed: %b\n" github_result.verified;

  (* Custom REST API *)
  Printf.printf "\n2. Custom REST API:\n";
  let%lwt rest_result = EscrowOracleClient.fetch_and_verify
    ~client:oracle_client
    ~endpoint:"https://api.example.com/status"
    ~expected_value:"completed"
  in
  Printf.printf "   API status completed: %b\n" rest_result.verified;

  (* IoT Sensor (temperature check) *)
  Printf.printf "\n3. IoT Sensor (simulated):\n";
  let%lwt sensor_result = EscrowOracleClient.fetch_and_verify
    ~client:oracle_client
    ~endpoint:"https://iot.example.com/sensor/temp/123"
    ~expected_value:"20.5"
  in
  Printf.printf "   Temperature in range: %b\n" sensor_result.verified;

  Lwt.return ()

(** Run all examples *)
let main () : unit Lwt.t =
  Printf.printf "╔═══════════════════════════════════════════════════════════════╗\n";
  Printf.printf "║  Escrow External Dependency Integration Examples             ║\n";
  Printf.printf "╚═══════════════════════════════════════════════════════════════╝\n";

  let%lwt () = example_freelance_escrow () in
  let%lwt () = example_trade_escrow () in
  let%lwt () = example_chain_event_escrow () in
  let%lwt () = example_signature_verification () in
  let%lwt () = example_multisig_escrow () in
  let%lwt () = example_monitoring_daemon () in
  let%lwt () = example_oracle_types () in

  Printf.printf "\n╔═══════════════════════════════════════════════════════════════╗\n";
  Printf.printf "║  All examples completed successfully!                         ║\n";
  Printf.printf "╚═══════════════════════════════════════════════════════════════╝\n";

  Lwt.return ()

(** Entry point *)
let () =
  Lwt_main.run (main ())
