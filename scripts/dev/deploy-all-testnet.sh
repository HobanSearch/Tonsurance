#!/bin/bash
set -e

echo "🚀 Tonsurance Testnet Deployment Guide"
echo "======================================"
echo ""

# Check if deployment wallet exists
if [ ! -f .env.deployment ]; then
  echo "❌ .env.deployment not found"
  echo ""
  echo "First, create a deployment wallet:"
  echo "  npx ts-node scripts/dev/create-testnet-wallet.ts"
  echo ""
  echo "Then fund it with testnet TON:"
  echo "  https://t.me/testgiver_ton_bot"
  echo "  or https://faucet.toncoin.org/"
  echo ""
  exit 1
fi

source .env.deployment

echo "📋 Deployment Wallet: $DEPLOYMENT_ADDRESS"
echo ""
echo "⚠️  IMPORTANT: Make sure your wallet has at least 100 TON for deployment"
echo ""
read -p "Continue with deployment? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Deployment cancelled"
  exit 1
fi

# Create deployment log
mkdir -p logs
DEPLOY_LOG="logs/deployment-$(date +%Y%m%d-%H%M%S).log"
echo "📝 Logging to $DEPLOY_LOG"
echo ""

# Step 1: Compile all contracts
echo "========================================="
echo "Step 1: Compiling all contracts"
echo "========================================="
npx blueprint build | tee -a $DEPLOY_LOG
echo ""
echo "✅ Compilation complete"
echo ""

# Step 2: Deploy MultiTrancheVault
echo "========================================="
echo "Step 2: Deploy MultiTrancheVault + SURE Tokens"
echo "========================================="
echo "This will deploy:"
echo "  - MultiTrancheVault contract"
echo "  - 6 SURE token contracts (BTC, SNR, MEZZ, JNR, JNR+, EQT)"
echo ""
echo "Estimated cost: ~4 TON"
echo "Estimated time: ~10-15 minutes"
echo ""
read -p "Deploy MultiTrancheVault? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx blueprint run deployMultiTrancheVault --testnet 2>&1 | tee -a $DEPLOY_LOG
  echo ""
  echo "Please enter the deployed MultiTrancheVault address:"
  read VAULT_ADDRESS
  echo "VAULT_ADDRESS=$VAULT_ADDRESS" >> $DEPLOY_LOG
else
  echo "Skipping MultiTrancheVault deployment"
  echo "Please enter existing MultiTrancheVault address:"
  read VAULT_ADDRESS
fi
echo ""

# Step 3: Deploy DynamicPricingOracle
echo "========================================="
echo "Step 3: Deploy DynamicPricingOracle"
echo "========================================="
echo "This will deploy the pricing oracle for dynamic premium calculation"
echo ""
echo "Estimated cost: ~0.5 TON"
echo "Estimated time: ~5 minutes"
echo ""
read -p "Deploy DynamicPricingOracle? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx blueprint run deployPricingOracle --testnet 2>&1 | tee -a $DEPLOY_LOG
  echo ""
  echo "Please enter the deployed DynamicPricingOracle address:"
  read ORACLE_ADDRESS
  echo "ORACLE_ADDRESS=$ORACLE_ADDRESS" >> $DEPLOY_LOG
else
  echo "Skipping DynamicPricingOracle deployment"
  echo "Please enter existing DynamicPricingOracle address:"
  read ORACLE_ADDRESS
fi
echo ""

# Step 4: Deploy PolicyFactory & ClaimsProcessor
echo "========================================="
echo "Step 4: Deploy PolicyFactory & ClaimsProcessor"
echo "========================================="
echo "This will deploy the core insurance contracts"
echo ""
echo "Estimated cost: ~1 TON"
echo "Estimated time: ~5 minutes"
echo ""
read -p "Deploy PolicyFactory & ClaimsProcessor? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx blueprint run deployPolicyFactory --testnet 2>&1 | tee -a $DEPLOY_LOG
  echo ""
  echo "Please enter the deployed PolicyFactory address:"
  read FACTORY_ADDRESS
  echo "Please enter the deployed ClaimsProcessor address:"
  read CLAIMS_ADDRESS
  echo "FACTORY_ADDRESS=$FACTORY_ADDRESS" >> $DEPLOY_LOG
  echo "CLAIMS_ADDRESS=$CLAIMS_ADDRESS" >> $DEPLOY_LOG
else
  echo "Skipping PolicyFactory deployment"
  echo "Please enter existing PolicyFactory address:"
  read FACTORY_ADDRESS
  echo "Please enter existing ClaimsProcessor address:"
  read CLAIMS_ADDRESS
fi
echo ""

# Step 5: Deploy PolicyRouter + Shards (OPTIONAL)
echo "========================================="
echo "Step 5: Deploy PolicyRouter + 256 Shards (OPTIONAL)"
echo "========================================="
echo "⚠️  WARNING: This is expensive and time-consuming"
echo "  - Cost: ~77 TON"
echo "  - Time: ~20-25 minutes"
echo "  - Only needed for production scale (100k+ policies)"
echo ""
echo "For testing, you can skip this and use PolicyFactory directly"
echo ""
read -p "Deploy PolicyRouter + Shards? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  npx blueprint run deployPolicySharding --testnet 2>&1 | tee -a $DEPLOY_LOG
  echo ""
  echo "Please enter the deployed PolicyRouter address:"
  read ROUTER_ADDRESS
  echo "ROUTER_ADDRESS=$ROUTER_ADDRESS" >> $DEPLOY_LOG
else
  echo "Skipping PolicyRouter deployment"
  ROUTER_ADDRESS=""
fi
echo ""

# Step 6: Generate .env file
echo "========================================="
echo "Step 6: Generating frontend/.env update"
echo "========================================="

cat > frontend/.env.deployment <<EOF
# Deployed Contract Addresses - $(date)
# Generated by deploy-all-testnet.sh

VITE_MULTI_TRANCHE_VAULT_ADDRESS=$VAULT_ADDRESS
VITE_DYNAMIC_PRICING_ORACLE_ADDRESS=$ORACLE_ADDRESS
VITE_POLICY_FACTORY_ADDRESS=$FACTORY_ADDRESS
VITE_CLAIMS_PROCESSOR_ADDRESS=$CLAIMS_ADDRESS
EOF

if [ -n "$ROUTER_ADDRESS" ]; then
  echo "VITE_POLICY_ROUTER_ADDRESS=$ROUTER_ADDRESS" >> frontend/.env.deployment
fi

echo ""
echo "✅ Configuration saved to frontend/.env.deployment"
echo ""

# Summary
echo "========================================="
echo "📋 Deployment Summary"
echo "========================================="
echo ""
echo "Deployed Contracts:"
echo "  MultiTrancheVault:      $VAULT_ADDRESS"
echo "  DynamicPricingOracle:   $ORACLE_ADDRESS"
echo "  PolicyFactory:          $FACTORY_ADDRESS"
echo "  ClaimsProcessor:        $CLAIMS_ADDRESS"
if [ -n "$ROUTER_ADDRESS" ]; then
  echo "  PolicyRouter:           $ROUTER_ADDRESS"
fi
echo ""
echo "Testnet Explorer:"
echo "  https://testnet.tonscan.org/address/$VAULT_ADDRESS"
echo "  https://testnet.tonscan.org/address/$ORACLE_ADDRESS"
echo "  https://testnet.tonscan.org/address/$FACTORY_ADDRESS"
echo "  https://testnet.tonscan.org/address/$CLAIMS_ADDRESS"
echo ""
echo "Next steps:"
echo "  1. Verify contracts on testnet.tonscan.org"
echo "  2. Update frontend/.env:"
echo "       cat frontend/.env.deployment >> frontend/.env"
echo "  3. Run verification script:"
echo "       npx ts-node scripts/dev/verify-deployment.ts"
echo "  4. Start frontend:"
echo "       cd frontend && npm run dev"
echo "  5. Test end-to-end integration"
echo ""
echo "Full deployment log: $DEPLOY_LOG"
echo ""
echo "✅ Deployment complete!"
