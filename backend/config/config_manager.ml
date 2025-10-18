(* Enhanced Configuration Manager - Multi-Source Configuration System
 *
 * Features:
 * - File-based JSON configuration (timeouts, gas, retry, pools, thresholds)
 * - Environment-specific overrides (development, staging, production)
 * - Database-backed dynamic configuration (optional)
 * - Environment variable overrides
 * - Type-safe accessors with defaults
 * - Hot-reload support for non-critical parameters
 * - Configuration validation
 *)

open Core
open Lwt.Syntax
open Yojson.Safe.Util

module ConfigManager = struct

  (* Configuration types *)
  type environment = Development | Staging | Production

  let string_to_environment = function
    | "development" -> Development
    | "staging" -> Staging
    | "production" -> Production
    | env -> failwith (Printf.sprintf "Unknown environment: %s" env)

  let environment_to_string = function
    | Development -> "development"
    | Staging -> "staging"
    | Production -> "production"

  (* Current environment (set via ENV or default to development) *)
  let current_environment = ref Development

  (* Cached configuration *)
  type config_cache = {
    timeouts: Yojson.Safe.t;
    gas: Yojson.Safe.t;
    retry: Yojson.Safe.t;
    pools: Yojson.Safe.t;
    thresholds: Yojson.Safe.t;
    environment: Yojson.Safe.t;
    loaded_at: float;
  }

  let cached_config : config_cache option ref = ref None
  let config_base_path = ref "backend/config"

  (* Helper: Load JSON file *)
  let load_json_file filename =
    try
      let path = Filename.concat !config_base_path filename in
      Lwt.return (Yojson.Safe.from_file path)
    with exn ->
      Logs.err (fun m -> m "Failed to load config file %s: %s" filename (Exn.to_string exn));
      Lwt.return (`Assoc [])

  (* Helper: Get environment variable with default *)
  let get_env_var name default =
    match Sys.getenv name with
    | Some value -> value
    | None -> default

  (* Initialize configuration manager *)
  let initialize ?(base_path = "/Users/ben/Documents/Work/HS/Application/Tonsurance/backend/config") () =
    let env_str = get_env_var "TONSURANCE_ENV" "development" in
    current_environment := string_to_environment env_str;
    config_base_path := base_path;
    Logs.info (fun m -> m "Configuration initialized for environment: %s" env_str);
    Lwt.return_unit

  (* Load all configuration files *)
  let load_all_config () =
    let* timeouts = load_json_file "timeouts.json" in
    let* gas = load_json_file "gas_config.json" in
    let* retry = load_json_file "retry_policies.json" in
    let* pools = load_json_file "pool_sizes.json" in
    let* thresholds = load_json_file "thresholds.json" in
    let* environment = load_json_file (
      Printf.sprintf "%s.json" (environment_to_string !current_environment)
    ) in

    let cache = {
      timeouts;
      gas;
      retry;
      pools;
      thresholds;
      environment;
      loaded_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    } in

    cached_config := Some cache;
    Logs.info (fun m -> m "Configuration loaded successfully");
    Lwt.return_unit

  (* Get cached config or load if not present *)
  let ensure_config_loaded () =
    match !cached_config with
    | Some _ -> Lwt.return_unit
    | None -> load_all_config ()

  (* Reload configuration (for hot-reload) *)
  let reload_config () =
    Logs.info (fun m -> m "Reloading configuration...");
    load_all_config ()

  (* Helper: Navigate nested JSON path *)
  let rec get_json_path json path =
    match path with
    | [] -> Some json
    | key :: rest ->
        try
          let nested = json |> member key in
          (match nested with
          | `Null -> None
          | _ -> get_json_path nested rest)
        with _ -> None

  (* Get configuration value with fallback chain:
   * 1. Environment variable
   * 2. Environment-specific config
   * 3. Base config file
   * 4. Default value
   *)
  let get_config_value ~category ~path ~default ~converter =
    let* () = ensure_config_loaded () in

    match !cached_config with
    | None -> Lwt.return default
    | Some cache ->
        (* 1. Check environment variable override *)
        let env_var_name = String.uppercase (
          "TONSURANCE_" ^ category ^ "_" ^ (String.concat ~sep:"_" path)
        ) in
        (match Sys.getenv env_var_name with
         | Some value ->
             (match converter (`String value) with
              | Some v -> Lwt.return v
              | None ->
                  Logs.warn (fun m -> m "Invalid env var %s=%s, using default" env_var_name value);
                  Lwt.return default)
         | None ->
             (* 2. Check environment-specific override *)
             (match get_json_path cache.environment path with
              | Some json ->
                  (match converter json with
                   | Some v -> Lwt.return v
                   | None ->
                       Logs.warn (fun m -> m "Invalid env override for %s.%s"
                         category (String.concat ~sep:"." path));
                       Lwt.return default)
              | None ->
                  (* 3. Check base config file *)
                  let base_json = match category with
                    | "timeouts" -> cache.timeouts
                    | "gas" -> cache.gas
                    | "retry" -> cache.retry
                    | "pools" -> cache.pools
                    | "thresholds" -> cache.thresholds
                    | _ -> `Assoc []
                  in
                  (match get_json_path base_json path with
                   | Some json ->
                       (match converter json with
                        | Some v -> Lwt.return v
                        | None ->
                            Logs.warn (fun m -> m "Invalid config for %s.%s"
                              category (String.concat ~sep:"." path));
                            Lwt.return default)
                   | None ->
                       (* 4. Use default *)
                       Logs.debug (fun m -> m "Config %s.%s not found, using default"
                         category (String.concat ~sep:"." path));
                       Lwt.return default)))

  (* Type converters *)
  let to_float = function
    | `Float f -> Some f
    | `Int i -> Some (Float.of_int i)
    | `String s -> Float.of_string_opt s
    | _ -> None

  let to_int = function
    | `Int i -> Some i
    | `Float f -> Some (Float.to_int f)
    | `String s -> Int.of_string_opt s
    | _ -> None

  let to_string = function
    | `String s -> Some s
    | _ -> None

  let to_bool = function
    | `Bool b -> Some b
    | `String "true" -> Some true
    | `String "false" -> Some false
    | _ -> None

  (* Public API: Get configuration values *)
  let get_float ~category ~path ~default =
    get_config_value ~category ~path ~default ~converter:to_float

  let get_int ~category ~path ~default =
    get_config_value ~category ~path ~default ~converter:to_int

  let get_string ~category ~path ~default =
    get_config_value ~category ~path ~default ~converter:to_string

  let get_bool ~category ~path ~default =
    get_config_value ~category ~path ~default ~converter:to_bool

  (* Convenience functions for common patterns *)
  module Timeouts = struct
    let get_ton_client_timeout () =
      get_int ~category:"timeouts" ~path:["ton_client"; "request_timeout_seconds"] ~default:30

    let get_http_timeout () =
      get_float ~category:"timeouts" ~path:["http_client"; "default_timeout_seconds"] ~default:10.0

    let get_oracle_update_interval () =
      get_float ~category:"timeouts" ~path:["oracle"; "update_interval_seconds"] ~default:60.0

    let get_daemon_interval name =
      get_float ~category:"timeouts" ~path:["daemon"; name ^ "_interval_seconds"] ~default:60.0

    let get_max_staleness () =
      get_int ~category:"timeouts" ~path:["oracle"; "max_staleness_seconds"] ~default:300
  end

  module Gas = struct
    let get_operation_gas operation_type =
      let path = ["contract_operations"; operation_type; "amount_nanoton"] in
      get_int ~category:"gas" ~path ~default:50000000

    let get_min_operational_balance () =
      get_int ~category:"gas" ~path:["base_amounts_nanoton"; "min_operational_balance"] ~default:100000000

    let get_policy_factory_gas () =
      get_int ~category:"gas" ~path:["policy_factory"; "minimum_premium_gas"] ~default:50000000

    let get_vault_gas operation =
      let path = ["multi_tranche_vault"; operation ^ "_gas"] in
      get_int ~category:"gas" ~path ~default:100000000

    let get_environment_multiplier () =
      let env_str = environment_to_string !current_environment in
      get_float ~category:"gas" ~path:["environment_multipliers"; env_str] ~default:1.0
  end

  module Retry = struct
    let get_max_attempts service =
      get_int ~category:"retry" ~path:[service; "retry_attempts"] ~default:3

    let get_backoff_delays service =
      let* () = ensure_config_loaded () in
      match !cached_config with
      | None -> Lwt.return [1.0; 2.0; 4.0]
      | Some cache ->
          (match get_json_path cache.retry [service; "retry_delays_seconds"] with
           | Some (`List delays) ->
               let float_delays = List.filter_map delays ~f:to_float in
               Lwt.return (if List.is_empty float_delays then [1.0; 2.0; 4.0] else float_delays)
           | _ -> Lwt.return [1.0; 2.0; 4.0])

    let get_circuit_breaker_threshold () =
      get_int ~category:"retry" ~path:["circuit_breaker"; "failure_threshold"] ~default:5
  end

  module Pools = struct
    let get_database_pool_size () =
      get_int ~category:"pools" ~path:["database"; "default_pool_size"] ~default:10

    let get_redis_host () =
      get_string ~category:"pools" ~path:["redis"; "host"] ~default:"127.0.0.1"

    let get_redis_port () =
      get_int ~category:"pools" ~path:["redis"; "port"] ~default:6379

    let get_worker_threads () =
      get_int ~category:"pools" ~path:["worker_threads"; "default_workers"] ~default:4

    let get_rate_limit_per_minute () =
      get_int ~category:"pools" ~path:["rate_limits"; "requests_per_minute_per_ip"] ~default:100

    let get_max_concurrent_requests () =
      get_int ~category:"pools" ~path:["http_client"; "max_concurrent_requests"] ~default:100
  end

  module Thresholds = struct
    let get_circuit_breaker_price_change_max () =
      get_float ~category:"thresholds" ~path:["circuit_breaker"; "price_change_max_percent"] ~default:50.0

    let get_utilization_threshold level =
      let key = Printf.sprintf "utilization_%s_percent" level in
      get_float ~category:"thresholds" ~path:["risk_management"; key] ~default:90.0

    let get_oracle_staleness_critical () =
      get_int ~category:"thresholds" ~path:["oracle_monitoring"; "staleness_critical_seconds"] ~default:300

    let get_min_reserve_balance () =
      get_int ~category:"thresholds" ~path:["treasury_management"; "min_reserve_balance_ton"] ~default:1000

    let get_vault_lock_timeout () =
      get_int ~category:"thresholds" ~path:["vault_operations"; "lock_timeout_seconds"] ~default:60
  end

  (* Validation *)
  let validate_config () =
    let* () = ensure_config_loaded () in

    let* ton_timeout = Timeouts.get_ton_client_timeout () in
    let* gas_min = Gas.get_min_operational_balance () in
    let* retry_attempts = Retry.get_max_attempts "http_client" in
    let* pool_size = Pools.get_database_pool_size () in
    let* staleness = Thresholds.get_oracle_staleness_critical () in

    (* Validate ranges *)
    let valid =
      ton_timeout > 0 && ton_timeout <= 120 &&
      gas_min >= 10000000 && gas_min <= 1000000000 &&
      retry_attempts >= 1 && retry_attempts <= 10 &&
      pool_size >= 1 && pool_size <= 100 &&
      staleness >= 60 && staleness <= 3600
    in

    if valid then begin
      Logs.info (fun m -> m "Configuration validation passed");
      Lwt.return (Ok ())
    end else begin
      Logs.err (fun m -> m "Configuration validation failed");
      Lwt.return (Error "Invalid configuration values")
    end

  (* Get configuration summary for monitoring *)
  let get_config_summary () =
    let* () = ensure_config_loaded () in

    match !cached_config with
    | None -> Lwt.return (`Assoc [("error", `String "Config not loaded")])
    | Some cache ->
        Lwt.return (`Assoc [
          ("environment", `String (environment_to_string !current_environment));
          ("loaded_at", `Float cache.loaded_at);
          ("uptime_seconds", `Float ((Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) -. cache.loaded_at));
          ("config_files", `List [
            `String "timeouts.json";
            `String "gas_config.json";
            `String "retry_policies.json";
            `String "pool_sizes.json";
            `String "thresholds.json";
            `String (environment_to_string !current_environment ^ ".json");
          ]);
        ])

end

(* Export for easy access *)
include ConfigManager
