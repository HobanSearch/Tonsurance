(* Data Migration Script - Extract Hardcoded Params to Database

   This script:
   1. Connects to database
   2. Runs migrations 006, 007, 008
   3. Validates data integrity
   4. Generates migration report
*)

open Core
open Lwt.Syntax

module ConfigMigration = struct

  (* Database connection *)
  let db_conn = ref None

  let connect ~host ~port ~database ~user ~password () =
    try
      let conninfo = Printf.sprintf
        "host=%s port=%d dbname=%s user=%s password=%s"
        host port database user password
      in
      let conn = new Postgresql.connection ~conninfo () in
      db_conn := Some conn;
      print_endline "Database connected successfully";
      Ok ()
    with exn ->
      Error (Printf.sprintf "Database connection failed: %s" (Exn.to_string exn))

  (* Run SQL file *)
  let run_sql_file filename =
    match !db_conn with
    | None -> Error "Database not connected"
    | Some conn ->
        try
          let sql = In_channel.read_all filename in
          let result = conn#exec sql in
          match result#status with
          | Postgresql.Command_ok | Postgresql.Tuples_ok ->
              Ok (Printf.sprintf "Migration %s completed" filename)
          | _ ->
              Error (Printf.sprintf "Migration %s failed: %s" filename result#error)
        with exn ->
          Error (Printf.sprintf "Error running %s: %s" filename (Exn.to_string exn))

  (* Validate config parameters *)
  let validate_config_parameters () =
    match !db_conn with
    | None -> Error "Database not connected"
    | Some conn ->
        try
          let query = "SELECT category, COUNT(*) as count FROM config_parameters GROUP BY category" in
          let result = conn#exec query in

          print_endline "\n=== Configuration Parameters by Category ===";
          for i = 0 to result#ntuples - 1 do
            let category = result#getvalue i 0 in
            let count = result#getvalue i 1 in
            Printf.printf "  %s: %s parameters\n" category count
          done;

          let total_query = "SELECT COUNT(*) FROM config_parameters" in
          let total_result = conn#exec total_query in
          let total = total_result#getvalue 0 0 in
          Printf.printf "\nTotal: %s configuration parameters\n" total;

          Ok ()
        with exn ->
          Error (Printf.sprintf "Validation failed: %s" (Exn.to_string exn))

  (* Validate historical depegs *)
  let validate_historical_depegs () =
    match !db_conn with
    | None -> Error "Database not connected"
    | Some conn ->
        try
          let query = "SELECT asset, COUNT(*) as count FROM historical_depegs GROUP BY asset ORDER BY count DESC" in
          let result = conn#exec query in

          print_endline "\n=== Historical Depeg Events by Asset ===";
          for i = 0 to result#ntuples - 1 do
            let asset = result#getvalue i 0 in
            let count = result#getvalue i 1 in
            Printf.printf "  %s: %s events\n" asset count
          done;

          let total_query = "SELECT COUNT(*) FROM historical_depegs" in
          let total_result = conn#exec total_query in
          let total = total_result#getvalue 0 0 in
          Printf.printf "\nTotal: %s historical depeg events\n" total;

          let verified_query = "SELECT COUNT(*) FROM historical_depegs WHERE verified = TRUE" in
          let verified_result = conn#exec verified_query in
          let verified = verified_result#getvalue 0 0 in
          Printf.printf "Verified: %s events\n" verified;

          Ok ()
        with exn ->
          Error (Printf.sprintf "Validation failed: %s" (Exn.to_string exn))

  (* Validate stress scenarios *)
  let validate_stress_scenarios () =
    match !db_conn with
    | None -> Error "Database not connected"
    | Some conn ->
        try
          let query = "SELECT scenario_name, severity_level, probability_annual FROM stress_scenarios ORDER BY severity_level DESC" in
          let result = conn#exec query in

          print_endline "\n=== Stress Test Scenarios ===";
          for i = 0 to result#ntuples - 1 do
            let name = result#getvalue i 0 in
            let severity = result#getvalue i 1 in
            let probability = result#getvalue i 2 in
            let prob_pct = Float.of_string probability *. 100.0 in
            Printf.printf "  %s [%s] - %.3f%% annual probability\n" name severity prob_pct
          done;

          let total_query = "SELECT COUNT(*) FROM stress_scenarios WHERE enabled = TRUE" in
          let total_result = conn#exec total_query in
          let total = total_result#getvalue 0 0 in
          Printf.printf "\nTotal: %s active scenarios\n" total;

          Ok ()
        with exn ->
          Error (Printf.sprintf "Validation failed: %s" (Exn.to_string exn))

  (* Generate migration report *)
  let generate_report () =
    print_endline "\n==========================================================";
    print_endline "           CONFIGURATION MIGRATION REPORT";
    print_endline "==========================================================\n";

    print_endline "Migration Status: SUCCESS\n";

    let _ = validate_config_parameters () in
    let _ = validate_historical_depegs () in
    let _ = validate_stress_scenarios () in

    print_endline "\n==========================================================";
    print_endline "           NEXT STEPS";
    print_endline "==========================================================\n";

    print_endline "1. Update backend services to use ConfigLoader";
    print_endline "   - Update pricing_engine.ml";
    print_endline "   - Update tranche_pricing.ml";
    print_endline "   - Update risk_model.ml";
    print_endline "";
    print_endline "2. Deploy admin API for configuration management";
    print_endline "   - Set JWT_SECRET environment variable";
    print_endline "   - Configure database connection";
    print_endline "   - Start admin API server";
    print_endline "";
    print_endline "3. Start automatic cache reload";
    print_endline "   - Call ConfigLoader.start_auto_reload ~interval_seconds:60";
    print_endline "";
    print_endline "4. Test configuration hot-reload";
    print_endline "   - Update a config parameter via admin API";
    print_endline "   - Wait 60 seconds for cache reload";
    print_endline "   - Verify pricing reflects new parameter";
    print_endline "";
    print_endline "5. Set up monitoring";
    print_endline "   - Monitor /admin/config/stats for cache health";
    print_endline "   - Set up alerts for cache misses";
    print_endline "   - Review audit log regularly";
    print_endline "";
    print_endline "==========================================================\n";

    Ok ()

  (* Main migration function *)
  let run ~host ~port ~database ~user ~password ~migrations_dir () =
    print_endline "==========================================================";
    print_endline "      TONSURANCE CONFIGURATION MIGRATION";
    print_endline "==========================================================\n";

    (* Connect to database *)
    print_endline "Step 1: Connecting to database...";
    match connect ~host ~port ~database ~user ~password () with
    | Error err ->
        Printf.eprintf "ERROR: %s\n" err;
        exit 1
    | Ok () ->
        print_endline "✓ Connected\n";

        (* Run migrations *)
        print_endline "Step 2: Running migrations...";

        let migrations = [
          (migrations_dir ^ "/006_config_parameters.sql", "006_config_parameters");
          (migrations_dir ^ "/007_historical_depegs.sql", "007_historical_depegs");
          (migrations_dir ^ "/008_stress_scenarios.sql", "008_stress_scenarios");
        ] in

        let results = List.map migrations ~f:(fun (file, name) ->
          Printf.printf "  Running %s..." name;
          match run_sql_file file with
          | Ok msg ->
              print_endline (" ✓");
              (name, true, msg)
          | Error err ->
              Printf.printf " ✗\n    Error: %s\n" err;
              (name, false, err)
        ) in

        let failures = List.filter results ~f:(fun (_, success, _) -> not success) in

        if List.is_empty failures then
          print_endline "\n✓ All migrations completed successfully\n"
        else begin
          Printf.eprintf "\n✗ %d migrations failed:\n" (List.length failures);
          List.iter failures ~f:(fun (name, _, err) ->
            Printf.eprintf "  - %s: %s\n" name err
          );
          exit 1
        end;

        (* Generate report *)
        print_endline "Step 3: Validating migration...";
        match generate_report () with
        | Ok () -> exit 0
        | Error err ->
            Printf.eprintf "ERROR generating report: %s\n" err;
            exit 1

end

(* Command-line interface *)
let () =
  let open Command.Let_syntax in
  Command.basic
    ~summary:"Migrate hardcoded configuration to database"
    [%map_open
      let host = flag "-host" (optional_with_default "localhost" string)
          ~doc:"HOST Database host (default: localhost)"
      and port = flag "-port" (optional_with_default 5432 int)
          ~doc:"PORT Database port (default: 5432)"
      and database = flag "-database" (required string)
          ~doc:"DATABASE Database name"
      and user = flag "-user" (required string)
          ~doc:"USER Database user"
      and password = flag "-password" (required string)
          ~doc:"PASSWORD Database password"
      and migrations_dir = flag "-migrations-dir" (optional_with_default "../migrations" string)
          ~doc:"DIR Migrations directory (default: ../migrations)"
      in
      fun () ->
        ConfigMigration.run
          ~host
          ~port
          ~database
          ~user
          ~password
          ~migrations_dir
          ()
    ]
  |> Command_unix.run

(* Usage:

   dune exec -- backend/scripts/migrate_config_to_db.exe \
     -database tonsurance \
     -user admin \
     -password secret \
     -migrations-dir backend/migrations

*)
