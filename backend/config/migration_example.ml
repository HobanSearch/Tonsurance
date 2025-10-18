(* Migration Example: Converting Hardcoded Values to Config Manager
 *
 * This file demonstrates how to migrate existing code from hardcoded values
 * to using the new ConfigManager system.
 *)

open Lwt.Syntax

(* BEFORE: Hardcoded values *)
module OldTonClient = struct
  type ton_config = {
    network: string;
    api_key: string option;
    timeout_seconds: int;
  }

  let default_config = {
    network = "testnet";
    api_key = None;
    timeout_seconds = 30;  (* HARDCODED *)
  }

  let make_request config endpoint =
    (* Use hardcoded timeout *)
    let timeout = config.timeout_seconds in
    Printf.printf "Making request with timeout: %d\n" timeout;
    Lwt.return_unit
end

(* AFTER: Using ConfigManager *)
module NewTonClient = struct
  open Config_manager

  type ton_config = {
    network: string;
    api_key: string option;
  }

  let default_config = {
    network = "testnet";
    api_key = None;
  }

  let make_request config endpoint =
    (* Load timeout from config *)
    let* timeout = Timeouts.get_ton_client_timeout () in
    Printf.printf "Making request with configured timeout: %d\n" timeout;
    Lwt.return_unit
end

(* BEFORE: Hardcoded gas amounts *)
module OldPolicyPurchase = struct
  let purchase_policy user_address coverage_amount =
    let premium_gas = 50000000 in  (* HARDCODED: 0.05 TON *)
    let routing_gas = 80000000 in  (* HARDCODED: 0.08 TON *)
    Printf.printf "Gas amounts: premium=%d, routing=%d\n" premium_gas routing_gas;
    Lwt.return_unit
end

(* AFTER: Using ConfigManager *)
module NewPolicyPurchase = struct
  open Config_manager

  let purchase_policy user_address coverage_amount =
    let* premium_gas = Gas.get_policy_factory_gas () in
    let* routing_gas = Gas.get_operation_gas "routing_gas" in

    (* Apply environment multiplier for production safety *)
    let* multiplier = Gas.get_environment_multiplier () in
    let final_premium_gas = Float.to_int (Float.of_int premium_gas *. multiplier) in
    let final_routing_gas = Float.to_int (Float.of_int routing_gas *. multiplier) in

    Printf.printf "Gas amounts: premium=%d, routing=%d (multiplier=%.2f)\n"
      final_premium_gas final_routing_gas multiplier;
    Lwt.return_unit
end

(* BEFORE: Hardcoded retry logic *)
module OldHttpClient = struct
  let fetch_with_retry url =
    let max_retries = 3 in  (* HARDCODED *)
    let delays = [1.0; 2.0; 4.0] in  (* HARDCODED *)
    Printf.printf "Retrying with %d attempts\n" max_retries;
    Lwt.return_unit
end

(* AFTER: Using ConfigManager *)
module NewHttpClient = struct
  open Config_manager

  let fetch_with_retry url =
    let* max_retries = Retry.get_max_attempts "http_client" in
    let* delays = Retry.get_backoff_delays "http_client" in
    Printf.printf "Retrying with %d attempts, delays: %s\n"
      max_retries
      (String.concat ", " (List.map (fun d -> Printf.sprintf "%.1fs" d) delays));
    Lwt.return_unit
end

(* BEFORE: Hardcoded database pool *)
module OldDatabase = struct
  type db_config = {
    host: string;
    port: int;
    pool_size: int;
  }

  let default_config = {
    host = "localhost";
    port = 5432;
    pool_size = 10;  (* HARDCODED *)
  }

  let connect config =
    Printf.printf "Connecting with pool size: %d\n" config.pool_size;
    Lwt.return_unit
end

(* AFTER: Using ConfigManager *)
module NewDatabase = struct
  open Config_manager

  type db_config = {
    host: string;
    port: int;
  }

  let default_config = {
    host = "localhost";
    port = 5432;
  }

  let connect config =
    let* pool_size = Pools.get_database_pool_size () in
    Printf.printf "Connecting with configured pool size: %d\n" pool_size;
    Lwt.return_unit
end

(* BEFORE: Hardcoded circuit breaker *)
module OldCircuitBreaker = struct
  let check_price_change previous current =
    let max_change_percent = 50.0 in  (* HARDCODED *)
    let change = Float.abs (current -. previous) /. previous *. 100.0 in

    if change > max_change_percent then begin
      Printf.printf "Circuit breaker triggered: %.2f%% change\n" change;
      false
    end else
      true
end

(* AFTER: Using ConfigManager *)
module NewCircuitBreaker = struct
  open Config_manager

  let check_price_change previous current =
    let* max_change_percent = Thresholds.get_circuit_breaker_price_change_max () in
    let change = Float.abs (current -. previous) /. previous *. 100.0 in

    let result = if change > max_change_percent then begin
      Printf.printf "Circuit breaker triggered: %.2f%% > %.2f%% threshold\n"
        change max_change_percent;
      false
    end else
      true
    in
    Lwt.return result
end

(* BEFORE: Hardcoded daemon intervals *)
module OldDaemon = struct
  type daemon_config = {
    vault_sync_interval_seconds: float;
    event_poll_interval_seconds: float;
  }

  let default_config = {
    vault_sync_interval_seconds = 300.0;  (* HARDCODED: 5 minutes *)
    event_poll_interval_seconds = 10.0;   (* HARDCODED: 10 seconds *)
  }

  let rec run_loop config =
    let* () = Lwt_unix.sleep config.vault_sync_interval_seconds in
    Printf.printf "Syncing vaults...\n";
    run_loop config
end

(* AFTER: Using ConfigManager *)
module NewDaemon = struct
  open Config_manager

  let rec run_vault_sync_loop () =
    let* interval = Timeouts.get_daemon_interval "vault_sync" in
    let* () = Lwt_unix.sleep interval in
    Printf.printf "Syncing vaults (interval: %.1fs)...\n" interval;
    run_vault_sync_loop ()

  let rec run_event_poll_loop () =
    let* interval = Timeouts.get_daemon_interval "event_poll" in
    let* () = Lwt_unix.sleep interval in
    Printf.printf "Polling events (interval: %.1fs)...\n" interval;
    run_event_poll_loop ()
end

(* Example: Initialize and use the config system *)
let example_usage () =
  let* () = Config_manager.initialize () in

  (* Validate configuration *)
  let* validation_result = Config_manager.validate_config () in
  (match validation_result with
   | Ok () -> Logs.info (fun m -> m "Configuration is valid")
   | Error msg -> Logs.err (fun m -> m "Configuration invalid: %s" msg));

  (* Use the new modules *)
  let* () = NewTonClient.make_request NewTonClient.default_config "/get_account" in
  let* () = NewPolicyPurchase.purchase_policy "EQD..." 1000 in
  let* () = NewHttpClient.fetch_with_retry "https://api.example.com" in
  let* () = NewDatabase.connect NewDatabase.default_config in
  let* _result = NewCircuitBreaker.check_price_change 1.0 1.6 in

  (* Get configuration summary *)
  let* summary = Config_manager.get_config_summary () in
  Printf.printf "\nConfiguration Summary:\n%s\n" (Yojson.Safe.pretty_to_string summary);

  Lwt.return_unit

(* Hot-reload example *)
let hot_reload_example () =
  let* () = Config_manager.initialize () in

  (* Get initial timeout *)
  let* initial_timeout = Config_manager.Timeouts.get_ton_client_timeout () in
  Printf.printf "Initial timeout: %d seconds\n" initial_timeout;

  (* Simulate configuration file update (in real scenario, admin edits JSON file) *)
  Printf.printf "Waiting for config update... (edit timeouts.json now)\n";
  let* () = Lwt_unix.sleep 10.0 in

  (* Reload configuration *)
  let* () = Config_manager.reload_config () in

  (* Get updated timeout *)
  let* updated_timeout = Config_manager.Timeouts.get_ton_client_timeout () in
  Printf.printf "Updated timeout: %d seconds\n" updated_timeout;

  Lwt.return_unit

(* Environment variable override example *)
let env_override_example () =
  (* Set environment variable: TONSURANCE_TIMEOUTS_TON_CLIENT_REQUEST_TIMEOUT_SECONDS=60 *)
  let* () = Config_manager.initialize () in

  (* This will use env var if set, otherwise fall back to JSON config *)
  let* timeout = Config_manager.Timeouts.get_ton_client_timeout () in
  Printf.printf "Timeout (with env override): %d seconds\n" timeout;

  Lwt.return_unit
