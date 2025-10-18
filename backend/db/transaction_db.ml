open Lwt.Syntax
open Core
open Types
open Connection_pool.ConnectionPool

(* ... type definitions ... *)

module Q = struct
  (* ... queries ... *)
end

let save_transaction (db_pool: db_pool) (tx: transaction_record) : (unit, [> Caqti_error.t]) result Lwt.t =
  with_connection db_pool (fun (module Db) -> Db.exec Q.save_transaction tx)

let get_transaction (db_pool: db_pool) (tx_hash: string) : (transaction_record option, [> Caqti_error.t]) result Lwt.t =
  with_connection db_pool (fun (module Db) -> Db.find_opt Q.get_transaction tx_hash)

let update_status (db_pool: db_pool) (tx_hash: string) ~(status: tx_status) ~(block_height: int64 option) ~(exit_code: int option) : (unit, [> Caqti_error.t]) result Lwt.t =
  let confirmed_at = if status = Confirmed || status = Failed then Some (Unix.gettimeofday ()) else None in
  with_connection db_pool (fun (module Db) -> 
    Db.exec Q.update_status ((tx_status_to_string status, block_height, exit_code, confirmed_at), tx_hash)
  )

let update_metadata (db_pool: db_pool) (tx_hash: string) (metadata: Yojson.Safe.t) : (unit, [> Caqti_error.t]) result Lwt.t =
  with_connection db_pool (fun (module Db) -> 
    Db.exec Q.update_metadata (Yojson.Safe.to_string metadata, tx_hash)
  )

let get_user_transactions (db_pool: db_pool) (user_address: string) : (transaction_record list, [> Caqti_error.t]) result Lwt.t =
  with_connection db_pool (fun (module Db) -> Db.collect_list Q.get_user_transactions user_address)

let get_pending_transactions (db_pool: db_pool) () : (transaction_record list, [> Caqti_error.t]) result Lwt.t =
  with_connection db_pool (fun (module Db) -> Db.collect_list Q.get_pending_transactions ())

(* ... parse_events_from_tx ... *)
