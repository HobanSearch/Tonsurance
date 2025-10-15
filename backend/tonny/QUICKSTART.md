# Tonny Quick Start Guide 🤖

## What is Tonny?

Tonny is the AI-powered Telegram bot for Tonsurance that provides:
- ✅ **Compliance-first** language (parametric risk coverage, not "insurance")
- 💰 **Dynamic pricing** from live backend integration
- 🤖 **Natural conversations** powered by fine-tuned Ollama LLM
- ⚡ **Instant quotes** with 5-minute validity
- 🔗 **TON Connect** wallet integration

## Complete Feature List

### ✅ Implemented Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message & bot introduction |
| `/quote [amount] [days] [type]` | Get live coverage quote with dynamic pricing |
| `/buy` | Purchase coverage (requires cached quote) |
| `/policies` | List all user coverage contracts |
| `/claim [policy_id]` | Check claim status |
| `/bridges` | View bridge health & risk multipliers |
| `/tonny [message]` | Chat with Tonny AI |
| `/help` | Show all commands |

### Core Modules

- **compliance_filter.ml** - Ensures compliant language ✅
- **ollama_client.ml** - AI responses with compliance checks ✅
- **pricing_integration.ml** - Live dynamic pricing ✅
- **conversation_state.ml** - Chat history (30-min sessions) ✅
- **quote_cache.ml** - Quote caching (5-min expiry) ✅
- **telegram_webhook.ml** - Webhook server for Telegram ✅

### Command Handlers

All commands in `commands/` directory:
- start.ml ✅
- quote.ml ✅
- buy.ml ✅
- policies.ml ✅
- claim.ml ✅
- bridges.ml ✅
- tonny.ml ✅
- help.ml ✅

## Training Dataset

**Location:** `training_data/tonny_training.jsonl`

**20 compliance-focused examples covering:**
- Parametric coverage explanations
- Dynamic pricing responses
- Coverage type comparisons
- Purchase flows
- Claim automation
- Bridge health monitoring
- Wallet support
- Six-tier vault system

## Local Fine-Tuning (MLX)

```bash
# 1. Install MLX
pip install mlx mlx-lm

# 2. Download base model
python -m mlx_lm.convert \
  --hf-path mistralai/Mistral-7B-Instruct-v0.3 \
  --mlx-path ./models/mistral-7b

# 3. Fine-tune Tonny
cd backend/tonny/training_data
python -m mlx_lm.lora \
  --model ./models/mistral-7b \
  --train \
  --data tonny_training.jsonl \
  --iters 1000 \
  --learning-rate 1e-5 \
  --lora-layers 16 \
  --adapter-file ./adapters/tonny

# 4. Merge LoRA adapter
python -m mlx_lm.fuse \
  --model ./models/mistral-7b \
  --adapter-file ./adapters/tonny \
  --save-path ./models/tonny-7b-merged

# 5. Convert to GGUF
pip install gguf
python convert-hf-to-gguf.py ./models/tonny-7b-merged \
  --outfile tonny-7b-q4_k_m.gguf \
  --outtype q4_k_m

# 6. Test locally
brew install ollama
echo 'FROM ./tonny-7b-q4_k_m.gguf
SYSTEM You are Tonny, the friendly AI assistant for Tonsurance.
PARAMETER temperature 0.7' > Modelfile
ollama create tonny -f Modelfile
ollama run tonny "What is Tonsurance?"
```

## Deploy to Hetzner

### Option 1: GPU Server (Recommended)
**Server:** GEX44 (€130/month)
**Response Time:** 1-2 seconds

### Option 2: CPU Server (Budget)
**Server:** CCX33 (€25/month)
**Response Time:** 5-8 seconds

### Setup Steps

```bash
# 1. Provision server & SSH
ssh root@your-server-ip

# 2. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 3. Install NVIDIA drivers (GPU only)
apt install -y nvidia-kernel-open-545 cuda-drivers-545

# 4. Deploy model
scp tonny-7b-q4_k_m.gguf root@your-server-ip:/opt/ollama/
scp Modelfile root@your-server-ip:/opt/ollama/
ssh root@your-server-ip "cd /opt/ollama && ollama create tonny -f Modelfile"

# 5. Start Ollama service
systemctl enable ollama
systemctl start ollama

# 6. Configure nginx reverse proxy
# (See DEPLOYMENT.md for full config)

# 7. Deploy OCaml bot
# (See DEPLOYMENT.md for full steps)
```

## Environment Variables

Create `.env.tonny`:

```bash
TELEGRAM_BOT_TOKEN=<from_botfather>
TONNY_API_URL=https://tonny-api.tonsurance.io
TONNY_MODEL=tonny
DATABASE_URL=postgresql://localhost/tonsurance
REDIS_URL=redis://localhost:6379
POLICY_FACTORY_ADDRESS=<ton_contract_address>
```

## Create Telegram Bot

1. Open Telegram, search @BotFather
2. Send `/newbot`
3. Name: "Tonny - Tonsurance Assistant"
4. Username: `TonsuranceBot`
5. Save token to `.env.tonny`

## Test the Bot

```bash
# Start bot locally
cd backend/tonny
dune build
export $(cat .env.tonny | xargs)
./_build/default/tonny_bot.exe

# Test in Telegram
# Send /start to your bot
# Try: /quote 10000 30 bridge
# Try: /tonny What is Tonsurance?
```

## Production Deployment

```bash
# Build bot
cd backend/tonny
dune build tonny_bot.exe

# Create systemd service
cat > /etc/systemd/system/tonny-bot.service <<EOF
[Unit]
Description=Tonny Telegram Bot
After=network.target ollama.service

[Service]
Type=simple
User=tonny
WorkingDirectory=/opt/tonsurance/backend/tonny
EnvironmentFile=/opt/tonsurance/.env.tonny
ExecStart=/opt/tonsurance/backend/tonny/_build/default/tonny_bot.exe
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Start service
systemctl daemon-reload
systemctl enable tonny-bot
systemctl start tonny-bot
systemctl status tonny-bot
```

## Monitoring

```bash
# View logs
journalctl -u tonny-bot -f

# Check Ollama
curl http://localhost:11434/api/tags

# Test response time
time curl -X POST http://localhost:11434/api/generate \
  -d '{"model": "tonny", "prompt": "What is Tonsurance?", "stream": false}'

# Conversation stats
# (Check bot logs for periodic stats)
```

## Compliance Checks

The bot automatically:
- ✅ Filters forbidden terms ("insurance", "policy", etc.)
- ✅ Auto-corrects to compliant language
- ✅ Validates dynamic pricing responses
- ✅ Logs violations for model retraining

Check compliance violations:
```bash
journalctl -u tonny-bot | grep "Compliance violation"
```

## Next Steps

1. **Fine-tune locally** - Train Tonny on your Mac with MLX
2. **Test thoroughly** - Verify compliance & pricing accuracy
3. **Deploy to Hetzner** - Choose GPU or CPU server
4. **Connect to backend** - Integrate with pricing engine & bridge monitor
5. **Launch bot** - Make @TonsuranceBot live!

## Support

**Documentation:**
- `README.md` - Architecture overview
- `DEPLOYMENT.md` - Full deployment guide
- `training_data/` - Training examples

**Key Features:**
- 🚫 No "insurance" language (compliance-first)
- 📊 Dynamic pricing (no fixed APR)
- ⚡ 5-min quote expiry
- 🤖 Natural AI conversations
- 💎 TON blockchain integration

Ready to launch Tonny! 🚀
