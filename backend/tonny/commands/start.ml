(**
 * /start command
 * Welcome message and bot introduction
 *)

open Core

let command_name = "start"

let welcome_message = {|👋 Hey there! I'm Tonny, your Tonsurance assistant!

I help with **parametric risk coverage** on TON blockchain 🤖

What I can do:
💰 Get live coverage quotes
🛡️ Purchase risk protection
🌉 Check bridge health
📋 Manage your coverage contracts
⚡ Process parametric claims

**Quick Start:**
• `/quote 10000 30 depeg` - Get a quote
• `/bridges` - Check bridge security
• `/tonny How does this work?` - Ask me anything!

**Popular Coverage Types:**
💵 Stablecoin Depeg Protection
🌉 Bridge Risk Coverage
⚠️ Smart Contract Exploits
🔮 Oracle Manipulation

Ready to protect your assets? Let's go! 💎|}

let handle ~user_id:_ ~chat_id ~send_message =
  let open Lwt.Syntax in

  (* Clear any existing conversation for fresh start *)
  (* TODO: Conversation_state module disabled until Ollama_client is implemented *)
  let* () = Lwt.return_unit in

  (* Send welcome message *)
  let* () = send_message chat_id welcome_message in

  Lwt.return_unit
