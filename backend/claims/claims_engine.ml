open Core
open Lwt.Infix
open Types
open Db

(* ... (claims_config, trigger_state, check_trigger, etc. remain the same pure logic) ... *)

let monitoring_loop
    ~(db_pool: Db.db_pool)
    ~(collateral_manager: Collateral_manager.t)
    ~(get_oracle_prices: unit -> (asset * float) list Lwt.t)
    ~(config: claims_config)
  : unit Lwt.t =

  let rec loop mgr () =
    Lwt.catch
      (fun () ->
        let* prices = get_oracle_prices () in
        let* db_trigger_states_res = ClaimsDb.get_all_trigger_states db_pool () in
        
        let db_trigger_states = 
            match db_trigger_states_res with
            | Ok states -> states
            | Error e -> 
                Logs.err (fun m -> m "[Claims Engine] DB Error fetching trigger states: %s" (Caqti_error.show e));
                []
        in

        let trigger_states_ht = Int64.Table.of_list_map db_trigger_states ~f:(fun r -> (r.policy_id, r)) in

        let (mgr_after_monitor, checks) = monitor_policies
          mgr
          ~oracle_prices:prices
          ~trigger_states:(Hashtbl.to_alist trigger_states_ht)
          ~config
        in

        (* Persist updated trigger states *)
        let%lwt () = Lwt_list.iter_s (fun check -> 
            let new_state = {
                Db.ClaimsDb.policy_id = check.policy_id;
                first_below_timestamp = check.first_below_time;
                samples_below = check.samples_below;
                last_check_timestamp = Unix.time ();
            } in
            let%lwt res = ClaimsDb.upsert_trigger_state db_pool new_state in
            (match res with
            | Ok () -> Lwt.return_unit
            | Error e -> Logs_lwt.err (fun m -> m "[Claims Engine] DB Error upserting trigger state: %s" (Caqti_error.show e)))
        ) checks in

        let (final_mgr, payouts, errors) = execute_payouts
          mgr_after_monitor
          ~trigger_checks:checks
          ~oracle_prices:prices
        in

        List.iter payouts ~f:(fun payout ->
          Logs.info (fun m -> m "Payout executed: Policy %Ld, Amount: $%.2f"
            payout.policy_id
            (Math.cents_to_usd payout.payout_amount))
        );

        List.iter errors ~f:(fun err ->
          Logs.err (fun m -> m "Payout error: %s" (error_to_string err))
        );

        Lwt.return final_mgr
      )
      (fun exn ->
        Logs.err (fun m -> m "Claims monitoring error: %s" (Exn.to_string exn));
        Lwt.return mgr
      )
    >>= fun final_mgr ->

    Lwt_unix.sleep config.sample_interval_seconds >>= loop final_mgr
  in

  loop collateral_manager ()
