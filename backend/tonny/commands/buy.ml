(**
 * /buy command
 * Purchase coverage using TON Connect
 *)

open Core
open Lwt.Syntax

let command_name = "buy"

(** Generate TON Connect deep link for wallet connection *)
let generate_ton_connect_link ~user_id ~callback_url =
  (* TODO: Implement actual TON Connect link generation *)
  sprintf "https://app.tonkeeper.com/ton-connect?r=%s&user=%Ld"
    (Uri.pct_encode callback_url) user_id

(** Build transaction for coverage purchase *)
let build_purchase_transaction ~quote ~policy_factory_address =
  let open Pricing_integration in

  (* Convert amounts to nanotons *)
  let coverage_amount_nano = Int.of_float (quote.amount *. 1_000_000_000.0) in
  let premium_nano = Int.of_float (quote.premium *. 1_000_000_000.0) in
  let gas_nano = 500_000_000 in (* 0.5 TON for gas *)

  (* Total value to send *)
  let total_value = premium_nano + gas_nano in

  (* TODO: Build actual TON transaction payload *)
  (* This would encode the coverage parameters into the contract call *)

  {|
  {
    "to": "|} ^ policy_factory_address ^ {|",
    "value": "|} ^ string_of_int total_value ^ {|",
    "payload": "te6cc..."
  }
  |}

let handle ~user_id ~chat_id ~send_message ~send_inline_keyboard ~policy_factory_address =
  let open Lwt.Syntax in

  (* Check if user has a cached quote *)
  match Quote_cache.get_quote user_id with
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
      (match Quote_cache.get_freshness_warning user_id with
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
             (if quote.risk_multiplier > 1.0 then
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

           (* TODO: Store purchase intent for callback handling *)

           Lwt.return_unit
      )
