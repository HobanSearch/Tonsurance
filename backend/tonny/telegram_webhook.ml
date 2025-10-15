(**
 * Telegram Webhook Handler
 * Processes incoming Telegram updates via webhook
 *)

open Core
open Lwt.Syntax
open Cohttp
open Cohttp_lwt_unix

(** Telegram update types *)
type telegram_user = {
  id: int64;
  first_name: string;
  username: string option;
}
[@@deriving yojson]

type telegram_chat = {
  id: int64;
  type_: string [@key "type"];
}
[@@deriving yojson]

type telegram_message = {
  message_id: int;
  from: telegram_user option;
  chat: telegram_chat;
  text: string option;
  date: int;
}
[@@deriving yojson]

type telegram_update = {
  update_id: int;
  message: telegram_message option;
}
[@@deriving yojson]

(** Telegram API methods *)
module TelegramAPI = struct
  let base_url token = sprintf "https://api.telegram.org/bot%s" token

  (** Send message *)
  let send_message ~token ~chat_id ~text =
    let url = sprintf "%s/sendMessage" (base_url token) in
    let body_json = `Assoc [
      ("chat_id", `Int (Int64.to_int_exn chat_id));
      ("text", `String text);
      ("parse_mode", `String "Markdown");
    ] in
    let body_str = Yojson.Safe.to_string body_json in

    let* response, response_body = Client.post
      ~body:(Cohttp_lwt.Body.of_string body_str)
      ~headers:(Header.of_list [("Content-Type", "application/json")])
      (Uri.of_string url)
    in

    let* body = Cohttp_lwt.Body.to_string response_body in
    match Response.status response with
    | `OK -> Lwt.return_unit
    | _ ->
        let* () = Lwt_io.printlf "Telegram API error: %s" body in
        Lwt.return_unit

  (** Send typing action *)
  let send_chat_action ~token ~chat_id ~action =
    let url = sprintf "%s/sendChatAction" (base_url token) in
    let body_json = `Assoc [
      ("chat_id", `Int (Int64.to_int_exn chat_id));
      ("action", `String action);
    ] in
    let body_str = Yojson.Safe.to_string body_json in

    let* response, _response_body = Client.post
      ~body:(Cohttp_lwt.Body.of_string body_str)
      ~headers:(Header.of_list [("Content-Type", "application/json")])
      (Uri.of_string url)
    in

    Lwt.return_unit

  (** Send message with inline keyboard *)
  let send_inline_keyboard ~token ~chat_id ~text ~keyboard =
    let url = sprintf "%s/sendMessage" (base_url token) in

    (* Format keyboard: List of (text, url/callback_data, type) *)
    let keyboard_markup = `Assoc [
      ("inline_keyboard", `List (
        List.map keyboard ~f:(fun row ->
          `List (List.map row ~f:(fun (text, data, type_) ->
            match type_ with
            | "url" -> `Assoc [("text", `String text); ("url", `String data)]
            | "callback" -> `Assoc [("text", `String text); ("callback_data", `String data)]
            | _ -> `Assoc [("text", `String text)]
          ))
        )
      ))
    ] in

    let body_json = `Assoc [
      ("chat_id", `Int (Int64.to_int_exn chat_id));
      ("text", `String text);
      ("parse_mode", `String "Markdown");
      ("reply_markup", keyboard_markup);
    ] in
    let body_str = Yojson.Safe.to_string body_json in

    let* response, response_body = Client.post
      ~body:(Cohttp_lwt.Body.of_string body_str)
      ~headers:(Header.of_list [("Content-Type", "application/json")])
      (Uri.of_string url)
    in

    let* body = Cohttp_lwt.Body.to_string response_body in
    match Response.status response with
    | `OK -> Lwt.return_unit
    | _ ->
        let* () = Lwt_io.printlf "Telegram API error: %s" body in
        Lwt.return_unit

  (** Set webhook *)
  let set_webhook ~token ~url =
    let api_url = sprintf "%s/setWebhook" (base_url token) in
    let body_json = `Assoc [
      ("url", `String url);
      ("allowed_updates", `List [`String "message"]);
    ] in
    let body_str = Yojson.Safe.to_string body_json in

    let* response, response_body = Client.post
      ~body:(Cohttp_lwt.Body.of_string body_str)
      ~headers:(Header.of_list [("Content-Type", "application/json")])
      (Uri.of_string api_url)
    in

    let* body = Cohttp_lwt.Body.to_string response_body in
    Lwt_io.printlf "Set webhook response: %s" body
end

(** Process incoming update *)
let process_update ~state ~update =
  let open Lwt.Syntax in

  match update.message with
  | None ->
      (* No message in update *)
      Lwt.return_unit

  | Some msg ->
      match msg.from, msg.text with
      | None, _ | _, None ->
          (* No sender or no text *)
          Lwt.return_unit

      | Some user, Some text ->
          (* Process message *)
          let* () = Lwt_io.printlf "[Message] User %Ld: %s" user.id text in

          (* Handle message via bot *)
          Tonny_bot.handle_message
            ~state
            ~user_id:user.id
            ~chat_id:msg.chat.id
            ~message_text:text

(** Webhook request handler *)
let handle_webhook_request ~state ~token ~request ~body =
  let open Lwt.Syntax in

  (* Read body *)
  let* body_str = Cohttp_lwt.Body.to_string body in

  (* Parse update *)
  match Yojson.Safe.from_string body_str |> telegram_update_of_yojson with
  | Error err ->
      let* () = Lwt_io.printlf "Failed to parse update: %s" err in
      let response = Cohttp_lwt_unix.Server.respond_string
        ~status:`Bad_Request
        ~body:"Invalid update"
        ()
      in
      response

  | Ok update ->
      (* Process update asynchronously *)
      Lwt.async (fun () -> process_update ~state ~update);

      (* Return 200 OK immediately *)
      Cohttp_lwt_unix.Server.respond_string
        ~status:`OK
        ~body:"OK"
        ()

(** Start webhook server *)
let start_webhook_server ~state ~token ~port ~webhook_path =
  let open Lwt.Syntax in

  let* () = Lwt_io.printlf "Starting webhook server on port %d..." port in
  let* () = Lwt_io.printlf "Webhook path: %s" webhook_path in

  let callback _conn req body =
    let uri = Request.uri req in
    let path = Uri.path uri in

    if String.equal path webhook_path then
      handle_webhook_request ~state ~token ~request:req ~body
    else
      Cohttp_lwt_unix.Server.respond_string
        ~status:`Not_Found
        ~body:"Not found"
        ()
  in

  let* () = Lwt_io.printl "✅ Webhook server ready!" in

  Cohttp_lwt_unix.Server.create
    ~mode:(`TCP (`Port port))
    (Cohttp_lwt_unix.Server.make ~callback ())
