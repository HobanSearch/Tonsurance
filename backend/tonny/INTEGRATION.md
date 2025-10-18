# Tonny Integration Guide 🤖

## Overview

Tonny is now **fully integrated** with the Tonsurance backend and Telegram Bot API. This document explains how all components work together.

## Architecture

```
┌─────────────────┐
│  Telegram API   │
│   (Webhook)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  tonny_bot.ml   │  ← Main entry point
│   (OCaml/Lwt)   │
└────────┬────────┘
         │
         ├──────────────────────────┐
         │                          │
         ▼                          ▼
┌──────────────────┐      ┌──────────────────┐
│  Command Router  │      │  Ollama Client   │
│  (/quote, etc.)  │      │  (AI Responses)  │
└────────┬─────────┘      └──────────────────┘
         │
         ├──────────┬──────────┬──────────┐
         ▼          ▼          ▼          ▼
    ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
    │Pricing │ │Collatr.│ │Bridge  │ │Quote   │
    │Engine  │ │Manager │ │Monitor │ │Cache   │
    └────────┘ └────────┘ └────────┘ └────────┘
```

## Component Integration

### 1. Telegram Webhook (`telegram_webhook.ml`)

**Receives:** Telegram updates via POST /webhook
**Processes:** Parses JSON, extracts message
**Routes to:** `tonny_bot.handle_message()`

```ocaml
(* Webhook receives Telegram update *)
POST /webhook/:token
  ↓
TelegramAPI.parse_update(body)
  ↓
Tonny_bot.handle_message(~state ~user_id ~chat_id ~message_text)
```

### 2. Main Bot (`tonny_bot.ml`)

**Initializes:**
- Collateral Manager (unified 6-tier pool)
- Bridge Monitor (Chainlink + custom oracles)
- Conversation State (30-min session tracking)
- Quote Cache (5-min expiry)

**Routes:**
- Commands (`/start`, `/quote`, etc.) → Command handlers
- Natural language → Tonny AI (`/tonny` handler)

### 3. Command Handlers

All located in `commands/` directory:

#### `/start` - Welcome & Onboarding
- Introduces Tonny
- Lists available commands
- Explains parametric coverage

#### `/quote [amount] [days] [type]` - Live Pricing
- **Backend Integration Points:**
  - `Pricing_engine.calculate_premium()` - Base premium calculation
  - `Collateral_manager.get_utilization()` - Current pool usage
  - `Bridge_monitor.get_risk_multiplier()` - Bridge-specific risk
- **Output:** Real-time dynamic quote with 5-min validity
- **Example:** `/quote 10000 30 bridge` → "$127.50 premium (Bridge risk: 1.3x)"

#### `/buy` - Purchase Flow
- Retrieves cached quote
- Generates TON Connect link
- Tracks transaction confirmation

#### `/policies` - User Dashboard
- Lists active coverage contracts
- Shows expiration dates
- Displays coverage amounts

#### `/claim [policy_id]` - Claim Status
- Checks parametric trigger status
- Shows payout progress
- Estimated completion time

#### `/bridges` - Health Monitor
- **Backend Integration:** `Bridge_monitor.get_all_statuses()`
- Shows 9 major bridges
- Real-time health scores
- Risk multipliers

#### `/tonny [message]` - AI Chat
- **Backend Integration:** `Ollama_client.ask_tonny_smart()`
- Compliance filtering (no "insurance" terminology)
- Conversation history (30-min sessions)
- Smart pricing detection (routes to `/quote` if needed)

### 4. Backend Service Integration

#### Pricing Engine
```ocaml
Pricing_integration.get_live_quote
  ~pricing_config
  ~collateral_manager
  ~bridge_monitor
  ~coverage_type
  ~amount
  ~duration
```

**Factors:**
- Base premium (0.5% APR)
- Utilization multiplier (↑ usage = ↑ cost)
- Bridge risk multiplier (from oracles)
- Duration discounts (longer = cheaper)

#### Collateral Manager
```ocaml
Collateral_manager.create_unified_pool()
  ↓
6-tier vault system:
- BTC (25%, 4% APY)
- SNR (20%, 6.5-10% APY)
- MEZZ (18%, 9-15% APY)
- JNR (15%, 12.5-16% APY)
- JNR+ (12%, 16-22% APY)
- EQT (10%, 15-25% APY)
```

#### Bridge Monitor
```ocaml
Bridge_monitor.create(config)
  ↓
Oracle Sources:
- Chainlink (via HTTP API)
- Custom TON bridge health API
```

**Updates:** Every 5 minutes
**Metrics:** Uptime, transaction success rate, TVL

### 5. Ollama AI Integration

**Model:** Fine-tuned Mistral-7B (tonny)
**Endpoint:** `http://localhost:11434/api/chat`

**Request Flow:**
```ocaml
User: "How does depeg coverage work?"
  ↓
Ollama_client.ask_tonny_smart()
  ↓
- Detects NOT a pricing query
- Sends to Ollama with system prompt
- Applies compliance filter
  ↓
Response: "Depeg parametric coverage protects against..."
```

**Pricing Query Detection:**
```ocaml
is_pricing_query("how much does it cost?")
  ↓ YES
Enhanced prompt: "User is asking about pricing.
Tell them to use /quote command for live rates.
NEVER quote fixed APR."
```

### 6. Conversation State Management

**Storage:** In-memory hash table
**Key:** `user_id : int64`
**Value:** `message list` (user/assistant pairs)
**Expiry:** 30 minutes of inactivity

```ocaml
Conversation_state.update_conversation(user_id, user_msg, tonny_response)
  ↓
Stores: [
  { role: "user", content: "..." },
  { role: "assistant", content: "..." }
]
```

**Cleanup:** Background task runs every 5 minutes

### 7. Quote Caching

**Storage:** In-memory with TTL
**Key:** `user_id`
**TTL:** 5 minutes

```ocaml
Quote_cache.store(user_id, quote)
  ↓
{ amount, duration, premium, coverage_type, expires_at }
  ↓
/buy command retrieves: Quote_cache.get(user_id)
```

## Configuration

### Environment Variables

```bash
# Required
TELEGRAM_BOT_TOKEN=7123456789:AAH...

# Webhook (production)
WEBHOOK_URL=https://tonsurance.com
WEBHOOK_PORT=8080
WEBHOOK_PATH=/webhook

# Ollama AI
TONNY_API_URL=http://localhost:11434
TONNY_MODEL=tonny

# Optional
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379/0
```

### Webhook Setup

1. **Set environment variables:**
```bash
export TELEGRAM_BOT_TOKEN="your_token"
export WEBHOOK_URL="https://your-domain.com"
```

2. **Start bot:**
```bash
cd backend
dune exec tonny/tonny_bot.exe
```

3. **Bot automatically sets webhook with Telegram:**
```
Setting Telegram webhook to: https://your-domain.com/webhook
✅ Tonny is ready!
Starting webhook server on port 8080...
```

4. **Telegram sends updates to your webhook:**
```
POST https://your-domain.com/webhook
{
  "update_id": 123,
  "message": {
    "from": { "id": 456 },
    "chat": { "id": 456 },
    "text": "/quote 10000 30 bridge"
  }
}
```

## Testing

### Local Testing

```bash
# 1. Start Ollama server
ollama serve

# 2. Load Tonny model
ollama create tonny -f Modelfile

# 3. Set test token
export TELEGRAM_BOT_TOKEN="test_token"

# 4. Run bot (without webhook)
dune exec tonny/tonny_bot.exe
```

### Test Commands

```bash
# Send test message via Telegram Bot API
curl -X POST "https://api.telegram.org/bot$TOKEN/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": YOUR_CHAT_ID,
    "text": "/quote 10000 30 bridge"
  }'
```

## Deployment

### Production Checklist

- [ ] Ollama model deployed and running
- [ ] WEBHOOK_URL points to public HTTPS endpoint
- [ ] Telegram bot token configured
- [ ] SSL certificate valid
- [ ] Nginx reverse proxy configured
- [ ] systemd service or PM2 process manager
- [ ] Monitoring alerts configured

### Systemd Service

```ini
[Unit]
Description=Tonny Telegram Bot
After=network.target

[Service]
Type=simple
User=tonsurance
WorkingDirectory=/opt/tonsurance/backend
Environment="TELEGRAM_BOT_TOKEN=..."
Environment="WEBHOOK_URL=https://tonsurance.com"
ExecStart=/usr/local/bin/dune exec tonny/tonny_bot.exe
Restart=always

[Install]
WantedBy=multi-user.target
```

### Nginx Configuration

```nginx
server {
    listen 443 ssl;
    server_name tonsurance.com;

    ssl_certificate /etc/letsencrypt/live/tonsurance.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tonsurance.com/privkey.pem;

    location /webhook {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Troubleshooting

### Bot not responding

1. **Check webhook status:**
```bash
curl "https://api.telegram.org/bot$TOKEN/getWebhookInfo"
```

2. **Check bot logs:**
```bash
journalctl -u tonny-bot -f
```

3. **Verify Ollama:**
```bash
curl http://localhost:11434/api/tags
# Should list "tonny" model
```

### Compliance violations

If Tonny says "insurance" terminology:

1. **Check compliance filter:**
```ocaml
Compliance_filter.ensure_compliance(response)
# Should return Error if violations found
```

2. **Retrain model with more examples:**
```bash
cd training_data
# Add more examples to tonny_training.jsonl
python train_tonny.py
```

### Pricing not updating

1. **Check backend services:**
```ocaml
state.collateral_manager  (* Should be Some(...) *)
state.bridge_monitor      (* Should be Some(...) *)
```

2. **Verify utilization:**
```ocaml
Collateral_manager.get_utilization(cm)
# Should return value between 0.0 and 1.0
```

## Next Steps

- [ ] Add Redis for distributed quote caching
- [ ] Implement database persistence for conversations
- [ ] Add transaction tracking for /buy command
- [ ] Integrate TON Connect SDK
- [ ] Add metrics/monitoring (Prometheus)
- [ ] Implement /admin commands for operators

## Support

- **Issues:** https://github.com/tonsurance/backend/issues
- **Docs:** https://docs.tonsurance.com/tonny
- **Telegram:** @TonsuranceSupport
