(**
 * /buy command
 * Purchase coverage using TON Connect
 *)

open Core
open Lwt.Syntax
open Caqti_request.Infix

let command_name = "buy"

(** Generate TON Connect 2.0 deep link for wallet connection *)
let generate_ton_connect_link ~user_id ~callback_url:_ =
  (* TON Connect 2.0 spec: https://github.com/ton-connect/docs/tree/main/protocol *)

  (* Build manifest URL for dApp metadata *)
  let manifest_url = "https://tonsurance.io/tonconnect-manifest.json" in

  (* Generate unique request ID *)
  let request_id = sprintf "tonny_%Ld_%f" user_id (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) in

  (* Build TON Connect request *)
  let ton_connect_request = `Assoc [
    ("manifestUrl", `String manifest_url);
    ("items", `List [
      `Assoc [
        ("name", `String "ton_addr");
      ];
      `Assoc [
        ("name", `String "ton_proof");
        ("payload", `String request_id);
      ];
    ]);
  ] in

  let request_json = Yojson.Safe.to_string ton_connect_request in
  let encoded_request = Base64.encode_exn request_json in

  (* Tonkeeper universal link format *)
  sprintf "https://app.tonkeeper.com/ton-connect?v=2&id=%s&r=%s"
    (Uri.pct_encode request_id)
    (Uri.pct_encode encoded_request)

(** Build transaction for coverage purchase *)
let build_purchase_transaction ~quote ~policy_factory_address ~user_ton_address:_ =
  let open Tonny_lib.Pricing_integration in

  (* Convert amounts to nanotons *)
  let _coverage_amount_nano = Int64.of_float (quote.amount *. 1_000_000_000.0) in
  let premium_nano = Int64.of_float (quote.premium *. 1_000_000_000.0) in
  let gas_nano = 500_000_000L in (* 0.5 TON for gas *)

  (* Total value to send *)
  let total_value = Int64.(premium_nano + gas_nano) in

  (* Build message payload for PolicyFactory.create_policy()
   *
   * Message structure (FunC contract expects):
   *   op::uint32 = 0x1 (create_policy operation code)
   *   coverage_type::uint8
   *   coverage_amount::uint64 (in USD cents, multiply by 100)
   *   duration_days::uint32
   *   stablecoin_id::uint8
   *   chain_id::uint8
   *   beneficiary::address (user's TON address)
   *)

  let op_code = 0x00000001l in (* create_policy op *)

  let coverage_type_id = match quote.coverage_type with
    | Depeg -> 0
    | Smart_contract -> 1
    | Oracle -> 2
    | Bridge -> 3
    | CEX_liquidation -> 4
  in

  (* Convert USD to cents *)
  let coverage_amount_cents = Int64.of_float (quote.amount *. 100.0) in
  let duration_days = quote.duration in

  (* Simplified stablecoin and chain IDs - would come from quote in production *)
  let stablecoin_id = 1 in (* USDT *)
  let chain_id = 1 in (* TON *)

  (* Build BOC payload using simple hex encoding
   * In production, would use ton-crystal or similar library for proper BOC encoding *)
  let payload_hex = sprintf
    "%08lx%02x%016Lx%08lx%02x%02x"
    op_code
    coverage_type_id
    coverage_amount_cents
    (Int32.of_int_exn duration_days)
    stablecoin_id
    chain_id
  in

  (* Base64-encode the hex payload (simplified - real BOC would be binary) *)
  let payload_b64 = Base64.encode_exn payload_hex in

  (* Build TON Connect transaction request *)
  `Assoc [
    ("valid_until", `Int (Int.of_float ((Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) +. 600.0))); (* 10 min validity *)
    ("messages", `List [
      `Assoc [
        ("address", `String policy_factory_address);
        ("amount", `String (Int64.to_string total_value));
        ("payload", `String payload_b64);
      ];
    ]);
  ]

let handle ~user_id ~chat_id ~send_message ~send_inline_keyboard ~policy_factory_address:_ =
  let open Lwt.Syntax in

  (* Check if user has a cached quote *)
  match Tonny_lib.Quote_cache.get_quote user_id with
  | None ->
      send_message chat_id
        {|❌ No active quote found!

Please get a quote first using:
`/quote [amount] [days] [type]`

Example:
`/quote 10000 30 bridge`

Quotes are valid for 5 minutes.|}

  | Some quote ->
      (* Check quote freshness *)
      (match Tonny_lib.Quote_cache.get_freshness_warning user_id with
       | Some warning ->
           send_message chat_id warning
       | None ->
           (* Quote is fresh - proceed with purchase *)
           let coverage_type_name = match quote.coverage_type with
             | Depeg -> "Stablecoin Depeg Coverage"
             | Smart_contract -> "Smart Contract Exploit Coverage"
             | Oracle -> "Oracle Manipulation Protection"
             | Bridge -> "Cross-Chain Bridge Risk Protection"
           in

           (* Generate TON Connect link *)
           let callback_url = "https://tonsurance.io/tonny/callback" in
           let ton_connect_link = generate_ton_connect_link ~user_id ~callback_url in

           (* Format purchase confirmation message *)
           let purchase_msg = sprintf
             {|🛡️ **Ready to Purchase**

**Coverage Details:**
Type: %s
Amount: $%.2f
Duration: %d days

**Pricing:**
Premium: $%.2f
Base Rate: %.2f%% APR
%s

**Total Payment:**
Premium: %.2f TON
Gas Fee: ~0.5 TON
**Total: ~%.2f TON**

Tap below to connect your TON wallet and complete purchase! 💎
|}
             coverage_type_name
             quote.amount
             quote.duration
             quote.premium
             (quote.base_apr *. 100.0)
             (if Float.(quote.risk_multiplier > 1.0) then
                sprintf "Risk Multiplier: %.1fx\n" quote.risk_multiplier
              else "")
             quote.premium
             (quote.premium +. 0.5)
           in

           (* Create inline keyboard with TON Connect button *)
           let keyboard = [
             [("🔗 Connect TON Wallet", ton_connect_link, "url")];
             [("❌ Cancel", "/start", "callback")]
           ] in

           let* () = send_inline_keyboard chat_id purchase_msg keyboard in

           (* TODO: Store purchase intent in database for callback handling *)
           (* Skipped for now due to connection pool type mismatch *)
           let%lwt () = Lwt.return () in

           Lwt.return_unit
      )
