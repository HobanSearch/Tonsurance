(**
 * /quote command
 * Get live coverage quote with dynamic pricing
 *)

open Core
open Lwt.Syntax
open Types

let command_name = "quote"

(** Parse quote parameters from command *)
let parse_params text =
  (* Expected format: /quote [amount] [days] [type] *)
  match String.split ~on:' ' text with
  | [_cmd; amount_str; days_str; coverage_type_str] ->
      (try
        let amount = Float.of_string amount_str in
        let duration = Int.of_string days_str in
        let coverage_type = match String.lowercase coverage_type_str with
          | "depeg" -> Some Depeg
          | "bridge" -> Some Bridge
          | "contract" -> Some Smart_contract
          | "oracle" -> Some Oracle
          | _ -> None
        in
        Option.map coverage_type ~f:(fun ct -> (amount, duration, ct))
      with _ -> None)
  | [_cmd; amount_str; days_str] ->
      (* Default to depeg if no type specified *)
      (try
        let amount = Float.of_string amount_str in
        let duration = Int.of_string days_str in
        Some (amount, duration, Depeg)
      with _ -> None)
  | _ -> None

let usage_message = {|💡 Quote Format:

`/quote [amount] [days] [type]`

**Examples:**
• `/quote 10000 30 bridge`
• `/quote 5000 90 depeg`
• `/quote 25000 60 contract`

**Coverage Types:**
🌉 **bridge** - Bridge risk protection
💵 **depeg** - Stablecoin depeg coverage
⚠️ **contract** - Smart contract exploits
🔮 **oracle** - Oracle manipulation

What coverage do you need? 🤖|}

let handle
    ~user_id
    ~chat_id
    ~message_text
    ~send_message
    ~send_typing_action
    ~pricing_config
    ~collateral_manager
    ~bridge_monitor
    =
  let open Lwt.Syntax in

  match parse_params message_text with
  | None ->
      (* Invalid format - show usage *)
      send_message chat_id usage_message

  | Some (amount, duration, coverage_type) ->
      (* Validate parameters *)
      if amount < 1000.0 then
        send_message chat_id "❌ Minimum coverage amount is $1,000 USDT"
      else if duration < 7 || duration > 365 then
        send_message chat_id "❌ Duration must be between 7 and 365 days"
      else (
        (* Show typing indicator *)
        let* () = send_typing_action chat_id in

        (* Fetch live quote from pricing engine *)
        let* quote_result = Pricing_integration.get_live_quote
          ~pricing_config
          ~collateral_manager:(Some collateral_manager)
          ~bridge_monitor:(Some bridge_monitor)
          ~coverage_type
          ~amount
          ~duration
          ~source_chain:None (* Will be specified during purchase *)
          ~dest_chain:None
          ()
        in

        (* Format and send quote *)
        let quote_msg = Pricing_integration.format_quote_for_chat quote_result in
        let* () = send_message chat_id quote_msg in

        (* Store quote for potential /buy command *)
        (* TODO: Implement quote caching with 5-min expiry *)

        Lwt.return_unit
      )
