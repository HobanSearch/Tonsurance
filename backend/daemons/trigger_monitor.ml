(* Trigger Monitor Daemon - Automated Policy Monitoring

   Background daemon that:
   1. Fetches latest prices every 60 seconds
   2. Checks all active policies for trigger conditions
   3. Tracks 4-hour confirmation period for sustained depegs
   4. Executes payouts automatically when confirmed
   5. Updates database with policy status changes
   6. Sends notifications to beneficiaries

   Critical for trustless operation - policies payout automatically
   without human intervention.
*)

open Core
open Lwt.Syntax
open Types

module TriggerMonitor = struct

  (** Monitor configuration **)
  type monitor_config = {
    poll_interval_seconds: float;
    confirmation_period_seconds: float;
    batch_size: int;
    max_retries: int;
    notification_enabled: bool;
  } [@@deriving sexp]

  let default_config = {
    poll_interval_seconds = 60.0; (* Check every minute *)
    confirmation_period_seconds = 14400.0; (* 4 hours *)
    batch_size = 100; (* Process 100 policies per batch *)
    max_retries = 3;
    notification_enabled = true;
  }

  (** Policy trigger state **)
  type trigger_state = {
    policy_id: int64;
    asset: asset;
    coverage_amount: usd_cents;
    trigger_price: float;
    floor_price: float;
    beneficiary_address: string;
    first_trigger_time: float option;
    is_confirmed: bool;
  } [@@deriving sexp]

  (** Monitoring statistics **)
  type monitor_stats = {
    mutable total_checks: int64;
    mutable policies_monitored: int;
    mutable triggers_detected: int;
    mutable payouts_executed: int;
    mutable errors: int;
    mutable last_check_time: float;
    mutable uptime_seconds: float;
  }

  let create_stats () = {
    total_checks = 0L;
    policies_monitored = 0;
    triggers_detected = 0;
    payouts_executed = 0;
    errors = 0;
    last_check_time = Unix.time ();
    uptime_seconds = 0.0;
  }

  (** Dependencies **)
  type dependencies = {
    oracle_config: Oracle_aggregator.OracleAggregator.oracle_config;
    db_pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result;
    ton_config: Ton_client.TonClient.ton_config;
    policy_manager_address: string;
  }

  (** Fetch active policies from database **)
  let fetch_active_policies
      (deps: dependencies)
    : trigger_state list Lwt.t =

    let%lwt result =
      Database.Database.get_active_policies deps.db_pool
    in

    match result with
    | Ok policies ->
        let states = List.map policies ~f:(fun (policy_id, asset_str, (beneficiary, coverage, trigger)) ->
          let asset = match asset_str with
            | "USDC" -> USDC
            | "USDT" -> USDT
            | "DAI" -> DAI
            | "FRAX" -> FRAX
            | "BUSD" -> BUSD
            | _ -> USDC
          in

          {
            policy_id;
            asset;
            coverage_amount = coverage;
            trigger_price = trigger;
            floor_price = trigger *. 0.90; (* Assume 10% below trigger *)
            beneficiary_address = beneficiary;
            first_trigger_time = None;
            is_confirmed = false;
          }
        ) in

        Lwt.return states

    | Error _ ->
        Lwt_io.eprintlf "Error fetching policies from database" >>= fun () ->
        Lwt.return []

  (** Get current consensus price for asset **)
  let get_current_price
      (deps: dependencies)
      ~(asset: asset)
      ~(previous_price: float option)
    : float option Lwt.t =

    let%lwt consensus_opt =
      Oracle_aggregator.OracleAggregator.get_consensus_price
        ~config:deps.oracle_config
        asset
        ~previous_price
    in

    match consensus_opt with
    | Some consensus ->
        (* Store price in database *)
        let%lwt _ =
          Database.Database.insert_price deps.db_pool
            ~asset:(Types.asset_to_string asset)
            ~price:consensus.price
            ~source:"oracle_consensus"
            ~timestamp:(Unix.time ())
        in

        Lwt.return (Some consensus.price)

    | None ->
        Lwt_io.eprintlf "Failed to get consensus price for %s"
          (Types.asset_to_string asset) >>= fun () ->
        Lwt.return None

  (** Check if trigger condition is met **)
  let check_trigger_condition
      (state: trigger_state)
      ~(current_price: float)
    : bool =

    current_price < state.trigger_price

  (** Check if trigger is confirmed (sustained for duration) **)
  let check_trigger_confirmation
      (deps: dependencies)
      ~(state: trigger_state)
      ~(confirmation_period: float)
    : bool Lwt.t =

    let%lwt result =
      Database.Database.check_sustained_depeg deps.db_pool
        ~asset:(Types.asset_to_string state.asset)
        ~trigger_price:state.trigger_price
        ~duration_seconds:confirmation_period
    in

    match result with
    | Ok is_sustained -> Lwt.return is_sustained
    | Error _ -> Lwt.return false

  (** Calculate payout amount **)
  let calculate_payout
      (state: trigger_state)
      ~(current_price: float)
    : usd_cents =

    if current_price >= state.trigger_price then
      0L
    else if current_price <= state.floor_price then
      state.coverage_amount
    else
      (* Linear interpolation *)
      let payout_ratio =
        (state.trigger_price -. current_price) /.
        (state.trigger_price -. state.floor_price)
      in

      let payout_float =
        Math.cents_to_usd state.coverage_amount *. payout_ratio
      in

      Math.usd_to_cents payout_float

  (** Execute payout on blockchain **)
  let execute_payout
      (deps: dependencies)
      ~(state: trigger_state)
      ~(current_price: float)
    : bool Lwt.t =

    let payout_amount = calculate_payout state ~current_price in

    if payout_amount <= 0L then
      Lwt.return false
    else
      (* Call smart contract to execute payout *)
      let%lwt tx_hash_opt =
        Ton_client.TonClient.PolicyManager.execute_payout
          deps.ton_config
          ~contract_address:deps.policy_manager_address
          ~policy_id:state.policy_id
          ~current_price:(Float.to_int (current_price *. 10000.0))
      in

      match tx_hash_opt with
      | Some tx_hash ->
          Lwt_io.printlf "Payout executed for policy %Ld: tx=%s, amount=$%s"
            state.policy_id
            tx_hash
            (Int64.to_string_hum ~delimiter:',' payout_amount) >>= fun () ->

          (* Update database *)
          let%lwt _ =
            Database.Database.PolicyQueries.update_policy_status
              |> fun query ->
                Database.Database.with_connection deps.db_pool (fun db ->
                  (module struct
                    include (val db : Database.Database.CONNECTION)
                  end).exec query ("paid", state.policy_id)
                )
          in

          (* Wait for confirmation *)
          let%lwt confirmed =
            Ton_client.TonClient.wait_for_transaction
              deps.ton_config
              ~tx_hash
              ~max_wait_seconds:60
          in

          Lwt.return confirmed

      | None ->
          Lwt_io.eprintlf "Failed to execute payout for policy %Ld"
            state.policy_id >>= fun () ->
          Lwt.return false

  (** Send notification to beneficiary **)
  let send_notification
      (state: trigger_state)
      ~(event: string)
      ~(details: string)
    : unit Lwt.t =

    (* In production, this would send Telegram/email notification *)
    Lwt_io.printlf "[NOTIFICATION] Policy %Ld - %s: %s"
      state.policy_id
      event
      details

  (** Process single policy **)
  let process_policy
      (deps: dependencies)
      ~(config: monitor_config)
      ~(state: trigger_state)
      ~(current_price: float)
      ~(stats: monitor_stats)
    : unit Lwt.t =

    let is_triggered = check_trigger_condition state ~current_price in

    if is_triggered then begin
      stats.triggers_detected <- stats.triggers_detected + 1;

      (* Check if sustained for confirmation period *)
      let%lwt is_confirmed =
        check_trigger_confirmation deps
          ~state
          ~confirmation_period:config.confirmation_period_seconds
      in

      if is_confirmed then begin
        Lwt_io.printlf "Trigger CONFIRMED for policy %Ld (price: $%.4f < trigger: $%.4f)"
          state.policy_id
          current_price
          state.trigger_price >>= fun () ->

        (* Execute payout *)
        let%lwt success =
          execute_payout deps ~state ~current_price
        in

        if success then begin
          stats.payouts_executed <- stats.payouts_executed + 1;

          (* Notify beneficiary *)
          let payout_amount = calculate_payout state ~current_price in
          let%lwt () = send_notification state
            ~event:"Payout Executed"
            ~details:(Printf.sprintf "$%s sent to %s"
              (Int64.to_string_hum ~delimiter:',' payout_amount)
              state.beneficiary_address)
          in

          Lwt.return ()
        end else begin
          stats.errors <- stats.errors + 1;
          Lwt.return ()
        end
      end else begin
        Lwt_io.printlf "Trigger detected for policy %Ld but not yet confirmed (waiting for %d seconds)"
          state.policy_id
          (Float.to_int config.confirmation_period_seconds) >>= fun () ->

        (* Notify about trigger *)
        let%lwt () = send_notification state
          ~event:"Depeg Detected"
          ~details:(Printf.sprintf "Price: $%.4f (trigger: $%.4f) - monitoring for confirmation"
            current_price state.trigger_price)
        in

        Lwt.return ()
      end
    end else
      Lwt.return ()

  (** Main monitoring loop iteration **)
  let monitor_iteration
      (deps: dependencies)
      ~(config: monitor_config)
      ~(stats: monitor_stats)
    : unit Lwt.t =

    let start_time = Unix.time () in

    Lwt_io.printlf "\n[%s] Starting monitor iteration..."
      (Time.to_string (Time.now ())) >>= fun () ->

    (* Fetch active policies *)
    let%lwt policies = fetch_active_policies deps in

    stats.policies_monitored <- List.length policies;
    Lwt_io.printlf "Monitoring %d active policies" (List.length policies) >>= fun () ->

    (* Group policies by asset *)
    let policies_by_asset =
      List.fold policies ~init:(Map.empty (module Types.Asset_comparator)) ~f:(fun acc policy ->
        Map.add_multi acc ~key:policy.asset ~data:policy
      )
    in

    (* Process each asset *)
    let%lwt () =
      Lwt_list.iter_s
        (fun (asset, asset_policies) ->
          (* Get current price for asset *)
          let%lwt price_opt = get_current_price deps ~asset ~previous_price:None in

          match price_opt with
          | Some current_price ->
              Lwt_io.printlf "Asset %s: current price = $%.4f"
                (Types.asset_to_string asset)
                current_price >>= fun () ->

              (* Process all policies for this asset *)
              Lwt_list.iter_p
                (fun policy_state ->
                  process_policy deps ~config ~state:policy_state ~current_price ~stats
                )
                asset_policies

          | None ->
              Lwt_io.eprintlf "Failed to get price for %s - skipping"
                (Types.asset_to_string asset)
        )
        (Map.to_alist policies_by_asset)
    in

    stats.total_checks <- Int64.succ stats.total_checks;
    stats.last_check_time <- Unix.time ();

    let elapsed = Unix.time () -. start_time in
    Lwt_io.printlf "Iteration completed in %.2f seconds" elapsed >>= fun () ->

    (* Print stats *)
    Lwt_io.printlf "\n=== Monitor Statistics ===" >>= fun () ->
    Lwt_io.printlf "Total checks: %Ld" stats.total_checks >>= fun () ->
    Lwt_io.printlf "Policies monitored: %d" stats.policies_monitored >>= fun () ->
    Lwt_io.printlf "Triggers detected: %d" stats.triggers_detected >>= fun () ->
    Lwt_io.printlf "Payouts executed: %d" stats.payouts_executed >>= fun () ->
    Lwt_io.printlf "Errors: %d" stats.errors >>= fun () ->
    Lwt_io.printlf "========================\n"

  (** Main monitoring loop **)
  let rec monitor_loop
      (deps: dependencies)
      ~(config: monitor_config)
      ~(stats: monitor_stats)
    : unit Lwt.t =

    (* Run iteration *)
    let%lwt () =
      try%lwt
        monitor_iteration deps ~config ~stats
      with
      | exn ->
          Lwt_io.eprintlf "ERROR in monitor iteration: %s" (Exn.to_string exn) >>= fun () ->
          stats.errors <- stats.errors + 1;
          Lwt.return ()
    in

    (* Wait for next interval *)
    let%lwt () = Lwt_unix.sleep config.poll_interval_seconds in

    (* Update uptime *)
    stats.uptime_seconds <- stats.uptime_seconds +. config.poll_interval_seconds;

    (* Continue loop *)
    monitor_loop deps ~config ~stats

  (** Start the monitor daemon **)
  let start
      ?(config = default_config)
      (deps: dependencies)
    : unit Lwt.t =

    let stats = create_stats () in

    Lwt_io.printlf "\n╔════════════════════════════════════════╗" >>= fun () ->
    Lwt_io.printlf "║  Tonsurance Trigger Monitor Daemon    ║" >>= fun () ->
    Lwt_io.printlf "╚════════════════════════════════════════╝\n" >>= fun () ->

    Lwt_io.printlf "Configuration:" >>= fun () ->
    Lwt_io.printlf "  Poll interval: %.0f seconds" config.poll_interval_seconds >>= fun () ->
    Lwt_io.printlf "  Confirmation period: %.0f seconds" config.confirmation_period_seconds >>= fun () ->
    Lwt_io.printlf "  Batch size: %d policies" config.batch_size >>= fun () ->
    Lwt_io.printlf "" >>= fun () ->

    Lwt_io.printlf "Starting monitor loop...\n" >>= fun () ->

    (* Start monitoring *)
    monitor_loop deps ~config ~stats

end

(** Entry point for standalone daemon **)
let main () =
  let open Lwt.Syntax in

  (* Load configuration *)
  let oracle_config = Oracle_aggregator.OracleAggregator.default_config in
  let ton_config = Ton_client.TonClient.default_config in
  let db_config = Database.Database.default_config in

  (* Create database pool *)
  let db_pool = Database.Database.create_pool db_config in

  (* Create dependencies *)
  let deps = {
    TriggerMonitor.oracle_config;
    db_pool;
    ton_config;
    policy_manager_address = "EQC_policy_manager_address_here"; (* Replace with actual *)
  } in

  (* Start monitor *)
  TriggerMonitor.start deps

let () =
  Lwt_main.run (main ())
