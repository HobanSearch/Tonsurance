(**
 * /claim command
 * View claim status (claims are automatic, but users can check)
 *)

open Core
open Lwt.Syntax

let command_name = "claim"

(** Parse policy ID from command *)
let parse_policy_id text =
  match String.split ~on:' ' text with
  | [_cmd; policy_id] -> Some policy_id
  | _ -> None

let handle ~user_id ~chat_id ~message_text ~send_message ~get_policy_claim_status =
  let open Lwt.Syntax in

  match parse_policy_id message_text with
  | None ->
      send_message chat_id
        {|💡 **Claim Status Format:**

`/claim [policy_id]`

Example: `/claim POL-12345`

**Note:** Claims are **automatic**! ⚡

Our parametric system processes claims automatically when trigger conditions are met:
• No paperwork needed
• No manual filing
• Payout in 5-10 minutes

Use this command to check if a claim has been processed for your policy.

View all your coverage: `/policies`|}

  | Some policy_id ->
      (* Fetch claim status *)
      let* claim_result = get_policy_claim_status user_id policy_id in

      match claim_result with
      | Error "not_found" ->
          send_message chat_id
            (sprintf "❌ Policy #%s not found or doesn't belong to you." policy_id)

      | Error err ->
          send_message chat_id
            (sprintf "❌ Error checking claim status: %s" err)

      | Ok claim_info when claim_info.has_claim ->
          (* Claim exists *)
          let status_emoji = match claim_info.claim_status with
            | "pending" -> "⏳"
            | "processing" -> "🔄"
            | "approved" -> "✅"
            | "paid" -> "💰"
            | _ -> "❓"
          in

          let message = sprintf
            {|%s **Claim Status**

**Policy:** #%s
**Coverage Type:** %s
**Claim ID:** %s

**Status:** %s
**Trigger Event:** %s
**Detected:** %s
%s

%s
|}
            status_emoji
            policy_id
            claim_info.coverage_type_name
            claim_info.claim_id
            claim_info.claim_status
            claim_info.trigger_description
            claim_info.detected_at
            (match claim_info.payout_amount with
             | Some amount -> sprintf "**Payout Amount:** $%.2f\n" amount
             | None -> "")
            (match claim_info.claim_status with
             | "pending" -> "⏳ Awaiting oracle consensus..."
             | "processing" -> "🔄 Processing payout transaction..."
             | "approved" -> "✅ Approved! Payout transaction initiated."
             | "paid" -> sprintf "💰 Paid! Check your wallet.\nTx: %s"
                 (Option.value claim_info.tx_hash ~default:"pending")
             | _ -> "")
          in

          send_message chat_id message

      | Ok _no_claim ->
          (* No claim yet *)
          send_message chat_id
            (sprintf
               {|✅ **Policy #%s**

**Status:** Active - No claims processed

This policy has **no active claims**.

**How parametric claims work:**
1. Oracle network monitors trigger conditions
2. When event detected, claim auto-processes
3. Smart contract verifies via consensus
4. Payout executes automatically (5-10 min)
5. You'll get notified here!

**Current triggers:** No events detected

Your coverage is protecting you! 🛡️|}
               policy_id)
