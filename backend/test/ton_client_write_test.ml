(* Unit Tests for TON Client Write Operations *)

open Core
open Lwt.Syntax
open Alcotest
open Alcotest_lwt
open Integration.Ton_client

(** Test configuration **)
let test_config = TonClient.{
  network = TonClient.Testnet;
  api_key = None;
  timeout_seconds = 30;
}

let test_wallet_address = "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2"
let test_contract_address = "EQAvDfWFG0oYX19jwNDNBBL1rKNT9XfaGP9HyTb5nb2Eml6y"

(** Helper: Mock transaction result *)
let mock_tx_result ?(success=true) ?(exit_code=0) tx_hash =
  let tx = {
    hash = tx_hash;
    lt = 12345678L;
    from_addr = Some test_wallet_address;
    to_addr = test_contract_address;
    value = 1_000_000_000L;
    fee = 10_000_000L;
    success;
    timestamp = Unix.time ();
  } in
  {
    tx;
    exit_code;
    is_bounced = not success;
    error_message = if success then None else Some "Test error";
  }

(** Test: Build message payload *)
let test_build_message_payload _switch () =
  Lwt_main.run (
    let payload = build_message_payload
      ~op_code:0x01
      ~params:[
        ("beneficiary", `String "EQC...");
        ("amount", `Int 1000);
      ]
    in

    (* Verify payload is base64 encoded *)
    check bool "Payload should be non-empty" true (String.length payload > 0);

    (* Decode and verify structure *)
    let decoded = Base64.decode_exn payload in
    let json = Yojson.Safe.from_string decoded in
    let open Yojson.Safe.Util in

    let op = json |> member "op" |> to_int in
    check int "Op code should be 0x01" 0x01 op;

    Lwt.return ()
  )

(** Test: Build internal message *)
let test_build_internal_message _switch () =
  Lwt_main.run (
    let body = build_message_payload
      ~op_code:0x01
      ~params:[("test", `String "value")]
    in

    let msg = build_internal_message
      ~dest:test_contract_address
      ~value:1_000_000_000L
      ~body
    in

    (* Verify message is base64 encoded *)
    check bool "Message should be non-empty" true (String.length msg > 0);

    (* Decode and verify structure *)
    let decoded = Base64.decode_exn msg in
    let json = Yojson.Safe.from_string decoded in
    let open Yojson.Safe.Util in

    let dest = json |> member "dest" |> to_string in
    let value = json |> member "value" |> to_string |> Int64.of_string in
    let bounce = json |> member "bounce" |> to_bool in

    check string "Destination should match" test_contract_address dest;
    check int64 "Value should match" 1_000_000_000L value;
    check bool "Bounce should be true" true bounce;

    Lwt.return ()
  )

(** Test: Error message from exit code *)
let test_error_message_from_exit_code _switch () =
  Lwt_main.run (
    (* Test success *)
    let msg_0 = error_message_from_exit_code 0 in
    check (option string) "Exit code 0 should be None" None msg_0;

    (* Test out of gas *)
    let msg_13 = error_message_from_exit_code 13 in
    check (option string) "Exit code 13 should be 'Out of gas'"
      (Some "Out of gas") msg_13;

    (* Test access denied *)
    let msg_100 = error_message_from_exit_code 100 in
    check (option string) "Exit code 100 should be 'Access denied'"
      (Some "Access denied") msg_100;

    (* Test insufficient balance *)
    let msg_101 = error_message_from_exit_code 101 in
    check (option string) "Exit code 101 should be 'Insufficient balance'"
      (Some "Insufficient balance") msg_101;

    (* Test unknown exit code *)
    let msg_999 = error_message_from_exit_code 999 in
    match msg_999 with
    | Some msg -> check bool "Should contain 'Unknown exit code'"
                    true (String.is_substring msg ~substring:"Unknown exit code")
    | None -> fail "Should have error message for unknown code";

    Lwt.return ()
  )

(** Test: Parse exit code *)
let test_parse_exit_code _switch () =
  Lwt_main.run (
    (* Mock transaction JSON with exit code *)
    let tx_json = `Assoc [
      ("description", `Assoc [
        ("compute_ph", `Assoc [
          ("exit_code", `Int 0);
        ]);
      ]);
    ] in

    let exit_code = parse_exit_code tx_json in
    check int "Exit code should be 0" 0 exit_code;

    (* Test malformed JSON *)
    let bad_json = `Assoc [] in
    let bad_exit_code = parse_exit_code bad_json in
    check int "Malformed JSON should return -1" (-1) bad_exit_code;

    Lwt.return ()
  )

(** Test: Is bounced *)
let test_is_bounced _switch () =
  Lwt_main.run (
    (* Create successful transaction *)
    let tx_success = {
      hash = "abc123";
      lt = 12345L;
      from_addr = None;
      to_addr = test_contract_address;
      value = 1_000_000_000L;
      fee = 10_000_000L;
      success = true;
      timestamp = Unix.time ();
    } in

    check bool "Successful tx should not be bounced"
      false (is_bounced tx_success);

    (* Create failed transaction *)
    let tx_failed = { tx_success with success = false } in
    check bool "Failed tx should be bounced"
      true (is_bounced tx_failed);

    Lwt.return ()
  )

(** Test: PolicyManager.create_policy operation code *)
let test_policy_create_op_code _switch () =
  Lwt_main.run (
    check int "Create policy op code should be 0x01"
      0x01 PolicyManager.op_create_policy;

    check int "Execute payout op code should be 0x02"
      0x02 PolicyManager.op_execute_payout;

    Lwt.return ()
  )

(** Test: MultiTrancheVault operation codes *)
let test_vault_op_codes _switch () =
  Lwt_main.run (
    check int "Deposit op code should be 0x10"
      0x10 MultiTrancheVault.op_deposit;

    check int "Withdraw op code should be 0x11"
      0x11 MultiTrancheVault.op_withdraw;

    check int "Claim yield op code should be 0x12"
      0x12 MultiTrancheVault.op_claim_yield;

    Lwt.return ()
  )

(** Test: BitcoinFloatManager operation codes *)
let test_btc_float_op_codes _switch () =
  Lwt_main.run (
    check int "Rebalance op code should be 0x20"
      0x20 BitcoinFloatManager.op_rebalance;

    check int "Emergency pause op code should be 0x21"
      0x21 BitcoinFloatManager.op_emergency_pause;

    Lwt.return ()
  )

(** Test: Transaction result type *)
let test_transaction_result_type _switch () =
  Lwt_main.run (
    let result = mock_tx_result "test_hash_123" in

    check string "Hash should match" "test_hash_123" result.tx.hash;
    check bool "Should be successful" true result.tx.success;
    check int "Exit code should be 0" 0 result.exit_code;
    check bool "Should not be bounced" false result.is_bounced;
    check (option string) "Should have no error message" None result.error_message;

    Lwt.return ()
  )

(** Test: Failed transaction result *)
let test_failed_transaction_result _switch () =
  Lwt_main.run (
    let result = mock_tx_result ~success:false ~exit_code:101 "failed_hash" in

    check bool "Should be failed" false result.tx.success;
    check bool "Should be bounced" true result.is_bounced;
    check (option string) "Should have error message"
      (Some "Test error") result.error_message;

    Lwt.return ()
  )

(** Test: Cell type *)
let test_cell_type _switch () =
  Lwt_main.run (
    let cell: cell = "test_base64_cell_data" in
    check string "Cell should be string" "test_base64_cell_data" cell;

    Lwt.return ()
  )

(** Test: Build payload for policy creation *)
let test_build_policy_payload _switch () =
  Lwt_main.run (
    let payload = build_message_payload
      ~op_code:PolicyManager.op_create_policy
      ~params:[
        ("beneficiary", `String test_wallet_address);
        ("asset_type", `Int 0);
        ("coverage_amount", `String "10000000000");
        ("trigger_price", `Int 980000);
        ("floor_price", `Int 950000);
        ("duration_seconds", `Int 2592000);
      ]
    in

    (* Verify payload structure *)
    let decoded = Base64.decode_exn payload in
    let json = Yojson.Safe.from_string decoded in
    let open Yojson.Safe.Util in

    let op = json |> member "op" |> to_int in
    check int "Op code should match create_policy"
      PolicyManager.op_create_policy op;

    let beneficiary = json |> member "beneficiary" |> to_string in
    check string "Beneficiary should match" test_wallet_address beneficiary;

    Lwt.return ()
  )

(** Test: Build payload for deposit *)
let test_build_deposit_payload _switch () =
  Lwt_main.run (
    let payload = build_message_payload
      ~op_code:MultiTrancheVault.op_deposit
      ~params:[
        ("tranche_id", `Int 0);
      ]
    in

    let decoded = Base64.decode_exn payload in
    let json = Yojson.Safe.from_string decoded in
    let open Yojson.Safe.Util in

    let op = json |> member "op" |> to_int in
    check int "Op code should match deposit"
      MultiTrancheVault.op_deposit op;

    let tranche_id = json |> member "tranche_id" |> to_int in
    check int "Tranche ID should be 0" 0 tranche_id;

    Lwt.return ()
  )

(** Test: Build payload for withdrawal *)
let test_build_withdrawal_payload _switch () =
  Lwt_main.run (
    let payload = build_message_payload
      ~op_code:MultiTrancheVault.op_withdraw
      ~params:[
        ("tranche_id", `Int 1);
        ("lp_tokens", `String "5000000000");
      ]
    in

    let decoded = Base64.decode_exn payload in
    let json = Yojson.Safe.from_string decoded in
    let open Yojson.Safe.Util in

    let op = json |> member "op" |> to_int in
    check int "Op code should match withdraw"
      MultiTrancheVault.op_withdraw op;

    let tranche_id = json |> member "tranche_id" |> to_int in
    check int "Tranche ID should be 1" 1 tranche_id;

    let lp_tokens = json |> member "lp_tokens" |> to_string in
    check string "LP tokens should match" "5000000000" lp_tokens;

    Lwt.return ()
  )

(** Test suite *)
let suite =
  [
    test_case "Build message payload" `Quick test_build_message_payload;
    test_case "Build internal message" `Quick test_build_internal_message;
    test_case "Error message from exit code" `Quick test_error_message_from_exit_code;
    test_case "Parse exit code" `Quick test_parse_exit_code;
    test_case "Is bounced" `Quick test_is_bounced;
    test_case "Policy create op code" `Quick test_policy_create_op_code;
    test_case "Vault op codes" `Quick test_vault_op_codes;
    test_case "BTC float op codes" `Quick test_btc_float_op_codes;
    test_case "Transaction result type" `Quick test_transaction_result_type;
    test_case "Failed transaction result" `Quick test_failed_transaction_result;
    test_case "Cell type" `Quick test_cell_type;
    test_case "Build policy payload" `Quick test_build_policy_payload;
    test_case "Build deposit payload" `Quick test_build_deposit_payload;
    test_case "Build withdrawal payload" `Quick test_build_withdrawal_payload;
  ]

let () =
  Lwt_main.run (
    run "TON Client Write Operations" [
      ("ton_client_write", suite);
    ]
  )
