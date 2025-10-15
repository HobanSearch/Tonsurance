(**
 * /tonny command
 * Chat with Tonny AI assistant
 *)

open Core
open Lwt.Syntax

let command_name = "tonny"

let handle
    ~user_id
    ~chat_id
    ~message_text
    ~send_message
    ~send_typing_action
    ~ollama_config
    =
  let open Lwt.Syntax in

  (* Extract message after /tonny command *)
  let user_query = match String.lsplit2 ~on:' ' message_text with
    | Some (_cmd, query) -> String.strip query
    | None -> ""
  in

  if String.is_empty user_query then (
    send_message chat_id {|👋 I'm Tonny! Ask me anything about Tonsurance!

**Try asking:**
• "How does parametric coverage work?"
• "What's the difference between depeg and bridge coverage?"
• "How do I purchase protection?"
• "What triggers a payout?"

Or just chat naturally - I'm here to help! 🤖|}
  ) else (
    (* Show typing indicator *)
    let* () = send_typing_action chat_id in

    (* Get conversation history *)
    let conversation_history =
      Option.value (Conversation_state.get_conversation user_id) ~default:[]
    in

    (* Ask Tonny (smart version detects pricing queries) *)
    let* response_result = Ollama_client.ask_tonny_smart
      ~config:ollama_config
      ~conversation_history
      ~user_message:user_query
      ()
    in

    match response_result with
    | Ok tonny_response ->
        (* Send response *)
        let* () = send_message chat_id tonny_response in

        (* Update conversation history *)
        let* () = Conversation_state.update_conversation
          user_id user_query tonny_response
        in

        Lwt.return_unit

    | Error err ->
        (* Log error and send fallback *)
        let* () = Lwt_io.printlf "Ollama error for user %Ld: %s" user_id err in
        send_message chat_id
          "Sorry, I'm having trouble connecting right now. Please try again in a moment! 🤖"
  )
