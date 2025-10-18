#!/bin/bash
set -e

echo "🔍 Verifying contract compilation..."

# Build all contracts
npx blueprint build

# Check for compilation errors
if [ $? -eq 0 ]; then
  echo "✅ All contracts compiled successfully"
else
  echo "❌ Compilation failed"
  exit 1
fi

# List compiled contracts
echo ""
echo "📦 Compiled Contracts:"
ls -lh build/*.compiled.json 2>/dev/null | awk '{print $9, $5}' || echo "No compiled contracts found in build/"

echo ""
echo "✅ Ready for deployment"
