# API Security Quick Start Guide

## TL;DR

The Tonsurance API v2 is now secured with:
- 🔒 **Rate Limiting**: 100/min per IP, 500/min per API key
- 🛡️ **CORS**: Origin allowlist
- 🔑 **Authentication**: Bearer tokens for write operations
- 📏 **Input Validation**: 10MB max, sanitization
- 📊 **Logging**: Full audit trail

## Quick Commands

### Start Secured Server
```bash
cd backend
dune exec tonsurance-api-v2

# Output shows security features enabled:
# ✓ Rate Limiting: 100/min per IP, 500/min per API key
# ✓ CORS: Enabled with origin allowlist
# ✓ Authentication: Bearer token (write ops only)
```

### Generate API Key
```bash
cd backend/scripts
./generate_api_key.sh --name "My App" --scopes "read,write"

# Copy the generated key
export API_KEY="tonsure_abc123..."
```

### Make Authenticated Request
```bash
# Public endpoint (no auth needed)
curl http://localhost:8080/api/v2/risk/exposure

# Protected endpoint (needs API key)
curl -X POST http://localhost:8080/api/v2/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000,
    "duration_days": 30,
    "user_address": "EQ..."
  }'
```

## Which Endpoints Need API Keys?

### Public (No API Key Required)
```
GET  /health
GET  /api/v2/risk/exposure
GET  /api/v2/bridge-health/:bridge_id
GET  /api/v2/risk/alerts
GET  /api/v2/tranches/apy
POST /api/v2/quote/multi-dimensional
WS   /ws
```

### Protected (API Key Required)
```
POST /api/v2/policies           (scope: write)
POST /api/v2/claims             (scope: write)
POST /api/v2/vault/deposit      (scope: write)
POST /api/v2/vault/withdraw     (scope: write)
ALL  /api/v2/admin/*            (scope: admin)
```

## Common Error Responses

### 401 Unauthorized
```json
{
  "error": "Missing Authorization header",
  "hint": "Use 'Authorization: Bearer YOUR_API_KEY'"
}
```
**Fix:** Add `Authorization: Bearer <key>` header

### 403 Forbidden (CORS)
```json
{
  "error": "CORS policy violation: Origin not allowed"
}
```
**Fix:** Add your origin to `backend/config/api_security.json`:
```json
{
  "cors": {
    "allowed_origins": ["http://localhost:3000", "https://your-app.com"]
  }
}
```

### 403 Forbidden (Insufficient Permissions)
```json
{
  "error": "Insufficient permissions",
  "required_scope": "write"
}
```
**Fix:** Generate new key with correct scopes:
```bash
./generate_api_key.sh --name "App" --scopes "read,write"
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "retry_after_seconds": 60
}
```
**Fix:** Wait 60 seconds or use authenticated requests (higher limit)

### 413 Payload Too Large
```json
{
  "error": "Request body too large",
  "max_size_mb": 10
}
```
**Fix:** Reduce request size below 10MB

## Configuration Files

### `backend/config/api_security.json`
Main security configuration:
- CORS allowed origins
- Rate limits per endpoint
- API keys (dev only - use secrets manager in prod)
- Request size limits

### Environment Variables
```bash
# Server port
export PORT=8080

# Security config path
export SECURITY_CONFIG=backend/config/api_security.json

# Redis (for distributed rate limiting)
export REDIS_HOST=127.0.0.1
export REDIS_PORT=6379
```

## Development vs Production

### Development
```bash
# Use dev API key (committed to repo)
export API_KEY="tonsure_dev_1234567890abcdef1234567890abcdef"

# Allow localhost origins
# (already configured in api_security.json)
```

### Production
```bash
# Generate prod API key (DO NOT COMMIT)
./generate_api_key.sh --name "Prod Frontend" --scopes "read,write" --expires 90

# Store in secrets manager
aws secretsmanager create-secret \
  --name tonsurance/api/key \
  --secret-string "tonsure_prod_..."

# Update CORS for prod domain
# Edit api_security.json, add "https://app.tonsurance.io"

# Enable Redis for distributed rate limiting
export REDIS_HOST=redis.prod.internal
export REDIS_PORT=6379
```

## Testing Security

### Test Rate Limiting
```bash
# Make 6 rapid requests (limit is 5 for test)
for i in {1..6}; do
  echo "Request $i:"
  curl -w "%{http_code}\n" http://localhost:8080/api/v2/risk/exposure
done

# Expected: 200, 200, 200, 200, 200, 429
```

### Test Authentication
```bash
# Should fail (no auth)
curl -X POST http://localhost:8080/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{...}'
# Expected: 401

# Should succeed (with auth)
curl -X POST http://localhost:8080/api/v2/policies \
  -H "Authorization: Bearer tonsure_dev_..." \
  -H "Content-Type: application/json" \
  -d '{...}'
# Expected: 200
```

### Test CORS
```bash
# Allowed origin
curl -H "Origin: http://localhost:3000" \
  http://localhost:8080/api/v2/risk/exposure
# Expected: 200 with Access-Control-Allow-Origin header

# Disallowed origin
curl -H "Origin: https://evil.com" \
  http://localhost:8080/api/v2/risk/exposure
# Expected: 403
```

### Run Test Suite
```bash
dune test
# Runs all security tests including rate limiting, auth, CORS, input validation
```

## Monitoring

### View Security Logs
```bash
# All requests
docker logs tonsurance-api-v2

# Security events only
docker logs tonsurance-api-v2 | grep "\[SECURITY\]"

# Failed auth attempts
docker logs tonsurance-api-v2 | grep "Failed auth"

# Rate limit violations
docker logs tonsurance-api-v2 | grep "Rate limit"
```

### Check Rate Limit Status
```bash
# Response headers show rate limit info
curl -I http://localhost:8080/api/v2/risk/exposure

# Look for:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 95
# X-RateLimit-Reset: 60
```

## Troubleshooting

### "Security configuration not found"
**Problem:** `backend/config/api_security.json` not found

**Fix:**
```bash
# Check file exists
ls -la backend/config/api_security.json

# If missing, copy from example
cp backend/config/api_security.example.json backend/config/api_security.json
```

### "Redis connection failed"
**Problem:** Rate limiter can't connect to Redis

**Fix:**
```bash
# Start Redis (optional - falls back to in-memory)
docker run -d -p 6379:6379 redis:7-alpine

# Or disable Redis by setting in environment
export REDIS_HOST=""
```

### "CORS preflight failed"
**Problem:** Browser blocking cross-origin requests

**Fix:**
1. Add your origin to `api_security.json`
2. Restart server
3. Clear browser cache
4. Test with `curl` first to verify

### "API key not working"
**Problem:** 401 error with valid-looking API key

**Check:**
1. Key is in `api_security.json`
2. Key is not revoked (`"revoked": false`)
3. Key is not expired (`"expires_at": null` or future date)
4. Key has correct scopes (`"scopes": ["read", "write"]`)
5. Using correct header format: `Authorization: Bearer tonsure_...`

## Best Practices Checklist

- [ ] Never commit API keys to git (use `.env` or secrets manager)
- [ ] Rotate API keys every 90 days
- [ ] Use minimum required scopes (read vs write vs admin)
- [ ] Add only trusted origins to CORS allowlist
- [ ] Monitor rate limit violations for abuse
- [ ] Review security logs regularly
- [ ] Use Redis for production (distributed rate limiting)
- [ ] Set API key expiration for production keys
- [ ] Test security features in staging before prod
- [ ] Set up alerts for suspicious activity (>10 failed auth/hour)

## Need Help?

**Documentation:**
- Full API Reference: `backend/api/README_API_V2.md`
- Security Implementation: `API_SECURITY_IMPLEMENTATION_SUMMARY.md`

**Support:**
- Discord: #api-support
- Email: support@tonsurance.io

**Security Issues:**
- Private disclosure: security@tonsurance.io
- GitHub: Tag with `security` label
