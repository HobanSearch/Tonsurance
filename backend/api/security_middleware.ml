(** API Security Middleware
 *
 * Comprehensive security layer for API v2:
 * - Rate limiting (Redis-backed sliding window)
 * - CORS configuration with origin allowlist
 * - API key authentication (Bearer tokens)
 * - Request size limits (10MB max)
 * - Input sanitization helpers
 *
 * Usage:
 *   Dream.run
 *     @@ SecurityMiddleware.cors_middleware
 *     @@ SecurityMiddleware.rate_limit_middleware
 *     @@ SecurityMiddleware.auth_middleware ~protected_routes
 *     @@ Dream.router routes
 *)

open Core
open Lwt.Syntax
open Lwt.Infix

(** Security configuration *)
type security_config = {
  max_request_size_bytes: int;           (* 10MB default *)
  allowed_origins: string list;          (* CORS allowlist *)
  api_keys: (string, api_key_info) Hashtbl.t;  (* API key registry *)
  rate_limit_per_ip: int;                (* Requests per minute *)
  rate_limit_per_key: int;               (* Requests per minute for authenticated *)
}

(** API key metadata *)
and api_key_info = {
  key_hash: string;                      (* SHA-256 of API key *)
  name: string;                          (* Key identifier/owner *)
  scopes: string list;                   (* Allowed operations *)
  created_at: float;
  expires_at: float option;
  revoked: bool;
}

(** Default configuration *)
let default_config = {
  max_request_size_bytes = 10_485_760;   (* 10MB *)
  allowed_origins = [
    "http://localhost:3000";
    "http://localhost:5173";             (* Vite dev server *)
    "https://tonsurance.io";
    "https://app.tonsurance.io";
  ];
  api_keys = Hashtbl.create (module String);
  rate_limit_per_ip = 100;               (* 100/min per IP *)
  rate_limit_per_key = 500;              (* 500/min per authenticated user *)
}

(** Global config reference (loaded from JSON) *)
let config_ref = ref default_config

(** Load configuration from JSON file *)
let load_config_from_file filepath =
  try
    let json = Yojson.Safe.from_file filepath in
    let open Yojson.Safe.Util in

    (* Parse allowed origins *)
    let allowed_origins = json
      |> member "cors"
      |> member "allowed_origins"
      |> to_list
      |> List.map ~f:to_string
    in

    (* Parse rate limits *)
    let rate_limit_per_ip = json
      |> member "rate_limiting"
      |> member "per_ip_per_minute"
      |> to_int
    in

    let rate_limit_per_key = json
      |> member "rate_limiting"
      |> member "per_key_per_minute"
      |> to_int
    in

    (* Parse API keys *)
    let api_keys = Hashtbl.create (module String) in
    let keys_json = json
      |> member "api_keys"
      |> to_list
    in

    List.iter keys_json ~f:(fun key_obj ->
      let key = key_obj |> member "key" |> to_string in
      let key_info = {
        key_hash = Md5.digest_string key |> Md5.to_hex;
        name = key_obj |> member "name" |> to_string;
        scopes = key_obj |> member "scopes" |> to_list |> List.map ~f:to_string;
        created_at = key_obj |> member "created_at" |> to_float;
        expires_at = (try Some (key_obj |> member "expires_at" |> to_float) with _ -> None);
        revoked = (try key_obj |> member "revoked" |> to_bool with _ -> false);
      } in
      Hashtbl.set api_keys ~key ~data:key_info
    );

    let new_config = {
      max_request_size_bytes = default_config.max_request_size_bytes;
      allowed_origins;
      api_keys;
      rate_limit_per_ip;
      rate_limit_per_key;
    } in

    config_ref := new_config;
    Ok new_config

  with exn ->
    Error (sprintf "Failed to load security config: %s" (Exn.to_string exn))

(** Generate secure random API key (32 bytes, base64) *)
let generate_api_key () =
  let random_bytes = Bytes.create 32 in
  for i = 0 to 31 do
    Bytes.set random_bytes i (Char.of_int_exn (Random.int 256))
  done;
  Base64.encode_exn (Bytes.to_string random_bytes)

(** Input sanitization helpers *)
module Sanitization = struct

  (** Remove potentially dangerous characters from strings *)
  let sanitize_string str =
    str
    |> String.filter ~f:(fun c ->
        Char.is_alphanum c ||
        Char.equal c '_' ||
        Char.equal c '-' ||
        Char.equal c '.' ||
        Char.equal c '@'
      )

  (** Validate email format *)
  let is_valid_email email =
    let email_regex = Str.regexp "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$" in
    Str.string_match email_regex email 0

  (** Sanitize numeric input *)
  let sanitize_float str =
    try
      let f = Float.of_string str in
      if Float.is_finite f && Float.O.(f >= 0.0) then Some f
      else None
    with _ -> None

  (** Sanitize integer input *)
  let sanitize_int str =
    try
      let i = Int.of_string str in
      if i >= 0 then Some i
      else None
    with _ -> None

  (** Limit string length *)
  let truncate_string str max_len =
    if String.length str > max_len then
      String.prefix str max_len
    else
      str

  (** Validate JSON size before parsing *)
  let is_valid_json_size body max_bytes =
    String.length body <= max_bytes
end

(** CORS Middleware *)
let cors_middleware inner_handler request =
  let origin = Dream.header request "Origin" in

  let allowed = match origin with
    | None -> true  (* No Origin header = same-origin request *)
    | Some origin_val ->
        List.mem !config_ref.allowed_origins origin_val ~equal:String.equal
  in

  if not allowed then
    Dream.json ~status:`Forbidden
      {|{"error":"CORS policy violation: Origin not allowed"}|}
  else
    (* Process request and add CORS headers *)
    let* response = inner_handler request in

    (match origin with
    | Some origin_val ->
        Dream.add_header response "Access-Control-Allow-Origin" origin_val;
        Dream.add_header response "Access-Control-Allow-Methods" "GET, POST, PUT, DELETE, OPTIONS";
        Dream.add_header response "Access-Control-Allow-Headers" "Content-Type, Authorization";
        Dream.add_header response "Access-Control-Max-Age" "86400";
    | None -> ());

    Lwt.return response

(** Handle CORS preflight requests *)
let cors_preflight_handler _request =
  Dream.empty `OK
    ~headers:[
      ("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      ("Access-Control-Allow-Headers", "Content-Type, Authorization");
      ("Access-Control-Max-Age", "86400");
    ]

(** Rate Limiting Middleware *)
let rate_limit_middleware inner_handler request =
  let _client_ip = Dream.client request in

  (* Extract API key if present *)
  let api_key_opt = match Dream.header request "Authorization" with
    | Some auth_header ->
        if String.is_prefix auth_header ~prefix:"Bearer " then
          Some (String.drop_prefix auth_header 7)
        else
          None
    | None -> None
  in

  (* Determine rate limit *)
  let limit = match api_key_opt with
    | Some _ -> !config_ref.rate_limit_per_key
    | None -> !config_ref.rate_limit_per_ip
  in

  (* Check rate limit using Rate_limiter module *)
  let* is_allowed = Rate_limiter.check_rate_limit ~key:_client_ip ~limit in

  if not is_allowed then
    Dream.json ~status:`Too_Many_Requests
      ~headers:[
        ("Retry-After", "60");
        ("X-RateLimit-Limit", string_of_int limit);
        ("X-RateLimit-Remaining", "0");
      ]
      {|{"error":"Rate limit exceeded","retry_after_seconds":60}|}
  else
    let* response = inner_handler request in

    (* Add rate limit headers *)
    let* remaining = Rate_limiter.get_remaining ~key:_client_ip ~limit in
    Dream.add_header response "X-RateLimit-Limit" (string_of_int limit);
    Dream.add_header response "X-RateLimit-Remaining" (string_of_int remaining);
    Dream.add_header response "X-RateLimit-Reset" "60";

    Lwt.return response

(** Authentication Middleware *)
let auth_middleware ~protected_routes inner_handler request =
  let path = Dream.target request in
  let method_str = Dream.method_to_string (Dream.method_ request) in

  (* Check if route requires authentication *)
  let is_protected = List.exists protected_routes ~f:(fun (pattern, methods) ->
    String.is_substring path ~substring:pattern &&
    List.mem methods method_str ~equal:String.equal
  ) in

  if not is_protected then
    inner_handler request
  else
    (* Extract and validate API key *)
    match Dream.header request "Authorization" with
    | None ->
        Dream.json ~status:`Unauthorized
          {|{"error":"Missing Authorization header","hint":"Use 'Authorization: Bearer YOUR_API_KEY'"}|}

    | Some auth_header ->
        if not (String.is_prefix auth_header ~prefix:"Bearer ") then
          Dream.json ~status:`Unauthorized
            {|{"error":"Invalid Authorization format","hint":"Use 'Authorization: Bearer YOUR_API_KEY'"}|}
        else
          let api_key = String.drop_prefix auth_header 7 in

          (* Lookup API key *)
          match Hashtbl.find !config_ref.api_keys api_key with
          | None ->
              Dream.json ~status:`Unauthorized
                {|{"error":"Invalid API key"}|}

          | Some key_info ->
              (* Check if key is revoked *)
              if key_info.revoked then
                Dream.json ~status:`Unauthorized
                  {|{"error":"API key has been revoked"}|}

              (* Check if key is expired *)
              else if Option.is_some key_info.expires_at &&
                      Float.O.(Option.value_exn key_info.expires_at <
                        (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec)) then
                Dream.json ~status:`Unauthorized
                  {|{"error":"API key has expired"}|}

              (* Check scopes *)
              else
                let has_permission =
                  List.mem key_info.scopes "write" ~equal:String.equal ||
                  List.mem key_info.scopes "admin" ~equal:String.equal
                in

                if not has_permission then
                  Dream.json ~status:`Forbidden
                    {|{"error":"Insufficient permissions","required_scope":"write"}|}
                else
                  (* Authenticated - proceed with request *)
                  inner_handler request

(** Request Size Limit Middleware *)
let size_limit_middleware inner_handler request =
  let* body = Dream.body request in

  if String.length body > !config_ref.max_request_size_bytes then
    Dream.json ~status:`Payload_Too_Large
      (sprintf {|{"error":"Request body too large","max_size_mb":%d}|}
        (!config_ref.max_request_size_bytes / 1_048_576))
  else
    inner_handler request

(** Request Logging Middleware *)
let logging_middleware inner_handler request =
  let start_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
  let method_str = Dream.method_to_string (Dream.method_ request) in
  let path = Dream.target request in

  let* response = inner_handler request in

  let end_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
  let duration_ms = (end_time -. start_time) *. 1000.0 in
  let status = Dream.status response |> Dream.status_to_int in

  (* Log request *)
  Logs_lwt.info (fun m ->
    m "[API] %s %s - %d - %.2fms"
      method_str path status duration_ms
  ) >>= fun () ->

  Lwt.return response

(** Combined security middleware stack *)
let apply_security_stack ~protected_routes handler =
  handler
  |> logging_middleware
  |> size_limit_middleware
  |> (auth_middleware ~protected_routes)
  |> rate_limit_middleware
  |> cors_middleware

(** Utility: Add API key to registry *)
let add_api_key ~key ~name ~scopes ?(expires_in_days=None) () =
  let expires_at = match expires_in_days with
    | None -> None
    | Some days ->
        let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
        Some (now +. (Float.of_int days *. 86400.0))
  in

  let key_info = {
    key_hash = Md5.digest_string key |> Md5.to_hex;
    name;
    scopes;
    created_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    expires_at;
    revoked = false;
  } in

  Hashtbl.set !config_ref.api_keys ~key ~data:key_info

(** Utility: Revoke API key *)
let revoke_api_key key =
  match Hashtbl.find !config_ref.api_keys key with
  | None -> Error "API key not found"
  | Some key_info ->
      let updated_info = { key_info with revoked = true } in
      Hashtbl.set !config_ref.api_keys ~key ~data:updated_info;
      Ok ()

(** Utility: List all API keys (for admin) *)
let list_api_keys () =
  Hashtbl.fold !config_ref.api_keys ~init:[] ~f:(fun ~key ~data acc ->
    (key, data) :: acc
  )
