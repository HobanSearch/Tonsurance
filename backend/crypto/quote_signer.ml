(** Quote Signer
 *
 * Cryptographic signing for API quote data to prevent tampering.
 * Uses HMAC-SHA256 for secure, fast signing without public key crypto.
 *
 * Security:
 * - Secret key stored in environment variable
 * - Signatures expire after deadline
 * - Quotes are bound to user address
 * - Replay attacks prevented by deadline enforcement
 *)

open Core

module QuoteSigner = struct

  (** Configuration *)
  type config = {
    secret_key: string;
    signature_version: int;
  }

  (** Load configuration from environment *)
  let load_config () : config =
    let secret_key = match Sys.getenv "QUOTE_SIGNING_KEY" with
      | Some key ->
          (* Validate key meets minimum security requirements *)
          if String.length key < 32 then begin
            Logs.err (fun m -> m "QUOTE_SIGNING_KEY must be at least 32 characters for security");
            failwith "QUOTE_SIGNING_KEY too short (min 32 characters required)"
          end;
          Logs.info (fun m -> m "Quote signing key loaded successfully (%d chars)" (String.length key));
          key
      | None ->
          (* SECURITY: Fail fast if signing key not configured *)
          Logs.err (fun m -> m "FATAL: QUOTE_SIGNING_KEY environment variable not set. Application cannot start without a signing key.");
          Logs.err (fun m -> m "Generate a secure key with: openssl rand -hex 32");
          failwith "QUOTE_SIGNING_KEY not configured - refusing to start with insecure defaults"
    in
    {
      secret_key;
      signature_version = 1;
    }

  (** Compute HMAC-SHA256 signature *)
  let hmac_sha256 (key: string) (message: string) : string =
    (* Use Cryptokit for HMAC *)
    let mac = Cryptokit.MAC.hmac_sha256 key in
    Cryptokit.hash_string mac message
    |> Cryptokit.transform_string (Cryptokit.Hexa.encode ())

  (** Create canonical message for signing *)
  let create_signing_message
      ~(premium_cents: int64)
      ~(deadline: float)
      ~(user_address: string)
      ~(coverage_amount_cents: int64)
      ~(trigger_price: float)
      ~(floor_price: float)
      ~(duration_days: int)
      ~(asset: Types.asset)
    : string =

    (* Canonical format prevents signature reuse *)
    Printf.sprintf "v1|premium=%Ld|deadline=%.0f|user=%s|coverage=%Ld|trigger=%.6f|floor=%.6f|duration=%d|asset=%s"
      premium_cents
      deadline
      user_address
      coverage_amount_cents
      trigger_price
      floor_price
      duration_days
      (Types.asset_to_string asset)

  (** Sign a quote *)
  let sign_quote
      (config: config)
      ~(premium_cents: int64)
      ~(deadline: float)
      ~(user_address: string)
      ~(coverage_amount_cents: int64)
      ~(trigger_price: float)
      ~(floor_price: float)
      ~(duration_days: int)
      ~(asset: Types.asset)
    : string =

    let message = create_signing_message
      ~premium_cents
      ~deadline
      ~user_address
      ~coverage_amount_cents
      ~trigger_price
      ~floor_price
      ~duration_days
      ~asset
    in

    hmac_sha256 config.secret_key message

  (** Verify a quote signature *)
  let verify_quote
      (config: config)
      ~(signature: string)
      ~(premium_cents: int64)
      ~(deadline: float)
      ~(user_address: string)
      ~(coverage_amount_cents: int64)
      ~(trigger_price: float)
      ~(floor_price: float)
      ~(duration_days: int)
      ~(asset: Types.asset)
    : bool =

    (* Check deadline first *)
    let current_time = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    if Float.(current_time > deadline) then begin
      Logs.warn (fun m -> m "Quote expired: deadline %.0f, current %.0f" deadline current_time);
      false
    end else begin
      (* Verify signature *)
      let expected_sig = sign_quote
        config
        ~premium_cents
        ~deadline
        ~user_address
        ~coverage_amount_cents
        ~trigger_price
        ~floor_price
        ~duration_days
        ~asset
      in

      let valid = String.equal signature expected_sig in
      if not valid then
        Logs.warn (fun m -> m "Invalid quote signature for user %s" user_address);
      valid
    end

  (** Create signed quote response *)
  let create_signed_quote
      (config: config)
      ~(premium_cents: int64)
      ~(user_address: string)
      ~(coverage_amount_cents: int64)
      ~(trigger_price: float)
      ~(floor_price: float)
      ~(duration_days: int)
      ~(asset: Types.asset)
      ~(quote_validity_seconds: float)
    : Yojson.Safe.t =

    let deadline = (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) +. quote_validity_seconds in

    let signature = sign_quote
      config
      ~premium_cents
      ~deadline
      ~user_address
      ~coverage_amount_cents
      ~trigger_price
      ~floor_price
      ~duration_days
      ~asset
    in

    (* Return structured JSON *)
    `Assoc [
      ("quote", `Assoc [
        ("premium_cents", `Int (Int64.to_int_exn premium_cents));
        ("premium_usd", `Float (Math.cents_to_usd premium_cents));
        ("deadline", `Float deadline);
        ("deadline_iso", `String (Time_float.of_span_since_epoch (Time_float.Span.of_sec deadline) |> Time_float.to_string_iso8601_basic ~zone:Time_float.Zone.utc));
        ("user_address", `String user_address);
        ("coverage_amount_cents", `Int (Int64.to_int_exn coverage_amount_cents));
        ("coverage_amount_usd", `Float (Math.cents_to_usd coverage_amount_cents));
        ("trigger_price", `Float trigger_price);
        ("floor_price", `Float floor_price);
        ("duration_days", `Int duration_days);
        ("asset", `String (Types.asset_to_string asset));
      ]);
      ("signature", `String signature);
      ("signature_version", `Int config.signature_version);
    ]

end
