(**
 * Pricing Integration
 * Fetches live dynamic pricing from Tonsurance pricing engine
 *)

open Core
open Lwt.Syntax
open Types

(** Live quote with dynamic pricing *)
type live_quote = {
  coverage_type: coverage_type;
  amount: float;
  duration: int;
  premium: float;
  base_apr: float;
  risk_multiplier: float;
  vault_utilization: float;
  bridge_health_score: float option;
  timestamp: float;
}
[@@deriving sexp, yojson]

(** Quote validity period (5 minutes) *)
let quote_validity_seconds = 300.0

(** Get current bridge risk multiplier for bridge coverage *)
let get_bridge_risk_multiplier bridge_monitor source_chain dest_chain =
  match source_chain, dest_chain with
  | Some source, Some dest ->
      (* Query bridge monitor for health-based risk multiplier *)
      Bridge_monitor.calculate_cross_chain_risk_multiplier
        ~monitored_chain:source
        ~settlement_chain:dest
        ~states:(Bridge_monitor.get_all_bridge_states bridge_monitor)
  | _ -> 1.0

(** Fetch live premium quote from pricing engine *)
let get_live_quote
    ?(pricing_config=Pricing_engine.default_config)
    ?(collateral_manager=None)
    ?(bridge_monitor=None)
    ~coverage_type
    ~amount
    ~duration
    ~source_chain
    ~dest_chain
    () =
  let* () = Lwt.return_unit in

  (* Get current risk factors *)
  let bridge_risk_multiplier =
    match coverage_type with
    | Bridge ->
        (match bridge_monitor with
         | Some monitor ->
             get_bridge_risk_multiplier monitor source_chain dest_chain
         | None -> 1.2) (* Default moderate risk if monitor unavailable *)
    | _ -> 1.0
  in

  (* Get vault utilization rate *)
  let* vault_utilization =
    match collateral_manager with
    | Some cm ->
        let pool = Collateral_manager.get_pool cm in
        let total_collateral = Unified_pool.get_total_collateral pool in
        let total_committed = Unified_pool.get_total_committed pool in
        Lwt.return (
          if total_collateral > 0.0 then
            total_committed /. total_collateral
          else 0.0
        )
    | None -> Lwt.return 0.5 (* Default moderate utilization *)
  in

  (* Calculate premium using pricing engine *)
  let coverage_amount_cents = Int.of_float (amount *. 100.0) in
  let premium_cents = Pricing_engine.calculate_premium
    ~config:pricing_config
    ~coverage_type
    ~coverage_amount:coverage_amount_cents
    ~duration_days:duration
    ~risk_multiplier:bridge_risk_multiplier
  in

  let premium = Float.of_int premium_cents /. 100.0 in

  (* Calculate implied APR for display *)
  let base_apr =
    if amount > 0.0 && duration > 0 then
      (premium /. amount) /. (Float.of_int duration /. 365.0)
    else 0.0
  in

  (* Get bridge health score if applicable *)
  let* bridge_health_score =
    match coverage_type, bridge_monitor, source_chain, dest_chain with
    | Bridge, Some monitor, Some source, Some dest ->
        let states = Bridge_monitor.get_all_bridge_states monitor in
        let bridge_opt = List.find states ~f:(fun state ->
          state.Bridge_monitor.source_chain = source &&
          state.Bridge_monitor.dest_chain = dest
        ) in
        Lwt.return (Option.map bridge_opt ~f:(fun b -> b.health_score))
    | _ -> Lwt.return None
  in

  Lwt.return {
    coverage_type;
    amount;
    duration;
    premium;
    base_apr;
    risk_multiplier = bridge_risk_multiplier;
    vault_utilization;
    bridge_health_score;
    timestamp = Unix.time ();
  }

(** Format quote for Tonny's chat response *)
let format_quote_for_chat quote =
  let coverage_type_name = function
    | Depeg -> "Stablecoin Depeg Coverage"
    | Smart_contract -> "Smart Contract Exploit Coverage"
    | Oracle -> "Oracle Manipulation Protection"
    | Bridge -> "Cross-Chain Bridge Risk Protection"
  in

  let risk_factor_text =
    let parts = [] in
    let parts =
      if quote.risk_multiplier > 1.0 then
        sprintf "🌉 Bridge Risk: %.1fx multiplier\n" quote.risk_multiplier :: parts
      else parts
    in
    let parts =
      if quote.vault_utilization > 0.8 then
        sprintf "⚠️ High Demand: +%.0f%% pricing adjustment\n"
          ((quote.vault_utilization -. 0.8) *. 500.0) :: parts
      else parts
    in
    let parts =
      match quote.bridge_health_score with
      | Some score ->
          sprintf "📊 Bridge Health: %.0f%%\n" (score *. 100.0) :: parts
      | None -> parts
    in
    String.concat ~sep:"" (List.rev parts)
  in

  sprintf
    {|💰 Live Coverage Quote

**%s**

Amount: $%s
Duration: %d days
**Premium: $%.2f**

Current Market Rates:
📊 Base Rate: %.2f%% APR
%s
✅ Quote valid for 5 minutes

Ready to proceed? Use /buy to purchase!
|}
    (coverage_type_name quote.coverage_type)
    (Float.to_string_hum ~decimals:2 quote.amount)
    quote.duration
    quote.premium
    (quote.base_apr *. 100.0)
    (if String.is_empty risk_factor_text then
       "✅ Standard market conditions\n"
     else risk_factor_text)

(** Check if quote is still valid *)
let is_quote_valid quote =
  let age = Unix.time () -. quote.timestamp in
  age <= quote_validity_seconds

(** Get quote age warning if needed *)
let get_quote_freshness_warning quote =
  let age = Unix.time () -. quote.timestamp in
  if age > quote_validity_seconds then
    Some "⚠️ Quote expired - pricing may have changed. Request a new quote."
  else if age > 60.0 then
    Some "Note: Rates may have updated. Consider refreshing quote."
  else
    None
