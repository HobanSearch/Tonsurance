open Lwt.Syntax
open Types
open Db

module EscrowOps = struct
  let create_escrow
      ~(db_pool: Db.db_pool)
      ~(payer: string)
      ~(payee: string)
      ~(amount: usd_cents)
      ~(asset: asset)
      ~(release_conditions: release_condition list)
      ~(timeout_action: timeout_action)
      ~(timeout_seconds: int)
    : (escrow_contract, [> Caqti_error.t]) result Lwt.t =

    let now = Unix.time () in
    let escrow_id = Int64.of_float (now *. 1000.0) in
    let escrow = {
      escrow_id;
      payer;
      payee;
      amount;
      asset;
      release_conditions;
      timeout_action;
      timeout_seconds;
      additional_parties = [];
      status = EscrowActive;
      created_at = now;
      funded_at = Some now;
      released_at = None;
      timeout_at = now +. float_of_int timeout_seconds;
      protection_enabled = false;
      protection_covers = PayerOnly;
      protection_policy_id = None;
    } in

    let%lwt result = EscrowDb.insert_escrow ~db_pool ~escrow in
    match result with
    | Ok _ -> Lwt.return (Ok escrow)
    | Error e -> Lwt.return (Error e)

  let release_escrow
      ~(db_pool: Db.db_pool)
      (escrow: escrow_contract)
    : (escrow_contract, [> Caqti_error.t]) result Lwt.t =
    let updated_escrow = { escrow with status = Released; released_at = Some (Unix.time ()) } in
    let%lwt result = EscrowDb.update_status ~db_pool ~escrow_id:escrow.escrow_id ~new_status:Released in
    match result with
    | Ok () -> Lwt.return (Ok updated_escrow)
    | Error e -> Lwt.return (Error e)

  let cancel_escrow
      ~(db_pool: Db.db_pool)
      (escrow: escrow_contract)
    : (escrow_contract, [> Caqti_error.t]) result Lwt.t =
    let updated_escrow = { escrow with status = Cancelled; released_at = Some (Unix.time ()) } in
    let%lwt result = EscrowDb.update_status ~db_pool ~escrow_id:escrow.escrow_id ~new_status:Cancelled in
    match result with
    | Ok () -> Lwt.return (Ok updated_escrow)
    | Error e -> Lwt.return (Error e)
end

module EscrowMonitor = struct
  let start_monitoring_daemon
      ~(db_pool: Db.db_pool)
      ?(check_interval = 60.0)
      ()
    : unit Lwt.t =
    let rec monitoring_loop () =
      let%lwt active_escrows_result = EscrowDb.get_active_escrows ~db_pool in
      (match active_escrows_result with
      | Ok active_escrows ->
          Logs_lwt.info (fun m -> m "[Escrow Monitor] Checking %d active escrows" (List.length active_escrows)) >>=
          fun () ->
          Lwt_list.iter_s (fun escrow -> 
            (* In a real implementation, check conditions and update status *)
            if now() >= escrow.timeout_at then
                let%lwt _ = EscrowOps.cancel_escrow ~db_pool escrow in
                Logs_lwt.info (fun m -> m "[Escrow Monitor] Timed out escrow %Ld" escrow.escrow_id)
            else
                Lwt.return_unit
          ) active_escrows
      | Error e ->
          Logs_lwt.err (fun m -> m "[Escrow Monitor] Error fetching active escrows: %s" (Caqti_error.show e))
      ) >>= fun () ->
      Lwt_unix.sleep check_interval >>= monitoring_loop
    in
    monitoring_loop ()
end
