# Vault Return Profiles & Product Angles

**Status**: Design Document - Flexible Architecture
**Purpose**: Define multiple vault strategies and product variations beyond single tranche model

---

## Core Insight: One-Size-Fits-All Doesn't Work

Traditional approach:
```
Single vault → Single return profile → Limited appeal
```

Tonsurance approach:
```
Multiple vault strategies → Different risk/return → Broad market appeal
```

---

## Vault Return Profile Categories

### 1. **Fixed Return Vaults** (Conservative)

**Profile**: Guaranteed or target fixed APY
**Risk**: Low to medium
**Target Customer**: Risk-averse, retirees, institutions

#### Variants:

**A. Stablecoin Yield Vault**
```
Strategy: Lend USDC/USDT to DeFi protocols + write insurance
Target Return: 8-12% APY (fixed)
Risk Profile: Low (senior tranche, minimal insurance exposure)
Capital Allocation:
  - 70% Stablecoin lending (Aave, Compound)
  - 20% Insurance underwriting (senior risk only)
  - 10% Emergency reserves
```

**B. Bitcoin Covered Call Vault**
```
Strategy: Hold BTC + sell covered calls + write insurance
Target Return: 15-20% APY on USD value
Risk Profile: Medium (BTC volatility offset by premium income)
Capital Allocation:
  - 80% BTC holdings
  - 20% Option premium income → Insurance underwriting
Innovation: Sells BTC calls to fund insurance, creating hedged position
```

**C. RWA-Backed Insurance Vault**
```
Strategy: Treasury bonds + corporate bonds + insurance underwriting
Target Return: 6-9% APY (very stable)
Risk Profile: Very low (government-backed)
Capital Allocation:
  - 60% US Treasury bonds (4-5% yield)
  - 30% Investment-grade corporate bonds (5-6%)
  - 10% Insurance underwriting (AAA-rated only)
Target: Pension funds, endowments, family offices
```

---

### 2. **Variable Return Vaults** (Opportunistic)

**Profile**: Returns fluctuate based on market conditions
**Risk**: Medium to high
**Target Customer**: Active investors, hedge funds, DAOs

#### Variants:

**A. Dynamic Premium Vault**
```
Strategy: Adjust insurance pricing based on volatility
High Volatility Period: 30-50% APY (premiums spike)
Low Volatility Period: 10-15% APY (fewer claims)
Risk Profile: Medium-high (concentrated insurance exposure)

Example Returns:
  Q1 2023 (SVB crisis): 45% APY (high premiums, payouts)
  Q2 2023 (calm): 12% APY (low premiums)
  Q3 2023 (volatility): 28% APY
```

**B. Natural Hedge Vault** (From previous design)
```
Strategy: Junior tranche, first loss, highest yield
Target Return: 20-40% APY (highly variable)
Risk Profile: High (absorbs all losses first)
Capital Allocation:
  - 100% Insurance underwriting (all asset types)
  - 0% reserves (relies on portfolio diversification)
Unique: For sophisticated investors who understand tail risk
```

**C. Arbitrage Vault**
```
Strategy: Exploit mispricings between insurance and options markets
Return: Variable, 15-60% APY depending on opportunities
Example Trade:
  - USDC put option (exchange): $0.97 strike, 5% premium
  - Tonsurance insurance: $0.97 trigger, 4% premium
  - Arbitrage: Buy insurance, sell put → 1% spread
```

---

### 3. **Hybrid Return Vaults** (Balanced)

**Profile**: Mix of fixed + variable components
**Risk**: Medium
**Target Customer**: Most retail investors

#### Variants:

**A. 80/20 Vault**
```
Fixed Component (80%): 8% APY guaranteed
Variable Component (20%): 0-40% APY based on performance
Expected Blended Return: 10-14% APY
Structure:
  - 80% capital → Senior tranche (fixed 8%)
  - 20% capital → Junior tranche (variable)
Psychology: Downside protected, upside participation
```

**B. Capital Protected Vault**
```
Fixed Component: 100% principal protection
Variable Component: All upside from premiums
Minimum Return: 0% (capital guaranteed)
Expected Return: 8-15% APY
Structure:
  - 95% in zero-coupon bonds (mature to 100%)
  - 5% in high-risk insurance (can go to zero)
  - If 5% grows 3x, total return = 15%
Target: Very risk-averse but yield-seeking
```

**C. Lifecycle Vault**
```
Strategy: Return profile changes over time
Year 1-2: 15-20% APY (aggressive, junior exposure)
Year 3-4: 12-15% APY (balanced)
Year 5+: 8-10% APY (conservative, senior)
Target: Set-and-forget investors
Rationale: Harvest risk premium early, compound into safety
```

---

### 4. **Exotic Return Vaults** (Specialized)

**Profile**: Unique strategies for niche use cases
**Risk**: Varies
**Target Customer**: Specialized investors, DAOs, protocols

#### Variants:

**A. Stablecoin Diversification Vault**
```
Strategy: Hold basket of stablecoins, insure each other
Holdings: 25% USDC, 25% USDT, 25% DAI, 25% FRAX
Insurance: Each coin insures the others
Return: 6-10% APY + cross-protection
Unique: If USDC depegs → USDT/DAI/FRAX holders get payout
        If USDT depegs → Others pay out
Net effect: Smooths volatility, maintains $1.00 basket value
```

**B. Protocol Treasury Vault**
```
Strategy: DAOs deposit treasury, earn yield + get protection
Example: Curve DAO deposits 3crv
  - Earns 8% base yield from insurance premiums
  - Gets depeg protection on holdings
  - Can withdraw anytime (liquid)
Target: 100+ DAOs with $5B+ combined treasuries
Moat: Only insurance product built for protocol treasuries
```

**C. Merchant Acceptance Vault**
```
Strategy: Merchants accept stablecoins with auto-insurance
Flow:
  1. Merchant accepts $10k USDC payment
  2. Tonsurance auto-insures for 0.5% ($50)
  3. If USDC depegs within 7 days → payout
  4. Merchant gets guaranteed $10k value
Return (for LPs): 20-30% APY from merchant fees
Market: $5T annual merchant payments entering crypto
```

**D. Cross-Chain Vault**
```
Strategy: Insure bridge risk + stablecoin risk simultaneously
Coverage:
  - Bridge failure (Wormhole, Axelar)
  - Stablecoin depeg on destination chain
Return: 25-40% APY (highest risk)
Innovation: First product to insure both risks together
```

---

## Implementation: Modular Vault Factory

### Contract Architecture

```solidity
// Pseudocode (adapt to FunC)

VaultFactory {
    create_vault(
        vault_type: VaultType,
        return_profile: ReturnProfile,
        risk_params: RiskParameters,
        capital_allocation: AllocationStrategy
    ) → VaultContract
}

VaultType =
    | FixedReturn
    | VariableReturn
    | HybridReturn
    | ExoticStrategy

ReturnProfile = {
    target_apy: float,
    volatility: float,
    downside_protection: bool,
    upside_cap: float option,
}

RiskParameters = {
    max_ltv: float,
    stress_test_threshold: float,
    reserve_ratio: float,
    diversification_limits: AssetLimits,
}

AllocationStrategy = {
    tranches: Tranche list,
    rebalance_frequency: Duration,
    hedging_strategy: HedgeType,
}
```

### Vault Configuration Examples

**Conservative Fixed Vault:**
```ocaml
{
  vault_type = FixedReturn;
  return_profile = {
    target_apy = 0.08;
    volatility = 0.02;
    downside_protection = true;
    upside_cap = Some 0.12;
  };
  risk_params = {
    max_ltv = 0.50;
    stress_test_threshold = 0.95;
    reserve_ratio = 0.25;
    diversification_limits = { max_single_asset = 0.30 };
  };
  allocation = {
    tranches = [Senior(0.80); Mezzanine(0.20)];
    rebalance_frequency = Weekly;
    hedging_strategy = ConservativeHedge;
  };
}
```

**Aggressive Variable Vault:**
```ocaml
{
  vault_type = VariableReturn;
  return_profile = {
    target_apy = 0.25;
    volatility = 0.15;
    downside_protection = false;
    upside_cap = None;
  };
  risk_params = {
    max_ltv = 0.90;
    stress_test_threshold = 0.80;
    reserve_ratio = 0.10;
    diversification_limits = { max_single_asset = 0.50 };
  };
  allocation = {
    tranches = [Junior(1.0)];
    rebalance_frequency = Daily;
    hedging_strategy = NoHedge;
  };
}
```

---

## Product Angles Beyond Return Profiles

### 1. **Industry-Specific Products**

**A. DeFi Protocol Insurance**
```
Target: Aave, Compound, Curve, Uniswap
Coverage: Smart contract risk + stablecoin depeg
Bundle: Protocol covers users automatically
Pricing: 2-3% of TVL annually
Market: $50B DeFi TVL × 2% = $1B annual premiums
```

**B. Centralized Exchange Insurance**
```
Target: Binance, Coinbase, Kraken users
Coverage: Exchange insolvency + stablecoin depeg
Distribution: White-label through exchange
Pricing: 1-2% of deposits
Market: $100B CEX stablecoin deposits
```

**C. Corporate Treasury Protection**
```
Target: MicroStrategy, Tesla, Square (companies holding crypto)
Coverage: BTC volatility + stablecoin exposure
Term: 12-36 months (longer than retail)
Pricing: Custom, $1M+ policies
Market: $10B+ corporate crypto treasuries
```

### 2. **Geographic-Specific Products**

**A. Emerging Market Remittances**
```
Target: Philippines, Mexico, Nigeria
Problem: $50 sent → $48 received (2-4% depeg risk)
Solution: Auto-insure remittances for 0.5%
Distribution: Partner with Wise, Remitly
Market: $700B annual remittances
```

**B. Stablecoin Savings Accounts**
```
Target: Argentina, Turkey, Lebanon (high inflation)
Product: USDC savings with depeg protection
Yield: 6-8% APY guaranteed
Distribution: Telegram bot, WhatsApp
Market: 3B people in high-inflation countries
```

### 3. **Time-Based Products**

**A. Flash Insurance**
```
Duration: 1-24 hours
Use case: Large stablecoin transfer (M&A, real estate)
Pricing: 0.1-0.5% per day
Example: $10M USDC transfer → $5k insurance for 1 day
```

**B. Event-Driven Insurance**
```
Duration: Specific event window
Example: "Insure USDC during Fed announcement"
Trigger: FOMC meeting → 48 hour coverage
Pricing: 2-5x normal (high volatility period)
```

**C. Perpetual Insurance**
```
Duration: Forever (until cancelled)
Pricing: Monthly subscription (0.5% per month)
Auto-renew: Yes
Target: Long-term stablecoin holders
```

### 4. **Composable Products**

**A. Leveraged Yield + Insurance**
```
Strategy:
  1. Deposit $100k USDC
  2. Borrow $200k against it (3x leverage)
  3. Earn 10% on $300k = $30k yield
  4. Insurance protects collateral from depeg
Net: 30% APY with protection
Risk: Liquidation if USDC depegs AND borrowed asset rises
```

**B. Options + Insurance Bundle**
```
Product: Sell USDC put options + buy depeg insurance
Effect:
  - Earn premium from selling puts
  - Protected if depeg occurs
  - Net carry positive
Target: Sophisticated traders
```

**C. Staking + Insurance**
```
Product: Stake ETH for 4% + insure stablecoin earnings
Flow:
  1. Stake 32 ETH → earn 1.28 ETH/year
  2. Convert to USDC monthly
  3. Auto-insure USDC against depeg
  4. Net: Protected staking yield
```

---

## Revenue Model Variations

### Traditional Insurance Model (Current)
```
Premium: $1,000
Expected Payout: $400 (40% loss ratio)
Expenses: $100 (10%)
Profit: $500 (50% margin)

LP Return: 15% APY
Protocol Take: 10% of premiums
```

### Freemium Model
```
Free Tier: Up to $1,000 coverage
  - Funded by ads, data, upsells
  - 10M users × $1k = $10B covered

Premium Tier: $1k+ coverage
  - Pay 2-4% premium
  - 100k users × $100k avg = $10B covered

Total: 10.1M users, $20B coverage
```

### Subscription Model
```
Monthly: $10/month for $10k coverage
Annual: $100/year (2 months free)

Revenue: 1M subscribers × $100 = $100M/year
Coverage: $10B
Claims: $30M (30% payout ratio)
Profit: $70M
LP Return: Distribute $50M to LPs = 20% APY on $250M TVL
```

### B2B SaaS Model
```
Charge protocols per integration:
  - Setup: $50k one-time
  - Monthly: $5k + 0.1% of coverage sold

20 protocols × $50k = $1M setup
20 protocols × $10M covered × 0.1% = $200k/month
Annual: $1M + $2.4M = $3.4M pure profit
```

---

## Implementation Priority

### Phase 1 (Months 1-3): Core Products
1. Fixed Return Senior Vault (8-10% APY)
2. Variable Return Junior Vault (15-25% APY)
3. Standard stablecoin insurance

### Phase 2 (Months 4-6): Hybrid Products
1. 80/20 Hybrid Vault
2. Capital Protected Vault
3. Protocol Treasury Vault

### Phase 3 (Months 7-9): Exotic Products
1. Cross-chain insurance
2. Flash insurance
3. Merchant acceptance vault

### Phase 4 (Months 10-12): Specialized
1. Geographic-specific (remittances)
2. Industry-specific (DeFi protocol bundles)
3. Leveraged products

---

## Key Decisions Needed

1. **Initial Vault Mix**: How many vault types at launch?
   - Recommendation: 2-3 (Senior, Junior, Hybrid)

2. **Return Profile Flexibility**: Fixed APY or variable?
   - Recommendation: Variable with target range (more honest)

3. **Capital Efficiency**: Can same capital back multiple vaults?
   - Recommendation: Yes, with correlation limits

4. **Product-Market Fit**: Which customer segment first?
   - Recommendation: DeFi protocols (distribution + volume)

5. **Pricing Strategy**: Race to bottom or premium positioning?
   - Recommendation: Premium (better service, more features)

---

## Next Steps

1. Choose 2-3 initial vault profiles
2. Implement VaultFactory contract
3. Build actuarial models for each profile
4. Design LP token mechanics (separate per vault?)
5. Create vault performance dashboard
6. Test different return profiles with beta users

**Questions to resolve:**
- Should we allow users to create custom vaults?
- What's the minimum TVL per vault?
- How to prevent vault proliferation (too many choices)?
- Should vaults be upgradeable or immutable?
- How to migrate capital between vault strategies?

---

**This document provides the framework for flexible vault design. Next: implement the first 2-3 vaults and test with real capital allocation.**
