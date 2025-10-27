(** ETL Orchestrator Daemon
 *
 * Schedules and runs ETL jobs:
 * - Daily 2:00 AM UTC: Incremental depeg backfill, correlation updates, reports
 * - Weekly Sunday 3:00 AM UTC: Full backfill, data validation, cleanup
 *
 * Features:
 * - Job scheduling with cron-like syntax
 * - Health monitoring
 * - Retry logic for failed jobs
 * - Alert notifications
 *)

open Core
open Lwt.Syntax
open Lwt.Infix
open Types

module EtlOrchestrator = struct

  type job_status =
    | Pending
    | Running
    | Completed
    | Failed of string
  [@@deriving sexp, yojson]

  type etl_job = {
    job_id: string;
    job_name: string;
    schedule: string; (* Cron-like: "0 2 * * *" = daily 2am *)
    last_run: float option;
    next_run: float;
    status: job_status;
    run_count: int;
    failure_count: int;
  } [@@deriving sexp, yojson]

  type job_config = {
    max_retries: int;
    retry_delay_seconds: float;
    timeout_seconds: float;
    alert_on_failure: bool;
  }

  let default_config = {
    max_retries = 3;
    retry_delay_seconds = 300.0; (* 5 minutes *)
    timeout_seconds = 3600.0; (* 1 hour *)
    alert_on_failure = true;
  }

  (** Calculate next run time from cron schedule *)
  let calculate_next_run
      ~(current_time: float)
      ~(schedule: string)
    : float =

    (* Parse cron format: "minute hour day month weekday" *)
    let parts = String.split schedule ~on:' ' in

    match parts with
    | [minute_str; hour_str; _day; _month; weekday_str] ->
        (try
          (* Use Time_float for time operations - Core's recommended approach *)
          let current_time_ns = Time_float.of_span_since_epoch (Time_float.Span.of_sec current_time) in

          (* For now, use simple time arithmetic instead of Unix.localtime *)
          (* TODO: Implement proper cron-style scheduling with Time_float *)
          let target_hour = int_of_string hour_str in
          let target_minute = int_of_string minute_str in

          (* Calculate seconds since midnight today *)
          let target_seconds_today = float ((target_hour * 3600) + (target_minute * 60)) in

          (* Get seconds since midnight for current time *)
          let secs_since_epoch = Time_float.to_span_since_epoch current_time_ns |> Time_float.Span.to_sec in
          let secs_since_midnight = Float.mod_float secs_since_epoch 86400.0 in

          let days_to_add =
            if String.equal weekday_str "*" then
              (* Daily schedule *)
              if Float.(target_seconds_today > secs_since_midnight) then
                0.0  (* Today *)
              else
                1.0  (* Tomorrow *)
            else
              (* For specific weekday, default to next week *)
              7.0
          in

          let seconds_until_target =
            (days_to_add *. 86400.0) +. target_seconds_today -. secs_since_midnight
          in

          current_time +. seconds_until_target

        with _ ->
          (* Parsing failed - default to 1 hour *)
          current_time +. 3600.0)

    | _ ->
        (* Invalid cron format - default to 1 hour from now *)
        current_time +. 3600.0

  (** Run incremental depeg backfill *)
  let run_depeg_backfill
      ~(config: unit)  (* TODO: Fix depeg_event_ingestion module reference *)
      ~(pool: ((Caqti_lwt.connection, Caqti_error.t) Caqti_lwt_unix.Pool.t, Caqti_error.t) Result.t)
    : int Lwt.t =
    let _ = config in
    let _ = pool in

    Logs_lwt.info (fun m ->
      m "[ETL] Starting incremental depeg backfill"
    ) >>= fun () ->

    let stablecoins = [USDC; USDT; DAI; USDP; FRAX; BUSD] in

    (* TODO: Implement Depeg_event_ingestion.incremental_update *)
    let%lwt _results =
      Lwt_list.map_s (fun _asset ->
        (*Etl.Depeg_event_ingestion.incremental_update ~config ~pool ~asset*)
        Lwt.return 0
      ) stablecoins
    in

    let total = 0 (* List.fold results ~init:0 ~f:(+) *) in

    Logs_lwt.info (fun m ->
      m "[ETL] Depeg backfill complete: %d new events" total
    ) >>= fun () ->

    Lwt.return total

  (** Run correlation matrix update *)
  let run_correlation_update
      ~(pool: ((Caqti_lwt.connection, Caqti_error.t) Caqti_lwt_unix.Pool.t, Caqti_error.t) Result.t)
    : (int * int * int) Lwt.t =
    let _ = pool in

    Logs_lwt.info (fun m ->
      m "[ETL] Starting correlation matrix update"
    ) >>= fun () ->

    (* TODO: Implement CorrelationMatrixUpdater *)
    (* Etl.CorrelationMatrixUpdater.update_all_windows pool *)
    (* Return (matrices_updated, correlations_calculated, windows_analyzed) *)
    Lwt.return (0, 0, 0)

  (** Run risk report generation *)
  let run_risk_report
      ~(pool: ((Caqti_lwt.connection, Caqti_error.t) Caqti_lwt_unix.Pool.t, Caqti_error.t) Result.t)
      ~(vault: Pool.Collateral_manager.CollateralManager.unified_pool)
      ~(output_dir: string)
    : bool Lwt.t =

    Logs_lwt.info (fun m ->
      m "[ETL] Starting risk report generation"
    ) >>= fun () ->

    (* Convert unified_pool to risk report's vault_state *)
    let vault_state : Reporting.Risk_report_generator.RiskReportGenerator.vault_state = {
      total_capital_usd = vault.total_capital_usd;
      total_coverage_sold = vault.total_coverage_sold;
      active_policies = vault.active_policies;
    } in

    let%lwt report_result =
      Reporting.Risk_report_generator.RiskReportGenerator.generate_daily_report
        pool
        ~vault:vault_state
    in

    match report_result with
    | Error e ->
        Logs_lwt.err (fun m ->
          m "[ETL] Risk report failed: %s" (Caqti_error.show e)
        ) >>= fun () ->
        Lwt.return false

    | Ok report ->
        let date_str = report.report_date in
        let output_path =
          Filename.concat output_dir (Printf.sprintf "risk_report_%s.json" date_str)
        in

        let%lwt () =
          Reporting.Risk_report_generator.RiskReportGenerator.save_report_to_file
            ~report ~output_path
        in

        Logs_lwt.info (fun m ->
          m "[ETL] Risk report saved: %s" output_path
        ) >>= fun () ->

        Lwt.return true

  (** Define ETL jobs *)
  let create_daily_jobs ~(current_time: float) : etl_job list =
    [
      {
        job_id = "daily_depeg_backfill";
        job_name = "Incremental Depeg Backfill";
        schedule = "0 2 * * *";
        last_run = None;
        next_run = calculate_next_run ~current_time ~schedule:"0 2 * * *";
        status = Pending;
        run_count = 0;
        failure_count = 0;
      };
      {
        job_id = "daily_correlation_update";
        job_name = "Correlation Matrix Update";
        schedule = "0 2 * * *";
        last_run = None;
        next_run = calculate_next_run ~current_time ~schedule:"0 2 * * *" +. 600.0;
        status = Pending;
        run_count = 0;
        failure_count = 0;
      };
      {
        job_id = "daily_risk_report";
        job_name = "Daily Risk Report";
        schedule = "0 2 * * *";
        last_run = None;
        next_run = calculate_next_run ~current_time ~schedule:"0 2 * * *" +. 1200.0;
        status = Pending;
        run_count = 0;
        failure_count = 0;
      };
    ]

  (** Run ETL job with retry logic *)
  let run_job_with_retry
      ~(config: job_config)
      ~(job: etl_job)
      ~(job_fn: unit -> bool Lwt.t)
    : job_status Lwt.t =

    let rec attempt retry_count =
      Logs_lwt.info (fun m ->
        m "[ETL] Running job: %s (attempt %d/%d)"
          job.job_name (retry_count + 1) (config.max_retries + 1)
      ) >>= fun () ->

      (* Run with timeout *)
      let job_promise = job_fn () in
      let timeout_promise =
        let%lwt () = Lwt_unix.sleep config.timeout_seconds in
        Lwt.return false
      in

      let%lwt success = Lwt.pick [job_promise; timeout_promise] in

      if success then
        Lwt.return Completed
      else if retry_count < config.max_retries then
        begin
          Logs_lwt.warn (fun m ->
            m "[ETL] Job %s failed, retrying in %.0fs"
              job.job_name config.retry_delay_seconds
          ) >>= fun () ->

          let%lwt () = Lwt_unix.sleep config.retry_delay_seconds in
          attempt (retry_count + 1)
        end
      else
        begin
          let error_msg = Printf.sprintf "Failed after %d attempts" (retry_count + 1) in
          Logs_lwt.err (fun m ->
            m "[ETL] Job %s failed permanently: %s" job.job_name error_msg
          ) >>= fun () ->

          Lwt.return (Failed error_msg)
        end
    in

    attempt 0

  (** Main orchestrator loop *)
  let run_orchestrator
      ~(pool: ((Caqti_lwt.connection, Caqti_error.t) Caqti_lwt_unix.Pool.t, Caqti_error.t) Result.t)
      ~(coingecko_config: Etl.Depeg_event_ingestion.DepegEventIngestion.coingecko_config)
      ~(vault: Pool.Collateral_manager.CollateralManager.unified_pool)
      ~(output_dir: string)
    : unit Lwt.t =
    let _ = coingecko_config in

    Logs_lwt.info (fun m ->
      m "[ETL] Starting ETL orchestrator"
    ) >>= fun () ->

    let jobs = ref (create_daily_jobs ~current_time:(Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec)) in

    let rec scheduler_loop () =
      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

      (* Check for jobs ready to run *)
      let%lwt () =
        Lwt_list.iter_s (fun job ->
          if Float.(now >= job.next_run) && not (Poly.equal job.status Running) then
            begin
              (* Mark as running *)
              jobs := List.map !jobs ~f:(fun j ->
                if String.equal j.job_id job.job_id then
                  { j with status = Running }
                else j
              );

              (* Run job *)
              let job_fn = match job.job_id with
                | "daily_depeg_backfill" ->
                    (fun () ->
                      let%lwt count = run_depeg_backfill ~config:() ~pool in
                      Lwt.return (count > 0)
                    )
                | "daily_correlation_update" ->
                    (fun () ->
                      let%lwt (c30, c90, c365) = run_correlation_update ~pool in
                      Lwt.return (c30 > 0 || c90 > 0 || c365 > 0)
                    )
                | "daily_risk_report" ->
                    (fun () -> run_risk_report ~pool ~vault ~output_dir)
                | _ ->
                    (fun () -> Lwt.return false)
              in

              let%lwt status =
                run_job_with_retry
                  ~config:default_config
                  ~job
                  ~job_fn
              in

              (* Update job status *)
              let next_run = calculate_next_run ~current_time:now ~schedule:job.schedule in
              jobs := List.map !jobs ~f:(fun j ->
                if String.equal j.job_id job.job_id then
                  {
                    j with
                    status;
                    last_run = Some now;
                    next_run;
                    run_count = j.run_count + 1;
                    failure_count =
                      (match status with
                      | Failed _ -> j.failure_count + 1
                      | _ -> j.failure_count);
                  }
                else j
              );

              Lwt.return ()
            end
          else
            Lwt.return ()
        ) !jobs
      in

      (* Sleep for 1 minute before next check *)
      let%lwt () = Lwt_unix.sleep 60.0 in
      scheduler_loop ()
    in

    scheduler_loop ()

end
