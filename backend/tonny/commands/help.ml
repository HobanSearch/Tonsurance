(**
 * /help command
 * Show all available commands
 *)

open Core

let command_name = "help"

let help_message = {|🤖 **Tonny Command Reference**

**Coverage Commands:**
💰 `/quote [amount] [days] [type]` - Get live quote
   Example: `/quote 10000 30 bridge`

🛡️ `/buy` - Purchase coverage contract
   (Get a quote first!)

📋 `/policies` - View your active coverage

⚡ `/claim [policy_id]` - File parametric claim

**Information:**
🌉 `/bridges` - Check bridge health status

💬 `/tonny [question]` - Chat with me!
   Example: `/tonny How does depeg coverage work?`

❓ `/help` - Show this message

**Coverage Types:**
• **depeg** - Stablecoin depeg protection
• **bridge** - Cross-chain bridge risk
• **contract** - Smart contract exploits
• **oracle** - Oracle manipulation

**Quick Tips:**
• Pricing is **dynamic** based on current market risk
• All payouts are **automatic** (5-10 min)
• Coverage contracts are **NFTs** on TON
• Minimum coverage: **$1,000**

Need help? Just ask `/tonny` any question! 🤖|}

let handle ~chat_id ~send_message =
  send_message chat_id help_message
