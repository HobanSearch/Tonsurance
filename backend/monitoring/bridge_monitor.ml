(**
 * Bridge Security Monitor
 * Monitors cross-chain bridges for security issues and exploits
 *)

open Lwt.Syntax
open Types

(** Bridge monitoring state *)
type bridge_health = {
  bridge_id: string;
  source_chain: blockchain;
  dest_chain: blockchain;
  current_tvl_usd: usd_cents;
  previous_tvl_usd: usd_cents;
  health_score: float; (* 0.0 - 1.0 *)
  last_updated: float;
  exploit_detected: bool;
  alerts: bridge_alert list;
}

and bridge_alert = {
  alert_id: string;
  severity: alert_severity;
  alert_type: bridge_alert_type;
  message: string;
  timestamp: float;
  resolved: bool;
}

and alert_severity = Critical | High | Medium | Low

and bridge_alert_type =
  | TVLDrop of { percentage: float; amount: usd_cents }
  | SuspiciousActivity of { transaction_hash: string; amount: usd_cents }
  | OracleDiscrepancy of { expected: float; actual: float }
  | NetworkCongestion of { gas_price_multiplier: float }
  | ContractPause of { paused_at: float }

(** Bridge registry with known bridges *)
let known_bridges = [
  ("wormhole_eth_ton", Ethereum, TON);
  ("wormhole_arb_ton", Arbitrum, TON);
  ("wormhole_base_ton", Base, TON);
  ("wormhole_poly_ton", Polygon, TON);
  ("wormhole_sol_ton", Solana, TON);
  ("multichain_eth_ton", Ethereum, TON);
  ("orbit_eth_ton", Ethereum, TON);
  ("celer_eth_ton", Ethereum, TON);
  ("lightning_btc_ton", Lightning, TON);
]

(** Calculate health score based on multiple factors *)
let calculate_health_score
    ~tvl_change_pct
    ~oracle_consensus
    ~transaction_success_rate
    ~time_since_last_update : float =

  (* TVL change factor (0.0 - 1.0) *)
  let tvl_factor =
    if tvl_change_pct > -5.0 then 1.0
    else if tvl_change_pct > -10.0 then 0.9
    else if tvl_change_pct > -20.0 then 0.7
    else if tvl_change_pct > -40.0 then 0.4
    else 0.1
  in

  (* Oracle consensus factor (0.0 - 1.0) *)
  let oracle_factor = oracle_consensus in

  (* Transaction success rate factor (0.0 - 1.0) *)
  let tx_factor = transaction_success_rate in

  (* Freshness factor - penalize stale data *)
  let freshness_factor =
    if time_since_last_update < 300.0 then 1.0      (* < 5 min *)
    else if time_since_last_update < 600.0 then 0.9  (* < 10 min *)
    else if time_since_last_update < 1800.0 then 0.7 (* < 30 min *)
    else 0.3
  in

  (* Weighted average *)
  let score =
    (tvl_factor *. 0.40) +.
    (oracle_factor *. 0.30) +.
    (tx_factor *. 0.20) +.
    (freshness_factor *. 0.10)
  in

  Float.max 0.0 (Float.min 1.0 score)

(** Detect TVL drop exploit *)
let detect_tvl_drop ~previous_tvl ~current_tvl ~time_elapsed : bridge_alert option =
  let previous_usd = Int64.to_float previous_tvl /. 100.0 in
  let current_usd = Int64.to_float current_tvl /. 100.0 in

  if previous_usd = 0.0 then None
  else
    let change_pct = ((current_usd -. previous_usd) /. previous_usd) *. 100.0 in
    let drop_amount = Int64.sub previous_tvl current_tvl in

    (* Detect rapid TVL drops *)
    if change_pct < -20.0 && time_elapsed < 3600.0 then
      (* >20% drop in <1 hour = critical *)
      Some {
        alert_id = "tvl_drop_" ^ string_of_float (Unix.time ());
        severity = Critical;
        alert_type = TVLDrop { percentage = change_pct; amount = drop_amount };
        message = Printf.sprintf "CRITICAL: Bridge TVL dropped %.1f%% ($%s) in %.0f minutes"
          (Float.abs change_pct)
          (Int64.to_string (Int64.div drop_amount 100L))
          (time_elapsed /. 60.0);
        timestamp = Unix.time ();
        resolved = false;
      }
    else if change_pct < -10.0 && time_elapsed < 1800.0 then
      (* >10% drop in <30 min = high *)
      Some {
        alert_id = "tvl_drop_" ^ string_of_float (Unix.time ());
        severity = High;
        alert_type = TVLDrop { percentage = change_pct; amount = drop_amount };
        message = Printf.sprintf "HIGH: Bridge TVL dropped %.1f%% ($%s) in %.0f minutes"
          (Float.abs change_pct)
          (Int64.to_string (Int64.div drop_amount 100L))
          (time_elapsed /. 60.0);
        timestamp = Unix.time ();
        resolved = false;
      }
    else if change_pct < -5.0 then
      (* >5% drop = medium *)
      Some {
        alert_id = "tvl_drop_" ^ string_of_float (Unix.time ());
        severity = Medium;
        alert_type = TVLDrop { percentage = change_pct; amount = drop_amount };
        message = Printf.sprintf "Bridge TVL dropped %.1f%% ($%s)"
          (Float.abs change_pct)
          (Int64.to_string (Int64.div drop_amount 100L));
        timestamp = Unix.time ();
        resolved = false;
      }
    else None

(** Check oracle consensus for bridge state *)
let check_oracle_consensus
    ~(bridge_id: string)
    ~(oracle_sources: (string * float) list) : float * bridge_alert option =

  if List.length oracle_sources < 2 then
    (0.5, Some {
      alert_id = "oracle_consensus_" ^ string_of_float (Unix.time ());
      severity = Medium;
      alert_type = OracleDiscrepancy { expected = 1.0; actual = 0.5 };
      message = "Insufficient oracle sources for bridge monitoring";
      timestamp = Unix.time ();
      resolved = false;
    })
  else
    let values = List.map snd oracle_sources in
    let mean = List.fold_left (+.) 0.0 values /. float_of_int (List.length values) in

    (* Calculate standard deviation *)
    let variance =
      List.fold_left (fun acc v -> acc +. ((v -. mean) ** 2.0)) 0.0 values
      /. float_of_int (List.length values)
    in
    let std_dev = sqrt variance in

    (* Consensus score based on standard deviation *)
    let consensus =
      if std_dev < 0.02 then 1.0      (* <2% deviation = perfect *)
      else if std_dev < 0.05 then 0.9  (* <5% deviation = good *)
      else if std_dev < 0.10 then 0.7  (* <10% deviation = ok *)
      else 0.3                         (* >10% deviation = poor *)
    in

    let alert =
      if std_dev > 0.10 then
        Some {
          alert_id = "oracle_consensus_" ^ string_of_float (Unix.time ());
          severity = High;
          alert_type = OracleDiscrepancy { expected = mean; actual = std_dev };
          message = Printf.sprintf "High oracle discrepancy for %s: %.1f%% std dev"
            bridge_id (std_dev *. 100.0);
          timestamp = Unix.time ();
          resolved = false;
        }
      else None
    in

    (consensus, alert)

(** Fetch bridge TVL from multiple oracles *)
let fetch_bridge_tvl
    ~(_bridge_id: string)
    ~(_source_chain: blockchain)
    ~(_dest_chain: blockchain) : (usd_cents * (string * float) list) Lwt.t =

  (* Mock oracle responses - in production, fetch from actual oracles *)
  let* oracle_responses = Lwt.return [
    ("chainlink", 50_000_000.0);  (* $500k *)
    ("band", 49_800_000.0);       (* $498k *)
    ("pyth", 50_200_000.0);       (* $502k *)
  ] in

  (* Calculate consensus TVL *)
  let values = List.map snd oracle_responses in
  let mean_tvl = List.fold_left (+.) 0.0 values /. float_of_int (List.length values) in
  let tvl_cents = Int64.of_float mean_tvl in

  Lwt.return (tvl_cents, oracle_responses)

(** Monitor a single bridge *)
let monitor_bridge
    ~(_bridge_id: string)
    ~(_source_chain: blockchain)
    ~(_dest_chain: blockchain)
    ~(previous_health: bridge_health option) : bridge_health Lwt.t =

  let* (current_tvl, oracle_responses) =
    fetch_bridge_tvl ~_bridge_id ~_source_chain:_source_chain ~_dest_chain:_dest_chain
  in

  let previous_tvl =
    match previous_health with
    | Some h -> h.current_tvl_usd
    | None -> current_tvl
  in

  let time_elapsed =
    match previous_health with
    | Some h -> Unix.time () -. h.last_updated
    | None -> 0.0
  in

  (* Check for TVL drops *)
  let tvl_alert = detect_tvl_drop ~previous_tvl ~current_tvl ~time_elapsed in

  (* Check oracle consensus *)
  let (oracle_consensus, oracle_alert) =
    check_oracle_consensus ~bridge_id:_bridge_id ~oracle_sources:oracle_responses
  in

  (* Mock transaction success rate - in production, query actual data *)
  let tx_success_rate = 0.995 in

  (* Calculate TVL change percentage *)
  let tvl_change_pct =
    if Int64.compare previous_tvl 0L = 0 then 0.0
    else
      let prev_f = Int64.to_float previous_tvl in
      let curr_f = Int64.to_float current_tvl in
      ((curr_f -. prev_f) /. prev_f) *. 100.0
  in

  (* Calculate health score *)
  let health_score = calculate_health_score
    ~tvl_change_pct
    ~oracle_consensus
    ~transaction_success_rate:tx_success_rate
    ~time_since_last_update:time_elapsed
  in

  (* Collect alerts *)
  let alerts =
    List.filter_map (fun x -> x) [tvl_alert; oracle_alert]
  in

  (* Detect exploit if health score is critical and TVL dropped *)
  let exploit_detected =
    health_score < 0.3 && tvl_change_pct < -20.0
  in

  Lwt.return {
    bridge_id = _bridge_id;
    source_chain = _source_chain;
    dest_chain = _dest_chain;
    current_tvl_usd = current_tvl;
    previous_tvl_usd = previous_tvl;
    health_score;
    last_updated = Unix.time ();
    exploit_detected;
    alerts;
  }

(** Monitor all bridges *)
let monitor_all_bridges
    ~(previous_states: (string * bridge_health) list) : bridge_health list Lwt.t =

  let monitor_bridge_with_state (bridge_id, source, dest) =
    let previous = List.assoc_opt bridge_id previous_states in
    monitor_bridge ~_bridge_id:bridge_id ~_source_chain:source ~_dest_chain:dest ~previous_health:previous
  in

  Lwt_list.map_p monitor_bridge_with_state known_bridges

(** Get bridge health status *)
let get_bridge_health
    ~(bridge_id: string)
    ~(states: bridge_health list) : bridge_health option =
  List.find_opt (fun h -> h.bridge_id = bridge_id) states

(** Get all critical alerts *)
let get_critical_alerts ~(states: bridge_health list) : bridge_alert list =
  states
  |> List.map (fun h -> h.alerts)
  |> List.flatten
  |> List.filter (fun a -> not a.resolved && a.severity = Critical)

(** Check if policy is affected by bridge exploit *)
let is_policy_affected_by_bridge
    ~(policy: chain_specific_policy)
    ~(states: bridge_health list) : bool =

  (* Find bridges between monitored and settlement chains *)
  let relevant_bridges =
    List.filter (fun h ->
      h.source_chain = policy.monitored_chain &&
      h.dest_chain = policy.settlement_chain
    ) states
  in

  (* Policy is affected if any relevant bridge has exploit *)
  List.exists (fun h -> h.exploit_detected) relevant_bridges

(** Calculate cross-chain risk premium multiplier *)
let calculate_cross_chain_risk_multiplier
    ~(monitored_chain: blockchain)
    ~(settlement_chain: blockchain)
    ~(states: bridge_health list) : float =

  (* Find relevant bridge *)
  let bridge =
    List.find_opt (fun h ->
      h.source_chain = monitored_chain &&
      h.dest_chain = settlement_chain
    ) states
  in

  match bridge with
  | None -> 1.5 (* No bridge data = higher risk *)
  | Some h ->
      (* Risk multiplier inversely proportional to health *)
      if h.health_score > 0.9 then 1.0      (* Excellent health *)
      else if h.health_score > 0.7 then 1.1 (* Good health *)
      else if h.health_score > 0.5 then 1.3 (* Moderate health *)
      else if h.health_score > 0.3 then 1.6 (* Poor health *)
      else 2.0                              (* Critical health *)

(** Format bridge health for display *)
let format_bridge_health (h: bridge_health) : string =
  let status =
    if h.exploit_detected then "⛔ EXPLOIT DETECTED"
    else if h.health_score > 0.9 then "✅ HEALTHY"
    else if h.health_score > 0.7 then "⚠️  CAUTION"
    else if h.health_score > 0.5 then "⚠️  WARNING"
    else "🚨 CRITICAL"
  in

  let tvl_change =
    if Int64.compare h.previous_tvl_usd 0L = 0 then 0.0
    else
      let prev = Int64.to_float h.previous_tvl_usd in
      let curr = Int64.to_float h.current_tvl_usd in
      ((curr -. prev) /. prev) *. 100.0
  in

  Printf.sprintf
    "Bridge: %s\n\
     Status: %s\n\
     Health: %.1f%%\n\
     TVL: $%s (%+.1f%%)\n\
     Alerts: %d\n\
     Last Updated: %.0fs ago"
    h.bridge_id
    status
    (h.health_score *. 100.0)
    (Int64.to_string (Int64.div h.current_tvl_usd 100L))
    tvl_change
    (List.length h.alerts)
    (Unix.time () -. h.last_updated)

(** Bridge monitoring daemon *)
let start_monitoring_daemon
    ~(update_interval_seconds: float)
    ~(on_alert: bridge_alert -> unit Lwt.t) : unit Lwt.t =

  let rec monitoring_loop states =
    let* () = Lwt_unix.sleep update_interval_seconds in

    (* Monitor all bridges *)
    let* new_states = monitor_all_bridges ~previous_states:states in

    (* Process critical alerts *)
    let critical_alerts = get_critical_alerts ~states:new_states in
    let* () = Lwt_list.iter_p on_alert critical_alerts in

    (* Log summary *)
    let () =
      Printf.printf "\n[Bridge Monitor] Cycle complete at %s\n"
        (string_of_float (Unix.time ()));
      List.iter (fun h ->
        Printf.printf "%s\n\n" (format_bridge_health h)
      ) new_states;
      flush stdout
    in

    (* Continue monitoring *)
    let state_map = List.map (fun h -> (h.bridge_id, h)) new_states in
    monitoring_loop state_map
  in

  (* Start with empty state *)
  monitoring_loop []

(** Convenience function to start monitoring with default settings *)
let start_default_monitoring () : unit Lwt.t =
  start_monitoring_daemon
    ~update_interval_seconds:300.0 (* 5 minutes *)
    ~on_alert:(fun alert ->
      Lwt_io.printf "🚨 BRIDGE ALERT: %s\n" alert.message
    )
