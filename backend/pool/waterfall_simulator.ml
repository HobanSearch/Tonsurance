(* Waterfall Simulator Module
 *
 * Simulates premium distribution (revenue waterfall) and loss absorption (loss waterfall)
 * for the 6-tier vault system. Used for testing, risk analysis, and scenario planning.
 *
 * Revenue Waterfall (Premium Distribution):
 *   Premiums flow senior → junior (BTC → SNR → MEZZ → JNR → JNR+ → EQT)
 *   Each tranche receives yield based on its APY curve until premium exhausted
 *
 * Loss Waterfall (Loss Absorption):
 *   Losses absorbed junior → senior (EQT → JNR+ → JNR → MEZZ → SNR → BTC)
 *   Each tranche absorbs loss up to its capital, then passes to next senior tranche
 *)

open Core
(* open Pricing_engine.Tranche_pricing *)
open Types

module WaterfallSimulator = struct

  (** Tranche state for simulation *)
  type tranche_state = {
    tranche_id: string; (* tranche ID *)
    capital: int64;              (* Current capital in nanoTON *)
    accumulated_yield: int64;    (* Accumulated yield not yet distributed *)
    apy_min: float;              (* Min APY (%) *)
    apy_max: float;              (* Max APY (%) *)
    utilization: float;          (* 0.0 to 1.0 *)
    current_apy: float;          (* Current APY from bonding curve *)
  } [@@deriving sexp, yojson]

  (** Vault state *)
  type vault_state = {
    tranches: tranche_state list;  (* All 6 tranches *)
    total_capital: int64;
    total_coverage_sold: int64;
    accumulated_losses: int64;
  } [@@deriving sexp, yojson]

  (** Revenue waterfall result *)
  type premium_distribution = {
    total_premium: int64;
    distributions: (string * int64) list;  (* Per-tranche distributions *)
    remaining: int64;                       (* Undistributed premium *)
  } [@@deriving sexp, yojson]

  (** Loss waterfall result *)
  type loss_absorption = {
    total_loss: int64;
    absorptions: (string * int64) list;  (* Per-tranche losses *)
    remaining: int64;                     (* Unabsorbed loss (insolvency) *)
    wiped_tranches: string list;         (* Tranches with capital = 0 *)
  } [@@deriving sexp, yojson]

  (** Helper to get tranche from list *)
  let get_tranche (vault : vault_state) ~tranche : tranche_state option =
    List.find vault.tranches ~f:(fun t -> Poly.equal t.tranche_id tranche)

  (** Helper to update tranche in list *)
  let update_tranche (vault : vault_state) (updated : tranche_state) : vault_state =
    let tranches = List.map vault.tranches ~f:(fun t ->
      if Poly.equal t.tranche_id updated.tranche_id then updated else t
    ) in
    { vault with tranches }

  (** Initialize vault with default state *)
  let create_initial_vault () : vault_state =
    let all_tranches = ["SURE_BTC"; "SURE_SNR"; "SURE_MEZZ"; "SURE_JNR"; "SURE_JNR_PLUS"; "SURE_EQT"] in
    let tranches = List.map all_tranches ~f:(fun tranche ->
      (* Stub: would look up config from Tranche_pricing *)
      {
        tranche_id = tranche;
        capital = 0L;
        accumulated_yield = 0L;
        apy_min = 0.04;  (* 4% min *)
        apy_max = 0.20;  (* 20% max *)
        utilization = 0.0;
        current_apy = 0.08;  (* 8% default *)
      }
    ) in
    {
      tranches;
      total_capital = 0L;
      total_coverage_sold = 0L;
      accumulated_losses = 0L;
    }

  (** Set tranche capital *)
  let set_tranche_capital (vault : vault_state) ~tranche ~capital : vault_state =
    match get_tranche vault ~tranche with
    | None -> vault (* Tranche not found, return unchanged *)
    | Some t ->
        (* Calculate new utilization and APY *)
        let new_utilization = if Int64.(capital = 0L) then 0.0 else 0.0 in
        let new_apy = 0.08 in (* Stub: 8% default *)

        (* Update tranche state *)
        let updated_tranche = {
          t with
          capital;
          utilization = new_utilization;
          current_apy = new_apy;
        } in

        (* Calculate new total capital *)
        let old_capital = t.capital in
        let new_total_capital = Int64.(vault.total_capital - old_capital + capital) in

        (* Update vault *)
        let vault = update_tranche vault updated_tranche in
        { vault with total_capital = new_total_capital }

  (** Calculate vault utilization *)
  let calculate_vault_utilization (vault : vault_state) : float =
    if Int64.(vault.total_capital = 0L) then
      0.0
    else
      let capital_f = Int64.to_float vault.total_capital in
      let coverage_f = Int64.to_float vault.total_coverage_sold in
      Float.min 1.0 (coverage_f /. capital_f)

  (** Check if vault is solvent *)
  let is_solvent (vault : vault_state) : bool =
    Int64.(vault.total_capital >= vault.total_coverage_sold)

  (** Simulate premium distribution (revenue waterfall)
   *
   * Premiums flow senior → junior: BTC → SNR → MEZZ → JNR → JNR+ → EQT
   * Each tranche receives yield based on its current APY until premium exhausted
   *)
  let simulate_premium_distribution (vault : vault_state) ~premium : (premium_distribution * vault_state, error) Result.t =
    if Int64.(premium <= 0L) then
      Error (InvalidPrice "Premium must be positive")
    else
      (* Seniority order: senior to junior *)
      let ordered_tranches = ["SURE_BTC"; "SURE_SNR"; "SURE_MEZZ"; "SURE_JNR"; "SURE_JNR_PLUS"; "SURE_EQT"] in

      let remaining = ref premium in
      let distributions = ref [] in
      let updated_tranches = ref vault.tranches in

      (* Iterate through tranches in seniority order *)
      List.iter ordered_tranches ~f:(fun tranche_id ->
        if Int64.(!remaining > 0L) then (
          match get_tranche { vault with tranches = !updated_tranches } ~tranche:tranche_id with
          | Some t when Int64.(t.capital > 0L) ->
              (* Calculate target yield based on APY (annualized) *)
              (* For simplicity, we'll use the APY as a percentage of capital *)
              (* In production, this would be time-weighted *)
              let capital_f = Int64.to_float t.capital in
              let yearly_yield = capital_f *. (t.current_apy /. 100.0) in
              let yield_nanoton = Int64.of_float yearly_yield in

              (* Cap at remaining premium *)
              let to_distribute = Int64.min yield_nanoton !remaining in

              if Int64.(to_distribute > 0L) then (
                (* Update distributions *)
                distributions := (t.tranche_id, to_distribute) :: !distributions;
                remaining := Int64.(!remaining - to_distribute);

                (* Update tranche accumulated yield *)
                let updated_t = { t with accumulated_yield = Int64.(t.accumulated_yield + to_distribute) } in
                updated_tranches := List.map !updated_tranches ~f:(fun tr ->
                  if Poly.equal tr.tranche_id tranche_id then updated_t else tr
                );
              )
          | _ -> ()
        )
      );

      Ok ({
        total_premium = premium;
        distributions = List.rev !distributions;
        remaining = !remaining;
      }, { vault with tranches = !updated_tranches })

  (** Simulate loss absorption (loss waterfall)
   *
   * Losses absorbed junior → senior: EQT → JNR+ → JNR → MEZZ → SNR → BTC
   * Each tranche absorbs loss up to its capital, then passes remaining to next senior tranche
   *)
  let simulate_loss_absorption (vault : vault_state) ~loss : (loss_absorption * vault_state, error) Result.t =
    if Int64.(loss <= 0L) then
      Error (InvalidPrice "Loss must be positive")
    else
      (* Reverse order: junior to senior *)
      let reverse_tranches = ["SURE_EQT"; "SURE_JNR_PLUS"; "SURE_JNR"; "SURE_MEZZ"; "SURE_SNR"; "SURE_BTC"] in

      let remaining = ref loss in
      let absorptions = ref [] in
      let wiped = ref [] in
      let updated_tranches = ref vault.tranches in

      (* Iterate through tranches in reverse seniority order *)
      List.iter reverse_tranches ~f:(fun tranche_id ->
        if Int64.(!remaining > 0L) then (
          match get_tranche { vault with tranches = !updated_tranches } ~tranche:tranche_id with
          | Some t when Int64.(t.capital > 0L) ->
              (* Calculate loss to absorb (capped at tranche capital) *)
              let to_absorb = Int64.min !remaining t.capital in

              (* Update absorptions *)
              absorptions := (t.tranche_id, to_absorb) :: !absorptions;
              remaining := Int64.(!remaining - to_absorb);

              (* Update tranche capital *)
              let new_capital = Int64.(t.capital - to_absorb) in

              (* Track wiped tranches *)
              if Int64.(new_capital = 0L) then
                wiped := t.tranche_id :: !wiped;

              (* Recalculate utilization and APY *)
              let new_utilization = if Int64.(new_capital = 0L) then 0.0 else 0.0 in
              let new_apy = 0.08 in (* Stub: 8% default *)

              let updated_t = {
                t with
                capital = new_capital;
                utilization = new_utilization;
                current_apy = new_apy;
              } in

              updated_tranches := List.map !updated_tranches ~f:(fun tr ->
                if Poly.equal tr.tranche_id tranche_id then updated_t else tr
              );
          | _ -> ()
        )
      );

      let total_capital_before = vault.total_capital in
      let loss_absorbed = Int64.(loss - !remaining) in
      let total_capital_after = Int64.(total_capital_before - loss_absorbed) in

      Ok ({
        total_loss = loss;
        absorptions = List.rev !absorptions;
        remaining = !remaining;
        wiped_tranches = List.rev !wiped;
      }, {
        vault with
        tranches = !updated_tranches;
        total_capital = total_capital_after;
        accumulated_losses = Int64.(vault.accumulated_losses + loss_absorbed);
      })

  (** Run multiple scenarios in sequence *)
  let simulate_scenario (vault : vault_state) ~events : (vault_state * string, error) Result.t =
    let rec process_events state events_list log =
      match events_list with
      | [] -> Ok (state, log)
      | event :: rest ->
          match event with
          | `Premium p ->
              (match simulate_premium_distribution state ~premium:p with
              | Ok (dist, new_state) ->
                  let log_entry = Printf.sprintf "Premium %Ld distributed: %d tranches received yields, remaining: %Ld\n"
                    p
                    (List.length dist.distributions)
                    dist.remaining
                  in
                  process_events new_state rest (log ^ log_entry)
              | Error e -> Error e)

          | `Loss l ->
              (match simulate_loss_absorption state ~loss:l with
              | Ok (absorption, new_state) ->
                  let wiped_count = List.length absorption.wiped_tranches in
                  let log_entry = Printf.sprintf "Loss %Ld absorbed: %d tranches absorbed losses, %d wiped, remaining: %Ld\n"
                    l
                    (List.length absorption.absorptions)
                    wiped_count
                    absorption.remaining
                  in
                  process_events new_state rest (log ^ log_entry)
              | Error e -> Error e)
    in
    process_events vault events ""

  (** Generate summary report *)
  let generate_report (vault : vault_state) : string =
    let buf = Buffer.create 1024 in

    Buffer.add_string buf "=== Vault State Report ===\n\n";

    (* Overall metrics *)
    Buffer.add_string buf (Printf.sprintf "Total Capital: %Ld nanoTON\n" vault.total_capital);
    Buffer.add_string buf (Printf.sprintf "Total Coverage Sold: %Ld nanoTON\n" vault.total_coverage_sold);
    Buffer.add_string buf (Printf.sprintf "Accumulated Losses: %Ld nanoTON\n" vault.accumulated_losses);
    Buffer.add_string buf (Printf.sprintf "Vault Utilization: %.2f%%\n" (calculate_vault_utilization vault *. 100.0));
    Buffer.add_string buf (Printf.sprintf "Solvent: %s\n\n" (if is_solvent vault then "Yes" else "No"));

    (* Per-tranche breakdown *)
    Buffer.add_string buf "=== Tranche Breakdown ===\n\n";

    List.iter vault.tranches ~f:(fun t ->
      Buffer.add_string buf (Printf.sprintf "%s:\n" t.tranche_id);
      Buffer.add_string buf (Printf.sprintf "  Capital: %Ld nanoTON\n" t.capital);
      Buffer.add_string buf (Printf.sprintf "  Accumulated Yield: %Ld nanoTON\n" t.accumulated_yield);
      Buffer.add_string buf (Printf.sprintf "  Utilization: %.2f%%\n" (t.utilization *. 100.0));
      Buffer.add_string buf (Printf.sprintf "  Current APY: %.2f%% (min: %.2f%%, max: %.2f%%)\n"
        t.current_apy t.apy_min t.apy_max);
      Buffer.add_string buf "\n";
    );

    Buffer.contents buf

end
