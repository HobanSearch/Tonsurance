#!/bin/bash

# Test script for API v2 endpoints
# Usage: ./test_api_v2.sh

API_BASE="http://localhost:8080"

echo "========================================="
echo "Tonsurance API v2 Test Suite"
echo "========================================="
echo ""

# Test 1: Health check
echo "1. Testing health endpoint..."
curl -s "$API_BASE/health" | jq '.'
echo ""

# Test 2: Multi-dimensional quote
echo "2. Testing multi-dimensional quote endpoint..."
curl -s -X POST "$API_BASE/api/v2/quote/multi-dimensional" \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "coverage_amount": 10000,
    "duration_days": 90
  }' | jq '.'
echo ""

# Test 3: Another quote with different parameters
echo "3. Testing CEX liquidation quote on TON..."
curl -s -X POST "$API_BASE/api/v2/quote/multi-dimensional" \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "cex_liquidation",
    "chain": "TON",
    "stablecoin": "USDT",
    "coverage_amount": 50000,
    "duration_days": 30
  }' | jq '.'
echo ""

# Test 4: Bridge coverage quote
echo "4. Testing bridge exploit quote on Arbitrum..."
curl -s -X POST "$API_BASE/api/v2/quote/multi-dimensional" \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "bridge",
    "chain": "Arbitrum",
    "stablecoin": "USDC",
    "coverage_amount": 25000,
    "duration_days": 60
  }' | jq '.'
echo ""

# Test 5: Risk exposure aggregation
echo "5. Testing risk exposure endpoint..."
curl -s "$API_BASE/api/v2/risk/exposure" | jq '.'
echo ""

# Test 6: Bridge health check
echo "6. Testing bridge health endpoint (wormhole_eth_ton)..."
curl -s "$API_BASE/api/v2/bridge-health/wormhole_eth_ton" | jq '.'
echo ""

# Test 7: Risk alerts
echo "7. Testing risk alerts endpoint..."
curl -s "$API_BASE/api/v2/risk/alerts" | jq '.'
echo ""

# Test 8: Risk alerts filtered by severity
echo "8. Testing risk alerts filtered by severity=Critical..."
curl -s "$API_BASE/api/v2/risk/alerts?severity=Critical" | jq '.'
echo ""

# Test 9: Tranche APY
echo "9. Testing tranche APY endpoint..."
curl -s "$API_BASE/api/v2/tranches/apy" | jq '.'
echo ""

echo "========================================="
echo "All tests completed!"
echo "========================================="
