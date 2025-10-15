(**
 * /policies command
 * List user's active coverage contracts
 *)

open Core
open Lwt.Syntax

let command_name = "policies"

(** Format coverage type *)
let format_coverage_type = function
  | Types.Depeg -> "💵 Stablecoin Depeg"
  | Types.Smart_contract -> "⚠️ Smart Contract"
  | Types.Oracle -> "🔮 Oracle Failure"
  | Types.Bridge -> "🌉 Bridge Risk"

(** Format policy status *)
let format_status = function
  | "active" -> "✅ Active"
  | "expired" -> "⏰ Expired"
  | "claimed" -> "💰 Claimed"
  | _ -> "❓ Unknown"

(** Format single policy *)
let format_policy policy =
  sprintf
    {|**Policy #%s**
Coverage: %s
Amount: $%.2f
Duration: %d days
Status: %s
Expires: %s
Premium Paid: $%.2f
|}
    policy.id
    (format_coverage_type policy.coverage_type)
    policy.amount
    policy.duration_days
    (format_status policy.status)
    policy.expiry_date
    policy.premium

(** Calculate days until expiry *)
let days_until_expiry expiry_timestamp =
  let now = Unix.time () in
  let diff = expiry_timestamp -. now in
  Int.of_float (diff /. 86400.0)

let handle ~user_id ~chat_id ~send_message ~get_user_policies =
  let open Lwt.Syntax in

  (* Fetch user's policies from database/blockchain *)
  let* policies_result = get_user_policies user_id in

  match policies_result with
  | Error err ->
      send_message chat_id
        (sprintf "❌ Error fetching coverage contracts: %s" err)

  | Ok [] ->
      send_message chat_id
        {|📋 **No Coverage Contracts Found**

You don't have any active coverage yet!

**Get protected:**
1. Get a quote: `/quote 10000 30 depeg`
2. Purchase: `/buy`

Need help? Ask `/tonny` anything! 🤖|}

  | Ok policies ->
      (* Separate active and expired *)
      let active = List.filter policies ~f:(fun p -> String.equal p.status "active") in
      let expired = List.filter policies ~f:(fun p -> String.equal p.status "expired") in
      let claimed = List.filter policies ~f:(fun p -> String.equal p.status "claimed") in

      (* Calculate total coverage *)
      let total_coverage = List.fold active ~init:0.0 ~f:(fun acc p -> acc +. p.amount) in

      (* Build header *)
      let header = sprintf
        {|📋 **Your Coverage Contracts**

**Summary:**
Active Contracts: %d
Total Coverage: $%.2f
Expired: %d
Claimed: %d

---
|}
        (List.length active)
        total_coverage
        (List.length expired)
        (List.length claimed)
      in

      (* Format active policies *)
      let active_section =
        if List.is_empty active then ""
        else
          "**✅ Active Coverage:**\n\n" ^
          (List.map active ~f:format_policy |> String.concat ~sep:"\n---\n")
      in

      (* Add expiry warnings *)
      let warnings =
        List.filter_map active ~f:(fun policy ->
          let days_left = days_until_expiry policy.expiry_timestamp in
          if days_left <= 7 then
            Some (sprintf "⚠️ Policy #%s expires in %d days!" policy.id days_left)
          else None
        )
      in

      let warnings_section =
        if List.is_empty warnings then ""
        else "\n\n**⚠️ Expiry Warnings:**\n" ^ String.concat ~sep:"\n" warnings
      in

      (* Format expired/claimed (brief) *)
      let history_section =
        if List.is_empty expired && List.is_empty claimed then ""
        else
          let expired_str = if List.is_empty expired then ""
            else sprintf "\n⏰ Expired: %d contracts" (List.length expired)
          in
          let claimed_str = if List.is_empty claimed then ""
            else sprintf "\n💰 Claimed: %d contracts" (List.length claimed)
          in
          "\n\n**History:**" ^ expired_str ^ claimed_str
      in

      (* Build full message *)
      let full_message =
        header ^ active_section ^ warnings_section ^ history_section ^
        "\n\n💡 Renew coverage anytime with `/quote`!"
      in

      send_message chat_id full_message
