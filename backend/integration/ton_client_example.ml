(* Example Usage of TON Client Write Operations

   This file demonstrates how to use the TON client for:
   - Creating insurance policies
   - Processing claims/payouts
   - Depositing to vaults
   - Withdrawing from vaults
   - Rebalancing BTC float
*)

open Core
open Lwt.Syntax
open Integration.TonClient

(* Configuration *)
let config = {
  network = Testnet;
  api_key = Some "your-api-key-here"; (* Get from https://toncenter.com *)
  timeout_seconds = 30;
}

(* Example addresses - replace with real ones *)
let wallet_address = "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2"
let policy_factory_address = "EQAvDfWFG0oYX19jwNDNBBL1rKNT9XfaGP9HyTb5nb2Eml6y"
let vault_address = "EQC4hY6VPGpTZuJr9TqLEJcLwfFJQKXhLhPKKpzqTJZi3nYG"

(** Example 1: Create an insurance policy **)
let example_create_policy () =
  let%lwt result = PolicyManager.create_policy config
    ~wallet_address
    ~contract_address:policy_factory_address
    ~beneficiary:wallet_address
    ~asset_type:0 (* USDT *)
    ~coverage_amount:10_000_000_000L (* $100 coverage, in cents *)
    ~premium_amount:500_000_000L (* 0.5 TON premium *)
    ~trigger_price:980000 (* $0.98 *)
    ~floor_price:950000 (* $0.95 *)
    ~duration_seconds:2592000 (* 30 days *)
  in

  if result.tx.success then (
    let%lwt () = Lwt_io.printlf "✓ Policy created successfully!" in
    let%lwt () = Lwt_io.printlf "  Transaction hash: %s" result.tx.hash in
    let%lwt () = Lwt_io.printlf "  Logical time: %Ld" result.tx.lt in
    let%lwt () = Lwt_io.printlf "  Gas fee: %.3f TON"
      (Int64.to_float result.tx.fee /. 1e9) in

    (* Parse event to get policy ID *)
    let%lwt () = Lwt_io.printlf "  Parse PolicyCreated event to get policy_id" in
    Lwt.return_unit
  ) else (
    let%lwt () = Lwt_io.eprintlf "✗ Policy creation failed!" in
    let%lwt () = Lwt_io.eprintlf "  Error: %s"
      (Option.value result.error_message ~default:"unknown") in
    let%lwt () = Lwt_io.eprintlf "  Exit code: %d" result.exit_code in
    Lwt.return_unit
  )

(** Example 2: Execute a payout (process claim) **)
let example_execute_payout ~policy_id =
  let%lwt result = PolicyManager.execute_payout config
    ~wallet_address
    ~contract_address:policy_factory_address
    ~policy_id
    ~current_price:970000 (* $0.97 - triggered *)
  in

  if result.tx.success then (
    let%lwt () = Lwt_io.printlf "✓ Payout executed!" in
    let%lwt () = Lwt_io.printlf "  Transaction: %s" result.tx.hash in
    Lwt.return_unit
  ) else (
    let%lwt () = Lwt_io.eprintlf "✗ Payout failed: %s"
      (Option.value result.error_message ~default:"unknown") in
    Lwt.return_unit
  )

(** Example 3: Deposit to vault (become LP) **)
let example_deposit_to_vault ~tranche_id ~amount =
  let%lwt result = MultiTrancheVault.deposit config
    ~wallet_address
    ~contract_address:vault_address
    ~tranche_id
    ~amount
  in

  if result.tx.success then (
    let%lwt () = Lwt_io.printlf "✓ Deposited %.2f TON to tranche %d"
      (Int64.to_float amount /. 1e9) tranche_id in
    let%lwt () = Lwt_io.printlf "  You'll receive LP tokens" in
    Lwt.return_unit
  ) else (
    let%lwt () = Lwt_io.eprintlf "✗ Deposit failed: %s"
      (Option.value result.error_message ~default:"unknown") in
    Lwt.return_unit
  )

(** Example 4: Withdraw from vault (redeem LP tokens) **)
let example_withdraw_from_vault ~tranche_id ~lp_tokens =
  let%lwt result = MultiTrancheVault.withdraw config
    ~wallet_address
    ~contract_address:vault_address
    ~tranche_id
    ~lp_tokens
  in

  if result.tx.success then (
    let%lwt () = Lwt_io.printlf "✓ Withdrew %Ld LP tokens from tranche %d"
      lp_tokens tranche_id in
    let%lwt () = Lwt_io.printlf "  Received TON based on NAV" in
    Lwt.return_unit
  ) else (
    let%lwt () = Lwt_io.eprintlf "✗ Withdrawal failed: %s"
      (Option.value result.error_message ~default:"unknown") in
    Lwt.return_unit
  )

(** Example 5: Trigger BTC float rebalance **)
let example_rebalance_btc_float ~btc_price =
  let btc_float_address = "EQBbtc_float_manager_address" in

  let%lwt result = BitcoinFloatManager.rebalance config
    ~wallet_address
    ~contract_address:btc_float_address
    ~btc_price
  in

  if result.tx.success then (
    let%lwt () = Lwt_io.printlf "✓ BTC float rebalanced at price $%Ld" btc_price in
    Lwt.return_unit
  ) else (
    let%lwt () = Lwt_io.eprintlf "✗ Rebalance failed: %s"
      (Option.value result.error_message ~default:"unknown") in
    Lwt.return_unit
  )

(** Example 6: Handle transaction errors gracefully **)
let example_error_handling () =
  try%lwt
    (* Try to create policy with insufficient funds *)
    let%lwt result = PolicyManager.create_policy config
      ~wallet_address:"EQEmpty_wallet"
      ~contract_address:policy_factory_address
      ~beneficiary:wallet_address
      ~asset_type:0
      ~coverage_amount:10_000_000_000L
      ~premium_amount:1_000_000_000_000_000L (* Way too much *)
      ~trigger_price:980000
      ~floor_price:950000
      ~duration_seconds:2592000
    in

    if not result.tx.success then (
      (* Handle different error types *)
      match result.exit_code with
      | 101 ->
          let%lwt () = Lwt_io.printlf "Insufficient balance - please top up wallet" in
          Lwt.return_unit
      | 100 ->
          let%lwt () = Lwt_io.printlf "Access denied - check wallet permissions" in
          Lwt.return_unit
      | 13 ->
          let%lwt () = Lwt_io.printlf "Out of gas - increase transaction amount" in
          Lwt.return_unit
      | _ ->
          let%lwt () = Lwt_io.printlf "Transaction failed: %s"
            (Option.value result.error_message ~default:"unknown") in
          Lwt.return_unit
    ) else
      Lwt.return_unit

  with
  | Failure msg ->
      let%lwt () = Lwt_io.eprintlf "Network error: %s" msg in
      let%lwt () = Lwt_io.printlf "Retrying in 5 seconds..." in
      let%lwt () = Lwt_unix.sleep 5.0 in
      Lwt.return_unit

(** Example 7: Send transaction without waiting for confirmation **)
let example_fire_and_forget () =
  (* Build payload *)
  let payload = build_message_payload
    ~op_code:0x01
    ~params:[("test", `String "value")]
  in

  (* Send transaction (returns immediately) *)
  let%lwt tx = send_transaction config
    ~wallet_address
    ~contract_address:policy_factory_address
    ~op_code:0x01
    ~payload
    ~amount:100_000_000L
  in

  let%lwt () = Lwt_io.printlf "Transaction sent: %s" tx.hash in
  let%lwt () = Lwt_io.printlf "Confirming asynchronously..." in

  (* Wait for confirmation in background *)
  Lwt.async (fun () ->
    let%lwt result = wait_for_confirmation config
      ~tx_hash:tx.hash
      ~max_attempts:30
    in
    Lwt_io.printlf "Transaction confirmed: %s" result.tx.hash
  );

  Lwt.return_unit

(** Example 8: Custom retry logic **)
let rec example_retry_on_failure ~attempts_left action =
  if attempts_left <= 0 then
    Lwt.fail_with "Max retries exceeded"
  else
    try%lwt
      let%lwt result = action () in
      if result.tx.success then
        Lwt.return result
      else if result.exit_code = 13 then (
        (* Out of gas - increase amount and retry *)
        let%lwt () = Lwt_io.printlf "Out of gas, retrying with more..." in
        let%lwt () = Lwt_unix.sleep 2.0 in
        example_retry_on_failure ~attempts_left:(attempts_left - 1) action
      ) else
        Lwt.return result
    with
    | Failure msg when String.is_substring msg ~substring:"network" ->
        let%lwt () = Lwt_io.printlf "Network error, retrying..." in
        let%lwt () = Lwt_unix.sleep 2.0 in
        example_retry_on_failure ~attempts_left:(attempts_left - 1) action

(** Main function - run all examples **)
let main () =
  let%lwt () = Lwt_io.printlf "\n=== TON Client Write Operations Examples ===\n" in

  let%lwt () = Lwt_io.printlf "Example 1: Create Policy" in
  let%lwt () = example_create_policy () in

  let%lwt () = Lwt_io.printlf "\nExample 2: Execute Payout" in
  let%lwt () = example_execute_payout ~policy_id:12345L in

  let%lwt () = Lwt_io.printlf "\nExample 3: Deposit to Vault" in
  let%lwt () = example_deposit_to_vault
    ~tranche_id:0
    ~amount:10_000_000_000L (* 10 TON *)
  in

  let%lwt () = Lwt_io.printlf "\nExample 4: Withdraw from Vault" in
  let%lwt () = example_withdraw_from_vault
    ~tranche_id:0
    ~lp_tokens:5_000_000_000L
  in

  let%lwt () = Lwt_io.printlf "\nExample 5: Rebalance BTC Float" in
  let%lwt () = example_rebalance_btc_float ~btc_price:65000_00L in

  let%lwt () = Lwt_io.printlf "\nExample 6: Error Handling" in
  let%lwt () = example_error_handling () in

  let%lwt () = Lwt_io.printlf "\nExample 7: Fire and Forget" in
  let%lwt () = example_fire_and_forget () in

  let%lwt () = Lwt_io.printlf "\n=== Examples Complete ===\n" in
  Lwt.return_unit

(* Run if executed directly *)
(* let () = Lwt_main.run (main ()) *)
