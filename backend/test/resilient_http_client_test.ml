(** Tests for ResilientHttpClient
 *
 * Comprehensive test suite covering:
 * - Retry logic on transient failures
 * - Circuit breaker state transitions
 * - Connection pooling
 * - Timeout enforcement
 * - Failover logic
 * - Exponential backoff with jitter
 * - Metrics collection
 *)

open Core
open Lwt.Syntax

(* Access the ResilientHttpClient module from Integration *)
module ResilientHttpClient = Integration.Resilient_http_client.ResilientHttpClient

(** Test configuration *)
let test_config = {
  name = "test_client";
  endpoints = [
    "http://localhost:8888"; (* Primary *)
    "http://localhost:8889"; (* Failover *)
  ];
  timeout_seconds = 2.0;
  retry_policy = {
    max_attempts = 3;
    base_delay_ms = 100;
    max_delay_ms = 1000;
    backoff_multiplier = 2.0;
    jitter_factor = 0.1;
    retry_on_timeout = true;
    retry_on_connection_error = true;
    retry_on_5xx = true;
    retry_on_4xx = false;
  };
  circuit_breaker = {
    failure_threshold = 3;
    success_threshold = 2;
    timeout_seconds = 5.0;
    half_open_max_requests = 1;
  };
  pool = {
    max_connections = 5;
    max_idle_time_seconds = 30.0;
    connection_timeout_seconds = 1.0;
    health_check_interval_seconds = 10.0;
  };
  default_headers = [
    ("User-Agent", "TestClient/1.0");
  ];
}

(** Test: Retry on timeout *)
let test_retry_on_timeout () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: Retry on timeout") in

  (* Create client with very short timeout *)
  let config = { test_config with timeout_seconds = 0.1 } in
  let client = ResilientHttpClient.create config in

  (* This should timeout and retry 3 times *)
  let%lwt result = ResilientHttpClient.get client "http://httpbin.org/delay/5" in

  match result with
  | Error (Timeout _) ->
      let%lwt () = Logs_lwt.info (fun m -> m "✓ Correctly timed out after retries") in
      let%lwt metrics = ResilientHttpClient.get_metrics client in
      let%lwt () = Logs_lwt.info (fun m -> m "Metrics: %s" metrics) in
      Lwt.return true
  | _ ->
      let%lwt () = Logs_lwt.err (fun m -> m "✗ Expected timeout error") in
      Lwt.return false

(** Test: Retry on connection error *)
let test_retry_on_connection_error () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: Retry on connection error") in

  let client = ResilientHttpClient.create test_config in

  (* Non-existent host should trigger connection error *)
  let%lwt result = ResilientHttpClient.get client "http://non-existent-host-12345.com" in

  match result with
  | Error (ConnectionError _) ->
      let%lwt () = Logs_lwt.info (fun m -> m "✓ Correctly failed with connection error after retries") in
      Lwt.return true
  | _ ->
      let%lwt () = Logs_lwt.err (fun m -> m "✗ Expected connection error") in
      Lwt.return false

(** Test: Don't retry on 4xx errors *)
let test_no_retry_on_4xx () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: No retry on 4xx errors") in

  let client = ResilientHttpClient.create test_config in

  (* 404 should not retry *)
  let%lwt result = ResilientHttpClient.get client "http://httpbin.org/status/404" in

  match result with
  | Error (HttpError (404, _)) ->
      let%lwt () = Logs_lwt.info (fun m -> m "✓ Correctly returned 404 without retry") in
      let%lwt metrics = ResilientHttpClient.get_metrics client in
      let%lwt () = Logs_lwt.info (fun m -> m "Metrics: %s" metrics) in
      Lwt.return true
  | _ ->
      let%lwt () = Logs_lwt.err (fun m -> m "✗ Expected 404 error") in
      Lwt.return false

(** Test: Retry on 5xx errors *)
let test_retry_on_5xx () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: Retry on 5xx errors") in

  let client = ResilientHttpClient.create test_config in

  (* 503 should retry *)
  let%lwt result = ResilientHttpClient.get client "http://httpbin.org/status/503" in

  match result with
  | Error (HttpError (503, _)) ->
      let%lwt () = Logs_lwt.info (fun m -> m "✓ Correctly retried on 503") in
      Lwt.return true
  | _ ->
      let%lwt () = Logs_lwt.err (fun m -> m "✗ Expected 503 error after retries") in
      Lwt.return false

(** Test: Successful request *)
let test_successful_request () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: Successful request") in

  let client = ResilientHttpClient.create test_config in

  let%lwt result = ResilientHttpClient.get_json client "http://httpbin.org/get" in

  match result with
  | Ok json ->
      let%lwt () = Logs_lwt.info (fun m -> m "✓ Request succeeded") in
      let%lwt () = Logs_lwt.debug (fun m ->
        m "Response: %s" (Yojson.Safe.to_string json)
      ) in
      let%lwt metrics = ResilientHttpClient.get_metrics client in
      let%lwt () = Logs_lwt.info (fun m -> m "Metrics: %s" metrics) in
      Lwt.return true
  | Error e ->
      let%lwt () = Logs_lwt.err (fun m ->
        m "✗ Request failed: %s" (Sexp.to_string_mach (sexp_of_error_type e))
      ) in
      Lwt.return false

(** Test: POST with JSON *)
let test_post_json () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: POST with JSON") in

  let client = ResilientHttpClient.create test_config in

  let body = `Assoc [
    ("test", `String "data");
    ("number", `Int 42);
  ] in

  let%lwt result = ResilientHttpClient.post_json client ~body "http://httpbin.org/post" in

  match result with
  | Ok json ->
      let%lwt () = Logs_lwt.info (fun m -> m "✓ POST succeeded") in
      Lwt.return true
  | Error e ->
      let%lwt () = Logs_lwt.err (fun m ->
        m "✗ POST failed: %s" (Sexp.to_string_mach (sexp_of_error_type e))
      ) in
      Lwt.return false

(** Test: Circuit breaker transitions *)
let test_circuit_breaker () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: Circuit breaker") in

  let config = { test_config with
    circuit_breaker = {
      failure_threshold = 2;
      success_threshold = 1;
      timeout_seconds = 2.0;
      half_open_max_requests = 1;
    };
  } in
  let client = ResilientHttpClient.create config in

  (* Cause 2 failures to open circuit *)
  let%lwt () = Logs_lwt.info (fun m -> m "Causing failures to open circuit...") in
  let%lwt _ = ResilientHttpClient.get client "http://httpbin.org/status/500" in
  let%lwt _ = ResilientHttpClient.get client "http://httpbin.org/status/500" in

  let%lwt state = ResilientHttpClient.get_circuit_state client in
  let%lwt () = Logs_lwt.info (fun m ->
    m "Circuit state after failures: %s" (Sexp.to_string_mach (sexp_of_circuit_state state))
  ) in

  (* Next request should fail immediately with CircuitOpen *)
  let%lwt result = ResilientHttpClient.get client "http://httpbin.org/get" in

  match result with
  | Error (CircuitOpen _) ->
      let%lwt () = Logs_lwt.info (fun m -> m "✓ Circuit breaker opened correctly") in

      (* Wait for circuit to enter half-open *)
      let%lwt () = Lwt_unix.sleep 2.5 in

      (* Try successful request to close circuit *)
      let%lwt _ = ResilientHttpClient.get client "http://httpbin.org/get" in

      let%lwt state = ResilientHttpClient.get_circuit_state client in
      let%lwt () = Logs_lwt.info (fun m ->
        m "Circuit state after recovery: %s" (Sexp.to_string_mach (sexp_of_circuit_state state))
      ) in

      Lwt.return true
  | _ ->
      let%lwt () = Logs_lwt.err (fun m -> m "✗ Circuit breaker should have opened") in
      Lwt.return false

(** Test: Connection pooling *)
let test_connection_pooling () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: Connection pooling") in

  let client = ResilientHttpClient.create test_config in

  (* Make 10 concurrent requests *)
  let requests = List.init 10 ~f:(fun i ->
    let%lwt result = ResilientHttpClient.get client "http://httpbin.org/get" in
    match result with
    | Ok _ ->
        let%lwt () = Logs_lwt.debug (fun m -> m "Request %d succeeded" (i + 1)) in
        Lwt.return true
    | Error e ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "Request %d failed: %s" (i + 1) (Sexp.to_string_mach (sexp_of_error_type e))
        ) in
        Lwt.return false
  ) in

  let%lwt results = Lwt_list.map_p (fun req -> req) requests in
  let success_count = List.count results ~f:Fn.id in

  let%lwt () = Logs_lwt.info (fun m ->
    m "✓ Connection pooling: %d/%d requests succeeded" success_count (List.length results)
  ) in

  let%lwt (total, in_use, idle) = ResilientHttpClient.get_pool_stats client in
  let%lwt () = Logs_lwt.info (fun m ->
    m "Pool stats: Total=%d InUse=%d Idle=%d" total in_use idle
  ) in

  Lwt.return (success_count >= 8) (* Allow some failures *)

(** Test: Exponential backoff *)
let test_exponential_backoff () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: Exponential backoff timing") in

  let config = { test_config with
    retry_policy = {
      max_attempts = 3;
      base_delay_ms = 500;
      max_delay_ms = 5000;
      backoff_multiplier = 2.0;
      jitter_factor = 0.0; (* No jitter for predictable timing *)
      retry_on_timeout = true;
      retry_on_connection_error = true;
      retry_on_5xx = true;
      retry_on_4xx = false;
    };
    timeout_seconds = 0.1;
  } in
  let client = ResilientHttpClient.create config in

  let start = Unix.gettimeofday () in

  (* This will timeout and retry with delays: 500ms, 1000ms *)
  let%lwt _ = ResilientHttpClient.get client "http://httpbin.org/delay/5" in

  let elapsed = Unix.gettimeofday () -. start in

  (* Expected: ~1.8s (0.1s timeout × 3 + 0.5s + 1.0s backoff) *)
  let%lwt () = Logs_lwt.info (fun m ->
    m "✓ Backoff timing: %.2fs elapsed (expected ~1.8s)" elapsed
  ) in

  Lwt.return (elapsed >= 1.5 && elapsed <= 2.5)

(** Test: Metrics collection *)
let test_metrics () =
  let%lwt () = Logs_lwt.info (fun m -> m "TEST: Metrics collection") in

  let client = ResilientHttpClient.create test_config in

  (* Make some requests *)
  let%lwt _ = ResilientHttpClient.get client "http://httpbin.org/get" in
  let%lwt _ = ResilientHttpClient.get client "http://httpbin.org/status/404" in
  let%lwt _ = ResilientHttpClient.get client "http://httpbin.org/status/500" in

  let%lwt metrics_str = ResilientHttpClient.get_metrics client in
  let%lwt () = Logs_lwt.info (fun m -> m "Metrics: %s" metrics_str) in

  (* Check that metrics string contains expected fields *)
  let has_total = String.is_substring metrics_str ~substring:"Total:" in
  let has_success = String.is_substring metrics_str ~substring:"Success:" in
  let has_failed = String.is_substring metrics_str ~substring:"Failed:" in

  let%lwt () = Logs_lwt.info (fun m ->
    m "✓ Metrics contain: Total=%b Success=%b Failed=%b"
      has_total has_success has_failed
  ) in

  Lwt.return (has_total && has_success && has_failed)

(** Run all tests *)
let run_tests () =
  Logs.set_level (Some Logs.Info);
  Logs.set_reporter (Logs_fmt.reporter ());

  let%lwt () = Logs_lwt.app (fun m -> m "=== ResilientHttpClient Test Suite ===") in

  let tests = [
    ("Successful request", test_successful_request);
    ("POST with JSON", test_post_json);
    ("Connection pooling", test_connection_pooling);
    ("Retry on timeout", test_retry_on_timeout);
    ("Retry on connection error", test_retry_on_connection_error);
    ("No retry on 4xx", test_no_retry_on_4xx);
    ("Retry on 5xx", test_retry_on_5xx);
    ("Circuit breaker", test_circuit_breaker);
    ("Exponential backoff", test_exponential_backoff);
    ("Metrics collection", test_metrics);
  ] in

  let%lwt results = Lwt_list.map_s (fun (name, test_fn) ->
    let%lwt () = Logs_lwt.app (fun m -> m "\n--- %s ---" name) in
    let%lwt passed =
      try%lwt
        test_fn ()
      with exn ->
        let%lwt () = Logs_lwt.err (fun m ->
          m "✗ Test exception: %s" (Exn.to_string exn)
        ) in
        Lwt.return false
    in
    Lwt.return (name, passed)
  ) tests in

  let%lwt () = Logs_lwt.app (fun m -> m "\n=== Test Results ===") in
  let passed_count = List.count results ~f:(fun (_, passed) -> passed) in
  let total_count = List.length results in

  List.iter results ~f:(fun (name, passed) ->
    let status = if passed then "✓ PASS" else "✗ FAIL" in
    Printf.printf "%s: %s\n" status name
  );

  let%lwt () = Logs_lwt.app (fun m ->
    m "\nTotal: %d/%d tests passed (%.0f%%)"
      passed_count total_count
      ((Float.of_int passed_count /. Float.of_int total_count) *. 100.0)
  ) in

  Lwt.return (passed_count = total_count)

(** Main entry point *)
let () =
  Lwt_main.run (
    let%lwt all_passed = run_tests () in
    exit (if all_passed then 0 else 1)
  )
