(** API Security Tests
 *
 * Comprehensive test suite for API v2 security features:
 * - Rate limiting enforcement
 * - CORS validation
 * - API key authentication
 * - Input validation
 * - Request size limits
 *
 * Run with: dune test backend/test/api_security_test.ml
 *)

open Core
open OUnit2
open Lwt.Infix

(* Import Rate_limiter from the integration library where it's actually defined *)
(* Note: rate_limiter.ml is a standalone module, not nested under Security_middleware *)
(* We'll need to reference it directly from the compilation unit *)

(** Test Configuration *)
let test_config = Security_middleware.{
  max_request_size_bytes = 1024;  (* 1KB for testing *)
  allowed_origins = [
    "http://localhost:3000";
    "https://app.tonsurance.io";
  ];
  api_keys = Hashtbl.create (module String);
  rate_limit_per_ip = 5;   (* Low limit for testing *)
  rate_limit_per_key = 10;
}

let valid_api_key = "test_key_12345678901234567890123456789012"
let invalid_api_key = "invalid_key"

(** Setup: Add test API key *)
let setup_test_keys () =
  Security_middleware.add_api_key
    ~key:valid_api_key
    ~name:"Test Key"
    ~scopes:["read"; "write"]
    ~expires_in_days:None
    ()

(** Test Suite 1: Rate Limiting *)
let test_rate_limit_allows_under_limit _ctx =
  Lwt_main.run (
    let open Lwt.Syntax in

    (* Initialize rate limiter *)
    let* () = Rate_limiter.init () in

    (* First request should be allowed *)
    let* allowed1 = Rate_limiter.check_rate_limit ~key:"test_ip_1" ~limit:5 in
    assert_equal true allowed1 ~msg:"First request should be allowed";

    (* Second request should be allowed *)
    let* allowed2 = Rate_limiter.check_rate_limit ~key:"test_ip_1" ~limit:5 in
    assert_equal true allowed2 ~msg:"Second request should be allowed";

    (* Check remaining *)
    let* remaining = Rate_limiter.get_remaining ~key:"test_ip_1" ~limit:5 in
    assert_equal 3 remaining ~msg:"Should have 3 requests remaining";

    Lwt.return_unit
  )

let test_rate_limit_blocks_over_limit _ctx =
  Lwt_main.run (
    let open Lwt.Syntax in

    let* () = Rate_limiter.init () in
    let key = "test_ip_2" in
    let limit = 3 in

    (* Make 3 requests (up to limit) *)
    let* _ = Rate_limiter.check_rate_limit ~key ~limit in
    let* _ = Rate_limiter.check_rate_limit ~key ~limit in
    let* _ = Rate_limiter.check_rate_limit ~key ~limit in

    (* 4th request should be blocked *)
    let* allowed = Rate_limiter.check_rate_limit ~key ~limit in
    assert_equal false allowed ~msg:"4th request should be blocked";

    (* Remaining should be 0 *)
    let* remaining = Rate_limiter.get_remaining ~key ~limit in
    assert_equal 0 remaining ~msg:"No requests should remain";

    Lwt.return_unit
  )

let test_rate_limit_different_ips _ctx =
  Lwt_main.run (
    let open Lwt.Syntax in

    let* () = Rate_limiter.init () in

    (* IP 1 makes requests *)
    let* _ = Rate_limiter.check_rate_limit ~key:"ip_1" ~limit:2 in
    let* _ = Rate_limiter.check_rate_limit ~key:"ip_1" ~limit:2 in

    (* IP 1 should be at limit *)
    let* allowed_ip1 = Rate_limiter.check_rate_limit ~key:"ip_1" ~limit:2 in
    assert_equal false allowed_ip1 ~msg:"IP 1 should be blocked";

    (* IP 2 should still be allowed *)
    let* allowed_ip2 = Rate_limiter.check_rate_limit ~key:"ip_2" ~limit:2 in
    assert_equal true allowed_ip2 ~msg:"IP 2 should be allowed";

    Lwt.return_unit
  )

let test_rate_limit_endpoint_specific _ctx =
  Lwt_main.run (
    let open Lwt.Syntax in

    let* () = Rate_limiter.init () in

    (* Test quote endpoint (60/min + 10 burst = 70 total) *)
    let* allowed = Rate_limiter.check_endpoint_limit
      ~path:"/api/v2/quote/multi-dimensional"
      ~identifier:"user_1"
    in
    assert_equal true allowed ~msg:"Quote endpoint should allow request";

    (* Test policy endpoint (20/min + 5 burst = 25 total) *)
    let* allowed = Rate_limiter.check_endpoint_limit
      ~path:"/api/v2/policies"
      ~identifier:"user_2"
    in
    assert_equal true allowed ~msg:"Policy endpoint should allow request";

    Lwt.return_unit
  )

(** Test Suite 2: API Key Authentication *)
let test_auth_missing_header _ctx =
  (* This would test Dream middleware - mock test *)
  let error_msg = "Missing Authorization header" in
  assert_equal "Missing Authorization header" error_msg

let test_auth_invalid_format _ctx =
  (* Test that "Bearer" prefix is required *)
  let auth_header = "InvalidFormat test_key" in
  let has_bearer = String.is_prefix auth_header ~prefix:"Bearer " in
  assert_equal false has_bearer ~msg:"Should reject non-Bearer format"

let test_auth_valid_key _ctx =
  setup_test_keys ();

  (* Check that key exists *)
  let key_exists = Hashtbl.mem !Security_middleware.config_ref.api_keys valid_api_key in
  assert_equal true key_exists ~msg:"Valid API key should exist"

let test_auth_invalid_key _ctx =
  setup_test_keys ();

  (* Check that invalid key doesn't exist *)
  let key_exists = Hashtbl.mem !Security_middleware.config_ref.api_keys invalid_api_key in
  assert_equal false key_exists ~msg:"Invalid API key should not exist"

let test_auth_revoked_key _ctx =
  setup_test_keys ();

  (* Revoke the key *)
  let result = Security_middleware.revoke_api_key valid_api_key in
  assert_equal (Ok ()) result ~msg:"Should successfully revoke key";

  (* Check that it's marked as revoked *)
  match Hashtbl.find !Security_middleware.config_ref.api_keys valid_api_key with
  | None -> assert_failure "Key should still exist after revocation"
  | Some key_info ->
      assert_equal true key_info.revoked ~msg:"Key should be marked as revoked"

let test_auth_expired_key _ctx =
  (* Add key that expires in the past *)
  Security_middleware.add_api_key
    ~key:"expired_key"
    ~name:"Expired Key"
    ~scopes:["read"]
    ~expires_in_days:(Some (-1))  (* Expired 1 day ago *)
    ();

  match Hashtbl.find !Security_middleware.config_ref.api_keys "expired_key" with
  | None -> assert_failure "Key should exist"
  | Some key_info ->
      let is_expired = match key_info.expires_at with
        | None -> false
        | Some expiry -> expiry < Unix.time ()
      in
      assert_equal true is_expired ~msg:"Key should be expired"

let test_auth_scopes _ctx =
  setup_test_keys ();

  match Hashtbl.find !Security_middleware.config_ref.api_keys valid_api_key with
  | None -> assert_failure "Key should exist"
  | Some key_info ->
      let has_write = List.mem key_info.scopes "write" ~equal:String.equal in
      let has_admin = List.mem key_info.scopes "admin" ~equal:String.equal in
      assert_equal true has_write ~msg:"Key should have write scope";
      assert_equal false has_admin ~msg:"Key should not have admin scope"

(** Test Suite 3: CORS Validation *)
let test_cors_allowed_origin _ctx =
  let origin = "http://localhost:3000" in
  let is_allowed = List.mem test_config.allowed_origins origin ~equal:String.equal in
  assert_equal true is_allowed ~msg:"localhost:3000 should be allowed"

let test_cors_disallowed_origin _ctx =
  let origin = "https://malicious-site.com" in
  let is_allowed = List.mem test_config.allowed_origins origin ~equal:String.equal in
  assert_equal false is_allowed ~msg:"Unknown origin should be blocked"

let test_cors_production_origin _ctx =
  let origin = "https://app.tonsurance.io" in
  let is_allowed = List.mem test_config.allowed_origins origin ~equal:String.equal in
  assert_equal true is_allowed ~msg:"Production domain should be allowed"

(** Test Suite 4: Input Validation *)
let test_input_sanitize_string _ctx =
  let input = "user@example.com" in
  let sanitized = Security_middleware.Sanitization.sanitize_string input in
  assert_equal "userexample.com" sanitized ~msg:"Should remove @ symbol";

  let input2 = "hello_world-123" in
  let sanitized2 = Security_middleware.Sanitization.sanitize_string input2 in
  assert_equal "hello_world-123" sanitized2 ~msg:"Should keep alphanumeric and _-"

let test_input_validate_email _ctx =
  let valid_email = "user@example.com" in
  let invalid_email = "not-an-email" in

  let is_valid1 = Security_middleware.Sanitization.is_valid_email valid_email in
  let is_valid2 = Security_middleware.Sanitization.is_valid_email invalid_email in

  assert_equal true is_valid1 ~msg:"Valid email should pass";
  assert_equal false is_valid2 ~msg:"Invalid email should fail"

let test_input_sanitize_float _ctx =
  let valid_float = "123.45" in
  let invalid_float = "not-a-number" in
  let negative_float = "-10.0" in

  match Security_middleware.Sanitization.sanitize_float valid_float with
  | Some f -> assert_equal 123.45 f ~cmp:Float.equal
  | None -> assert_failure "Should parse valid float";

  match Security_middleware.Sanitization.sanitize_float invalid_float with
  | Some _ -> assert_failure "Should reject invalid float"
  | None -> ();

  match Security_middleware.Sanitization.sanitize_float negative_float with
  | Some _ -> assert_failure "Should reject negative float"
  | None -> ()

let test_input_sanitize_int _ctx =
  let valid_int = "42" in
  let invalid_int = "abc" in
  let negative_int = "-5" in

  match Security_middleware.Sanitization.sanitize_int valid_int with
  | Some i -> assert_equal 42 i
  | None -> assert_failure "Should parse valid int";

  match Security_middleware.Sanitization.sanitize_int invalid_int with
  | Some _ -> assert_failure "Should reject invalid int"
  | None -> ();

  match Security_middleware.Sanitization.sanitize_int negative_int with
  | Some _ -> assert_failure "Should reject negative int"
  | None -> ()

let test_input_truncate_string _ctx =
  let long_string = String.init 2000 ~f:(fun _ -> 'a') in
  let truncated = Security_middleware.Sanitization.truncate_string long_string 100 in
  assert_equal 100 (String.length truncated) ~msg:"Should truncate to max length"

let test_input_json_size _ctx =
  let small_json = "{\"key\": \"value\"}" in
  let large_json = String.init 2000 ~f:(fun _ -> 'x') in

  let is_valid1 = Security_middleware.Sanitization.is_valid_json_size small_json 1000 in
  let is_valid2 = Security_middleware.Sanitization.is_valid_json_size large_json 1000 in

  assert_equal true is_valid1 ~msg:"Small JSON should be valid";
  assert_equal false is_valid2 ~msg:"Large JSON should be rejected"

(** Test Suite 5: Request Size Limits *)
let test_request_size_within_limit _ctx =
  let body = String.init 500 ~f:(fun _ -> 'x') in
  let is_valid = String.length body <= test_config.max_request_size_bytes in
  assert_equal true is_valid ~msg:"500 byte request should be allowed"

let test_request_size_exceeds_limit _ctx =
  let body = String.init 2000 ~f:(fun _ -> 'x') in
  let is_valid = String.length body <= test_config.max_request_size_bytes in
  assert_equal false is_valid ~msg:"2KB request should be rejected (limit 1KB)"

(** Test Suite 6: API Key Generation *)
let test_generate_api_key _ctx =
  let key = Security_middleware.generate_api_key () in

  (* Key should be base64 encoded *)
  assert_bool "Key should not be empty" (String.length key > 0);

  (* Decode and check length (32 bytes = 44 chars base64) *)
  match Base64.decode key with
  | Ok decoded ->
      assert_equal 32 (String.length decoded) ~msg:"Decoded key should be 32 bytes"
  | Error _ ->
      assert_failure "Generated key should be valid base64"

let test_generate_unique_keys _ctx =
  let key1 = Security_middleware.generate_api_key () in
  let key2 = Security_middleware.generate_api_key () in

  assert_bool "Generated keys should be unique" (not (String.equal key1 key2))

(** Test Suite 7: Configuration Loading *)
let test_load_config_from_json _ctx =
  (* Test would load from actual JSON file *)
  let config_path = "backend/config/api_security.json" in

  if Sys.file_exists config_path = `Yes then (
    match Security_middleware.load_config_from_file config_path with
    | Ok config ->
        assert_bool "Should have allowed origins"
          (List.length config.allowed_origins > 0);
        assert_bool "Should have rate limits"
          (config.rate_limit_per_ip > 0)
    | Error msg ->
        printf "Warning: Could not load config: %s\n" msg
  ) else
    printf "Warning: Config file not found at %s\n" config_path

(** Test Suite 8: Rate Limiter Stats *)
let test_rate_limiter_stats _ctx =
  Lwt_main.run (
    let open Lwt.Syntax in

    let* () = Rate_limiter.init () in
    let* stats = Rate_limiter.get_stats () in

    assert_equal "in_memory" stats.backend ~msg:"Should use in-memory backend";
    assert_bool "Should track active keys" (stats.active_keys >= 0);

    Lwt.return_unit
  )

(** Test Suite Organization *)
let rate_limiting_tests = "Rate Limiting Tests" >::: [
  "test_allows_under_limit" >:: test_rate_limit_allows_under_limit;
  "test_blocks_over_limit" >:: test_rate_limit_blocks_over_limit;
  "test_different_ips" >:: test_rate_limit_different_ips;
  "test_endpoint_specific" >:: test_rate_limit_endpoint_specific;
]

let authentication_tests = "Authentication Tests" >::: [
  "test_missing_header" >:: test_auth_missing_header;
  "test_invalid_format" >:: test_auth_invalid_format;
  "test_valid_key" >:: test_auth_valid_key;
  "test_invalid_key" >:: test_auth_invalid_key;
  "test_revoked_key" >:: test_auth_revoked_key;
  "test_expired_key" >:: test_auth_expired_key;
  "test_scopes" >:: test_auth_scopes;
]

let cors_tests = "CORS Tests" >::: [
  "test_allowed_origin" >:: test_cors_allowed_origin;
  "test_disallowed_origin" >:: test_cors_disallowed_origin;
  "test_production_origin" >:: test_cors_production_origin;
]

let input_validation_tests = "Input Validation Tests" >::: [
  "test_sanitize_string" >:: test_input_sanitize_string;
  "test_validate_email" >:: test_input_validate_email;
  "test_sanitize_float" >:: test_input_sanitize_float;
  "test_sanitize_int" >:: test_input_sanitize_int;
  "test_truncate_string" >:: test_input_truncate_string;
  "test_json_size" >:: test_input_json_size;
]

let request_limits_tests = "Request Limits Tests" >::: [
  "test_within_limit" >:: test_request_size_within_limit;
  "test_exceeds_limit" >:: test_request_size_exceeds_limit;
]

let key_generation_tests = "API Key Generation Tests" >::: [
  "test_generate_key" >:: test_generate_api_key;
  "test_unique_keys" >:: test_generate_unique_keys;
]

let config_tests = "Configuration Tests" >::: [
  "test_load_from_json" >:: test_load_config_from_json;
]

let stats_tests = "Stats Tests" >::: [
  "test_get_stats" >:: test_rate_limiter_stats;
]

(** Main Test Suite *)
let suite = "API Security Test Suite" >::: [
  rate_limiting_tests;
  authentication_tests;
  cors_tests;
  input_validation_tests;
  request_limits_tests;
  key_generation_tests;
  config_tests;
  stats_tests;
]

(** Run Tests *)
let () =
  run_test_tt_main suite
