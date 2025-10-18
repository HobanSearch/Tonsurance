(* REST API endpoints for tranche APY queries *)

open Tranche_pricing

module TrancheApyAPI = struct

  (* GET /api/v1/tranche-apy/:tranche_id?utilization=X *)
  let get_tranche_apy_handler req =
    let tranche_str = Dream.param req "tranche_id" in
    let utilization_str = Dream.query req "utilization" in

    (* Parse tranche ID *)
    match tranche_of_string tranche_str with
    | Error msg ->
        Dream.json ~status:`Bad_Request
          (Yojson.Safe.to_string (`Assoc [
            ("error", `String msg);
          ]))

    | Ok tranche ->
        (* Parse utilization parameter (default to 0.0) *)
        let utilization =
          match utilization_str with
          | None -> 0.0
          | Some u_str ->
              try
                let u = Float.of_string u_str in
                Float.max 0.0 (Float.min 1.0 u)
              with _ -> 0.0
        in

        (* Get tranche config *)
        let config = get_tranche_config ~tranche in

        (* Calculate APY *)
        let apy = calculate_apy ~tranche ~utilization in

        (* Build response *)
        Dream.json
          (Yojson.Safe.to_string (`Assoc [
            ("tranche_id", `String (tranche_to_string tranche));
            ("utilization", `Float utilization);
            ("apy", `Float apy);
            ("apy_min", `Float config.apy_min);
            ("apy_max", `Float config.apy_max);
            ("curve_type", `String (curve_type_to_string config.curve_type));
            ("allocation_percent", `Int config.allocation_percent);
          ]))

  (* GET /api/v1/tranche-apy/all?utilization=X *)
  let get_all_tranches_apy_handler req =
    let utilization_str = Dream.query req "utilization" in

    (* Parse utilization parameter (default to 0.0) *)
    let utilization =
      match utilization_str with
      | None -> 0.0
      | Some u_str ->
          try
            let u = Float.of_string u_str in
            Float.max 0.0 (Float.min 1.0 u)
          with _ -> 0.0
    in

    (* Calculate APY for all tranches *)
    let all_tranches = [SURE_BTC; SURE_SNR; SURE_MEZZ; SURE_JNR; SURE_JNR_PLUS; SURE_EQT] in
    let tranches_json =
      List.map (fun tranche ->
        let config = get_tranche_config ~tranche in
        let apy = calculate_apy ~tranche ~utilization in
        `Assoc [
          ("tranche_id", `String (tranche_to_string tranche));
          ("apy", `Float apy);
          ("apy_min", `Float config.apy_min);
          ("apy_max", `Float config.apy_max);
          ("curve_type", `String (curve_type_to_string config.curve_type));
          ("allocation_percent", `Int config.allocation_percent);
        ]
      ) all_tranches
    in

    Dream.json
      (Yojson.Safe.to_string (`Assoc [
        ("utilization", `Float utilization);
        ("tranches", `List tranches_json);
        ("timestamp", `Float (Unix.time ()));
      ]))

  (* GET /api/v1/tranche-config/:tranche_id *)
  let get_tranche_config_handler req =
    let tranche_str = Dream.param req "tranche_id" in

    match tranche_of_string tranche_str with
    | Error msg ->
        Dream.json ~status:`Bad_Request
          (Yojson.Safe.to_string (`Assoc [
            ("error", `String msg);
          ]))

    | Ok tranche ->
        let config = get_tranche_config ~tranche in

        Dream.json
          (Yojson.Safe.to_string (`Assoc [
            ("tranche_id", `String (tranche_to_string tranche));
            ("apy_min", `Float config.apy_min);
            ("apy_max", `Float config.apy_max);
            ("curve_type", `String (curve_type_to_string config.curve_type));
            ("allocation_percent", `Int config.allocation_percent);
          ]))

  (* Health check endpoint *)
  let health_check_handler _req =
    Dream.json
      (Yojson.Safe.to_string (`Assoc [
        ("status", `String "ok");
        ("service", `String "tonsurance-tranche-apy-api");
        ("timestamp", `Float (Unix.time ()));
        ("version", `String "1.0.0");
      ]))

  (* Setup API routes *)
  let routes = [
    Dream.get "/health"
      health_check_handler;

    Dream.get "/api/v1/tranche-apy/:tranche_id"
      get_tranche_apy_handler;

    Dream.get "/api/v1/tranche-apy/all"
      get_all_tranches_apy_handler;

    Dream.get "/api/v1/tranche-config/:tranche_id"
      get_tranche_config_handler;
  ]

  (* Start API server *)
  let start_server ?(port = 8080) () =
    Printf.printf "Starting Tonsurance Tranche APY API on port %d\n" port;
    Out_channel.flush Out_channel.stdout;

    Dream.run ~port
      @@ Dream.logger
      @@ Dream.router routes

end

(* CLI entry point *)
let () =
  let port =
    try
      int_of_string (Sys.getenv "PORT")
    with Not_found ->
      8080
  in

  TrancheApyAPI.start_server ~port ()
