(* Configuration Loader - Database-Backed Configuration with Hot-Reload

   This module provides:
   - Database-backed configuration storage
   - In-memory caching with TTL
   - Automatic hot-reload every 60 seconds
   - Fallback to defaults if DB unavailable
   - Atomic cache updates
   - Type-safe config access
*)

open Core
open Lwt.Syntax
open Lwt.Infix

module ConfigLoader = struct

  (* Cache entry with TTL *)
  type cache_entry = {
    value: Yojson.Safe.t;
    cached_at: float;
    ttl_seconds: int;
  }

  (* In-memory cache *)
  let cache : (string * string, cache_entry) Hashtbl.t = Hashtbl.create (module Tuple2(String)(String))

  (* Cache configuration *)
  let default_ttl = 60  (* 60 seconds *)
  let auto_reload_interval = 60  (* 60 seconds *)

  (* Database connection pool *)
  let db_pool : Postgresql.connection option ref = ref None

  (* Auto-reload background thread *)
  let reload_thread : unit Lwt.t option ref = ref None

  (** Initialize database connection pool *)
  let init_db_pool ~host ~port ~database ~user ~password () =
    try
      let conninfo = Printf.sprintf
        "host=%s port=%d dbname=%s user=%s password=%s"
        host port database user password
      in
      let conn = new Postgresql.connection ~conninfo () in
      db_pool := Some conn;
      Lwt.return_unit
    with exn ->
      Logs.err (fun m -> m "Failed to initialize database connection: %s" (Exn.to_string exn));
      Lwt.return_unit

  (** Check if cache entry is still valid *)
  let is_cache_valid entry =
    let now = Unix.gettimeofday () in
    (now -. entry.cached_at) < Float.of_int entry.ttl_seconds

  (** Get value from cache *)
  let get_from_cache ~category ~key =
    match Hashtbl.find cache (category, key) with
    | Some entry when is_cache_valid entry -> Some entry.value
    | _ -> None

  (** Store value in cache *)
  let store_in_cache ~category ~key ~value =
    let entry = {
      value;
      cached_at = Unix.gettimeofday ();
      ttl_seconds = default_ttl;
    } in
    Hashtbl.set cache ~key:(category, key) ~data:entry

  (** Query database for config value *)
  let query_db ~category ~key =
    match !db_pool with
    | None ->
        Logs.warn (fun m -> m "Database pool not initialized");
        Lwt.return_none
    | Some conn ->
        try
          let query = Printf.sprintf
            "SELECT value_data FROM config_parameters WHERE category = '%s' AND key = '%s'"
            (Postgresql.escape_string category)
            (Postgresql.escape_string key)
          in
          let result = conn#exec query in

          match result#status with
          | Postgresql.Tuples_ok ->
              if result#ntuples > 0 then
                let json_str = result#getvalue 0 0 in
                let json_value = Yojson.Safe.from_string json_str in
                Lwt.return_some json_value
              else
                Lwt.return_none
          | _ ->
              Logs.warn (fun m -> m "Database query failed for %s.%s" category key);
              Lwt.return_none
        with exn ->
          Logs.err (fun m -> m "Database error: %s" (Exn.to_string exn));
          Lwt.return_none

  (** Parse JSON value as float *)
  let json_to_float json =
    match json with
    | `Float f -> Some f
    | `Int i -> Some (Float.of_int i)
    | `String s -> Float.of_string_opt s
    | _ -> None

  (** Parse JSON value as int *)
  let json_to_int json =
    match json with
    | `Int i -> Some i
    | `Float f -> Some (Float.to_int f)
    | `String s -> Int.of_string_opt s
    | _ -> None

  (** Parse JSON value as string *)
  let json_to_string json =
    match json with
    | `String s -> Some s
    | _ -> None

  (** Get float configuration value *)
  let get_float ~category ~key ~default =
    (* Try cache first *)
    match get_from_cache ~category ~key with
    | Some cached_json ->
        (match json_to_float cached_json with
         | Some f -> Lwt.return f
         | None ->
             Logs.warn (fun m -> m "Invalid float value in cache for %s.%s, using default" category key);
             Lwt.return default)
    | None ->
        (* Query database *)
        let* db_result = query_db ~category ~key in
        match db_result with
        | Some json_value ->
            store_in_cache ~category ~key ~value:json_value;
            (match json_to_float json_value with
             | Some f -> Lwt.return f
             | None ->
                 Logs.warn (fun m -> m "Invalid float value from DB for %s.%s, using default" category key);
                 Lwt.return default)
        | None ->
            Logs.debug (fun m -> m "Config %s.%s not found in DB, using default" category key);
            Lwt.return default

  (** Get int configuration value *)
  let get_int ~category ~key ~default =
    match get_from_cache ~category ~key with
    | Some cached_json ->
        (match json_to_int cached_json with
         | Some i -> Lwt.return i
         | None ->
             Logs.warn (fun m -> m "Invalid int value in cache for %s.%s, using default" category key);
             Lwt.return default)
    | None ->
        let* db_result = query_db ~category ~key in
        match db_result with
        | Some json_value ->
            store_in_cache ~category ~key ~value:json_value;
            (match json_to_int json_value with
             | Some i -> Lwt.return i
             | None ->
                 Logs.warn (fun m -> m "Invalid int value from DB for %s.%s, using default" category key);
                 Lwt.return default)
        | None ->
            Logs.debug (fun m -> m "Config %s.%s not found in DB, using default" category key);
            Lwt.return default

  (** Get string configuration value *)
  let get_string ~category ~key ~default =
    match get_from_cache ~category ~key with
    | Some cached_json ->
        (match json_to_string cached_json with
         | Some s -> Lwt.return s
         | None ->
             Logs.warn (fun m -> m "Invalid string value in cache for %s.%s, using default" category key);
             Lwt.return default)
    | None ->
        let* db_result = query_db ~category ~key in
        match db_result with
        | Some json_value ->
            store_in_cache ~category ~key ~value:json_value;
            (match json_to_string json_value with
             | Some s -> Lwt.return s
             | None ->
                 Logs.warn (fun m -> m "Invalid string value from DB for %s.%s, using default" category key);
                 Lwt.return default)
        | None ->
            Logs.debug (fun m -> m "Config %s.%s not found in DB, using default" category key);
            Lwt.return default

  (** Get JSON configuration value *)
  let get_json ~category ~key ~default =
    match get_from_cache ~category ~key with
    | Some cached_json ->
        Lwt.return cached_json
    | None ->
        let* db_result = query_db ~category ~key in
        match db_result with
        | Some json_value ->
            store_in_cache ~category ~key ~value:json_value;
            Lwt.return json_value
        | None ->
            Logs.debug (fun m -> m "Config %s.%s not found in DB, using default" category key);
            Lwt.return default

  (** Reload all cached entries from database *)
  let reload_cache () =
    match !db_pool with
    | None ->
        Logs.warn (fun m -> m "Cannot reload cache: database pool not initialized");
        Lwt.return_unit
    | Some conn ->
        try
          let query = "SELECT category, key, value_data FROM config_parameters" in
          let result = conn#exec query in

          match result#status with
          | Postgresql.Tuples_ok ->
              (* Atomic update: build new cache first *)
              let new_cache = Hashtbl.create (module Tuple2(String)(String)) in

              for i = 0 to result#ntuples - 1 do
                let category = result#getvalue i 0 in
                let key = result#getvalue i 1 in
                let json_str = result#getvalue i 2 in
                let json_value = Yojson.Safe.from_string json_str in

                let entry = {
                  value = json_value;
                  cached_at = Unix.gettimeofday ();
                  ttl_seconds = default_ttl;
                } in

                Hashtbl.set new_cache ~key:(category, key) ~data:entry
              done;

              (* Atomic swap *)
              Hashtbl.clear cache;
              Hashtbl.iteri new_cache ~f:(fun ~key ~data ->
                Hashtbl.set cache ~key ~data
              );

              Logs.info (fun m -> m "Cache reloaded: %d parameters" (Hashtbl.length cache));
              Lwt.return_unit

          | _ ->
              Logs.err (fun m -> m "Failed to reload cache from database");
              Lwt.return_unit
        with exn ->
          Logs.err (fun m -> m "Cache reload error: %s" (Exn.to_string exn));
          Lwt.return_unit

  (** Auto-reload background thread *)
  let rec auto_reload_loop interval_seconds =
    let* () = Lwt_unix.sleep (Float.of_int interval_seconds) in
    let* () = reload_cache () in
    auto_reload_loop interval_seconds

  (** Start automatic cache reload *)
  let start_auto_reload ~interval_seconds =
    match !reload_thread with
    | Some _ ->
        Logs.warn (fun m -> m "Auto-reload already running")
    | None ->
        Logs.info (fun m -> m "Starting auto-reload every %d seconds" interval_seconds);
        reload_thread := Some (auto_reload_loop interval_seconds);
        ()

  (** Stop automatic cache reload *)
  let stop_auto_reload () =
    reload_thread := None;
    Logs.info (fun m -> m "Auto-reload stopped")

  (** Get cache statistics *)
  let get_cache_stats () =
    let total_entries = Hashtbl.length cache in
    let valid_entries = Hashtbl.fold cache ~init:0 ~f:(fun ~key:_ ~data acc ->
      if is_cache_valid data then acc + 1 else acc
    ) in
    let expired_entries = total_entries - valid_entries in

    `Assoc [
      ("total_entries", `Int total_entries);
      ("valid_entries", `Int valid_entries);
      ("expired_entries", `Int expired_entries);
      ("ttl_seconds", `Int default_ttl);
    ]

  (** Clear entire cache (for testing) *)
  let clear_cache () =
    Hashtbl.clear cache;
    Logs.info (fun m -> m "Cache cleared")

end

(** Convenience functions for common config patterns *)
module Helpers = struct
  open ConfigLoader

  (** Get base rate for an asset *)
  let get_base_rate asset =
    let asset_str = Types.asset_to_string asset in
    let key = Printf.sprintf "base_rate_%s" asset_str in
    get_float ~category:"pricing" ~key ~default:0.10

  (** Get risk weight *)
  let get_risk_weight weight_name =
    let key = Printf.sprintf "risk_weight_%s" weight_name in
    get_float ~category:"pricing" ~key ~default:0.0

  (** Get utilization multiplier for given ratio *)
  let get_utilization_multiplier ratio =
    let open Lwt.Syntax in
    let* tier1_threshold = get_float ~category:"pricing" ~key:"utilization_tier1_threshold" ~default:0.90 in
    let* tier2_threshold = get_float ~category:"pricing" ~key:"utilization_tier2_threshold" ~default:0.75 in
    let* tier3_threshold = get_float ~category:"pricing" ~key:"utilization_tier3_threshold" ~default:0.50 in

    if ratio > tier1_threshold then
      get_float ~category:"pricing" ~key:"utilization_tier1_multiplier" ~default:1.50
    else if ratio > tier2_threshold then
      get_float ~category:"pricing" ~key:"utilization_tier2_multiplier" ~default:1.25
    else if ratio > tier3_threshold then
      get_float ~category:"pricing" ~key:"utilization_tier3_multiplier" ~default:1.10
    else
      Lwt.return 1.0

  (** Get size discount multiplier for coverage amount *)
  let get_size_discount coverage_usd =
    let open Lwt.Syntax in
    let* tier1_threshold = get_float ~category:"pricing" ~key:"size_discount_tier1_threshold" ~default:10_000_000.0 in
    let* tier2_threshold = get_float ~category:"pricing" ~key:"size_discount_tier2_threshold" ~default:1_000_000.0 in
    let* tier3_threshold = get_float ~category:"pricing" ~key:"size_discount_tier3_threshold" ~default:100_000.0 in

    if coverage_usd >= tier1_threshold then
      get_float ~category:"pricing" ~key:"size_discount_tier1_multiplier" ~default:0.80
    else if coverage_usd >= tier2_threshold then
      get_float ~category:"pricing" ~key:"size_discount_tier2_multiplier" ~default:0.90
    else if coverage_usd >= tier3_threshold then
      get_float ~category:"pricing" ~key:"size_discount_tier3_multiplier" ~default:0.95
    else
      Lwt.return 1.0

end
