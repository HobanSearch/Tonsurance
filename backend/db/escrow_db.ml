open Lwt.Syntax
open Types
open Connection_pool.ConnectionPool

(** Database connection pool type *)
type db_pool = t

(** Caqti request definitions *)
module Q = struct
  open Caqti_request.Infix
  open Caqti_type

  let insert_escrow =
    (tup2 string (tup2 string (tup2 int64 (tup2 string (tup2 float (tup2 string (tup2 int (tup2 bool (tup2 string (tup2 (option int64) (tup2 string (tup2 (option float) (option float)))))))))))))
    ->. int64
    @@ "INSERT INTO escrows (payer, payee, amount, asset, created_at, timeout_action, timeout_seconds, protection_enabled, protection_covers, protection_policy_id, status, released_at, funded_at) VALUES (?, ?, ?, ?, to_timestamp(?), ?, ?, ?, ?, ?, ?, to_timestamp(?), to_timestamp(?)) RETURNING escrow_id"

  let insert_condition =
    (tup4 int64 int string string)
    ->. int64
    @@ "INSERT INTO escrow_conditions (escrow_id, condition_index, condition_type, condition_data) VALUES (?, ?, ?, ?::jsonb) RETURNING condition_id"

  let get_escrow_by_id =
    (int64 ->? (tup2 int64 (tup2 string (tup2 string (tup2 int64 (tup2 string (tup2 float (tup2 string (tup2 int (tup2 bool (tup2 string (tup2 (option int64) (tup2 string (tup2 (option float) (option float)))))))))))))))
    @@ "SELECT escrow_id, payer, payee, amount, asset, created_at, timeout_action, timeout_seconds, protection_enabled, protection_covers, protection_policy_id, status, released_at, funded_at FROM escrows WHERE escrow_id = ?"

  let get_conditions_by_escrow_id =
    (int64 ->* (tup2 string string))
    @@ "SELECT condition_type, condition_data FROM escrow_conditions WHERE escrow_id = ? ORDER BY condition_index ASC"

  let get_parties_by_escrow_id =
    (int64 ->* (tup2 string (option string)))
    @@ "SELECT party_address, party_name FROM escrow_parties WHERE escrow_id = ?"

  let get_escrows_by_user =
    (string ->* (tup2 int64 (tup2 string (tup2 string (tup2 int64 (tup2 string (tup2 float (tup2 string (tup2 int (tup2 bool (tup2 string (tup2 (option int64) (tup2 string (tup2 (option float) (option float)))))))))))))))
    @@ "SELECT escrow_id, payer, payee, amount, asset, created_at, timeout_action, timeout_seconds, protection_enabled, protection_covers, protection_policy_id, status, released_at, funded_at FROM escrows WHERE payer = ? OR payee = ?"

  let get_active_escrows =
    (unit ->* (tup2 int64 (tup2 string (tup2 string (tup2 int64 (tup2 string (tup2 float (tup2 string (tup2 int (tup2 bool (tup2 string (tup2 (option int64) (tup2 string (tup2 (option float) (option float)))))))))))))))
    @@ "SELECT escrow_id, payer, payee, amount, asset, created_at, timeout_action, timeout_seconds, protection_enabled, protection_covers, protection_policy_id, status, released_at, funded_at FROM escrows WHERE status = 'EscrowActive'"

  let update_escrow_status =
    (tup2 string int64)
    ->. unit
    @@ "UPDATE escrows SET status = ? WHERE escrow_id = ?"

  let update_condition_status =
    (tup2 bool int64)
    ->. unit
    @@ "UPDATE escrow_conditions SET condition_data = condition_data || jsonb_build_object('verified', ?) WHERE condition_id = ?"

  let update_contract_address =
    (tup2 string int64)
    ->. unit
    @@ "UPDATE escrows SET contract_address = ? WHERE escrow_id = ?"

  let insert_dispute =
    (tup2 (tup2 (tup2 int64 string) string) float)
    ->. int64
    @@ "INSERT INTO disputes (escrow_id, initiated_by, reason, created_at, status) VALUES (?, ?, ?, to_timestamp(?), 'EvidenceCollection') RETURNING dispute_id"

  let update_dispute_status =
    (tup2 string int64)
    ->. unit
    @@ "UPDATE disputes SET status = ? WHERE dispute_id = ?"

  let get_dispute_by_id =
    (int64 ->? (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 int64) string) string) (option string)) string) (option string)) (option string)) float) (option float)) (option float)))
    @@ "SELECT dispute_id, escrow_id, initiated_by, reason, assigned_arbiter, status, resolution, resolution_reasoning, created_at, resolved_at, appeal_deadline FROM disputes WHERE dispute_id = ?"

  let insert_dispute =
    (tup2 (tup2 (tup2 int64 string) string) float)
    ->. int64
    @@ "INSERT INTO disputes (escrow_id, initiated_by, reason, created_at, status) VALUES (?, ?, ?, to_timestamp(?), 'EvidenceCollection') RETURNING dispute_id"

  let update_dispute_status =
    (tup2 string int64)
    ->. unit
    @@ "UPDATE disputes SET status = ? WHERE dispute_id = ?"

  let get_dispute_by_id =
    (int64 ->? (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 int64) string) string) (option string)) string) (option string)) (option string)) float) (option float)) (option float)))
    @@ "SELECT dispute_id, escrow_id, initiated_by, reason, assigned_arbiter, status, resolution, resolution_reasoning, created_at, resolved_at, appeal_deadline FROM disputes WHERE dispute_id = ?"

  (* Evidence queries *)
  let insert_evidence =
    (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 string) string) string) (option string)) string) (option string))
    ->. int64
    @@ "INSERT INTO dispute_evidence (dispute_id, submitted_by, evidence_type, content_hash, ipfs_cid, description, metadata) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb) RETURNING evidence_id"

  let get_evidence_by_dispute =
    (int64 ->* (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 int64) string) string) string) (option string)) string) (option string)) float))
    @@ "SELECT evidence_id, dispute_id, submitted_by, evidence_type, content_hash, ipfs_cid, description, metadata, submitted_at FROM dispute_evidence WHERE dispute_id = ? ORDER BY submitted_at ASC"

  let get_evidence_by_id =
    (int64 ->? (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 int64) string) string) string) (option string)) string) (option string)) float) bool))
    @@ "SELECT evidence_id, dispute_id, submitted_by, evidence_type, content_hash, ipfs_cid, description, metadata, submitted_at, verified FROM dispute_evidence WHERE evidence_id = ?"

  let verify_evidence =
    (tup3 float string int64)
    ->. unit
    @@ "UPDATE dispute_evidence SET verified = TRUE, verified_at = to_timestamp(?), verified_by = ? WHERE evidence_id = ?"

  let count_evidence_by_dispute =
    (int64 ->! int64)
    @@ "SELECT COUNT(*) FROM dispute_evidence WHERE dispute_id = ?"

  (* Arbiter queries *)
  let register_arbiter =
    (tup2 (tup2 string int) (option string))
    ->. int64
    @@ "INSERT INTO arbiters (arbiter_address, reputation_score, specialization) VALUES (?, ?, ?) RETURNING arbiter_id"

  let get_arbiter_by_address =
    (string ->? (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 string) int) int) int) (option string)) bool))
    @@ "SELECT arbiter_id, arbiter_address, reputation_score, total_disputes_resolved, total_votes_cast, specialization, is_active FROM arbiters WHERE arbiter_address = ?"

  let get_arbiter_by_id =
    (int64 ->? (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 string) int) int) int) (option string)) bool))
    @@ "SELECT arbiter_id, arbiter_address, reputation_score, total_disputes_resolved, total_votes_cast, specialization, is_active FROM arbiters WHERE arbiter_id = ?"

  let get_active_arbiters =
    (unit ->* (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 string) int) int) int) (option string)) bool))
    @@ "SELECT arbiter_id, arbiter_address, reputation_score, total_disputes_resolved, total_votes_cast, specialization, is_active FROM arbiters WHERE is_active = TRUE ORDER BY reputation_score DESC"

  let update_arbiter_reputation =
    (tup2 int int64)
    ->. unit
    @@ "UPDATE arbiters SET reputation_score = ? WHERE arbiter_id = ?"

  let deactivate_arbiter =
    (int64 ->. unit)
    @@ "UPDATE arbiters SET is_active = FALSE WHERE arbiter_id = ?"

  let record_reputation_change =
    (tup2 (tup2 (tup2 (tup2 int64 (option int64)) int) int) string)
    ->. int64
    @@ "INSERT INTO arbiter_reputation_history (arbiter_id, dispute_id, reputation_change, new_reputation, reason) VALUES (?, ?, ?, ?, ?) RETURNING history_id"

  (* Arbiter votes queries *)
  let insert_vote =
    (tup2 (tup2 (tup2 (tup2 (tup2 int64 int64) string) string) (option int64)) (option string))
    ->. int64
    @@ "INSERT INTO arbiter_votes (dispute_id, arbiter_id, arbiter_address, vote_option, vote_amount, reasoning) VALUES (?, ?, ?, ?, ?, ?) RETURNING vote_id"

  let get_votes_by_dispute =
    (int64 ->* (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 int64) int64) string) string) (option int64)) (option string)))
    @@ "SELECT vote_id, dispute_id, arbiter_id, arbiter_address, vote_option, vote_amount, reasoning FROM arbiter_votes WHERE dispute_id = ? ORDER BY voted_at ASC"

  let get_vote_by_arbiter =
    (tup2 int64 int64)
    ->? (tup2 (tup2 (tup2 (tup2 (tup2 (tup2 int64 int64) int64) string) string) (option int64)) (option string))
    @@ "SELECT vote_id, dispute_id, arbiter_id, arbiter_address, vote_option, vote_amount, reasoning FROM arbiter_votes WHERE dispute_id = ? AND arbiter_id = ?"

  let count_votes_by_option =
    (tup2 int64 string)
    ->! int64
    @@ "SELECT COUNT(*) FROM arbiter_votes WHERE dispute_id = ? AND vote_option = ?"

  (* Timeline queries *)
  let insert_timeline_event =
    (tup2 (tup2 (tup2 int64 string) (option string)) (option string))
    ->. int64
    @@ "INSERT INTO dispute_timeline (dispute_id, event_type, actor_address, event_data) VALUES (?, ?, ?, ?::jsonb) RETURNING event_id"

  let get_timeline_events =
    (int64 ->* (tup2 (tup2 (tup2 (tup2 int64 int64) string) string) (option string)))
    @@ "SELECT event_id, dispute_id, event_type, actor_address, event_data FROM dispute_timeline WHERE dispute_id = ? ORDER BY event_at ASC"

end

(* Helper functions for data serialization/deserialization... *)

module EscrowDb = struct

  let with_transaction (db_pool: db_pool) (f: (module Caqti_lwt.CONNECTION) -> ('a, [> Caqti_error.t]) result Lwt.t) = 
    with_connection db_pool (fun (module Db) -> Db.transaction f)

  let insert_escrow
      ~(escrow: escrow_contract)
      ~(db_pool: db_pool)
    : (int64, [> Caqti_error.t]) result Lwt.t =
    with_transaction db_pool (fun (module Db) ->
      let%lwt escrow_id_result = Db.find Q.insert_escrow
        (escrow.payer, escrow.payee, escrow.amount, (asset_to_string escrow.asset), escrow.created_at, (timeout_action_to_string escrow.timeout_action), escrow.timeout_seconds, escrow.protection_enabled, (protection_coverage_to_string escrow.protection_covers), escrow.protection_policy_id, (escrow_status_to_string escrow.status), escrow.released_at, escrow.funded_at)
      in
      match escrow_id_result with
      | Error e -> Lwt.return (Error e)
      | Ok escrow_id ->
          let%lwt result = Lwt_list.iteri_s (fun i condition ->
            let (condition_type, condition_data) = serialize_condition condition in
            let%lwt res = Db.find Q.insert_condition (escrow_id, i, (condition_type, condition_data)) in
            match res with
            | Ok _ -> Lwt.return_unit
            | Error e -> Lwt.fail_with (Caqti_error.show e)
          ) escrow.release_conditions in
          Lwt.return (Ok escrow_id)
    )

  let get_escrow
      ~(escrow_id: int64)
      ~(db_pool: db_pool)
    : (escrow_contract option, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt escrow_row = Db.find_opt Q.get_escrow_by_id escrow_id in
      match escrow_row with
      | Ok (Some (id, payer, payee, amount, asset_str, created_at, timeout_action_str, timeout_seconds, protection_enabled, protection_covers_str, protection_policy_id, status_str, released_at, funded_at)) ->
          let%lwt conditions_rows = Db.collect_list Q.get_conditions_by_escrow_id escrow_id in
          (match conditions_rows with
           | Error e -> Lwt.return (Error e)
           | Ok conditions_data -> 
              let release_conditions = List.map (fun (t, d) -> deserialize_condition t d) conditions_data in
              let escrow = {
                  escrow_id = id;
                  payer;
                  payee;
                  amount;
                  asset = (asset_of_string asset_str |> Result.ok_or_failwith);
                  created_at;
                  release_conditions;
                  timeout_action = (timeout_action_of_string timeout_action_str None);
                  timeout_seconds;
                  additional_parties = [];
                  status = (escrow_status_of_string status_str);
                  conditions_met = 0;
                  released_at;
                  funded_at;
                  timeout_at = created_at +. (float_of_int timeout_seconds);
                  protection_enabled;
                  protection_covers = (protection_coverage_of_string protection_covers_str);
                  protection_policy_id;
              } in
              Lwt.return (Ok (Some escrow)))
      | Ok None -> Lwt.return (Ok None)
      | Error e -> Lwt.return (Error e)
    )

  let update_status
      ~(escrow_id: int64)
      ~(new_status: escrow_status)
      ~(db_pool: db_pool)
    : (unit, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.exec Q.update_escrow_status ((escrow_status_to_string new_status), escrow_id)
    )

  let insert_dispute
      ~(dispute: dispute)
      ~(db_pool: db_pool)
    : (int64, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.find Q.insert_dispute (dispute.escrow_id, dispute.initiated_by, (Yojson.Safe.to_string (yojson_of_dispute_reason dispute.reason)), dispute.created_at)
    )

  let update_dispute_status
      ~(dispute_id: int64)
      ~(new_status: dispute_status)
      ~(db_pool: db_pool)
    : (unit, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.exec Q.update_dispute_status ((dispute_status_to_string new_status), dispute_id)
    )

  let get_dispute
      ~(dispute_id: int64)
      ~(db_pool: db_pool)
    : (dispute option, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.find_opt Q.get_dispute_by_id dispute_id in
      match result with
      | Ok (Some (id, escrow_id, initiated_by, reason_str, assigned_arbiter, status_str, resolution_str, resolution_reasoning, created_at, resolved_at, appeal_deadline)) ->
          let%lwt evidence_result = Db.collect_list Q.get_evidence_by_dispute id in
          (match evidence_result with
           | Error e -> Lwt.return (Error e)
           | Ok evidence_rows ->
              let evidence_list = List.map (fun (eid, did, submitted_by, evidence_type, content_hash, ipfs_cid, description, metadata, submitted_at) ->
                {
                  evidence_id = eid;
                  dispute_id = did;
                  submitted_by;
                  evidence_type;
                  content_hash;
                  ipfs_cid;
                  description;
                  metadata = (Option.map Yojson.Safe.from_string metadata);
                  submitted_at;
                  verified = false;
                  verified_at = None;
                  verified_by = None;
                }
              ) evidence_rows in
              let dispute = {
                  dispute_id = id;
                  escrow_id;
                  initiated_by;
                  reason = (dispute_reason_of_yojson (Yojson.Safe.from_string reason_str) |> Result.ok_or_failwith);
                  evidence = evidence_list;
                  assigned_arbiter;
                  status = (dispute_status_of_string status_str |> Result.ok_or_failwith);
                  resolution = (Option.map (fun s -> resolution_outcome_of_yojson (Yojson.Safe.from_string s) |> Result.ok_or_failwith) resolution_str);
                  resolution_reasoning;
                  created_at;
                  resolved_at;
                  appeal_deadline;
              } in
              Lwt.return (Ok (Some dispute)))
      | Ok None -> Lwt.return (Ok None)
      | Error e -> Lwt.return (Error e)
    )

  (* Evidence functions *)
  let insert_evidence
      ~(dispute_id: int64)
      ~(submitted_by: string)
      ~(evidence_type: string)
      ~(content_hash: string)
      ~(ipfs_cid: string option)
      ~(description: string)
      ~(metadata: string option)
      ~(db_pool: db_pool)
    : (int64, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.find Q.insert_evidence (dispute_id, submitted_by, evidence_type, content_hash, ipfs_cid, description, metadata)
    )

  let get_evidence_by_dispute
      ~(dispute_id: int64)
      ~(db_pool: db_pool)
    : (evidence list, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.collect_list Q.get_evidence_by_dispute dispute_id in
      match result with
      | Ok rows ->
          let evidence_list = List.map (fun (eid, did, submitted_by, evidence_type, content_hash, ipfs_cid, description, metadata, submitted_at) ->
            {
              evidence_id = eid;
              dispute_id = did;
              submitted_by;
              evidence_type;
              content_hash;
              ipfs_cid;
              description;
              metadata = (Option.map Yojson.Safe.from_string metadata);
              submitted_at;
              verified = false;
              verified_at = None;
              verified_by = None;
            }
          ) rows in
          Lwt.return (Ok evidence_list)
      | Error e -> Lwt.return (Error e)
    )

  let get_evidence_by_id
      ~(evidence_id: int64)
      ~(db_pool: db_pool)
    : (evidence option, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.find_opt Q.get_evidence_by_id evidence_id in
      match result with
      | Ok (Some (eid, did, submitted_by, evidence_type, content_hash, ipfs_cid, description, metadata, submitted_at, verified)) ->
          let ev = {
              evidence_id = eid;
              dispute_id = did;
              submitted_by;
              evidence_type;
              content_hash;
              ipfs_cid;
              description;
              metadata = (Option.map Yojson.Safe.from_string metadata);
              submitted_at;
              verified;
              verified_at = None;
              verified_by = None;
          } in
          Lwt.return (Ok (Some ev))
      | Ok None -> Lwt.return (Ok None)
      | Error e -> Lwt.return (Error e)
    )

  let verify_evidence
      ~(evidence_id: int64)
      ~(verified_by: string)
      ~(db_pool: db_pool)
    : (unit, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let now = Unix.gettimeofday () in
      Db.exec Q.verify_evidence (now, verified_by, evidence_id)
    )

  let count_evidence
      ~(dispute_id: int64)
      ~(db_pool: db_pool)
    : (int64, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.find Q.count_evidence_by_dispute dispute_id
    )

  (* Arbiter functions *)
  let register_arbiter
      ~(arbiter_address: string)
      ~(reputation_score: int)
      ~(specialization: string option)
      ~(db_pool: db_pool)
    : (int64, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.find Q.register_arbiter (arbiter_address, reputation_score, specialization)
    )

  let get_arbiter_by_address
      ~(arbiter_address: string)
      ~(db_pool: db_pool)
    : (arbiter option, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.find_opt Q.get_arbiter_by_address arbiter_address in
      match result with
      | Ok (Some (aid, addr, rep, resolved, votes, spec, active)) ->
          let arb = {
              arbiter_id = aid;
              arbiter_address = addr;
              reputation_score = rep;
              total_disputes_resolved = resolved;
              total_votes_cast = votes;
              specialization = spec;
              is_active = active;
          } in
          Lwt.return (Ok (Some arb))
      | Ok None -> Lwt.return (Ok None)
      | Error e -> Lwt.return (Error e)
    )

  let get_arbiter_by_id
      ~(arbiter_id: int64)
      ~(db_pool: db_pool)
    : (arbiter option, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.find_opt Q.get_arbiter_by_id arbiter_id in
      match result with
      | Ok (Some (aid, addr, rep, resolved, votes, spec, active)) ->
          let arb = {
              arbiter_id = aid;
              arbiter_address = addr;
              reputation_score = rep;
              total_disputes_resolved = resolved;
              total_votes_cast = votes;
              specialization = spec;
              is_active = active;
          } in
          Lwt.return (Ok (Some arb))
      | Ok None -> Lwt.return (Ok None)
      | Error e -> Lwt.return (Error e)
    )

  let get_active_arbiters
      ~(db_pool: db_pool)
    : (arbiter list, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.collect_list Q.get_active_arbiters () in
      match result with
      | Ok rows ->
          let arbiters = List.map (fun (aid, addr, rep, resolved, votes, spec, active) ->
            {
              arbiter_id = aid;
              arbiter_address = addr;
              reputation_score = rep;
              total_disputes_resolved = resolved;
              total_votes_cast = votes;
              specialization = spec;
              is_active = active;
            }
          ) rows in
          Lwt.return (Ok arbiters)
      | Error e -> Lwt.return (Error e)
    )

  let update_arbiter_reputation
      ~(arbiter_id: int64)
      ~(new_reputation: int)
      ~(db_pool: db_pool)
    : (unit, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.exec Q.update_arbiter_reputation (new_reputation, arbiter_id)
    )

  let deactivate_arbiter
      ~(arbiter_id: int64)
      ~(db_pool: db_pool)
    : (unit, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.exec Q.deactivate_arbiter arbiter_id
    )

  let record_reputation_change
      ~(arbiter_id: int64)
      ~(dispute_id: int64 option)
      ~(reputation_change: int)
      ~(new_reputation: int)
      ~(reason: string)
      ~(db_pool: db_pool)
    : (int64, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.find Q.record_reputation_change (arbiter_id, dispute_id, reputation_change, new_reputation, reason)
    )

  (* Arbiter votes functions *)
  let insert_vote
      ~(dispute_id: int64)
      ~(arbiter_id: int64)
      ~(arbiter_address: string)
      ~(vote_option: string)
      ~(vote_amount: int64 option)
      ~(reasoning: string option)
      ~(db_pool: db_pool)
    : (int64, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.find Q.insert_vote (dispute_id, arbiter_id, arbiter_address, vote_option, vote_amount, reasoning)
    )

  let get_votes_by_dispute
      ~(dispute_id: int64)
      ~(db_pool: db_pool)
    : (arbiter_vote list, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.collect_list Q.get_votes_by_dispute dispute_id in
      match result with
      | Ok rows ->
          let votes = List.map (fun (vid, did, aid, addr, option, amount, reasoning) ->
            {
              vote_id = vid;
              dispute_id = did;
              arbiter_id = aid;
              arbiter_address = addr;
              vote_option = option;
              vote_amount = amount;
              reasoning;
            }
          ) rows in
          Lwt.return (Ok votes)
      | Error e -> Lwt.return (Error e)
    )

  let get_vote_by_arbiter
      ~(dispute_id: int64)
      ~(arbiter_id: int64)
      ~(db_pool: db_pool)
    : (arbiter_vote option, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.find_opt Q.get_vote_by_arbiter (dispute_id, arbiter_id) in
      match result with
      | Ok (Some (vid, did, aid, addr, option, amount, reasoning)) ->
          let vote = {
              vote_id = vid;
              dispute_id = did;
              arbiter_id = aid;
              arbiter_address = addr;
              vote_option = option;
              vote_amount = amount;
              reasoning;
          } in
          Lwt.return (Ok (Some vote))
      | Ok None -> Lwt.return (Ok None)
      | Error e -> Lwt.return (Error e)
    )

  let count_votes_by_option
      ~(dispute_id: int64)
      ~(vote_option: string)
      ~(db_pool: db_pool)
    : (int64, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.find Q.count_votes_by_option (dispute_id, vote_option)
    )

  (* Timeline functions *)
  let insert_timeline_event
      ~(dispute_id: int64)
      ~(event_type: string)
      ~(actor_address: string option)
      ~(event_data: string option)
      ~(db_pool: db_pool)
    : (int64, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.find Q.insert_timeline_event (dispute_id, event_type, actor_address, event_data)
    )

  let get_timeline_events
      ~(dispute_id: int64)
      ~(db_pool: db_pool)
    : (timeline_event list, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.collect_list Q.get_timeline_events dispute_id in
      match result with
      | Ok rows ->
          let events = List.map (fun (eid, did, event_type, actor, data) ->
            {
              event_id = eid;
              dispute_id = did;
              event_type;
              actor_address = actor;
              event_data = (Option.map Yojson.Safe.from_string data);
            }
          ) rows in
          Lwt.return (Ok events)
      | Error e -> Lwt.return (Error e)
    )

end
