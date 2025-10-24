# Tonsurance Server Setup - Quick Reference

This is a quick reference guide for deploying Tonsurance to your Hetzner server. For detailed information, see `CLOUDFLARE_SETUP.md` and `HETZNER_CLOUDFLARE_DEPLOYMENT.md`.

## Pre-deployment Checklist

- [ ] Hetzner server created (Ubuntu 22.04 LTS recommended)
- [ ] Server IP address noted
- [ ] SSH access configured
- [ ] Domain name (tonsurance.com) added to Cloudflare
- [ ] `.env.production` file prepared locally

## Step 1: Initial Server Access

SSH into your Hetzner server:

```bash
ssh root@YOUR_HETZNER_IP
```

## Step 2: Upload Configuration Files

From your **local machine**, upload necessary files:

```bash
# Upload .env.production
scp .env.production root@YOUR_HETZNER_IP:/tmp/

# Upload deployment script
scp deploy-hetzner.sh root@YOUR_HETZNER_IP:/tmp/

# Upload Nginx configuration
scp nginx.conf root@YOUR_HETZNER_IP:/tmp/
```

## Step 3: Run Deployment Script

On the **server**:

```bash
# Move to root home
cd ~

# Copy deployment script
cp /tmp/deploy-hetzner.sh .
chmod +x deploy-hetzner.sh

# Run deployment (will prompt for GitHub repo URL)
./deploy-hetzner.sh
```

**When prompted**, enter your GitHub repository URL:
```
https://github.com/YOUR_USERNAME/Tonsurance.git
```

The script will:
- Install Docker, Docker Compose, Nginx
- Create application user
- Clone repository to `/opt/tonsurance`
- Configure firewall
- Set up systemd service
- Start all services

## Step 4: Manual Post-Deployment Steps

If the script completes successfully, perform these additional steps:

### 4.1: Copy Environment File to App Directory

```bash
cd /opt/tonsurance
cp /tmp/.env.production .
ln -sf .env.production .env
chown tonsurance:tonsurance .env.production .env
chmod 600 .env.production .env
```

### 4.2: Verify Services are Running

```bash
cd /opt/tonsurance
docker compose ps
```

Expected output:
```
NAME                  COMMAND                  SERVICE     STATUS      PORTS
tonsurance-api        "/app/bin/api_v2_ser…"   api         running     8080/tcp
tonsurance-db         "docker-entrypoint.s…"   postgres    running     5432/tcp
tonsurance-redis      "docker-entrypoint.s…"   redis       running     6379/tcp
tonsurance-rabbitmq   "docker-entrypoint.s…"   rabbitmq    running     5672/tcp, 15672/tcp
tonsurance-grafana    "/run.sh"                grafana     running     3001/tcp
tonsurance-prometheus "/bin/prometheus --c…"   prometheus  running     9090/tcp
```

### 4.3: Check Application Logs

```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f api
docker compose logs -f postgres
```

### 4.4: Test API Endpoint Locally

```bash
curl http://localhost:8080/health
```

Expected response:
```json
{"status":"healthy","timestamp":"2024-01-23T12:00:00Z"}
```

## Step 5: Configure Cloudflare DNS

Follow `CLOUDFLARE_SETUP.md` to configure:

1. Create A records for all subdomains pointing to your server IP
2. Enable Cloudflare proxy (orange cloud)
3. Set SSL/TLS to Full (strict)
4. Configure firewall rules and rate limiting
5. Enable security features

**Essential DNS Records:**

| Type | Name     | Content          | Proxy  |
|------|----------|------------------|--------|
| A    | @        | YOUR_HETZNER_IP  | Proxied |
| A    | www      | YOUR_HETZNER_IP  | Proxied |
| A    | api      | YOUR_HETZNER_IP  | Proxied |
| A    | bot      | YOUR_HETZNER_IP  | Proxied |
| A    | grafana  | YOUR_HETZNER_IP  | Proxied |

## Step 6: Deploy Smart Contracts

### 6.1: Install Blueprint (if not already installed locally)

On your **local machine**:

```bash
cd /Users/ben/Documents/Work/HS/Application/Tonsurance
npm install
npx blueprint build
```

### 6.2: Deploy to Mainnet

```bash
# Deploy Policy Factory
npx blueprint run deployPolicyFactory --mainnet

# Deploy Premium Calculator
npx blueprint run deployPremiumCalculator --mainnet

# Deploy Primary Vault
npx blueprint run deployPrimaryVault --mainnet

# Deploy Claims Engine
npx blueprint run deployClaimsEngine --mainnet
```

### 6.3: Update .env.production with Contract Addresses

On the **server**, edit the environment file:

```bash
nano /opt/tonsurance/.env.production
```

Update the following lines with your deployed contract addresses:
```bash
POLICY_FACTORY_ADDRESS=EQC...
PREMIUM_CALCULATOR_ADDRESS=EQC...
PRIMARY_VAULT_ADDRESS=EQC...
CLAIMS_ENGINE_ADDRESS=EQC...
PRICING_ORACLE_ADDRESS=EQC...
```

Restart services after updating:
```bash
systemctl restart tonsurance
```

## Step 7: Configure Telegram Bot

### 7.1: Create Bot with BotFather

On Telegram, message [@BotFather](https://t.me/botfather):

```
/newbot
```

Follow prompts to create your bot and get the token.

### 7.2: Update Environment Variable

```bash
nano /opt/tonsurance/.env.production
```

Update:
```bash
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
```

### 7.3: Set Webhook

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://bot.tonsurance.com/webhook"}'
```

### 7.4: Restart Bot Service

```bash
docker compose restart bot
```

## Step 8: Monitoring and Maintenance

### View System Status

```bash
# Service status
systemctl status tonsurance

# Container status
docker compose ps

# Resource usage
htop
docker stats
```

### View Logs

```bash
# Real-time logs (all services)
docker compose logs -f

# Recent logs (last 100 lines)
docker compose logs --tail=100

# Nginx access logs
tail -f /var/log/nginx/access.log

# Nginx error logs
tail -f /var/log/nginx/error.log
```

### Restart Services

```bash
# Restart all services
systemctl restart tonsurance

# Restart specific service
docker compose restart api
docker compose restart postgres

# Rebuild and restart (after code changes)
cd /opt/tonsurance
git pull
docker compose build
docker compose up -d
```

### Access Grafana Dashboard

Visit: https://grafana.tonsurance.com

Login:
- Username: `admin`
- Password: (from .env.production `GRAFANA_PASSWORD`)

## Step 9: Database Management

### Access PostgreSQL

```bash
docker compose exec postgres psql -U tonsurance -d tonsurance
```

### Run Migrations

```bash
docker compose exec api /app/bin/migrate.sh
```

### Backup Database

```bash
# Create backup
docker compose exec postgres pg_dump -U tonsurance tonsurance > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore backup
docker compose exec -T postgres psql -U tonsurance tonsurance < backup_20240123_120000.sql
```

### Scheduled Backups

Add to crontab:

```bash
crontab -e
```

Add line:
```
0 2 * * * cd /opt/tonsurance && docker compose exec -T postgres pg_dump -U tonsurance tonsurance > /opt/backups/tonsurance_$(date +\%Y\%m\%d).sql
```

## Step 10: Security Hardening

### Change Default Passwords

Edit `.env.production` and change all passwords:
- `POSTGRES_PASSWORD`
- `RABBITMQ_PASSWORD`
- `GRAFANA_PASSWORD`

Then restart:
```bash
systemctl restart tonsurance
```

### Configure Fail2Ban (SSH Protection)

```bash
apt install fail2ban -y
systemctl enable fail2ban
systemctl start fail2ban
```

### Automatic Security Updates

```bash
apt install unattended-upgrades -y
dpkg-reconfigure -plow unattended-upgrades
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs for errors
docker compose logs api

# Check if port is already in use
netstat -tulpn | grep :8080

# Restart Docker daemon
systemctl restart docker
```

### Database Connection Errors

```bash
# Check if PostgreSQL is running
docker compose ps postgres

# Check database logs
docker compose logs postgres

# Verify connection string
docker compose exec api env | grep DATABASE_URL
```

### Nginx Not Forwarding Requests

```bash
# Test Nginx configuration
nginx -t

# Restart Nginx
systemctl restart nginx

# Check Nginx logs
tail -f /var/log/nginx/error.log
```

### Out of Disk Space

```bash
# Check disk usage
df -h

# Clean up Docker images/containers
docker system prune -a

# Remove old logs
journalctl --vacuum-time=7d
```

## Useful Commands Reference

```bash
# Server management
systemctl status tonsurance          # Service status
systemctl start tonsurance           # Start service
systemctl stop tonsurance            # Stop service
systemctl restart tonsurance         # Restart service

# Docker commands
docker compose ps                    # List containers
docker compose logs -f               # Follow logs
docker compose restart api           # Restart specific service
docker compose build                 # Rebuild images
docker compose up -d                 # Start in detached mode
docker compose down                  # Stop and remove containers

# System monitoring
htop                                 # CPU/Memory usage
docker stats                         # Container resource usage
df -h                                # Disk usage
netstat -tulpn                       # Network ports

# Firewall
ufw status                           # Firewall status
ufw allow 22/tcp                     # Allow SSH
ufw enable                           # Enable firewall

# Nginx
nginx -t                             # Test configuration
systemctl reload nginx               # Reload configuration
systemctl status nginx               # Check status
```

## Getting Help

- Application logs: `docker compose logs -f`
- Nginx logs: `tail -f /var/log/nginx/error.log`
- System logs: `journalctl -xe`
- GitHub Issues: https://github.com/YOUR_USERNAME/Tonsurance/issues
- Cloudflare Support: https://support.cloudflare.com

## Production Checklist

Before going live:

- [ ] All environment variables set correctly
- [ ] Smart contracts deployed to mainnet
- [ ] Contract addresses updated in .env.production
- [ ] Cloudflare DNS configured and propagated
- [ ] SSL/TLS working (test https://)
- [ ] Telegram bot webhook set
- [ ] Database migrations run successfully
- [ ] All services running (docker compose ps)
- [ ] API endpoints responding (curl tests)
- [ ] Monitoring dashboard accessible
- [ ] Backup strategy configured
- [ ] Security hardening complete
- [ ] Firewall rules active
- [ ] Rate limiting configured
- [ ] Admin credentials secured

Your Tonsurance platform is now ready for production! 🚀
