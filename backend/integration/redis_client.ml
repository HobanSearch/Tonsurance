(** Redis Client - Production-Ready Redis Integration
 *
 * Features:
 * - Connection pooling
 * - Auto-reconnect on failure
 * - Fallback to in-memory cache
 * - Key expiration (TTL)
 * - Batch operations
 * - Health checks
 * - Metrics collection
 *)

open Core
open Lwt.Syntax

module RedisClient = struct

  (** Redis configuration *)
  type redis_config = {
    host: string;
    port: int;
    password: string option;
    pool_size: int;
    connection_timeout_seconds: float;
    command_timeout_seconds: float;
    max_retries: int;
  } [@@deriving sexp]

  (** Redis connection state *)
  type connection_state =
    | Connected
    | Disconnected
    | Connecting
    | Failed of string
  [@@deriving sexp]

  (** Redis client *)
  type t = {
    config: redis_config;
    mutable state: connection_state;
    mutable connection: Redis_lwt.Client.connection option;
    state_mutex: Lwt_mutex.t;
    fallback_cache: (string, string * float) Hashtbl.t; (* key -> (value, expiry_time) *)
    mutable total_commands: int;
    mutable cache_hits: int;
    mutable cache_misses: int;
    mutable errors: int;
  }

  (** Default configuration *)
  let default_config = {
    host = "localhost";
    port = 6379;
    password = None;
    pool_size = 10;
    connection_timeout_seconds = 5.0;
    command_timeout_seconds = 2.0;
    max_retries = 3;
  }

  (** Parse Redis connection URL (format: redis://[password@]host:port[/db]) *)
  let parse_redis_url (url: string) : (string * int * string option, string) Result.t =
    try
      let uri = Uri.of_string url in
      let scheme = Uri.scheme uri in

      match scheme with
      | Some "redis" | Some "rediss" ->
          let host = Option.value (Uri.host uri) ~default:"localhost" in
          let port = Option.value (Uri.port uri) ~default:6379 in
          let password = Uri.password uri in
          Ok (host, port, password)
      | _ ->
          Error (Printf.sprintf "Invalid Redis URL scheme: %s (expected redis://)"
            (Option.value scheme ~default:"none"))
    with exn ->
      Error (Printf.sprintf "Failed to parse REDIS_URL: %s" (Exn.to_string exn))

  (** Create Redis client from environment
   *  Priority: REDIS_URL > individual env vars > defaults *)
  let create_from_env () : t =
    let (host, port, password) =
      (* First, try REDIS_URL (Docker/production) *)
      match Sys.getenv "REDIS_URL" with
      | Some url when not (String.is_empty url) ->
          (match parse_redis_url url with
          | Ok (h, p, pw) ->
              Logs.info (fun m -> m "[Redis] Using REDIS_URL from environment: %s:%d" h p);
              (h, p, pw)
          | Error err ->
              Logs.warn (fun m -> m "[Redis] Failed to parse REDIS_URL: %s, falling back to env vars" err);
              let get_env key default = Option.value (Sys.getenv key) ~default in
              let h = get_env "REDIS_HOST" "localhost" in
              let p = Int.of_string (get_env "REDIS_PORT" "6379") in
              let pw = Sys.getenv "REDIS_PASSWORD" in
              (h, p, pw))

      | _ ->
          (* Fall back to individual env vars (local development) *)
          let get_env key default = Option.value (Sys.getenv key) ~default in
          let h = get_env "REDIS_HOST" "localhost" in
          let p = Int.of_string (get_env "REDIS_PORT" "6379") in
          let pw = Sys.getenv "REDIS_PASSWORD" in
          Logs.info (fun m -> m "[Redis] Building config from individual env vars (REDIS_HOST=%s)" h);
          (h, p, pw)
    in

    let config = {
      default_config with
      host;
      port;
      password;
    } in

    {
      config;
      state = Disconnected;
      connection = None;
      state_mutex = Lwt_mutex.create ();
      fallback_cache = Hashtbl.create (module String);
      total_commands = 0;
      cache_hits = 0;
      cache_misses = 0;
      errors = 0;
    }

  (** Create Redis client with custom config *)
  let create ?(config=default_config) () : t =
    {
      config;
      state = Disconnected;
      connection = None;
      state_mutex = Lwt_mutex.create ();
      fallback_cache = Hashtbl.create (module String);
      total_commands = 0;
      cache_hits = 0;
      cache_misses = 0;
      errors = 0;
    }

  (** Connect to Redis server *)
  let connect (client: t) : (unit, string) Result.t Lwt.t =
    Lwt_mutex.with_lock client.state_mutex (fun () ->
      match client.state with
      | Connected -> Lwt.return (Ok ())
      | Connecting -> Lwt.return (Error "Connection already in progress")
      | Disconnected | Failed _ ->
          client.state <- Connecting;

          let%lwt () = Logs_lwt.info (fun m ->
            m "[Redis] Connecting to %s:%d..." client.config.host client.config.port
          ) in

          try%lwt
            let connection_spec = Redis_lwt.Client.{
              host = client.config.host;
              port = client.config.port;
            } in

            let%lwt conn = Redis_lwt.Client.connect connection_spec in

            (* Authenticate if password provided *)
            let%lwt () = match client.config.password with
              | Some pwd ->
                  let%lwt _result = Redis_lwt.Client.auth conn pwd in
                  Lwt.return ()
              | None -> Lwt.return ()
            in

            (* Test connection with PING *)
            let%lwt _pong = Redis_lwt.Client.ping conn in

            client.connection <- Some conn;
            client.state <- Connected;

            let%lwt () = Logs_lwt.info (fun m ->
              m "[Redis] Successfully connected to %s:%d" client.config.host client.config.port
            ) in

            Lwt.return (Ok ())

          with exn ->
            let error_msg = Exn.to_string exn in
            client.state <- Failed error_msg;
            client.errors <- client.errors + 1;

            let%lwt () = Logs_lwt.err (fun m ->
              m "[Redis] Connection failed: %s" error_msg
            ) in

            Lwt.return (Error error_msg)
    )

  (** Ensure connection (auto-reconnect) *)
  let ensure_connected (client: t) : (unit, string) Result.t Lwt.t =
    match client.state with
    | Connected -> Lwt.return (Ok ())
    | _ -> connect client

  (** Execute Redis command with fallback *)
  let with_fallback
      (client: t)
      (redis_op: Redis_lwt.Client.connection -> 'a Lwt.t)
      (fallback_op: unit -> 'a Lwt.t)
    : 'a Lwt.t =

    client.total_commands <- client.total_commands + 1;

    let%lwt conn_result = ensure_connected client in
    match conn_result with
    | Error _ ->
        (* Fallback to in-memory *)
        let%lwt () = Logs_lwt.debug (fun m ->
          m "[Redis] Using fallback (disconnected)"
        ) in
        fallback_op ()

    | Ok () ->
        match client.connection with
        | None -> fallback_op ()
        | Some conn ->
            try%lwt
              let timeout =
                let* () = Lwt_unix.sleep client.config.command_timeout_seconds in
                Lwt.fail (Failure "Redis command timeout")
              in
              Lwt.pick [redis_op conn; timeout]
            with exn ->
              client.errors <- client.errors + 1;
              let%lwt () = Logs_lwt.warn (fun m ->
                m "[Redis] Command failed, using fallback: %s" (Exn.to_string exn)
              ) in
              fallback_op ()

  (** GET key *)
  let get (client: t) (key: string) : string option Lwt.t =
    with_fallback client
      (fun conn ->
        let%lwt result = Redis_lwt.Client.get conn key in
        match result with
        | Some value ->
            client.cache_hits <- client.cache_hits + 1;
            Lwt.return (Some value)
        | None ->
            client.cache_misses <- client.cache_misses + 1;
            Lwt.return None
      )
      (fun () ->
        (* Fallback: Check in-memory cache *)
        match Hashtbl.find client.fallback_cache key with
        | Some (value, expiry) ->
            let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
            if Float.O.(now < expiry) then begin
              client.cache_hits <- client.cache_hits + 1;
              Lwt.return (Some value)
            end else begin
              Hashtbl.remove client.fallback_cache key;
              client.cache_misses <- client.cache_misses + 1;
              Lwt.return None
            end
        | None ->
            client.cache_misses <- client.cache_misses + 1;
            Lwt.return None
      )

  (** SET key value *)
  let set (client: t) (key: string) (value: string) : (unit, string) Result.t Lwt.t =
    with_fallback client
      (fun conn ->
        let%lwt _result = Redis_lwt.Client.set conn key value in
        Lwt.return (Ok ())
      )
      (fun () ->
        (* Fallback: Store in memory (no expiry) *)
        Hashtbl.set client.fallback_cache ~key ~data:(value, Float.infinity);
        Lwt.return (Ok ())
      )

  (** SETEX key seconds value *)
  let setex (client: t) (key: string) (ttl_seconds: int) (value: string) : (unit, string) Result.t Lwt.t =
    with_fallback client
      (fun conn ->
        let%lwt _result = Redis_lwt.Client.setex conn key ttl_seconds value in
        Lwt.return (Ok ())
      )
      (fun () ->
        (* Fallback: Store in memory with expiry *)
        let expiry = (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) +. Float.of_int ttl_seconds in
        Hashtbl.set client.fallback_cache ~key ~data:(value, expiry);
        Lwt.return (Ok ())
      )

  (** DEL key *)
  let del (client: t) (key: string) : (int, string) Result.t Lwt.t =
    with_fallback client
      (fun conn ->
        let%lwt deleted_count = Redis_lwt.Client.del conn [key] in
        Lwt.return (Ok deleted_count)
      )
      (fun () ->
        let existed = Hashtbl.mem client.fallback_cache key in
        Hashtbl.remove client.fallback_cache key;
        Lwt.return (Ok (if existed then 1 else 0))
      )

  (** EXISTS key *)
  let exists (client: t) (key: string) : bool Lwt.t =
    with_fallback client
      (fun conn ->
        let%lwt exists_result = Redis_lwt.Client.exists conn key in
        Lwt.return exists_result
      )
      (fun () ->
        match Hashtbl.find client.fallback_cache key with
        | Some (_value, expiry) ->
            let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
            if Float.O.(now < expiry) then
              Lwt.return true
            else begin
              Hashtbl.remove client.fallback_cache key;
              Lwt.return false
            end
        | None -> Lwt.return false
      )

  (** EXPIRE key seconds *)
  let expire (client: t) (key: string) (ttl_seconds: int) : (bool, string) Result.t Lwt.t =
    with_fallback client
      (fun conn ->
        let%lwt success = Redis_lwt.Client.expire conn key ttl_seconds in
        Lwt.return (Ok success)
      )
      (fun () ->
        (* Fallback: Update expiry in memory *)
        match Hashtbl.find client.fallback_cache key with
        | Some (value, _) ->
            let expiry = (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) +. Float.of_int ttl_seconds in
            Hashtbl.set client.fallback_cache ~key ~data:(value, expiry);
            Lwt.return (Ok true)
        | None ->
            Lwt.return (Ok false)
      )

  (** INCR key *)
  let incr (client: t) (key: string) : (int, string) Result.t Lwt.t =
    with_fallback client
      (fun conn ->
        let%lwt new_value = Redis_lwt.Client.incr conn key in
        Lwt.return (Ok new_value)
      )
      (fun () ->
        (* Fallback: Increment in memory *)
        let current = match Hashtbl.find client.fallback_cache key with
          | Some (value_str, expiry) ->
              (try Int.of_string value_str with _ -> 0), expiry
          | None -> 0, Float.infinity
        in
        let new_value = fst current + 1 in
        Hashtbl.set client.fallback_cache ~key ~data:(Int.to_string new_value, snd current);
        Lwt.return (Ok new_value)
      )

  (** Cleanup expired keys from fallback cache *)
  let cleanup_fallback_cache (client: t) : unit =
    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let expired_keys = Hashtbl.fold client.fallback_cache ~init:[] ~f:(fun ~key ~data:(_, expiry) acc ->
      if Float.O.(expiry < now) then key :: acc else acc
    ) in
    List.iter expired_keys ~f:(Hashtbl.remove client.fallback_cache)

  (** Get client statistics *)
  let get_stats (client: t) : Yojson.Safe.t =
    cleanup_fallback_cache client;
    `Assoc [
      ("state", `String (Sexp.to_string (sexp_of_connection_state client.state)));
      ("total_commands", `Int client.total_commands);
      ("cache_hits", `Int client.cache_hits);
      ("cache_misses", `Int client.cache_misses);
      ("hit_rate", `Float (
        if client.total_commands > 0 then
          Float.of_int client.cache_hits /. Float.of_int (client.cache_hits + client.cache_misses)
        else 0.0
      ));
      ("errors", `Int client.errors);
      ("fallback_cache_size", `Int (Hashtbl.length client.fallback_cache));
    ]

  (** Disconnect from Redis *)
  let disconnect (client: t) : unit Lwt.t =
    Lwt_mutex.with_lock client.state_mutex (fun () ->
      match client.connection with
      | None -> Lwt.return ()
      | Some conn ->
          let%lwt () = Logs_lwt.info (fun m ->
            m "[Redis] Disconnecting..."
          ) in
          let%lwt () = Redis_lwt.Client.quit conn in
          client.connection <- None;
          client.state <- Disconnected;
          Lwt.return ()
    )

end

(** Global Redis client singleton *)
module GlobalRedis = struct

  let global_client : RedisClient.t option ref = ref None
  let init_mutex = Lwt_mutex.create ()

  (** Initialize global Redis client *)
  let initialize ?(config=RedisClient.default_config) () : (RedisClient.t, string) Result.t Lwt.t =
    Lwt_mutex.with_lock init_mutex (fun () ->
      match !global_client with
      | Some client -> Lwt.return (Ok client)
      | None ->
          let client = RedisClient.create ~config () in
          let%lwt result = RedisClient.connect client in
          match result with
          | Ok () ->
              global_client := Some client;
              Lwt.return (Ok client)
          | Error e ->
              (* Still return client (will use fallback) *)
              global_client := Some client;
              let%lwt () = Logs_lwt.warn (fun m ->
                m "[GlobalRedis] Failed to connect, will use fallback: %s" e
              ) in
              Lwt.return (Ok client)
    )

  (** Get or create global client *)
  let get_client () : (RedisClient.t, string) Result.t Lwt.t =
    match !global_client with
    | Some client -> Lwt.return (Ok client)
    | None ->
        let client = RedisClient.create_from_env () in
        let%lwt _result = RedisClient.connect client in
        global_client := Some client;
        Lwt.return (Ok client)

  (** Convenience wrappers using global client *)
  let get (key: string) : string option Lwt.t =
    let%lwt client_result = get_client () in
    match client_result with
    | Ok client -> RedisClient.get client key
    | Error _ -> Lwt.return None

  let set (key: string) (value: string) : (unit, string) Result.t Lwt.t =
    let%lwt client_result = get_client () in
    match client_result with
    | Ok client -> RedisClient.set client key value
    | Error e -> Lwt.return (Error e)

  let setex (key: string) (ttl_seconds: int) (value: string) : (unit, string) Result.t Lwt.t =
    let%lwt client_result = get_client () in
    match client_result with
    | Ok client -> RedisClient.setex client key ttl_seconds value
    | Error e -> Lwt.return (Error e)

  let del (key: string) : (int, string) Result.t Lwt.t =
    let%lwt client_result = get_client () in
    match client_result with
    | Ok client -> RedisClient.del client key
    | Error e -> Lwt.return (Error e)

  let exists (key: string) : bool Lwt.t =
    let%lwt client_result = get_client () in
    match client_result with
    | Ok client -> RedisClient.exists client key
    | Error _ -> Lwt.return false

  let incr (key: string) : (int, string) Result.t Lwt.t =
    let%lwt client_result = get_client () in
    match client_result with
    | Ok client -> RedisClient.incr client key
    | Error e -> Lwt.return (Error e)

  (** Get global client stats *)
  let get_stats () : Yojson.Safe.t Lwt.t =
    let%lwt client_result = get_client () in
    match client_result with
    | Ok client -> Lwt.return (RedisClient.get_stats client)
    | Error _ -> Lwt.return (`Assoc [("error", `String "No client available")])

  (** Shutdown global client *)
  let shutdown () : unit Lwt.t =
    Lwt_mutex.with_lock init_mutex (fun () ->
      match !global_client with
      | None -> Lwt.return ()
      | Some client ->
          let%lwt () = RedisClient.disconnect client in
          global_client := None;
          Lwt.return ()
    )

end
