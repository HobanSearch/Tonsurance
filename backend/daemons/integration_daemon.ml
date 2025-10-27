(* Integration Daemon
 *
 * Main daemon process that coordinates all blockchain integration tasks:
 * - Vault state synchronization (every 5 minutes)
 * - Policy event subscription (continuous polling)
 * - Risk monitor updates
 * - Database synchronization
 *
 * This daemon ensures backend state stays consistent with on-chain state.
 *)

open Core

module IntegrationDaemon = struct

  (** Daemon configuration *)
  type daemon_config = {
    (* TON blockchain *)
    ton_network: Ton_client.TonClient.network;
    ton_api_key: string option;

    (* Contract addresses *)
    vault_address: string;
    policy_factory_address: string;

    (* Database *)
    db_config: Database.Database.db_config;

    (* Sync intervals *)
    vault_sync_interval_seconds: float;
    event_poll_interval_seconds: float;

    (* Drift thresholds *)
    capital_drift_threshold_pct: float;
  }

  let _default_config ~vault_address ~policy_factory_address = {
    ton_network = Ton_client.TonClient.Testnet;
    ton_api_key = None;

    vault_address;
    policy_factory_address;

    db_config = Database.Database.default_config;

    vault_sync_interval_seconds = 300.0;  (* 5 minutes *)
    event_poll_interval_seconds = 10.0;   (* 10 seconds *)

    capital_drift_threshold_pct = 5.0;    (* 5% *)
  }

  (** Daemon state *)
  type daemon_state = {
    config: daemon_config;
    db_pool: ((Caqti_lwt.connection, Caqti_error.t) Caqti_lwt_unix.Pool.t, Caqti_error.t) Result.t;
    started_at: float;
    vault_syncs_completed: int ref;
    events_processed: int ref;
    errors: int ref;
  }

  (** Initialize daemon *)
  let initialize (config: daemon_config) : daemon_state Lwt.t =
    (* Create database pool *)
    let db_pool = Database.Database.create_pool config.db_config in

    (* Initialize database schema *)
    let%lwt () = match db_pool with
      | Ok pool ->
          let%lwt _result = Database.Database.with_connection (Ok pool) (fun db ->
            let%lwt () = Database.Database.initialize_schema db in
            Lwt.return (Ok ())
          ) in
          Lwt.return_unit
      | Error e ->
          Lwt_io.eprintlf "Failed to create database pool: %s" (Caqti_error.show e)
    in

    (* Initialize utilization tracker *)
    let%lwt _ = Pool.Utilization_tracker.UtilizationTracker.init
      ~database_config:config.db_config
    in

    Lwt.return {
      config;
      db_pool;
      started_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      vault_syncs_completed = ref 0;
      events_processed = ref 0;
      errors = ref 0;
    }

  (** Run vault synchronization *)
  let run_vault_sync (state: daemon_state) : unit Lwt.t =
    let ton_config = {
      Ton_client.TonClient.network = state.config.ton_network;
      api_key = state.config.ton_api_key;
      timeout_seconds = 30;
    } in

    let sync_config = {
      Vault_sync.VaultSync.ton_config;
      vault_address = state.config.vault_address;
      sync_interval_seconds = state.config.vault_sync_interval_seconds;
      drift_threshold_percent = state.config.capital_drift_threshold_pct;
    } in

    (* Start continuous vault sync loop *)
    Vault_sync.VaultSync.start_sync_loop sync_config

  (** Run policy event subscription *)
  let run_policy_subscription (state: daemon_state) : unit Lwt.t =
    let ton_config = {
      Ton_client.TonClient.network = state.config.ton_network;
      api_key = state.config.ton_api_key;
      timeout_seconds = 30;
    } in

    let subscriber_config = {
      Policy_event_subscriber.PolicyEventSubscriber.ton_config;
      policy_factory_address = state.config.policy_factory_address;
      poll_interval_seconds = state.config.event_poll_interval_seconds;
      db_pool = state.db_pool;
    } in

    (* Start continuous event subscription *)
    Policy_event_subscriber.PolicyEventSubscriber.start_subscription subscriber_config

  (** Health check loop *)
  let health_check_loop (state: daemon_state) : unit Lwt.t =
    let rec loop () =
      let%lwt () = Lwt_unix.sleep 300.0 in (* Every 5 minutes *)

      let current_time = Time_float.now ()
        |> Time_float.to_span_since_epoch
        |> Time_float.Span.to_sec
      in
      let uptime = current_time -. state.started_at in
      let uptime_hours = uptime /. 3600.0 in

      let%lwt () = Lwt_io.printlf "\n╔════════════════════════════════════════╗" in
      let%lwt () = Lwt_io.printlf "║  Integration Daemon Health Check       ║" in
      let%lwt () = Lwt_io.printlf "╚════════════════════════════════════════╝" in
      let%lwt () = Lwt_io.printlf "Uptime: %.2f hours" uptime_hours in
      let%lwt () = Lwt_io.printlf "Vault syncs: %d" !(state.vault_syncs_completed) in
      let%lwt () = Lwt_io.printlf "Events processed: %d" !(state.events_processed) in
      let%lwt () = Lwt_io.printlf "Errors: %d" !(state.errors) in
      let%lwt () = Lwt_io.printlf "Status: %s\n"
        (if !(state.errors) > 10 then "⚠️  WARNING - High error rate"
         else "✅ HEALTHY")
      in

      (* Get utilization statistics *)
      let%lwt stats = Pool.Utilization_tracker.UtilizationTracker.get_statistics () in
      let%lwt () = Lwt_io.printlf "Utilization: %s\n" stats in

      loop ()
    in
    loop ()

  (** Start all daemon processes *)
  let start (config: daemon_config) : unit Lwt.t =
    let%lwt () = Lwt_io.printlf "\n╔════════════════════════════════════════╗" in
    let%lwt () = Lwt_io.printlf "║    TONSURANCE INTEGRATION DAEMON       ║" in
    let%lwt () = Lwt_io.printlf "╚════════════════════════════════════════╝\n" in
    let%lwt () = Lwt_io.printlf "Network: %s"
      (match config.ton_network with
       | Ton_client.TonClient.Mainnet -> "Mainnet"
       | Testnet -> "Testnet"
       | Custom url -> Printf.sprintf "Custom (%s)" url)
    in
    let%lwt () = Lwt_io.printlf "Vault: %s" config.vault_address in
    let%lwt () = Lwt_io.printlf "PolicyFactory: %s" config.policy_factory_address in
    let%lwt () = Lwt_io.printlf "Database: %s:%d/%s"
      config.db_config.host
      config.db_config.port
      config.db_config.database
    in
    let%lwt () = Lwt_io.printlf "" in

    (* Initialize daemon state *)
    let%lwt state = initialize config in

    let%lwt () = Lwt_io.printlf "✅ Daemon initialized successfully\n" in

    (* Start all background processes in parallel *)
    let processes = [
      run_vault_sync state;
      run_policy_subscription state;
      health_check_loop state;
    ] in

    (* Wait for all processes (they run forever) *)
    Lwt.join processes

  (** Start daemon with error recovery *)
  let start_with_recovery (config: daemon_config) : unit Lwt.t =
    let rec restart_loop attempts =
      try%lwt
        let%lwt () = start config in
        Lwt.return_unit
      with exn ->
        let%lwt () = Lwt_io.eprintlf "\n🚨 DAEMON CRASHED: %s" (Exn.to_string exn) in
        let%lwt () = Lwt_io.eprintlf "Restart attempt %d in 30 seconds...\n" (attempts + 1) in
        let%lwt () = Lwt_unix.sleep 30.0 in

        if attempts < 5 then
          restart_loop (attempts + 1)
        else begin
          let%lwt () = Lwt_io.eprintlf "❌ Too many restart attempts. Exiting." in
          Lwt.fail (Failure "Daemon failed after 5 restart attempts")
        end
    in

    restart_loop 0

end

(** Main entry point *)
let () =
  (* Parse command-line arguments *)
  let vault_address = ref "" in
  let policy_factory_address = ref "" in
  let db_host = ref "localhost" in
  let db_port = ref 5432 in
  let db_name = ref "tonsurance" in
  let db_user = ref "postgres" in
  let db_password = ref "" in
  let network = ref "testnet" in

  let speclist = [
    ("--vault", Arg.Set_string vault_address, "MultiTrancheVault contract address");
    ("--factory", Arg.Set_string policy_factory_address, "PolicyFactory contract address");
    ("--db-host", Arg.Set_string db_host, "PostgreSQL host (default: localhost)");
    ("--db-port", Arg.Set_int db_port, "PostgreSQL port (default: 5432)");
    ("--db-name", Arg.Set_string db_name, "PostgreSQL database (default: tonsurance)");
    ("--db-user", Arg.Set_string db_user, "PostgreSQL user (default: postgres)");
    ("--db-password", Arg.Set_string db_password, "PostgreSQL password");
    ("--network", Arg.Set_string network, "TON network: mainnet|testnet (default: testnet)");
  ] in

  let usage_msg = "Integration Daemon - Synchronizes OCaml backend with TON blockchain" in
  Arg.parse speclist (fun _ -> ()) usage_msg;

  (* Validate required arguments *)
  if String.is_empty !vault_address || String.is_empty !policy_factory_address then begin
    Printf.eprintf "Error: --vault and --factory addresses are required\n";
    Arg.usage speclist usage_msg;
    exit 1
  end;

  (* Build configuration *)
  let ton_network = match String.lowercase !network with
    | "mainnet" -> Ton_client.TonClient.Mainnet
    | "testnet" -> Ton_client.TonClient.Testnet
    | url -> Custom url
  in

  let db_config = {
    Database.Database.host = !db_host;
    port = !db_port;
    database = !db_name;
    user = !db_user;
    password = !db_password;
    pool_size = 10;
  } in

  let config = {
    IntegrationDaemon.ton_network;
    ton_api_key = None;
    vault_address = !vault_address;
    policy_factory_address = !policy_factory_address;
    db_config;
    vault_sync_interval_seconds = 300.0;
    event_poll_interval_seconds = 10.0;
    capital_drift_threshold_pct = 5.0;
  } in

  (* Start daemon *)
  Lwt_main.run (IntegrationDaemon.start_with_recovery config)
