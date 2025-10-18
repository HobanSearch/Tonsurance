# Transactional API - Developer Quick Start

**5-Minute Integration Guide**

---

## 1. Buy Insurance Policy

```bash
# Get quote first
curl -X POST http://localhost:8080/api/v2/quote/multi-dimensional \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000.0,
    "duration_days": 30
  }'

# Response: {"premium": 6.58, ...}

# Buy policy
curl -X POST http://localhost:8080/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "EQD...",
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000.0,
    "duration_days": 30,
    "payment_token": "USDT",
    "payment_amount": 6.58
  }'

# Response: {"tx_hash": "0xabc...", "poll_url": "/api/v2/transactions/0xabc..."}
```

---

## 2. Poll Transaction

```bash
# Poll immediately
curl http://localhost:8080/api/v2/transactions/0xabc...
# Response: {"status": "pending", ...}

# Wait 5 seconds
sleep 5

# Poll again
curl http://localhost:8080/api/v2/transactions/0xabc...
# Response: {"status": "confirmed", "events": [...], ...}
```

---

## 3. File Claim

```bash
curl -X POST http://localhost:8080/api/v2/claims \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "EQD...",
    "policy_id": 12345,
    "evidence_url": "ipfs://Qm...",
    "claim_amount": 10000.0
  }'

# Response: {"tx_hash": "0xdef...", "auto_verifiable": true, ...}
```

---

## 4. Deposit to Vault

```bash
curl -X POST http://localhost:8080/api/v2/vault/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "EQD...",
    "tranche_id": 2,
    "amount": 1000.0,
    "lock_period_days": 90
  }'

# Response: {"tokens_minted": 995.5, "nav": 1.004, ...}
```

---

## 5. Withdraw from Vault

```bash
curl -X POST http://localhost:8080/api/v2/vault/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "EQD...",
    "tranche_id": 2,
    "token_amount": 500.0
  }'

# Response: {"capital_returned": 502.0, "yield_returned": 15.5, ...}
```

---

## Error Handling

```javascript
// JavaScript example
async function buyPolicy(params) {
  const response = await fetch('/api/v2/policies', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(params)
  });

  if (response.status === 429) {
    const data = await response.json();
    const retryAfter = response.headers.get('Retry-After');
    throw new Error(`Rate limited. Retry in ${retryAfter}s`);
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }

  return await response.json();
}
```

---

## Rate Limits

- **100 requests/minute** per IP
- **20 transactions/hour** per user
- Response: `429 Too Many Requests` with `Retry-After` header

---

## Files

- **Full Docs**: `API_V2_TRANSACTIONAL.md`
- **curl Examples**: `CURL_EXAMPLES.md`
- **Postman**: `postman_collection_transactional_api.json`
- **Implementation**: `backend/api/transactional_api.ml`
- **Tests**: `backend/test/api_v2_transactional_test.ml`

---

## Support

- Docs: https://docs.tonsurance.com
- Telegram: https://t.me/tonsurance
- Email: dev@tonsurance.com
