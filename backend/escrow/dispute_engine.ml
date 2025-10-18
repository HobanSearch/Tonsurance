open Lwt.Syntax
open Types
open Db

(* ... (DisputeConfig, DisputeState, etc. remain pure logic) ... *)

module DisputeEngine = struct
  type t = {
    db_pool: Db.db_pool;
    arbiter_registry: Arbiter_registry.ArbiterRegistry.t;
  }

  let create ~db_pool ~arbiter_registry = { db_pool; arbiter_registry }

  let initiate_dispute t ~escrow ~initiated_by ~reason =
    let open Lwt_result.Infix in
    if escrow.status <> EscrowActive then
      Lwt.return_error (Caqti_error.Msg "Can only dispute active escrows")
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
      EscrowDb.insert_dispute ~db_pool:t.db_pool ~dispute
      >>= fun new_id -> EscrowDb.get_dispute ~db_pool:t.db_pool ~dispute_id:new_id
      >>= fun dispute_opt -> 
        match dispute_opt with
        | Some d -> Lwt.return_ok d
        | None -> Lwt.return_error (Caqti_error.Msg "Failed to fetch dispute after creation")

  let submit_evidence t ~dispute_id ~submitted_by ~evidence_type ~content_hash ~ipfs_cid ~description ~metadata =
      let open Lwt_result.Infix in
      EscrowDb.get_dispute ~db_pool:t.db_pool ~dispute_id
      >>= fun dispute_opt ->
        match dispute_opt with
        | None -> Lwt.return_error (Caqti_error.Msg "Dispute not found")
        | Some dispute ->
            if dispute.status <> EvidenceCollection then Lwt.return_error (Caqti_error.Msg "Evidence can only be submitted during evidence collection phase")
            else 
              EscrowDb.insert_evidence ~db_pool:t.db_pool ~dispute_id ~submitted_by ~evidence_type ~content_hash ~ipfs_cid ~description ~metadata

  let resolve_dispute t ~dispute_id ~arbiter_address ~outcome ~reasoning =
    let open Lwt_result.Infix in
    EscrowDb.get_dispute ~db_pool:t.db_pool ~dispute_id
    >>= fun dispute_opt ->
      match dispute_opt with
      | None -> Lwt.return_error (Caqti_error.Msg "Dispute not found")
      | Some dispute ->
          if dispute.status <> UnderReview then Lwt.return_error (Caqti_error.Msg "Dispute not under review")
          else if dispute.assigned_arbiter <> Some arbiter_address then Lwt.return_error (Caqti_error.Msg "Resolver is not the assigned arbiter")
          else 
            EscrowDb.update_dispute_status ~db_pool:t.db_pool ~dispute_id ~new_status:Resolved
            (* In a real implementation, we would also save the outcome and reasoning *)
            >>= fun () -> EscrowDb.get_dispute ~db_pool:t.db_pool ~dispute_id
            >>= fun updated_dispute_opt ->
              match updated_dispute_opt with
              | Some d -> Lwt.return_ok d
              | None -> Lwt.return_error (Caqti_error.Msg "Failed to fetch updated dispute after resolution")
end

