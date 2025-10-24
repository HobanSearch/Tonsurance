open Core
open Connection_pool.ConnectionPool

(** Trigger monitoring state as stored in the database *)
type trigger_state_record = {
  policy_id: int64;
  first_below_timestamp: float option;
  samples_below: int;
  last_check_timestamp: float;
}

type db_pool = t

module Q = struct
  open Caqti_request.Infix
  open Caqti_type

  let trigger_state_type =
    custom
      ~encode:(fun { policy_id; first_below_timestamp; samples_below; last_check_timestamp } ->
        Ok (policy_id, first_below_timestamp, samples_below, last_check_timestamp))
      ~decode:(fun (policy_id, first_below_timestamp, samples_below, last_check_timestamp) ->
        Ok { policy_id; first_below_timestamp; samples_below; last_check_timestamp; })
      (t4 int64 (option float) int float)

  let upsert_trigger_state =
    trigger_state_type ->. unit
    @@ {| 
        INSERT INTO claim_trigger_states (policy_id, first_below_timestamp, samples_below, last_check_timestamp)
        VALUES (?, to_timestamp(?), ?, to_timestamp(?))
        ON CONFLICT (policy_id) DO UPDATE SET
          first_below_timestamp = EXCLUDED.first_below_timestamp,
          samples_below = EXCLUDED.samples_below,
          last_check_timestamp = EXCLUDED.last_check_timestamp
      |}

  let get_all_trigger_states =
    unit ->* trigger_state_type
    @@ "SELECT policy_id, first_below_timestamp, samples_below, last_check_timestamp FROM claim_trigger_states"

end

module ClaimsDb = struct
  let upsert_trigger_state (db_pool: db_pool) (state: trigger_state_record) : (unit, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) -> Db.exec Q.upsert_trigger_state state)

  let get_all_trigger_states (db_pool: db_pool) () : (trigger_state_record list, [> Caqti_error.t]) result Lwt.t =
    with_connection db_pool (fun (module Db) -> Db.collect_list Q.get_all_trigger_states ())
end
