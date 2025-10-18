# Tonsurance Transactional API - curl Examples

This document provides ready-to-use curl commands for testing all transactional endpoints.

## Setup

```bash
# Set base URL
export API_URL="http://localhost:8080"  # Local
# export API_URL="https://testnet-api.tonsurance.com"  # Testnet
# export API_URL="https://api.tonsurance.com"  # Mainnet

# Set your TON address
export USER_ADDRESS="EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2"
```

---

## 1. Buy Insurance Policy

### USDC Depeg Insurance (30 days, $10k coverage)

```bash
curl -X POST $API_URL/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000.0,
    "duration_days": 30,
    "payment_token": "USDT",
    "payment_amount": 6.58
  }' | jq

# Expected output:
# {
#   "policy_id": null,
#   "tx_hash": "0xabc123...",
#   "status": "pending",
#   "poll_url": "/api/v2/transactions/0xabc123...",
#   "estimated_confirmation_seconds": 5
# }

# Save tx_hash for polling:
export TX_HASH=$(curl -s -X POST $API_URL/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000.0,
    "duration_days": 30,
    "payment_token": "USDT",
    "payment_amount": 6.58
  }' | jq -r '.tx_hash')

echo "Transaction hash: $TX_HASH"
```

### Bridge Insurance (Arbitrum, 90 days, $50k)

```bash
curl -X POST $API_URL/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "coverage_type": "bridge",
    "chain": "Arbitrum",
    "stablecoin": "USDT",
    "coverage_amount": 50000.0,
    "duration_days": 90,
    "payment_token": "TON",
    "payment_amount": 270.0
  }' | jq
```

### CEX Liquidation Insurance (7 days, $100k)

```bash
curl -X POST $API_URL/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "coverage_type": "cex_liquidation",
    "chain": "Bitcoin",
    "stablecoin": "USDT",
    "coverage_amount": 100000.0,
    "duration_days": 7,
    "payment_token": "TON",
    "payment_amount": 48.0
  }' | jq
```

### Smart Contract Insurance (Polygon, 60 days, $25k)

```bash
curl -X POST $API_URL/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "coverage_type": "smart_contract",
    "chain": "Polygon",
    "stablecoin": "DAI",
    "coverage_amount": 25000.0,
    "duration_days": 60,
    "payment_token": "TON",
    "payment_amount": 85.0
  }' | jq
```

---

## 2. File Insurance Claim

### File Claim with IPFS Evidence

```bash
curl -X POST $API_URL/api/v2/claims \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "policy_id": 12345,
    "evidence_url": "ipfs://QmXa1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1vW2xY3zA4bC",
    "claim_amount": 10000.0
  }' | jq

# Expected output:
# {
#   "claim_id": null,
#   "tx_hash": "0xdef456...",
#   "status": "pending_verification",
#   "auto_verifiable": true,
#   "estimated_payout_time": "2025-10-16T15:30:00Z",
#   "poll_url": "/api/v2/transactions/0xdef456..."
# }
```

### File Claim with Arweave Evidence

```bash
curl -X POST $API_URL/api/v2/claims \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "policy_id": 67890,
    "evidence_url": "ar://abc123def456ghi789jkl012",
    "claim_amount": 50000.0
  }' | jq
```

---

## 3. Vault Deposit

### Deposit to SURE-SNR (Tier 1, 90-day lock)

```bash
curl -X POST $API_URL/api/v2/vault/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "tranche_id": 2,
    "amount": 1000.0,
    "lock_period_days": 90
  }' | jq

# Expected output:
# {
#   "deposit_id": null,
#   "tx_hash": "0xghi789...",
#   "tokens_minted": 995.5,
#   "nav": 1.004,
#   "lock_until": "2026-01-14T00:00:00Z",
#   "poll_url": "/api/v2/transactions/0xghi789..."
# }
```

### Deposit to SURE-MEZZ (Tier 3, 180-day lock)

```bash
curl -X POST $API_URL/api/v2/vault/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "tranche_id": 3,
    "amount": 5000.0,
    "lock_period_days": 180
  }' | jq
```

### Deposit to SURE-EQT (Tier 6, no lock)

```bash
curl -X POST $API_URL/api/v2/vault/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "tranche_id": 6,
    "amount": 10000.0
  }' | jq
```

---

## 4. Vault Withdrawal

### Withdraw from SURE-SNR

```bash
curl -X POST $API_URL/api/v2/vault/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "tranche_id": 2,
    "token_amount": 500.0
  }' | jq

# Expected output:
# {
#   "withdrawal_id": null,
#   "tx_hash": "0xjkl012...",
#   "capital_returned": 502.0,
#   "yield_returned": 15.5,
#   "total_payout": 517.5,
#   "poll_url": "/api/v2/transactions/0xjkl012..."
# }
```

### Withdraw from SURE-EQT

```bash
curl -X POST $API_URL/api/v2/vault/withdraw \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "tranche_id": 6,
    "token_amount": 1000.0
  }' | jq
```

---

## 5. Poll Transaction Status

### Poll Immediately (Pending)

```bash
curl $API_URL/api/v2/transactions/$TX_HASH | jq

# Expected output:
# {
#   "tx_hash": "0xabc123...",
#   "status": "pending",
#   "block_height": null,
#   "exit_code": null,
#   "events": [],
#   "created_at": 1729094500.0,
#   "confirmed_at": null
# }
```

### Poll After 5 Seconds (Confirmed)

```bash
sleep 6
curl $API_URL/api/v2/transactions/$TX_HASH | jq

# Expected output:
# {
#   "tx_hash": "0xabc123...",
#   "status": "confirmed",
#   "block_height": 12345678,
#   "exit_code": 0,
#   "events": [
#     {
#       "event_id": "0x40",
#       "type": "PolicyCreated",
#       "data": {
#         "policy_id": 12345,
#         "buyer": "EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2"
#       }
#     }
#   ],
#   "created_at": 1729094500.0,
#   "confirmed_at": 1729094505.0
# }
```

### Continuous Polling Script

```bash
#!/bin/bash
# poll_transaction.sh

TX_HASH=$1
API_URL=${API_URL:-http://localhost:8080}

echo "Polling transaction: $TX_HASH"
echo "Press Ctrl+C to stop"
echo ""

while true; do
  RESPONSE=$(curl -s $API_URL/api/v2/transactions/$TX_HASH)
  STATUS=$(echo $RESPONSE | jq -r '.status')

  if [ "$STATUS" = "confirmed" ]; then
    echo "✓ Transaction confirmed!"
    echo $RESPONSE | jq
    exit 0
  elif [ "$STATUS" = "failed" ]; then
    echo "✗ Transaction failed!"
    echo $RESPONSE | jq
    exit 1
  else
    echo "⏳ Status: $STATUS (waiting...)"
  fi

  sleep 2
done

# Usage:
# ./poll_transaction.sh 0xabc123...
```

---

## 6. Read-Only Endpoints

### Get Premium Quote

```bash
curl -X POST $API_URL/api/v2/quote/multi-dimensional \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000.0,
    "duration_days": 30
  }' | jq
```

### Get Risk Exposure

```bash
curl $API_URL/api/v2/risk/exposure | jq
```

### Get Tranche APYs

```bash
curl $API_URL/api/v2/tranches/apy | jq
```

### Get Bridge Health

```bash
curl $API_URL/api/v2/bridge-health/arbitrum-ethereum | jq
```

### Health Check

```bash
curl $API_URL/health | jq
```

---

## Complete User Journey Example

```bash
#!/bin/bash
# complete_journey.sh - Buy policy → Wait → File claim

set -e

API_URL=${API_URL:-http://localhost:8080}
USER_ADDRESS="EQDtFpEwcFAEcRe5mLVh2N6C0x-_hJEM7W61_JLnSF74p4q2"

echo "=== STEP 1: Get Premium Quote ==="
QUOTE=$(curl -s -X POST $API_URL/api/v2/quote/multi-dimensional \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000.0,
    "duration_days": 30
  }')

PREMIUM=$(echo $QUOTE | jq -r '.premium')
echo "Premium: $$PREMIUM"
echo ""

echo "=== STEP 2: Buy Policy ==="
BUY_RESPONSE=$(curl -s -X POST $API_URL/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000.0,
    "duration_days": 30,
    "payment_token": "USDT",
    "payment_amount": '$PREMIUM'
  }')

TX_HASH=$(echo $BUY_RESPONSE | jq -r '.tx_hash')
echo "Transaction: $TX_HASH"
echo ""

echo "=== STEP 3: Wait for Confirmation ==="
while true; do
  STATUS_RESPONSE=$(curl -s $API_URL/api/v2/transactions/$TX_HASH)
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')

  if [ "$STATUS" = "confirmed" ]; then
    POLICY_ID=$(echo $STATUS_RESPONSE | jq -r '.events[0].data.policy_id')
    echo "✓ Policy created: #$POLICY_ID"
    break
  fi

  echo "⏳ Waiting for confirmation..."
  sleep 2
done
echo ""

echo "=== STEP 4: File Claim (simulated trigger) ==="
CLAIM_RESPONSE=$(curl -s -X POST $API_URL/api/v2/claims \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "policy_id": '$POLICY_ID',
    "evidence_url": "ipfs://QmXa1bC2dE3fG4hI5jK6lM7nO8pQ9rS0tU1vW2xY3zA4bC",
    "claim_amount": 10000.0
  }')

CLAIM_TX=$(echo $CLAIM_RESPONSE | jq -r '.tx_hash')
echo "Claim transaction: $CLAIM_TX"
echo ""

echo "=== STEP 5: Wait for Payout ==="
while true; do
  CLAIM_STATUS=$(curl -s $API_URL/api/v2/transactions/$CLAIM_TX)
  STATUS=$(echo $CLAIM_STATUS | jq -r '.status')

  if [ "$STATUS" = "confirmed" ]; then
    echo "✓ Claim approved and paid!"
    echo $CLAIM_STATUS | jq
    break
  fi

  echo "⏳ Verifying claim..."
  sleep 2
done

echo ""
echo "=== Journey Complete ==="
```

---

## Error Testing

### Invalid Premium Amount

```bash
curl -X POST $API_URL/api/v2/policies \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000.0,
    "duration_days": 30,
    "payment_token": "USDT",
    "payment_amount": 999.0
  }' | jq

# Expected: 400 Bad Request with error message
```

### Invalid Evidence URL

```bash
curl -X POST $API_URL/api/v2/claims \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "policy_id": 12345,
    "evidence_url": "https://example.com/evidence.pdf",
    "claim_amount": 10000.0
  }' | jq

# Expected: 400 Bad Request (evidence must be IPFS/Arweave)
```

### Invalid Tranche ID

```bash
curl -X POST $API_URL/api/v2/vault/deposit \
  -H "Content-Type: application/json" \
  -d '{
    "user_address": "'$USER_ADDRESS'",
    "tranche_id": 99,
    "amount": 1000.0
  }' | jq

# Expected: 400 Bad Request
```

### Rate Limit Test

```bash
#!/bin/bash
# Test rate limiting (100 requests/minute)

for i in {1..105}; do
  echo "Request $i..."
  curl -s -X POST $API_URL/api/v2/policies \
    -H "Content-Type: application/json" \
    -d '{
      "user_address": "'$USER_ADDRESS'",
      "coverage_type": "depeg",
      "chain": "Ethereum",
      "stablecoin": "USDC",
      "coverage_amount": 10000.0,
      "duration_days": 30,
      "payment_token": "USDT",
      "payment_amount": 6.58
    }' | jq -r '.error // "OK"'

  if [ $i -eq 101 ]; then
    echo "Should see 'Rate limit exceeded' above"
  fi
done

# Expected: First 100 succeed, 101+ return 429 Too Many Requests
```

---

## Monitoring & Analytics

### Get All Active Policies

```bash
curl $API_URL/api/v2/risk/exposure | jq '.total_policies'
```

### Get Top 10 Products

```bash
curl $API_URL/api/v2/risk/exposure | jq '.top_10_products'
```

### Get Current APYs

```bash
curl $API_URL/api/v2/tranches/apy | jq '.tranches[] | {tranche: .tranche_id, apy: .apy, utilization: .utilization}'
```

### Get Bridge Alerts

```bash
curl $API_URL/api/v2/risk/alerts | jq '.alerts[] | select(.severity == "Critical")'
```

---

## Tips

1. **Save responses**: Use `| tee response.json` to save responses
2. **Extract fields**: Use `jq -r '.field'` to get specific values
3. **Pretty print**: Add `| jq` to all curl commands for readability
4. **Watch mode**: Use `watch -n 2 'curl -s $API_URL/api/v2/tranches/apy | jq'`
5. **Error handling**: Check `$?` exit code or parse `.error` field

---

## Support

For issues or questions:
- Documentation: https://docs.tonsurance.com
- Telegram: https://t.me/tonsurance
- Email: dev@tonsurance.com
