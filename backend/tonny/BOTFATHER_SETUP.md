# Tonny Bot - BotFather Setup Guide

Complete step-by-step guide to set up your Tonny Telegram bot using BotFather.

## Prerequisites

- Telegram account (download from https://telegram.org or use web version)
- Access to your server for webhook configuration (or use local testing first)

## Step 1: Create Your Bot with BotFather

1. **Open Telegram** and search for `@BotFather` (official Telegram bot for creating bots)

2. **Start a chat** with BotFather by clicking "START"

3. **Create a new bot**:
   ```
   /newbot
   ```

4. **Choose a name** for your bot (this is the display name users will see):
   ```
   Tonsurance Bot
   ```
   or
   ```
   Tonny
   ```

5. **Choose a username** (must end in 'bot' and be unique):
   ```
   tonsurance_bot
   ```
   or
   ```
   tonny_tonsurance_bot
   ```

6. **Save your token**: BotFather will give you an HTTP API token like:
   ```
   7123456789:AAHxR9Z4F1234567890abcdefghijklmnop
   ```

   ⚠️ **IMPORTANT**: Keep this token secret! It's like a password for your bot.

## Step 2: Configure Bot Settings

### Set Bot Description

```
/setdescription
```
Select your bot, then paste:
```
🤖 Tonny - Your AI assistant for parametric risk coverage on TON blockchain.

Get live quotes, purchase coverage, track policies, and monitor bridge health.

Commands: /start, /help, /quote, /buy, /policies, /claim, /bridges
```

### Set About Text

```
/setabouttext
```
Select your bot, then paste:
```
Tonny is the official Telegram bot for Tonsurance, providing 24/7 access to parametric risk coverage on TON blockchain. Powered by AI.
```

### Set Bot Commands

```
/setcommands
```
Select your bot, then paste:
```
start - 👋 Welcome & introduction
help - 📖 Show all commands
quote - 💰 Get live coverage quote
buy - 🛒 Purchase coverage
policies - 📋 View your active policies
claim - 🎯 Check claim status
bridges - 🌉 View bridge health
tonny - 💬 Chat with Tonny AI
```

### Set Bot Picture (Optional)

```
/setuserpic
```
Select your bot, then upload a square image (recommended: 512x512px) with your bot's logo.

## Step 3: Configure Environment Variables

Create a `.env` file in `/Users/ben/Documents/Work/HS/Application/Tonsurance/backend/tonny/`:

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=7123456789:AAHxR9Z4F1234567890abcdefghijklmnop  # Replace with your token from BotFather

# Webhook Configuration (for production deployment)
WEBHOOK_URL=https://your-domain.com  # Your public HTTPS URL
WEBHOOK_PORT=8080
WEBHOOK_PATH=/webhook

# Tonny AI Model Configuration
TONNY_API_URL=http://localhost:11434  # Ollama API endpoint
TONNY_MODEL=tonny  # Fine-tuned model name

# TON Blockchain Configuration
TON_RPC_ENDPOINT=https://toncenter.com/api/v2/jsonRPC
TON_POLICY_FACTORY_ADDRESS=EQC...  # Your deployed contract address

# Pricing Configuration
BASE_PREMIUM_BPS=50  # 0.5% base premium
MIN_DURATION_DAYS=7
MAX_DURATION_DAYS=365
MIN_COVERAGE_AMOUNT=100
MAX_COVERAGE_AMOUNT=1000000

# Environment
NODE_ENV=production
LOG_LEVEL=info
```

## Step 4: Local Testing (Without Webhook)

For local testing without deploying a public webhook:

1. **Use polling mode** (modify `tonny_bot.ml` temporarily to use `getUpdates` instead of webhook)

2. **OR use ngrok** for local webhook testing:
   ```bash
   # Install ngrok
   brew install ngrok  # macOS
   # or download from https://ngrok.com

   # Start ngrok tunnel
   ngrok http 8080

   # Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
   # Set as WEBHOOK_URL in .env
   export WEBHOOK_URL="https://abc123.ngrok.io"
   ```

3. **Run the bot**:
   ```bash
   cd /Users/ben/Documents/Work/HS/Application/Tonsurance/backend
   export TELEGRAM_BOT_TOKEN="your_token_here"
   export WEBHOOK_URL="https://abc123.ngrok.io"  # If using ngrok
   dune exec tonny/tonny_bot.exe
   ```

4. **Test in Telegram**:
   - Open Telegram
   - Search for your bot by username (`@tonsurance_bot`)
   - Click START
   - Try commands: `/help`, `/quote 10000 30 bridge`

## Step 5: Production Deployment

### Option A: Deploy on VPS/Cloud

1. **Set up server** (Ubuntu/Debian example):
   ```bash
   # Install dependencies
   sudo apt update
   sudo apt install opam ocaml build-essential libssl-dev libgmp-dev pkg-config

   # Install dune
   opam init
   opam install dune lwt cohttp-lwt-unix yojson
   ```

2. **Clone and build**:
   ```bash
   cd /opt
   git clone https://github.com/your-repo/tonsurance
   cd tonsurance/backend
   dune build tonny/tonny_bot.exe
   ```

3. **Configure SSL/HTTPS** (required for webhooks):
   ```bash
   # Install certbot
   sudo apt install certbot python3-certbot-nginx

   # Get SSL certificate
   sudo certbot certonly --nginx -d your-domain.com
   ```

4. **Set up Nginx reverse proxy** (`/etc/nginx/sites-available/tonny`):
   ```nginx
   server {
       listen 443 ssl;
       server_name your-domain.com;

       ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

       location /webhook {
           proxy_pass http://localhost:8080;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

5. **Create systemd service** (`/etc/systemd/system/tonny-bot.service`):
   ```ini
   [Unit]
   Description=Tonny Telegram Bot
   After=network.target

   [Service]
   Type=simple
   User=tonny
   WorkingDirectory=/opt/tonsurance/backend
   Environment="TELEGRAM_BOT_TOKEN=your_token"
   Environment="WEBHOOK_URL=https://your-domain.com"
   Environment="WEBHOOK_PORT=8080"
   Environment="TONNY_API_URL=http://localhost:11434"
   ExecStart=/opt/tonsurance/backend/_build/default/tonny/tonny_bot.exe
   Restart=always
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

6. **Start the service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable tonny-bot
   sudo systemctl start tonny-bot
   sudo systemctl status tonny-bot
   ```

### Option B: Deploy on Heroku

1. **Create `Procfile`**:
   ```
   web: dune exec tonny/tonny_bot.exe
   ```

2. **Deploy**:
   ```bash
   heroku create tonny-bot
   heroku config:set TELEGRAM_BOT_TOKEN=your_token
   heroku config:set WEBHOOK_URL=https://tonny-bot.herokuapp.com
   git push heroku main
   ```

## Step 6: Verify Bot is Working

### Check Webhook Status

```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://your-domain.com/webhook",
    "has_custom_certificate": false,
    "pending_update_count": 0,
    "last_error_date": 0,
    "max_connections": 40
  }
}
```

### Send Test Message

```bash
# Send message to yourself via bot
curl -X POST "https://api.telegram.org/bot<YOUR_TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_id": YOUR_CHAT_ID,
    "text": "Test message from Tonny!"
  }'
```

To find your `chat_id`:
1. Send `/start` to your bot in Telegram
2. Check bot logs or use:
```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates"
```

## Step 7: Monitor and Maintain

### View Logs

```bash
# If using systemd
sudo journalctl -u tonny-bot -f

# If running manually
dune exec tonny/tonny_bot.exe 2>&1 | tee tonny.log
```

### Common Issues

**Bot not responding:**
```bash
# Check webhook status
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"

# Delete webhook and set again
curl "https://api.telegram.org/bot<TOKEN>/deleteWebhook"

# Check bot is running
systemctl status tonny-bot
```

**SSL certificate errors:**
- Webhook MUST use HTTPS
- Certificate must be valid (not self-signed unless custom)
- Use Let's Encrypt for free SSL certificates

**Timeout errors:**
- Check firewall rules allow port 8080 (or your WEBHOOK_PORT)
- Verify Nginx is forwarding correctly
- Check bot process logs for errors

## Security Best Practices

1. **Never commit `.env` file** - add to `.gitignore`
2. **Rotate bot token** if exposed:
   ```
   /revoke  # in BotFather
   /token   # get new token
   ```
3. **Use environment variables** for all secrets
4. **Enable rate limiting** in production
5. **Monitor bot logs** for suspicious activity
6. **Use HTTPS only** for webhooks

## Next Steps

- ✅ Bot created and configured
- ✅ Webhook set up
- ✅ SSL certificate configured
- ⏭️ Test all commands (`/start`, `/quote`, `/buy`, etc.)
- ⏭️ Fine-tune Ollama model for better AI responses
- ⏭️ Set up monitoring and alerts
- ⏭️ Configure database for policy storage
- ⏭️ Deploy to production

## Support

- Telegram Bot API docs: https://core.telegram.org/bots/api
- BotFather commands: https://core.telegram.org/bots#6-botfather
- Tonny integration guide: `/backend/tonny/INTEGRATION.md`
- Issues: https://github.com/tonsurance/backend/issues
