(* Vault Synchronization Module
 *
 * Synchronizes backend state with on-chain MultiTrancheVault contract.
 *
 * Features:
 * - Periodic sync of tranche capital and coverage from blockchain
 * - Feeds data into utilization_tracker for APY calculations
 * - Detects drift between backend and on-chain state
 * - Automatic reconciliation on mismatch
 *)

open Core
open Lwt.Syntax
open Types
open Integration.Database
open Integration.Ton_client
open Pool.Utilization_tracker

module VaultSync = struct

  (** Sync configuration *)
  type sync_config = {
    ton_config: TonClient.ton_config;
    vault_address: TonClient.ton_address;
    sync_interval_seconds: float;
    drift_threshold_percent: float; (* Alert if drift > threshold *)
  }

  let default_sync_config vault_address = {
    ton_config = TonClient.default_config;
    vault_address;
    sync_interval_seconds = 300.0; (* 5 minutes *)
    drift_threshold_percent = 5.0;  (* 5% drift triggers alert *)
  }

  (** Sync result *)
  type sync_result = {
    tranche_id: tranche;
    on_chain_capital: int64;
    backend_capital: int64;
    on_chain_coverage: int64; (* Inferred from total_coverage_sold *)
    backend_coverage: int64;
    capital_drift_pct: float;
    coverage_drift_pct: float;
    synced_at: float;
  } [@@deriving sexp]

  (** Tranche ID mapping (FunC uses 1-6, OCaml uses enum) *)
  let tranche_id_to_int = function
    | SURE_BTC -> 1
    | SURE_SNR -> 2
    | SURE_MEZZ -> 3
    | SURE_JNR -> 4
    | SURE_JNR_PLUS -> 5
    | SURE_EQT -> 6

  let int_to_tranche = function
    | 1 -> Some SURE_BTC
    | 2 -> Some SURE_SNR
    | 3 -> Some SURE_MEZZ
    | 4 -> Some SURE_JNR
    | 5 -> Some SURE_JNR_PLUS
    | 6 -> Some SURE_EQT
    | _ -> None

  (** Calculate drift percentage *)
  let calculate_drift ~on_chain ~backend : float =
    if Int64.(backend = 0L) then
      if Int64.(on_chain = 0L) then 0.0
      else 100.0 (* Infinite drift if backend has 0 but on-chain has value *)
    else
      let diff = Int64.(on_chain - backend) |> Int64.to_float in
      let backend_f = Int64.to_float backend in
      (Float.abs diff) /. backend_f *. 100.0

  (** Fetch on-chain state for a single tranche *)
  let fetch_tranche_state
      (config: sync_config)
      ~(tranche: tranche)
    : (int64 * int64) option Lwt.t =

    let tranche_id = tranche_id_to_int tranche in

    let%lwt capital_opt = TonClient.MultiTrancheVault.get_tranche_capital
      config.ton_config
      ~contract_address:config.vault_address
      ~tranche_id
    in

    match capital_opt with
    | None -> Lwt.return None
    | Some capital ->
        (* Also get total coverage sold for this tranche *)
        (* In production, would have per-tranche coverage tracking *)
        (* For now, use proportional allocation based on tranche capital *)
        let%lwt total_coverage_opt = TonClient.MultiTrancheVault.get_total_capital
          config.ton_config
          ~contract_address:config.vault_address
        in

        let coverage_sold = match total_coverage_opt with
          | Some total_cap ->
              (* Approximate coverage as 70% of capital (LTV assumption) *)
              Int64.(capital * 70L / 100L)
          | None -> 0L
        in

        Lwt.return (Some (capital, coverage_sold))

  (** Sync a single tranche *)
  let sync_tranche
      (config: sync_config)
      ~(tranche: tranche)
    : sync_result option Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "Syncing %s from blockchain..." (tranche_to_string tranche)
    ) in

    (* Fetch on-chain state *)
    let%lwt on_chain_opt = fetch_tranche_state config ~tranche in

    match on_chain_opt with
    | None ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "Failed to fetch on-chain state for %s" (tranche_to_string tranche)
        ) in
        Lwt.return None

    | Some (on_chain_capital, on_chain_coverage) ->
        (* Get backend state *)
        let%lwt backend_util = UtilizationTracker.get_tranche_utilization ~tranche in

        let backend_capital = backend_util.total_capital in
        let backend_coverage = backend_util.coverage_sold in

        (* Calculate drift *)
        let capital_drift = calculate_drift
          ~on_chain:on_chain_capital
          ~backend:backend_capital
        in

        let coverage_drift = calculate_drift
          ~on_chain:on_chain_coverage
          ~backend:backend_coverage
        in

        let result = {
          tranche_id = tranche;
          on_chain_capital;
          backend_capital;
          on_chain_coverage;
          backend_coverage;
          capital_drift_pct = capital_drift;
          coverage_drift_pct = coverage_drift;
          synced_at = Unix.time ();
        } in

        (* Check for significant drift *)
        let%lwt () =
          if capital_drift > config.drift_threshold_percent then
            Logs_lwt.warn (fun m ->
              m "⚠️  DRIFT DETECTED: %s capital drift %.2f%% (on-chain: %Ld, backend: %Ld)"
                (tranche_to_string tranche)
                capital_drift
                on_chain_capital
                backend_capital
            )
          else
            Lwt.return_unit
        in

        let%lwt () =
          if coverage_drift > config.drift_threshold_percent then
            Logs_lwt.warn (fun m ->
              m "⚠️  DRIFT DETECTED: %s coverage drift %.2f%% (on-chain: %Ld, backend: %Ld)"
                (tranche_to_string tranche)
                coverage_drift
                on_chain_coverage
                backend_coverage
            )
          else
            Lwt.return_unit
        in

        (* Update backend state with authoritative on-chain data *)
        let%lwt () = UtilizationTracker.sync_from_chain
          ~tranche
          ~total_capital:on_chain_capital
          ~coverage_sold:on_chain_coverage
        in

        Lwt.return (Some result)

  (** Sync all tranches *)
  let sync_all_tranches (config: sync_config) : sync_result list Lwt.t =
    let all_tranches = [
      SURE_BTC; SURE_SNR; SURE_MEZZ;
      SURE_JNR; SURE_JNR_PLUS; SURE_EQT
    ] in

    let%lwt results = Lwt_list.filter_map_s
      (fun tranche -> sync_tranche config ~tranche)
      all_tranches
    in

    Lwt.return results

  (** Continuous sync loop *)
  let start_sync_loop (config: sync_config) : unit Lwt.t =
    let rec loop () =
      let%lwt () =
        try%lwt
          Lwt_io.printlf "\n[%s] Starting vault synchronization..."
            (Time.to_string (Time.now ())) >>= fun () ->

          let%lwt results = sync_all_tranches config in

          (* Log summary *)
          Lwt_io.printlf "=== Vault Sync Summary ===" >>= fun () ->
          Lwt_list.iter_s (fun result ->
            Lwt_io.printlf "  %s: capital=%Ld (drift: %.2f%%), coverage=%Ld (drift: %.2f%%)"
              (tranche_to_string result.tranche_id)
              result.on_chain_capital
              result.capital_drift_pct
              result.on_chain_coverage
              result.coverage_drift_pct
          ) results >>= fun () ->

          Lwt_io.printlf "=========================\n"

        with exn ->
          Lwt_io.eprintlf "Error in vault sync: %s" (Exn.to_string exn)
      in

      let%lwt () = Lwt_unix.sleep config.sync_interval_seconds in
      loop ()
    in

    Lwt_io.printlf "\n╔════════════════════════════════════════╗" >>= fun () ->
    Lwt_io.printlf "║  Vault Synchronization Started         ║" >>= fun () ->
    Lwt_io.printlf "╚════════════════════════════════════════╝\n" >>= fun () ->
    Lwt_io.printlf "Vault: %s" config.vault_address >>= fun () ->
    Lwt_io.printlf "Sync interval: %.0f seconds\n" config.sync_interval_seconds >>= fun () ->

    loop ()

  (** One-time sync (for manual triggers) *)
  let sync_now (config: sync_config) : unit Lwt.t =
    let%lwt results = sync_all_tranches config in

    Lwt_io.printlf "Synced %d tranches" (List.length results) >>= fun () ->

    Lwt_list.iter_s (fun result ->
      Lwt_io.printlf "  %s: on-chain=%Ld, backend=%Ld, drift=%.2f%%"
        (tranche_to_string result.tranche_id)
        result.on_chain_capital
        result.backend_capital
        result.capital_drift_pct
    ) results

end
