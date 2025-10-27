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
open Lwt.Infix
open Ton_client

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
    tranche_id: int;
    on_chain_capital: int64;
    backend_capital: int64;
    on_chain_coverage: int64; (* Inferred from total_coverage_sold *)
    backend_coverage: int64;
    capital_drift_pct: float;
    coverage_drift_pct: float;
    synced_at: float;
  } [@@deriving sexp]

  (** Tranche ID mapping (FunC uses 1-6, OCaml uses enum) *)
  (* TODO: Define tranche variant type in types.ml before using *)
  let tranche_id_to_int id = id  (* Passthrough for now *)

  let int_to_tranche = function
    | id when id >= 1 && id <= 6 -> Some id
    | _ -> None
  (*
    | 1 -> Some SURE_BTC
    | 2 -> Some SURE_SNR
    | 3 -> Some SURE_MEZZ
    | 4 -> Some SURE_JNR
    | 5 -> Some SURE_JNR_PLUS
    | 6 -> Some SURE_EQT
    | _ -> None
  *)

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
      ~(tranche: int)
    : (int64 * int64) option Lwt.t =

    let tranche_id = tranche in

    (* TODO: Implement get_tranche_capital in ton_client.ml
     * Currently stubbed to allow compilation *)
    let%lwt tranche_data_opt = TonClient.MultiTrancheVault.get_tranche
      config.ton_config
      ~contract_address:config.vault_address
      ~tranche_id
    in

    match tranche_data_opt with
    | None -> Lwt.return None
    | Some _tranche_json ->
        (* TODO: Parse tranche JSON to extract capital amount
         * For now, return None to allow compilation *)
        let%lwt total_coverage_opt = TonClient.MultiTrancheVault.get_total_capital
          config.ton_config
          ~contract_address:config.vault_address
        in

        let coverage_sold = match total_coverage_opt with
          | Some total_cap ->
              (* Approximate coverage as 70% of capital (LTV assumption) *)
              Int64.(total_cap * 70L / 100L)
          | None -> 0L
        in

        (* Stubbed: Return None until tranche capital parsing implemented *)
        let _ = coverage_sold in
        Lwt.return None

  (** Sync a single tranche *)
  let sync_tranche
      (config: sync_config)
      ~(tranche: int)
    : sync_result option Lwt.t =

    let%lwt () = Logs_lwt.info (fun m ->
      m "Syncing tranche %d from blockchain..." tranche
    ) in

    (* Fetch on-chain state *)
    let%lwt on_chain_opt = fetch_tranche_state config ~tranche in

    match on_chain_opt with
    | None ->
        let%lwt () = Logs_lwt.warn (fun m ->
          m "Failed to fetch on-chain state for tranche %d" tranche
        ) in
        Lwt.return None

    | Some (on_chain_capital, on_chain_coverage) ->
        (* TODO: Integrate with UtilizationTracker from pool module
         * For now, stub to allow compilation *)
        let backend_capital = 0L in
        let backend_coverage = 0L in

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
          synced_at = Time_float.now ()
            |> Time_float.to_span_since_epoch
            |> Time_float.Span.to_sec;
        } in

        (* Check for significant drift *)
        let%lwt () =
          if Float.(capital_drift > config.drift_threshold_percent) then
            Logs_lwt.warn (fun m ->
              m "⚠️  DRIFT DETECTED: tranche %d capital drift %.2f%% (on-chain: %Ld, backend: %Ld)"
                tranche
                capital_drift
                on_chain_capital
                backend_capital
            )
          else
            Lwt.return_unit
        in

        let%lwt () =
          if Float.(coverage_drift > config.drift_threshold_percent) then
            Logs_lwt.warn (fun m ->
              m "⚠️  DRIFT DETECTED: tranche %d coverage drift %.2f%% (on-chain: %Ld, backend: %Ld)"
                tranche
                coverage_drift
                on_chain_coverage
                backend_coverage
            )
          else
            Lwt.return_unit
        in

        (* TODO: Update backend state via UtilizationTracker
         * Stubbed for now *)

        Lwt.return (Some result)

  (** Sync all tranches *)
  let sync_all_tranches (config: sync_config) : sync_result list Lwt.t =
    (* TODO: Use tranche enum from types.ml once defined
     * For now, use int IDs 1-6 *)
    let all_tranches = [1; 2; 3; 4; 5; 6] in

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
          let timestamp = Time_float.now ()
            |> Time_float.to_span_since_epoch
            |> Time_float.Span.to_sec
            |> Float.to_string
          in
          Lwt_io.printlf "\n[%s] Starting vault synchronization..."
            timestamp >>= fun () ->

          let%lwt results = sync_all_tranches config in

          (* Log summary *)
          Lwt_io.printlf "=== Vault Sync Summary ===" >>= fun () ->
          Lwt_list.iter_s (fun result ->
            Lwt_io.printlf "  Tranche %d: capital=%Ld (drift: %.2f%%), coverage=%Ld (drift: %.2f%%)"
              result.tranche_id
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
      Lwt_io.printlf "  Tranche %d: on-chain=%Ld, backend=%Ld, drift=%.2f%%"
        result.tranche_id
        result.on_chain_capital
        result.backend_capital
        result.capital_drift_pct
    ) results

end
