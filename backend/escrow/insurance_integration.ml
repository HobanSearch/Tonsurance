(** Escrow Insurance Integration
 *
 * Seamlessly integrates escrow system with PolicyFactory insurance system.
 * When escrow has protection_enabled=true, automatically creates an insurance
 * policy to protect the escrowed funds from various risk scenarios.
 *
 * Features:
 * - Automatic policy creation when escrow is funded
 * - Premium calculation with escrow-specific discounts
 * - Claim trigger on exploit, timeout, or dispute
 * - Coverage types: PayerOnly, PayeeOnly, BothParties
 *)

open Lwt.Syntax
open Types
open Core

(** Protection result when policy is created *)
type protection_result = {
  policy_id: int64;
  premium_paid: usd_cents;
  coverage_type: protection_coverage;
  coverage_amount: usd_cents;
  expires_at: float;
  protection_details: protection_breakdown;
} [@@deriving sexp, yojson]

and protection_breakdown = {
  base_premium: usd_cents;
  duration_discount: float;
  volume_discount: float;
  coverage_multiplier: float; (* BothParties = 1.5x *)
  final_premium: usd_cents;
} [@@deriving sexp, yojson]

(** Escrow-specific claim reasons *)
type escrow_claim_reason =
  | SmartContractExploit of {
      contract_address: string;
      amount_lost: usd_cents;
      exploit_type: string;
      verified_at: float;
    }
  | TimeoutProtection of {
      original_payee: string;
      timeout_at: float;
      protection_activated_at: float;
    }
  | DisputeResolution of {
      dispute_id: int64;
      winner: string;
      resolution_reason: string;
      resolved_at: float;
    }
  | UnfairCancellation of {
      canceller: string;
      cancellation_time: float;
      work_completed_pct: float;
    }
[@@deriving sexp, yojson]

(** Claim result after processing *)
type claim_result = {
  escrow_id: int64;
  policy_id: int64;
  claim_reason: escrow_claim_reason;
  payout_amount: usd_cents;
  recipient: string;
  processed_at: float;
  transaction_hash: string option;
} [@@deriving sexp, yojson]

(** Configuration for escrow insurance *)
type insurance_config = {
  base_apr: float; (* 0.008 = 0.8% APR *)
  short_duration_threshold_days: int; (* 7 days *)
  short_duration_discount: float; (* 0.8 = 20% off *)
  medium_duration_threshold_days: int; (* 30 days *)
  medium_duration_discount: float; (* 0.9 = 10% off *)
  volume_threshold: int; (* 5 active escrows *)
  volume_discount: float; (* 0.9 = 10% off *)
  both_parties_multiplier: float; (* 1.5x for dual coverage *)
  minimum_premium_cents: usd_cents; (* $1.00 minimum *)
}

let default_config = {
  base_apr = 0.008; (* 0.8% APR - competitive rate *)
  short_duration_threshold_days = 7;
  short_duration_discount = 0.8;
  medium_duration_threshold_days = 30;
  medium_duration_discount = 0.9;
  volume_threshold = 5;
  volume_discount = 0.9;
  both_parties_multiplier = 1.5;
  minimum_premium_cents = 100_00L; (* $1.00 *)
}

(** Premium calculation for escrow protection *)
module PremiumCalculator = struct

  (** Calculate duration discount based on escrow length *)
  let calculate_duration_discount ~duration_days ~config : float =
    if duration_days <= config.short_duration_threshold_days then
      config.short_duration_discount (* 20% off for week or less *)
    else if duration_days <= config.medium_duration_threshold_days then
      config.medium_duration_discount (* 10% off for month or less *)
    else
      1.0 (* No discount for longer durations *)

  (** Calculate volume discount based on active escrow count *)
  let calculate_volume_discount ~active_escrow_count ~config : float =
    if active_escrow_count >= config.volume_threshold then
      config.volume_discount (* 10% off for 5+ active escrows *)
    else
      1.0 (* No discount *)

  (** Calculate coverage multiplier based on protection type *)
  let calculate_coverage_multiplier ~protection_type ~config : float =
    match protection_type with
    | PayerOnly -> 1.0
    | PayeeOnly -> 1.0
    | BothParties -> config.both_parties_multiplier (* 1.5x for both *)

  (** Main premium calculation function *)
  let calculate_escrow_premium
      ~(escrow_amount: usd_cents)
      ~(duration_days: int)
      ~(protection_coverage: protection_coverage)
      ~(active_escrow_count: int)
      ?(config = default_config)
      ()
    : protection_breakdown =

    (* Base premium: amount × APR × (days/365) *)
    let escrow_amount_usd = Math.cents_to_usd escrow_amount in
    let base_annual = escrow_amount_usd *. config.base_apr in
    let base_premium_usd = base_annual *. (Float.of_int duration_days /. 365.0) in
    let base_premium = Math.usd_to_cents base_premium_usd in

    (* Apply discounts and multipliers *)
    let duration_discount = calculate_duration_discount ~duration_days ~config in
    let volume_discount = calculate_volume_discount ~active_escrow_count ~config in
    let coverage_mult = calculate_coverage_multiplier
      ~protection_type:protection_coverage ~config in

    (* Calculate final premium *)
    let final_premium_usd =
      base_premium_usd
      *. duration_discount
      *. volume_discount
      *. coverage_mult
    in
    let final_premium = Math.usd_to_cents final_premium_usd in

    (* Apply minimum premium floor *)
    let final_premium = Int64.max final_premium config.minimum_premium_cents in

    {
      base_premium;
      duration_discount;
      volume_discount;
      coverage_multiplier = coverage_mult;
      final_premium;
    }

  (** Get human-readable premium quote *)
  let format_premium_quote (breakdown: protection_breakdown) : string =
    let base_usd = Math.cents_to_usd breakdown.base_premium in
    let final_usd = Math.cents_to_usd breakdown.final_premium in
    let savings = base_usd -. final_usd in

    Printf.sprintf
      "Premium: $%.2f (Base: $%.2f, Savings: $%.2f)\nDiscounts: Duration %.0f%%, Volume %.0f%%\nCoverage: %.1fx"
      final_usd
      base_usd
      savings
      ((1.0 -. breakdown.duration_discount) *. 100.0)
      ((1.0 -. breakdown.volume_discount) *. 100.0)
      breakdown.coverage_multiplier

end

(** Policy creation and management *)
module PolicyManager = struct

  (** Create insurance policy for escrow *)
  let create_protection_policy
      ~(escrow: escrow_contract)
      ~(premium_breakdown: protection_breakdown)
      ~(create_policy_fn: policy -> int64 Lwt.t) (* Injected PolicyFactory function *)
    : protection_result Lwt.t =

    let duration_seconds = Float.of_int escrow.timeout_seconds in
    let duration_days = Int.of_float (duration_seconds /. 86400.0) in

    (* Create policy structure *)
    let policy = {
      policy_id = 0L; (* Will be assigned by PolicyFactory *)
      policyholder = escrow.payer;
      beneficiary = Some escrow.payee;
      coverage_type = Smart_contract; (* Escrow protection is smart contract insurance *)
      chain = TON; (* All escrows are on TON *)
      asset = escrow.asset;
      coverage_amount = escrow.amount;
      premium_paid = premium_breakdown.final_premium;
      trigger_price = 0.98; (* Standard depeg trigger for stablecoin escrow *)
      floor_price = 0.90; (* Full coverage at 10% depeg *)
      start_time = Unix.time ();
      expiry_time = Unix.time () +. duration_seconds;
      status = Active;
      payout_amount = None;
      payout_time = None;
      is_gift = false;
      gift_message = Some (Printf.sprintf "Escrow #%Ld Protection" escrow.escrow_id);
    } in

    let%lwt policy_id = create_policy_fn policy in

    Lwt.return {
      policy_id;
      premium_paid = premium_breakdown.final_premium;
      coverage_type = escrow.protection_covers;
      coverage_amount = escrow.amount;
      expires_at = policy.expiry_time;
      protection_details = premium_breakdown;
    }

  (** Cancel protection policy when escrow completes successfully *)
  let cancel_protection
      ~(policy_id: int64)
      ~(cancel_policy_fn: int64 -> unit Lwt.t)
    : unit Lwt.t =

    (* If escrow released successfully, cancel the insurance policy *)
    (* and potentially refund unused premium *)
    cancel_policy_fn policy_id

end

(** Claims processing for escrow-triggered events *)
module ClaimsProcessor = struct

  (** Determine payout recipient based on claim reason and protection type *)
  let determine_payout_recipient
      ~(escrow: escrow_contract)
      ~(claim_reason: escrow_claim_reason)
    : string option =

    match claim_reason with
    | SmartContractExploit _ ->
        (* Contract exploit - pay protected party based on coverage *)
        (match escrow.protection_covers with
         | PayerOnly -> Some escrow.payer
         | PayeeOnly -> Some escrow.payee
         | BothParties -> Some escrow.payer (* Default to payer for exploit *))

    | TimeoutProtection { original_payee; _ } ->
        (* Timeout with PayeeOnly protection - pay payee *)
        (match escrow.protection_covers with
         | PayeeOnly -> Some original_payee
         | _ -> None) (* Only PayeeOnly gets timeout protection *)

    | DisputeResolution { winner; _ } ->
        (* Dispute resolved - pay the winner if protected *)
        (match escrow.protection_covers with
         | BothParties -> Some winner
         | PayerOnly when winner = escrow.payer -> Some winner
         | PayeeOnly when winner = escrow.payee -> Some winner
         | _ -> None)

    | UnfairCancellation { canceller; _ } ->
        (* Unfair cancellation - pay the non-canceller if protected *)
        let victim = if canceller = escrow.payer then escrow.payee else escrow.payer in
        (match escrow.protection_covers with
         | BothParties -> Some victim
         | PayerOnly when victim = escrow.payer -> Some victim
         | PayeeOnly when victim = escrow.payee -> Some victim
         | _ -> None)

  (** Calculate claim payout amount *)
  let calculate_claim_payout
      ~(escrow: escrow_contract)
      ~(claim_reason: escrow_claim_reason)
    : usd_cents =

    match claim_reason with
    | SmartContractExploit { amount_lost; _ } ->
        (* Pay the actual amount lost, up to coverage amount *)
        Int64.min amount_lost escrow.amount

    | TimeoutProtection _ ->
        (* Timeout protection pays full escrow amount *)
        escrow.amount

    | DisputeResolution _ ->
        (* Dispute resolution pays full escrow amount to winner *)
        escrow.amount

    | UnfairCancellation { work_completed_pct; _ } ->
        (* Pay proportional to work completed *)
        let pct = Float.min 1.0 (Float.max 0.0 work_completed_pct) in
        Int64.of_float (Int64.to_float escrow.amount *. pct)

  (** Process escrow claim *)
  let process_escrow_claim
      ~(escrow: escrow_contract)
      ~(policy_id: int64)
      ~(reason: escrow_claim_reason)
      ~(execute_payout_fn: string -> usd_cents -> string Lwt.t) (* Returns tx_hash *)
    : claim_result Lwt.t =

    (* Determine recipient *)
    let%lwt recipient = match determine_payout_recipient ~escrow ~claim_reason:reason with
      | Some addr -> Lwt.return addr
      | None -> Lwt.fail_with "No eligible recipient for this claim"
    in

    (* Calculate payout amount *)
    let payout_amount = calculate_claim_payout ~escrow ~claim_reason:reason in

    (* Execute payout *)
    let%lwt tx_hash = execute_payout_fn recipient payout_amount in

    Lwt.return {
      escrow_id = escrow.escrow_id;
      policy_id;
      claim_reason = reason;
      payout_amount;
      recipient;
      processed_at = Unix.time ();
      transaction_hash = Some tx_hash;
    }

  (** Trigger claim automatically on exploit detection *)
  let trigger_exploit_claim
      ~(escrow: escrow_contract)
      ~(policy_id: int64)
      ~(contract_address: string)
      ~(amount_lost: usd_cents)
      ~(exploit_type: string)
      ~(execute_payout_fn: string -> usd_cents -> string Lwt.t)
    : claim_result Lwt.t =

    let reason = SmartContractExploit {
      contract_address;
      amount_lost;
      exploit_type;
      verified_at = Unix.time ();
    } in

    process_escrow_claim ~escrow ~policy_id ~reason ~execute_payout_fn

  (** Trigger claim on timeout (PayeeOnly protection) *)
  let trigger_timeout_claim
      ~(escrow: escrow_contract)
      ~(policy_id: int64)
      ~(execute_payout_fn: string -> usd_cents -> string Lwt.t)
    : claim_result Lwt.t =

    let reason = TimeoutProtection {
      original_payee = escrow.payee;
      timeout_at = escrow.created_at +. Float.of_int escrow.timeout_seconds;
      protection_activated_at = Unix.time ();
    } in

    process_escrow_claim ~escrow ~policy_id ~reason ~execute_payout_fn

  (** Trigger claim on dispute resolution *)
  let trigger_dispute_claim
      ~(escrow: escrow_contract)
      ~(policy_id: int64)
      ~(dispute_id: int64)
      ~(winner: string)
      ~(resolution_reason: string)
      ~(execute_payout_fn: string -> usd_cents -> string Lwt.t)
    : claim_result Lwt.t =

    let reason = DisputeResolution {
      dispute_id;
      winner;
      resolution_reason;
      resolved_at = Unix.time ();
    } in

    process_escrow_claim ~escrow ~policy_id ~reason ~execute_payout_fn

end

(** Main integration module - public API *)
module EscrowInsurance = struct

  (** Create protection for escrow *)
  let create_protection
      ~(escrow: escrow_contract)
      ~(active_escrow_count: int)
      ~(create_policy_fn: policy -> int64 Lwt.t)
    : protection_result Lwt.t =

    if not escrow.protection_enabled then
      Lwt.fail_with "Protection not enabled for this escrow"
    else
      (* Calculate premium *)
      let duration_days = escrow.timeout_seconds / 86400 in
      let premium_breakdown = PremiumCalculator.calculate_escrow_premium
        ~escrow_amount:escrow.amount
        ~duration_days
        ~protection_coverage:escrow.protection_covers
        ~active_escrow_count
        ()
      in

      (* Create policy *)
      PolicyManager.create_protection_policy
        ~escrow
        ~premium_breakdown
        ~create_policy_fn

  (** Trigger claim for escrow event *)
  let trigger_claim
      ~(escrow: escrow_contract)
      ~(policy_id: int64)
      ~(reason: escrow_claim_reason)
      ~(execute_payout_fn: string -> usd_cents -> string Lwt.t)
    : claim_result Lwt.t =

    match escrow.protection_enabled with
    | false -> Lwt.fail_with "Escrow does not have protection enabled"
    | true ->
        ClaimsProcessor.process_escrow_claim
          ~escrow
          ~policy_id
          ~reason
          ~execute_payout_fn

  (** Get premium quote without creating policy *)
  let get_premium_quote
      ~(escrow_amount: usd_cents)
      ~(duration_days: int)
      ~(protection_coverage: protection_coverage)
      ~(active_escrow_count: int)
    : protection_breakdown =

    PremiumCalculator.calculate_escrow_premium
      ~escrow_amount
      ~duration_days
      ~protection_coverage
      ~active_escrow_count
      ()

  (** Format premium quote for display *)
  let format_quote = PremiumCalculator.format_premium_quote

end
