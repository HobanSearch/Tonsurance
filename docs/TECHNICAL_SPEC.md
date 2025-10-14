# Tonsurance - Technical Implementation Specification

**Version**: 1.0
**Last Updated**: January 2025
**Status**: Official Technical Specification
**Owner**: Engineering Team

---

## Executive Summary

This document provides the complete technical architecture and implementation guidelines for Tonsurance, a decentralized insurance protocol built as a Telegram Mini-App on the TON blockchain.

**Tech Stack Overview:**
- **Frontend**: React 18 + TypeScript + TailwindCSS
- **Platform**: Telegram Web App (Mini-App)
- **Blockchain**: TON (The Open Network)
- **Smart Contracts**: FunC
- **Backend**: Node.js + Express + PostgreSQL
- **Infrastructure**: Cloud (AWS/GCP) + IPFS

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Smart Contract Specifications](#smart-contract-specifications)
3. [Frontend Implementation](#frontend-implementation)
4. [Backend Services](#backend-services)
5. [Blockchain Integration](#blockchain-integration)
6. [Security Implementation](#security-implementation)
7. [DevOps & Infrastructure](#devops--infrastructure)
8. [Testing Strategy](#testing-strategy)
9. [Deployment Plan](#deployment-plan)
10. [Monitoring & Observability](#monitoring--observability)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Platform                        │
│                                                               │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Tonsurance Mini-App (React PWA)            │    │
│  │                                                      │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐         │    │
│  │  │ Policy   │  │ Claims   │  │ Governance│         │    │
│  │  │ Purchase │  │ Filing   │  │ Voting    │         │    │
│  │  └──────────┘  └──────────┘  └──────────┘         │    │
│  └────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │      TON Connect (Wallet Bridge)      │
        └──────────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        ▼                                      ▼
┌───────────────────┐              ┌──────────────────────┐
│   Backend API     │              │   TON Blockchain     │
│   (Node.js)       │              │                      │
│                   │              │  ┌───────────────┐  │
│  ┌─────────────┐ │              │  │ PolicyFactory │  │
│  │ REST API    │ │◄────────────►│  │ Claims        │  │
│  │ Notifications│ │              │  │ Governance    │  │
│  │ Analytics   │ │              │  │ SURE Token    │  │
│  └─────────────┘ │              │  │ Staking       │  │
│                   │              │  │ Treasury      │  │
│  ┌─────────────┐ │              │  └───────────────┘  │
│  │ PostgreSQL  │ │              │                      │
│  │ Redis Cache │ │              │  ┌───────────────┐  │
│  └─────────────┘ │              │  │ Oracles       │  │
└───────────────────┘              │  │ (Chainlink)   │  │
                                    │  └───────────────┘  │
                                    └──────────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │   IPFS (Metadata)    │
                                    │   - Policy Docs      │
                                    │   - Claim Evidence   │
                                    └──────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| **Telegram Mini-App** | User interface, wallet connection, tx signing | React + TWA SDK |
| **TON Connect** | Secure wallet bridge, session management | @tonconnect/ui-react |
| **Smart Contracts** | Business logic, state management, payments | FunC |
| **Backend API** | Off-chain data, indexing, notifications | Node.js + Express |
| **Database** | User data, claims history, analytics | PostgreSQL |
| **Cache** | Session state, hot data | Redis |
| **Oracles** | Price feeds, protocol data | Chainlink + Custom |
| **IPFS** | Decentralized storage for evidence/metadata | IPFS + Pinata |

---

## Smart Contract Specifications

### Contract Overview

| Contract | Purpose | Language | Priority |
|----------|---------|----------|----------|
| PolicyFactory | Create & manage policies | FunC | P0 |
| ClaimsProcessor | Process claims & payouts | FunC | P0 |
| SUREToken | Governance token (Jetton) | FunC | P0 |
| GovernanceVoting | DAO voting mechanism | FunC | P1 |
| StakingPool | Stake SURE, earn rewards | FunC | P1 |
| Treasury | Hold premiums & reserves | FunC | P0 |
| PriceOracle | Price feed aggregator | FunC | P0 |

---

### 1. PolicyFactory Contract

**File**: `contracts/policy_factory.fc`

#### Purpose
Creates individual policy contracts, manages policy lifecycle, calculates premiums.

#### Storage Structure
```func
global slice owner_address;
global int next_policy_id;
global cell policies_dict;  ;; policy_id -> policy_data
global int total_policies_created;
global int active_policies_count;
global cell coverage_types;  ;; coverage_type_id -> coverage_params
```

#### Key Methods

##### `create_policy`
```func
() create_policy(
    slice user_address,
    int coverage_type,     ;; 1=USDT depeg, 2=Protocol, 3=Bridge, 4=Rug
    int coverage_amount,   ;; in nanograms TON
    int duration_days,     ;; 30, 90, or 180
    int premium_amount     ;; in nanograms TON
) impure inline {
    ;; Validate inputs
    throw_unless(400, coverage_amount >= 10000000000);  ;; Min $10
    throw_unless(401, coverage_amount <= 1000000000000); ;; Max $1000
    throw_unless(402, (duration_days == 30) | (duration_days == 90) | (duration_days == 180));

    ;; Calculate expected premium
    int calculated_premium = calculate_premium(coverage_type, coverage_amount, duration_days);
    throw_unless(403, premium_amount >= calculated_premium);

    ;; Create policy data
    int policy_id = next_policy_id;
    int start_time = now();
    int end_time = start_time + (duration_days * 86400);

    cell policy_data = begin_cell()
        .store_uint(policy_id, 64)
        .store_slice(user_address)
        .store_uint(coverage_type, 8)
        .store_coins(coverage_amount)
        .store_uint(start_time, 32)
        .store_uint(end_time, 32)
        .store_uint(0, 1)  ;; active flag
        .store_uint(0, 1)  ;; claimed flag
        .end_cell();

    ;; Store policy
    policies_dict~udict_set(64, policy_id, policy_data.begin_parse());

    ;; Mint NFT (policy certificate)
    mint_policy_nft(user_address, policy_id, policy_data);

    ;; Update counters
    next_policy_id += 1;
    total_policies_created += 1;
    active_policies_count += 1;

    ;; Emit event
    emit_policy_created(policy_id, user_address, coverage_type, coverage_amount);
}
```

##### `calculate_premium`
```func
int calculate_premium(int coverage_type, int coverage_amount, int duration_days) inline {
    ;; Base rates (APR in basis points)
    ;; 1 = USDT depeg: 80 bps (0.8%)
    ;; 2 = Protocol: 150-300 bps (1.5-3%)
    ;; 3 = Bridge: 200 bps (2%)
    ;; 4 = Rug pull: 500 bps (5%)

    int base_rate = 0;
    if (coverage_type == 1) {
        base_rate = 80;  ;; 0.8%
    } elseif (coverage_type == 2) {
        base_rate = 200; ;; 2% (average)
    } elseif (coverage_type == 3) {
        base_rate = 200; ;; 2%
    } elseif (coverage_type == 4) {
        base_rate = 500; ;; 5%
    }

    ;; Time multiplier
    int time_multiplier = 1000;  ;; Default 1.0x for 90 days
    if (duration_days == 30) {
        time_multiplier = 1200;  ;; 1.2x premium
    } elseif (duration_days == 180) {
        time_multiplier = 900;   ;; 0.9x discount
    }

    ;; Calculate: (amount * rate * days / 365 / 10000) * time_multiplier / 1000
    int premium = muldiv(coverage_amount, base_rate * duration_days, 365 * 10000);
    premium = muldiv(premium, time_multiplier, 1000);

    return premium;
}
```

##### `get_user_policies`
```func
cell get_user_policies(slice user_address) method_id {
    ;; Return all policies for a user
    cell result = begin_cell().end_cell();
    int policy_id = 0;

    do {
        (policy_id, slice policy_data, int found) = policies_dict.udict_get_next?(64, policy_id);
        if (found) {
            slice owner = policy_data~load_msg_addr();
            if (equal_slices(owner, user_address)) {
                result~tpush(policy_data);
            }
        }
    } until (~ found);

    return result;
}
```

#### Events
```func
;; Policy created
emit_log(
    "PolicyCreated",
    policy_id,
    user_address,
    coverage_type,
    coverage_amount,
    duration_days,
    premium_amount
);

;; Policy expired
emit_log(
    "PolicyExpired",
    policy_id,
    end_time
);
```

---

### 2. ClaimsProcessor Contract

**File**: `contracts/claims_processor.fc`

#### Purpose
Handle claim submissions, auto-verification, voting, and payouts.

#### Storage Structure
```func
global cell claims_dict;  ;; claim_id -> claim_data
global int next_claim_id;
global slice treasury_address;
global slice oracle_address;
global int auto_approval_threshold;  ;; For voting
global cell verified_events;  ;; event_hash -> verified flag
```

#### Key Methods

##### `file_claim`
```func
() file_claim(
    slice user_address,
    int policy_id,
    cell evidence_cell  ;; Contains description, links, tx hashes
) impure inline {
    ;; Load policy
    (slice policy_data, int found) = policies_dict.udict_get?(64, policy_id);
    throw_unless(404, found);

    ;; Verify policy ownership
    slice policy_owner = policy_data~load_msg_addr();
    throw_unless(403, equal_slices(policy_owner, user_address));

    ;; Verify policy is active
    int start_time = policy_data~load_uint(32);
    int end_time = policy_data~load_uint(32);
    throw_unless(410, now() >= start_time);
    throw_unless(411, now() <= end_time);

    ;; Verify not already claimed
    int claimed = policy_data~load_uint(1);
    throw_unless(412, claimed == 0);

    ;; Create claim
    int claim_id = next_claim_id;
    int claim_time = now();

    cell claim_data = begin_cell()
        .store_uint(claim_id, 64)
        .store_uint(policy_id, 64)
        .store_slice(user_address)
        .store_uint(claim_time, 32)
        .store_uint(0, 8)  ;; status: 0=pending, 1=approved, 2=rejected
        .store_uint(0, 1)  ;; auto_approved flag
        .store_ref(evidence_cell)
        .end_cell();

    claims_dict~udict_set(64, claim_id, claim_data.begin_parse());
    next_claim_id += 1;

    ;; Attempt auto-verification
    auto_verify_claim(claim_id);

    emit_claim_filed(claim_id, policy_id, user_address);
}
```

##### `auto_verify_claim`
```func
() auto_verify_claim(int claim_id) impure inline {
    (slice claim_data, int found) = claims_dict.udict_get?(64, claim_id);
    throw_unless(404, found);

    int policy_id = claim_data~load_uint(64);
    (slice policy_data, int p_found) = policies_dict.udict_get?(64, policy_id);

    int coverage_type = policy_data~load_uint(8);

    int auto_approved = 0;

    ;; USDT Depeg auto-verification
    if (coverage_type == 1) {
        ;; Query oracle for USDT price
        int usdt_price = get_oracle_price("USDT");
        int duration = get_oracle_duration_below_threshold("USDT", 950000);  ;; $0.95

        if ((usdt_price < 950000) & (duration >= 14400)) {  ;; 4 hours
            auto_approved = 1;
        }
    }

    ;; Protocol Exploit auto-verification
    if (coverage_type == 2) {
        ;; Check if protocol officially announced exploit
        int event_hash = get_event_hash(policy_id);
        (slice event_data, int e_found) = verified_events.udict_get?(256, event_hash);
        if (e_found) {
            auto_approved = 1;
        }
    }

    ;; Bridge Hack auto-verification
    if (coverage_type == 3) {
        ;; Check bridge status
        int bridge_paused = get_bridge_status();
        if (bridge_paused == 1) {
            auto_approved = 1;
        }
    }

    if (auto_approved) {
        approve_claim(claim_id, 1);  ;; 1 = auto-approved
    } else {
        ;; Initiate voting
        start_claim_voting(claim_id);
    }
}
```

##### `vote_on_claim`
```func
() vote_on_claim(
    slice voter_address,
    int claim_id,
    int vote  ;; 1 = approve, 0 = reject
) impure inline {
    ;; Load claim
    (slice claim_data, int found) = claims_dict.udict_get?(64, claim_id);
    throw_unless(404, found);

    ;; Get voter's SURE stake from StakingPool
    int voting_power = get_voter_stake(voter_address);
    throw_unless(403, voting_power >= 100);  ;; Min 100 SURE to vote

    ;; Record vote
    record_vote(claim_id, voter_address, vote, voting_power);

    ;; Check if voting period ended
    int vote_end_time = claim_data~load_uint(32) + 259200;  ;; 72 hours
    if (now() >= vote_end_time) {
        finalize_claim_vote(claim_id);
    }
}
```

##### `approve_claim`
```func
() approve_claim(int claim_id, int auto_approved) impure inline {
    (slice claim_data, int found) = claims_dict.udict_get?(64, claim_id);
    throw_unless(404, found);

    int policy_id = claim_data~load_uint(64);
    slice user_address = claim_data~load_msg_addr();

    ;; Load policy to get payout amount
    (slice policy_data, int p_found) = policies_dict.udict_get?(64, policy_id);
    int coverage_amount = policy_data~load_coins();

    ;; Update claim status
    claim_data~store_uint(1, 8);  ;; status = approved
    claim_data~store_uint(auto_approved, 1);
    claims_dict~udict_set(64, claim_id, claim_data);

    ;; Update policy (mark as claimed)
    policy_data~store_uint(1, 1);  ;; claimed = true
    policies_dict~udict_set(64, policy_id, policy_data);

    ;; Process payout from treasury
    process_payout(user_address, coverage_amount);

    emit_claim_approved(claim_id, policy_id, coverage_amount);
}
```

#### Auto-Approval Criteria

| Coverage Type | Criteria | Verification Method |
|---------------|----------|---------------------|
| USDT Depeg | Price < $0.95 for 4+ hours | Chainlink oracle |
| Protocol Exploit | Official announcement + TVL drop | Event registry + oracle |
| Bridge Hack | Bridge paused by team | Bridge status oracle |

---

### 3. SUREToken Contract (Jetton)

**File**: `contracts/sure_token.fc`

#### Purpose
Governance token following TON Jetton standard (TEP-74).

#### Token Parameters
```func
const int TOTAL_SUPPLY = 1000000000000000000;  ;; 1 billion SURE (9 decimals)
const slice TOKEN_NAME = "Tonsurance Governance Token";
const slice TOKEN_SYMBOL = "SURE";
const int DECIMALS = 9;
```

#### Distribution
```func
;; Initial distribution on deployment
() distribute_initial_supply() impure inline {
    ;; Community Rewards: 400M (40%)
    mint_to(community_rewards_addr, 400000000000000000);

    ;; Team & Advisors: 200M (20%), 4-year vesting
    deploy_vesting_contract(team_addr, 200000000000000000, 1461);  ;; 4 years in days

    ;; Treasury: 200M (20%)
    mint_to(treasury_addr, 200000000000000000);

    ;; Initial Liquidity: 100M (10%)
    mint_to(liquidity_pool_addr, 100000000000000000);

    ;; Reserve: 100M (10%)
    mint_to(reserve_addr, 100000000000000000);
}
```

#### Standard Jetton Methods
- `transfer()` - Transfer tokens
- `burn()` - Burn tokens
- `get_wallet_data()` - Get wallet balance
- `get_jetton_data()` - Get token metadata

---

### 4. GovernanceVoting Contract

**File**: `contracts/governance_voting.fc`

#### Purpose
DAO governance for protocol parameters, upgrades, and treasury management.

#### Proposal Types
```func
const int PROPOSAL_PARAMETER_CHANGE = 1;  ;; e.g., change premium rates
const int PROPOSAL_ADD_COVERAGE = 2;      ;; Add new coverage type
const int PROPOSAL_TREASURY_SPEND = 3;    ;; Allocate funds
const int PROPOSAL_UPGRADE_CONTRACT = 4;  ;; Upgrade contract code
```

#### Key Methods

##### `create_proposal`
```func
() create_proposal(
    slice proposer_address,
    int proposal_type,
    cell proposal_data,
    slice description
) impure inline {
    ;; Require minimum SURE stake to propose
    int proposer_stake = get_voter_stake(proposer_address);
    throw_unless(403, proposer_stake >= 10000);  ;; 10k SURE minimum

    int proposal_id = next_proposal_id;
    int start_time = now();
    int end_time = start_time + 604800;  ;; 7-day voting period

    cell proposal = begin_cell()
        .store_uint(proposal_id, 64)
        .store_uint(proposal_type, 8)
        .store_slice(proposer_address)
        .store_uint(start_time, 32)
        .store_uint(end_time, 32)
        .store_uint(0, 128)  ;; yes votes
        .store_uint(0, 128)  ;; no votes
        .store_ref(proposal_data)
        .store_ref(description)
        .end_cell();

    proposals_dict~udict_set(64, proposal_id, proposal.begin_parse());
    next_proposal_id += 1;

    emit_proposal_created(proposal_id, proposer_address, proposal_type);
}
```

##### `vote_on_proposal`
```func
() vote_on_proposal(
    slice voter_address,
    int proposal_id,
    int vote  ;; 1 = yes, 0 = no
) impure inline {
    ;; Get voting power
    int voting_power = get_voter_stake(voter_address);
    throw_unless(403, voting_power > 0);

    ;; Load proposal
    (slice proposal_data, int found) = proposals_dict.udict_get?(64, proposal_id);
    throw_unless(404, found);

    ;; Verify voting period active
    int start_time = proposal_data~load_uint(32);
    int end_time = proposal_data~load_uint(32);
    throw_unless(410, now() >= start_time);
    throw_unless(411, now() <= end_time);

    ;; Check if already voted
    int already_voted = check_vote_exists(proposal_id, voter_address);
    throw_unless(412, already_voted == 0);

    ;; Record vote
    if (vote == 1) {
        proposal_data~store_uint(yes_votes + voting_power, 128);
    } else {
        proposal_data~store_uint(no_votes + voting_power, 128);
    }

    proposals_dict~udict_set(64, proposal_id, proposal_data);
    record_voter(proposal_id, voter_address, vote, voting_power);

    emit_vote_cast(proposal_id, voter_address, vote, voting_power);
}
```

##### `execute_proposal`
```func
() execute_proposal(int proposal_id) impure inline {
    (slice proposal_data, int found) = proposals_dict.udict_get?(64, proposal_id);
    throw_unless(404, found);

    ;; Check voting ended
    int end_time = proposal_data~load_uint(32);
    throw_unless(410, now() > end_time);

    ;; Check quorum (15% of total supply)
    int yes_votes = proposal_data~load_uint(128);
    int no_votes = proposal_data~load_uint(128);
    int total_votes = yes_votes + no_votes;
    throw_unless(420, total_votes >= (TOTAL_SUPPLY / 100 * 15));

    ;; Check majority (>50%)
    throw_unless(421, yes_votes > no_votes);

    ;; Execute based on type
    int proposal_type = proposal_data~load_uint(8);
    if (proposal_type == PROPOSAL_PARAMETER_CHANGE) {
        execute_parameter_change(proposal_id);
    } elseif (proposal_type == PROPOSAL_ADD_COVERAGE) {
        execute_add_coverage(proposal_id);
    } elseif (proposal_type == PROPOSAL_TREASURY_SPEND) {
        execute_treasury_spend(proposal_id);
    } elseif (proposal_type == PROPOSAL_UPGRADE_CONTRACT) {
        execute_upgrade(proposal_id);
    }

    emit_proposal_executed(proposal_id);
}
```

---

### 5. StakingPool Contract

**File**: `contracts/staking_pool.fc`

#### Purpose
Allow users to stake SURE tokens to earn protocol fee share and gain voting power.

#### Storage Structure
```func
global cell stakers_dict;  ;; address -> stake_data
global int total_staked;
global int accumulated_rewards;
global int last_distribution_time;
```

#### Key Methods

##### `stake`
```func
() stake(slice user_address, int amount) impure inline {
    throw_unless(400, amount >= 100000000000);  ;; Min 100 SURE

    ;; Transfer SURE from user
    transfer_jetton(user_address, staking_pool_address, amount);

    ;; Update stake
    (slice stake_data, int found) = stakers_dict.udict_get?(267, user_address);

    int current_stake = 0;
    int rewards_debt = 0;
    int stake_time = now();

    if (found) {
        current_stake = stake_data~load_coins();
        rewards_debt = stake_data~load_coins();
    }

    current_stake += amount;
    total_staked += amount;

    cell new_stake_data = begin_cell()
        .store_coins(current_stake)
        .store_coins(rewards_debt)
        .store_uint(stake_time, 32)
        .end_cell();

    stakers_dict~udict_set(267, user_address, new_stake_data.begin_parse());

    emit_staked(user_address, amount);
}
```

##### `unstake`
```func
() unstake(slice user_address, int amount) impure inline {
    (slice stake_data, int found) = stakers_dict.udict_get?(267, user_address);
    throw_unless(404, found);

    int current_stake = stake_data~load_coins();
    throw_unless(400, amount <= current_stake);

    ;; Check lock period (7 days minimum)
    int stake_time = stake_data~load_uint(32);
    throw_unless(410, now() >= stake_time + 604800);

    ;; Claim pending rewards first
    claim_rewards(user_address);

    ;; Update stake
    current_stake -= amount;
    total_staked -= amount;

    if (current_stake > 0) {
        stake_data~store_coins(current_stake);
        stakers_dict~udict_set(267, user_address, stake_data);
    } else {
        stakers_dict~udict_delete?(267, user_address);
    }

    ;; Transfer SURE back to user
    transfer_jetton(staking_pool_address, user_address, amount);

    emit_unstaked(user_address, amount);
}
```

##### `distribute_fees`
```func
() distribute_fees(int premium_amount) impure inline {
    ;; Called when premium is paid
    ;; 50% of premiums go to stakers
    int rewards_amount = premium_amount / 2;
    accumulated_rewards += rewards_amount;
    last_distribution_time = now();

    emit_fees_distributed(rewards_amount);
}
```

##### `claim_rewards`
```func
() claim_rewards(slice user_address) impure inline {
    (slice stake_data, int found) = stakers_dict.udict_get?(267, user_address);
    throw_unless(404, found);

    int current_stake = stake_data~load_coins();
    int rewards_debt = stake_data~load_coins();

    ;; Calculate pending rewards
    int pending_rewards = calculate_pending_rewards(current_stake, rewards_debt);

    if (pending_rewards > 0) {
        ;; Transfer rewards to user (in TON)
        send_ton(user_address, pending_rewards);

        ;; Update rewards debt
        stake_data~store_coins(current_stake);
        stake_data~store_coins(rewards_debt + pending_rewards);
        stakers_dict~udict_set(267, user_address, stake_data);

        emit_rewards_claimed(user_address, pending_rewards);
    }
}
```

---

### 6. Treasury Contract

**File**: `contracts/treasury.fc`

#### Purpose
Hold protocol premiums, reserves, and manage payouts.

#### Storage Structure
```func
global int total_premiums_collected;
global int total_payouts_made;
global int reserve_balance;
global slice governance_address;
global slice claims_processor_address;
```

#### Key Methods

##### `receive_premium`
```func
() receive_premium(int policy_id, int amount) impure inline {
    ;; Called by PolicyFactory when premium paid
    total_premiums_collected += amount;

    ;; Allocate funds
    int to_stakers = amount / 2;  ;; 50% to stakers
    int to_reserve = amount / 2;  ;; 50% to reserve

    ;; Send to staking pool for distribution
    send_ton(staking_pool_address, to_stakers);

    reserve_balance += to_reserve;

    emit_premium_received(policy_id, amount);
}
```

##### `process_payout`
```func
() process_payout(slice recipient, int amount) impure inline {
    ;; Only ClaimsProcessor can call
    throw_unless(403, equal_slices(sender(), claims_processor_address));

    ;; Check sufficient balance
    throw_unless(400, reserve_balance >= amount);

    ;; Send payout
    send_ton(recipient, amount);

    reserve_balance -= amount;
    total_payouts_made += amount;

    emit_payout_processed(recipient, amount);
}
```

---

### 7. PriceOracle Contract

**File**: `contracts/price_oracle.fc`

#### Purpose
Aggregate price feeds from Chainlink and custom sources.

#### Supported Feeds
- USDT/USD
- TON/USD
- Protocol TVL data
- Bridge status

#### Key Methods

##### `update_price`
```func
() update_price(slice asset, int price, int timestamp) impure inline {
    ;; Only oracle operators can update
    throw_unless(403, is_oracle_operator(sender()));

    ;; Store price
    cell price_data = begin_cell()
        .store_coins(price)
        .store_uint(timestamp, 32)
        .end_cell();

    prices_dict~udict_set(256, asset, price_data.begin_parse());

    emit_price_updated(asset, price, timestamp);
}
```

##### `get_price`
```func
int get_price(slice asset) method_id {
    (slice price_data, int found) = prices_dict.udict_get?(256, asset);
    throw_unless(404, found);

    int price = price_data~load_coins();
    int timestamp = price_data~load_uint(32);

    ;; Check price freshness (max 1 hour old)
    throw_unless(410, now() - timestamp <= 3600);

    return price;
}
```

---

## Frontend Implementation

### Technology Stack

**Core:**
- React 18.2+ (with hooks)
- TypeScript 5.0+
- Vite (build tool)
- TailwindCSS 3.3+

**TON Integration:**
- @tonconnect/ui-react ^2.0.0
- @ton/ton ^14.0.0
- @ton/core ^0.56.0

**Telegram:**
- @telegram-apps/sdk ^1.0.0

**State Management:**
- Zustand (lightweight, simple)
- TanStack Query (server state)

**UI Components:**
- Headless UI (accessible components)
- Lucide React (icons)
- Framer Motion (animations)

**Forms:**
- React Hook Form
- Zod (validation)

---

### Project Structure

```
Tonsurance/
├── contracts/              # FunC smart contracts
│   ├── policy_factory.fc
│   ├── claims_processor.fc
│   ├── sure_token.fc
│   ├── governance_voting.fc
│   ├── staking_pool.fc
│   ├── treasury.fc
│   └── price_oracle.fc
│
├── wrappers/               # TypeScript contract wrappers
│   ├── PolicyFactory.ts
│   ├── ClaimsProcessor.ts
│   ├── SUREToken.ts
│   ├── GovernanceVoting.ts
│   └── StakingPool.ts
│
├── tests/                  # Contract tests
│   ├── PolicyFactory.spec.ts
│   └── ClaimsProcessor.spec.ts
│
├── scripts/                # Deployment scripts
│   ├── deployPolicyFactory.ts
│   └── deployAll.ts
│
├── frontend/               # React Mini-App
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx
│   │   │   ├── routes.tsx
│   │   │   └── layout/
│   │   │       ├── Header.tsx
│   │   │       └── Navigation.tsx
│   │   │
│   │   ├── features/
│   │   │   ├── policy/
│   │   │   │   ├── components/
│   │   │   │   │   ├── CoverageSelector.tsx
│   │   │   │   │   ├── AmountSlider.tsx
│   │   │   │   │   ├── DurationPicker.tsx
│   │   │   │   │   └── PolicySummary.tsx
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── usePolicyPurchase.ts
│   │   │   │   │   └── usePremiumCalculator.ts
│   │   │   │   ├── store/
│   │   │   │   │   └── policyStore.ts
│   │   │   │   └── PolicyPurchasePage.tsx
│   │   │   │
│   │   │   ├── claims/
│   │   │   │   ├── components/
│   │   │   │   │   ├── ClaimForm.tsx
│   │   │   │   │   ├── EvidenceUpload.tsx
│   │   │   │   │   └── ClaimStatus.tsx
│   │   │   │   ├── hooks/
│   │   │   │   │   └── useFileClaim.ts
│   │   │   │   └── ClaimsPage.tsx
│   │   │   │
│   │   │   ├── governance/
│   │   │   │   ├── components/
│   │   │   │   │   ├── ProposalCard.tsx
│   │   │   │   │   ├── VoteButton.tsx
│   │   │   │   │   └── VotingProgress.tsx
│   │   │   │   └── GovernancePage.tsx
│   │   │   │
│   │   │   └── wallet/
│   │   │       ├── components/
│   │   │       │   └── WalletConnect.tsx
│   │   │       └── hooks/
│   │   │           └── useWallet.ts
│   │   │
│   │   ├── shared/
│   │   │   ├── components/
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Card.tsx
│   │   │   │   ├── Input.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   └── Loading.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useTelegram.ts
│   │   │   │   └── useContract.ts
│   │   │   └── utils/
│   │   │       ├── formatting.ts
│   │   │       ├── validation.ts
│   │   │       └── constants.ts
│   │   │
│   │   ├── config/
│   │   │   ├── ton.config.ts
│   │   │   ├── telegram.config.ts
│   │   │   └── env.ts
│   │   │
│   │   └── types/
│   │       ├── policy.types.ts
│   │       ├── claim.types.ts
│   │       └── contract.types.ts
│   │
│   ├── public/
│   │   ├── index.html
│   │   ├── manifest.json
│   │   └── assets/
│   │
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── tailwind.config.js
│
└── backend/                # Node.js API
    ├── src/
    │   ├── api/
    │   │   ├── routes/
    │   │   └── controllers/
    │   ├── services/
    │   │   ├── blockchain.service.ts
    │   │   ├── notification.service.ts
    │   │   └── analytics.service.ts
    │   ├── db/
    │   │   ├── models/
    │   │   └── migrations/
    │   └── utils/
    ├── package.json
    └── tsconfig.json
```

---

### Key Frontend Components

#### 1. WalletConnect Component

**File**: `frontend/src/features/wallet/components/WalletConnect.tsx`

```typescript
import { TonConnectButton, useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { useEffect } from 'react';
import { useTelegram } from '@/shared/hooks/useTelegram';

export function WalletConnect() {
  const [tonConnectUI] = useTonConnectUI();
  const userFriendlyAddress = useTonAddress();
  const { webApp } = useTelegram();

  useEffect(() => {
    if (userFriendlyAddress) {
      // Connected - style Telegram UI
      webApp?.expand();
      webApp?.setHeaderColor('#0088CC');
    }
  }, [userFriendlyAddress, webApp]);

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {!userFriendlyAddress ? (
        <>
          <h2 className="text-2xl font-semibold text-gray-800">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600 text-center">
            Connect your TON wallet to get started with Tonsurance
          </p>
          <TonConnectButton className="mt-4" />
        </>
      ) : (
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" />
          <div>
            <p className="text-sm text-gray-500">Connected</p>
            <p className="font-mono text-sm">
              {userFriendlyAddress.slice(0, 6)}...{userFriendlyAddress.slice(-4)}
            </p>
          </div>
          <button
            onClick={() => tonConnectUI.disconnect()}
            className="ml-auto text-sm text-red-500 hover:text-red-600"
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
```

---

#### 2. Policy Purchase Hook

**File**: `frontend/src/features/policy/hooks/usePolicyPurchase.ts`

```typescript
import { useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { Address, beginCell, toNano } from '@ton/core';
import { usePolicyFactory } from '@/shared/hooks/useContract';

interface PolicyParams {
  coverageType: number;
  coverageAmount: number;
  durationDays: number;
}

export function usePolicyPurchase() {
  const [tonConnectUI] = useTonConnectUI();
  const policyFactory = usePolicyFactory();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculatePremium = (params: PolicyParams): number => {
    const { coverageType, coverageAmount, durationDays } = params;

    // Base rates (APR in bps)
    const baseRates = {
      1: 80,   // USDT depeg: 0.8%
      2: 200,  // Protocol: 2%
      3: 200,  // Bridge: 2%
      4: 500,  // Rug pull: 5%
    };

    const baseRate = baseRates[coverageType as keyof typeof baseRates] || 200;

    // Time multiplier
    const timeMultipliers = {
      30: 1.2,
      90: 1.0,
      180: 0.9,
    };
    const timeMultiplier = timeMultipliers[durationDays as keyof typeof timeMultipliers] || 1.0;

    // Calculate: (amount * rate * days / 365 / 10000) * time_multiplier
    const premium = (coverageAmount * baseRate * durationDays) / (365 * 10000) * timeMultiplier;

    return premium;
  };

  const purchasePolicy = async (params: PolicyParams) => {
    setLoading(true);
    setError(null);

    try {
      const premium = calculatePremium(params);
      const premiumNano = toNano(premium);

      // Create transaction
      const tx = {
        validUntil: Math.floor(Date.now() / 1000) + 600, // 10 minutes
        messages: [
          {
            address: policyFactory.address.toString(),
            amount: premiumNano.toString(),
            payload: beginCell()
              .storeUint(1, 32) // op: create_policy
              .storeUint(params.coverageType, 8)
              .storeCoins(toNano(params.coverageAmount))
              .storeUint(params.durationDays, 16)
              .endCell()
              .toBoc()
              .toString('base64'),
          },
        ],
      };

      // Send transaction
      const result = await tonConnectUI.sendTransaction(tx);

      // Wait for confirmation
      // (In production, poll blockchain for tx confirmation)
      await new Promise((resolve) => setTimeout(resolve, 3000));

      return {
        success: true,
        txHash: result.boc,
        premium,
      };
    } catch (err: any) {
      setError(err.message || 'Failed to purchase policy');
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  return {
    purchasePolicy,
    calculatePremium,
    loading,
    error,
  };
}
```

---

#### 3. Coverage Selector Component

**File**: `frontend/src/features/policy/components/CoverageSelector.tsx`

```typescript
import { Shield, Lock, Bridge, AlertTriangle } from 'lucide-react';
import { Card } from '@/shared/components/Card';

interface CoverageOption {
  id: number;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  baseRate: string;
  available: boolean;
}

const coverageOptions: CoverageOption[] = [
  {
    id: 1,
    name: 'USDT Depeg Protection',
    description: 'Protects against USDT dropping below $0.95 for 4+ hours',
    icon: Shield,
    baseRate: '0.8% APR',
    available: true,
  },
  {
    id: 2,
    name: 'Protocol Exploit',
    description: 'Coverage for smart contract hacks on STON.fi, DeDust',
    icon: Lock,
    baseRate: '1.5-3% APR',
    available: true,
  },
  {
    id: 3,
    name: 'Bridge Hack Protection',
    description: 'Protects funds during TON bridge transactions',
    icon: Bridge,
    baseRate: '2% APR',
    available: true,
  },
  {
    id: 4,
    name: 'Rug Pull Insurance',
    description: 'Protection against new token rug pulls',
    icon: AlertTriangle,
    baseRate: '5% APR',
    available: false,
  },
];

interface Props {
  selectedId: number | null;
  onSelect: (id: number) => void;
}

export function CoverageSelector({ selectedId, onSelect }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-800">
        Choose Coverage Type
      </h2>

      <div className="grid gap-3">
        {coverageOptions.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedId === option.id;

          return (
            <Card
              key={option.id}
              className={`
                p-4 cursor-pointer transition-all
                ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-gray-50'}
                ${!option.available ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              onClick={() => option.available && onSelect(option.id)}
            >
              <div className="flex items-start gap-3">
                <div className={`
                  p-2 rounded-lg
                  ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}
                `}>
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900">
                      {option.name}
                    </h3>
                    {!option.available && (
                      <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                        Coming Soon
                      </span>
                    )}
                  </div>

                  <p className="text-sm text-gray-600 mt-1">
                    {option.description}
                  </p>

                  <p className="text-xs text-blue-600 mt-2 font-medium">
                    Premium: {option.baseRate}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
```

---

#### 4. Premium Calculator Component

**File**: `frontend/src/features/policy/components/PremiumCalculator.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Slider } from '@/shared/components/Slider';
import { Card } from '@/shared/components/Card';

interface Props {
  coverageType: number;
  onParamsChange: (params: {
    amount: number;
    duration: number;
    premium: number;
  }) => void;
}

export function PremiumCalculator({ coverageType, onParamsChange }: Props) {
  const [amount, setAmount] = useState(500); // Default $500
  const [duration, setDuration] = useState(90); // Default 90 days

  const calculatePremium = (amt: number, dur: number): number => {
    const baseRates: Record<number, number> = {
      1: 0.008,  // 0.8%
      2: 0.02,   // 2%
      3: 0.02,   // 2%
      4: 0.05,   // 5%
    };

    const timeMultipliers: Record<number, number> = {
      30: 1.2,
      90: 1.0,
      180: 0.9,
    };

    const baseRate = baseRates[coverageType] || 0.02;
    const timeMultiplier = timeMultipliers[dur] || 1.0;

    return (amt * baseRate * (dur / 365)) * timeMultiplier;
  };

  const premium = calculatePremium(amount, duration);

  useEffect(() => {
    onParamsChange({ amount, duration, premium });
  }, [amount, duration, premium]);

  return (
    <Card className="p-6 space-y-6">
      {/* Amount Slider */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-sm font-medium text-gray-700">
            Coverage Amount
          </label>
          <span className="text-lg font-semibold text-blue-600">
            ${amount}
          </span>
        </div>

        <Slider
          min={10}
          max={1000}
          step={10}
          value={amount}
          onChange={setAmount}
          className="w-full"
        />

        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>$10</span>
          <span>$1,000</span>
        </div>
      </div>

      {/* Duration Selector */}
      <div>
        <label className="text-sm font-medium text-gray-700 mb-2 block">
          Coverage Duration
        </label>

        <div className="grid grid-cols-3 gap-2">
          {[30, 90, 180].map((d) => (
            <button
              key={d}
              onClick={() => setDuration(d)}
              className={`
                py-2 px-4 rounded-lg font-medium transition-colors
                ${duration === d
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {/* Premium Display */}
      <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-lg">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-gray-600">Premium</p>
            <p className="text-2xl font-bold text-gray-900">
              ${premium.toFixed(2)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">In TON</p>
            <p className="text-lg font-semibold text-blue-600">
              {(premium / 32.5).toFixed(3)} TON
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="text-xs text-gray-600 space-y-1">
        <p>✓ Coverage: ${amount}</p>
        <p>✓ Duration: {duration} days</p>
        <p>✓ Premium: ${premium.toFixed(2)}</p>
      </div>
    </Card>
  );
}
```

---

### State Management

**File**: `frontend/src/features/policy/store/policyStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Policy {
  id: string;
  coverageType: number;
  coverageAmount: number;
  premium: number;
  duration: number;
  startTime: number;
  endTime: number;
  status: 'active' | 'expired' | 'claimed';
  nftAddress?: string;
}

interface PolicyStore {
  policies: Policy[];
  addPolicy: (policy: Policy) => void;
  updatePolicy: (id: string, updates: Partial<Policy>) => void;
  getActivePolicy: (id: string) => Policy | undefined;
  getActivePolicies: () => Policy[];
}

export const usePolicyStore = create<PolicyStore>()(
  persist(
    (set, get) => ({
      policies: [],

      addPolicy: (policy) =>
        set((state) => ({
          policies: [...state.policies, policy],
        })),

      updatePolicy: (id, updates) =>
        set((state) => ({
          policies: state.policies.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          ),
        })),

      getActivePolicy: (id) =>
        get().policies.find((p) => p.id === id && p.status === 'active'),

      getActivePolicies: () =>
        get().policies.filter((p) => p.status === 'active'),
    }),
    {
      name: 'tonsurance-policies',
    }
  )
);
```

---

## Backend Services

### API Architecture

**Framework**: Express.js (Node.js)

**Structure**:
```
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── policies.routes.ts
│   │   │   ├── claims.routes.ts
│   │   │   ├── governance.routes.ts
│   │   │   └── analytics.routes.ts
│   │   └── controllers/
│   │       ├── policies.controller.ts
│   │       ├── claims.controller.ts
│   │       └── governance.controller.ts
│   ├── services/
│   │   ├── blockchain.service.ts
│   │   ├── indexer.service.ts
│   │   ├── notification.service.ts
│   │   ├── oracle.service.ts
│   │   └── analytics.service.ts
│   ├── db/
│   │   ├── models/
│   │   │   ├── User.model.ts
│   │   │   ├── Policy.model.ts
│   │   │   └── Claim.model.ts
│   │   └── migrations/
│   ├── jobs/
│   │   ├── indexer.job.ts
│   │   ├── oracle-update.job.ts
│   │   └── expiry-check.job.ts
│   ├── config/
│   │   ├── database.ts
│   │   ├── redis.ts
│   │   └── ton.ts
│   └── utils/
│       ├── logger.ts
│       └── errors.ts
```

---

### Key Services

#### 1. Blockchain Indexer Service

**Purpose**: Index TON blockchain events for policies, claims, and governance.

**File**: `backend/src/services/indexer.service.ts`

```typescript
import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';
import { db } from '../db';

export class BlockchainIndexer {
  private client: TonClient;
  private lastProcessedBlock: number = 0;

  constructor() {
    this.client = new TonClient({
      endpoint: process.env.TON_RPC_ENDPOINT!,
    });
  }

  async start() {
    console.log('Starting blockchain indexer...');
    setInterval(() => this.indexNewBlocks(), 10000); // Every 10 seconds
  }

  async indexNewBlocks() {
    try {
      const latestBlock = await this.client.getLastBlock();

      if (latestBlock.seqno > this.lastProcessedBlock) {
        await this.processBlockRange(
          this.lastProcessedBlock + 1,
          latestBlock.seqno
        );
        this.lastProcessedBlock = latestBlock.seqno;
      }
    } catch (error) {
      console.error('Indexing error:', error);
    }
  }

  async processBlockRange(fromBlock: number, toBlock: number) {
    // Fetch transactions in block range
    const transactions = await this.client.getTransactions(
      Address.parse(process.env.POLICY_FACTORY_ADDRESS!),
      { limit: 100 }
    );

    for (const tx of transactions) {
      await this.processTransaction(tx);
    }
  }

  async processTransaction(tx: any) {
    // Parse transaction body to identify event type
    const body = tx.inMessage?.body;
    if (!body) return;

    // Identify event (PolicyCreated, ClaimFiled, etc.)
    const op = body.beginParse().loadUint(32);

    switch (op) {
      case 0x01: // PolicyCreated
        await this.handlePolicyCreated(tx);
        break;
      case 0x02: // ClaimFiled
        await this.handleClaimFiled(tx);
        break;
      case 0x03: // ClaimApproved
        await this.handleClaimApproved(tx);
        break;
      // ... more cases
    }
  }

  async handlePolicyCreated(tx: any) {
    // Parse policy data from transaction
    const policyData = this.parsePolicyData(tx);

    // Store in database
    await db.policy.create({
      data: {
        policyId: policyData.id,
        userAddress: policyData.userAddress,
        coverageType: policyData.coverageType,
        coverageAmount: policyData.coverageAmount,
        premium: policyData.premium,
        startTime: new Date(policyData.startTime * 1000),
        endTime: new Date(policyData.endTime * 1000),
        txHash: tx.hash().toString('hex'),
        status: 'active',
      },
    });

    // Send notification to user
    await this.sendNotification(
      policyData.userAddress,
      'Policy Created',
      `Your policy #${policyData.id} is now active! 🛡️`
    );
  }

  async handleClaimFiled(tx: any) {
    const claimData = this.parseClaimData(tx);

    await db.claim.create({
      data: {
        claimId: claimData.id,
        policyId: claimData.policyId,
        userAddress: claimData.userAddress,
        filedAt: new Date(claimData.timestamp * 1000),
        status: 'pending',
        evidence: claimData.evidence,
      },
    });

    await this.sendNotification(
      claimData.userAddress,
      'Claim Filed',
      `Your claim #${claimData.id} has been submitted. We're reviewing it now.`
    );
  }

  // ... more handlers
}
```

---

#### 2. Notification Service (Telegram Bot)

**Purpose**: Send push notifications to users via Telegram.

**File**: `backend/src/services/notification.service.ts`

```typescript
import TelegramBot from 'node-telegram-bot-api';

export class NotificationService {
  private bot: TelegramBot;

  constructor() {
    this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, {
      polling: false,
    });
  }

  async sendPolicyCreated(userId: string, policyId: string) {
    const message = `
🛡️ *Policy Created Successfully!*

Policy ID: #${policyId}
Status: Active

Your crypto is now Tonsured! View details in the app.

[View Policy](https://t.me/tonsurance_bot/app?policy=${policyId})
    `;

    await this.bot.sendMessage(userId, message, {
      parse_mode: 'Markdown',
    });
  }

  async sendClaimUpdate(
    userId: string,
    claimId: string,
    status: 'approved' | 'rejected'
  ) {
    const emoji = status === 'approved' ? '✅' : '❌';
    const message = `
${emoji} *Claim ${status === 'approved' ? 'Approved' : 'Rejected'}*

Claim ID: #${claimId}

${
  status === 'approved'
    ? 'Your payout will be processed within 24 hours.'
    : 'Your claim did not meet approval criteria. You can appeal this decision.'
}

[View Details](https://t.me/tonsurance_bot/app?claim=${claimId})
    `;

    await this.bot.sendMessage(userId, message, {
      parse_mode: 'Markdown',
    });
  }

  async sendPolicyExpiringSoon(userId: string, policyId: string, daysLeft: number) {
    const message = `
⏰ *Policy Expiring Soon*

Your policy #${policyId} expires in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.

Renew now to keep your crypto protected!

[Renew Policy](https://t.me/tonsurance_bot/app?renew=${policyId})
    `;

    await this.bot.sendMessage(userId, message, {
      parse_mode: 'Markdown',
    });
  }
}
```

---

#### 3. Oracle Service

**Purpose**: Fetch and update price feeds for auto-claim verification.

**File**: `backend/src/services/oracle.service.ts`

```typescript
import axios from 'axios';
import { TonClient } from '@ton/ton';
import { Address } from '@ton/core';

export class OracleService {
  private client: TonClient;
  private oracleAddress: Address;

  constructor() {
    this.client = new TonClient({
      endpoint: process.env.TON_RPC_ENDPOINT!,
    });
    this.oracleAddress = Address.parse(process.env.ORACLE_CONTRACT_ADDRESS!);
  }

  async updatePrices() {
    // Fetch USDT price from multiple sources
    const usdtPrice = await this.fetchUSDTPrice();

    // Fetch TON price
    const tonPrice = await this.fetchTONPrice();

    // Update on-chain oracle
    await this.updateOnChainPrice('USDT', usdtPrice);
    await this.updateOnChainPrice('TON', tonPrice);

    console.log(`Updated prices: USDT=${usdtPrice}, TON=${tonPrice}`);
  }

  async fetchUSDTPrice(): Promise<number> {
    try {
      // Use multiple sources for reliability
      const sources = [
        'https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd',
        'https://api.coinbase.com/v2/prices/USDT-USD/spot',
      ];

      const results = await Promise.allSettled(
        sources.map((url) => axios.get(url))
      );

      const prices: number[] = [];

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          const data = result.value.data;
          // Parse based on source format
          if (data.tether) {
            prices.push(data.tether.usd);
          } else if (data.data) {
            prices.push(parseFloat(data.data.amount));
          }
        }
      });

      // Return median price
      prices.sort((a, b) => a - b);
      return prices[Math.floor(prices.length / 2)];
    } catch (error) {
      console.error('Failed to fetch USDT price:', error);
      throw error;
    }
  }

  async fetchTONPrice(): Promise<number> {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd'
    );
    return response.data['the-open-network'].usd;
  }

  async updateOnChainPrice(asset: string, price: number) {
    // Create transaction to update oracle contract
    // (Implementation depends on oracle contract interface)

    // For now, store in Redis as backup
    await redis.set(`price:${asset}`, price.toString());
    await redis.set(`price:${asset}:timestamp`, Date.now().toString());
  }

  async checkDepegEvent(): Promise<boolean> {
    const usdtPrice = await this.fetchUSDTPrice();

    if (usdtPrice < 0.95) {
      // Check if sustained for 4+ hours
      const depegStart = await redis.get('depeg:usdt:start');

      if (!depegStart) {
        await redis.set('depeg:usdt:start', Date.now().toString());
        return false;
      }

      const duration = Date.now() - parseInt(depegStart);
      const fourHours = 4 * 60 * 60 * 1000;

      if (duration >= fourHours) {
        // Trigger auto-approval for USDT depeg claims
        await this.triggerDepegClaims();
        return true;
      }
    } else {
      // Reset depeg timer
      await redis.del('depeg:usdt:start');
    }

    return false;
  }

  async triggerDepegClaims() {
    // Find all pending USDT depeg claims
    const claims = await db.claim.findMany({
      where: {
        status: 'pending',
        policy: {
          coverageType: 1, // USDT depeg
        },
      },
    });

    for (const claim of claims) {
      // Auto-approve claim
      await this.approveClaimOnChain(claim.claimId);
    }
  }
}
```

---

## Security Implementation

### Smart Contract Security

#### 1. Access Control
```func
;; Owner-only functions
() check_owner() impure inline {
    throw_unless(403, equal_slices(sender(), owner_address));
}

;; Authorized operators only
() check_operator() impure inline {
    int is_operator = check_is_operator(sender());
    throw_unless(403, is_operator);
}
```

#### 2. Reentrancy Protection
```func
global int locked;

() acquire_lock() impure inline {
    throw_unless(409, locked == 0);  ;; Already locked
    locked = 1;
}

() release_lock() impure inline {
    locked = 0;
}

;; Usage in functions
() sensitive_function() impure inline {
    acquire_lock();
    ;; ... operations ...
    release_lock();
}
```

#### 3. Input Validation
```func
() validate_policy_params(
    int coverage_amount,
    int coverage_type,
    int duration_days
) impure inline {
    ;; Amount bounds
    throw_unless(400, coverage_amount >= 10000000000);   ;; >= $10
    throw_unless(401, coverage_amount <= 1000000000000); ;; <= $1000

    ;; Valid coverage type
    throw_unless(402, (coverage_type >= 1) & (coverage_type <= 4));

    ;; Valid duration
    throw_unless(403,
        (duration_days == 30) |
        (duration_days == 90) |
        (duration_days == 180)
    );
}
```

#### 4. Emergency Pause
```func
global int paused;

() pause_contract() impure inline {
    check_owner();
    paused = 1;
    emit_contract_paused();
}

() unpause_contract() impure inline {
    check_owner();
    paused = 0;
    emit_contract_unpaused();
}

() check_not_paused() impure inline {
    throw_if(423, paused);  ;; Contract paused
}

;; Use in all external functions
() create_policy(...) impure inline {
    check_not_paused();
    ;; ... rest of logic
}
```

---

### Frontend Security

#### 1. Content Security Policy
```html
<!-- public/index.html -->
<meta http-equiv="Content-Security-Policy"
      content="
        default-src 'self';
        script-src 'self' 'unsafe-inline' https://telegram.org;
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: https:;
        connect-src 'self' https://tonapi.io https://toncenter.com;
        frame-ancestors 'self' https://web.telegram.org;
      ">
```

#### 2. Input Sanitization
```typescript
// frontend/src/shared/utils/validation.ts
import DOMPurify from 'dompurify';

export function sanitizeInput(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

export function validateAddress(address: string): boolean {
  try {
    Address.parse(address);
    return true;
  } catch {
    return false;
  }
}

export function validateAmount(amount: number): boolean {
  return (
    typeof amount === 'number' &&
    !isNaN(amount) &&
    amount >= 10 &&
    amount <= 1000
  );
}
```

#### 3. Transaction Verification
```typescript
// Before signing any transaction
async function verifyTransaction(tx: Transaction) {
  // Verify recipient is our contract
  const validAddresses = [
    process.env.POLICY_FACTORY_ADDRESS,
    process.env.STAKING_POOL_ADDRESS,
  ];

  if (!validAddresses.includes(tx.to)) {
    throw new Error('Invalid transaction recipient');
  }

  // Verify amount is reasonable
  if (tx.amount > toNano(1000)) {
    throw new Error('Transaction amount too high');
  }

  // Show confirmation to user
  const confirmed = await showConfirmationDialog({
    title: 'Confirm Transaction',
    message: `Send ${fromNano(tx.amount)} TON to ${tx.to}?`,
  });

  if (!confirmed) {
    throw new Error('User cancelled transaction');
  }

  return true;
}
```

---

### Backend Security

#### 1. Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max 100 requests per window
  message: 'Too many requests, please try again later.',
});

app.use('/api/', limiter);
```

#### 2. API Key Authentication
```typescript
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || !isValidApiKey(apiKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

app.use('/api/', authenticateApiKey);
```

#### 3. Database Security
```typescript
// Use parameterized queries (Prisma does this automatically)
const policy = await db.policy.findUnique({
  where: { id: policyId }, // Safe from SQL injection
});

// Never expose raw database errors
try {
  // ... database operations
} catch (error) {
  logger.error('Database error:', error);
  res.status(500).json({ error: 'Internal server error' });
}
```

---

## DevOps & Infrastructure

### Deployment Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Cloudflare CDN                     │
│             (Static Assets, DDoS Protection)         │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────┐
│              Load Balancer (AWS ALB)                 │
└─────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                    ▼
┌──────────────────┐              ┌──────────────────┐
│   Frontend       │              │   Backend API    │
│   (S3 + CloudFront) │              │   (ECS Fargate)  │
│   React PWA      │              │   Node.js        │
└──────────────────┘              └──────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
            ┌──────────────┐      ┌──────────────┐      ┌──────────────┐
            │  PostgreSQL  │      │    Redis     │      │  TON RPC     │
            │  (RDS)       │      │  (ElastiCache) │      │  Node        │
            └──────────────┘      └──────────────┘      └──────────────┘
```

---

### Docker Configuration

**File**: `backend/Dockerfile`

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/tonsurance
      - REDIS_URL=redis://redis:6379
      - TON_RPC_ENDPOINT=https://toncenter.com/api/v2/jsonRPC
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=tonsurance
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

### CI/CD Pipeline

**File**: `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm test

      - name: Build contracts
        run: npx blueprint build

  deploy-contracts:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3

      - name: Deploy to TON Mainnet
        run: npx blueprint run deployAll
        env:
          TON_WALLET_MNEMONIC: ${{ secrets.DEPLOYER_MNEMONIC }}
          TON_NETWORK: mainnet

  deploy-frontend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build frontend
        run: |
          cd frontend
          npm ci
          npm run build

      - name: Deploy to S3
        uses: jakejarvis/s3-sync-action@master
        with:
          args: --delete
        env:
          AWS_S3_BUCKET: ${{ secrets.AWS_S3_BUCKET }}
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          SOURCE_DIR: 'frontend/dist'

  deploy-backend:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Build and push Docker image
        run: |
          docker build -t tonsurance-api:${{ github.sha }} ./backend
          docker push tonsurance-api:${{ github.sha }}

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster tonsurance-cluster \
            --service tonsurance-api \
            --force-new-deployment
```

---

## Testing Strategy

### Smart Contract Tests

**File**: `tests/PolicyFactory.spec.ts`

```typescript
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { toNano } from '@ton/core';
import { PolicyFactory } from '../wrappers/PolicyFactory';
import '@ton/test-utils';

describe('PolicyFactory', () => {
  let blockchain: Blockchain;
  let policyFactory: SandboxContract<PolicyFactory>;
  let deployer: SandboxContract<TreasuryContract>;
  let user: SandboxContract<TreasuryContract>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury('deployer');
    user = await blockchain.treasury('user');

    policyFactory = blockchain.openContract(
      await PolicyFactory.fromInit(deployer.address)
    );

    await policyFactory.send(
      deployer.getSender(),
      { value: toNano('1') },
      { $$type: 'Deploy' }
    );
  });

  it('should create policy successfully', async () => {
    const result = await policyFactory.send(
      user.getSender(),
      { value: toNano('0.1') }, // Premium payment
      {
        $$type: 'CreatePolicy',
        coverageType: 1, // USDT depeg
        coverageAmount: toNano('500'),
        durationDays: 90,
      }
    );

    expect(result.transactions).toHaveTransaction({
      from: user.address,
      to: policyFactory.address,
      success: true,
    });

    // Check policy was created
    const policyCount = await policyFactory.getPolicyCount();
    expect(policyCount).toBe(1n);
  });

  it('should reject policy with invalid amount', async () => {
    const result = await policyFactory.send(
      user.getSender(),
      { value: toNano('0.01') },
      {
        $$type: 'CreatePolicy',
        coverageType: 1,
        coverageAmount: toNano('5'), // Too low (< $10)
        durationDays: 90,
      }
    );

    expect(result.transactions).toHaveTransaction({
      from: user.address,
      to: policyFactory.address,
      success: false,
      exitCode: 400, // Invalid amount
    });
  });

  it('should calculate premium correctly', async () => {
    const premium = await policyFactory.getCalculatePremium({
      coverageType: 1,
      coverageAmount: toNano('1000'),
      durationDays: 90,
    });

    // Expected: $1000 * 0.008 * (90/365) * 1.0 = $1.97
    expect(premium).toBeCloseTo(toNano('1.97'), 2);
  });
});
```

---

### Frontend Tests

**File**: `frontend/src/features/policy/components/CoverageSelector.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { CoverageSelector } from './CoverageSelector';

describe('CoverageSelector', () => {
  it('should render all coverage options', () => {
    render(<CoverageSelector selectedId={null} onSelect={() => {}} />);

    expect(screen.getByText('USDT Depeg Protection')).toBeInTheDocument();
    expect(screen.getByText('Protocol Exploit')).toBeInTheDocument();
    expect(screen.getByText('Bridge Hack Protection')).toBeInTheDocument();
    expect(screen.getByText('Rug Pull Insurance')).toBeInTheDocument();
  });

  it('should call onSelect when option clicked', () => {
    const onSelect = jest.fn();
    render(<CoverageSelector selectedId={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('USDT Depeg Protection'));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('should highlight selected option', () => {
    render(<CoverageSelector selectedId={1} onSelect={() => {}} />);

    const selectedCard = screen.getByText('USDT Depeg Protection').closest('div');
    expect(selectedCard).toHaveClass('ring-2');
  });

  it('should disable unavailable options', () => {
    render(<CoverageSelector selectedId={null} onSelect={() => {}} />);

    const rugPullOption = screen.getByText('Rug Pull Insurance').closest('div');
    expect(rugPullOption).toHaveClass('opacity-50');
  });
});
```

---

### Integration Tests

**File**: `backend/src/tests/policy-flow.integration.test.ts`

```typescript
import request from 'supertest';
import { app } from '../app';
import { db } from '../db';

describe('Policy Purchase Flow (Integration)', () => {
  beforeAll(async () => {
    await db.$connect();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('should complete full policy purchase flow', async () => {
    // 1. Calculate premium
    const premiumRes = await request(app)
      .post('/api/policies/calculate-premium')
      .send({
        coverageType: 1,
        coverageAmount: 500,
        durationDays: 90,
      });

    expect(premiumRes.status).toBe(200);
    expect(premiumRes.body.premium).toBeCloseTo(1.97, 2);

    // 2. Create policy
    const createRes = await request(app)
      .post('/api/policies/create')
      .send({
        coverageType: 1,
        coverageAmount: 500,
        durationDays: 90,
        txHash: '0x123abc...',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.policyId).toBeDefined();

    const policyId = createRes.body.policyId;

    // 3. Fetch policy details
    const getRes = await request(app).get(`/api/policies/${policyId}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('active');
  });
});
```

---

## Monitoring & Observability

### Logging

**File**: `backend/src/utils/logger.ts`

```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
  ],
});
```

---

### Metrics (Prometheus)

```typescript
import { register, Counter, Histogram } from 'prom-client';

// Counters
export const policyCreatedCounter = new Counter({
  name: 'tonsurance_policies_created_total',
  help: 'Total number of policies created',
  labelNames: ['coverage_type'],
});

export const claimsFiledCounter = new Counter({
  name: 'tonsurance_claims_filed_total',
  help: 'Total number of claims filed',
});

// Histograms
export const premiumDistribution = new Histogram({
  name: 'tonsurance_premium_amount',
  help: 'Distribution of premium amounts',
  buckets: [1, 5, 10, 50, 100, 500],
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

---

### Alerts (Example: DataDog)

```yaml
# datadog-alerts.yaml
alerts:
  - name: High Claim Rate
    query: "avg:tonsurance.claims.rate{*} > 10"
    message: "Claim rate is abnormally high! Possible mass claim event."
    severity: critical

  - name: Contract Balance Low
    query: "avg:tonsurance.treasury.balance{*} < 1000"
    message: "Treasury balance is low. May not cover pending claims."
    severity: high

  - name: Failed Transactions
    query: "sum:tonsurance.transactions.failed{*}.as_count() > 50"
    message: "High number of failed transactions in last 5 minutes."
    severity: medium
```

---

## Deployment Checklist

### Pre-Launch
- [ ] Smart contracts audited (2+ firms)
- [ ] Bug bounty program launched
- [ ] Frontend security audit completed
- [ ] Load testing passed (10k concurrent users)
- [ ] Disaster recovery plan documented
- [ ] Multi-sig wallet configured (3-of-5)
- [ ] Insurance on treasury (Nexus Mutual or similar)

### Launch Day
- [ ] Deploy contracts to mainnet
- [ ] Verify contract source code on explorer
- [ ] Deploy frontend to production
- [ ] Deploy backend API
- [ ] Configure monitoring & alerts
- [ ] Submit mini-app to Telegram review
- [ ] Announce launch (Twitter, Telegram, Discord)

### Post-Launch
- [ ] Monitor metrics 24/7 (first week)
- [ ] Daily team check-ins
- [ ] User feedback collection
- [ ] Bug fixes deployed within 24h
- [ ] Weekly security reviews

---

## Appendix

### A. Contract Addresses (Mainnet)

```
PolicyFactory: EQD...
ClaimsProcessor: EQD...
SUREToken: EQD...
GovernanceVoting: EQD...
StakingPool: EQD...
Treasury: EQD...
PriceOracle: EQD...
```

### B. API Endpoints

```
POST   /api/policies/calculate-premium
POST   /api/policies/create
GET    /api/policies/:id
GET    /api/policies/user/:address
POST   /api/claims/file
GET    /api/claims/:id
POST   /api/claims/:id/vote
GET    /api/governance/proposals
POST   /api/governance/proposals/create
POST   /api/governance/proposals/:id/vote
GET    /api/analytics/stats
```

### C. Environment Variables

```bash
# Backend
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
TON_RPC_ENDPOINT=https://toncenter.com/api/v2/jsonRPC
TELEGRAM_BOT_TOKEN=...
JWT_SECRET=...

# Frontend
VITE_TON_NETWORK=mainnet
VITE_POLICY_FACTORY_ADDRESS=EQD...
VITE_API_BASE_URL=https://api.tonsurance.com
```

---

**Document Status**: DRAFT
**Next Review**: Pre-Launch Week -4
**Owner**: Engineering Team
**Contact**: eng@tonsurance.com

---

*"Stay Tonsured, Stay Secure" 🛡️*
