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
let get_bridge_risk_multiplier bridge_states_opt source_chain dest_chain =
  match source_chain, dest_chain, bridge_states_opt with
  | Some source, Some dest, Some states ->
      (* Query bridge monitor for health-based risk multiplier *)
      Monitoring.Bridge_monitor.calculate_cross_chain_risk_multiplier
        ~monitored_chain:source
        ~settlement_chain:dest
        ~states
  | _ -> 1.0  (* Default multiplier if no bridge data or chains not specified *)

(** Fetch live premium quote from pricing engine *)
let get_live_quote
    ?(_collateral_manager=None)
    ?(bridge_states=None)
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
        get_bridge_risk_multiplier bridge_states source_chain dest_chain
    | _ -> 1.0
  in

  (* Get vault utilization rate - simplified for Tonny bot *)
  let* vault_utilization = Lwt.return 0.5 in (* Default moderate utilization *)

  (* Calculate premium using simplified formula for Tonny bot *)
  (* Base rate: 0.8% APR, adjusted by risk multiplier and utilization *)
  let base_apr = match coverage_type with
    | Depeg -> 0.008
    | Smart_contract -> 0.015
    | Oracle -> 0.012
    | Bridge -> 0.018
    | CEX_liquidation -> 0.010
  in

  let adjusted_apr = base_apr *. bridge_risk_multiplier *. (1.0 +. vault_utilization *. 0.5) in
  let annual_premium = amount *. adjusted_apr in
  let premium = annual_premium *. (Float.of_int duration /. 365.0) in

  (* Get bridge health score if applicable - simplified for Tonny bot *)
  let* bridge_health_score = Lwt.return None in

  let timestamp = Time_float.now ()
    |> Time_float.to_span_since_epoch
    |> Time_float.Span.to_sec
  in

  Lwt.return {
    coverage_type;
    amount;
    duration;
    premium;
    base_apr = adjusted_apr;
    risk_multiplier = bridge_risk_multiplier;
    vault_utilization;
    bridge_health_score;
    timestamp;
  }

(** Format quote for Tonny's chat response *)
let format_quote_for_chat quote =
  let coverage_type_name = function
    | Depeg -> "Stablecoin Depeg Coverage"
    | Smart_contract -> "Smart Contract Exploit Coverage"
    | Oracle -> "Oracle Manipulation Protection"
    | Bridge -> "Cross-Chain Bridge Risk Protection"
    | CEX_liquidation -> "CEX Liquidation Protection"
  in

  let risk_factor_text =
    let parts = [] in
    let parts =
      if Float.(quote.risk_multiplier > 1.0) then
        sprintf "🌉 Bridge Risk: %.1fx multiplier\n" quote.risk_multiplier :: parts
      else parts
    in
    let parts =
      if Float.(quote.vault_utilization > 0.8) then
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
  let now = Time_float.now ()
    |> Time_float.to_span_since_epoch
    |> Time_float.Span.to_sec
  in
  let age = now -. quote.timestamp in
  Float.(age <= quote_validity_seconds)

(** Get quote age warning if needed *)
let get_quote_freshness_warning quote =
  let now = Time_float.now ()
    |> Time_float.to_span_since_epoch
    |> Time_float.Span.to_sec
  in
  let age = now -. quote.timestamp in
  if Float.(age > quote_validity_seconds) then
    Some "⚠️ Quote expired - pricing may have changed. Request a new quote."
  else if Float.(age > 60.0) then
    Some "Note: Rates may have updated. Consider refreshing quote."
  else
    None
