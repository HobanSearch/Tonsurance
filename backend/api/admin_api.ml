(* Admin API - Configuration Management Endpoints

   Provides REST API for managing configuration parameters:
   - GET /admin/config - List all parameters
   - GET /admin/config/:category - List by category
   - GET /admin/config/:category/:key - Get single parameter
   - PUT /admin/config/:category/:key - Update parameter
   - POST /admin/config/reload - Force cache reload
   - GET /admin/config/audit - View change history
*)

open Core
open Lwt.Syntax
open Opium

module AdminAPI = struct

  (* JWT secret for admin authentication *)
  let jwt_secret = ref "CHANGE_ME_IN_PRODUCTION"

  (* Set JWT secret *)
  let set_jwt_secret secret =
    jwt_secret := secret

  (* Database connection *)
  let db_conn = ref None

  let set_db_connection conn =
    db_conn := Some conn

  (** Validate JWT token and check admin role *)
  let validate_admin_token token =
    (* TODO: Implement proper JWT validation *)
    (* For now, simple token check *)
    String.equal token "admin_secret_token"

  (** Middleware: Require admin authentication *)
  let require_admin handler req =
    match Request.header "Authorization" req with
    | Some auth_header ->
        let token = String.chop_prefix auth_header ~prefix:"Bearer " |> Option.value ~default:"" in
        if validate_admin_token token then
          handler req
        else
          Response.of_plain_text ~status:`Unauthorized "Unauthorized: Invalid admin token"
          |> Lwt.return
    | None ->
        Response.of_plain_text ~status:`Unauthorized "Unauthorized: Missing authorization header"
        |> Lwt.return

  (** Extract user from JWT token *)
  let extract_user_from_token token =
    (* TODO: Implement proper JWT parsing *)
    "admin"

  (** Get client IP from request *)
  let get_client_ip req =
    match Request.header "X-Forwarded-For" req with
    | Some ip -> String.split ip ~on:',' |> List.hd |> Option.value ~default:"unknown"
    | None -> "unknown"

  (** Query database *)
  let query_db query =
    match !db_conn with
    | None -> Lwt.return_error "Database not connected"
    | Some conn ->
        try
          let result = conn#exec query in
          Lwt.return_ok result
        with exn ->
          Lwt.return_error (Exn.to_string exn)

  (** Convert PostgreSQL result to JSON *)
  let result_to_json result =
    let rows = ref [] in
    for i = 0 to result#ntuples - 1 do
      let row = ref [] in
      for j = 0 to result#nfields - 1 do
        let field_name = result#fname j in
        let field_value = result#getvalue i j in
        row := (field_name, `String field_value) :: !row
      done;
      rows := (`Assoc (List.rev !row)) :: !rows
    done;
    `List (List.rev !rows)

  (** Handler: List all config parameters *)
  let list_all_config _req =
    let* result = query_db "SELECT id, category, key, value_type, value_data, description, last_updated_at, updated_by FROM config_parameters ORDER BY category, key" in
    match result with
    | Ok pg_result ->
        let json = result_to_json pg_result in
        Response.of_json json |> Lwt.return
    | Error err ->
        Response.of_plain_text ~status:`Internal_server_error ("Database error: " ^ err)
        |> Lwt.return

  (** Handler: List config by category *)
  let list_by_category req =
    let category = Router.param req "category" in
    let query = Printf.sprintf
      "SELECT id, category, key, value_type, value_data, description, last_updated_at, updated_by \
       FROM config_parameters WHERE category = '%s' ORDER BY key"
      (Postgresql.escape_string category)
    in
    let* result = query_db query in
    match result with
    | Ok pg_result ->
        let json = result_to_json pg_result in
        Response.of_json json |> Lwt.return
    | Error err ->
        Response.of_plain_text ~status:`Internal_server_error ("Database error: " ^ err)
        |> Lwt.return

  (** Handler: Get single config parameter *)
  let get_single_config req =
    let category = Router.param req "category" in
    let key = Router.param req "key" in
    let query = Printf.sprintf
      "SELECT id, category, key, value_type, value_data, description, last_updated_at, updated_by \
       FROM config_parameters WHERE category = '%s' AND key = '%s'"
      (Postgresql.escape_string category)
      (Postgresql.escape_string key)
    in
    let* result = query_db query in
    match result with
    | Ok pg_result when pg_result#ntuples > 0 ->
        let json = result_to_json pg_result in
        (match json with
         | `List (first :: _) -> Response.of_json first |> Lwt.return
         | _ -> Response.of_plain_text ~status:`Not_found "Config not found" |> Lwt.return)
    | Ok _ ->
        Response.of_plain_text ~status:`Not_found "Config not found" |> Lwt.return
    | Error err ->
        Response.of_plain_text ~status:`Internal_server_error ("Database error: " ^ err)
        |> Lwt.return

  (** Validate config value based on type *)
  let validate_value value_type value_json =
    match value_type with
    | "float" ->
        (match value_json with
         | `Float _ | `Int _ -> Ok ()
         | _ -> Error "Value must be a number")
    | "int" ->
        (match value_json with
         | `Int _ -> Ok ()
         | _ -> Error "Value must be an integer")
    | "string" ->
        (match value_json with
         | `String _ -> Ok ()
         | _ -> Error "Value must be a string")
    | "json" ->
        Ok ()  (* Any JSON is valid *)
    | _ ->
        Error "Unknown value type"

  (** Handler: Update config parameter *)
  let update_config req =
    let category = Router.param req "category" in
    let key = Router.param req "key" in

    let* body_json = Request.to_json_exn req in

    (* Extract fields from request body *)
    let new_value = Yojson.Safe.Util.member "value" body_json in
    let reason = Yojson.Safe.Util.member "reason" body_json |> Yojson.Safe.Util.to_string_option in
    let dry_run = Yojson.Safe.Util.member "dry_run" body_json |> Yojson.Safe.Util.to_bool_option |> Option.value ~default:false in

    (* Get current config to validate value type *)
    let query = Printf.sprintf
      "SELECT value_type FROM config_parameters WHERE category = '%s' AND key = '%s'"
      (Postgresql.escape_string category)
      (Postgresql.escape_string key)
    in

    let* result = query_db query in
    match result with
    | Ok pg_result when pg_result#ntuples > 0 ->
        let value_type = pg_result#getvalue 0 0 in

        (* Validate new value *)
        (match validate_value value_type new_value with
         | Ok () ->
             if dry_run then
               (* Dry run: don't actually update *)
               let response_json = `Assoc [
                 ("dry_run", `Bool true);
                 ("category", `String category);
                 ("key", `String key);
                 ("new_value", new_value);
                 ("validation", `String "OK");
               ] in
               Response.of_json response_json |> Lwt.return
             else
               (* Get auth token and user *)
               let token = Request.header "Authorization" req
                 |> Option.value ~default:""
                 |> String.chop_prefix ~prefix:"Bearer "
                 |> Option.value ~default:"" in
               let updated_by = extract_user_from_token token in

               (* Perform update *)
               let new_value_str = Yojson.Safe.to_string new_value in
               let update_query = Printf.sprintf
                 "UPDATE config_parameters \
                  SET value_data = '%s'::jsonb, \
                      last_updated_at = NOW(), \
                      updated_by = '%s' \
                  WHERE category = '%s' AND key = '%s' \
                  RETURNING id, value_data, last_updated_at"
                 (Postgresql.escape_string new_value_str)
                 (Postgresql.escape_string updated_by)
                 (Postgresql.escape_string category)
                 (Postgresql.escape_string key)
               in

               let* update_result = query_db update_query in
               (match update_result with
                | Ok pg_result when pg_result#ntuples > 0 ->
                    (* Optionally log audit with reason *)
                    let audit_query = match reason with
                      | Some r ->
                          Printf.sprintf
                            "INSERT INTO config_audit_log (config_id, category, key, new_value, changed_by, change_reason, client_ip) \
                             VALUES ((SELECT id FROM config_parameters WHERE category = '%s' AND key = '%s'), \
                                     '%s', '%s', '%s'::jsonb, '%s', '%s', '%s')"
                            (Postgresql.escape_string category)
                            (Postgresql.escape_string key)
                            (Postgresql.escape_string category)
                            (Postgresql.escape_string key)
                            (Postgresql.escape_string new_value_str)
                            (Postgresql.escape_string updated_by)
                            (Postgresql.escape_string r)
                            (get_client_ip req)
                      | None -> ""
                    in

                    if String.is_empty audit_query then
                      Lwt.return_unit
                    else
                      let* _ = query_db audit_query in
                      Lwt.return_unit;

                    let response_json = `Assoc [
                      ("success", `Bool true);
                      ("category", `String category);
                      ("key", `String key);
                      ("new_value", new_value);
                      ("updated_by", `String updated_by);
                      ("updated_at", `String (pg_result#getvalue 0 2));
                    ] in
                    Response.of_json response_json |> Lwt.return

                | _ ->
                    Response.of_plain_text ~status:`Internal_server_error "Update failed"
                    |> Lwt.return)

         | Error msg ->
             let error_json = `Assoc [
               ("error", `String "Validation failed");
               ("message", `String msg);
             ] in
             Response.of_json ~status:`Bad_request error_json |> Lwt.return)

    | Ok _ ->
        Response.of_plain_text ~status:`Not_found "Config parameter not found" |> Lwt.return

    | Error err ->
        Response.of_plain_text ~status:`Internal_server_error ("Database error: " ^ err)
        |> Lwt.return

  (** Handler: Force cache reload *)
  let force_reload _req =
    let* () = Config.ConfigLoader.reload_cache () in
    let stats = Config.ConfigLoader.get_cache_stats () in
    let response_json = `Assoc [
      ("success", `Bool true);
      ("message", `String "Cache reloaded successfully");
      ("stats", stats);
    ] in
    Response.of_json response_json |> Lwt.return

  (** Handler: View audit log *)
  let view_audit req =
    let limit = Request.query "limit" req |> Option.bind ~f:List.hd |> Option.value ~default:"100" in
    let category = Request.query "category" req |> Option.bind ~f:List.hd in

    let where_clause = match category with
      | Some cat -> Printf.sprintf "WHERE category = '%s'" (Postgresql.escape_string cat)
      | None -> ""
    in

    let query = Printf.sprintf
      "SELECT id, category, key, old_value, new_value, changed_by, changed_at, change_reason, client_ip, dry_run \
       FROM config_audit_log %s \
       ORDER BY changed_at DESC \
       LIMIT %s"
      where_clause
      limit
    in

    let* result = query_db query in
    match result with
    | Ok pg_result ->
        let json = result_to_json pg_result in
        Response.of_json json |> Lwt.return
    | Error err ->
        Response.of_plain_text ~status:`Internal_server_error ("Database error: " ^ err)
        |> Lwt.return

  (** Handler: Get cache statistics *)
  let get_stats _req =
    let stats = Config.ConfigLoader.get_cache_stats () in
    Response.of_json stats |> Lwt.return

  (** Build the admin API app *)
  let build_app () =
    App.empty
    |> App.get "/admin/config" (require_admin list_all_config)
    |> App.get "/admin/config/stats" (require_admin get_stats)
    |> App.get "/admin/config/audit" (require_admin view_audit)
    |> App.post "/admin/config/reload" (require_admin force_reload)
    |> App.get "/admin/config/:category" (require_admin list_by_category)
    |> App.get "/admin/config/:category/:key" (require_admin get_single_config)
    |> App.put "/admin/config/:category/:key" (require_admin update_config)

end

(** Usage example:

   (* Initialize database *)
   let* () = Config.ConfigLoader.init_db_pool
     ~host:"localhost"
     ~port:5432
     ~database:"tonsurance"
     ~user:"admin"
     ~password:"secret"
     ()
   in

   (* Set JWT secret *)
   AdminAPI.set_jwt_secret "your-secret-key";

   (* Start auto-reload *)
   Config.ConfigLoader.start_auto_reload ~interval_seconds:60;

   (* Build and run API *)
   let app = AdminAPI.build_app () in
   App.run_command app

   (* Example API calls:

   # List all configs
   curl -H "Authorization: Bearer admin_secret_token" \
     http://localhost:3000/admin/config

   # Get specific config
   curl -H "Authorization: Bearer admin_secret_token" \
     http://localhost:3000/admin/config/pricing/base_rate_USDC

   # Update config (dry run)
   curl -X PUT \
     -H "Authorization: Bearer admin_secret_token" \
     -H "Content-Type: application/json" \
     -d '{"value": 0.05, "reason": "Adjusting for market conditions", "dry_run": true}' \
     http://localhost:3000/admin/config/pricing/base_rate_USDC

   # Update config (actual)
   curl -X PUT \
     -H "Authorization: Bearer admin_secret_token" \
     -H "Content-Type: application/json" \
     -d '{"value": 0.05, "reason": "Adjusting for market conditions"}' \
     http://localhost:3000/admin/config/pricing/base_rate_USDC

   # Force cache reload
   curl -X POST \
     -H "Authorization: Bearer admin_secret_token" \
     http://localhost:3000/admin/config/reload

   # View audit log
   curl -H "Authorization: Bearer admin_secret_token" \
     http://localhost:3000/admin/config/audit?limit=50&category=pricing

   *)
*)
