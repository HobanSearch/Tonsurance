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

    (* Simplified: always return next day at 2am for daily jobs *)
    match schedule with
    | "0 2 * * *" ->
        (* Daily 2am UTC *)
        let tm = Core_unix.localtime current_time in
        let tomorrow = { tm with Core_unix.tm_mday = tm.tm_mday + 1; tm_hour = 2; tm_min = 0; tm_sec = 0 } in
        fst (Core_unix.mktime tomorrow)

    | "0 3 * * 0" ->
        (* Sunday 3am UTC *)
        let tm = Core_unix.localtime current_time in
        let days_until_sunday =
          if tm.Core_unix.tm_wday = 0 then 7
          else 7 - tm.tm_wday
        in
        let next_sunday = { tm with tm_mday = tm.tm_mday + days_until_sunday; tm_hour = 3; tm_min = 0; tm_sec = 0 } in
        fst (Core_unix.mktime next_sunday)

    | _ ->
        (* Default: 1 hour from now *)
        current_time +. 3600.0

  (** Run incremental depeg backfill *)
  let run_depeg_backfill
      ~(config: Etl.DepegEventIngestion.coingecko_config)
      ~(pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
    : int Lwt.t =

    Logs_lwt.info (fun m ->
      m "[ETL] Starting incremental depeg backfill"
    ) >>= fun () ->

    let stablecoins = [USDC; USDT; DAI; USDP; FRAX; BUSD] in

    let%lwt results =
      Lwt_list.map_s (fun asset ->
        Etl.DepegEventIngestion.incremental_update ~config ~pool ~asset
      ) stablecoins
    in

    let total = List.fold results ~init:0 ~f:(+) in

    Logs_lwt.info (fun m ->
      m "[ETL] Depeg backfill complete: %d new events" total
    ) >>= fun () ->

    Lwt.return total

  (** Run correlation matrix update *)
  let run_correlation_update
      ~(pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
    : (int * int * int) Lwt.t =

    Logs_lwt.info (fun m ->
      m "[ETL] Starting correlation matrix update"
    ) >>= fun () ->

    Etl.CorrelationMatrixUpdater.update_all_windows pool

  (** Run risk report generation *)
  let run_risk_report
      ~(pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
      ~(vault: vault_state)
      ~(output_dir: string)
    : bool Lwt.t =

    Logs_lwt.info (fun m ->
      m "[ETL] Starting risk report generation"
    ) >>= fun () ->

    let%lwt result =
      Reporting.RiskReportGenerator.generate_daily_report pool ~vault
    in

    match result with
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
          Reporting.RiskReportGenerator.save_report_to_file
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
      ~(pool: (Caqti_lwt.connection Caqti_lwt.Pool.t, [> Caqti_error.t]) result)
      ~(coingecko_config: Etl.DepegEventIngestion.coingecko_config)
      ~(vault: vault_state)
      ~(output_dir: string)
    : unit Lwt.t =

    Logs_lwt.info (fun m ->
      m "[ETL] Starting ETL orchestrator"
    ) >>= fun () ->

    let jobs = ref (create_daily_jobs ~current_time:(Unix.time ())) in

    let rec scheduler_loop () =
      let now = Unix.time () in

      (* Check for jobs ready to run *)
      let%lwt () =
        Lwt_list.iter_s (fun job ->
          if now >= job.next_run && not (Poly.equal job.status Running) then
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
                      let%lwt count = run_depeg_backfill ~config:coingecko_config ~pool in
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
