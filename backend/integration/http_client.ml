(** Reusable HTTP Client with Retry, Timeout, and Rate Limiting
 *
 * Provides a unified HTTP client for all external API integrations.
 * Features:
 * - Exponential backoff retry (3 attempts: 1s, 2s, 4s)
 * - Configurable timeouts (default 10s)
 * - Request/response logging
 * - Rate limiting support
 * - Circuit breaker pattern for failing services
 *)

open Core

module HttpClient = struct

  (** HTTP method types *)
  type http_method =
    | GET
    | POST
    | PUT
    | DELETE
  [@@deriving sexp]

  (** Request configuration *)
  type request_config = {
    url: string;
    method_: http_method;
    headers: (string * string) list;
    body: string option;
    timeout_seconds: float;
    retry_attempts: int;
    retry_delays: float list; (* Delay after each attempt in seconds *)
  } [@@deriving sexp]

  (** Response type *)
  type response = {
    status_code: int;
    headers: (string * string) list;
    body: string;
    request_time_ms: float;
  } [@@deriving sexp]

  (** Error types *)
  type http_error =
    | Timeout
    | Connection_error of string
    | HTTP_error of int * string
    | Parse_error of string
    | Rate_limited
  [@@deriving sexp]

  (** Default configuration *)
  let default_config url = {
    url;
    method_ = GET;
    headers = [];
    body = None;
    timeout_seconds = 10.0;
    retry_attempts = 3;
    retry_delays = [1.0; 2.0; 4.0]; (* Exponential backoff *)
  }

  (** Convert HTTP method to Cohttp method *)
  let method_to_cohttp = function
    | GET -> `GET
    | POST -> `POST
    | PUT -> `PUT
    | DELETE -> `DELETE

  (** Execute HTTP request with timeout *)
  let execute_with_timeout
      ~(config: request_config)
    : (response, http_error) Result.t Lwt.t =

    let start_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

    let timeout_promise =
      let%lwt () = Lwt_unix.sleep config.timeout_seconds in
      Lwt.return (Error Timeout)
    in

    let request_promise =
      try%lwt
        let uri = Uri.of_string config.url in
        let headers = Cohttp.Header.of_list config.headers in
        let _method_ = method_to_cohttp config.method_ in

        let%lwt (resp, body) = match config.method_ with
          | GET ->
              Cohttp_lwt_unix.Client.get ~headers uri
          | POST ->
              let body_content = match config.body with
                | Some b -> `String b
                | None -> `Empty
              in
              Cohttp_lwt_unix.Client.post ~body:body_content ~headers uri
          | PUT ->
              let body_content = match config.body with
                | Some b -> `String b
                | None -> `Empty
              in
              Cohttp_lwt_unix.Client.put ~body:body_content ~headers uri
          | DELETE ->
              Cohttp_lwt_unix.Client.delete ~headers uri
        in

        let%lwt body_string = Cohttp_lwt.Body.to_string body in
        let end_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
        let request_time_ms = (end_time -. start_time) *. 1000.0 in

        let status = Cohttp.Response.status resp in
        let status_code = Cohttp.Code.code_of_status status in

        let response_headers =
          Cohttp.Header.to_list (Cohttp.Response.headers resp)
        in

        if Cohttp.Code.is_success status_code then
          Lwt.return (Ok {
            status_code;
            headers = response_headers;
            body = body_string;
            request_time_ms;
          })
        else
          Lwt.return (Error (HTTP_error (status_code, body_string)))

      with
      | Sys_error msg ->
          Lwt.return (Error (Connection_error msg))
      | exn ->
          Lwt.return (Error (Connection_error (Exn.to_string exn)))
    in

    Lwt.pick [request_promise; timeout_promise]

  (** Execute request with retry logic *)
  let execute_with_retry
      ~(config: request_config)
    : (response, http_error) Result.t Lwt.t =

    let rec attempt_request attempt_num delays_remaining =
      let%lwt result = execute_with_timeout ~config in

      match result with
      | Ok response ->
          let%lwt () = Logs_lwt.debug (fun m ->
            m "HTTP %s %s -> %d (%.1fms, attempt %d/%d)"
              (Sexp.to_string (sexp_of_http_method config.method_))
              config.url
              response.status_code
              response.request_time_ms
              attempt_num
              config.retry_attempts
          ) in
          Lwt.return (Ok response)

      | Error error when attempt_num >= config.retry_attempts ->
          let%lwt () = Logs_lwt.err (fun m ->
            m "HTTP %s %s FAILED after %d attempts: %s"
              (Sexp.to_string (sexp_of_http_method config.method_))
              config.url
              config.retry_attempts
              (Sexp.to_string (sexp_of_http_error error))
          ) in
          Lwt.return (Error error)

      | Error error ->
          let should_retry = match error with
            | Timeout -> true
            | Connection_error _ -> true
            | HTTP_error (code, _) -> code >= 500 (* Retry on server errors *)
            | Rate_limited -> true
            | Parse_error _ -> false (* Don't retry parse errors *)
          in

          if should_retry && not (List.is_empty delays_remaining) then begin
            let delay = List.hd_exn delays_remaining in
            let%lwt () = Logs_lwt.warn (fun m ->
              m "HTTP %s %s failed (attempt %d/%d): %s. Retrying in %.1fs..."
                (Sexp.to_string (sexp_of_http_method config.method_))
                config.url
                attempt_num
                config.retry_attempts
                (Sexp.to_string (sexp_of_http_error error))
                delay
            ) in
            let%lwt () = Lwt_unix.sleep delay in
            attempt_request (attempt_num + 1) (List.tl_exn delays_remaining)
          end else
            Lwt.return (Error error)
    in

    attempt_request 1 config.retry_delays

  (** Simple GET request *)
  let get
      ?(headers=[])
      ?(timeout=10.0)
      ?(retry_attempts=3)
      (url: string)
    : (response, http_error) Result.t Lwt.t =

    let config = {
      url;
      method_ = GET;
      headers;
      body = None;
      timeout_seconds = timeout;
      retry_attempts;
      retry_delays = [1.0; 2.0; 4.0];
    } in
    execute_with_retry ~config

  (** Simple POST request *)
  let post
      ?(headers=[])
      ?(timeout=10.0)
      ?(retry_attempts=3)
      ~(body: string)
      (url: string)
    : (response, http_error) Result.t Lwt.t =

    let config = {
      url;
      method_ = POST;
      headers;
      body = Some body;
      timeout_seconds = timeout;
      retry_attempts;
      retry_delays = [1.0; 2.0; 4.0];
    } in
    execute_with_retry ~config

  (** Parse JSON response *)
  let parse_json_response
      (response: response)
    : (Yojson.Safe.t, http_error) Result.t =

    try
      Ok (Yojson.Safe.from_string response.body)
    with
    | Yojson.Json_error msg ->
        Error (Parse_error (Printf.sprintf "JSON parse error: %s" msg))
    | exn ->
        Error (Parse_error (Exn.to_string exn))

  (** Get with JSON parsing *)
  let get_json
      ?(headers=[])
      ?(timeout=10.0)
      ?(retry_attempts=3)
      (url: string)
    : (Yojson.Safe.t, http_error) Result.t Lwt.t =

    let%lwt result = get ~headers ~timeout ~retry_attempts url in
    match result with
    | Ok response -> Lwt.return (parse_json_response response)
    | Error e -> Lwt.return (Error e)

  (** Post with JSON parsing *)
  let post_json
      ?(headers=[])
      ?(timeout=10.0)
      ?(retry_attempts=3)
      ~(body: string)
      (url: string)
    : (Yojson.Safe.t, http_error) Result.t Lwt.t =

    let%lwt result = post ~headers ~timeout ~retry_attempts ~body url in
    match result with
    | Ok response -> Lwt.return (parse_json_response response)
    | Error e -> Lwt.return (Error e)

  (** Rate limiter using token bucket algorithm *)
  module RateLimiter = struct
    type t = {
      tokens: float ref;
      max_tokens: float;
      refill_rate: float; (* Tokens per second *)
      last_refill: float ref;
      mutex: Lwt_mutex.t;
    }

    let create ~(max_requests_per_second: float) : t =
      {
        tokens = ref max_requests_per_second;
        max_tokens = max_requests_per_second;
        refill_rate = max_requests_per_second;
        last_refill = ref (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec);
        mutex = Lwt_mutex.create ();
      }

    let refill (limiter: t) : unit =
      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
      let elapsed = now -. !(limiter.last_refill) in
      let new_tokens = Float.min
        limiter.max_tokens
        (!(limiter.tokens) +. (elapsed *. limiter.refill_rate))
      in
      limiter.tokens := new_tokens;
      limiter.last_refill := now

    let acquire (limiter: t) : unit Lwt.t =
      Lwt_mutex.with_lock limiter.mutex (fun () ->
        let rec wait_for_token () =
          refill limiter;
          if Float.(!(limiter.tokens) >= 1.0) then begin
            limiter.tokens := !(limiter.tokens) -. 1.0;
            Lwt.return ()
          end else begin
            (* Wait until next token available *)
            let wait_time = 1.0 /. limiter.refill_rate in
            let%lwt () = Lwt_unix.sleep wait_time in
            wait_for_token ()
          end
        in
        wait_for_token ()
      )
  end

  (** Circuit breaker for failing services *)
  module CircuitBreaker = struct
    type state =
      | Closed (* Normal operation *)
      | Open of float (* Open with reset time *)
      | HalfOpen (* Testing if service recovered *)
    [@@deriving sexp]

    type t = {
      mutable state: state;
      failure_threshold: int;
      mutable failure_count: int;
      success_threshold: int;
      mutable success_count: int;
      timeout_seconds: float;
      mutex: Lwt_mutex.t;
    }

    let create
        ?(failure_threshold=5)
        ?(success_threshold=2)
        ?(timeout_seconds=60.0)
        ()
      : t =
      {
        state = Closed;
        failure_threshold;
        failure_count = 0;
        success_threshold;
        success_count = 0;
        timeout_seconds;
        mutex = Lwt_mutex.create ();
      }

    let should_allow_request (breaker: t) : bool Lwt.t =
      Lwt_mutex.with_lock breaker.mutex (fun () ->
        match breaker.state with
        | Closed -> Lwt.return true
        | HalfOpen -> Lwt.return true
        | Open reset_time ->
            let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
            if Float.(now >= reset_time) then begin
              breaker.state <- HalfOpen;
              breaker.success_count <- 0;
              Lwt.return true
            end else
              Lwt.return false
      )

    let record_success (breaker: t) : unit Lwt.t =
      Lwt_mutex.with_lock breaker.mutex (fun () ->
        match breaker.state with
        | Closed ->
            breaker.failure_count <- 0;
            Lwt.return ()
        | HalfOpen ->
            breaker.success_count <- breaker.success_count + 1;
            if breaker.success_count >= breaker.success_threshold then begin
              breaker.state <- Closed;
              breaker.failure_count <- 0;
              breaker.success_count <- 0;
              let%lwt () = Logs_lwt.info (fun m ->
                m "Circuit breaker: state changed to CLOSED"
              ) in
              Lwt.return ()
            end else
              Lwt.return ()
        | Open _ ->
            Lwt.return ()
      )

    let record_failure (breaker: t) : unit Lwt.t =
      Lwt_mutex.with_lock breaker.mutex (fun () ->
        breaker.failure_count <- breaker.failure_count + 1;
        match breaker.state with
        | Closed when breaker.failure_count >= breaker.failure_threshold ->
            let reset_time = (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) +. breaker.timeout_seconds in
            breaker.state <- Open reset_time;
            let%lwt () = Logs_lwt.warn (fun m ->
              m "Circuit breaker: state changed to OPEN (reset in %.0fs)"
                breaker.timeout_seconds
            ) in
            Lwt.return ()
        | HalfOpen ->
            let reset_time = (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) +. breaker.timeout_seconds in
            breaker.state <- Open reset_time;
            let%lwt () = Logs_lwt.warn (fun m ->
              m "Circuit breaker: state changed to OPEN from HALF_OPEN"
            ) in
            Lwt.return ()
        | _ ->
            Lwt.return ()
      )

    let execute (breaker: t) (f: unit -> 'a Lwt.t) : ('a option, http_error) Result.t Lwt.t =
      let%lwt allowed = should_allow_request breaker in
      if not allowed then
        Lwt.return (Error Rate_limited)
      else
        try%lwt
          let%lwt result = f () in
          let%lwt () = record_success breaker in
          Lwt.return (Ok (Some result))
        with exn ->
          let%lwt () = record_failure breaker in
          Lwt.return (Error (Connection_error (Exn.to_string exn)))
  end

end
