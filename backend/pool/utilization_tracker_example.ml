(* Example: Using Utilization Tracker with Tranche APY API
 *
 * This example demonstrates how to integrate the UtilizationTracker
 * with the existing Tranche APY API to provide real-time APY quotes
 * based on actual vault utilization.
 *)

open Core
open Lwt.Syntax
open Pool.Utilization_tracker
(* open Pricing_engine.Tranche_pricing *)

module Example = struct

  (** Initialize the utilization tracker with database *)
  let init_tracker () =
    let db_config = Integration.Database.{
      host = Sys.getenv_exn "DB_HOST";
      port = Int.of_string (Sys.getenv_exn "DB_PORT");
      database = Sys.getenv_exn "DB_NAME";
      user = Sys.getenv_exn "DB_USER";
      password = Sys.getenv_exn "DB_PASSWORD";
      pool_size = 10;
    } in

    let* result = UtilizationTracker.init ~database_config in
    match result with
    | Ok () ->
        let* () = Logs_lwt.info (fun m -> m "✓ Utilization tracker initialized") in
        Lwt.return_unit
    | Error e ->
        let* () = Logs_lwt.err (fun m ->
          m "✗ Failed to initialize: %s" (Types.error_to_string e)
        ) in
        Lwt.fail_with "Initialization failed"

  (** Example 1: Handle a vault deposit *)
  let handle_deposit ~tranche ~amount_ton =
    let* () = Logs_lwt.info (fun m ->
      m "Handling deposit: %f TON to %s"
        amount_ton
        (tranche_to_string tranche)
    ) in

    let amount_nano = Int64.of_float (amount_ton *. 1_000_000_000.0) in

    (* Update capital in tracker *)
    let* () = UtilizationTracker.update_capital ~tranche ~delta:amount_nano in

    (* Get updated utilization and APY *)
    let* util = UtilizationTracker.get_tranche_utilization ~tranche in

    let* () = Logs_lwt.info (fun m ->
      m "Updated: Capital=%Ld nanoTON, Utilization=%.2f%%, APY=%.2f%%"
        util.total_capital
        (util.utilization_ratio *. 100.0)
        util.current_apy
    ) in

    Lwt.return util

  (** Example 2: Handle a policy purchase *)
  let handle_policy_purchase ~tranche ~coverage_amount_ton =
    let* () = Logs_lwt.info (fun m ->
      m "Handling policy purchase: %f TON coverage from %s"
        coverage_amount_ton
        (tranche_to_string tranche)
    ) in

    let coverage_nano = Int64.of_float (coverage_amount_ton *. 1_000_000_000.0) in

    (* Check if vault can accept this coverage *)
    let* can_accept = UtilizationTracker.can_accept_coverage ~tranche ~amount:coverage_nano in

    if not can_accept then (
      let* () = Logs_lwt.warn (fun m ->
        m "⚠️  Cannot accept coverage: would exceed maximum utilization"
      ) in
      Lwt.return_error "Vault capacity exceeded"
    ) else (
      (* Update coverage sold *)
      let* () = UtilizationTracker.update_coverage ~tranche ~delta:coverage_nano in

      (* Get updated state *)
      let* util = UtilizationTracker.get_tranche_utilization ~tranche in

      let* () = Logs_lwt.info (fun m ->
        m "Policy accepted: Coverage=%Ld nanoTON, Utilization=%.2f%%, New APY=%.2f%%"
          util.coverage_sold
          (util.utilization_ratio *. 100.0)
          util.current_apy
      ) in

      Lwt.return_ok util
    )

  (** Example 3: Get real-time APY quote for frontend *)
  let get_apy_quote ~tranche =
    let* util = UtilizationTracker.get_tranche_utilization ~tranche in

    let config = get_tranche_config ~tranche in

    let quote = `Assoc [
      ("tranche_id", `String (tranche_to_string tranche));
      ("current_apy", `Float util.current_apy);
      ("utilization", `Float util.utilization_ratio);
      ("apy_range", `Assoc [
        ("min", `Float config.apy_min);
        ("max", `Float config.apy_max);
      ]);
      ("curve_type", `String (curve_type_to_string config.curve_type));
      ("total_capital_ton", `Float (Int64.to_float util.total_capital /. 1e9));
      ("coverage_sold_ton", `Float (Int64.to_float util.coverage_sold /. 1e9));
      ("available_capacity_ton", `Float (
        let* capacity = UtilizationTracker.get_available_capacity ~tranche in
        Lwt.return (Int64.to_float capacity /. 1e9)
        |> Lwt_main.run
      ));
      ("last_updated", `Float util.last_updated);
    ] in

    Lwt.return quote

  (** Example 4: Get all tranches dashboard data *)
  let get_dashboard_data () =
    let* all_utils = UtilizationTracker.get_all_utilizations () in

    let tranches_json = List.map all_utils ~f:(fun util ->
      let config = get_tranche_config ~tranche:util.tranche_id in
      `Assoc [
        ("tranche_id", `String (tranche_to_string util.tranche_id));
        ("current_apy", `Float util.current_apy);
        ("utilization", `Float util.utilization_ratio);
        ("total_capital_ton", `Float (Int64.to_float util.total_capital /. 1e9));
        ("coverage_sold_ton", `Float (Int64.to_float util.coverage_sold /. 1e9));
        ("allocation_percent", `Int config.allocation_percent);
      ]
    ) in

    let dashboard = `Assoc [
      ("timestamp", `Float (Unix.time ()));
      ("tranches", `List tranches_json);
    ] in

    Lwt.return dashboard

  (** Example 5: Monitor and alert on risk thresholds *)
  let monitor_risk_thresholds () =
    let* all_utils = UtilizationTracker.get_all_utilizations () in

    Lwt_list.iter_s (fun util ->
      (* Check high utilization *)
      if util.utilization_ratio >= 0.90 then
        let* () = Logs_lwt.warn (fun m ->
          m "⚠️  HIGH UTILIZATION: %s at %.2f%%"
            (tranche_to_string util.tranche_id)
            (util.utilization_ratio *. 100.0)
        ) in
        Lwt.return_unit
      else if util.utilization_ratio >= 0.75 then
        let* () = Logs_lwt.info (fun m ->
          m "ℹ️  Elevated utilization: %s at %.2f%%"
            (tranche_to_string util.tranche_id)
            (util.utilization_ratio *. 100.0)
        ) in
        Lwt.return_unit
      else
        Lwt.return_unit
    ) all_utils

  (** Example 6: Sync from on-chain vault state *)
  let sync_from_chain_example () =
    (* Simulate reading from MultiTrancheVault contract *)
    let chain_data = [
      ("SURE_BTC", 25_000_000_000_000L, 10_000_000_000_000L);   (* 25k TON, 10k coverage *)
      ("SURE_SNR", 20_000_000_000_000L, 15_000_000_000_000L);   (* 20k TON, 15k coverage *)
      ("SURE_MEZZ", 18_000_000_000_000L, 14_000_000_000_000L);  (* 18k TON, 14k coverage *)
      (SURE_JNR, 15_000_000_000_000L, 12_000_000_000_000L);   (* 15k TON, 12k coverage *)
      (SURE_JNR_PLUS, 12_000_000_000_000L, 10_000_000_000_000L); (* 12k TON, 10k coverage *)
      (SURE_EQT, 10_000_000_000_000L, 8_000_000_000_000L);    (* 10k TON, 8k coverage *)
    ] in

    let* () = Logs_lwt.info (fun m ->
      m "Syncing utilization from on-chain vault state..."
    ) in

    Lwt_list.iter_s (fun (string, capital, coverage) ->
      UtilizationTracker.sync_from_chain ~tranche ~total_capital:capital ~coverage_sold:coverage
    ) chain_data

  (** Example 7: Integration with Dream REST API *)
  let create_api_endpoints () =
    let open Dream in

    (* GET /api/v1/utilization/:tranche_id *)
    let get_utilization_handler req =
      let tranche_str = Dream.param req "tranche_id" in

      match tranche_of_string tranche_str with
      | Error msg ->
          Dream.json ~status:`Bad_Request
            (Yojson.Safe.to_string (`Assoc [("error", `String msg)]))

      | Ok tranche ->
          let* quote = get_apy_quote ~tranche in
          Dream.json (Yojson.Safe.to_string quote)
    in

    (* GET /api/v1/utilization/dashboard *)
    let dashboard_handler _req =
      let* dashboard = get_dashboard_data () in
      Dream.json (Yojson.Safe.to_string dashboard)
    in

    (* GET /api/v1/utilization/capacity/:tranche_id *)
    let capacity_handler req =
      let tranche_str = Dream.param req "tranche_id" in

      match tranche_of_string tranche_str with
      | Error msg ->
          Dream.json ~status:`Bad_Request
            (Yojson.Safe.to_string (`Assoc [("error", `String msg)]))

      | Ok tranche ->
          let* capacity = UtilizationTracker.get_available_capacity ~tranche in
          let* collat_ratio = UtilizationTracker.get_collateralization_ratio ~tranche in

          Dream.json (Yojson.Safe.to_string (`Assoc [
            ("tranche_id", `String (tranche_to_string tranche));
            ("available_capacity_nanoton", `String (Int64.to_string capacity));
            ("available_capacity_ton", `Float (Int64.to_float capacity /. 1e9));
            ("collateralization_ratio", `Float collat_ratio);
          ]))
    in

    [
      Dream.get "/api/v1/utilization/:tranche_id" get_utilization_handler;
      Dream.get "/api/v1/utilization/dashboard" dashboard_handler;
      Dream.get "/api/v1/utilization/capacity/:tranche_id" capacity_handler;
    ]

  (** Main example runner *)
  let run () =
    Logs.set_reporter (Logs_fmt.reporter ());
    Logs.set_level (Some Logs.Info);

    let* () = init_tracker () in

    (* Example workflow *)
    let* () = Logs_lwt.info (fun m -> m "\n=== Example Workflow ===\n") in

    (* 1. Sync from chain *)
    let* () = sync_from_chain_example () in

    (* 2. Handle a deposit *)
    let* _util = handle_deposit ~tranche:"SURE_SNR" ~amount_ton:5000.0 in

    (* 3. Handle policy purchases *)
    let* result = handle_policy_purchase ~tranche:"SURE_SNR" ~coverage_amount_ton:2000.0 in
    (match result with
    | Ok _util -> Logs_lwt.info (fun m -> m "✓ Policy purchase accepted")
    | Error msg -> Logs_lwt.err (fun m -> m "✗ Policy rejected: %s" msg)
    ) >>= fun () ->

    (* 4. Get dashboard data *)
    let* dashboard = get_dashboard_data () in
    let* () = Logs_lwt.info (fun m ->
      m "Dashboard data:\n%s"
        (Yojson.Safe.pretty_to_string dashboard)
    ) in

    (* 5. Monitor risk thresholds *)
    let* () = monitor_risk_thresholds () in

    (* 6. Get statistics *)
    let* stats = UtilizationTracker.get_statistics () in
    let* () = Logs_lwt.info (fun m -> m "Statistics: %s" stats) in

    Lwt.return_unit

end

(** CLI entry point *)
let () =
  Lwt_main.run (Example.run ())
