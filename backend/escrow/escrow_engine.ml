open Core
open Types
open Db

module EscrowOps = struct
  let create_escrow
      ~(db_pool: Connection_pool.ConnectionPool.t)
      ~(payer: string)
      ~(payee: string)
      ~(amount: usd_cents)
      ~(asset: asset)
      ~(release_conditions: release_condition list)
      ~(timeout_action: timeout_action)
      ~(timeout_seconds: int)
    : (escrow_contract, [> Caqti_error.t]) Result.t Lwt.t =

    let now = Core.Time_float.now () |> Core.Time_float.to_span_since_epoch |> Core.Time_float.Span.to_sec in
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
      conditions_met = 0;
      created_at = now;
      funded_at = Some now;
      released_at = None;
      timeout_at = now +. float_of_int timeout_seconds;
      protection_enabled = false;
      protection_covers = PayerOnly;
      protection_policy_id = None;
    } in

    let%lwt result = Escrow_db.EscrowDb.insert_escrow ~db_pool ~escrow in
    match result with
    | Ok _ -> Lwt.return (Ok escrow)
    | Error e -> Lwt.return (Error e)

  let release_escrow
      ~(db_pool: Connection_pool.ConnectionPool.t)
      (escrow: escrow_contract)
    : (escrow_contract, [> Caqti_error.t]) Result.t Lwt.t =
    let updated_escrow = { escrow with status = Released; released_at = Some (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) } in
    let%lwt result = Escrow_db.EscrowDb.update_status ~db_pool ~escrow_id:escrow.escrow_id ~new_status:Released in
    match result with
    | Ok () -> Lwt.return (Ok updated_escrow)
    | Error e -> Lwt.return (Error e)

  let cancel_escrow
      ~(db_pool: Connection_pool.ConnectionPool.t)
      (escrow: escrow_contract)
    : (escrow_contract, [> Caqti_error.t]) Result.t Lwt.t =
    let updated_escrow = { escrow with status = Cancelled; released_at = Some (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) } in
    let%lwt result = Escrow_db.EscrowDb.update_status ~db_pool ~escrow_id:escrow.escrow_id ~new_status:Cancelled in
    match result with
    | Ok () -> Lwt.return (Ok updated_escrow)
    | Error e -> Lwt.return (Error e)
end

module EscrowMonitor = struct
  let start_monitoring_daemon
      ~(db_pool: Connection_pool.ConnectionPool.t)
      ?(check_interval = 60.0)
      ()
    : unit Lwt.t =

    (* Helper function to check if a single release condition is met *)
    let check_release_condition (condition: release_condition) : bool Lwt.t =
      match condition with
      | TimeElapsed { seconds; start_time } ->
          let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
          let elapsed = current_time -. start_time in
          Lwt.return Float.(elapsed >= of_int seconds)

      | ManualApproval { approved; _ } ->
          Lwt.return approved

      | OracleVerification { verified; oracle_endpoint = _; expected_value; _ } ->
          (* Check if already verified, otherwise fetch from oracle *)
          if verified then
            Lwt.return true
          else
            (* Fetch current price from oracle aggregator and compare with expected_value
               expected_value format: "asset:comparison:threshold"
               Example: "USDC:gte:0.99" means USDC price >= 0.99 *)
            (try%lwt
              let (asset_str, rest) = String.lsplit2_exn expected_value ~on:':' in
              let (comparison, threshold_str) = String.lsplit2_exn rest ~on:':' in
              begin
                  let%lwt asset = match asset_of_string asset_str with
                    | Ok a -> Lwt.return a
                    | Error _ -> Lwt.fail_with ("Invalid asset: " ^ asset_str)
                  in
                  let threshold = Float.of_string threshold_str in

                  (* Fetch consensus price from oracle aggregator *)
                  let%lwt price_opt = Oracle_aggregator.OracleAggregator.get_consensus_price
                    asset ~previous_price:None
                  in

                  match price_opt with
                  | Some consensus ->
                      (* Check if oracle data is stale or has anomalies *)
                      if consensus.is_stale || consensus.has_anomaly then
                        Lwt.return false
                      else
                        (* Compare price with threshold based on comparison operator *)
                        let result = match comparison with
                          | "gte" -> Float.O.(consensus.price >= threshold)
                          | "lte" -> Float.O.(consensus.price <= threshold)
                          | "eq" -> Float.O.(Float.abs (consensus.price - threshold) < 0.0001)
                          | "gt" -> Float.O.(consensus.price > threshold)
                          | "lt" -> Float.O.(consensus.price < threshold)
                          | _ -> false
                        in
                        Lwt.return result
                  | None ->
                      (* Oracle unavailable - fail safe by not releasing *)
                      Lwt.return false
              end
            with _ ->
              (* Any error - fail safe by not releasing *)
              Lwt.return false)

      | ChainEvent { occurred; chain; event_type; contract_address; _ } ->
          (* Check if event already occurred *)
          if occurred then
            Lwt.return true
          else
            (* Query blockchain for specific event
               For TON blockchain, we check if a specific transaction occurred *)
            (match chain with
            | TON ->
                (* Query TON blockchain for events at contract_address
                   event_type format: "transaction:<method_name>" or "balance_change:>:<amount>"
                   Example: "transaction:transfer" or "balance_change:>:1000000000" *)
                (try%lwt
                  let parts = String.split event_type ~on:':' in
                  match parts with
                  | ["transaction"; method_name] ->
                      (* Check if a transaction with specific method occurred at contract *)
                      let%lwt tx_occurred = Ton_client.TonClient.check_transaction_occurred
                        ~contract_address
                        ~method_name
                      in
                      Lwt.return tx_occurred
                  | ["balance_change"; comparison; threshold_str] ->
                      (* Check if contract balance meets threshold *)
                      let threshold = Int64.of_string threshold_str in
                      let%lwt balance_opt = Ton_client.TonClient.get_contract_balance
                        ~contract_address
                      in
                      (match balance_opt with
                      | Some balance ->
                          let result = match comparison with
                            | ">" -> Int64.(balance > threshold)
                            | ">=" -> Int64.(balance >= threshold)
                            | "<" -> Int64.(balance < threshold)
                            | "<=" -> Int64.(balance <= threshold)
                            | "=" -> Int64.(balance = threshold)
                            | _ -> false
                          in
                          Lwt.return result
                      | None -> Lwt.return false)
                  | _ ->
                      (* Invalid format - fail safe *)
                      Lwt.return false
                with _ ->
                  (* Any error - fail safe *)
                  Lwt.return false)
            | _ ->
                (* Other blockchains not yet supported - fail safe *)
                Lwt.return false)

      | MultisigApproval { required_signatures; signatures_received; _ } ->
          Lwt.return (List.length signatures_received >= required_signatures)
    in

    (* Check all release conditions for an escrow *)
    let check_all_conditions (escrow: escrow_contract) : bool Lwt.t =
      let%lwt results = Lwt_list.map_s check_release_condition escrow.release_conditions in
      Lwt.return (List.for_all results ~f:(fun x -> x))
    in

    let rec monitoring_loop () =
      let%lwt active_escrows_result = Escrow_db.EscrowDb.get_active_escrows ~db_pool in
      let%lwt () = match active_escrows_result with
      | Ok active_escrows ->
          let%lwt () = Logs_lwt.info (fun m ->
            m "[Escrow Monitor] Checking %d active escrows" (List.length active_escrows)
          ) in

          Lwt_list.iter_s (fun escrow ->
            let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

            (* Check for timeout *)
            if Float.(current_time >= escrow.timeout_at) then begin
              let%lwt () = Logs_lwt.info (fun m ->
                m "[Escrow Monitor] Escrow %Ld timed out, executing timeout action" escrow.escrow_id
              ) in

              (* Execute timeout action *)
              let%lwt result = match escrow.timeout_action with
              | ReleaseToPayee ->
                  let%lwt () = Logs_lwt.info (fun m ->
                    m "[Escrow Monitor] Releasing %Ld to payee %s (timeout)" escrow.escrow_id escrow.payee
                  ) in
                  Escrow_db.EscrowDb.update_status ~db_pool ~escrow_id:escrow.escrow_id ~new_status:Released

              | ReturnToPayer ->
                  let%lwt () = Logs_lwt.info (fun m ->
                    m "[Escrow Monitor] Refunding %Ld to payer %s (timeout)" escrow.escrow_id escrow.payer
                  ) in
                  Escrow_db.EscrowDb.update_status ~db_pool ~escrow_id:escrow.escrow_id ~new_status:Cancelled

              | Split percentage_to_payee ->
                  let payee_amount = Int64.(of_float (Float.of_int64 escrow.amount *. percentage_to_payee)) in
                  let payer_amount = Int64.(escrow.amount - payee_amount) in
                  let%lwt () = Logs_lwt.info (fun m ->
                    m "[Escrow Monitor] Splitting %Ld: %.0f%% to payee ($%.2f), %.0f%% to payer ($%.2f) (timeout)"
                      escrow.escrow_id
                      (percentage_to_payee *. 100.0) (Int64.to_float payee_amount /. 100.0)
                      ((1.0 -. percentage_to_payee) *. 100.0) (Int64.to_float payer_amount /. 100.0)
                  ) in
                  Escrow_db.EscrowDb.update_status ~db_pool ~escrow_id:escrow.escrow_id ~new_status:Disputed
              in

              match result with
              | Ok () -> Lwt.return_unit
              | Error e ->
                  Logs_lwt.err (fun m ->
                    m "[Escrow Monitor] Failed to execute timeout action for %Ld: %s"
                      escrow.escrow_id (Caqti_error.show e)
                  )
            end
            else begin
              (* Check release conditions *)
              let%lwt all_conditions_met = check_all_conditions escrow in

              if all_conditions_met then begin
                let%lwt () = Logs_lwt.info (fun m ->
                  m "[Escrow Monitor] All conditions met for escrow %Ld, releasing to payee %s"
                    escrow.escrow_id escrow.payee
                ) in

                let%lwt result = Escrow_db.EscrowDb.update_status
                  ~db_pool
                  ~escrow_id:escrow.escrow_id
                  ~new_status:Released
                in

                match result with
                | Ok () -> Lwt.return_unit
                | Error e ->
                    Logs_lwt.err (fun m ->
                      m "[Escrow Monitor] Failed to release escrow %Ld: %s"
                        escrow.escrow_id (Caqti_error.show e)
                    )
              end
              else
                Lwt.return_unit
            end
          ) active_escrows
      | Error e ->
          Logs_lwt.err (fun m -> m "[Escrow Monitor] Error fetching active escrows: %s" (Caqti_error.show e))
      in
      let%lwt () = Lwt_unix.sleep check_interval in
      monitoring_loop ()
    in
    monitoring_loop ()
end
