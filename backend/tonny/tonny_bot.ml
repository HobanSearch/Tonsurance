(**
 * Tonny Bot - Main Entry Point
 * Telegram bot for Tonsurance parametric risk coverage
 *)

open Core
open Lwt.Syntax

(** Bot configuration *)
type config = {
  telegram_token: string;
  ollama_config: Ollama_client.config;
  pricing_config: Pricing_engine.pricing_config;
  database_url: string option;
  redis_url: string option;
}

(** Bot state *)
type state = {
  config: config;
  mutable collateral_manager: Collateral_manager.t option;
  mutable bridge_monitor: Bridge_monitor.t option;
}

(** Create default configuration from environment *)
let default_config () = {
  telegram_token = Sys.getenv_exn "TELEGRAM_BOT_TOKEN";
  ollama_config = {
    api_url = Option.value (Sys.getenv "TONNY_API_URL") ~default:"http://localhost:11434";
    model_name = Option.value (Sys.getenv "TONNY_MODEL") ~default:"tonny";
    temperature = 0.7;
    top_p = 0.9;
    max_tokens = 300;
    timeout_seconds = 30.0;
  };
  pricing_config = Pricing_engine.default_config;
  database_url = Sys.getenv "DATABASE_URL";
  redis_url = Sys.getenv "REDIS_URL";
}

(** Telegram API helpers *)
module Telegram = struct
  (** Send message to chat *)
  let send_message ~token ~chat_id ~text =
    let open Lwt.Syntax in
    (* TODO: Implement actual Telegram API call *)
    (* For now, just log it *)
    Lwt_io.printlf "[Telegram] Sending to %Ld: %s" chat_id text

  (** Send typing action *)
  let send_typing_action ~token ~chat_id =
    let open Lwt.Syntax in
    (* TODO: Implement actual Telegram API call *)
    Lwt_io.printlf "[Telegram] Typing action for %Ld" chat_id
end

(** Route commands to handlers *)
let handle_command ~state ~user_id ~chat_id ~message_text =
  let open Lwt.Syntax in

  (* Extract command *)
  let command = match String.lsplit2 ~on:' ' message_text with
    | Some (cmd, _) -> String.lowercase (String.drop_prefix cmd 1) (* Remove / *)
    | None -> String.lowercase (String.drop_prefix message_text 1)
  in

  let token = state.config.telegram_token in
  let send_message = Telegram.send_message ~token in
  let send_typing_action = Telegram.send_typing_action ~token in

  match command with
  | "start" ->
      Start.handle ~user_id ~chat_id ~send_message

  | "help" ->
      Help.handle ~chat_id ~send_message

  | "quote" ->
      (match state.collateral_manager, state.bridge_monitor with
       | Some cm, Some bm ->
           Quote.handle
             ~user_id
             ~chat_id
             ~message_text
             ~send_message
             ~send_typing_action
             ~pricing_config:state.config.pricing_config
             ~collateral_manager:cm
             ~bridge_monitor:bm
       | _ ->
           send_message chat_id "Service temporarily unavailable. Please try again later.")

  | "buy" ->
      Buy.handle
        ~user_id
        ~chat_id
        ~send_message
        ~send_inline_keyboard:(fun chat_id text keyboard ->
          Telegram.send_inline_keyboard ~token ~chat_id ~text ~keyboard)
        ~policy_factory_address:"EQC..." (* TODO: Get from config *)

  | "policies" ->
      Policies.handle
        ~user_id
        ~chat_id
        ~send_message
        ~get_user_policies:(fun user_id ->
          (* TODO: Implement database query *)
          Lwt.return (Ok []))

  | "claim" ->
      Claim.handle
        ~user_id
        ~chat_id
        ~message_text
        ~send_message
        ~get_policy_claim_status:(fun user_id policy_id ->
          (* TODO: Implement claim status query *)
          Lwt.return (Ok { has_claim = false }))

  | "bridges" ->
      Bridges.handle
        ~chat_id
        ~send_message
        ~bridge_monitor:state.bridge_monitor

  | "tonny" ->
      Tonny.handle
        ~user_id
        ~chat_id
        ~message_text
        ~send_message
        ~send_typing_action
        ~ollama_config:state.config.ollama_config

  | _ ->
      send_message chat_id
        {|❓ Unknown command. Try:

• `/quote` - Get coverage quote
• `/buy` - Purchase coverage
• `/bridges` - Check bridge health
• `/tonny` - Chat with me
• `/help` - See all commands

Or just ask me a question! 🤖|}

(** Handle incoming message *)
let handle_message ~state ~user_id ~chat_id ~message_text =
  let open Lwt.Syntax in

  if String.is_prefix message_text ~prefix:"/" then
    handle_command ~state ~user_id ~chat_id ~message_text
  else (
    (* Not a command - treat as chat with Tonny *)
    let token = state.config.telegram_token in
    let send_message = Telegram.send_message ~token in
    let send_typing_action = Telegram.send_typing_action ~token in

    Tonny.handle
      ~user_id
      ~chat_id
      ~message_text:("/tonny " ^ message_text)
      ~send_message
      ~send_typing_action
      ~ollama_config:state.config.ollama_config
  )

(** Initialize bot services *)
let initialize_services state =
  let open Lwt.Syntax in

  (* Initialize collateral manager *)
  let* () = Lwt_io.printl "Initializing collateral manager..." in
  let pool = Collateral_manager.create_unified_pool () in
  state.collateral_manager <- Some (Collateral_manager.create pool);

  (* Initialize bridge monitor *)
  let* () = Lwt_io.printl "Initializing bridge monitor..." in
  (* TODO: Initialize with actual oracle sources *)
  (* state.bridge_monitor <- Some (Bridge_monitor.create ...) *)

  Lwt_io.printl "✅ Services initialized"

(** Cleanup expired conversations periodically *)
let start_cleanup_task () =
  let rec loop () =
    let open Lwt.Syntax in
    let* () = Lwt_unix.sleep 300.0 in (* Every 5 minutes *)
    let* removed = Conversation_state.cleanup_expired () in
    let* () = if removed > 0 then
      Lwt_io.printlf "Cleaned up %d expired conversations" removed
    else
      Lwt.return_unit
    in
    loop ()
  in
  Lwt.async loop

(** Main bot loop *)
let run () =
  let open Lwt.Syntax in

  (* Load configuration *)
  let config = default_config () in
  let* () = Lwt_io.printl "🤖 Starting Tonny bot..." in
  let* () = Lwt_io.printlf "Ollama API: %s" config.ollama_config.api_url in
  let* () = Lwt_io.printlf "Model: %s" config.ollama_config.model_name in

  (* Create state *)
  let state = {
    config;
    collateral_manager = None;
    bridge_monitor = None;
  } in

  (* Initialize services *)
  let* () = initialize_services state in

  (* Start cleanup task *)
  start_cleanup_task ();

  (* Start bot loop *)
  let* () = Lwt_io.printl "✅ Tonny is ready!" in
  let* () = Lwt_io.printl "Waiting for Telegram messages..." in

  (* TODO: Implement actual Telegram bot polling/webhook *)
  (* For now, just keep running *)
  let rec keep_alive () =
    let* () = Lwt_unix.sleep 60.0 in
    let* () = Lwt_io.printlf "Stats: %s" (Conversation_state.get_stats ()) in
    keep_alive ()
  in
  keep_alive ()

(** Entry point *)
let () =
  Lwt_main.run (run ())
