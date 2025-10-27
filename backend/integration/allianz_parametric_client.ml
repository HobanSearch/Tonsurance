(** Allianz Parametric Insurance API Client
 *
 * Integration with Allianz's parametric insurance products for DeFi coverage.
 *
 * Note: This requires a partnership agreement with Allianz Commercial.
 * Current implementation uses estimated rates pending API access.
 *
 * API Documentation: [To be provided by Allianz]
 * Rate Limits: [To be confirmed]
 *
 * Environment Variables:
 * - ALLIANZ_API_KEY: API key for Allianz Parametric API
 * - ALLIANZ_API_SECRET: API secret
 * - ALLIANZ_PARTNER_ID: Partner identifier
 * - ALLIANZ_ENDPOINT: API endpoint (default: https://api.allianz.com/parametric/v1)
 * - ALLIANZ_TESTNET: Use testnet (true/false, default: false)
 *)

open Core
open Types

(** Configuration for Allianz API client *)
type config = {
  api_key: string;
  api_secret: string;
  partner_id: string;
  endpoint: string;
  testnet: bool;
  timeout_seconds: float;
} [@@deriving sexp]

(** Coverage types supported by Allianz parametric insurance *)
type allianz_coverage_type =
  | Depeg_risk
  | Bridge_failure
  | Smart_contract_exploit
  | Oracle_manipulation
  | CEX_insolvency
[@@deriving sexp]

(** Parametric quote from Allianz *)
type parametric_quote = {
  quote_id: string;
  coverage_type: allianz_coverage_type;
  coverage_amount_usd: float;
  duration_days: int;
  premium_usd: float;
  premium_rate: float; (* Premium as % of coverage *)
  valid_until: float; (* Unix timestamp *)
  terms_conditions_url: string;
} [@@deriving sexp]

(** Policy binding confirmation *)
type binding_confirmation = {
  policy_id: string;
  quote_id: string;
  bound_at: float;
  coverage_start: float;
  coverage_end: float;
  premium_paid_usd: float;
  policy_document_url: string;
} [@@deriving sexp]

(** Claim submission *)
type claim_submission = {
  claim_id: string;
  policy_id: string;
  event_timestamp: float;
  claim_amount_usd: float;
  supporting_evidence_urls: string list;
  submitted_at: float;
} [@@deriving sexp]

(** Claim status *)
type claim_status =
  | Submitted
  | Under_review
  | Approved of { payout_amount: float; payout_date: float }
  | Rejected of { reason: string }
  | Paid of { payout_amount: float; paid_at: float }
[@@deriving sexp]

(** Claim payout *)
type claim_payout = {
  claim_id: string;
  policy_id: string;
  status: claim_status;
  last_updated: float;
} [@@deriving sexp]

(** API errors *)
type allianz_error =
  | API_error of int * string (* HTTP code, message *)
  | Authentication_error of string
  | Invalid_coverage_type
  | Insufficient_capacity
  | Quote_expired
  | Policy_not_found
  | Claim_already_filed
  | Network_error of string
  | Parse_error of string
[@@deriving sexp]

module AllianzClient = struct
  (** Convert internal coverage type to Allianz type *)
  let coverage_type_to_allianz = function
    | Depeg -> Depeg_risk
    | Bridge -> Bridge_failure
    | Smart_contract -> Smart_contract_exploit
    | Oracle -> Oracle_manipulation
    | CEX_liquidation -> CEX_insolvency

  (** Get estimated premium rates by coverage type
   *
   * Note: These are estimated rates based on traditional parametric insurance.
   * Real rates will come from Allianz API once partnership is established.
   *)
  let get_estimated_rate (coverage_type: allianz_coverage_type) : float =
    match coverage_type with
    | Depeg_risk -> 0.0045 (* 0.45% - lowest risk, historically rare *)
    | Bridge_failure -> 0.0065 (* 0.65% - medium risk, multiple incidents *)
    | Smart_contract_exploit -> 0.0085 (* 0.85% - highest risk, common *)
    | Oracle_manipulation -> 0.0075 (* 0.75% - medium-high risk *)
    | CEX_insolvency -> 0.0055 (* 0.55% - medium-low risk *)

  (** Request quote from Allianz
   *
   * TODO: Replace with real API call once partnership established
   *)
  let request_quote
      ~(_config: config)
      ~(coverage_type: coverage_type)
      ~(coverage_amount_usd: float)
      ~(duration_days: int)
    : (parametric_quote, allianz_error) Result.t Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "[Allianz] Requesting quote: %s, $%.2f, %d days"
        (coverage_type_to_string coverage_type)
        coverage_amount_usd
        duration_days
    ) in

    try%lwt
      (* Convert coverage type *)
      let allianz_type = coverage_type_to_allianz coverage_type in

      (* Calculate premium using estimated rates *)
      let rate = get_estimated_rate allianz_type in
      let premium = coverage_amount_usd *. rate in

      (* Generate simulated quote *)
      let quote = {
        quote_id = Printf.sprintf "ALZ_%Ld" (Random.int64 100000000L);
        coverage_type = allianz_type;
        coverage_amount_usd;
        duration_days;
        premium_usd = premium;
        premium_rate = rate;
        valid_until = (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) +. 1800.0; (* Valid for 30 minutes *)
        terms_conditions_url = "https://allianz.com/parametric/terms";
      } in

      let%lwt () = Logs_lwt.info (fun m ->
        m "[Allianz] ✓ Quote received: %s, premium: $%.2f (%.4f%%)"
          quote.quote_id quote.premium_usd (quote.premium_rate *. 100.0)
      ) in

      (* TODO: Real API integration
       *
       * let url = Printf.sprintf "%s/quotes" config.endpoint in
       * let headers = [
       *   ("X-API-Key", config.api_key);
       *   ("X-Partner-ID", config.partner_id);
       *   ("Content-Type", "application/json");
       * ] in
       * let body = Yojson.Safe.to_string (`Assoc [
       *   ("coverage_type", `String (coverage_type_to_string coverage_type));
       *   ("coverage_amount", `Float coverage_amount_usd);
       *   ("duration_days", `Int duration_days);
       *   ("currency", `String "USD");
       * ]) in
       *
       * let%lwt response = Http_client.post ~url ~headers ~body ~timeout:config.timeout_seconds in
       *
       * match response.status_code with
       * | 200 ->
       *     let json = Yojson.Safe.from_string response.body in
       *     let quote = parametric_quote_of_yojson json in
       *     Lwt.return (Ok quote)
       * | 401 -> Lwt.return (Error (Authentication_error "Invalid API key"))
       * | 429 -> Lwt.return (Error (API_error (429, "Rate limit exceeded")))
       * | code -> Lwt.return (Error (API_error (code, response.body)))
       *)

      Lwt.return (Ok quote)

    with exn ->
      let%lwt () = Logs_lwt.err (fun m ->
        m "[Allianz] Exception requesting quote: %s" (Exn.to_string exn)
      ) in
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** Bind coverage (convert quote to active policy)
   *
   * TODO: Replace with real API call
   *)
  let bind_coverage
      ~(_config: config)
      ~(quote_id: string)
      ~(policy_holder_id: string)
    : (binding_confirmation, allianz_error) Result.t Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "[Allianz] Binding coverage: quote_id=%s, holder=%s" quote_id policy_holder_id
    ) in

    try%lwt
      let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

      (* Simulated binding *)
      let confirmation = {
        policy_id = Printf.sprintf "POL_ALZ_%Ld" (Random.int64 100000000L);
        quote_id;
        bound_at = now;
        coverage_start = now;
        coverage_end = now +. (30.0 *. 86400.0); (* 30 days *)
        premium_paid_usd = 100.0; (* Placeholder *)
        policy_document_url = Printf.sprintf "https://allianz.com/policies/POL_ALZ_%Ld" (Random.int64 100000000L);
      } in

      let%lwt () = Logs_lwt.info (fun m ->
        m "[Allianz] ✓ Coverage bound: policy_id=%s" confirmation.policy_id
      ) in

      (* TODO: Real API integration
       *
       * let url = Printf.sprintf "%s/quotes/%s/bind" config.endpoint quote_id in
       * let headers = [
       *   ("X-API-Key", config.api_key);
       *   ("X-Partner-ID", config.partner_id);
       *   ("Content-Type", "application/json");
       * ] in
       * let body = Yojson.Safe.to_string (`Assoc [
       *   ("policy_holder_id", `String policy_holder_id);
       *   ("payment_method", `String "crypto"); (* TON/USDT payment *)
       * ]) in
       *
       * let%lwt response = Http_client.post ~url ~headers ~body ~timeout:config.timeout_seconds in
       * (* Parse response and return binding_confirmation *)
       *)

      Lwt.return (Ok confirmation)

    with exn ->
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** File claim for parametric payout
   *
   * TODO: Replace with real API call
   *)
  let file_claim
      ~(_config: config)
      ~(policy_id: string)
      ~(event_timestamp: float)
      ~(claim_amount_usd: float)
      ~(evidence_urls: string list)
    : (claim_submission, allianz_error) Result.t Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "[Allianz] Filing claim: policy=%s, amount=$%.2f" policy_id claim_amount_usd
    ) in

    try%lwt
      let submission = {
        claim_id = Printf.sprintf "CLM_ALZ_%Ld" (Random.int64 100000000L);
        policy_id;
        event_timestamp;
        claim_amount_usd;
        supporting_evidence_urls = evidence_urls;
        submitted_at = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      } in

      let%lwt () = Logs_lwt.info (fun m ->
        m "[Allianz] ✓ Claim filed: claim_id=%s" submission.claim_id
      ) in

      (* TODO: Real API integration
       *
       * let url = Printf.sprintf "%s/policies/%s/claims" config.endpoint policy_id in
       * let headers = [
       *   ("X-API-Key", config.api_key);
       *   ("X-Partner-ID", config.partner_id);
       *   ("Content-Type", "application/json");
       * ] in
       * let body = Yojson.Safe.to_string (`Assoc [
       *   ("event_timestamp", `Int (Int.of_float event_timestamp));
       *   ("claim_amount", `Float claim_amount_usd);
       *   ("evidence", `List (List.map evidence_urls ~f:(fun url -> `String url)));
       * ]) in
       *
       * let%lwt response = Http_client.post ~url ~headers ~body ~timeout:config.timeout_seconds in
       * (* Parse response and return claim_submission *)
       *)

      Lwt.return (Ok submission)

    with exn ->
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** Check claim status and payout
   *
   * TODO: Replace with real API call
   *)
  let get_claim_status
      ~(_config: config)
      ~(claim_id: string)
    : (claim_payout, allianz_error) Result.t Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "[Allianz] Checking claim status: %s" claim_id
    ) in

    try%lwt
      (* Simulated claim status - typically takes 3-5 business days *)
      let status = Under_review in

      let payout = {
        claim_id;
        policy_id = "POL_PLACEHOLDER";
        status;
        last_updated = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
      } in

      let%lwt () = Logs_lwt.info (fun m ->
        m "[Allianz] ✓ Claim status: Under review"
      ) in

      (* TODO: Real API integration
       *
       * let url = Printf.sprintf "%s/claims/%s" config.endpoint claim_id in
       * let headers = [
       *   ("X-API-Key", config.api_key);
       *   ("X-Partner-ID", config.partner_id);
       * ] in
       *
       * let%lwt response = Http_client.get ~url ~headers ~timeout:config.timeout_seconds in
       * (* Parse response and return claim_payout with actual status *)
       *)

      Lwt.return (Ok payout)

    with exn ->
      Lwt.return (Error (Network_error (Exn.to_string exn)))

  (** Create Allianz client from environment *)
  let create_from_env () : config =
    let api_key = Option.value (Sys.getenv "ALLIANZ_API_KEY") ~default:"demo_key" in
    let api_secret = Option.value (Sys.getenv "ALLIANZ_API_SECRET") ~default:"demo_secret" in
    let partner_id = Option.value (Sys.getenv "ALLIANZ_PARTNER_ID") ~default:"TONSURANCE_001" in
    let endpoint = Option.value (Sys.getenv "ALLIANZ_ENDPOINT")
      ~default:"https://api.allianz.com/parametric/v1" in
    let testnet = Option.value_map (Sys.getenv "ALLIANZ_TESTNET")
      ~default:false ~f:(fun v -> String.(v = "true" || v = "1")) in

    {
      api_key;
      api_secret;
      partner_id;
      endpoint;
      testnet;
      timeout_seconds = 30.0;
    }

  (** Get capacity available for coverage type
   *
   * Note: Allianz typically has $100M+ capacity per line of business
   *)
  let get_available_capacity
      ~(_config: config)
      ~(coverage_type: coverage_type)
    : float Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "[Allianz] Checking capacity for %s" (coverage_type_to_string coverage_type)
    ) in

    (* Simulated capacity - real values would come from API *)
    let capacity = match coverage_type with
      | Depeg -> 50_000_000.0 (* $50M for stablecoin depeg *)
      | Bridge -> 25_000_000.0 (* $25M for bridge failures *)
      | Smart_contract -> 75_000_000.0 (* $75M for smart contract risk *)
      | Oracle -> 30_000_000.0 (* $30M for oracle manipulation *)
      | CEX_liquidation -> 100_000_000.0 (* $100M for CEX insolvency *)
    in

    let%lwt () = Logs_lwt.info (fun m ->
      m "[Allianz] Available capacity: $%.2fM" (capacity /. 1_000_000.0)
    ) in

    Lwt.return capacity
end
