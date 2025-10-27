(* Unit Tests for Utilization Tracker Module *)

open Core
open Lwt.Syntax
open Alcotest
open Pool.Utilization_tracker

module UT = UtilizationTracker

(** Test fixtures *)
let _test_db_config : Database.Database.db_config = {
  host = "localhost";
  port = 5432;
  database = "tonsurance_test";
  user = "postgres";
  password = "";
  pool_size = 5;
}

(** Helper: Convert TON to nanoTON *)
let ton_to_nano (ton : float) : int64 =
  Int64.of_float (ton *. 1_000_000_000.0)

(** Test: Calculate utilization ratio *)
let test_calculate_utilization_ratio () =
  let capital = ton_to_nano 1000.0 in
    let coverage = ton_to_nano 500.0 in

    let ratio = UT.calculate_utilization_ratio ~total_capital:capital ~coverage_sold:coverage in

    check (float 0.01) "Utilization should be 50%" 0.50 ratio;

    (* Test zero capital *)
    let ratio_zero = UT.calculate_utilization_ratio ~total_capital:0L ~coverage_sold:coverage in
    check (float 0.01) "Zero capital should give 0% utilization" 0.0 ratio_zero;

    (* Test over 100% *)
    let ratio_over = UT.calculate_utilization_ratio
      ~total_capital:capital
      ~coverage_sold:(Int64.(capital * 2L))
    in
    check (float 0.01) "Over 100% should cap at 1.0" 1.0 ratio_over;

    Lwt.return_unit

(** Test: Build utilization record *)
let test_build_utilization () =
  let capital = ton_to_nano 1000.0 in
    let coverage = ton_to_nano 750.0 in
    let timestamp = Time_float.now () |> Time_float.to_span_since_epoch |> Time_float.Span.to_sec in

    let util = UT.build_utilization
      ~tranche:"SURE-SNR"
      ~total_capital:capital
      ~coverage_sold:coverage
      ~timestamp
    in

    check (string) "Tranche should be SURE_SNR"
      "SURE-SNR"
      util.tranche_id;

    check (int64) "Capital should match" capital util.total_capital;
    check (int64) "Coverage should match" coverage util.coverage_sold;

    check (float 0.01) "Utilization should be 75%" 0.75 util.utilization_ratio;

    (* APY should be between min (6.5%) and max (10%) for SURE_SNR *)
    check bool "APY should be >= min" true Float.(util.current_apy >= 6.5);
    check bool "APY should be <= max" true Float.(util.current_apy <= 10.0);

    Lwt.return_unit

(** Test: Update capital *)
let test_update_capital () =
  let open Lwt.Syntax in
  (* Initialize in-memory mode (no DB) *)
  UT.clear_caches ();

  (* Simulate initial state *)
  let* () = UT.sync_from_chain
    ~tranche:"SURE-MEZZ"
    ~total_capital:(ton_to_nano 1000.0)
    ~coverage_sold:(ton_to_nano 500.0)
  in

  (* Update capital: +500 TON deposit *)
  let* () = UT.update_capital
    ~tranche:"SURE-MEZZ"
    ~delta:(ton_to_nano 500.0)
  in

  (* Get updated utilization *)
  let* util = UT.get_tranche_utilization ~tranche:"SURE-MEZZ" in

  check (int64) "Capital should be 1500 TON"
    (ton_to_nano 1500.0)
    util.total_capital;

  check (float 0.01) "Utilization should drop to 33.33%"
    0.333
    util.utilization_ratio;

  Lwt.return_unit

(** Test: Update coverage *)
let test_update_coverage () =
  let open Lwt.Syntax in
    UT.clear_caches ();

    (* Simulate initial state *)
    let* () = UT.sync_from_chain
      ~tranche:"SURE-JNR"
      ~total_capital:(ton_to_nano 1000.0)
      ~coverage_sold:(ton_to_nano 500.0)
    in

    (* Update coverage: +300 TON policy sold *)
    let* () = UT.update_coverage
      ~tranche:"SURE-JNR"
      ~delta:(ton_to_nano 300.0)
    in

    (* Get updated utilization *)
    let* util = UT.get_tranche_utilization ~tranche:"SURE-JNR" in

    check (int64) "Coverage should be 800 TON"
      (ton_to_nano 800.0)
      util.coverage_sold;

    check (float 0.01) "Utilization should rise to 80%"
      0.80
      util.utilization_ratio;

    Lwt.return_unit

(** Test: Can accept coverage *)
let test_can_accept_coverage () =
    UT.clear_caches ();

    (* Set up tranche at 80% utilization *)
    let* () = UT.sync_from_chain
      ~tranche:"SURE-JNR+"
      ~total_capital:(ton_to_nano 1000.0)
      ~coverage_sold:(ton_to_nano 800.0)
    in

    (* Try to add 100 TON (would be 90%, OK) *)
    let* can_accept_100 = UT.can_accept_coverage
      ~tranche:"SURE-JNR+"
      ~amount:(ton_to_nano 100.0)
    in
    check bool "Should accept 100 TON (90% total)" true can_accept_100;

    (* Try to add 200 TON (would be 100%, NOT OK - exceeds 95% max) *)
    let* can_accept_200 = UT.can_accept_coverage
      ~tranche:"SURE-JNR+"
      ~amount:(ton_to_nano 200.0)
    in
    check bool "Should reject 200 TON (100% exceeds 95% max)" false can_accept_200;

    Lwt.return_unit

(** Test: Collateralization ratio *)
let test_collateralization_ratio () =
    UT.clear_caches ();

    (* Set up tranche with 2x collateralization (200%) *)
    let* () = UT.sync_from_chain
      ~tranche:"SURE-EQT"
      ~total_capital:(ton_to_nano 2000.0)
      ~coverage_sold:(ton_to_nano 1000.0)
    in

    let* ratio = UT.get_collateralization_ratio ~tranche:"SURE-EQT" in
    check (float 0.01) "Collateralization should be 2.0x" 2.0 ratio;

    (* Test with no coverage (infinite collateralization) *)
    let* () = UT.sync_from_chain
      ~tranche:"SURE-BTC"
      ~total_capital:(ton_to_nano 1000.0)
      ~coverage_sold:0L
    in

    let* ratio_inf = UT.get_collateralization_ratio ~tranche:"SURE-BTC" in
    check bool "Infinite collateralization should be > 1000" true Float.(ratio_inf > 1000.0);

    Lwt.return_unit

(** Test: Get available capacity *)
let test_available_capacity () =
    UT.clear_caches ();

    (* Set up tranche at 50% utilization with 1000 TON capital *)
    let* () = UT.sync_from_chain
      ~tranche:"SURE-SNR"
      ~total_capital:(ton_to_nano 1000.0)
      ~coverage_sold:(ton_to_nano 500.0)
    in

    let* capacity = UT.get_available_capacity ~tranche:"SURE-SNR" in

    (* Max utilization is 95%, so max coverage = 950 TON *)
    (* Currently sold = 500 TON, so available = 450 TON *)
    check (int64) "Available capacity should be 450 TON"
      (ton_to_nano 450.0)
      capacity;

    Lwt.return_unit

(** Test: Get all utilizations *)
let test_get_all_utilizations () =
    UT.clear_caches ();

    (* Set up different tranches *)
    let* () = UT.sync_from_chain ~tranche:"SURE-BTC"
      ~total_capital:(ton_to_nano 1000.0) ~coverage_sold:(ton_to_nano 400.0) in
    let* () = UT.sync_from_chain ~tranche:"SURE-SNR"
      ~total_capital:(ton_to_nano 800.0) ~coverage_sold:(ton_to_nano 600.0) in
    let* () = UT.sync_from_chain ~tranche:"SURE-MEZZ"
      ~total_capital:(ton_to_nano 600.0) ~coverage_sold:(ton_to_nano 500.0) in

    let* all_utils = UT.get_all_utilizations () in

    check (int) "Should return 6 tranches" 6 (List.length all_utils);

    (* Check SURE_BTC *)
    let btc_util = List.find_exn all_utils ~f:(fun u ->
      String.equal u.tranche_id "SURE-BTC"
    ) in
    check (float 0.01) "SURE_BTC utilization should be 40%"
      0.40 btc_util.utilization_ratio;

    (* Check SURE_SNR *)
    let snr_util = List.find_exn all_utils ~f:(fun u ->
      String.equal u.tranche_id "SURE-SNR"
    ) in
    check (float 0.01) "SURE_SNR utilization should be 75%"
      0.75 snr_util.utilization_ratio;

    Lwt.return_unit

(** Test: Cache behavior *)
let test_cache_behavior () =
    UT.clear_caches ();

    (* Set up initial state *)
    let* () = UT.sync_from_chain
      ~tranche:"SURE-MEZZ"
      ~total_capital:(ton_to_nano 1000.0)
      ~coverage_sold:(ton_to_nano 500.0)
    in

    (* First read - should hit DB and cache *)
    let* util1 = UT.get_tranche_utilization ~tranche:"SURE-MEZZ" in
    let timestamp1 = util1.last_updated in

    (* Second read immediately - should hit cache *)
    let* util2 = UT.get_tranche_utilization ~tranche:"SURE-MEZZ" in
    let timestamp2 = util2.last_updated in

    check (float 0.01) "Cache should return same timestamp"
      timestamp1 timestamp2;

    (* Invalidate cache *)
    UT.invalidate_cache "SURE-MEZZ";

    (* Update and read again *)
    let* () = UT.update_capital ~tranche:"SURE-MEZZ" ~delta:(ton_to_nano 500.0) in
    let* util3 = UT.get_tranche_utilization ~tranche:"SURE-MEZZ" in

    check bool "Capital should be updated"
      true Int64.(util3.total_capital > util1.total_capital);

    Lwt.return_unit

(** Test: APY calculation integration *)
let test_apy_calculation () =
  UT.clear_caches ();

  (* Test different utilization levels for SURE_MEZZ (linear curve: 9% -> 15%) *)
  let test_cases = [
    (0.0, 9.0);   (* 0% utilization = min APY *)
    (0.5, 12.0);  (* 50% utilization = mid APY *)
    (1.0, 15.0);  (* 100% utilization = max APY *)
  ] in

  Lwt_list.iter_s (fun (util_ratio, expected_apy) ->
    let capital = ton_to_nano 1000.0 in
    let coverage = Int64.of_float (Int64.to_float capital *. util_ratio) in

    let* () = UT.sync_from_chain
      ~tranche:"SURE-MEZZ"
      ~total_capital:capital
      ~coverage_sold:coverage
    in

    let* util = UT.get_tranche_utilization ~tranche:"SURE-MEZZ" in

    check (float 0.1) "APY should match expected for utilization"
      expected_apy util.current_apy;

    Lwt.return_unit
  ) test_cases

(** Test: Statistics *)
let test_statistics () =
  UT.clear_caches ();

  (* Set up multiple tranches *)
  let* () = UT.sync_from_chain ~tranche:"SURE-BTC"
    ~total_capital:(ton_to_nano 2000.0) ~coverage_sold:(ton_to_nano 1000.0) in
  let* () = UT.sync_from_chain ~tranche:"SURE-SNR"
    ~total_capital:(ton_to_nano 1000.0) ~coverage_sold:(ton_to_nano 500.0) in

  let* stats = UT.get_statistics () in

  check bool "Stats should contain utilization info"
    true (String.is_substring stats ~substring:"Utilization:");
  check bool "Stats should contain capital info"
    true (String.is_substring stats ~substring:"Capital:");
  check bool "Stats should contain coverage info"
    true (String.is_substring stats ~substring:"Coverage:");

  Lwt.return_unit

(** Test suite *)
let () =
  Lwt_main.run (
    Alcotest_lwt.run "Utilization Tracker Tests" [
      "calculations", [
        Alcotest_lwt.test_case "Calculate utilization ratio" `Quick
          (fun _switch () -> test_calculate_utilization_ratio ());
        Alcotest_lwt.test_case "Build utilization record" `Quick
          (fun _switch () -> test_build_utilization ());
      ];

      "updates", [
        Alcotest_lwt.test_case "Update capital" `Quick
          (fun _switch () -> test_update_capital ());
        Alcotest_lwt.test_case "Update coverage" `Quick
          (fun _switch () -> test_update_coverage ());
      ];

      "capacity", [
        Alcotest_lwt.test_case "Can accept coverage" `Quick
          (fun _switch () -> test_can_accept_coverage ());
        Alcotest_lwt.test_case "Collateralization ratio" `Quick
          (fun _switch () -> test_collateralization_ratio ());
        Alcotest_lwt.test_case "Available capacity" `Quick
          (fun _switch () -> test_available_capacity ());
      ];

      "queries", [
        Alcotest_lwt.test_case "Get all utilizations" `Quick
          (fun _switch () -> test_get_all_utilizations ());
        Alcotest_lwt.test_case "Statistics" `Quick
          (fun _switch () -> test_statistics ());
      ];

      "caching", [
        Alcotest_lwt.test_case "Cache behavior" `Quick
          (fun _switch () -> test_cache_behavior ());
      ];

      "integration", [
        Alcotest_lwt.test_case "APY calculation" `Quick
          (fun _switch () -> test_apy_calculation ());
      ];
    ]
  )
