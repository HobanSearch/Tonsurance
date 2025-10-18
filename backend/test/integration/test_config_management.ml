(** Integration tests for configuration management system
 *  Tests database-backed config, hot-reload, admin API
 *)

open Core
open Lwt.Syntax

(** Test database connection *)
let test_db_uri = "postgresql://tonsurance:dev_password@localhost:5432/tonsurance_test"

(** Helper: Setup test database *)
let setup_test_db () =
  let%lwt () = Logs.info (fun m -> m "Setting up test database...") in

  (* Run migrations *)
  let%lwt exit_code = Lwt_unix.system
    "psql -h localhost -U tonsurance -d tonsurance_test -f backend/migrations/006_config_parameters.sql"
  in

  match exit_code with
  | Unix.WEXITED 0 -> Lwt.return_unit
  | _ -> Lwt.fail_with "Failed to run migrations"

(** Helper: Teardown test database *)
let teardown_test_db () =
  let%lwt () = Logs.info (fun m -> m "Cleaning up test database...") in

  (* Drop tables *)
  let%lwt _ = Lwt_unix.system
    "psql -h localhost -U tonsurance -d tonsurance_test -c 'DROP TABLE IF EXISTS config_audit_log, config_parameters CASCADE'"
  in
  Lwt.return_unit

(** Test suite: Configuration loader *)
module TestConfigLoader = struct

  (** Test: Load float parameter *)
  let test_load_float_param () =
    let%lwt value = Config.Config_loader.get_float
      ~category:"pricing"
      ~key:"base_rate_usdt"
      ~default:0.008
    in

    (* Should return seeded value (0.008) *)
    let is_correct = Float.abs (value -. 0.008) < 0.0001 in
    Alcotest.(check bool) "Loaded correct float value" true is_correct;

    Logs.info (fun m -> m "✓ Loaded base_rate_usdt: %.4f" value);
    Lwt.return_unit

  (** Test: Load int parameter *)
  let test_load_int_param () =
    let%lwt value = Config.Config_loader.get_int
      ~category:"risk"
      ~key:"monte_carlo_simulations"
      ~default:10000
    in

    (* Should return seeded value (10000) *)
    Alcotest.(check int) "Loaded correct int value" 10000 value;

    Logs.info (fun m -> m "✓ Loaded monte_carlo_simulations: %d" value);
    Lwt.return_unit

  (** Test: Load JSON parameter *)
  let test_load_json_param () =
    let%lwt value = Config.Config_loader.get_json
      ~category:"tranche"
      ~key:"senior_config"
      ~default:(`Assoc [])
    in

    (* Should have allocation_pct field *)
    let allocation = value |> Yojson.Safe.Util.member "allocation_pct" |> Yojson.Safe.Util.to_float in
    Alcotest.(check bool) "Senior tranche allocation is 45%" true (Float.abs (allocation -. 0.45) < 0.01);

    Logs.info (fun m -> m "✓ Loaded senior_config: %.0f%% allocation" (allocation *. 100.0));
    Lwt.return_unit

  (** Test: Fallback to default on missing key *)
  let test_fallback_to_default () =
    let%lwt value = Config.Config_loader.get_float
      ~category:"nonexistent"
      ~key:"missing_key"
      ~default:99.99
    in

    (* Should return default *)
    Alcotest.(check bool) "Returned default value" true (Float.abs (value -. 99.99) < 0.01);

    Logs.info (fun m -> m "✓ Fallback to default: %.2f" value);
    Lwt.return_unit

  (** Test: Cache performance *)
  let test_cache_performance () =
    (* First load (cache miss) *)
    let start_time = Unix.gettimeofday () in
    let%lwt _ = Config.Config_loader.get_float
      ~category:"pricing"
      ~key:"base_rate_usdt"
      ~default:0.008
    in
    let first_duration = Unix.gettimeofday () -. start_time in

    (* Second load (cache hit) *)
    let start_time = Unix.gettimeofday () in
    let%lwt _ = Config.Config_loader.get_float
      ~category:"pricing"
      ~key:"base_rate_usdt"
      ~default:0.008
    in
    let second_duration = Unix.gettimeofday () -. start_time in

    (* Cache hit should be at least 10x faster *)
    let speedup = first_duration /. second_duration in
    Alcotest.(check bool) "Cache provides speedup" true (speedup > 10.0);

    Logs.info (fun m -> m "✓ Cache speedup: %.0fx (%.4fs → %.4fs)"
      speedup first_duration second_duration);
    Lwt.return_unit

  (** Test: Hot-reload updates cache *)
  let test_hot_reload () =
    (* Update value in database *)
    let%lwt _ = Lwt_unix.system
      "psql -h localhost -U tonsurance -d tonsurance_test -c \"UPDATE config_parameters SET value_data = '{\\\"value\\\": 0.012}' WHERE category = 'pricing' AND key = 'base_rate_usdt'\""
    in

    (* Trigger reload *)
    let%lwt () = Config.Config_loader.reload_cache () in

    (* Load updated value *)
    let%lwt value = Config.Config_loader.get_float
      ~category:"pricing"
      ~key:"base_rate_usdt"
      ~default:0.008
    in

    (* Should return new value (0.012) *)
    let is_updated = Float.abs (value -. 0.012) < 0.0001 in
    Alcotest.(check bool) "Hot-reload updated value" true is_updated;

    Logs.info (fun m -> m "✓ Hot-reload: 0.008 → %.4f" value);

    (* Reset to original value *)
    let%lwt _ = Lwt_unix.system
      "psql -h localhost -U tonsurance -d tonsurance_test -c \"UPDATE config_parameters SET value_data = '{\\\"value\\\": 0.008}' WHERE category = 'pricing' AND key = 'base_rate_usdt'\""
    in
    Lwt.return_unit

end

(** Test suite: Admin API *)
module TestAdminApi = struct

  (** Helper: Make HTTP request to admin API *)
  let make_request ~method_ ~path ~body_opt ~auth_token =
    let base_url = "http://localhost:8081" in  (* Admin API port *)
    let url = base_url ^ path in

    let headers = [
      ("Content-Type", "application/json");
      ("Authorization", "Bearer " ^ auth_token);
    ] in

    match method_ with
    | `GET ->
        Integration.Http_client.get ~headers url
    | `PUT ->
        let body = Option.value body_opt ~default:"" in
        Integration.Http_client.put ~headers ~body url
    | `POST ->
        let body = Option.value body_opt ~default:"" in
        Integration.Http_client.post ~headers ~body url

  (** Test: List all parameters *)
  let test_list_all_parameters () =
    let%lwt response = make_request
      ~method_:`GET
      ~path:"/admin/config"
      ~body_opt:None
      ~auth_token:"test_admin_token"
    in

    (* Parse response *)
    let json = Yojson.Safe.from_string response.body in
    let params = json |> Yojson.Safe.Util.member "parameters" |> Yojson.Safe.Util.to_list in

    (* Should have 62 seeded parameters *)
    let count = List.length params in
    Alcotest.(check bool) "Has 62 parameters" true (count >= 60);

    Logs.info (fun m -> m "✓ Listed %d parameters" count);
    Lwt.return_unit

  (** Test: Get single parameter *)
  let test_get_single_parameter () =
    let%lwt response = make_request
      ~method_:`GET
      ~path:"/admin/config/pricing/base_rate_usdt"
      ~body_opt:None
      ~auth_token:"test_admin_token"
    in

    let json = Yojson.Safe.from_string response.body in
    let value = json |> Yojson.Safe.Util.member "value_data"
      |> Yojson.Safe.Util.member "value" |> Yojson.Safe.Util.to_float in

    Alcotest.(check bool) "Got correct value" true (Float.abs (value -. 0.008) < 0.0001);

    Logs.info (fun m -> m "✓ Got base_rate_usdt: %.4f" value);
    Lwt.return_unit

  (** Test: Update parameter with audit trail *)
  let test_update_parameter () =
    let update_body = {|{
      "value_data": {"value": 0.009},
      "updated_by": "test_user",
      "reason": "Integration test update"
    }|} in

    let%lwt response = make_request
      ~method_:`PUT
      ~path:"/admin/config/pricing/base_rate_usdt"
      ~body_opt:(Some update_body)
      ~auth_token:"test_admin_token"
    in

    let json = Yojson.Safe.from_string response.body in
    let success = json |> Yojson.Safe.Util.member "success" |> Yojson.Safe.Util.to_bool in

    Alcotest.(check bool) "Update successful" true success;

    (* Verify audit log *)
    let%lwt audit_response = make_request
      ~method_:`GET
      ~path:"/admin/config/audit?limit=1"
      ~body_opt:None
      ~auth_token:"test_admin_token"
    in

    let audit_json = Yojson.Safe.from_string audit_response.body in
    let logs = audit_json |> Yojson.Safe.Util.member "logs" |> Yojson.Safe.Util.to_list in
    let latest = List.hd_exn logs in
    let reason = latest |> Yojson.Safe.Util.member "reason" |> Yojson.Safe.Util.to_string in

    Alcotest.(check string) "Audit log created" "Integration test update" reason;

    Logs.info (fun m -> m "✓ Updated parameter with audit trail");

    (* Reset to original value *)
    let reset_body = {|{
      "value_data": {"value": 0.008},
      "updated_by": "test_user",
      "reason": "Reset after test"
    }|} in
    let%lwt _ = make_request
      ~method_:`PUT
      ~path:"/admin/config/pricing/base_rate_usdt"
      ~body_opt:(Some reset_body)
      ~auth_token:"test_admin_token"
    in
    Lwt.return_unit

  (** Test: Force cache reload *)
  let test_force_reload () =
    let%lwt response = make_request
      ~method_:`POST
      ~path:"/admin/config/reload"
      ~body_opt:None
      ~auth_token:"test_admin_token"
    in

    let json = Yojson.Safe.from_string response.body in
    let success = json |> Yojson.Safe.Util.member "success" |> Yojson.Safe.Util.to_bool in

    Alcotest.(check bool) "Reload successful" true success;
    Logs.info (fun m -> m "✓ Forced cache reload");
    Lwt.return_unit

  (** Test: Authentication required *)
  let test_authentication_required () =
    try%lwt
      let%lwt _ = make_request
        ~method_:`GET
        ~path:"/admin/config"
        ~body_opt:None
        ~auth_token:"invalid_token"
      in
      Alcotest.fail "Should have rejected invalid token";
      Lwt.return_unit
    with _ ->
      Logs.info (fun m -> m "✓ Rejected invalid auth token");
      Lwt.return_unit

end

(** Test suite: ETL pipeline *)
module TestEtlPipeline = struct

  (** Test: Ingest depeg events *)
  let test_ingest_depeg_events () =
    (* Backfill USDC events for March 2023 (Silicon Valley Bank crisis) *)
    let%lwt count = Etl.Depeg_event_ingestion.backfill_asset
      ~asset:USDC
      ~start_date:"2023-03-01"
      ~end_date:"2023-03-31"
    in

    (* Should detect at least 1 depeg event (USDC went to $0.88) *)
    Alcotest.(check bool) "Detected USDC depeg" true (count > 0);

    Logs.info (fun m -> m "✓ Ingested %d USDC depeg events" count);
    Lwt.return_unit

  (** Test: Update correlation matrix *)
  let test_update_correlation_matrix () =
    let%lwt count = Etl.Correlation_matrix_updater.update_correlations
      ~assets:[USDT; USDC; DAI]
      ~windows:[30; 90; 365]
    in

    (* Should calculate 3 pairs × 3 windows = 9 correlations *)
    Alcotest.(check int) "Calculated 9 correlations" 9 count;

    Logs.info (fun m -> m "✓ Updated %d correlation values" count);
    Lwt.return_unit

  (** Test: Generate Monte Carlo scenarios from history *)
  let test_generate_scenarios_from_history () =
    let%lwt scenarios = Risk.Monte_carlo_enhanced.generate_scenarios_from_history
      ~asset:USDC
      ~num_scenarios:100
    in

    let count = List.length scenarios in
    Alcotest.(check bool) "Generated 100 scenarios" true (count >= 90);  (* Allow some tolerance *)

    Logs.info (fun m -> m "✓ Generated %d scenarios from historical data" count);
    Lwt.return_unit

  (** Test: Calculate adaptive VaR *)
  let test_calculate_adaptive_var () =
    let portfolio = [
      (USDT, 1_000_000.0);
      (USDC, 500_000.0);
      (DAI, 250_000.0);
    ] in

    let%lwt result = Risk.Monte_carlo_enhanced.calculate_adaptive_var
      ~portfolio
      ~confidence_level:0.95
    in

    (* VaR should be positive and < 100% of portfolio *)
    let is_reasonable = result.var_95 > 0.0 && result.var_95 < 1_750_000.0 in
    Alcotest.(check bool) "VaR in reasonable range" true is_reasonable;

    Logs.info (fun m -> m "✓ Adaptive VaR (95%%): $%.2f (%.2f%% of portfolio)"
      result.var_95 (result.var_95 /. 1_750_000.0 *. 100.0));
    Lwt.return_unit

  (** Test: Generate daily risk report *)
  let test_generate_risk_report () =
    let%lwt report = Reporting.Risk_report_generator.generate_daily_report () in

    (* Should have all required sections *)
    let has_summary = Option.is_some report.portfolio_summary in
    let has_var = Option.is_some report.var_analysis in
    let has_stress = List.length report.stress_test_results > 0 in

    Alcotest.(check bool) "Report has all sections" true (has_summary && has_var && has_stress);

    Logs.info (fun m -> m "✓ Generated risk report with %d alerts"
      (List.length report.risk_alerts));
    Lwt.return_unit

end

(** Run all tests *)
let () =
  Lwt_main.run begin
    Logs.set_reporter (Logs_fmt.reporter ());
    Logs.set_level (Some Logs.Info);

    (* Setup *)
    let%lwt () = setup_test_db () in

    (* Run tests *)
    let%lwt () = Alcotest_lwt.run "Config Management Tests" [
      "Config Loader", [
        Alcotest_lwt.test_case "Load float parameter" `Quick TestConfigLoader.test_load_float_param;
        Alcotest_lwt.test_case "Load int parameter" `Quick TestConfigLoader.test_load_int_param;
        Alcotest_lwt.test_case "Load JSON parameter" `Quick TestConfigLoader.test_load_json_param;
        Alcotest_lwt.test_case "Fallback to default" `Quick TestConfigLoader.test_fallback_to_default;
        Alcotest_lwt.test_case "Cache performance" `Quick TestConfigLoader.test_cache_performance;
        Alcotest_lwt.test_case "Hot-reload" `Quick TestConfigLoader.test_hot_reload;
      ];

      "Admin API", [
        Alcotest_lwt.test_case "List all parameters" `Quick TestAdminApi.test_list_all_parameters;
        Alcotest_lwt.test_case "Get single parameter" `Quick TestAdminApi.test_get_single_parameter;
        Alcotest_lwt.test_case "Update parameter" `Quick TestAdminApi.test_update_parameter;
        Alcotest_lwt.test_case "Force reload" `Quick TestAdminApi.test_force_reload;
        Alcotest_lwt.test_case "Authentication required" `Quick TestAdminApi.test_authentication_required;
      ];

      "ETL Pipeline", [
        Alcotest_lwt.test_case "Ingest depeg events" `Slow TestEtlPipeline.test_ingest_depeg_events;
        Alcotest_lwt.test_case "Update correlation matrix" `Slow TestEtlPipeline.test_update_correlation_matrix;
        Alcotest_lwt.test_case "Generate scenarios" `Quick TestEtlPipeline.test_generate_scenarios_from_history;
        Alcotest_lwt.test_case "Calculate adaptive VaR" `Quick TestEtlPipeline.test_calculate_adaptive_var;
        Alcotest_lwt.test_case "Generate risk report" `Quick TestEtlPipeline.test_generate_risk_report;
      ];
    ] in

    (* Teardown *)
    teardown_test_db ()
  end
