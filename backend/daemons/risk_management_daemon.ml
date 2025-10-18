(** Risk Management Daemon

    Orchestrates all risk management and optimization systems:
    - Unified Risk Monitor: Real-time portfolio surveillance (60s)
    - Float Rebalancer: USD/BTC allocation optimization (300s)
    - Tranche Arbitrage: Market making for tranches (900s)

    This daemon runs all three systems in parallel with shared state,
    coordinated logging, health monitoring, and graceful shutdown.
*)

open Core
open Lwt.Infix
open Types

(** Daemon configuration *)
type daemon_config = {
  (* Monitor intervals *)
  risk_monitor_interval: float;      (* seconds, default 60 *)
  rebalancer_interval: float;        (* seconds, default 300 *)
  arbitrage_interval: float;         (* seconds, default 900 *)

  (* Health check *)
  health_check_interval: float;      (* seconds, default 30 *)
  max_error_count: int;              (* max consecutive errors before shutdown *)

  (* Logging *)
  log_level: [`Debug | `Info | `Warning | `Error];
  log_file: string option;

  (* Price data *)
  price_update_interval: float;      (* seconds, default 120 *)
  price_history_depth: int;          (* number of data points to keep *)

  (* Emergency shutdown *)
  enable_emergency_shutdown: bool;
  max_ltv_shutdown: float;           (* shutdown if LTV exceeds this *)
  min_reserve_shutdown: float;       (* shutdown if reserves below this *)
}

let default_config = {
  risk_monitor_interval = 60.0;
  rebalancer_interval = 300.0;
  arbitrage_interval = 900.0;
  health_check_interval = 30.0;
  max_error_count = 10;
  log_level = `Info;
  log_file = Some "logs/risk_management_daemon.log";
  price_update_interval = 120.0;
  price_history_depth = 100;
  enable_emergency_shutdown = true;
  max_ltv_shutdown = 0.95;
  min_reserve_shutdown = 0.05;
}

(** Daemon state *)
type daemon_state = {
  mutable collateral_manager: Collateral_manager.t;
  mutable price_history: (Types.asset * float list) list;
  mutable last_price_update: float;
  mutable is_running: bool;
  mutable error_counts: (string * int) list; (* component -> error count *)
  mutable last_health_check: float;
  mutable metrics: daemon_metrics;
}

and daemon_metrics = {
  mutable risk_monitor_cycles: int;
  mutable rebalancer_cycles: int;
  mutable arbitrage_cycles: int;
  mutable total_errors: int;
  mutable uptime_seconds: float;
  mutable last_risk_snapshot: Unified_risk_monitor.risk_snapshot option;
  mutable last_rebalance: Float_rebalancer.rebalance_action option;
  mutable last_arbitrage: Tranche_arbitrage.arbitrage_opportunity list;
}

(** Logging *)
let log_file_channel = ref None

let setup_logging config =
  match config.log_file with
  | None -> ()
  | Some path ->
      let oc = Out_channel.create ~append:true path in
      log_file_channel := Some oc

let log_message level component message =
  let timestamp = Unix.gettimeofday () in
  let level_str = match level with
    | `Debug -> "DEBUG"
    | `Info -> "INFO"
    | `Warning -> "WARNING"
    | `Error -> "ERROR"
  in
  let log_line = Printf.sprintf "[%s] %s [%s] %s"
    (Float.to_string timestamp)
    level_str
    component
    message
  in
  Printf.printf "%s\n%!" log_line;
  match !log_file_channel with
  | Some oc ->
      Out_channel.output_string oc (log_line ^ "\n");
      Out_channel.flush oc
  | None -> ()

(** Price data management *)
let fetch_current_prices () : (Types.asset * float) list Lwt.t =
  (* In production, this would fetch from Oracle_aggregator *)
  (* For now, return mock data *)
  Lwt.return [
    (USDC, 1.0);
    (USDT, 0.9995);
    (USDP, 0.9998);
    (DAI, 0.9996);
    (BUSD, 0.9997);
  ]

let update_price_history state config =
  fetch_current_prices () >>= fun prices ->

  let now = Unix.gettimeofday () in
  state.last_price_update <- now;

  (* Update history for each asset *)
  let updated_history =
    List.map prices ~f:(fun (asset, price) ->
      let existing_history =
        List.Assoc.find state.price_history ~equal:Types.equal_asset asset
        |> Option.value ~default:[]
      in
      let new_history = price :: existing_history in
      let trimmed_history =
        List.take new_history config.price_history_depth
      in
      (asset, trimmed_history)
    )
  in

  state.price_history <- updated_history;
  log_message `Debug "PriceManager"
    (Printf.sprintf "Updated price history (%d assets)" (List.length prices));
  Lwt.return_unit

(** Health monitoring *)
let check_health state config =
  let now = Unix.gettimeofday () in
  state.last_health_check <- now;

  (* Get pool state *)
  let pool = Collateral_manager.get_pool_state state.collateral_manager in
  let total_capital = Math.cents_to_usd pool.total_capital_usd in
  let total_coverage = Math.cents_to_usd pool.total_coverage_sold in

  let ltv = if total_capital > 0.0 then total_coverage /. total_capital else 0.0 in

  let usd_reserves = Math.cents_to_usd pool.usd_reserves in
  let reserve_ratio = if total_capital > 0.0 then usd_reserves /. total_capital else 0.0 in

  (* Check for emergency conditions *)
  let emergency_shutdown_needed =
    config.enable_emergency_shutdown &&
    (ltv > config.max_ltv_shutdown || reserve_ratio < config.min_reserve_shutdown)
  in

  if emergency_shutdown_needed then begin
    log_message `Error "HealthMonitor"
      (Printf.sprintf "EMERGENCY SHUTDOWN: LTV=%.2f%%, Reserves=%.2f%%"
        (ltv *. 100.0) (reserve_ratio *. 100.0));
    state.is_running <- false;
  end;

  (* Check error counts *)
  let total_errors =
    List.fold state.error_counts ~init:0 ~f:(fun acc (_, count) -> acc + count)
  in

  if total_errors > config.max_error_count then begin
    log_message `Error "HealthMonitor"
      (Printf.sprintf "Too many errors (%d), shutting down" total_errors);
    state.is_running <- false;
  end;

  (* Log health status *)
  log_message `Info "HealthMonitor"
    (Printf.sprintf "Health: LTV=%.2f%%, Reserves=%.2f%%, Errors=%d, Uptime=%.0fs"
      (ltv *. 100.0)
      (reserve_ratio *. 100.0)
      total_errors
      state.metrics.uptime_seconds);

  Lwt.return_unit

let increment_error_count state component =
  let current_count =
    List.Assoc.find state.error_counts ~equal:String.equal component
    |> Option.value ~default:0
  in
  state.error_counts <-
    List.Assoc.add state.error_counts ~equal:String.equal component (current_count + 1);
  state.metrics.total_errors <- state.metrics.total_errors + 1

let reset_error_count state component =
  state.error_counts <-
    List.Assoc.add state.error_counts ~equal:String.equal component 0

(** Risk Monitor Loop *)
let risk_monitor_loop state config db_pool =
  let monitor_config = Unified_risk_monitor.default_config in
  let price_history_provider () =
    Lwt.return (Some state.price_history)
  in
  Unified_risk_monitor.monitor_loop
    ~db_pool
    ~collateral_manager:(ref state.collateral_manager)
    ~config:monitor_config
    ~price_history_provider

(** Float Rebalancer Loop *)
let rebalancer_loop state config =
  let rebalancer_config = Float_rebalancer.default_config in

  let rec loop () =
    if not state.is_running then Lwt.return_unit
    else begin
      Lwt.catch
        (fun () ->
          (* Get BTC price *)
          (* In production, fetch from oracle *)
          let btc_price = 65000.0 in
          let btc_volatility = 0.60 in

          (* Get price scenarios from current state *)
          fetch_current_prices () >>= fun price_scenarios ->

          (* Evaluate rebalancing *)
          let action_opt = Float_rebalancer.evaluate_rebalancing
            state.collateral_manager
            ~btc_price
            ~btc_volatility
            ~config:rebalancer_config
            ~price_scenarios
          in

          (match action_opt with
           | None ->
               log_message `Debug "Rebalancer" "No rebalancing needed";
               Lwt.return_unit
           | Some action ->
               log_message `Info "Rebalancer"
                 (Printf.sprintf "Action: %s, USD: $%.2f, Reason: %s"
                   (match action.action with
                    | `Buy_BTC _ -> "Buy BTC"
                    | `Sell_BTC _ -> "Sell BTC"
                    | `Hold -> "Hold")
                   action.usd_amount
                   action.reason);

               (* Execute rebalance *)
               Float_rebalancer.execute_rebalance
                 (ref state.collateral_manager)
                 action
                 ~btc_price;

               (* Update state *)
               state.collateral_manager <- !(ref state.collateral_manager);
               state.metrics.last_rebalance <- Some action;

               Lwt.return_unit
          ) >>= fun () ->

          state.metrics.rebalancer_cycles <- state.metrics.rebalancer_cycles + 1;
          reset_error_count state "Rebalancer";
          Lwt.return_unit
        )
        (fun exn ->
          log_message `Error "Rebalancer"
            (Printf.sprintf "Error: %s" (Exn.to_string exn));
          increment_error_count state "Rebalancer";
          Lwt.return_unit
        )
      >>= fun () ->
      Lwt_unix.sleep config.rebalancer_interval >>= fun () ->
      loop ()
    end
  in
  loop ()

(** Tranche Arbitrage Loop *)
let arbitrage_loop state config =
  let arbitrage_config = Tranche_arbitrage.default_config in

  let rec loop () =
    if not state.is_running then Lwt.return_unit
    else begin
      Lwt.catch
        (fun () ->
          (* Find arbitrage opportunities *)
          let opportunities = Tranche_arbitrage.find_arbitrage_opportunities
            state.collateral_manager
            ~config:arbitrage_config
          in

          state.metrics.last_arbitrage <- opportunities;

          if List.is_empty opportunities then begin
            log_message `Debug "Arbitrage" "No opportunities found";
            Lwt.return_unit
          end else begin
            log_message `Info "Arbitrage"
              (Printf.sprintf "Found %d opportunities" (List.length opportunities));

            (* Execute profitable arbitrages *)
            List.iter opportunities ~f:(fun opp ->
              if opp.expected_profit > 0.0 then begin
                log_message `Info "Arbitrage"
                  (Printf.sprintf "Executing: Buy T%d, Sell T%d, Profit: $%.2f (%.2f%%)"
                    opp.buy_tranche
                    opp.sell_tranche
                    opp.expected_profit
                    (opp.confidence *. 100.0));

                let updated_mgr = Tranche_arbitrage.execute_arbitrage
                  state.collateral_manager
                  ~opportunity:opp
                in
                state.collateral_manager <- updated_mgr;
              end
            );

            Lwt.return_unit
          end >>= fun () ->

          state.metrics.arbitrage_cycles <- state.metrics.arbitrage_cycles + 1;
          reset_error_count state "Arbitrage";
          Lwt.return_unit
        )
        (fun exn ->
          log_message `Error "Arbitrage"
            (Printf.sprintf "Error: %s" (Exn.to_string exn));
          increment_error_count state "Arbitrage";
          Lwt.return_unit
        )
      >>= fun () ->
      Lwt_unix.sleep config.arbitrage_interval >>= fun () ->
      loop ()
    end
  in
  loop ()

(** Price Update Loop *)
let price_update_loop state config =
  let rec loop () =
    if not state.is_running then Lwt.return_unit
    else begin
      Lwt.catch
        (fun () ->
          update_price_history state config >>= fun () ->
          reset_error_count state "PriceUpdater";
          Lwt.return_unit
        )
        (fun exn ->
          log_message `Error "PriceUpdater"
            (Printf.sprintf "Error: %s" (Exn.to_string exn));
          increment_error_count state "PriceUpdater";
          Lwt.return_unit
        )
      >>= fun () ->
      Lwt_unix.sleep config.price_update_interval >>= fun () ->
      loop ()
    end
  in
  loop ()

(** Health Check Loop *)
let health_check_loop state config =
  let start_time = Unix.gettimeofday () in

  let rec loop () =
    if not state.is_running then Lwt.return_unit
    else begin
      let now = Unix.gettimeofday () in
      state.metrics.uptime_seconds <- now -. start_time;

      Lwt.catch
        (fun () ->
          check_health state config >>= fun () ->
          reset_error_count state "HealthMonitor";
          Lwt.return_unit
        )
        (fun exn ->
          log_message `Error "HealthMonitor"
            (Printf.sprintf "Error: %s" (Exn.to_string exn));
          increment_error_count state "HealthMonitor";
          Lwt.return_unit
        )
      >>= fun () ->
      Lwt_unix.sleep config.health_check_interval >>= fun () ->
      loop ()
    end
  in
  loop ()

(** Metrics reporting *)
let get_metrics state =
  state.metrics

let print_metrics state =
  let m = state.metrics in
  Printf.printf "\n=== Risk Management Daemon Metrics ===\n";
  Printf.printf "Uptime: %.0f seconds\n" m.uptime_seconds;
  Printf.printf "Risk Monitor Cycles: %d\n" m.risk_monitor_cycles;
  Printf.printf "Rebalancer Cycles: %d\n" m.rebalancer_cycles;
  Printf.printf "Arbitrage Cycles: %d\n" m.arbitrage_cycles;
  Printf.printf "Total Errors: %d\n" m.total_errors;

  (match m.last_risk_snapshot with
   | None -> Printf.printf "Last Risk Snapshot: None\n"
   | Some snapshot ->
       Printf.printf "Last Risk Snapshot:\n";
       Printf.printf "  VaR 95%%: %.2f%%\n" (snapshot.var_95 *. 100.0);
       Printf.printf "  VaR 99%%: %.2f%%\n" (snapshot.var_99 *. 100.0);
       Printf.printf "  LTV: %.2f%%\n" (snapshot.ltv *. 100.0);
       Printf.printf "  Reserves: %.2f%%\n" (snapshot.reserve_ratio *. 100.0);
       Printf.printf "  Breaches: %d\n" (List.length snapshot.breach_alerts);
       Printf.printf "  Warnings: %d\n" (List.length snapshot.warning_alerts);
  );

  (match m.last_rebalance with
   | None -> Printf.printf "Last Rebalance: None\n"
   | Some action ->
       Printf.printf "Last Rebalance:\n";
       Printf.printf "  Action: %s\n"
         (match action.action with
          | `Buy_BTC _ -> "Buy BTC"
          | `Sell_BTC _ -> "Sell BTC"
          | `Hold -> "Hold");
       Printf.printf "  USD Amount: $%.2f\n" action.usd_amount;
       Printf.printf "  Reason: %s\n" action.reason;
  );

  Printf.printf "Last Arbitrage Opportunities: %d\n"
    (List.length m.last_arbitrage);

  Printf.printf "======================================\n\n%!"

(** Main daemon *)
let create_daemon ?(config = default_config) initial_collateral_manager =
  {
    collateral_manager = initial_collateral_manager;
    price_history = [];
    last_price_update = 0.0;
    is_running = true;
    error_counts = [];
    last_health_check = 0.0;
    metrics = {
      risk_monitor_cycles = 0;
      rebalancer_cycles = 0;
      arbitrage_cycles = 0;
      total_errors = 0;
      uptime_seconds = 0.0;
      last_risk_snapshot = None;
      last_rebalance = None;
      last_arbitrage = [];
    };
  }

let start_daemon ?(config = default_config) state db_pool =
  setup_logging config;

  log_message `Info "Daemon" "Starting Risk Management Daemon";
  log_message `Info "Daemon"
    (Printf.sprintf "Config: risk=%ds, rebalance=%ds, arbitrage=%ds"
      (Float.to_int config.risk_monitor_interval)
      (Float.to_int config.rebalancer_interval)
      (Float.to_int config.arbitrage_interval));

  state.is_running <- true;

  (* Initialize price history *)
  Lwt_main.run (update_price_history state config);

  (* Start all loops in parallel *)
  Lwt_main.run (
    Lwt.join [
      risk_monitor_loop state config db_pool;
      rebalancer_loop state config;
      arbitrage_loop state config;
      price_update_loop state config;
      health_check_loop state config;
    ]
  );

  log_message `Info "Daemon" "Risk Management Daemon stopped";

  (* Cleanup *)
  (match !log_file_channel with
   | Some oc -> Out_channel.close oc
   | None -> ())

let stop_daemon state =
  log_message `Info "Daemon" "Stopping Risk Management Daemon";
  state.is_running <- false

(** Command-line interface *)
let main () =
  (* Create initial collateral manager *)
  let initial_pool = Collateral_manager.create_unified_pool () in
  let initial_mgr = Collateral_manager.create initial_pool in

  (* Create daemon *)
  let config = default_config in
  let state = create_daemon ~config initial_mgr in

  (* Create database pool *)
  let db_config = Integration.Database.Database.default_config in
  let db_pool = Integration.Database.Database.create_pool db_config in

  (* Setup signal handlers *)
  let shutdown_handler _signum =
    log_message `Info "Daemon" "Received shutdown signal";
    stop_daemon state
  in
  Sys.set_signal Sys.sigint (Sys.Signal_handle shutdown_handler);
  Sys.set_signal Sys.sigterm (Sys.Signal_handle shutdown_handler);

  (* Start daemon *)
  start_daemon ~config state db_pool;

  (* Print final metrics *)
  print_metrics state

(** For testing *)
let create_test_daemon () =
  let initial_pool = Collateral_manager.create_unified_pool () in
  let initial_mgr = Collateral_manager.create initial_pool in
  create_daemon initial_mgr

let run_for_duration ?(config = default_config) state duration_seconds =
  setup_logging config;
  state.is_running <- true;

  (* Initialize price history *)
  Lwt_main.run (update_price_history state config);

  (* Run for specified duration *)
  let stop_time = Unix.gettimeofday () +. duration_seconds in

  let timeout_loop () =
    let rec loop () =
      let now = Unix.gettimeofday () in
      if now >= stop_time then begin
        stop_daemon state;
        Lwt.return_unit
      end else begin
        Lwt_unix.sleep 1.0 >>= fun () ->
        loop ()
      end
    in
    loop ()
  in

  Lwt_main.run (
    Lwt.join [
      risk_monitor_loop state config;
      rebalancer_loop state config;
      arbitrage_loop state config;
      price_update_loop state config;
      health_check_loop state config;
      timeout_loop ();
    ]
  );

  print_metrics state
