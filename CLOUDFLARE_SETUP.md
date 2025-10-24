# Cloudflare DNS and Security Setup

This guide walks you through configuring Cloudflare for the Tonsurance platform.

## Prerequisites

- Domain name (tonsurance.com) registered and transferred to Cloudflare
- Hetzner server IP address
- Cloudflare account with the domain added

## Step 1: DNS Records Configuration

Navigate to **DNS** → **Records** in your Cloudflare dashboard and create the following A records:

| Type | Name | Content | Proxy Status | TTL |
|------|------|---------|--------------|-----|
| A | @ | YOUR_HETZNER_IP | Proxied (orange cloud) | Auto |
| A | www | YOUR_HETZNER_IP | Proxied (orange cloud) | Auto |
| A | api | YOUR_HETZNER_IP | Proxied (orange cloud) | Auto |
| A | bot | YOUR_HETZNER_IP | Proxied (orange cloud) | Auto |
| A | grafana | YOUR_HETZNER_IP | Proxied (orange cloud) | Auto |

**Example:**
```
Type: A
Name: @
IPv4 address: 95.217.123.456  (replace with your server IP)
Proxy status: Proxied
TTL: Auto
```

**Important Notes:**
- Replace `YOUR_HETZNER_IP` with your actual server IP from Hetzner
- **Proxied status (orange cloud)** enables Cloudflare's CDN, DDoS protection, and security features
- Use **Auto TTL** for optimal performance
- The `@` record represents your root domain (tonsurance.com)

## Step 2: SSL/TLS Configuration

Navigate to **SSL/TLS** → **Overview**

### Encryption Mode
Select **Full (strict)**

This ensures:
- End-to-end encryption between visitor → Cloudflare → origin server
- Cloudflare validates your origin server's certificate
- Maximum security for production environments

**Why not "Flexible"?**
- Flexible only encrypts visitor → Cloudflare (not Cloudflare → origin)
- Creates security vulnerability for sensitive financial data

### Edge Certificates
Navigate to **SSL/TLS** → **Edge Certificates**

Enable the following:
- ✅ **Always Use HTTPS** (force HTTP → HTTPS redirect)
- ✅ **Automatic HTTPS Rewrites** (fix mixed content)
- ✅ **Minimum TLS Version**: TLS 1.2 (or 1.3 for better security)
- ✅ **Opportunistic Encryption** (for performance)
- ✅ **TLS 1.3** (enable for best security)

## Step 3: Security Settings

### Firewall Rules
Navigate to **Security** → **WAF** → **Firewall rules**

Create the following rules:

#### Rule 1: Block Non-Cloudflare IPs to Bot Webhook
```
Field: Hostname
Operator: equals
Value: bot.tonsurance.com

AND

Field: IP Address
Operator: does not equal
Value: [Telegram IP ranges]

Action: Block
```

Telegram IP ranges (as of 2024):
- 149.154.160.0/20
- 91.108.4.0/22

#### Rule 2: Rate Limit API Endpoints
```
Field: Hostname
Operator: equals
Value: api.tonsurance.com

AND

Field: URI Path
Operator: equals
Value: /v2/premium/quote

Action: Rate Limit (10 requests per 10 seconds)
```

#### Rule 3: Geo-blocking (Optional)
If you want to restrict access to specific countries:
```
Field: Country
Operator: not in
Value: [Allowed countries]

Action: Challenge
```

### DDoS Protection
Navigate to **Security** → **DDoS**

- ✅ Enable **DDoS Protection** (should be on by default)
- Set sensitivity to **Medium** or **High** for production

### Bot Fight Mode
Navigate to **Security** → **Bots**

- ✅ Enable **Bot Fight Mode** (free plan)
- For Pro/Business plans: Configure **Super Bot Fight Mode**

### Rate Limiting (Pro Plan and above)
Navigate to **Security** → **Rate Limiting Rules**

Create rules to protect against abuse:

#### API Endpoint Protection
```
Rule name: API Rate Limit
Match:
  - Hostname equals api.tonsurance.com
  - URI path starts with /v2/

Request rate:
  - Requests: 100 per 1 minute
  - Period: 1 minute

Action:
  - Block
  - Duration: 10 minutes
```

## Step 4: Performance Optimization

### Caching
Navigate to **Caching** → **Configuration**

#### Caching Level
Select **Standard**

#### Browser Cache TTL
Set to **4 hours** (or "Respect Existing Headers")

#### Always Online
- ✅ Enable **Always Online** (serves cached version if origin is down)

### Auto Minify
Navigate to **Speed** → **Optimization**

Enable minification:
- ✅ JavaScript
- ✅ CSS
- ✅ HTML

### Brotli Compression
- ✅ Enable **Brotli** compression (better than gzip)

## Step 5: Page Rules (Optional - Pro Plan)

Navigate to **Rules** → **Page Rules**

### Rule 1: Cache API Responses (for GET requests)
```
URL: api.tonsurance.com/v2/coverage-types*
Settings:
  - Cache Level: Cache Everything
  - Edge Cache TTL: 5 minutes
```

### Rule 2: Force HTTPS
```
URL: *tonsurance.com/*
Settings:
  - Always Use HTTPS: On
```

### Rule 3: Security for Admin Endpoints
```
URL: api.tonsurance.com/admin/*
Settings:
  - Security Level: High
  - WAF: On
```

## Step 6: Analytics and Monitoring

### Cloudflare Analytics
Navigate to **Analytics** → **Traffic**

Monitor:
- Total requests
- Bandwidth usage
- Threats blocked
- Status codes

### Notifications
Navigate to **Notifications**

Set up alerts for:
- ✅ **DDoS Attack** (when attack is detected/mitigated)
- ✅ **SSL/TLS Certificate** (expiration warnings)
- ✅ **High Error Rate** (4xx/5xx responses)
- ✅ **Origin Unreachable** (server down)

Email: Your email address
Webhook: Your Slack webhook (optional)

## Step 7: Zero Trust (Optional - Advanced)

For production deployments with high security requirements:

### Cloudflare Access
Navigate to **Zero Trust** → **Access** → **Applications**

Protect sensitive endpoints (e.g., Grafana dashboard):
```
Application name: Tonsurance Grafana
Domain: grafana.tonsurance.com
Identity providers: Google Workspace, GitHub
Policies: Email ends with @yourcompany.com
```

## Step 8: API Token for Automation

Navigate to **My Profile** → **API Tokens** → **Create Token**

Use template: **Edit zone DNS**

Permissions:
- Zone - DNS - Edit
- Zone - Zone Settings - Read

Zone Resources:
- Include - Specific zone - tonsurance.com

Copy the token and add to `.env.production`:
```bash
CLOUDFLARE_API_TOKEN=your_token_here
CLOUDFLARE_ZONE_ID=your_zone_id_here
```

Find Zone ID: In the domain overview (right sidebar under "API")

## Step 9: Testing

### DNS Propagation
Check if DNS has propagated:
```bash
dig tonsurance.com
dig api.tonsurance.com
```

Expected output should show Cloudflare IPs (104.x.x.x range)

### SSL Certificate
Test SSL configuration:
```bash
curl -I https://tonsurance.com
curl -I https://api.tonsurance.com
```

Should return `200 OK` with `CF-Cache-Status` header

### Website Loading
Test each subdomain in a browser:
- https://tonsurance.com
- https://www.tonsurance.com
- https://api.tonsurance.com/health
- https://grafana.tonsurance.com

### Security Headers
Check security headers:
```bash
curl -I https://tonsurance.com | grep -E "X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security"
```

## Step 10: Post-Deployment Checklist

- [ ] All DNS records created and proxied
- [ ] SSL/TLS set to Full (strict)
- [ ] HTTPS redirect enabled
- [ ] Firewall rules configured
- [ ] DDoS protection enabled
- [ ] Rate limiting rules active
- [ ] Bot protection enabled
- [ ] Analytics and notifications configured
- [ ] API token created and saved
- [ ] All subdomains tested and loading correctly
- [ ] Security headers verified
- [ ] SSL certificate valid

## Troubleshooting

### 521 Error (Web server is down)
- Check if Nginx is running: `systemctl status nginx`
- Check if Docker services are up: `docker compose ps`
- Verify server firewall allows ports 80/443

### 522 Error (Connection timed out)
- Verify Hetzner server IP is correct in DNS records
- Check Hetzner firewall settings (allow Cloudflare IPs)
- Ensure server is reachable: `ping your-server-ip`

### 525 Error (SSL handshake failed)
- Change SSL/TLS mode to **Full** (not strict) temporarily
- Check Nginx SSL configuration
- Verify SSL certificates on origin server

### 403 Forbidden
- Check Cloudflare firewall rules
- Verify IP isn't blocked
- Review security level settings

### Mixed Content Warnings
- Enable **Automatic HTTPS Rewrites** in SSL/TLS settings
- Update hardcoded HTTP URLs in frontend code

## Additional Resources

- [Cloudflare DNS Documentation](https://developers.cloudflare.com/dns/)
- [SSL/TLS Best Practices](https://developers.cloudflare.com/ssl/)
- [Cloudflare Security Center](https://developers.cloudflare.com/waf/)
- [Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)

## Support

For Cloudflare-specific issues:
- [Cloudflare Community](https://community.cloudflare.com/)
- [Cloudflare Support](https://support.cloudflare.com/)

For Tonsurance deployment issues:
- Check application logs: `docker compose logs -f`
- Review Nginx logs: `tail -f /var/log/nginx/error.log`
