# Tonsurance Development Plan: Advanced Multi-Party Architecture

**Version:** 2.0
**Last Updated:** October 2025
**Status:** Master Development Roadmap
**Owner:** Engineering Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Evolution](#architecture-evolution)
3. [Phase-by-Phase Roadmap](#phase-by-phase-roadmap)
4. [Development Priorities](#development-priorities)
5. [Resource Allocation](#resource-allocation)
6. [Risk Mitigation](#risk-mitigation)
7. [Success Metrics](#success-metrics)

---

## Executive Summary

This document integrates the **Advanced Multi-Party Collateral Distribution Architecture** into the existing Tonsurance development roadmap. The updated plan phases the implementation to balance speed-to-market with architectural sophistication.

**Key Changes from Original Plan:**

| Aspect | Original Plan | Updated Plan |
|--------|--------------|--------------|
| **Vault Structure** | Single pool | 3-tier tranched vaults |
| **Reward Distribution** | 2-3 parties | 8+ parties (async) |
| **TradFi Integration** | Not planned | Phase 3 priority |
| **Capital Efficiency** | 100% ratio | 200-250% ratio |
| **Launch Timeline** | 3 months | 3 months (MVP same) |
| **Full Features** | 6 months | 12 months |

**Philosophy:** Launch fast with core features, add advanced multi-party distribution and TradFi integration incrementally.

---

## Architecture Evolution

### Phase 1: Simple Pool (Months 1-3)
```
┌────────────────────────────┐
│    Single Insurance Pool    │
│         $1M TVL             │
│    100-150% Ratio           │
└────────────────────────────┘
         │
    Reward Split:
    ├─ LPs: 60%
    ├─ Stakers: 30%
    └─ Protocol: 10%
```

### Phase 2: Multi-Party Distribution (Months 4-6)
```
┌────────────────────────────┐
│   Primary + Secondary       │
│    Vaults ($5M TVL)         │
│    150% Ratio               │
└────────────────────────────┘
         │
    8-Party Distribution:
    ├─ Primary LPs: 45%
    ├─ Secondary Stakers: 20%
    ├─ Referrers: 10%
    ├─ Oracles: 3%
    ├─ Protocol: 7%
    ├─ Governance: 2%
    ├─ Reserve: 3%
    └─ (TradFi: 10% - Phase 3)
```

### Phase 3: Full Tranched System (Months 7-12)
```
┌────────────────────────────────────────┐
│  Primary + Secondary + TradFi Buffer   │
│           $50M TVL                     │
│        200-250% Ratio                  │
└────────────────────────────────────────┘
         │
    Full Distribution:
    ├─ Primary LPs: 45%
    ├─ Secondary Stakers: 20%
    ├─ TradFi Institutions: 10%
    ├─ Referrers: 10%
    ├─ Oracles: 3%
    ├─ Protocol: 7%
    ├─ Governance: 2%
    └─ Reserve: 3%
```

---

## Phase-by-Phase Roadmap

## Phase 1: Core Foundation (Months 1-3)

### Goals
- ✅ Launch MVP with basic insurance functionality
- ✅ Achieve product-market fit
- ✅ Reach $1M TVL, 1,000 policies

### Smart Contracts

#### 1.1 PolicyFactory (Enhanced)
**Original + New Features:**
```func
// ORIGINAL (keep):
- create_policy()
- calculate_premium()
- get_user_policies()

// NEW (add):
- set_vault_addresses()  // Support vault system
- route_premium()         // Route to vault instead of single pool
```

**Changes to Original:**
- Premium now routed to Primary Vault instead of single pool
- Add vault address storage

**Implementation Priority:** P0 (Week 1-2)

---

#### 1.2 Primary Vault (NEW)
**Purpose:** First collateral vault for crypto-native LPs

```func
// contracts/primary_vault.fc

global cell lp_balances;      // address => balance
global int total_lp_capital;
global int accumulated_yield;
global int losses_absorbed;

() deposit_lp_capital(slice depositor, int amount) impure;
() withdraw_lp_capital(slice depositor, int amount) impure;
() receive_premium_share(int amount) impure;
() absorb_claim_loss(int loss_amount) impure;
() distribute_yield_to_lps() impure;

// Get methods
(int, int) get_lp_balance(slice addr) method_id;
int get_vault_apy() method_id;
```

**Key Features:**
- Liquid deposits/withdrawals (no lock-up)
- First-loss tranche
- Highest APY (25-35%)
- SHIELD-LP token issuance (Phase 2)

**Implementation Priority:** P0 (Week 2-3)

---

#### 1.3 Secondary Vault (NEW)
**Purpose:** SURE token staking vault

```func
// contracts/secondary_vault.fc

global cell staker_data;       // address => stake_info
global int total_staked_sure;
global int accumulated_yield;
global int lock_period;

() stake_sure(slice staker, int amount, int duration) impure;
() unstake_sure(slice staker) impure;
() receive_premium_share(int amount) impure;
() absorb_loss_if_needed(int loss_amount) impure;

// Get methods
(int, int, int) get_stake_info(slice addr) method_id;  // amount, yield, unlock_time
```

**Key Features:**
- 90-day lock-up
- Second-loss tranche
- Medium APY (12-18%)
- SHIELD-STAKE token issuance (Phase 2)

**Implementation Priority:** P0 (Week 3-4)

---

#### 1.4 Simple Premium Distributor (NEW)
**Purpose:** Route premiums to 5 parties

```func
// contracts/simple_premium_distributor.fc

// Distribution (Phase 1):
// - Primary LPs: 50%
// - Secondary Stakers: 30%
// - Protocol: 15%
// - Reserve: 5%
// (No referrers, oracles, governance yet)

() distribute_premium(int premium_amount, int policy_id) impure {
    int primary_share = premium_amount * 50 / 100;
    int secondary_share = premium_amount * 30 / 100;
    int protocol_share = premium_amount * 15 / 100;
    int reserve_share = premium_amount * 5 / 100;

    // Send 4 messages (async)
    send_to_primary_vault(primary_share);
    send_to_secondary_vault(secondary_share);
    send_to_protocol_treasury(protocol_share);
    send_to_reserve_fund(reserve_share);
}
```

**Implementation Priority:** P0 (Week 4)

---

#### 1.5 ClaimsProcessor (Original - Keep)
**No major changes, but add:**
```func
// NEW: Multi-vault loss waterfall
() process_claim_payout(int claim_amount) impure {
    // Try Primary Vault first
    int primary_capacity = get_primary_vault_balance();

    if (claim_amount <= primary_capacity) {
        deduct_from_primary(claim_amount);
    } else {
        // Exhaust primary, move to secondary
        deduct_from_primary(primary_capacity);
        int remaining = claim_amount - primary_capacity;
        deduct_from_secondary(remaining);
    }
}
```

**Implementation Priority:** P0 (Week 5)

---

### Frontend Updates (Phase 1)

#### 1.6 Vault Display Component (NEW)
**File:** `frontend/src/features/vaults/VaultDashboard.tsx`

```typescript
interface VaultStats {
  name: string;
  tvl: number;
  apy: number;
  yourBalance: number;
  tier: 'primary' | 'secondary';
}

export function VaultDashboard() {
  const { primaryVault, secondaryVault } = useVaults();

  return (
    <div className="grid grid-cols-2 gap-4">
      <VaultCard
        name="Primary Vault"
        tvl={primaryVault.tvl}
        apy={primaryVault.apy}
        balance={primaryVault.userBalance}
        tier="primary"
        features={[
          'Highest APY',
          'Liquid (no lock)',
          'First-loss exposure'
        ]}
      />

      <VaultCard
        name="Secondary Vault"
        tvl={secondaryVault.tvl}
        apy={secondaryVault.apy}
        balance={secondaryVault.userBalance}
        tier="secondary"
        features={[
          'Medium APY',
          '90-day lock',
          'Second-loss exposure'
        ]}
      />
    </div>
  );
}
```

**Implementation Priority:** P1 (Week 6)

---

### Testing & Security (Phase 1)

**Required Before Launch:**
1. ✅ Unit tests for all vault contracts (90%+ coverage)
2. ✅ Integration tests for loss waterfall
3. ✅ Security audit (1 firm minimum for Phase 1)
4. ✅ Testnet deployment + bug bounty ($10K)
5. ✅ Load testing (1,000 concurrent users)

**Timeline:** Week 7-8

---

### Phase 1 Deliverables Checklist

**Smart Contracts:**
- [ ] PolicyFactory (enhanced)
- [ ] Primary Vault
- [ ] Secondary Vault
- [ ] Simple Premium Distributor
- [ ] ClaimsProcessor (updated)
- [ ] SURE Token (original)
- [ ] Treasury (original)

**Frontend:**
- [ ] Vault Dashboard
- [ ] Deposit/Withdraw flows
- [ ] Updated policy purchase (vault selection)
- [ ] Vault stats display

**Testing:**
- [ ] 50+ unit tests
- [ ] 10+ integration tests
- [ ] Security audit completed
- [ ] Testnet live for 2 weeks

**Launch:**
- [ ] Mainnet deployment
- [ ] $1M TVL target
- [ ] 1,000 policies sold

---

## Phase 2: Multi-Party Distribution (Months 4-6)

### Goals
- ✅ Implement full 8-party reward distribution
- ✅ Add referral chain system
- ✅ Tokenize vault collateral
- ✅ Reach $10M TVL, 10,000 policies

### Smart Contracts

#### 2.1 Advanced Premium Distributor (UPGRADE)
**Replace Simple Distributor with:**

```func
// contracts/premium_distributor.fc

// 8-Party Distribution:
const int SHARE_PRIMARY_LPS = 4500;      // 45%
const int SHARE_SECONDARY_STAKE = 2000;  // 20%
const int SHARE_REFERRER = 1000;         // 10%
const int SHARE_ORACLE = 300;            // 3%
const int SHARE_PROTOCOL = 700;          // 7%
const int SHARE_GOVERNANCE = 200;        // 2%
const int SHARE_RESERVE = 300;           // 3%
const int SHARE_TRADFI = 1000;           // 10% (saved for Phase 3)

() distribute_premium(
    int premium_amount,
    slice referrer_addr,  // Can be null
    int policy_id
) impure {
    // Send 8 async messages in parallel
    // (Full implementation from Advanced Architecture doc)
}
```

**Features:**
- 8+ parallel async messages
- Referrer support (5 levels)
- Oracle compensation
- Governance voter rewards

**Implementation Priority:** P0 (Week 13-14)

---

#### 2.2 Referral Chain Manager (NEW)
**Purpose:** Track and reward multi-level referrals

```func
// contracts/referral_manager.fc

global cell referral_chains;  // user => referrer chain

() register_referral(slice user, slice referrer) impure;
() get_referral_chain(slice user) method_id returns (cell);  // Returns up to 5 levels
() distribute_referral_rewards(int total_amount, slice user) impure;

// Referral splits:
// Level 1 (direct): 60%
// Level 2: 25%
// Level 3: 10%
// Level 4: 3%
// Level 5: 2%
```

**Implementation Priority:** P0 (Week 14-15)

---

#### 2.3 SHIELD-LP Token (NEW)
**Purpose:** Tokenize Primary Vault deposits

```func
// contracts/shield_lp_token.fc
// Jetton standard (TEP-74)

// Represents pro-rata share of Primary Vault
// Fully liquid, tradeable on DEXs
// Earns yield from insurance premiums

() transfer(slice from, slice to, int amount) impure;
() burn(slice owner, int amount) impure;
(int, int) get_balance_and_yield(slice owner) method_id;
```

**Implementation Priority:** P1 (Week 15-16)

---

#### 2.4 SHIELD-STAKE Token (NEW)
**Purpose:** Tokenize Secondary Vault stakes

```func
// contracts/shield_stake_token.fc

// Represents staked SURE in Secondary Vault
// 90-day lock-up
// Non-transferable until unlock

(int, int, int) get_stake_info(slice owner) method_id;  // balance, unlock_time, yield
```

**Implementation Priority:** P1 (Week 16-17)

---

#### 2.5 Oracle Rewards Module (NEW)
**Purpose:** Compensate oracle providers

```func
// contracts/oracle_rewards.fc

global cell oracles;          // oracle_address => stats
global int total_oracle_fees;

() register_oracle(slice oracle_addr) impure;
() distribute_oracle_fee(int amount) impure;  // From premium distributor
() claim_oracle_rewards(slice oracle_addr) impure;
```

**Implementation Priority:** P2 (Week 17-18)

---

#### 2.6 Governance Rewards Module (NEW)
**Purpose:** Reward governance participation

```func
// contracts/governance_rewards.fc

() distribute_to_voters(int amount, int proposal_id) impure;
() claim_voter_rewards(slice voter_addr) impure;

// Rewards based on:
// - Vote participation
// - Stake weight
// - Outcome alignment
```

**Implementation Priority:** P2 (Week 18)

---

### Frontend Updates (Phase 2)

#### 2.7 Referral Dashboard (NEW)
**File:** `frontend/src/features/referrals/ReferralDashboard.tsx`

```typescript
export function ReferralDashboard() {
  const { referralCode, referralStats } = useReferrals();

  return (
    <div className="space-y-6">
      <ReferralCode code={referralCode} />

      <ReferralStats
        directReferrals={referralStats.direct}
        totalEarned={referralStats.totalEarned}
        activeChain={referralStats.chain}
      />

      <ReferralTree data={referralStats.tree} />
    </div>
  );
}
```

**Implementation Priority:** P1 (Week 19)

---

#### 2.8 Multi-Party Rewards Visualization (NEW)
**File:** `frontend/src/features/analytics/RewardsFlow.tsx`

```typescript
// Visualize how premiums flow to all 8 parties
export function RewardsFlowChart({ policyId }: { policyId: string }) {
  const distribution = usePremiumDistribution(policyId);

  return (
    <Sankey
      data={distribution}
      nodes={[
        'Premium',
        'Primary LPs',
        'Secondary Stakers',
        'Referrers',
        'Oracles',
        'Protocol',
        'Governance',
        'Reserve'
      ]}
    />
  );
}
```

**Implementation Priority:** P2 (Week 20)

---

### Testing & Security (Phase 2)

**Required:**
1. ✅ Test async message delivery (10k+ messages)
2. ✅ Test referral chain edge cases (orphaned users, cycles)
3. ✅ Security audit #2 (focus on token contracts)
4. ✅ Gas optimization (target <0.15 TON per 8-party distribution)

**Timeline:** Week 21-22

---

### Phase 2 Deliverables Checklist

**Smart Contracts:**
- [ ] Advanced Premium Distributor
- [ ] Referral Chain Manager
- [ ] SHIELD-LP Token
- [ ] SHIELD-STAKE Token
- [ ] Oracle Rewards Module
- [ ] Governance Rewards Module

**Frontend:**
- [ ] Referral Dashboard
- [ ] Multi-party rewards visualization
- [ ] Token balance displays
- [ ] Enhanced analytics

**Testing:**
- [ ] Async message load tests
- [ ] Token transfer tests
- [ ] Referral chain tests
- [ ] Security audit #2

**Metrics:**
- [ ] $10M TVL
- [ ] 10,000 policies
- [ ] 1,000+ referrals
- [ ] <0.15 TON gas per distribution

---

## Phase 3: TradFi Integration (Months 7-12)

### Goals
- ✅ Onboard first institutional investor ($5M+)
- ✅ Launch TradFi Buffer vault
- ✅ Implement KYC/AML compliance
- ✅ Create secondary market for SHIELD-INST
- ✅ Reach $50M TVL

### Smart Contracts

#### 3.1 TradFi Buffer Vault (NEW)
**Purpose:** Senior tranche for institutional capital

```func
// contracts/tradfi_buffer.fc

global cell institutions;       // Whitelisted addresses
global int total_institutional_capital;
global int guaranteed_apy;

() institutional_deposit(
    slice institution_addr,
    int amount,
    int lock_period  // 180 or 365 days
) impure;

() institutional_withdrawal(slice addr) impure;
() receive_premium_share(int amount) impure;
() distribute_quarterly_yield() impure;

// Get methods
(int, int, int) get_institution_stats(slice addr) method_id;  // capital, yield, total
```

**Key Features:**
- $250K minimum deposit
- 180-day lock-up
- Third-loss tranche (safest)
- Guaranteed 6-10% APY
- KYC/AML required

**Implementation Priority:** P0 (Week 25-27)

---

#### 3.2 Compliance Gateway (NEW)
**Purpose:** KYC/AML verification for institutions

```func
// contracts/compliance_gateway.fc

global cell whitelist;          // Approved institutions
global cell kyc_data;           // Encrypted KYC references

() submit_kyc_application(
    slice institution_addr,
    cell kyc_hash,              // Hash of off-chain KYC docs
    int jurisdiction
) impure;

() approve_institution(slice addr, int tier) impure;  // Admin only
() revoke_institution(slice addr) impure;             // Admin only

int is_whitelisted(slice addr) method_id;
```

**Off-Chain Components:**
- KYC provider integration (Sumsub, Onfido)
- Legal entity verification
- Sanctions screening
- Ongoing monitoring

**Implementation Priority:** P0 (Week 27-28)

---

#### 3.3 SHIELD-INST Token (NEW)
**Purpose:** Tokenize institutional deposits

```func
// contracts/shield_inst_token.fc

// Jetton standard with restrictions
// Only whitelisted addresses can hold
// 180+ day lock-up
// Represents senior tranche claim

() transfer(slice from, slice to, int amount) impure {
    // Verify both addresses whitelisted
    throw_unless(606, is_whitelisted(from));
    throw_unless(606, is_whitelisted(to));

    // Standard transfer
    // ... (Jetton logic)
}

() redeem_at_maturity(slice holder, int amount) impure;
```

**Implementation Priority:** P0 (Week 28-29)

---

#### 3.4 Institutional Reporting System (NEW)
**Purpose:** Quarterly reports for institutions

**Off-Chain Service:**
```typescript
// backend/src/services/institutional-reporting.service.ts

interface QuarterlyReport {
  quarter: string;
  institution: {
    name: string;
    address: string;
    tier: 'AAA' | 'AA' | 'A';
  };
  capital: {
    beginning: number;
    additions: number;
    withdrawals: number;
    ending: number;
  };
  performance: {
    premiumsEarned: number;
    claimsPaid: number;
    netYield: number;
    apy: number;
  };
  riskMetrics: {
    exposureByType: Record<string, number>;
    lossAbsorption: {
      primary: number;
      secondary: number;
      tradfi: number;  // Should be 0 for senior tranche
    };
  };
}

class InstitutionalReportingService {
  async generateQuarterlyReport(institutionAddress: string): Promise<QuarterlyReport>;
  async sendToInstitution(report: QuarterlyReport): Promise<void>;
  async generateTaxDocuments(year: number): Promise<void>;
}
```

**Implementation Priority:** P1 (Week 29-30)

---

#### 3.5 Secondary Market Infrastructure (NEW)
**Purpose:** Enable trading of SHIELD-INST tokens

**Components:**
1. **DEX Integration**
   - List SHIELD-INST on STON.fi
   - Create liquidity pools
   - Market making

2. **OTC Trading Portal**
   - Institution-to-institution trades
   - Escrow mechanism
   - Price discovery

**Implementation Priority:** P2 (Week 31-32)

---

### Legal & Compliance (Phase 3)

#### 3.6 Legal Entity Structure
**Required:**
- [ ] Cayman Islands SPV entity
- [ ] Legal opinion (Cayman, US, EU)
- [ ] Terms of Service (institutional)
- [ ] Subscription agreements
- [ ] Privacy policy (GDPR compliant)

**Timeline:** Week 25-28 (parallel with dev)

---

#### 3.7 Regulatory Compliance
**Requirements:**
- [ ] AML procedures documented
- [ ] KYC vendor integrated
- [ ] Sanctions screening automated
- [ ] Transaction monitoring
- [ ] Annual audit (Big 4 accounting firm)

**Timeline:** Week 28-32

---

### Frontend Updates (Phase 3)

#### 3.8 Institutional Portal (NEW)
**File:** `frontend/src/features/institutional/InstitutionalDashboard.tsx`

```typescript
export function InstitutionalDashboard() {
  const { institution, deposits, reports } = useInstitution();

  return (
    <div className="space-y-8">
      <InstitutionHeader data={institution} />

      <DepositOverview
        totalCapital={deposits.total}
        lockedUntil={deposits.lockEnd}
        currentYield={deposits.yield}
      />

      <QuarterlyReports reports={reports} />

      <RiskMetrics
        exposures={institution.exposures}
        lossAbsorption={institution.lossAbsorption}
      />

      <Actions>
        <Button>Increase Deposit</Button>
        <Button>Download Tax Docs</Button>
        <Button>Request Withdrawal</Button>
      </Actions>
    </div>
  );
}
```

**Implementation Priority:** P0 (Week 33)

---

### Testing & Security (Phase 3)

**Required:**
1. ✅ KYC workflow end-to-end test
2. ✅ Institutional deposit/withdrawal flow
3. ✅ Compliance audit (legal firm)
4. ✅ Security audit #3 (focus on TradFi contracts)
5. ✅ Penetration testing (institutional portal)

**Timeline:** Week 34-36

---

### Phase 3 Deliverables Checklist

**Smart Contracts:**
- [ ] TradFi Buffer Vault
- [ ] Compliance Gateway
- [ ] SHIELD-INST Token
- [ ] Updated Premium Distributor (now 8 parties)

**Legal:**
- [ ] Cayman entity established
- [ ] Legal opinions obtained
- [ ] Terms of Service finalized
- [ ] Subscription agreements

**Compliance:**
- [ ] KYC provider integrated
- [ ] AML procedures implemented
- [ ] Sanctions screening automated

**Frontend:**
- [ ] Institutional portal
- [ ] Reporting dashboard
- [ ] Tax document generation

**Launch:**
- [ ] First institution onboarded ($5M+)
- [ ] $50M TVL total
- [ ] 3+ institutional investors

---

## Phase 4: Hedged Insurance Product (Months 13-18)

### Overview

**Product Line 2:** Premium tier insurance with external hedging for dynamic "swing pricing"

**Target Market:**
- Sophisticated DeFi users wanting tighter pricing
- Institutions requiring AAA-rated coverage
- Users seeking lower premiums when market conditions favorable

**Key Differentiator:**
- 80% on-chain collateral (same 3-tier vaults)
- 20% external hedges (Polymarket + Perpetuals + Allianz parametric)
- **Dynamic pricing** that adjusts based on real-time hedge costs

### Goals
- ✅ Launch Hedged Insurance product tier
- ✅ Integrate 3 external hedge venues
- ✅ Implement dynamic swing pricing engine
- ✅ Achieve $100M TVL across both products
- ✅ 10,000+ hedged policies sold
- ✅ Average 15-30% lower premiums vs Core product

---

### Architecture: Two-Product System

```
┌─────────────────────────────────────────────────────────────┐
│              TONSURANCE PRODUCT SUITE                        │
└─────────────────────────────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
┌──────────────────┐            ┌──────────────────┐
│ CORE INSURANCE   │            │ HEDGED INSURANCE │
│  (Phase 1-3)     │            │  (Phase 4)       │
├──────────────────┤            ├──────────────────┤
│ • Fixed pricing  │            │ • Swing pricing  │
│ • 100% on-chain  │            │ • 80% on-chain   │
│ • 3-tier vaults  │            │ • 20% hedges     │
│ • Retail focus   │            │ • Institutional  │
│ • Launch first   │            │ • Premium tier   │
└──────────────────┘            └──────────────────┘
         │                               │
         └───────────┬───────────────────┘
                     │
                     ▼
         ┌───────────────────────┐
         │  Shared Infrastructure│
         │  • Same 3 vaults      │
         │  • Same claims engine │
         │  • Same oracles       │
         └───────────────────────┘
```

---

### Smart Contracts

#### 4.1 HedgedPolicyFactory Contract (NEW)
**Purpose:** Create hedged policies with dynamic pricing

```func
// contracts/hedged_policy_factory.fc

global slice base_policy_factory;
global slice pricing_oracle;
global slice hedge_coordinator;
global int minimum_hedge_ratio;  // 20% minimum external hedges

() create_hedged_policy(
    slice user_addr,
    int coverage_type,      // 1=depeg, 2=exploit, 3=bridge
    int coverage_amount,
    int duration_days
) impure {
    load_data();

    // 1. Calculate base premium (from Core Insurance model)
    int base_premium = calculate_base_premium(
        coverage_type,
        coverage_amount,
        duration_days
    );

    // 2. Get current hedge costs from oracle
    (int polymarket_cost, int perp_cost, int allianz_cost) =
        get_hedge_costs(coverage_type, coverage_amount, duration_days);

    // 3. Calculate total hedge cost
    int total_hedge_cost = polymarket_cost + perp_cost + allianz_cost;

    // 4. Calculate swing premium
    // Formula: base_premium + hedge_cost + protocol_margin(5%)
    int swing_premium = base_premium + total_hedge_cost;
    swing_premium = swing_premium + muldiv(swing_premium, 5, 100);  // +5% margin

    // 5. Verify user paid swing premium
    throw_unless(400, msg_value >= swing_premium);

    // 6. Create base policy (uses existing PolicyFactory)
    send_message(base_policy_factory, {
        op: create_policy,
        user: user_addr,
        coverage_type: coverage_type,
        coverage_amount: coverage_amount,
        duration: duration_days,
        premium: swing_premium
    });

    // 7. Trigger hedge orders (off-chain via keeper)
    send_message(hedge_coordinator, {
        op: execute_hedges,
        policy_id: next_policy_id,
        hedge_amount: total_hedge_cost,
        polymarket: polymarket_cost,
        perps: perp_cost,
        allianz: allianz_cost
    });

    emit_log("HEDGED_POLICY_CREATED", user_addr, swing_premium);
}

// Get current hedge costs from pricing oracle
(int, int, int) get_hedge_costs(
    int coverage_type,
    int coverage_amount,
    int duration_days
) {
    // Query pricing oracle for real-time costs
    // Returns (polymarket_cost, perp_cost, allianz_cost)

    // Implementation communicates with off-chain pricing oracle
    // which monitors:
    // - Polymarket market odds
    // - Perpetual funding rates
    // - Allianz parametric quotes
}
```

**Test Cases:**
- ✅ Premium calculated correctly with all 3 hedge costs
- ✅ Premium updates when hedge costs change
- ✅ Hedge orders triggered via coordinator
- ✅ Falls back to Core Insurance if hedges unavailable
- ✅ Refunds excess payment

---

#### 4.2 PricingOracle Contract (NEW)
**Purpose:** Aggregate real-time hedge costs from multiple sources

```func
// contracts/pricing_oracle.fc

global cell hedge_prices;  // coverage_type => price_data
global int last_update_time;
global slice oracle_operator;  // Off-chain keeper address

// Called by off-chain oracle keeper every 5 minutes
() update_hedge_prices(
    int coverage_type,
    int polymarket_odds,    // Basis points (e.g., 1200 = 12%)
    int perp_funding_rate,  // Daily rate in basis points
    int allianz_quote       // Premium per $1000 coverage
) impure {
    throw_unless(401, equal_slices(sender(), oracle_operator));

    load_data();

    cell price_data = begin_cell()
        .store_uint(polymarket_odds, 16)
        .store_uint(perp_funding_rate, 16)
        .store_uint(allianz_quote, 32)
        .store_uint(now(), 64)
        .end_cell();

    hedge_prices~udict_set(8, coverage_type, price_data.begin_parse());
    last_update_time = now();

    save_data();

    emit_log("HEDGE_PRICES_UPDATED", coverage_type);
}

// Calculate hedge cost for specific policy
int calculate_hedge_cost(
    int coverage_type,
    int coverage_amount,
    int duration_days
) method_id {
    (slice price_data, int found) = hedge_prices.udict_get?(8, coverage_type);
    throw_unless(402, found);

    int polymarket_odds = price_data~load_uint(16);
    int perp_funding = price_data~load_uint(16);
    int allianz_quote = price_data~load_uint(32);
    int timestamp = price_data~load_uint(64);

    // Verify price freshness (max 10 minutes old)
    throw_unless(403, now() - timestamp <= 600);

    // Calculate costs
    // Polymarket: coverage * odds / 10000
    int poly_cost = muldiv(coverage_amount, polymarket_odds, 10000);

    // Perpetuals: coverage * funding_rate * days / 10000
    int perp_cost = muldiv(coverage_amount * duration_days, perp_funding, 10000);

    // Allianz: coverage * quote / 1000
    int allianz_cost = muldiv(coverage_amount, allianz_quote, 1000);

    // Total hedge cost for 20% external hedging
    int total = (poly_cost + perp_cost + allianz_cost) / 5;  // 20% = 1/5

    return total;
}
```

---

#### 4.3 HedgeCoordinator Contract (NEW)
**Purpose:** Coordinate hedge execution across external venues

```func
// contracts/hedge_coordinator.fc

// NOTE: This contract primarily emits events for off-chain keepers
// Actual hedge execution happens via off-chain bots

global cell pending_hedges;  // policy_id => hedge_orders
global slice polymarket_keeper;
global slice perps_keeper;
global slice allianz_keeper;

() execute_hedges(
    int policy_id,
    int hedge_amount,
    int polymarket_allocation,
    int perp_allocation,
    int allianz_allocation
) impure {
    load_data();

    // Store hedge orders
    cell hedge_orders = begin_cell()
        .store_uint(policy_id, 64)
        .store_coins(polymarket_allocation)
        .store_coins(perp_allocation)
        .store_coins(allianz_allocation)
        .store_uint(now(), 64)
        .store_uint(0, 1)  // executed flag
        .end_cell();

    pending_hedges~udict_set(64, policy_id, hedge_orders.begin_parse());

    save_data();

    // Emit events for off-chain keepers
    emit_log("POLYMARKET_HEDGE_REQUESTED", policy_id, polymarket_allocation);
    emit_log("PERP_HEDGE_REQUESTED", policy_id, perp_allocation);
    emit_log("ALLIANZ_HEDGE_REQUESTED", policy_id, allianz_allocation);
}

// Called by keeper after hedge executed
() confirm_hedge_execution(
    int policy_id,
    int venue,  // 1=Polymarket, 2=Perps, 3=Allianz
    slice proof  // Transaction hash or confirmation
) impure {
    // Verify keeper
    // Update hedge status
    // Mark policy as fully hedged once all 3 venues confirm
}
```

---

### Off-Chain Components

#### 4.4 Risk Calculator Engine (TypeScript/Python)
**Purpose:** Calculate total exposure and required hedges

**Location:** `backend/src/hedging/risk-calculator.ts`

```typescript
interface Exposure {
  coverageType: 'depeg' | 'exploit' | 'bridge';
  totalCoverage: number;
  activePolices: number;
  requiredHedge: number;  // 20% of total
}

class RiskCalculator {
  async calculateExposure(): Promise<Exposure[]> {
    // Query all active hedged policies
    const policies = await this.getPoliciesFromChain();

    // Group by coverage type
    const grouped = this.groupByCoverageType(policies);

    // Calculate total exposure per type
    const exposures = grouped.map(group => ({
      coverageType: group.type,
      totalCoverage: group.policies.reduce((sum, p) => sum + p.amount, 0),
      activePolicies: group.policies.length,
      requiredHedge: group.totalCoverage * 0.2  // 20% external
    }));

    return exposures;
  }

  async calculateOptimalHedgeAllocation(
    exposure: Exposure
  ): Promise<HedgeAllocation> {
    // Get current prices from all venues
    const polymarketOdds = await this.polymarket.getMarketOdds();
    const perpFunding = await this.perps.getFundingRate();
    const allianzQuote = await this.allianz.getQuote();

    // Optimize allocation to minimize cost
    // Subject to: minimum 5% in each venue (diversification)
    const allocation = this.optimizeAllocation({
      totalHedge: exposure.requiredHedge,
      costs: { polymarketOdds, perpFunding, allianzQuote },
      constraints: { minPerVenue: 0.05 }
    });

    return allocation;
  }
}
```

**Test Cases:**
- ✅ Correctly aggregates exposure across all policies
- ✅ Groups by coverage type
- ✅ Calculates 20% hedge requirement
- ✅ Handles empty policy set
- ✅ Handles single policy
- ✅ Handles 10,000+ policies

---

#### 4.5 Polymarket Connector (TypeScript)
**Purpose:** Execute and monitor prediction market hedges

**Location:** `backend/src/hedging/connectors/polymarket.ts`

```typescript
import { PolymarketAPI } from '@polymarket/api';

interface PolymarketHedge {
  policyId: string;
  marketId: string;
  side: 'YES' | 'NO';
  amount: number;
  shares: number;
  avgPrice: number;
}

class PolymarketConnector {
  private client: PolymarketAPI;
  private activeHedges: Map<string, PolymarketHedge> = new Map();

  async placeHedge(
    policyId: string,
    coverageType: string,
    amount: number
  ): Promise<PolymarketHedge> {
    // Find appropriate market
    // For USDT depeg: "Will USDT trade below $0.95 in Q4 2025?"
    const market = await this.findMarket(coverageType);

    // Place order (we bet YES on depeg/exploit happening)
    const order = await this.client.placeOrder({
      marketId: market.id,
      side: 'YES',
      amount: amount,
      price: market.bestAsk  // Market order
    });

    // Track hedge
    const hedge: PolymarketHedge = {
      policyId,
      marketId: market.id,
      side: 'YES',
      amount: order.amount,
      shares: order.shares,
      avgPrice: order.avgPrice
    };

    this.activeHedges.set(policyId, hedge);

    // Store in database
    await this.db.saveHedge(hedge);

    return hedge;
  }

  async monitorHedges(): Promise<void> {
    // Check if any markets resolved
    for (const [policyId, hedge] of this.activeHedges) {
      const market = await this.client.getMarket(hedge.marketId);

      if (market.resolved) {
        // If YES won (event happened), we get payout
        if (market.outcome === 'YES') {
          const payout = hedge.shares;  // 1 share = $1
          await this.recordPayout(policyId, payout);
        }

        // Remove from active
        this.activeHedges.delete(policyId);
      }
    }
  }

  async liquidateHedge(policyId: string): Promise<number> {
    // Sell hedge early if policy claim paid out
    const hedge = this.activeHedges.get(policyId);
    if (!hedge) return 0;

    const sellOrder = await this.client.placeOrder({
      marketId: hedge.marketId,
      side: 'NO',  // Sell our YES shares
      shares: hedge.shares,
      price: null  // Market order
    });

    return sellOrder.proceeds;
  }
}
```

**Test Cases:**
- ✅ Authenticate with API
- ✅ Find correct market for coverage type
- ✅ Place order successfully
- ✅ Handle insufficient liquidity
- ✅ Monitor market resolution
- ✅ Liquidate hedge correctly
- ✅ Handle API errors gracefully

---

#### 4.6 Perpetuals Connector (TypeScript)
**Purpose:** Execute perpetual futures hedges

```typescript
import { Binance } from 'binance-api-node';

class PerpetualsConnector {
  private client: Binance;
  private activePositions: Map<string, PerpPosition> = new Map();

  async openShortPosition(
    policyId: string,
    symbol: string,  // e.g., 'USDTUSDT' or 'TONUSDT'
    notionalValue: number
  ): Promise<PerpPosition> {
    // For USDT depeg coverage: short USDT perp
    // If USDT drops, our short profits

    // Set leverage (conservative: 2x)
    await this.client.futuresLeverage({
      symbol,
      leverage: 2
    });

    // Calculate position size
    const currentPrice = await this.getPrice(symbol);
    const quantity = (notionalValue * 2) / currentPrice;  // 2x leverage

    // Open short
    const order = await this.client.futuresOrder({
      symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: quantity.toFixed(3)
    });

    // Track position
    const position: PerpPosition = {
      policyId,
      symbol,
      side: 'SHORT',
      entryPrice: order.avgPrice,
      quantity: order.executedQty,
      leverage: 2,
      openTime: Date.now()
    };

    this.activePositions.set(policyId, position);

    return position;
  }

  async monitorFundingRates(): Promise<void> {
    // Track funding rate costs
    // If funding too high, consider rebalancing to other venues

    for (const [policyId, position] of this.activePositions) {
      const fundingRate = await this.client.futuresFundingRate({
        symbol: position.symbol
      });

      // Calculate cumulative funding cost
      const hoursSinceOpen = (Date.now() - position.openTime) / (1000 * 3600);
      const fundingCost = position.quantity * fundingRate.rate * Math.floor(hoursSinceOpen / 8);

      await this.db.updateFundingCost(policyId, fundingCost);
    }
  }

  async closePosition(policyId: string): Promise<number> {
    const position = this.activePositions.get(policyId);
    if (!position) return 0;

    // Close short position
    const order = await this.client.futuresOrder({
      symbol: position.symbol,
      side: 'BUY',  // Close short
      type: 'MARKET',
      quantity: position.quantity
    });

    // Calculate P&L
    const pnl = (position.entryPrice - order.avgPrice) * position.quantity;

    this.activePositions.delete(policyId);

    return pnl;
  }
}
```

---

#### 4.7 Allianz Parametric Connector (TypeScript)
**Purpose:** Purchase parametric insurance policies from Allianz

```typescript
class AllianzConnector {
  private apiKey: string;
  private baseUrl = 'https://api.allianz-parametric.com/v1';

  async getQuote(
    coverageType: string,
    coverageAmount: number,
    trigger: TriggerParams
  ): Promise<ParametricQuote> {
    // Request quote for parametric policy
    // Example: USDT < $0.95 for 1 hour triggers payout

    const response = await axios.post(`${this.baseUrl}/quotes`, {
      product: 'cryptocurrency_depeg',
      coverageAmount,
      trigger: {
        asset: 'USDT',
        threshold: 0.95,
        duration: 3600,  // 1 hour
        dataSource: 'chainlink'
      },
      duration: 90  // days
    }, {
      headers: { 'X-API-Key': this.apiKey }
    });

    return {
      quoteId: response.data.id,
      premium: response.data.premium,
      coverage: coverageAmount,
      validUntil: response.data.validUntil
    };
  }

  async purchasePolicy(quoteId: string): Promise<ParametricPolicy> {
    // Purchase policy using quote
    const response = await axios.post(`${this.baseUrl}/policies`, {
      quoteId,
      payment: {
        method: 'wire',  // Or crypto if supported
        account: this.paymentAccount
      }
    });

    return {
      policyId: response.data.id,
      certificateUrl: response.data.certificate,
      coverage: response.data.coverage,
      trigger: response.data.trigger,
      expiresAt: response.data.expiresAt
    };
  }

  async checkClaim(policyId: string): Promise<ClaimStatus> {
    // Check if trigger event occurred
    const response = await axios.get(`${this.baseUrl}/policies/${policyId}/claim`);

    if (response.data.triggered) {
      // Parametric policy automatically pays out
      return {
        status: 'approved',
        payoutAmount: response.data.payout,
        payoutDate: response.data.payoutDate
      };
    }

    return { status: 'pending' };
  }
}
```

---

### Frontend Updates

#### 4.8 Hedged Policy Purchase Flow
**Component:** `HedgedPolicyPurchase.tsx`

```typescript
export function HedgedPolicyPurchase() {
  const [coverageType, setCoverageType] = useState<CoverageType>('depeg');
  const [coverageAmount, setCoverageAmount] = useState(1000);
  const [duration, setDuration] = useState(90);

  // Fetch real-time swing premium
  const { premium, loading } = useSwingPremium({
    coverageType,
    coverageAmount,
    duration,
    refreshInterval: 30000  // Update every 30 seconds
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Badge variant="premium">Premium Tier</Badge>
        <h1 className="text-3xl font-bold">Hedged Insurance</h1>
      </div>

      {/* Product Comparison */}
      <Card className="p-6 mb-6 bg-gradient-to-r from-blue-50 to-purple-50">
        <h2 className="text-xl font-semibold mb-4">Why Hedged Insurance?</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h3 className="font-medium text-gray-700 mb-2">Core Insurance</h3>
            <ul className="text-sm space-y-1">
              <li>✓ Fixed premium: ${calculateCorePremium()}Fixed premium: ${calculateCorePremium()}</li>
              <li>✓ 100% on-chain backing</li>
              <li>✓ Good for most users</li>
            </ul>
          </div>
          <div className="border-l-2 border-purple-300 pl-4">
            <h3 className="font-medium text-purple-700 mb-2">Hedged Insurance ⭐</h3>
            <ul className="text-sm space-y-1">
              <li>✓ Dynamic premium: ${premium.total} (saves ${calculateCorePremium() - premium.total}!)</li>
              <li>✓ 80% on-chain + 20% external hedges</li>
              <li>✓ Higher payout confidence (99.5%)</li>
              <li>✓ Institutional-grade backing</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* Coverage Selection */}
      <CoverageSelector
        selected={coverageType}
        onChange={setCoverageType}
      />

      {/* Amount & Duration */}
      <AmountDurationSelector
        amount={coverageAmount}
        duration={duration}
        onAmountChange={setCoverageAmount}
        onDurationChange={setDuration}
      />

      {/* Premium Breakdown */}
      <Card className="p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">
          Current Premium
          {loading && <span className="ml-2 text-sm text-gray-500">(updating...)</span>}
        </h2>

        <div className="space-y-3">
          <PremiumRow
            label="Base Coverage"
            value={premium.base}
            tooltip="On-chain collateral cost"
          />
          <PremiumRow
            label="Polymarket Hedge"
            value={premium.polymarket}
            tooltip={`Current market odds: ${premium.polymarketOdds}%`}
            change={premium.polymarketChange}
          />
          <PremiumRow
            label="Perpetuals Hedge"
            value={premium.perps}
            tooltip={`Funding rate: ${premium.fundingRate}%/day`}
            change={premium.perpsChange}
          />
          <PremiumRow
            label="Allianz Parametric"
            value={premium.allianz}
            tooltip="Institutional reinsurance backing"
          />
          <Divider />
          <PremiumRow
            label="Protocol Margin (5%)"
            value={premium.margin}
            tooltip="Covers operational costs"
          />
          <Divider />
          <div className="flex justify-between items-center text-lg font-bold">
            <span>Total Premium</span>
            <div className="text-right">
              <div className="text-2xl text-blue-600">
                ${premium.total}
              </div>
              {premium.savings > 0 && (
                <div className="text-sm text-green-600">
                  Save ${premium.savings} vs Core
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Price Lock */}
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-yellow-900">
                Lock this rate for 5 minutes
              </p>
              <p className="text-sm text-yellow-700">
                Price updates every 30 seconds based on market conditions
              </p>
            </div>
            <Button
              onClick={() => lockPremium(premium)}
              variant="warning"
            >
              Lock Rate
            </Button>
          </div>
        </div>
      </Card>

      {/* Purchase */}
      <Button
        onClick={handlePurchase}
        size="large"
        className="w-full"
        disabled={loading || !premium}
      >
        Purchase Hedged Policy
      </Button>
    </div>
  );
}
```

---

### Testing Requirements

#### Unit Tests (New Components)
- [ ] `RiskCalculator.spec.ts` (20+ tests)
- [ ] `HedgeOptimizer.spec.ts` (15+ tests)
- [ ] `PolymarketConnector.spec.ts` (25+ tests)
- [ ] `PerpetualsConnector.spec.ts` (25+ tests)
- [ ] `AllianzConnector.spec.ts` (20+ tests)
- [ ] `PricingOracle.spec.ts` (15+ tests)
- [ ] `HedgedPolicyFactory.spec.ts` (30+ tests)

#### Integration Tests
- [ ] Policy purchase → hedge execution flow
- [ ] Hedge rebalancing on exposure change
- [ ] Claim payout → hedge liquidation
- [ ] Oracle price updates → premium recalculation

#### E2E Tests
- [ ] User purchases hedged policy end-to-end
- [ ] Swing premium updates in real-time
- [ ] Hedge executed across all 3 venues
- [ ] Claim triggers hedge payout

---

### Phase 4 Deliverables Checklist

**Smart Contracts:**
- [ ] HedgedPolicyFactory
- [ ] PricingOracle
- [ ] HedgeCoordinator
- [ ] Updated ClaimsProcessor (hedge liquidation)

**Off-Chain Services:**
- [ ] Risk Calculator Engine
- [ ] Hedge Optimizer
- [ ] Polymarket Connector
- [ ] Perpetuals Connector
- [ ] Allianz Connector
- [ ] Price Oracle Keeper (updates on-chain prices)
- [ ] Hedge Execution Keeper (executes orders)

**Frontend:**
- [ ] Hedged Policy Purchase UI
- [ ] Premium Breakdown Component
- [ ] Real-time Price Updates
- [ ] Product Comparison Tool

**Testing:**
- [ ] 150+ unit tests (90%+ coverage)
- [ ] 30+ integration tests
- [ ] 10+ E2E tests
- [ ] Load test: 1,000 concurrent premium quotes

**Documentation:**
- [ ] Hedged product user guide
- [ ] API documentation (all connectors)
- [ ] Hedge execution playbook
- [ ] Risk management guidelines

**Launch:**
- [ ] 100 beta testers
- [ ] $1M hedged TVL
- [ ] Average 20% premium savings demonstrated
- [ ] All 3 hedge venues operational

---

## Phase 5: Optimization & Scale (Months 19-24)

### Goals
- ✅ Optimize hedge execution (reduce costs by 10-15%)
- ✅ Add more hedge venues (Hyperliquid, dYdX, etc.)
- ✅ Implement ML-based hedge ratio optimization
- ✅ Launch hedge rebalancing automation
- ✅ Reach $200M TVL across both products
- ✅ Achieve profitability on hedged product line

### Smart Contracts

#### 5.1 Dynamic Rebalancer (NEW)
```func
// Automatically rebalance hedges to maintain optimal ratios
() auto_rebalance_hedges() impure;
```

#### 5.2 ML Hedge Optimizer Integration
```func
// On-chain oracle receives ML model predictions
() update_optimal_allocation(cell ml_predictions) impure;
```

### Off-Chain Enhancements

#### 5.3 Machine Learning Model
**Purpose:** Predict optimal hedge allocations based on historical data

**Features:**
- Train on 6 months of hedge cost data
- Predict cheapest venue for next 24 hours
- Factor in correlation between venues
- Continuous learning from executed hedges

#### 5.4 Additional Venue Connectors
- Hyperliquid (perpetuals)
- dYdX (perpetuals)
- Kalshi (prediction markets)
- More parametric insurance providers

#### 5.5 Automated Rebalancing
**Triggers:**
- Exposure drift >10%
- Hedge cost differential >15%
- New policies exceed threshold
- Scheduled daily rebalance (off-peak hours)

---

**Implementation:** Months 19-24

---

## Development Priorities

### Priority Matrix

| Feature | Phase | Priority | Complexity | Impact |
|---------|-------|----------|------------|--------|
| PolicyFactory | 1 | P0 | Medium | Critical |
| Primary Vault | 1 | P0 | Medium | Critical |
| Secondary Vault | 1 | P0 | Medium | Critical |
| Simple Distributor | 1 | P0 | Low | High |
| ClaimsProcessor | 1 | P0 | High | Critical |
| Advanced Distributor | 2 | P0 | High | High |
| Referral Manager | 2 | P0 | Medium | High |
| SHIELD-LP Token | 2 | P1 | Medium | Medium |
| TradFi Buffer | 3 | P0 | High | Critical |
| Compliance Gateway | 3 | P0 | Medium | Critical |
| SHIELD-INST Token | 3 | P0 | Medium | High |
| Reporting System | 3 | P1 | Medium | Medium |

---

## Resource Allocation

### Team Structure

**Phase 1 (Months 1-3):**
- 2 Smart Contract Engineers
- 2 Frontend Engineers
- 1 Backend Engineer
- 1 QA/Security
- 1 Product Manager

**Phase 2 (Months 4-6):**
- 3 Smart Contract Engineers (add +1)
- 2 Frontend Engineers
- 2 Backend Engineers (add +1)
- 1 QA/Security
- 1 Product Manager

**Phase 3 (Months 7-12):**
- 3 Smart Contract Engineers
- 2 Frontend Engineers
- 2 Backend Engineers
- 1 QA/Security
- 1 Legal/Compliance Lead (NEW)
- 1 Institutional Sales (NEW)
- 1 Product Manager

### Budget

**Phase 1:** $400K
- Salaries: $250K
- Audits: $75K
- Infrastructure: $25K
- Legal: $30K
- Marketing: $20K

**Phase 2:** $500K
- Salaries: $350K
- Audits: $80K
- Infrastructure: $40K
- Marketing: $30K

**Phase 3:** $800K
- Salaries: $500K
- Audits: $100K
- Legal/Compliance: $120K
- Infrastructure: $50K
- Marketing: $30K

**Total Year 1:** $1.7M

---

## Risk Mitigation

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Smart contract bug | Medium | Critical | 3+ audits, bug bounty, gradual rollout |
| Oracle failure | Low | High | Multiple oracle sources, fallback |
| Gas cost spike | Low | Medium | Optimize async messages, monitor |
| Scalability issues | Medium | High | TON sharding, load testing |

### Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Low institutional demand | Medium | High | Pilot with 1-2 institutions first |
| Regulatory crackdown | Low | Critical | Legal opinions, offshore entity |
| Competition | High | Medium | First-mover advantage, TON-native |
| Bear market | Medium | Medium | Focus on stablecoin coverage |

### Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|---------|------------|
| Key person departure | Low | High | Documentation, knowledge sharing |
| Security breach | Low | Critical | Multi-sig, regular audits |
| Reputational damage | Low | High | Transparent communication |

---

## Success Metrics

### Phase 1 Success Criteria
- [ ] $1M TVL
- [ ] 1,000 policies sold
- [ ] 500 active users
- [ ] 0 critical bugs
- [ ] <5 second policy purchase time

### Phase 2 Success Criteria
- [ ] $10M TVL
- [ ] 10,000 policies
- [ ] 5,000 active users
- [ ] 1,000+ referrals
- [ ] <0.15 TON gas per 8-party distribution

### Phase 3 Success Criteria
- [ ] $50M TVL
- [ ] 50,000 policies
- [ ] 3+ institutional investors ($15M+ total)
- [ ] 0 compliance issues
- [ ] Profitable operations

### Year 2 Success Criteria
- [ ] $200M TVL
- [ ] 200,000 policies
- [ ] 10+ institutions
- [ ] $5M+ annual profit
- [ ] Fully decentralized governance

---

## Appendix A: Contract Dependencies

```
Deployment Order (Phase 1):
1. SURE Token
2. Treasury
3. Primary Vault
4. Secondary Vault
5. Simple Premium Distributor
6. PolicyFactory
7. ClaimsProcessor

Deployment Order (Phase 2):
8. Referral Manager
9. SHIELD-LP Token
10. SHIELD-STAKE Token
11. Oracle Rewards
12. Governance Rewards
13. Advanced Premium Distributor (replaces #5)

Deployment Order (Phase 3):
14. Compliance Gateway
15. TradFi Buffer
16. SHIELD-INST Token
17. Update Premium Distributor (add TradFi)
```

---

## Appendix B: Testing Checklist

### Unit Tests
- [ ] PolicyFactory: create_policy, calculate_premium
- [ ] Primary Vault: deposit, withdraw, loss absorption
- [ ] Secondary Vault: stake, unstake, loss cascade
- [ ] Premium Distributor: 8-party split, async delivery
- [ ] Referral Manager: chain tracking, reward calculation
- [ ] All token contracts: transfer, burn, mint

### Integration Tests
- [ ] End-to-end policy purchase
- [ ] End-to-end claim payout
- [ ] Loss waterfall (primary → secondary → tradfi)
- [ ] Referral chain (5 levels)
- [ ] Institutional deposit/withdrawal

### Security Tests
- [ ] Reentrancy attacks
- [ ] Integer overflow/underflow
- [ ] Access control bypass
- [ ] Front-running
- [ ] Gas griefing

### Load Tests
- [ ] 1,000 concurrent policy purchases
- [ ] 10,000 async message deliveries
- [ ] 100 simultaneous claims

---

## Appendix C: Smart Contract Size Limits

TON has contract size limits. Plan accordingly:

| Contract | Estimated Size | Limit | Status |
|----------|---------------|-------|--------|
| PolicyFactory | 8 KB | 64 KB | ✅ Safe |
| Primary Vault | 6 KB | 64 KB | ✅ Safe |
| Premium Distributor | 12 KB | 64 KB | ✅ Safe |
| TradFi Buffer | 10 KB | 64 KB | ✅ Safe |

If any contract approaches 64 KB, split into multiple contracts.

---

**Document Status:** MASTER PLAN
**Next Review:** End of each Phase
**Owner:** Engineering Team
**Contact:** eng@tonsurance.com

---

*Stay Tonsured, Stay Secure* 🛡️
