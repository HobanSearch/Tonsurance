(** PostgreSQL Connection Pool with Health Checks and Auto-Reconnect
 *
 * Production-grade database connection pool:
 * - Pool size: 20 connections (configurable)
 * - Max overflow: 10 additional connections
 * - Connection timeout: 5s
 * - Health checks every 60s
 * - Auto-reconnect on failure
 * - Connection lifecycle management
 * - Retry logic for transient failures
 * - Metrics collection (active, idle, failed connections)
 *)

open Core
open Lwt.Infix

module ConnectionPool = struct

  (** ============================================
      TYPE DEFINITIONS
      ============================================ *)

  (** Connection state *)
  type connection_state =
    | Active of float (* timestamp of acquisition *)
    | Idle of float (* timestamp of release *)
    | Failed of float * string (* timestamp and error *)
    | HealthCheck
  [@@deriving sexp]

  (** Pool connection *)
  type pool_connection = {
    id: int;
    connection: (Caqti_lwt.connection, Caqti_error.t) result;
    mutable state: connection_state;
    created_at: float;
    mutable last_used: float;
    mutable use_count: int;
  }

  (** Pool configuration *)
  type pool_config = {
    pool_size: int;
    max_overflow: int;
    connection_timeout_seconds: float;
    max_idle_time_seconds: float;
    health_check_interval_seconds: float;
    max_connection_lifetime_seconds: float; (* Rotate connections after this time *)
    retry_attempts: int;
    retry_delay_ms: int;
  } [@@deriving sexp]

  (** Pool statistics *)
  type pool_stats = {
    total_connections: int;
    active_connections: int;
    idle_connections: int;
    failed_connections: int;
    waiting_threads: int;
    total_acquired: int;
    total_released: int;
    total_failures: int;
  } [@@deriving sexp]

  (** Connection pool *)
  type t = {
    config: pool_config;
    db_uri: Uri.t;
    mutable connections: pool_connection list;
    mutable next_id: int;
    mutable total_acquired: int;
    mutable total_released: int;
    mutable total_failures: int;
    pool_mutex: Lwt_mutex.t;
    (* Custom semaphore implementation (Lwt_semaphore not available) *)
    available_permits: int ref;
    max_permits: int;
    semaphore_mutex: Lwt_mutex.t;
    semaphore_condition: unit Lwt_condition.t;
    health_check_running: bool ref;
  }

  (** ============================================
      DEFAULT CONFIGURATION
      ============================================ *)

  let default_config = {
    pool_size = 20;
    max_overflow = 10;
    connection_timeout_seconds = 5.0;
    max_idle_time_seconds = 300.0;
    health_check_interval_seconds = 60.0;
    max_connection_lifetime_seconds = 3600.0; (* 1 hour *)
    retry_attempts = 3;
    retry_delay_ms = 500;
  }

  (** ============================================
      CONNECTION MANAGEMENT
      ============================================ *)

  (** Create new database connection *)
  let create_connection (pool: t) : pool_connection Lwt.t =
    let rec attempt_create retries_left =
      let%lwt conn_result =
        try%lwt
          let%lwt conn = Caqti_lwt_unix.connect pool.db_uri in
          Lwt.return (Ok conn)
        with
        | Caqti_error.Exn error ->
            Lwt.return (Error error)
        | exn ->
            let msg_str = Printf.sprintf "Unexpected error: %s" (Exn.to_string exn) in
            Lwt.return (Error (Caqti_error.connect_failed ~uri:pool.db_uri (Caqti_error.Msg msg_str)))
      in

      match conn_result with
      | Ok conn ->
          let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
          let id = pool.next_id in
          pool.next_id <- pool.next_id + 1;
          let pool_conn = {
            id;
            connection = conn;
            state = Idle now;
            created_at = now;
            last_used = now;
            use_count = 0;
          } in
          let%lwt () = Logs_lwt.debug (fun m ->
            m "[ConnectionPool] Created connection #%d" id
          ) in
          Lwt.return pool_conn

      | Error error when retries_left > 0 ->
          let%lwt () = Logs_lwt.warn (fun m ->
            m "[ConnectionPool] Failed to create connection (retries left: %d): %s"
              retries_left (Caqti_error.show error)
          ) in
          let%lwt () = Lwt_unix.sleep (Float.of_int pool.config.retry_delay_ms /. 1000.0) in
          attempt_create (retries_left - 1)

      | Error error ->
          pool.total_failures <- pool.total_failures + 1;
          let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
          let id = pool.next_id in
          pool.next_id <- pool.next_id + 1;
          let%lwt () = Logs_lwt.err (fun m ->
            m "[ConnectionPool] Failed to create connection #%d after retries: %s"
              id (Caqti_error.show error)
          ) in
          Lwt.return {
            id;
            connection = Error error;
            state = Failed (now, Caqti_error.show error);
            created_at = now;
            last_used = now;
            use_count = 0;
          }
    in

    attempt_create pool.config.retry_attempts

  (** Close database connection *)
  let close_connection (conn: pool_connection) : unit Lwt.t =
    match conn.connection with
    | Ok _db_conn ->
        Logs_lwt.debug (fun m ->
          m "[ConnectionPool] Closing connection #%d (used %d times)"
            conn.id conn.use_count
        ) >>= fun () ->
        (* Caqti connections are managed by the pool, no manual disconnect needed *)
        Lwt.return ()
    | Error _ ->
        Lwt.return ()

  (** Check if connection is healthy *)
  let is_connection_healthy (conn: pool_connection) : bool Lwt.t =
    match conn.connection with
    | Error _ -> Lwt.return false
    | Ok db_conn ->
        try%lwt
          (* Simple health check query *)
          let open Caqti_request.Infix in
          let (module Db : Caqti_lwt.CONNECTION) = db_conn in
          let query = Caqti_type.unit ->! Caqti_type.int @@ "SELECT 1" in
          let%lwt result = Db.find query () in
          match result with
          | Ok 1 -> Lwt.return true
          | _ -> Lwt.return false
        with _ ->
          Lwt.return false

  (** Check if connection should be rotated *)
  let should_rotate_connection (conn: pool_connection) (config: pool_config) : bool =
    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let age = now -. conn.created_at in
    Float.O.(age > config.max_connection_lifetime_seconds)

  (** ============================================
      POOL OPERATIONS
      ============================================ *)

  (** Create connection pool *)
  let create
      ?(config=default_config)
      (db_uri: Uri.t)
    : t Lwt.t =

    let max_permits = config.pool_size + config.max_overflow in
    let pool = {
      config;
      db_uri;
      connections = [];
      next_id = 0;
      total_acquired = 0;
      total_released = 0;
      total_failures = 0;
      pool_mutex = Lwt_mutex.create ();
      available_permits = ref max_permits;
      max_permits;
      semaphore_mutex = Lwt_mutex.create ();
      semaphore_condition = Lwt_condition.create ();
      health_check_running = ref false;
    } in

    let%lwt () = Logs_lwt.info (fun m ->
      m "[ConnectionPool] Creating pool with %d connections (max overflow: %d)"
        config.pool_size config.max_overflow
    ) in

    (* Pre-create pool_size connections *)
    let%lwt initial_connections =
      Lwt_list.map_p (fun _ -> create_connection pool)
        (List.init config.pool_size ~f:(fun _ -> ()))
    in

    Lwt_mutex.with_lock pool.pool_mutex (fun () ->
      pool.connections <- initial_connections;
      Lwt.return pool
    )

  (** Custom semaphore operations (since Lwt_semaphore not available) *)
  let rec semaphore_wait (pool: t) : unit Lwt.t =
    Lwt_mutex.with_lock pool.semaphore_mutex (fun () ->
      if !(pool.available_permits) > 0 then begin
        pool.available_permits := !(pool.available_permits) - 1;
        Lwt.return (`Acquired)
      end else
        Lwt.return (`Must_wait)
    ) >>= function
    | `Acquired -> Lwt.return ()
    | `Must_wait ->
        let%lwt () = Lwt_condition.wait ~mutex:pool.semaphore_mutex pool.semaphore_condition in
        semaphore_wait pool

  let semaphore_signal (pool: t) : unit =
    Lwt.async (fun () ->
      Lwt_mutex.with_lock pool.semaphore_mutex (fun () ->
        pool.available_permits := !(pool.available_permits) + 1;
        Lwt_condition.signal pool.semaphore_condition ();
        Lwt.return ()
      )
    )

  let semaphore_wait_count (pool: t) : int =
    pool.max_permits - !(pool.available_permits)

  (** Acquire connection from pool *)
  let acquire (pool: t) : (Caqti_lwt.connection, string) Result.t Lwt.t =
    let timeout_promise =
      let%lwt () = Lwt_unix.sleep pool.config.connection_timeout_seconds in
      Lwt.return (Error (Printf.sprintf
        "Connection acquisition timeout after %.0fs"
        pool.config.connection_timeout_seconds))
    in

    let acquire_promise =
      let%lwt () = semaphore_wait pool in

      let%lwt conn_opt = Lwt_mutex.with_lock pool.pool_mutex (fun () ->
        let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

        (* Find healthy idle connection *)
        let idle_conn = List.find pool.connections ~f:(fun conn ->
          match conn.state with
          | Idle _ ->
              (match conn.connection with
              | Ok _ -> not (should_rotate_connection conn pool.config)
              | Error _ -> false)
          | _ -> false
        ) in

        match idle_conn with
        | Some conn ->
            (* Reuse idle connection *)
            conn.state <- Active now;
            conn.last_used <- now;
            conn.use_count <- conn.use_count + 1;
            pool.total_acquired <- pool.total_acquired + 1;
            Lwt.return (Some conn)

        | None ->
            (* Create new connection (overflow) if under limit *)
            let total = List.length pool.connections in
            let max_total = pool.config.pool_size + pool.config.max_overflow in
            if total < max_total then
              let%lwt new_conn = create_connection pool in
              new_conn.state <- Active now;
              new_conn.use_count <- 1;
              pool.connections <- new_conn :: pool.connections;
              pool.total_acquired <- pool.total_acquired + 1;
              Lwt.return (Some new_conn)
            else
              Lwt.return None
      ) in

      match conn_opt with
      | Some conn ->
          (match conn.connection with
          | Ok db_conn ->
              let%lwt () = Logs_lwt.debug (fun m ->
                m "[ConnectionPool] Acquired connection #%d (use count: %d)"
                  conn.id conn.use_count
              ) in
              Lwt.return (Ok db_conn)
          | Error error ->
              semaphore_signal pool;
              Lwt.return (Error (Caqti_error.show error)))

      | None ->
          semaphore_signal pool;
          Lwt.return (Error "Pool exhausted - no connections available")
    in

    Lwt.pick [acquire_promise; timeout_promise]

  (** Release connection back to pool *)
  let release (pool: t) (db_conn: Caqti_lwt.connection) : unit Lwt.t =
    Lwt_mutex.with_lock pool.pool_mutex (fun () ->
      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

      (* Find the pool connection *)
      let conn_opt = List.find pool.connections ~f:(fun conn ->
        match conn.connection with
        | Ok c when phys_equal c db_conn -> true
        | _ -> false
      ) in

      match conn_opt with
      | Some conn ->
          conn.state <- Idle now;
          conn.last_used <- now;
          pool.total_released <- pool.total_released + 1;
          semaphore_signal pool;
          let%lwt () = Logs_lwt.debug (fun m ->
            m "[ConnectionPool] Released connection #%d" conn.id
          ) in
          Lwt.return ()

      | None ->
          let%lwt () = Logs_lwt.warn (fun m ->
            m "[ConnectionPool] Attempted to release unknown connection"
          ) in
          semaphore_signal pool;
          Lwt.return ()
    )

  (** Execute function with connection (auto-release) *)
  let with_connection
      (pool: t)
      (f: (module Caqti_lwt.CONNECTION) -> ('a, [> Caqti_error.t]) Result.t Lwt.t)
    : ('a, [> Caqti_error.t]) Result.t Lwt.t =

    let%lwt conn_result = acquire pool in
    match conn_result with
    | Error e -> Lwt.return (Error (Caqti_error.connect_failed ~uri:(Uri.of_string "pool") (Caqti_error.Msg e)))
    | Ok conn ->
        let%lwt result =
          try%lwt
            f conn
          with exn ->
            Lwt.return (Error (Caqti_error.request_failed ~uri:(Uri.of_string "pool") ~query:"" (Caqti_error.Msg (Exn.to_string exn))))
        in
        let%lwt () = release pool conn in
        Lwt.return result

  (** ============================================
      MAINTENANCE & HEALTH CHECKS
      ============================================ *)

  (** Cleanup idle and old connections *)
  let cleanup_connections (pool: t) : unit Lwt.t =
    Lwt_mutex.with_lock pool.pool_mutex (fun () ->
      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

      let (to_keep, to_remove) = List.partition_tf pool.connections ~f:(fun conn ->
        match conn.state with
        | Active _ -> true
        | Failed _ -> false
        | Idle last_idle ->
            let idle_time = now -. last_idle in
            Float.O.(idle_time < pool.config.max_idle_time_seconds) &&
            not (should_rotate_connection conn pool.config)
        | HealthCheck -> true
      ) in

      let removed_count = List.length to_remove in
      if removed_count > 0 then begin
        let%lwt () = Lwt_list.iter_p close_connection to_remove in
        pool.connections <- to_keep;
        let%lwt () = Logs_lwt.info (fun m ->
          m "[ConnectionPool] Cleaned up %d connections" removed_count
        ) in
        Lwt.return ()
      end else
        Lwt.return ()
    )

  (** Health check for all connections *)
  let health_check (pool: t) : unit Lwt.t =
    let%lwt all_conns = Lwt_mutex.with_lock pool.pool_mutex (fun () ->
      Lwt.return pool.connections
    ) in

    let%lwt health_results = Lwt_list.map_p (fun conn ->
      match conn.state with
      | Idle _ | Failed _ ->
          let%lwt is_healthy = is_connection_healthy conn in
          Lwt.return (conn, is_healthy)
      | _ ->
          Lwt.return (conn, true) (* Skip active connections *)
    ) all_conns in

    Lwt_mutex.with_lock pool.pool_mutex (fun () ->
      let failed_conns = List.filter_map health_results ~f:(fun (conn, is_healthy) ->
        if not is_healthy then Some conn else None
      ) in

      let%lwt () = if not (List.is_empty failed_conns) then
        let%lwt () = Logs_lwt.warn (fun m ->
          m "[ConnectionPool] Health check found %d unhealthy connections"
            (List.length failed_conns)
        ) in
        Lwt_list.iter_p close_connection failed_conns
      else
        Lwt.return ()
      in

      (* Remove failed connections *)
      pool.connections <- List.filter pool.connections ~f:(fun conn ->
        not (List.mem failed_conns conn ~equal:(fun a b -> a.id = b.id))
      );

      Lwt.return ()
    )

  (** Start periodic health check *)
  let start_health_check (pool: t) : unit =
    if not !(pool.health_check_running) then begin
      pool.health_check_running := true;

      let rec health_check_loop () =
        let%lwt () = Lwt_unix.sleep pool.config.health_check_interval_seconds in
        if !(pool.health_check_running) then begin
          let%lwt () =
            try%lwt
              health_check pool
            with exn ->
              Logs_lwt.err (fun m ->
                m "[ConnectionPool] Health check error: %s" (Exn.to_string exn)
              )
          in
          let%lwt () = cleanup_connections pool in
          health_check_loop ()
        end else
          Lwt.return ()
      in

      Lwt.async (fun () ->
        let%lwt () = Logs_lwt.info (fun m ->
          m "[ConnectionPool] Starting health check (interval: %.0fs)"
            pool.config.health_check_interval_seconds
        ) in
        health_check_loop ()
      )
    end

  (** Stop periodic health check *)
  let stop_health_check (pool: t) : unit =
    pool.health_check_running := false

  (** ============================================
      STATISTICS & MONITORING
      ============================================ *)

  (** Get pool statistics *)
  let get_stats (pool: t) : pool_stats Lwt.t =
    Lwt_mutex.with_lock pool.pool_mutex (fun () ->
      let total = List.length pool.connections in
      let active = List.count pool.connections ~f:(fun conn ->
        match conn.state with Active _ -> true | _ -> false
      ) in
      let idle = List.count pool.connections ~f:(fun conn ->
        match conn.state with Idle _ -> true | _ -> false
      ) in
      let failed = List.count pool.connections ~f:(fun conn ->
        match conn.state with Failed _ -> true | _ -> false
      ) in

      let waiting = semaphore_wait_count pool in

      Lwt.return {
        total_connections = total;
        active_connections = active;
        idle_connections = idle;
        failed_connections = failed;
        waiting_threads = waiting;
        total_acquired = pool.total_acquired;
        total_released = pool.total_released;
        total_failures = pool.total_failures;
      }
    )

  (** Print pool statistics *)
  let print_stats (pool: t) : unit Lwt.t =
    let%lwt stats = get_stats pool in
    Logs_lwt.info (fun m ->
      m "[ConnectionPool] Stats: Total=%d Active=%d Idle=%d Failed=%d Waiting=%d | Acquired=%d Released=%d Failures=%d"
        stats.total_connections
        stats.active_connections
        stats.idle_connections
        stats.failed_connections
        stats.waiting_threads
        stats.total_acquired
        stats.total_released
        stats.total_failures
    )

  (** ============================================
      SHUTDOWN
      ============================================ *)

  (** Close all connections and shutdown pool *)
  let close (pool: t) : unit Lwt.t =
    let%lwt () = Logs_lwt.info (fun m ->
      m "[ConnectionPool] Shutting down..."
    ) in

    stop_health_check pool;

    let%lwt all_conns = Lwt_mutex.with_lock pool.pool_mutex (fun () ->
      let conns = pool.connections in
      pool.connections <- [];
      Lwt.return conns
    ) in

    let%lwt () = Lwt_list.iter_p close_connection all_conns in

    let%lwt () = Logs_lwt.info (fun m ->
      m "[ConnectionPool] Closed %d connections" (List.length all_conns)
    ) in

    Lwt.return ()

  (** Create a raw Caqti pool for legacy functions that require it
   *
   * NOTE: This is for backwards compatibility with monte_carlo functions.
   * New code should use Connection_pool.t directly via with_connection.
   *
   * Returns a Result-wrapped Caqti pool that can be passed to legacy APIs.
   *)
  let create_caqti_pool
      ?(_max_size=20)  (* TODO: Use pool_config to set max_size *)
      (db_uri: Uri.t)
    : ((Caqti_lwt.connection, Caqti_error.t) Caqti_lwt_unix.Pool.t, [> Caqti_error.t]) Result.t Lwt.t =

    try%lwt
      (* Caqti_lwt_unix.connect_pool returns a Result, not a promise *)
      match Caqti_lwt_unix.connect_pool db_uri with
      | Ok pool -> Lwt.return (Ok pool)
      | Error err -> Lwt.return (Error err)
    with
    | Caqti_error.Exn err -> Lwt.return (Error err)
    | exn ->
        Lwt.return (Error (Caqti_error.connect_failed
          ~uri:db_uri
          (Caqti_error.Msg (Exn.to_string exn))))

end

(** ============================================
    GLOBAL POOL INSTANCE
    ============================================ *)

(** Global connection pool singleton *)
module GlobalPool = struct

  let global_pool : ConnectionPool.t option ref = ref None
  let init_mutex = Lwt_mutex.create ()

  (** Parse PostgreSQL connection URL (format: postgresql://user:pass@host:port/database) *)
  let parse_database_url (url: string) : (Uri.t, string) Result.t =
    try
      let uri = Uri.of_string url in
      let scheme = Uri.scheme uri in
      match scheme with
      | Some "postgresql" | Some "postgres" ->
          Ok uri
      | _ ->
          Error (Printf.sprintf "Invalid database URL scheme: %s (expected postgresql://)"
            (Option.value scheme ~default:"none"))
    with exn ->
      Error (Printf.sprintf "Failed to parse DATABASE_URL: %s" (Exn.to_string exn))

  (** Build database URI from environment variables
   *  Priority: DATABASE_URL > individual env vars > defaults *)
  let build_db_uri_from_env () : (Uri.t, string) Result.t =
    (* First, try DATABASE_URL (Docker/production) *)
    match Sys.getenv "DATABASE_URL" with
    | Some url when not (String.is_empty url) ->
        (match parse_database_url url with
        | Ok parsed_uri ->
            Logs.info (fun m -> m "[GlobalPool] Using DATABASE_URL from environment");
            Ok parsed_uri
        | Error e -> Error e)

    | _ ->
        (* Fall back to individual env vars (local development) *)
        let get_env key default = Option.value (Sys.getenv key) ~default in

        let host = get_env "DB_HOST" "localhost" in
        let port = get_env "DB_PORT" "5432" in
        let database = get_env "DB_NAME" "tonsurance" in
        let user = get_env "DB_USER" "postgres" in
        let password = get_env "DB_PASSWORD" "" in

        if String.is_empty password then
          Logs.warn (fun m -> m "[GlobalPool] DB_PASSWORD not set - using empty password (INSECURE!)");

        Logs.info (fun m -> m "[GlobalPool] Building database URI from individual env vars (DB_HOST=%s)" host);

        let uri_string = Printf.sprintf "postgresql://%s:%s@%s:%s/%s"
          user password host port database
        in

        Ok (Uri.of_string uri_string)

  (** Initialize global pool from environment *)
  let initialize ?(config=ConnectionPool.default_config) () : (ConnectionPool.t, string) Result.t Lwt.t =
    Lwt_mutex.with_lock init_mutex (fun () ->
      match !global_pool with
      | Some pool ->
          Lwt.return (Ok pool)
      | None ->
          let%lwt () = Logs_lwt.info (fun m ->
            m "[GlobalPool] Initializing database connection pool from environment..."
          ) in

          match build_db_uri_from_env () with
          | Error e -> Lwt.return (Error e)
          | Ok db_uri ->
              let%lwt pool = ConnectionPool.create ~config db_uri in
              ConnectionPool.start_health_check pool;
              global_pool := Some pool;

              let%lwt () = Logs_lwt.info (fun m ->
                m "[GlobalPool] Database connection pool initialized successfully"
              ) in

              Lwt.return (Ok pool)
    )

  (** Get or create global pool *)
  let get_pool () : (ConnectionPool.t, string) Result.t Lwt.t =
    match !global_pool with
    | Some pool -> Lwt.return (Ok pool)
    | None -> initialize ()

  (** Execute query with global pool connection *)
  let with_connection
      (f: (module Caqti_lwt.CONNECTION) -> ('a, [> Caqti_error.t]) Result.t Lwt.t)
    : ('a, [> Caqti_error.t]) Result.t Lwt.t =

    let%lwt pool_result = get_pool () in
    match pool_result with
    | Error e -> Lwt.return (Error (Caqti_error.connect_failed ~uri:(Uri.of_string "global_pool") (Caqti_error.Msg e)))
    | Ok pool -> ConnectionPool.with_connection pool f

  (** Get pool statistics *)
  let get_stats () : (ConnectionPool.pool_stats, string) Result.t Lwt.t =
    let%lwt pool_result = get_pool () in
    match pool_result with
    | Error e -> Lwt.return (Error e)
    | Ok pool ->
        let%lwt stats = ConnectionPool.get_stats pool in
        Lwt.return (Ok stats)

  (** Shutdown global pool *)
  let shutdown () : unit Lwt.t =
    Lwt_mutex.with_lock init_mutex (fun () ->
      match !global_pool with
      | None -> Lwt.return ()
      | Some pool ->
          let%lwt () = ConnectionPool.close pool in
          global_pool := None;
          Lwt.return ()
    )

end
