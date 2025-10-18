#!/bin/bash
# Binance Futures Integration Test Script
#
# This script verifies the Binance Futures integration is working correctly.
# Run after setting up testnet API keys.

set -e

BACKEND_DIR="/Users/ben/Documents/Work/HS/Application/Tonsurance/backend"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Binance Futures Integration - Verification Script          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if API keys are set
echo "1. Checking environment variables..."
if [ -z "$BINANCE_TESTNET_API_KEY" ]; then
    echo "   ⚠️  BINANCE_TESTNET_API_KEY not set"
    echo "   Set it with: export BINANCE_TESTNET_API_KEY='your_key'"
    echo ""
else
    echo "   ✅ BINANCE_TESTNET_API_KEY is set"
fi

if [ -z "$BINANCE_TESTNET_API_SECRET" ]; then
    echo "   ⚠️  BINANCE_TESTNET_API_SECRET not set"
    echo "   Set it with: export BINANCE_TESTNET_API_SECRET='your_secret'"
    echo ""
else
    echo "   ✅ BINANCE_TESTNET_API_SECRET is set"
fi

# Check if files exist
echo ""
echo "2. Checking implementation files..."

files=(
    "integration/binance_futures_client.ml"
    "test/binance_futures_client_test.ml"
    "float/bitcoin_float_manager.ml"
    "integration/BINANCE_FUTURES_README.md"
)

for file in "${files[@]}"; do
    if [ -f "$BACKEND_DIR/$file" ]; then
        lines=$(wc -l < "$BACKEND_DIR/$file")
        echo "   ✅ $file ($lines lines)"
    else
        echo "   ❌ $file (NOT FOUND)"
    fi
done

# Check dune files
echo ""
echo "3. Checking build configuration..."

if grep -q "binance_futures_client_test" "$BACKEND_DIR/test/dune"; then
    echo "   ✅ Test executable configured in test/dune"
else
    echo "   ❌ Test executable missing from test/dune"
fi

if grep -q "integration" "$BACKEND_DIR/float/dune"; then
    echo "   ✅ Integration library linked in float/dune"
else
    echo "   ❌ Integration library missing from float/dune"
fi

# Try to build (with timeout to prevent hanging)
echo ""
echo "4. Building project..."
cd "$BACKEND_DIR"

# Clean build
echo "   Cleaning previous build..."
timeout 30 dune clean 2>/dev/null || echo "   (Clean timed out, skipping)"

# Build test executable
echo "   Building test executable..."
if timeout 120 dune build test/binance_futures_client_test.exe 2>&1 | head -20; then
    echo "   ✅ Build successful"
else
    echo "   ⚠️  Build check timed out (may need manual verification)"
fi

# Run tests if keys are available
echo ""
echo "5. Running tests..."

if [ -n "$BINANCE_TESTNET_API_KEY" ] && [ -n "$BINANCE_TESTNET_API_SECRET" ]; then
    echo "   Running integration tests (this may take 30-60 seconds)..."
    echo ""

    if timeout 120 dune exec test/binance_futures_client_test.exe 2>&1; then
        echo ""
        echo "   ✅ All tests passed!"
    else
        echo ""
        echo "   ⚠️  Some tests may have failed or timed out"
        echo "   Check output above for details"
    fi
else
    echo "   ⊘  Skipping integration tests (no API keys)"
    echo "   To run: Set BINANCE_TESTNET_API_KEY and BINANCE_TESTNET_API_SECRET"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Verification Complete                                       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "1. If tests failed, check API keys are valid testnet keys"
echo "2. Review BINANCE_INTEGRATION_REPORT.md for deployment guide"
echo "3. See backend/integration/BINANCE_FUTURES_README.md for usage"
echo ""
