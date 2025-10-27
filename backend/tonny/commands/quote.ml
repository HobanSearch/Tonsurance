(**
 * /quote command
 * Get live coverage quote with dynamic pricing
 *)

open Core
open Lwt.Syntax
open Types

let command_name = "quote"

(* Quote cache for storing recent quotes (5-minute expiry) *)
module QuoteCache = struct
  type cached_quote = {
    quote_data: Yojson.Safe.t;
    user_id: int64;
    timestamp: float;
  }

  let cache : (int64, cached_quote) Hashtbl.t = Hashtbl.create (module Int64)
  let cache_ttl_seconds = 300.0 (* 5 minutes *)

  (** Store a quote for a user *)
  let store ~user_id ~quote_data =
    Hashtbl.set cache ~key:user_id ~data:{
      quote_data;
      user_id;
      timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec;
    }

  (** Retrieve a recent quote for a user (if not expired) *)
  let get ~user_id : Yojson.Safe.t option =
    match Hashtbl.find cache user_id with
    | Some cached ->
        let age = (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec) -. cached.timestamp in
        if Float.(age < cache_ttl_seconds) then
          Some cached.quote_data
        else begin
          (* Expired - remove from cache *)
          Hashtbl.remove cache user_id;
          None
        end
    | None -> None

  (** Clean expired entries periodically *)
  let clean_expired () =
    let now = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in
    let to_remove = Hashtbl.fold cache ~init:[] ~f:(fun ~key ~data acc ->
      let age = now -. data.timestamp in
      if Float.(age >= cache_ttl_seconds) then key :: acc else acc
    ) in
    List.iter to_remove ~f:(Hashtbl.remove cache)
end

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
    ~pricing_config:_
    ~collateral_manager:_
    ~bridge_monitor:_
    =
  let open Lwt.Syntax in

  match parse_params message_text with
  | None ->
      (* Invalid format - show usage *)
      send_message chat_id usage_message

  | Some (amount, duration, coverage_type) ->
      (* Validate parameters *)
      if Float.(amount < 1000.0) then
        send_message chat_id "❌ Minimum coverage amount is $1,000 USDT"
      else if duration < 7 || duration > 365 then
        send_message chat_id "❌ Duration must be between 7 and 365 days"
      else (
        (* Show typing indicator *)
        let* () = send_typing_action chat_id in

        (* Fetch live quote from pricing engine *)
        let* quote_result = Tonny_lib.Pricing_integration.get_live_quote
          ~coverage_type
          ~amount
          ~duration
          ~source_chain:None (* Will be specified during purchase *)
          ~dest_chain:None
          ()
        in

        (* Format and send quote *)
        let quote_msg = Tonny_lib.Pricing_integration.format_quote_for_chat quote_result in
        let* () = send_message chat_id quote_msg in

        (* Store quote for potential /buy command (5-min expiry) *)
        let quote_json = `Assoc [
          ("coverage_type", `String (coverage_type_to_string coverage_type));
          ("amount_usd", `Float amount);
          ("duration_days", `Int duration);
          ("premium_usd", `Float quote_result.premium);
          ("timestamp", `Float (Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec));
        ] in
        QuoteCache.store ~user_id:(Int64.of_int user_id) ~quote_data:quote_json;

        (* Periodically clean expired quotes *)
        QuoteCache.clean_expired ();

        Lwt.return_unit
      )
