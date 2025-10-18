#!/bin/bash
set -e

echo "🔧 Updating frontend/.env with deployed addresses..."
echo ""

if [ ! -f frontend/.env.deployment ]; then
  echo "❌ frontend/.env.deployment not found"
  echo "   Run deployment scripts first"
  exit 1
fi

# Backup existing .env
if [ -f frontend/.env ]; then
  BACKUP_FILE="frontend/.env.backup-$(date +%Y%m%d-%H%M%S)"
  cp frontend/.env "$BACKUP_FILE"
  echo "📦 Backed up existing .env to $BACKUP_FILE"
fi

# Read deployed addresses
source frontend/.env.deployment

# Update .env file (preserve existing settings)
if [ -f frontend/.env ]; then
  # Update existing addresses or add new ones
  sed -i.tmp "s|^VITE_MULTI_TRANCHE_VAULT_ADDRESS=.*|VITE_MULTI_TRANCHE_VAULT_ADDRESS=$VITE_MULTI_TRANCHE_VAULT_ADDRESS|" frontend/.env
  sed -i.tmp "s|^VITE_DYNAMIC_PRICING_ORACLE_ADDRESS=.*|VITE_DYNAMIC_PRICING_ORACLE_ADDRESS=$VITE_DYNAMIC_PRICING_ORACLE_ADDRESS|" frontend/.env
  sed -i.tmp "s|^VITE_POLICY_FACTORY_ADDRESS=.*|VITE_POLICY_FACTORY_ADDRESS=$VITE_POLICY_FACTORY_ADDRESS|" frontend/.env
  sed -i.tmp "s|^VITE_CLAIMS_PROCESSOR_ADDRESS=.*|VITE_CLAIMS_PROCESSOR_ADDRESS=$VITE_CLAIMS_PROCESSOR_ADDRESS|" frontend/.env

  if [ -n "$VITE_POLICY_ROUTER_ADDRESS" ]; then
    sed -i.tmp "s|^VITE_POLICY_ROUTER_ADDRESS=.*|VITE_POLICY_ROUTER_ADDRESS=$VITE_POLICY_ROUTER_ADDRESS|" frontend/.env
  fi

  rm frontend/.env.tmp
else
  # Create new .env from deployment
  cp frontend/.env.deployment frontend/.env
fi

echo "✅ frontend/.env updated with deployed addresses"
echo ""
echo "Deployed addresses:"
echo "  MultiTrancheVault:      $VITE_MULTI_TRANCHE_VAULT_ADDRESS"
echo "  DynamicPricingOracle:   $VITE_DYNAMIC_PRICING_ORACLE_ADDRESS"
echo "  PolicyFactory:          $VITE_POLICY_FACTORY_ADDRESS"
echo "  ClaimsProcessor:        $VITE_CLAIMS_PROCESSOR_ADDRESS"

if [ -n "$VITE_POLICY_ROUTER_ADDRESS" ]; then
  echo "  PolicyRouter:           $VITE_POLICY_ROUTER_ADDRESS"
fi

echo ""
echo "⚠️  Restart frontend for changes to take effect:"
echo "   cd frontend && npm run dev"
