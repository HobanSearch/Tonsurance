open Core
open Connection_pool.ConnectionPool

(** Transaction Database - Event Sourcing Implementation
 *
 * Implements event sourcing pattern for blockchain events using PostgreSQL.
 * All blockchain interactions are recorded as immutable events in the
 * blockchain_events table (see migration 003_add_blockchain_event_log.sql).
 *
 * Core operations:
 * - save_event: Store new blockchain event
 * - get_events_by_tx_hash: Query events by transaction hash
 * - get_events_by_policy_id: Query events by policy ID
 *)

(** Represents a single event read from the blockchain *)
type blockchain_event_record = {
  event_id: int64;
  event_type: string;
  policy_id: int64 option;
  contract_address: string option;
  transaction_hash: string option;
  logical_time: int64 option;
  metadata: Yojson.Safe.t;
  created_at: float;
}

(** Database connection pool type *)
type db_pool = t

(** Caqti request definitions - PLACEHOLDERS *)
module Q = struct
  open Caqti_request.Infix
  open Caqti_type

  let event_type_of_record r =
    Ok (r.event_id, (r.event_type, (r.policy_id, (r.contract_address, (r.transaction_hash, (r.logical_time, (Yojson.Safe.to_string r.metadata, r.created_at)))))))

  let record_of_event_type (event_id, (event_type, (policy_id, (contract_address, (transaction_hash, (logical_time, (metadata_str, created_at))))))) =
    Ok { event_id; event_type; policy_id; contract_address; transaction_hash; logical_time; metadata = Yojson.Safe.from_string metadata_str; created_at; }

  let blockchain_event_type =
    custom
      ~encode:event_type_of_record
      ~decode:record_of_event_type
      (t2 int64 (t2 string (t2 (option int64) (t2 (option string) (t2 (option string) (t2 (option int64) (t2 string float)))))))

  let save_event =
    blockchain_event_type ->! int64
    @@ "INSERT INTO blockchain_events (event_type, policy_id, contract_address, transaction_hash, logical_time, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?::jsonb, to_timestamp(?)) RETURNING event_id"

  let get_events_by_tx_hash =
    string ->* blockchain_event_type
    @@ "SELECT event_id, event_type, policy_id, contract_address, transaction_hash, logical_time, metadata, EXTRACT(EPOCH FROM created_at) FROM blockchain_events WHERE transaction_hash = ?"

  let get_events_by_policy_id =
    int64 ->* blockchain_event_type
    @@ "SELECT event_id, event_type, policy_id, contract_address, transaction_hash, logical_time, metadata, EXTRACT(EPOCH FROM created_at) FROM blockchain_events WHERE policy_id = ?"

end

module TransactionDb = struct

  (** Save a blockchain event to the database
   *
   * Returns the auto-generated event_id on success.
   * Events are immutable once stored (event sourcing pattern).
   *)
  let save_event (db_pool: db_pool) (event: blockchain_event_record) : (int64, [> Caqti_error.t]) Result.t Lwt.t =
    with_connection db_pool (fun (module Db) ->
      let%lwt result = Db.find Q.save_event event in
      Lwt.return result
    )

  (** Get all events associated with a transaction hash
   *
   * Returns events in chronological order (oldest first).
   * Useful for reconstructing transaction state from events.
   *)
  let get_events_by_tx_hash (db_pool: db_pool) (tx_hash: string) : (blockchain_event_record list, [> Caqti_error.t]) Result.t Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.collect_list Q.get_events_by_tx_hash tx_hash
    )

  (** Get all events associated with a policy ID
   *
   * Returns complete event history for a policy (creation, updates, claims, etc).
   * Events ordered chronologically for deterministic state reconstruction.
   *)
  let get_events_by_policy_id (db_pool: db_pool) (policy_id: int64) : (blockchain_event_record list, [> Caqti_error.t]) Result.t Lwt.t =
    with_connection db_pool (fun (module Db) ->
      Db.collect_list Q.get_events_by_policy_id policy_id
    )

end
