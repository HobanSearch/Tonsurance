(**
 * /bridges command
 * Display bridge health status with risk multipliers
 *)

open Core
open Lwt.Syntax

let command_name = "bridges"

(** Format bridge health for display *)
let format_bridge_status bridge =
  let open Bridge_monitor in

  let emoji = match bridge.health_score with
    | score when score >= 0.9 -> "✅"
    | score when score >= 0.7 -> "✅"
    | score when score >= 0.5 -> "⚠️"
    | score when score >= 0.3 -> "⚠️"
    | _ -> "🚨"
  in

  let status_text = match bridge.health_score with
    | score when score >= 0.9 -> "Excellent"
    | score when score >= 0.7 -> "Good"
    | score when score >= 0.5 -> "Moderate"
    | score when score >= 0.3 -> "Poor"
    | _ -> "Critical"
  in

  let tvl_change =
    (Int.to_float bridge.current_tvl_usd -. Int.to_float bridge.previous_tvl_usd) /.
    Int.to_float bridge.previous_tvl_usd *. 100.0
  in

  let risk_multiplier =
    if bridge.health_score > 0.9 then 1.0
    else if bridge.health_score > 0.7 then 1.1
    else if bridge.health_score > 0.5 then 1.3
    else if bridge.health_score > 0.3 then 1.6
    else 2.0
  in

  let source_name = Types.blockchain_to_string bridge.source_chain in
  let dest_name = Types.blockchain_to_string bridge.dest_chain in

  sprintf
    {|%s **%s → %s**
TVL: $%.1fM (%s%.1f%%)
Health: %.0f%% (%s)
Risk: %.1fx pricing multiplier
%s|}
    emoji
    source_name
    dest_name
    (Int.to_float bridge.current_tvl_usd /. 100_000_000.0)
    (if tvl_change >= 0.0 then "+" else "")
    tvl_change
    (bridge.health_score *. 100.0)
    status_text
    risk_multiplier
    (if bridge.exploit_detected then "🚨 **EXPLOIT DETECTED**" else "")

(** Group bridges by health status *)
let group_by_health bridges =
  let excellent = List.filter bridges ~f:(fun b -> b.Bridge_monitor.health_score >= 0.9) in
  let good = List.filter bridges ~f:(fun b ->
    b.health_score >= 0.7 && b.health_score < 0.9) in
  let moderate = List.filter bridges ~f:(fun b ->
    b.health_score >= 0.5 && b.health_score < 0.7) in
  let poor = List.filter bridges ~f:(fun b ->
    b.health_score >= 0.3 && b.health_score < 0.5) in
  let critical = List.filter bridges ~f:(fun b -> b.health_score < 0.3) in
  (excellent, good, moderate, poor, critical)

let handle ~chat_id ~send_message ~bridge_monitor =
  let open Lwt.Syntax in

  match bridge_monitor with
  | None ->
      send_message chat_id
        "Bridge monitoring service is currently unavailable. Please try again later."

  | Some monitor ->
      (* Get all bridge health states *)
      let bridges = Bridge_monitor.get_all_bridge_states monitor in

      if List.is_empty bridges then (
        send_message chat_id "No bridge data available yet. Please check back shortly."
      ) else (
        (* Group by health *)
        let (excellent, good, moderate, poor, critical) = group_by_health bridges in

        (* Build summary *)
        let summary = sprintf
          {|🌉 **Bridge Health Monitor**

**Network Summary:**
✅ Healthy: %d bridges
⚠️ At Risk: %d bridges
🚨 Critical: %d bridges

Total Bridges Monitored: %d
|}
          (List.length excellent + List.length good)
          (List.length moderate + List.length poor)
          (List.length critical)
          (List.length bridges)
        in

        (* Format all bridges *)
        let bridge_list = bridges
          |> List.map ~f:format_bridge_status
          |> String.concat ~sep:"\n\n"
        in

        (* Add warning if any critical *)
        let warning =
          if not (List.is_empty critical) then
            "\n\n⚠️ **Warning:** Some bridges show critical health. Coverage pricing significantly increased for affected routes."
          else if not (List.is_empty poor) then
            "\n\n⚠️ Note: Some bridges showing elevated risk. Pricing adjusted accordingly."
          else
            ""
        in

        (* Build full message *)
        let full_message = summary ^ "\n" ^ bridge_list ^ warning in

        send_message chat_id full_message
      )
