# Tonny - Tonsurance Telegram Bot 🤖

Tonny is the AI-powered Telegram bot for Tonsurance, providing conversational assistance for parametric risk coverage on TON blockchain.

## Architecture

### Core Components

- **compliance_filter.ml** - Ensures compliant language (no "insurance" terminology)
- **pricing_integration.ml** - Fetches live dynamic pricing from pricing engine
- **ollama_client.ml** - Communicates with fine-tuned Ollama LLM
- **conversation_state.ml** - Manages chat history per user
- **tonny_bot.ml** - Main bot logic and command routing

### Commands

- `/start` - Welcome message & wallet connection
- `/quote [amount] [days] [type]` - Get live coverage quote
- `/buy` - Purchase coverage (with TON Connect)
- `/policies` - List active coverage contracts
- `/claim [policy_id]` - File parametric claim
- `/bridges` - Check bridge health status
- `/tonny [message]` - Chat with Tonny AI
- `/help` - Command list

## Compliance Requirements

### ❌ Forbidden Terms
- insurance, insure, insured, insurer
- policy holder, policyholder
- insurance company/provider
- underwriter, underwriting

### ✅ Compliant Language
- "parametric risk coverage" (not insurance)
- "coverage contract" (not policy)
- "coverage provider" (not insurer)
- "coverage holder" (not policy holder)

All responses are automatically filtered and corrected via `compliance_filter.ml`.

## Dynamic Pricing

Tonny **always** fetches live pricing from the backend. Pricing varies based on:

- Coverage type risk profile
- Bridge health scores (1.0x - 2.0x multiplier)
- Vault utilization levels
- Market volatility
- Duration selected

**No fixed APR is ever quoted.**

## Training Data Format

Tonny is fine-tuned on Mistral 7B using MLX. Training data is in JSONL format:

```jsonl
{"messages": [
  {"role": "system", "content": "You are Tonny, the AI assistant for Tonsurance parametric risk coverage..."},
  {"role": "user", "content": "What is Tonsurance?"},
  {"role": "assistant", "content": "Tonsurance is a parametric risk coverage protocol..."}
]}
```

See `training_data/tonny_training.jsonl` for full dataset.

## Development

### Build

```bash
cd backend
dune build tonny/tonny_bot.exe
```

### Run Tests

```bash
dune runtest tonny/
```

### Deploy

1. Fine-tune model locally with MLX
2. Convert to GGUF format
3. Deploy to Hetzner with Ollama
4. Configure environment variables
5. Start bot service

See deployment guide in `docs/tonny_deployment.md`.

## Environment Variables

```bash
TELEGRAM_BOT_TOKEN=<from_botfather>
TONNY_API_URL=https://tonny-api.tonsurance.io
TONNY_MODEL=tonny
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
```

## Monitoring

- Compliance violations logged to `compliance_violations` table
- Pricing API latency tracked
- Response time metrics
- User conversation analytics

Dashboard: https://monitor.tonsurance.io/tonny
