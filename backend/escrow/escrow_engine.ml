(**
 * Parametric Escrow Engine
 * Handles conditional payment releases based on oracle verification,
 * time elapsed, manual approvals, chain events, and multisig
 *)

open Lwt.Syntax
open Types

(** Escrow state management *)
module EscrowState = struct

  (** Check if time-based condition is met *)
  let check_time_condition
      (condition: release_condition)
      ~(current_time: float)
    : bool * release_condition =

    match condition with
    | TimeElapsed { seconds; start_time } ->
        let elapsed = current_time -. start_time in
        let met = elapsed >= float_of_int seconds in
        (met, condition)
    | _ -> (false, condition)

  (** Check if oracle condition is met *)
  let check_oracle_condition
      (condition: release_condition)
      ~(fetch_oracle: string -> string Lwt.t)
    : (bool * release_condition) Lwt.t =

    match condition with
    | OracleVerification { oracle_endpoint; expected_value; verified; last_check } ->
        let%lwt actual_value =
          try%lwt
            fetch_oracle oracle_endpoint
          with _ ->
            Lwt.return ""
        in

        let is_verified = actual_value = expected_value in
        let updated_condition = OracleVerification {
          oracle_endpoint;
          expected_value;
          verified = is_verified;
          last_check = Some (Unix.time ());
        } in

        Lwt.return (is_verified, updated_condition)

    | _ -> Lwt.return (false, condition)

  (** Check if manual approval is given *)
  let check_manual_approval
      (condition: release_condition)
      ~(verify_signature: string -> string -> bool)
    : bool * release_condition =

    match condition with
    | ManualApproval { approver; approved; approval_deadline; signature } ->
        let is_valid = match signature with
          | Some sig_data -> verify_signature approver sig_data
          | None -> false
        in

        let is_approved = approved && is_valid in

        (* Check deadline if exists *)
        let deadline_ok = match approval_deadline with
          | None -> true
          | Some deadline -> Unix.time () <= deadline
        in

        (is_approved && deadline_ok, condition)

    | _ -> (false, condition)

  (** Check if chain event occurred *)
  let check_chain_event
      (condition: release_condition)
      ~(query_chain: blockchain -> string -> bool Lwt.t)
    : (bool * release_condition) Lwt.t =

    match condition with
    | ChainEvent { chain; event_type; contract_address; occurred; verified_at } ->
        if occurred then
          Lwt.return (true, condition)
        else
          let%lwt event_occurred = query_chain chain contract_address in

          let updated_condition = ChainEvent {
            chain;
            event_type;
            contract_address;
            occurred = event_occurred;
            verified_at = if event_occurred then Some (Unix.time ()) else None;
          } in

          Lwt.return (event_occurred, updated_condition)

    | _ -> Lwt.return (false, condition)

  (** Check if multisig threshold is met *)
  let check_multisig_approval
      (condition: release_condition)
      ~(verify_signature: string -> string -> bool)
    : bool * release_condition =

    match condition with
    | MultisigApproval { required_signatures; signers; signatures_received } ->
        (* Verify each signature *)
        let valid_signatures =
          List.filter (fun (signer, sig_data) ->
            List.mem signer signers &&
            verify_signature signer sig_data
          ) signatures_received
        in

        let is_approved = List.length valid_signatures >= required_signatures in

        (is_approved, condition)

    | _ -> (false, condition)

  (** Check all conditions for an escrow *)
  let check_all_conditions
      (escrow: escrow_contract)
      ~(fetch_oracle: string -> string Lwt.t)
      ~(query_chain: blockchain -> string -> bool Lwt.t)
      ~(verify_signature: string -> string -> bool)
    : (bool * escrow_contract) Lwt.t =

    let current_time = Unix.time () in

    (* Check each condition type *)
    let%lwt updated_conditions =
      Lwt_list.map_s (fun condition ->
        match condition with
        | TimeElapsed _ ->
            let (met, updated) = check_time_condition condition ~current_time in
            Lwt.return (met, updated)

        | OracleVerification _ ->
            check_oracle_condition condition ~fetch_oracle

        | ManualApproval _ ->
            let (met, updated) = check_manual_approval condition ~verify_signature in
            Lwt.return (met, updated)

        | ChainEvent _ ->
            check_chain_event condition ~query_chain

        | MultisigApproval _ ->
            let (met, updated) = check_multisig_approval condition ~verify_signature in
            Lwt.return (met, updated)
      ) escrow.release_conditions
    in

    let (met_list, updated_condition_list) = List.split updated_conditions in

    (* All conditions must be met *)
    let all_conditions_met = List.for_all (fun x -> x) met_list in

    let updated_escrow = {
      escrow with
      release_conditions = updated_condition_list;
    } in

    Lwt.return (all_conditions_met, updated_escrow)

end

(** Escrow operations *)
module EscrowOps = struct

  (** Create new escrow contract *)
  let create_escrow
      ~(payer: string)
      ~(payee: string)
      ~(amount: usd_cents)
      ~(release_conditions: release_condition list)
      ~(timeout_action: timeout_action)
      ~(timeout_seconds: int)
      ~(additional_parties: party_allocation list)
      ~(protection_enabled: bool)
    : escrow_contract =

    let escrow_id = Int64.of_float (Unix.time () *. 1000.0) in

    {
      escrow_id;
      payer;
      payee;
      amount;
      release_conditions;
      timeout_action;
      additional_parties;
      status = EscrowActive;
      created_at = Unix.time ();
      funded_at = Some (Unix.time ());
      released_at = None;
      timeout_at = Unix.time () +. float_of_int timeout_seconds;
      protection_enabled;
      protection_policy_id = None;
    }

  (** Fund escrow (deposit from payer) *)
  let fund_escrow
      (escrow: escrow_contract)
      ~(funding_tx: string)
    : escrow_contract =

    {
      escrow with
      funded_at = Some (Unix.time ());
      status = EscrowActive;
    }

  (** Release escrow funds to payee *)
  let release_escrow
      (escrow: escrow_contract)
      ~(conditions_met: bool)
    : (escrow_contract, string) result =

    if not conditions_met then
      Error "Release conditions not met"
    else if escrow.status <> EscrowActive then
      Error "Escrow not active"
    else
      let updated = {
        escrow with
        status = Released;
        released_at = Some (Unix.time ());
      } in

      Ok updated

  (** Handle escrow timeout *)
  let handle_timeout
      (escrow: escrow_contract)
    : escrow_contract =

    let now = Unix.time () in

    if now < escrow.timeout_at then
      escrow (* Not timed out yet *)
    else
      match escrow.timeout_action with
      | RefundPayer ->
          { escrow with
            status = Cancelled;
            released_at = Some now;
          }

      | ReleaseFunds ->
          { escrow with
            status = Released;
            released_at = Some now;
          }

      | ExtendTimeout extension_seconds ->
          { escrow with
            timeout_at = escrow.timeout_at +. float_of_int extension_seconds;
          }

  (** Distribute funds to multiple parties *)
  let distribute_funds
      (escrow: escrow_contract)
    : (string * usd_cents) list =

    let primary_amount = escrow.amount in

    (* Calculate additional party amounts *)
    let additional_distributions =
      List.map (fun (party: party_allocation) ->
        let party_amount =
          Int64.of_float (Int64.to_float primary_amount *. party.percentage /. 100.0)
        in
        (party.party_address, party_amount)
      ) escrow.additional_parties
    in

    (* Primary payee gets remaining amount *)
    let additional_total =
      List.fold_left (fun acc (_, amt) -> Int64.add acc amt) 0L additional_distributions
    in

    let payee_amount = Int64.sub primary_amount additional_total in

    (escrow.payee, payee_amount) :: additional_distributions

  (** Cancel escrow (refund payer) *)
  let cancel_escrow
      (escrow: escrow_contract)
      ~(canceller: string)
    : (escrow_contract, string) result =

    if escrow.status <> EscrowActive then
      Error "Escrow not active"
    else if canceller <> escrow.payer && canceller <> escrow.payee then
      Error "Only payer or payee can cancel"
    else
      let updated = {
        escrow with
        status = Cancelled;
        released_at = Some (Unix.time ());
      } in

      Ok updated

end

(** Escrow monitoring daemon *)
module EscrowMonitor = struct

  type monitor_state = {
    escrows: escrow_contract list;
    last_check: float;
  }

  (** Check escrow for release *)
  let check_escrow_release
      (escrow: escrow_contract)
      ~(fetch_oracle: string -> string Lwt.t)
      ~(query_chain: blockchain -> string -> bool Lwt.t)
      ~(verify_signature: string -> string -> bool)
    : (escrow_contract * bool) Lwt.t =

    if escrow.status <> EscrowActive then
      Lwt.return (escrow, false)
    else
      let%lwt (conditions_met, updated_escrow) =
        EscrowState.check_all_conditions
          escrow
          ~fetch_oracle
          ~query_chain
          ~verify_signature
      in

      Lwt.return (updated_escrow, conditions_met)

  (** Process single escrow *)
  let process_escrow
      (escrow: escrow_contract)
      ~(fetch_oracle: string -> string Lwt.t)
      ~(query_chain: blockchain -> string -> bool Lwt.t)
      ~(verify_signature: string -> string -> bool)
      ~(execute_release: escrow_contract -> unit Lwt.t)
    : escrow_contract Lwt.t =

    (* Check for timeout *)
    let escrow_after_timeout = EscrowOps.handle_timeout escrow in

    if escrow_after_timeout.status <> EscrowActive then
      Lwt.return escrow_after_timeout
    else
      (* Check release conditions *)
      let%lwt (updated_escrow, should_release) =
        check_escrow_release
          escrow_after_timeout
          ~fetch_oracle
          ~query_chain
          ~verify_signature
      in

      if should_release then
        (* Execute release *)
        match EscrowOps.release_escrow updated_escrow ~conditions_met:true with
        | Error _ -> Lwt.return updated_escrow
        | Ok released_escrow ->
            let%lwt () = execute_release released_escrow in
            Lwt.return released_escrow
      else
        Lwt.return updated_escrow

  (** Monitor all escrows *)
  let monitor_all_escrows
      ~(escrows: escrow_contract list)
      ~(fetch_oracle: string -> string Lwt.t)
      ~(query_chain: blockchain -> string -> bool Lwt.t)
      ~(verify_signature: string -> string -> bool)
      ~(execute_release: escrow_contract -> unit Lwt.t)
    : escrow_contract list Lwt.t =

    Lwt_list.map_p (fun escrow ->
      process_escrow
        escrow
        ~fetch_oracle
        ~query_chain
        ~verify_signature
        ~execute_release
    ) escrows

  (** Start monitoring daemon *)
  let start_monitoring_daemon
      ?(check_interval = 60.0) (* 1 minute *)
      ~(get_active_escrows: unit -> escrow_contract list Lwt.t)
      ~(update_escrow: escrow_contract -> unit Lwt.t)
      ~(fetch_oracle: string -> string Lwt.t)
      ~(query_chain: blockchain -> string -> bool Lwt.t)
      ~(verify_signature: string -> string -> bool)
      ~(execute_release: escrow_contract -> unit Lwt.t)
    : unit Lwt.t =

    let rec monitoring_loop () =
      let%lwt active_escrows = get_active_escrows () in

      let () =
        Printf.printf "[Escrow Monitor] Checking %d active escrows\n"
          (List.length active_escrows);
        flush stdout
      in

      (* Process all escrows *)
      let%lwt updated_escrows =
        monitor_all_escrows
          ~escrows:active_escrows
          ~fetch_oracle
          ~query_chain
          ~verify_signature
          ~execute_release
      in

      (* Update escrows in database *)
      let%lwt () = Lwt_list.iter_p update_escrow updated_escrows in

      (* Wait before next check *)
      let%lwt () = Lwt_unix.sleep check_interval in

      monitoring_loop ()
    in

    monitoring_loop ()

end

(** Escrow use case templates *)
module EscrowTemplates = struct

  (** Freelance milestone payment *)
  let create_freelance_escrow
      ~(client: string)
      ~(freelancer: string)
      ~(amount: usd_cents)
      ~(milestone_url: string)
      ~(deadline_days: int)
    : escrow_contract =

    let conditions = [
      (* Freelancer submits work *)
      ManualApproval {
        approver = client;
        approved = false;
        approval_deadline = Some (Unix.time () +. (float_of_int deadline_days *. 86400.0));
        signature = None;
      };

      (* Deadline must be met *)
      TimeElapsed {
        seconds = deadline_days * 86400;
        start_time = Unix.time ();
      };
    ] in

    EscrowOps.create_escrow
      ~payer:client
      ~payee:freelancer
      ~amount
      ~release_conditions:conditions
      ~timeout_action:(RefundPayer)
      ~timeout_seconds:(deadline_days * 86400 * 2) (* 2x deadline for disputes *)
      ~additional_parties:[]
      ~protection_enabled:true

  (** International trade escrow *)
  let create_trade_escrow
      ~(buyer: string)
      ~(seller: string)
      ~(amount: usd_cents)
      ~(shipping_oracle: string)
      ~(expected_delivery_date: float)
    : escrow_contract =

    let conditions = [
      (* Oracle confirms delivery *)
      OracleVerification {
        oracle_endpoint = shipping_oracle;
        expected_value = "DELIVERED";
        verified = false;
        last_check = None;
      };

      (* Buyer manual approval as backup *)
      ManualApproval {
        approver = buyer;
        approved = false;
        approval_deadline = Some (expected_delivery_date +. 86400.0 *. 7.0); (* 7 days after delivery *)
        signature = None;
      };
    ] in

    EscrowOps.create_escrow
      ~payer:buyer
      ~payee:seller
      ~amount
      ~release_conditions:conditions
      ~timeout_action:(ReleaseFunds) (* Release to seller after timeout *)
      ~timeout_seconds:(30 * 86400) (* 30 days *)
      ~additional_parties:[]
      ~protection_enabled:true

  (** Real estate escrow *)
  let create_real_estate_escrow
      ~(buyer: string)
      ~(seller: string)
      ~(amount: usd_cents)
      ~(title_company: string)
      ~(inspector: string)
      ~(signers: string list)
    : escrow_contract =

    let conditions = [
      (* Title company approval *)
      ManualApproval {
        approver = title_company;
        approved = false;
        approval_deadline = Some (Unix.time () +. 86400.0 *. 60.0); (* 60 days *)
        signature = None;
      };

      (* Inspector approval *)
      ManualApproval {
        approver = inspector;
        approved = false;
        approval_deadline = Some (Unix.time () +. 86400.0 *. 45.0); (* 45 days *)
        signature = None;
      };

      (* Multisig from all parties *)
      MultisigApproval {
        required_signatures = List.length signers;
        signers;
        signatures_received = [];
      };
    ] in

    EscrowOps.create_escrow
      ~payer:buyer
      ~payee:seller
      ~amount
      ~release_conditions:conditions
      ~timeout_action:(RefundPayer)
      ~timeout_seconds:(90 * 86400) (* 90 days *)
      ~additional_parties:[]
      ~protection_enabled:true

  (** Startup milestone funding *)
  let create_milestone_funding_escrow
      ~(investor: string)
      ~(startup: string)
      ~(total_amount: usd_cents)
      ~(milestones: (string * float) list) (* (oracle_url, percentage) *)
    : escrow_contract list =

    List.map (fun (oracle_url, percentage) ->
      let milestone_amount =
        Int64.of_float (Int64.to_float total_amount *. percentage /. 100.0)
      in

      let conditions = [
        OracleVerification {
          oracle_endpoint = oracle_url;
          expected_value = "MILESTONE_COMPLETE";
          verified = false;
          last_check = None;
        };
      ] in

      EscrowOps.create_escrow
        ~payer:investor
        ~payee:startup
        ~amount:milestone_amount
        ~release_conditions:conditions
        ~timeout_action:(ExtendTimeout (30 * 86400)) (* Extend 30 days on timeout *)
        ~timeout_seconds:(90 * 86400)
        ~additional_parties:[]
        ~protection_enabled:false
    ) milestones

end

(** Escrow analytics *)
module EscrowAnalytics = struct

  type escrow_stats = {
    total_escrows: int;
    active_escrows: int;
    total_value_locked: usd_cents;
    escrows_by_type: (escrow_type * int) list;
    average_escrow_duration: float;
    release_rate: float; (* Percentage of escrows released vs cancelled *)
  }

  (** Calculate escrow statistics *)
  let calculate_stats (escrows: escrow_contract list) : escrow_stats =
    let active = List.filter (fun e -> e.status = EscrowActive) escrows in

    let total_locked =
      List.fold_left (fun acc e ->
        if e.status = EscrowActive then Int64.add acc e.amount else acc
      ) 0L escrows
    in

    let released_count =
      List.filter (fun e -> e.status = Released) escrows |> List.length
    in

    let cancelled_count =
      List.filter (fun e -> e.status = Cancelled) escrows |> List.length
    in

    let release_rate =
      if released_count + cancelled_count = 0 then 0.0
      else
        float_of_int released_count /.
        float_of_int (released_count + cancelled_count) *.
        100.0
    in

    {
      total_escrows = List.length escrows;
      active_escrows = List.length active;
      total_value_locked = total_locked;
      escrows_by_type = []; (* Would need escrow_type field in escrow_contract *)
      average_escrow_duration = 0.0; (* Calculate from created_at and released_at *)
      release_rate;
    }

end
