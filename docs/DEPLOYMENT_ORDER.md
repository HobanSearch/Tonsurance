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

### Phase 1: Core Infrastructure

#### 1. Deploy Treasury
```bash
npx blueprint run deployTreasury
```
**Save:** `VITE_TREASURY_ADDRESS`

#### 2. Deploy MultiTrancheVault
```bash
npx blueprint run deployMultiTrancheVault
```
**Inputs required:**
- adminAddress: Your admin wallet address.

**Save:** `VITE_MULTI_TRANCHE_VAULT_ADDRESS`

### Phase 2: Premium Distribution

#### 3. Deploy SimplePremiumDistributor
```bash
npx blueprint run deploySimplePremiumDistributor
```
**Inputs required:**
- multiTrancheVaultAddress: [Use address from step 2]
- protocolTreasuryAddress: [Use Treasury address from step 1]
- reserveFundAddress: [Use Treasury address from step 1] (can be same)

**Save:** `VITE_PREMIUM_DISTRIBUTOR_ADDRESS`

### Phase 3: Claims & Policy Contracts

#### 4. Deploy ClaimsProcessor
```bash
npx blueprint run deployClaimsProcessor
```
**Inputs required:**
- treasuryAddress: [Use address from step 1]
- multiTrancheVaultAddress: [Use address from step 2]

**Save:** `VITE_CLAIMS_PROCESSOR_ADDRESS`

#### 5. Deploy PolicyFactory
```bash
npx blueprint run deployPolicyFactory
```
**Inputs required:**
- treasuryAddress: [Use address from step 1]
- claimsProcessorAddress: [Use address from step 4]

**Save:** `VITE_POLICY_FACTORY_ADDRESS`

### Post-Deployment Configuration

#### 1. Update Frontend Environment Variables

Edit `/frontend/.env` with all deployed addresses:

```env
VITE_TON_NETWORK=testnet
VITE_TON_API_ENDPOINT=https://testnet.toncenter.com/api/v2/jsonRPC

# Core Contracts
VITE_POLICY_FACTORY_ADDRESS=<from step 5>
VITE_CLAIMS_PROCESSOR_ADDRESS=<from step 4>
VITE_MULTI_TRANCHE_VAULT_ADDRESS=<from step 2>
VITE_TREASURY_ADDRESS=<from step 1>
```

#### 2. Update Contract References

Use the admin functions on the deployed contracts to set the final addresses. For example, call `sendSetClaimsProcessor` on the `MultiTrancheVault` contract, passing it the address of the `ClaimsProcessor`.
