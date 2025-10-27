open Types
open Db

(* ... (DisputeConfig, DisputeState, etc. remain pure logic) ... *)

module DisputeEngine = struct
  type t = {
    db_pool: Connection_pool.ConnectionPool.t;
    arbiter_registry: Arbiter_registry.ArbiterRegistry.t;
  }

  let create ~db_pool ~arbiter_registry = { db_pool; arbiter_registry }

  let initiate_dispute t ~(escrow: escrow_contract) ~initiated_by ~reason =
    let open Lwt_result.Infix in
    if escrow.status <> EscrowActive then
      Lwt.return_error (`Msg "Can only dispute active escrows")
    else
      let dispute = {
        dispute_id = 0L; (* DB will assign *)
        escrow_id = escrow.escrow_id;
        initiated_by;
        reason;
        evidence = [];
        assigned_arbiter = None;
        status = EvidenceCollection;
        resolution = None;
        resolution_reasoning = None;
        created_at = Unix.time ();
        resolved_at = None;
        appeal_deadline = None;
      } in
      Escrow_db.EscrowDb.insert_dispute ~db_pool:t.db_pool ~dispute
      >>= fun new_id -> Escrow_db.EscrowDb.get_dispute ~db_pool:t.db_pool ~dispute_id:new_id
      >>= fun dispute_opt -> 
        match dispute_opt with
        | Some d -> Lwt.return_ok d
        | None -> Lwt.return_error (`Msg "Failed to fetch dispute after creation")

  let submit_evidence t ~dispute_id ~submitted_by ~evidence_type ~content_hash ~ipfs_cid ~description ~metadata =
      let open Lwt_result.Infix in
      Escrow_db.EscrowDb.get_dispute ~db_pool:t.db_pool ~dispute_id
      >>= fun dispute_opt ->
        match dispute_opt with
        | None -> Lwt.return_error (`Msg "Dispute not found")
        | Some dispute ->
            if dispute.status <> EvidenceCollection then Lwt.return_error (`Msg "Evidence can only be submitted during evidence collection phase")
            else 
              Escrow_db.EscrowDb.insert_evidence ~db_pool:t.db_pool ~dispute_id ~submitted_by ~evidence_type ~content_hash ~ipfs_cid ~description ~metadata

  let resolve_dispute t ~dispute_id ~arbiter_address ~outcome ~reasoning =
    let open Lwt_result.Infix in
    Escrow_db.EscrowDb.get_dispute ~db_pool:t.db_pool ~dispute_id
    >>= fun dispute_opt ->
      match dispute_opt with
      | None -> Lwt.return_error (`Msg "Dispute not found")
      | Some dispute ->
          if dispute.status <> UnderReview then Lwt.return_error (`Msg "Dispute not under review")
          else if dispute.assigned_arbiter <> Some arbiter_address then Lwt.return_error (`Msg "Resolver is not the assigned arbiter")
          else
            (* Save resolution outcome and reasoning to database *)
            let resolved_at = Unix.time () in
            Escrow_db.EscrowDb.resolve_dispute
              ~db_pool:t.db_pool
              ~dispute_id
              ~outcome
              ~reasoning
              ~resolved_at
            >>= fun () ->
              (* Fetch the escrow to determine fund movement *)
              Escrow_db.EscrowDb.get_escrow ~db_pool:t.db_pool ~escrow_id:dispute.escrow_id
              >>= fun escrow_opt ->
                match escrow_opt with
                | None -> Lwt.return_error (`Msg "Associated escrow not found")
                | Some escrow ->
                    (* Trigger fund movement based on dispute outcome *)
                    let%lwt () = match outcome with
                    | FullRelease ->
                        (* Release funds to payee (buyer) - 100% to payee *)
                        let%lwt () = Logs_lwt.info (fun m ->
                          m "[Dispute Resolution] Releasing escrow %Ld to buyer (payee: %s) per arbiter decision"
                            escrow.escrow_id escrow.payee
                        ) in
                        (* Update escrow status to Released *)
                        let%lwt status_result = Escrow_db.EscrowDb.update_status
                          ~db_pool:t.db_pool
                          ~escrow_id:escrow.escrow_id
                          ~new_status:Released
                        in
                        (match status_result with
                        | Ok () -> Lwt.return_unit
                        | Error e ->
                            let%lwt () = Logs_lwt.err (fun m ->
                              m "[Dispute Resolution] Failed to update escrow status: %s"
                                (Caqti_error.show e)
                            ) in
                            Lwt.return_unit)

                    | FullRefund ->
                        (* Refund funds to payer (seller) - 100% to payer *)
                        let%lwt () = Logs_lwt.info (fun m ->
                          m "[Dispute Resolution] Refunding escrow %Ld to seller (payer: %s) per arbiter decision"
                            escrow.escrow_id escrow.payer
                        ) in
                        (* Update escrow status to Cancelled *)
                        let%lwt status_result = Escrow_db.EscrowDb.update_status
                          ~db_pool:t.db_pool
                          ~escrow_id:escrow.escrow_id
                          ~new_status:Cancelled
                        in
                        (match status_result with
                        | Ok () -> Lwt.return_unit
                        | Error e ->
                            let%lwt () = Logs_lwt.err (fun m ->
                              m "[Dispute Resolution] Failed to update escrow status: %s"
                                (Caqti_error.show e)
                            ) in
                            Lwt.return_unit)

                    | PartialSplit { payee_pct; payer_pct } ->
                        (* Split funds between parties *)
                        let buyer_amount = Int64.(of_float (to_float escrow.amount *. payee_pct)) in
                        let seller_amount = Int64.(of_float (to_float escrow.amount *. payer_pct)) in
                        let%lwt () = Logs_lwt.info (fun m ->
                          m "[Dispute Resolution] Splitting escrow %Ld: %.0f%% to buyer (%s: $%.2f), %.0f%% to seller (%s: $%.2f)"
                            escrow.escrow_id
                            (payee_pct *. 100.0) escrow.payee (Int64.to_float buyer_amount /. 100.0)
                            (payer_pct *. 100.0) escrow.payer (Int64.to_float seller_amount /. 100.0)
                        ) in
                        (* Update escrow status to Disputed (partial resolution) *)
                        let%lwt status_result = Escrow_db.EscrowDb.update_status
                          ~db_pool:t.db_pool
                          ~escrow_id:escrow.escrow_id
                          ~new_status:Disputed
                        in
                        (match status_result with
                        | Ok () -> Lwt.return_unit
                        | Error e ->
                            let%lwt () = Logs_lwt.err (fun m ->
                              m "[Dispute Resolution] Failed to update escrow status: %s"
                                (Caqti_error.show e)
                            ) in
                            Lwt.return_unit)

                    | ExtendedDeadline { extension_days } ->
                        (* Extend deadline - log but don't change status *)
                        let%lwt () = Logs_lwt.info (fun m ->
                          m "[Dispute Resolution] Extending escrow %Ld deadline by %d days"
                            escrow.escrow_id extension_days
                        ) in
                        Lwt.return_unit

                    | RequireArbitration ->
                        (* Escalate to multi-arbiter panel - keep in Disputed status *)
                        let%lwt () = Logs_lwt.info (fun m ->
                          m "[Dispute Resolution] Escalating escrow %Ld to multi-arbiter panel"
                            escrow.escrow_id
                        ) in
                        Lwt.return_unit
                    in

                    (* Fetch and return the updated dispute *)
                    Escrow_db.EscrowDb.get_dispute ~db_pool:t.db_pool ~dispute_id
                    >>= fun updated_dispute_opt ->
                      match updated_dispute_opt with
                      | Some d -> Lwt.return_ok d
                      | None -> Lwt.return_error (`Msg "Failed to fetch updated dispute after resolution")
end

