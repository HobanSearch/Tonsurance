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
  mutable collateral_manager: Pool.Collateral_manager.CollateralManager.t;
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
  mutable last_risk_snapshot: Monitoring.Unified_risk_monitor.UnifiedRiskMonitor.risk_snapshot option;
  mutable last_rebalance: Pool.Float_rebalancer.FloatRebalancer.rebalance_action option;
  mutable last_arbitrage: Pool.Tranche_arbitrage.TrancheArbitrage.arbitrage_opportunity list;
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
  let timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
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
  (* Fetch real-time prices from Oracle Aggregator *)
  let oracle_config = Oracle_aggregator.OracleAggregator.default_config in

  (* Fetch consensus prices for all stablecoins *)
  let assets_to_fetch = [USDC; USDT; USDP; DAI; BUSD; FRAX; USDe; SUSDe; USDY; PYUSD] in

  let%lwt price_results = Lwt_list.map_p (fun asset ->
    let%lwt consensus_opt = Oracle_aggregator.OracleAggregator.get_consensus_price
      ~config:oracle_config
      asset
      ~previous_price:None
    in

    match consensus_opt with
    | Some consensus when Float.(consensus.confidence > 0.7) ->
        (* Use consensus price if confidence > 70% *)
        Lwt.return (Some (asset, consensus.price))
    | _ ->
        (* Fallback to $1.00 for stablecoins if oracle data unavailable *)
        Logs.warn (fun m -> m "Oracle price unavailable for %s, using $1.00 fallback"
          (Types.asset_to_string asset));
        Lwt.return (Some (asset, 1.0))
  ) assets_to_fetch in

  (* Filter out None values and return price list *)
  let prices = List.filter_map price_results ~f:Fn.id in
  Lwt.return prices

let update_price_history state config =
  fetch_current_prices () >>= fun prices ->

  let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
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
  let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
  state.last_health_check <- now;

  (* Get pool statistics *)
  let pool_stats = Pool.Collateral_manager.CollateralManager.get_pool_stats state.collateral_manager in

  (* Parse key statistics from the list *)
  let get_stat key =
    List.find_map pool_stats ~f:(fun (k, v) ->
      if String.equal k key then Some (Float.of_string v) else None
    ) |> Option.value ~default:0.0
  in

  let total_capital = get_stat "Total Capital (USD)" in
  let total_coverage = get_stat "Total Coverage Sold (USD)" in
  let usd_reserves = get_stat "USD Reserves" in

  let ltv = if Float.(total_capital > 0.0) then total_coverage /. total_capital else 0.0 in
  let reserve_ratio = if Float.(total_capital > 0.0) then usd_reserves /. total_capital else 0.0 in

  (* Check for emergency conditions *)
  let emergency_shutdown_needed =
    config.enable_emergency_shutdown &&
    (Float.(ltv > config.max_ltv_shutdown) || Float.(reserve_ratio < config.min_reserve_shutdown))
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
  let monitor_config = Monitoring.Unified_risk_monitor.UnifiedRiskMonitor.default_config in
  let price_history_provider () =
    Lwt.return (Some state.price_history)
  in
  Monitoring.Unified_risk_monitor.UnifiedRiskMonitor.monitor_loop
    ~db_pool
    ~collateral_manager:(ref state.collateral_manager)
    ~config:monitor_config
    ~price_history_provider

(** Float Rebalancer Loop *)
let rebalancer_loop state config =
  let rebalancer_config = Pool.Float_rebalancer.FloatRebalancer.default_config in

  let rec loop () =
    if not state.is_running then Lwt.return_unit
    else begin
      Lwt.catch
        (fun () ->
          (* Fetch real BTC price from Oracle Aggregator *)
          let oracle_config = Oracle_aggregator.OracleAggregator.default_config in

          let%lwt btc_consensus_opt = Oracle_aggregator.OracleAggregator.get_consensus_price
            ~config:oracle_config
            BTC
            ~previous_price:None
          in

          let btc_price = match btc_consensus_opt with
            | Some consensus when Float.(consensus.confidence > 0.7) -> consensus.price
            | _ ->
                Logs.warn (fun m -> m "BTC price unavailable, using $65000 fallback");
                65000.0
          in

          (* Calculate BTC volatility from recent price history *)
          let btc_volatility =
            match List.Assoc.find state.price_history ~equal:Types.equal_asset BTC with
            | Some prices when List.length prices >= 30 ->
                (* Calculate 30-day realized volatility *)
                let returns = List.mapi prices ~f:(fun i price ->
                  if i = 0 then None
                  else
                    let prev_price = List.nth_exn prices (i - 1) in
                    Some (Float.log (price /. prev_price))
                ) |> List.filter_map ~f:Fn.id in

                if List.length returns > 0 then
                  let mean_return = List.fold returns ~init:0.0 ~f:(+.) /. Float.of_int (List.length returns) in
                  let variance = List.fold returns ~init:0.0 ~f:(fun acc r ->
                    let diff = r -. mean_return in
                    acc +. (diff *. diff)
                  ) /. Float.of_int (List.length returns) in
                  let std_dev = Float.sqrt variance in
                  (* Annualize volatility (sqrt(365) for daily returns) *)
                  std_dev *. Float.sqrt 365.0
                else
                  0.60 (* Default 60% volatility *)

            | _ ->
                Logs.warn (fun m -> m "Insufficient BTC price history for volatility, using 60%% default");
                0.60
          in

          (* Get price scenarios from current state *)
          fetch_current_prices () >>= fun _price_scenarios ->

          (* TODO: Implement Float_rebalancer.evaluate_rebalancing *)
          (* Evaluate rebalancing *)
          let action_opt = None (*Pool.Float_rebalancer.evaluate_rebalancing
            state.collateral_manager
            ~btc_price
            ~btc_volatility
            ~config:rebalancer_config
            ~price_scenarios*)
          in

          (* TODO: Implement Float_rebalancer logic *)
          log_message `Debug "Rebalancer" "No rebalancing needed (not implemented)";
          Lwt.return_unit >>= fun () ->

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
  (* TODO: Implement Tranche_arbitrage module *)
  let _arbitrage_config = () (* Tranche_arbitrage.default_config *) in

  let rec loop () =
    if not state.is_running then Lwt.return_unit
    else begin
      Lwt.catch
        (fun () ->
          (* Find arbitrage opportunities *)
          (* TODO: Implement Tranche_arbitrage *)
          let opportunities = [] (* Tranche_arbitrage.find_arbitrage_opportunities state.collateral_manager ~config *)
          in

          state.metrics.last_arbitrage <- opportunities;

          if List.is_empty opportunities then begin
            log_message `Debug "Arbitrage" "No opportunities found";
            Lwt.return_unit
          end else begin
            log_message `Info "Arbitrage"
              (Printf.sprintf "Found %d opportunities" (List.length opportunities));

            (* Execute profitable arbitrages *)
            (* Opportunities list is empty since Tranche_arbitrage.find_arbitrage_opportunities returns [] *)
            List.iter opportunities ~f:(fun _opp ->
              (* No opportunities to execute since list is empty *)
              ()
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
  let start_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

  let rec loop () =
    if not state.is_running then Lwt.return_unit
    else begin
      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
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
  let initial_pool : Pool.Collateral_manager.CollateralManager.unified_pool = {
    total_capital_usd = 0L;
    total_coverage_sold = 0L;
    btc_float_sats = 0L;
    btc_cost_basis_usd = 0L;
    usd_reserves = 0L;
    virtual_tranches = [];
    active_policies = [];
    last_rebalance_time = 0.0;
    created_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
  } in
  let initial_mgr = Pool.Collateral_manager.CollateralManager.create ~pool_opt:initial_pool () in

  (* Create daemon *)
  let config = default_config in
  let state = create_daemon ~config initial_mgr in

  (* Create database pool *)
  let db_config = Database.Database.default_config in
  let db_pool = Database.Database.create_pool db_config in

  (* Setup signal handlers *)
  let shutdown_handler _signum =
    log_message `Info "Daemon" "Received shutdown signal";
    stop_daemon state
  in
  Stdlib.Sys.set_signal Stdlib.Sys.sigint (Stdlib.Sys.Signal_handle shutdown_handler);
  Stdlib.Sys.set_signal Stdlib.Sys.sigterm (Stdlib.Sys.Signal_handle shutdown_handler);

  (* Start daemon *)
  start_daemon ~config state db_pool;

  (* Print final metrics *)
  print_metrics state

(** For testing *)
let create_test_daemon () =
  let initial_pool = {
    total_capital_usd = 0L;
    total_coverage_sold = 0L;
    btc_float_sats = 0L;
    btc_cost_basis = 0L;
    usd_reserves = 0L;
    virtual_tranches = [];
    active_policies = [];
    last_rebalance_time = 0.0;
  } in
  let initial_mgr = Pool.Collateral_manager.CollateralManager.create ~pool_opt:(Some initial_pool) () in
  create_daemon initial_mgr

let run_for_duration ?(config = default_config) state duration_seconds =
  setup_logging config;
  state.is_running <- true;

  (* Initialize price history *)
  Lwt_main.run (update_price_history state config);

  (* Run for specified duration *)
  let stop_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec +. duration_seconds in

  let timeout_loop () =
    let rec loop () =
      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
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
