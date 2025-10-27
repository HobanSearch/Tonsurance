(**
 * Ollama Client
 * HTTP client for communicating with Tonny's fine-tuned Ollama model
 *)

open Core
open Cohttp
open Cohttp_lwt_unix

(** Message in a conversation *)
type message = {
  role: string; (* "system" | "user" | "assistant" *)
  content: string;
}
[@@deriving sexp, yojson]

(** Chat request to Ollama API *)
type chat_request = {
  model: string;
  messages: message list;
  stream: bool;
  options: Yojson.Safe.t option;
}

(* Manual Yojson conversion since options is already Yojson.Safe.t *)
let yojson_of_chat_request (req : chat_request) : Yojson.Safe.t =
  let fields = [
    ("model", `String req.model);
    ("messages", `List (List.map req.messages ~f:message_to_yojson));
    ("stream", `Bool req.stream);
  ] in
  let fields = match req.options with
    | Some opts -> ("options", opts) :: fields
    | None -> fields
  in
  `Assoc fields

let chat_request_of_yojson (json : Yojson.Safe.t) : (chat_request, string) Result.t =
  match json with
  | `Assoc fields ->
      (match List.Assoc.find fields "model" ~equal:String.equal,
             List.Assoc.find fields "messages" ~equal:String.equal,
             List.Assoc.find fields "stream" ~equal:String.equal with
      | Some (`String model), Some (`List msgs), Some (`Bool stream) ->
          let messages_result =
            List.fold_result msgs ~init:[] ~f:(fun acc msg ->
              match message_of_yojson msg with
              | Ok m -> Ok (m :: acc)
              | Error e -> Error e
            )
          in
          (match messages_result with
          | Ok messages ->
              let options = List.Assoc.find fields "options" ~equal:String.equal in
              Ok { model; messages = List.rev messages; stream; options }
          | Error e -> Error e)
      | _ -> Error "Invalid chat_request JSON")
  | _ -> Error "Expected JSON object for chat_request"

(** Chat response from Ollama *)
type chat_response = {
  model: string;
  created_at: string;
  message: message;
  done_: bool; [@key "done"]
}
[@@deriving yojson]

(** Ollama configuration *)
type config = {
  api_url: string;
  model_name: string;
  temperature: float;
  top_p: float;
  max_tokens: int;
  timeout_seconds: float;
}

(** Default configuration *)
let default_config = {
  api_url = "http://localhost:11434";
  model_name = "tonny";
  temperature = 0.7;
  top_p = 0.9;
  max_tokens = 300;
  timeout_seconds = 30.0;
}

(** System prompt for Tonny *)
let system_prompt = {|You are Tonny 🤖, the friendly AI assistant for Tonsurance - a parametric risk coverage protocol on TON blockchain.

COMPLIANCE RULES (CRITICAL):
- NEVER use 'insurance', 'insure', 'insured', or 'insurer'
- ALWAYS say 'parametric risk coverage' or 'risk protection'
- Say 'coverage contracts' not 'policies'
- Say 'coverage providers' not 'insurers'
- Pricing is DYNAMIC - always fetch live rates, NEVER quote fixed APR

You help users with:
- Live coverage quotes (must fetch current pricing)
- Coverage contract purchases via TON wallet
- Bridge health monitoring
- Risk assessments
- Parametric claims processing

Keep responses concise (2-4 sentences). Use occasional emojis: 💎 🌉 ✅ ⚠️ 🔮 🤖|}

(** Create options JSON *)
let create_options config =
  `Assoc [
    ("temperature", `Float config.temperature);
    ("top_p", `Float config.top_p);
    ("num_predict", `Int config.max_tokens);
  ]

(** Send chat request to Ollama API *)
let send_chat_request ~config ~messages =
  let open Lwt.Syntax in

  (* Build request *)
  let request = {
    model = config.model_name;
    messages;
    stream = false;
    options = Some (create_options config);
  } in

  let body_json = yojson_of_chat_request request in
  let body_str = Yojson.Safe.to_string body_json in

  let uri = Uri.of_string (config.api_url ^ "/api/chat") in
  let headers = Header.init ()
    |> fun h -> Header.add h "Content-Type" "application/json"
  in

  (* Create timeout promise *)
  let timeout =
    let* () = Lwt_unix.sleep config.timeout_seconds in
    Lwt.return (Error "Request timeout")
  in

  (* Create request promise *)
  let request_promise =
    Lwt.catch
      (fun () ->
        let* response, response_body = Client.post
          ~body:(Cohttp_lwt.Body.of_string body_str)
          ~headers
          uri
        in

        let status = Response.status response in
        let* body_str = Cohttp_lwt.Body.to_string response_body in

        match status with
        | `OK ->
            (try
              let json = Yojson.Safe.from_string body_str in
              match chat_response_of_yojson json with
              | Ok response -> Lwt.return (Ok response.message.content)
              | Error e -> Lwt.return (Error (sprintf "Failed to parse response: %s" e))
            with
            | Yojson.Json_error msg ->
                Lwt.return (Error (sprintf "JSON parse error: %s" msg))
            | e ->
                Lwt.return (Error (sprintf "Parse error: %s" (Exn.to_string e))))
        | _ ->
            Lwt.return (Error (sprintf "HTTP error %s: %s"
              (Code.string_of_status status) body_str))
      )
      (fun exn ->
        Lwt.return (Error (sprintf "Request failed: %s" (Exn.to_string exn)))
      )
  in

  (* Race timeout vs request *)
  Lwt.pick [timeout; request_promise]

(** Ask Tonny a question with conversation history *)
let ask_tonny
    ?(config=default_config)
    ~conversation_history
    ~user_message
    () =
  let open Lwt.Syntax in

  (* Build message list *)
  let system_msg = { role = "system"; content = system_prompt } in
  let user_msg = { role = "user"; content = user_message } in
  let messages = system_msg :: (conversation_history @ [user_msg]) in

  (* Send request *)
  let* result = send_chat_request ~config ~messages in

  match result with
  | Ok response_text ->
      (* Apply compliance filter *)
      (match Compliance_filter.ensure_compliance response_text with
       | Ok compliant -> Lwt.return (Ok compliant)
       | Error _ ->
           (* Use safe fallback *)
           Lwt.return (Ok (Compliance_filter.safe_fallback_response ())))
  | Error err ->
      Lwt.return (Error err)

(** Ask Tonny about pricing (adds context about dynamic rates) *)
let ask_tonny_pricing
    ?(config=default_config)
    ~conversation_history
    ~user_message
    () =
  let open Lwt.Syntax in

  (* Enhance message with pricing context *)
  let enhanced_message = user_message ^
    "\n\nContext: User is asking about pricing. " ^
    "Remember to tell them you need to fetch LIVE rates " ^
    "from the pricing engine. Ask for coverage amount, " ^
    "duration, and type to get current market rates. " ^
    "NEVER quote a fixed APR."
  in

  (* Send request *)
  let* result = ask_tonny ~config ~conversation_history ~user_message:enhanced_message () in

  match result with
  | Ok response_text ->
      (* Additional pricing compliance check *)
      (match Compliance_filter.ensure_compliance ~is_pricing_response:true response_text with
       | Ok compliant -> Lwt.return (Ok compliant)
       | Error _ ->
           Lwt.return (Ok "Pricing is dynamic based on current market conditions! Let me help you get a live quote. What coverage amount and duration did you have in mind? 🤖"))
  | Error err ->
      Lwt.return (Error err)

(** Detect if message is about pricing *)
let is_pricing_query message =
  let lower = String.lowercase message in
  String.is_substring lower ~substring:"price" ||
  String.is_substring lower ~substring:"cost" ||
  String.is_substring lower ~substring:"premium" ||
  String.is_substring lower ~substring:"rate" ||
  String.is_substring lower ~substring:"apr" ||
  String.is_substring lower ~substring:"how much"

(** Smart ask - automatically detects pricing queries *)
let ask_tonny_smart
    ?(config=default_config)
    ~conversation_history
    ~user_message
    () =
  if is_pricing_query user_message then
    ask_tonny_pricing ~config ~conversation_history ~user_message ()
  else
    ask_tonny ~config ~conversation_history ~user_message ()
