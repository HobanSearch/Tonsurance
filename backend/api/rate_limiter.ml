(** Rate Limiter - Redis-backed Sliding Window Algorithm
 *
 * Implements token bucket with Redis for distributed rate limiting:
 * - Sliding window algorithm for accurate rate limiting
 * - Per-IP and per-API-key limits
 * - Configurable limits per endpoint
 * - Graceful fallback to in-memory if Redis unavailable
 *
 * Algorithm:
 *   1. Each request stores timestamp in Redis sorted set
 *   2. Remove entries older than window (60 seconds)
 *   3. Count remaining entries
 *   4. Allow if count < limit
 *
 * Redis keys:
 *   ratelimit:ip:<ip_address>
 *   ratelimit:key:<api_key_hash>
 *   ratelimit:endpoint:<path>:<identifier>
 *)

open Core
open Lwt.Syntax

(** Rate limit configuration per endpoint *)
type endpoint_config = {
  path_pattern: string;
  limit_per_minute: int;
  burst_allowance: int;  (* Allow N extra requests in short burst *)
}

(** Default endpoint configurations *)
let default_endpoints = [
  { path_pattern = "/api/v2/quote/*"; limit_per_minute = 60; burst_allowance = 10 };
  { path_pattern = "/api/v2/policies"; limit_per_minute = 20; burst_allowance = 5 };
  { path_pattern = "/api/v2/claims"; limit_per_minute = 10; burst_allowance = 2 };
  { path_pattern = "/api/v2/vault/*"; limit_per_minute = 30; burst_allowance = 5 };
  { path_pattern = "/api/v2/*"; limit_per_minute = 100; burst_allowance = 20 };
]

(** Redis connection state *)
type redis_state =
  | Connected of { host: string; port: int }
  | Disconnected

let redis_state = ref Disconnected

(** In-memory fallback for when Redis is unavailable *)
module InMemoryFallback = struct
  (** Rate limit entry *)
  type entry = {
    timestamps: float Queue.t;
    mutable last_cleanup: float;
  }

  let cache = Hashtbl.create (module String)
  let window_seconds = 60.0

  (** Clean old entries *)
  let cleanup entry current_time =
    let cutoff = current_time -. window_seconds in
    while not (Queue.is_empty entry.timestamps) &&
          Float.(Queue.peek_exn entry.timestamps < cutoff) do
      ignore (Queue.dequeue_exn entry.timestamps)
    done;
    entry.last_cleanup <- current_time

  (** Check if request is allowed *)
  let is_allowed ~key ~limit =
    let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

    let entry = match Hashtbl.find cache key with
      | Some e ->
          (* Cleanup old entries every 5 seconds *)
          if Float.(current_time -. e.last_cleanup > 5.0) then
            cleanup e current_time;
          e
      | None ->
          let e = {
            timestamps = Queue.create ();
            last_cleanup = current_time;
          } in
          Hashtbl.set cache ~key ~data:e;
          e
    in

    let current_count = Queue.length entry.timestamps in

    if current_count < limit then (
      Queue.enqueue entry.timestamps current_time;
      true
    ) else
      false

  (** Get remaining requests *)
  let get_remaining ~key ~limit =
    match Hashtbl.find cache key with
    | None -> limit
    | Some entry ->
        let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
        cleanup entry current_time;
        Int.max 0 (limit - Queue.length entry.timestamps)
end

(** Redis-backed implementation
 * Note: Commented out as redis-lwt is not currently available.
 * Uncomment when Redis OCaml bindings are installed.
 *)

(*
module RedisBackend = struct
  open Redis_lwt

  let redis_client = ref None
  let window_seconds = 60

  (** Initialize Redis connection *)
  let init ~host ~port =
    try
      let* client = Client.connect ~host ~port () in
      redis_client := Some client;
      redis_state := Connected { host; port };
      Logs_lwt.info (fun m ->
        m "Rate limiter connected to Redis at %s:%d" host port
      )
    with exn ->
      Logs_lwt.warn (fun m ->
        m "Failed to connect to Redis: %s. Using in-memory fallback."
          (Exn.to_string exn)
      ) >>= fun () ->
      redis_state := Disconnected;
      Lwt.return_unit

  (** Build Redis key *)
  let redis_key prefix identifier =
    sprintf "tonsurance:ratelimit:%s:%s" prefix identifier

  (** Check rate limit using sorted set *)
  let is_allowed ~key ~limit =
    match !redis_client with
    | None -> Lwt.return (InMemoryFallback.is_allowed ~key ~limit)
    | Some client ->
        try
          let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
          let window_start = current_time -. float_of_int window_seconds in

          (* Remove old entries *)
          let* _ = Client.zremrangebyscore client key
            ~min:"-inf"
            ~max:(Float.to_string window_start)
          in

          (* Count current entries *)
          let* count = Client.zcard client key in

          if count < limit then (
            (* Add current request *)
            let score = Float.to_string current_time in
            let member = sprintf "%f:%d" current_time (Random.int 1000000) in
            let* _ = Client.zadd client key [(score, member)] in

            (* Set expiry on key *)
            let* _ = Client.expire client key window_seconds in

            Lwt.return true
          ) else
            Lwt.return false

        with exn ->
          Logs_lwt.warn (fun m ->
            m "Redis error in rate limiter: %s. Using fallback."
              (Exn.to_string exn)
          ) >>= fun () ->
          Lwt.return (InMemoryFallback.is_allowed ~key ~limit)

  (** Get remaining requests *)
  let get_remaining ~key ~limit =
    match !redis_client with
    | None -> Lwt.return (InMemoryFallback.get_remaining ~key ~limit)
    | Some client ->
        try
          let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
          let window_start = current_time -. float_of_int window_seconds in

          (* Remove old entries *)
          let* _ = Client.zremrangebyscore client key
            ~min:"-inf"
            ~max:(Float.to_string window_start)
          in

          (* Count current entries *)
          let* count = Client.zcard client key in

          Lwt.return (Int.max 0 (limit - count))

        with exn ->
          Lwt.return (InMemoryFallback.get_remaining ~key ~limit)

  (** Clear rate limit for key (admin function) *)
  let clear_limit ~key =
    match !redis_client with
    | None -> Lwt.return_unit
    | Some client ->
        try
          let* _ = Client.del client [key] in
          Lwt.return_unit
        with _ ->
          Lwt.return_unit
end
*)

(** Public API - currently uses in-memory fallback *)

(** Initialize rate limiter (Redis optional) *)
let init ?(_redis_host="127.0.0.1") ?(_redis_port=6379) () =
  (* Uncomment when Redis bindings available:
     RedisBackend.init ~host:redis_host ~port:redis_port
  *)
  redis_state := Disconnected;
  Logs_lwt.info (fun m ->
    m "Rate limiter initialized (in-memory mode - Redis not available)"
  )

(** Check if request is allowed *)
let check_rate_limit ~key ~limit =
  (* Uncomment when Redis available:
     RedisBackend.is_allowed ~key ~limit
  *)
  Lwt.return (InMemoryFallback.is_allowed ~key ~limit)

(** Get remaining requests in current window *)
let get_remaining ~key ~limit =
  (* Uncomment when Redis available:
     RedisBackend.get_remaining ~key ~limit
  *)
  Lwt.return (InMemoryFallback.get_remaining ~key ~limit)

(** Check endpoint-specific rate limit *)
let check_endpoint_limit ~path ~identifier =
  (* Find matching endpoint config *)
  let config_opt = List.find default_endpoints ~f:(fun cfg ->
    (* Simple pattern matching - can be enhanced with regex *)
    let pattern = String.substr_replace_all cfg.path_pattern ~pattern:"*" ~with_:"" in
    String.is_prefix path ~prefix:pattern
  ) in

  match config_opt with
  | None ->
      (* Use global limit if no specific config *)
      check_rate_limit ~key:identifier ~limit:100

  | Some config ->
      let key = sprintf "endpoint:%s:%s" path identifier in
      let limit = config.limit_per_minute + config.burst_allowance in
      check_rate_limit ~key ~limit

(** Clear rate limit for identifier (admin function) *)
let clear_rate_limit ~key =
  (* Uncomment when Redis available:
     RedisBackend.clear_limit ~key
  *)
  match Hashtbl.find InMemoryFallback.cache key with
  | None -> Lwt.return_unit
  | Some _ ->
      Hashtbl.remove InMemoryFallback.cache key;
      Lwt.return_unit

(** Get current rate limit status *)
let get_status ~key ~limit =
  let* remaining = get_remaining ~key ~limit in
  let used = limit - remaining in
  let backend = match !redis_state with
    | Connected _ -> "redis"
    | Disconnected -> "in_memory"
  in
  Lwt.return (Printf.sprintf {|
    {
      "limit": %d,
      "remaining": %d,
      "used": %d,
      "reset_in_seconds": 60,
      "backend": "%s"
    }
  |} limit remaining used backend)

(** Statistics for monitoring *)
type rate_limit_stats = {
  total_requests: int;
  blocked_requests: int;
  active_keys: int;
  backend: string;
}

let get_stats () =
  let active_keys = Hashtbl.length InMemoryFallback.cache in
  Lwt.return {
    total_requests = 0;  (* TODO: Track in Redis *)
    blocked_requests = 0;
    active_keys;
    backend = match !redis_state with
      | Connected _ -> "redis"
      | Disconnected -> "in_memory";
  }

(** Export configuration for monitoring *)
let get_endpoint_configs () =
  default_endpoints
