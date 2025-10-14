# Contract Deployment Order

This guide explains the correct order to deploy Tonsurance smart contracts, including their dependencies.

## Prerequisites

1. Ensure you're in the correct directory:
   ```bash
   cd /Users/ben/Documents/Work/HS/Application/Tonsurance/Tonsurance
   ```

2. Compile all contracts:
   ```bash
   npx blueprint build
   ```

3. Have testnet TON ready in your deployer wallet (minimum ~1 TON for all deployments)

## Deployment Sequence

### Phase 0: Utility Tokens (Optional)
If you need test tokens:
```bash
npx blueprint run
# Select: deployToken
```
Save the address for testing purposes.

---

### Phase 1: Core Infrastructure (No Dependencies)

#### 1. Deploy Treasury
```bash
npx blueprint run
# Select: deployTreasury
```
**Inputs required:**
- ClaimsProcessor address: Use placeholder (e.g., `EQD0...0000`) - will update later
- PremiumDistributor address: Use placeholder - will update later
- StakingPool address: Use placeholder - will update later

**Save:** `VITE_TREASURY_ADDRESS`

---

### Phase 2: Vault System

#### 2. Deploy PrimaryVault
```bash
npx blueprint run
# Select: deployPrimaryVault
```
**Inputs required:**
- ClaimsProcessor address: Use placeholder - will update later
- Max supply: `1000000` (1M TON)
- Minimum price: `0.8` (0.8 TON)
- Maximum price: `1.2` (1.2 TON)

**Save:** `VITE_PRIMARY_VAULT_ADDRESS`

#### 3. Deploy SecondaryVault
```bash
npx blueprint run
# Select: deploySecondaryVault
```
**Inputs required:**
- ClaimsProcessor address: Use placeholder - will update later
- Max supply: `500000`
- Minimum price: `800000000` (0.8 TON in nanotons)
- Maximum price: `1200000000` (1.2 TON in nanotons)

**Save:** `VITE_SECONDARY_VAULT_ADDRESS`

#### 4. Deploy TradFiBuffer
```bash
npx blueprint run
# Select: deployTradFiBuffer
```
**Inputs required:**
- ComplianceGateway address: Use placeholder or actual if available
- ShieldInstToken address: Use placeholder or actual if available
- PremiumDistributor address: Use placeholder - will update later
- Minimum deposit: `250000` (250k TON minimum)
- Lock period: `180` (180 days)
- Min APY: `520` (5.2% in basis points)
- Max APY: `800` (8.0% in basis points)

**Save:** `VITE_TRADFI_BUFFER_ADDRESS`

---

### Phase 3: Premium Distribution

#### 5. Deploy SimplePremiumDistributor
```bash
npx blueprint run
# Select: deploySimplePremiumDistributor
```
**Inputs required:**
- PrimaryVault address: [Use address from step 2]
- SecondaryVault address: [Use address from step 3]
- ProtocolTreasury address: [Use Treasury address from step 1]
- ReserveFund address: [Use Treasury address from step 1] (can be same)

**Save:** `VITE_PREMIUM_DISTRIBUTOR_ADDRESS`

---

### Phase 4: Claims & Pricing (Phase 1-3)

#### 6. Deploy PricingOracle (if not deployed)
```bash
npx blueprint run
# Select: deployPricingOracle
```
**Save:** `VITE_PRICING_ORACLE_ADDRESS`

#### 7. Deploy ClaimsProcessor
```bash
npx blueprint run
# Select: deployClaimsProcessor
```
**Inputs required:**
- Treasury address: [Use address from step 1]
- PrimaryVault address: [Use address from step 2]
- SecondaryVault address: [Use address from step 3]
- TradFiBuffer address: [Use address from step 4]
- PriceOracle address: [Use address from step 6]
- Auto-approval threshold: `500` (5% in basis points)

**Save:** `VITE_CLAIMS_PROCESSOR_ADDRESS`

---

### Phase 5: Policy Factory

#### 8. Deploy PolicyFactory
```bash
npx blueprint run
# Select: deployPolicyFactory
```
**Inputs required:**
- Treasury address: [Use address from step 1]

**Save:** `VITE_POLICY_FACTORY_ADDRESS`

---

### Phase 6: Hedged Insurance (Phase 4) - Optional

#### 9. Deploy HedgeCoordinator (if needed)
```bash
npx blueprint run
# Select: deployHedgeCoordinator
```
**Save:** `VITE_HEDGE_COORDINATOR_ADDRESS`

#### 10. Deploy HedgedPolicyFactory (if needed)
```bash
npx blueprint run
# Select: deployHedgedPolicyFactory
```
**Inputs required:**
- PricingOracle address: [Use address from step 6]
- HedgeCoordinator address: [Use address from step 9]
- ReserveVault address: [Use Treasury address from step 1]

**Save:** `VITE_HEDGED_POLICY_FACTORY_ADDRESS`

---

## Post-Deployment Configuration

### 1. Update Frontend Environment Variables

Edit `/frontend/.env` with all deployed addresses:

```env
VITE_TON_NETWORK=testnet
VITE_TON_API_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC
VITE_TON_API_KEY=

# Core Contracts (Phase 1-3)
VITE_POLICY_FACTORY_ADDRESS=<from step 8>
VITE_PRIMARY_VAULT_ADDRESS=<from step 2>
VITE_SECONDARY_VAULT_ADDRESS=<from step 3>
VITE_TRADFI_BUFFER_ADDRESS=<from step 4>
VITE_CLAIMS_PROCESSOR_ADDRESS=<from step 7>
VITE_PRICING_ORACLE_ADDRESS=<from step 6>
VITE_TREASURY_ADDRESS=<from step 1>
VITE_PREMIUM_DISTRIBUTOR_ADDRESS=<from step 5>

# Hedged Insurance (Phase 4) - Optional
VITE_HEDGE_COORDINATOR_ADDRESS=<from step 9>
VITE_HEDGED_POLICY_FACTORY_ADDRESS=<from step 10>
VITE_SURE_TOKEN_ADDRESS=<if deployed>
```

### 2. Update Contract References (Important!)

Some contracts were deployed with placeholder addresses. You need to update them:

**Option A: Re-deploy affected contracts** (Recommended)
- Re-deploy Treasury with real ClaimsProcessor and PremiumDistributor addresses
- Re-deploy vaults with real ClaimsProcessor address
- Re-deploy TradFiBuffer with real PremiumDistributor address

**Option B: Admin update functions** (if contracts support it)
- Use admin functions to update dependent contract addresses
- Check each contract's wrapper for `sendUpdateAddress` or similar methods

### 3. Test the Deployment

```bash
cd frontend
npm run dev
```

Open http://localhost:5173 and verify:
- ✅ Contract addresses are configured (check browser console)
- ✅ Analytics page shows TVL data
- ✅ Can request premium quotes
- ✅ Wallet connects successfully

---

## Deployment Checklist

- [ ] All contracts compiled successfully
- [ ] Treasury deployed
- [ ] All 3 vaults deployed (Primary, Secondary, TradFi)
- [ ] PremiumDistributor deployed
- [ ] PricingOracle deployed
- [ ] ClaimsProcessor deployed
- [ ] PolicyFactory deployed
- [ ] All addresses saved to `/frontend/.env`
- [ ] Placeholder addresses updated (if needed)
- [ ] Frontend connects to contracts
- [ ] Can fetch TVL and policy data

---

## Troubleshooting

### "Contract not found" errors
- Ensure contract is fully deployed (wait 1-2 minutes after deployment)
- Check transaction on testnet explorer
- Verify address is correct in `.env`

### "Insufficient funds" during deployment
- Each deployment costs ~0.05 TON + gas
- Ensure deployer wallet has at least 1 TON

### Frontend shows "Contracts not configured"
- Check all addresses in `/frontend/.env` start with `EQ` (testnet)
- Restart frontend dev server after updating `.env`
- Clear browser cache if needed

### Contract method calls fail
- Some contracts may need to be re-deployed with real addresses instead of placeholders
- Check contract is not paused (if applicable)
- Ensure caller has proper permissions

---

## Network Information

**Testnet:**
- Endpoint: https://testnet.toncenter.com/api/v2/jsonRPC
- Explorer: https://testnet.tonscan.org
- Faucet: https://t.me/testgiver_ton_bot

**Mainnet** (when ready):
- Endpoint: https://toncenter.com/api/v2/jsonRPC
- Explorer: https://tonscan.org
- Use multi-sig for admin operations
