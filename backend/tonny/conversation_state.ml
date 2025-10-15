(**
 * Conversation State Manager
 * Manages chat history and context for each user
 *)

open Core
open Lwt.Syntax

(** Conversation state for a user *)
type conversation = {
  user_id: int64;
  messages: Ollama_client.message list;
  last_updated: float;
}
[@@deriving sexp, yojson]

(** Configuration *)
let max_history_messages = 10  (* Keep last 10 messages *)
let conversation_timeout = 1800.0  (* 30 minutes *)

(** In-memory storage (for now - replace with Redis/PostgreSQL in production) *)
let conversations : (int64, conversation) Hashtbl.t = Hashtbl.create (module Int64)

(** Get conversation for user *)
let get_conversation user_id =
  let open Option.Let_syntax in
  let%bind conv = Hashtbl.find conversations user_id in

  (* Check if conversation has timed out *)
  let age = Unix.time () -. conv.last_updated in
  if age < conversation_timeout then
    Some conv.messages
  else (
    (* Clear expired conversation *)
    Hashtbl.remove conversations user_id;
    None
  )

(** Update conversation with new messages *)
let update_conversation user_id user_message assistant_response =
  let user_msg = {
    Ollama_client.role = "user";
    content = user_message;
  } in
  let assistant_msg = {
    Ollama_client.role = "assistant";
    content = assistant_response;
  } in

  (* Get existing history or create new *)
  let existing_messages =
    Option.value (get_conversation user_id) ~default:[]
  in

  (* Add new messages (most recent first) *)
  let updated_messages =
    (assistant_msg :: user_msg :: existing_messages)
    |> List.take ~n:max_history_messages
  in

  (* Store updated conversation *)
  let conv = {
    user_id;
    messages = updated_messages;
    last_updated = Unix.time ();
  } in
  Hashtbl.set conversations ~key:user_id ~data:conv;
  Lwt.return_unit

(** Clear conversation for user *)
let clear_conversation user_id =
  Hashtbl.remove conversations user_id;
  Lwt.return_unit

(** Get conversation age in seconds *)
let get_conversation_age user_id =
  match Hashtbl.find conversations user_id with
  | Some conv -> Some (Unix.time () -. conv.last_updated)
  | None -> None

(** Check if user has active conversation *)
let has_active_conversation user_id =
  Option.is_some (get_conversation user_id)

(** Get conversation statistics *)
let get_stats () =
  let active_count = Hashtbl.length conversations in
  let avg_messages =
    if active_count > 0 then
      let total_messages = Hashtbl.fold conversations ~init:0 ~f:(fun ~key:_ ~data:conv acc ->
        acc + List.length conv.messages
      ) in
      float_of_int total_messages /. float_of_int active_count
    else 0.0
  in
  {|
    active_conversations: |} ^ string_of_int active_count ^ {|
    avg_messages_per_conv: |} ^ sprintf "%.1f" avg_messages

(** Clean up expired conversations (call periodically) *)
let cleanup_expired () =
  let now = Unix.time () in
  let to_remove = Hashtbl.fold conversations ~init:[] ~f:(fun ~key:user_id ~data:conv acc ->
    if now -. conv.last_updated > conversation_timeout then
      user_id :: acc
    else
      acc
  ) in
  List.iter to_remove ~f:(Hashtbl.remove conversations);
  Lwt.return (List.length to_remove)


(**
 * Production implementation using Redis
 * Uncomment when Redis is available
 *)

(*
module RedisStore = struct
  open Redis_lwt

  let redis_client = ref None

  let init_redis ~host ~port =
    let* client = Client.connect ~host ~port in
    redis_client := Some client;
    Lwt.return_unit

  let get_conversation user_id =
    match !redis_client with
    | None -> Lwt.return None
    | Some client ->
        let key = sprintf "tonny:conv:%Ld" user_id in
        let* result = Client.get client key in
        match result with
        | Some json_str ->
            (try
              let conv = conversation_of_yojson (Yojson.Safe.from_string json_str) in
              Lwt.return (Some conv.messages)
            with _ ->
              Lwt.return None)
        | None -> Lwt.return None

  let update_conversation user_id user_message assistant_response =
    match !redis_client with
    | None -> Lwt.return_unit
    | Some client ->
        let* existing = get_conversation user_id in
        let existing_messages = Option.value existing ~default:[] in

        let user_msg = { Ollama_client.role = "user"; content = user_message } in
        let assistant_msg = { Ollama_client.role = "assistant"; content = assistant_response } in

        let updated_messages =
          (assistant_msg :: user_msg :: existing_messages)
          |> List.take ~n:max_history_messages
        in

        let conv = {
          user_id;
          messages = updated_messages;
          last_updated = Unix.time ();
        } in

        let key = sprintf "tonny:conv:%Ld" user_id in
        let json_str = conv |> yojson_of_conversation |> Yojson.Safe.to_string in
        let* _ = Client.setex client key (int_of_float conversation_timeout) json_str in
        Lwt.return_unit

  let clear_conversation user_id =
    match !redis_client with
    | None -> Lwt.return_unit
    | Some client ->
        let key = sprintf "tonny:conv:%Ld" user_id in
        let* _ = Client.del client [key] in
        Lwt.return_unit
end
*)
