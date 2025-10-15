(**
 * Quote Cache
 * Caches user quotes with 5-minute expiry
 *)

open Core
open Lwt.Syntax

(** Cached quote *)
type cached_quote = {
  user_id: int64;
  quote: Pricing_integration.live_quote;
  created_at: float;
}

(** Quote validity period (5 minutes) *)
let quote_validity_seconds = 300.0

(** In-memory cache (replace with Redis in production) *)
let quote_cache : (int64, cached_quote) Hashtbl.t = Hashtbl.create (module Int64)

(** Store quote for user *)
let store_quote ~user_id ~quote =
  let cached = {
    user_id;
    quote;
    created_at = Unix.time ();
  } in
  Hashtbl.set quote_cache ~key:user_id ~data:cached;
  Lwt.return_unit

(** Get cached quote if still valid *)
let get_quote user_id =
  match Hashtbl.find quote_cache user_id with
  | None -> None
  | Some cached ->
      let age = Unix.time () -. cached.created_at in
      if age <= quote_validity_seconds then
        Some cached.quote
      else (
        (* Expired - remove from cache *)
        Hashtbl.remove quote_cache user_id;
        None
      )

(** Check if user has valid cached quote *)
let has_valid_quote user_id =
  Option.is_some (get_quote user_id)

(** Get quote age in seconds *)
let get_quote_age user_id =
  match Hashtbl.find quote_cache user_id with
  | None -> None
  | Some cached ->
      Some (Unix.time () -. cached.created_at)

(** Clear quote for user *)
let clear_quote user_id =
  Hashtbl.remove quote_cache user_id;
  Lwt.return_unit

(** Get freshness warning if quote is getting old *)
let get_freshness_warning user_id =
  match get_quote_age user_id with
  | None -> None
  | Some age when age > quote_validity_seconds ->
      Some "⚠️ Quote expired - pricing may have changed. Please request a new quote with /quote"
  | Some age when age > 60.0 ->
      Some "ℹ️ Note: Quote is getting old. Pricing may have updated. Consider refreshing."
  | _ -> None

(** Clean up expired quotes (call periodically) *)
let cleanup_expired () =
  let now = Unix.time () in
  let to_remove = Hashtbl.fold quote_cache ~init:[] ~f:(fun ~key:user_id ~data:cached acc ->
    if now -. cached.created_at > quote_validity_seconds then
      user_id :: acc
    else
      acc
  ) in
  List.iter to_remove ~f:(Hashtbl.remove quote_cache);
  Lwt.return (List.length to_remove)

(** Get cache statistics *)
let get_stats () =
  let total_cached = Hashtbl.length quote_cache in
  let avg_age =
    if total_cached > 0 then
      let now = Unix.time () in
      let total_age = Hashtbl.fold quote_cache ~init:0.0 ~f:(fun ~key:_ ~data:cached acc ->
        acc +. (now -. cached.created_at)
      ) in
      total_age /. Float.of_int total_cached
    else 0.0
  in
  sprintf "cached_quotes: %d, avg_age: %.1fs" total_cached avg_age


(**
 * Production implementation using Redis
 * Uncomment when Redis is available
 *)

(*
module RedisCache = struct
  open Redis_lwt

  let redis_client = ref None

  let init_redis ~host ~port =
    let* client = Client.connect ~host ~port in
    redis_client := Some client;
    Lwt.return_unit

  let store_quote ~user_id ~quote =
    match !redis_client with
    | None -> Lwt.return_unit
    | Some client ->
        let key = sprintf "tonny:quote:%Ld" user_id in
        let json = quote |> Pricing_integration.yojson_of_live_quote |> Yojson.Safe.to_string in
        let* _ = Client.setex client key (int_of_float quote_validity_seconds) json in
        Lwt.return_unit

  let get_quote user_id =
    match !redis_client with
    | None -> Lwt.return None
    | Some client ->
        let key = sprintf "tonny:quote:%Ld" user_id in
        let* result = Client.get client key in
        match result with
        | Some json_str ->
            (try
              let quote = json_str
                |> Yojson.Safe.from_string
                |> Pricing_integration.live_quote_of_yojson
              in
              Lwt.return (Some quote)
            with _ ->
              Lwt.return None)
        | None -> Lwt.return None

  let clear_quote user_id =
    match !redis_client with
    | None -> Lwt.return_unit
    | Some client ->
        let key = sprintf "tonny:quote:%Ld" user_id in
        let* _ = Client.del client [key] in
        Lwt.return_unit
end
*)
