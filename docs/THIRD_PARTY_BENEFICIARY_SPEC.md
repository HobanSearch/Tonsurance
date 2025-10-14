# Third-Party Beneficiary System - Technical Specification

**Version:** 1.0
**Last Updated:** January 2025
**Status:** Approved for Implementation
**Owner:** Engineering Team

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Product Lines](#product-lines)
3. [Smart Contract Specifications](#smart-contract-specifications)
4. [Database Schema](#database-schema)
5. [API Specifications](#api-specifications)
6. [Frontend Components](#frontend-components)
7. [User Flows](#user-flows)
8. [Implementation Timeline](#implementation-timeline)
9. [Testing Strategy](#testing-strategy)
10. [Revenue Model](#revenue-model)

---

## Executive Summary

### Overview

The Third-Party Beneficiary System enables Tonsurance to decouple the premium payer (buyer) from the coverage recipient (beneficiary), unlocking six major new product lines:

1. **Insurance Gifts ("ProtectAGift")** - Personal crypto protection gifts
2. **Employee Benefits ("TonsurancePerks")** - Corporate insurance programs
3. **Business Escrow ("SmartEscrow")** - Insured business transactions
4. **Lending Protection ("SecuredLending")** - Lender-beneficiary policies
5. **DAO Grants Protection ("GrantShield")** - Protected grant distributions
6. **Remittance Protection ("SafeSend")** - International transfer insurance

### Market Opportunity

| Product Line | TAM | Target Revenue % |
|-------------|-----|------------------|
| Insurance Gifts | $500M | 15% |
| Employee Benefits | $2B | 25% |
| Business Escrow | $800M | 10% |
| Lending Protection | $1.5B | 18% |
| DAO Grants | $300M | 8% |
| Remittance Protection | $5B | 24% |

**Total Addressable Market**: $10.1B
**Target Revenue Mix by Year 3**: 71% from third-party beneficiary products

---

## Product Lines

### 1. Insurance Gifts ("ProtectAGift")

#### Description
Parents, friends, or family members can gift crypto insurance to loved ones for special occasions.

#### Use Cases
- **Birthday Gift**: "Happy 18th! Here's $500 USDT + depeg protection for 6 months"
- **Graduation**: Parents protect children's first crypto holdings
- **Wedding**: Crypto-native wedding gifts with insurance
- **New Job**: Protect friend's crypto salary

#### User Experience
1. Buyer selects "Buy as Gift"
2. Enters recipient's wallet address OR generates gift certificate
3. Adds personal message (280 chars)
4. Pays premium
5. Receives shareable gift certificate (link or QR code)
6. Recipient opens link → sees animated reveal → policy activates

#### Pricing
- Standard premium + $0.50 gift processing fee
- Volume discounts: 5+ gifts = 10% off

#### Revenue Model
- Premium from buyer
- Gift processing fee
- Renewal upsell to recipient (15% conversion rate)

---

### 2. Employee Benefits ("TonsurancePerks")

#### Description
Companies offer crypto insurance as an employee benefit, protecting salaries, bonuses, and deferred compensation.

#### Use Cases
- **Web3 Startups**: Protect team's crypto salaries
- **Traditional Companies**: Protect executive crypto bonuses
- **DAOs**: Protect contributor compensation
- **Remote Teams**: Global payroll protection

#### User Experience (Company Admin)
1. Admin creates enterprise account
2. Uploads employee wallet list (CSV or API)
3. Selects coverage tier (Basic/Premium/Custom)
4. Sets monthly budget
5. Employees auto-enrolled, receive Telegram notification
6. Dashboard shows coverage status, claims, analytics

#### User Experience (Employee)
1. Receives notification: "Your employer added you to TonsurancePerks!"
2. Views policy details
3. Can file claims (employer is NOT beneficiary)
4. Employer sees aggregate data only

#### Pricing Tiers
| Tier | Coverage | Premium (per employee/month) | Features |
|------|----------|------------------------------|----------|
| Basic | $5,000 | $8 | USDT depeg only |
| Premium | $25,000 | $35 | All coverage types |
| Enterprise | Custom | Custom | White-label, API access |

#### Revenue Model
- Monthly recurring billing to companies
- 25-35% gross margin (higher than retail)
- Upsell to Premium tier (40% upgrade rate)
- Renewal rate: 85%+ (enterprise stickiness)

---

### 3. Business Escrow ("SmartEscrow")

#### Description
Combines insurance with escrow functionality for secure business transactions.

#### Use Cases
- **Freelance Payments**: Client locks payment + insurance, freelancer protected
- **Real Estate**: Crypto property deposits with price protection
- **Equipment Purchase**: Buyer locks funds, seller protected from depeg
- **Token Sales**: OTC trades with depeg insurance

#### User Experience
1. Buyer and Seller negotiate deal terms
2. Buyer creates escrow + insurance policy
3. Funds locked in escrow contract
4. Insurance policy beneficiary: Seller OR Buyer (configurable)
5. Milestones tracked on-chain
6. When milestone complete: Escrow releases, insurance continues OR expires
7. If milestone fails: Seller can file claim

#### Example Transaction
```
Deal: $50,000 website development (paid in USDT)

Buyer deposits: $50,000 USDT + $125 insurance premium
Escrow terms:
- Milestone 1: Design complete (release 30%)
- Milestone 2: Development complete (release 50%)
- Milestone 3: Launch (release 20%)

Insurance covers:
- Seller (beneficiary) protected from USDT depeg during project
- If Milestone 2 fails, Seller can claim insurance

Both parties agree → Smart contract locks funds → Work begins
```

#### Pricing
- Base premium (standard rates)
- Escrow fee: 0.5% of transaction value
- Arbiter fee (optional): 1% (for dispute resolution)

#### Revenue Model
- Insurance premiums
- Escrow processing fees
- Arbiter services (partnership with TON arbitration services)

---

### 4. Lending Protection ("SecuredLending")

#### Description
Lenders require borrowers to purchase insurance policies where the lender is the beneficiary.

#### Use Cases
- **DeFi Lending**: Lender requires depeg protection on stablecoin collateral
- **Peer-to-Peer Loans**: Individuals lending crypto with insurance requirement
- **Institutional Lending**: Institutions mandate coverage on borrower positions
- **Margin Trading**: Exchanges require position insurance

#### User Experience (Lender Perspective)
1. Lender initiates loan (on STON.fi, TON Lending, or off-chain)
2. Sets insurance requirement: "Borrower must insure 80% of loan value"
3. Sends insurance requirement link to borrower
4. Borrower purchases policy (lender as beneficiary)
5. Lender verifies policy active before releasing funds
6. If borrower defaults: Lender files claim automatically

#### User Experience (Borrower Perspective)
1. Receives loan offer with insurance requirement
2. Clicks "Buy Required Insurance"
3. Reviews terms: "Protecting [Lender Name] for $10,000"
4. Pays premium
5. Policy activates, lender notified
6. Loan proceeds

#### Integration Points
- **TON DeFi Protocols**: API integration for loan + insurance bundling
- **Smart Contract Hooks**: Auto-verify insurance before loan disbursement
- **Claim Automation**: Default events trigger automatic claim filing

#### Pricing
- Borrower pays premium (or included in loan APR)
- Lender pays optional monitoring fee: $5/month per loan

#### Revenue Model
- Premium from borrowers
- Partnership revenue share with lending protocols (10-20%)
- Monitoring fees from lenders

---

### 5. DAO Grants Protection ("GrantShield")

#### Description
DAOs protect their grant recipients with automatic insurance coverage.

#### Use Cases
- **Developer Grants**: TON Foundation protects grant recipients
- **Research Grants**: Academic crypto research protected
- **Community Grants**: Content creator grants with coverage
- **Bug Bounties**: Bounty recipients protected from stablecoin depeg

#### User Experience (DAO Perspective)
1. DAO creates Grant Program
2. Defines coverage per recipient: e.g., "$5,000 USDT depeg coverage"
3. Recipients submit proposals
4. DAO votes, approves grantees
5. Grant + insurance auto-distributed (single transaction)
6. DAO dashboard shows all active policies

#### User Experience (Grant Recipient)
1. Receives grant notification
2. Sees: "Grant: 10,000 USDT + $50 insurance premium covered by [DAO]"
3. Policy auto-activates (no action needed)
4. Can file claims independently

#### Bulk Pricing
- Volume discounts: 10+ grants = 20% off
- Annual contracts: Additional 10% off
- DAO treasury integration: Direct premium payment from DAO wallet

#### Revenue Model
- Bulk premiums from DAOs
- High-margin (40%+ gross) due to automation
- Upsell: DAO members can purchase additional coverage

---

### 6. Remittance Protection ("SafeSend")

#### Description
Bundle stablecoin remittances with automatic depeg insurance.

#### Use Cases
- **Cross-Border Payments**: Workers sending money home
- **Freelancer Payments**: International contractor payments
- **Family Support**: Supporting relatives in other countries
- **Emergency Transfers**: Urgent protected transfers

#### User Experience
1. User enters send amount: $500 USDT
2. Enters recipient Telegram username or wallet
3. Sees: "Protect this transfer? +$1.50 (0.3%)"
4. Selects "Send Protected"
5. Recipient receives: Transfer + 48-hour insurance notification
6. If USDT depegs in 48 hours: Recipient compensated automatically

#### Pricing
- Ultra-low premium: 0.1-0.3% of transfer amount
- High-volume, low-margin strategy
- Minimum premium: $0.50

#### Telegram Integration
- Inline button: "Send Protected" directly in Telegram
- Bot command: `/sendprotected @username $500`
- Receipt messages to both sender and recipient

#### Revenue Model
- Volume-based (millions of small transactions)
- Gross margin: 15-20% (lower than other products)
- Upsell: Recipient converts to regular policy (8% conversion)

---

## Smart Contract Specifications

### 1. PolicyFactory Enhancement

**File**: `contracts/PolicyFactory.fc`

#### New Storage Fields
```func
global int supports_beneficiary;  // Feature flag: 1 = enabled
```

#### New Functions

##### create_policy_with_beneficiary()
```func
() create_policy_with_beneficiary(
    slice buyer_address,
    slice beneficiary_address,
    int coverage_type,
    int coverage_amount,
    int duration_days,
    int premium_amount,
    int is_gift,
    slice gift_message  // Optional, can be null
) impure {
    load_data();

    // Validate addresses
    throw_unless(400, is_valid_address(buyer_address));
    throw_unless(401, is_valid_address(beneficiary_address));

    // Validate payment
    throw_unless(402, msg_value >= premium_amount);

    // Generate policy ID
    int policy_id = total_policies + 1;

    // Create policy data cell
    cell policy_data = begin_cell()
        .store_uint(policy_id, 64)
        .store_slice(buyer_address)
        .store_slice(beneficiary_address)
        .store_uint(coverage_type, 8)
        .store_coins(coverage_amount)
        .store_uint(now(), 64)  // Start time
        .store_uint(now() + (duration_days * 86400), 64)  // Expiry
        .store_uint(0, 1)  // Status: active
        .store_uint(is_gift, 1)
        .store_maybe_ref(gift_message)  // Optional gift message
        .end_cell();

    // Store policy
    policies~udict_set(64, policy_id, policy_data.begin_parse());

    // Store buyer index (for buyer dashboard)
    cell buyer_policies = get_user_policies(buyer_address);
    buyer_policies~udict_set(64, policy_id, 1);
    save_user_policies(buyer_address, buyer_policies);

    // Store beneficiary index (for beneficiary dashboard)
    cell beneficiary_policies = get_user_policies(beneficiary_address);
    beneficiary_policies~udict_set(64, policy_id, 1);
    save_user_policies(beneficiary_address, beneficiary_policies);

    // Route premium to vaults
    send_to_premium_distributor(premium_amount, policy_id);

    // Emit event
    emit_log("POLICY_CREATED", policy_id, buyer_address, beneficiary_address);

    total_policies += 1;
    save_data();
}
```

##### get_policy_full_data()
```func
(
    int policy_id,
    slice buyer_address,
    slice beneficiary_address,
    int coverage_type,
    int coverage_amount,
    int start_time,
    int expiry_time,
    int status,
    int is_gift,
    slice gift_message
) get_policy_full_data(int policy_id) method_id {
    load_data();

    (slice policy_data, int found) = policies.udict_get?(64, policy_id);
    throw_unless(404, found);

    int id = policy_data~load_uint(64);
    slice buyer = policy_data~load_msg_addr();
    slice beneficiary = policy_data~load_msg_addr();
    int coverage_type = policy_data~load_uint(8);
    int coverage_amount = policy_data~load_coins();
    int start_time = policy_data~load_uint(64);
    int expiry_time = policy_data~load_uint(64);
    int status = policy_data~load_uint(1);
    int is_gift = policy_data~load_uint(1);
    slice gift_message = policy_data~load_maybe_ref();

    return (
        id,
        buyer,
        beneficiary,
        coverage_type,
        coverage_amount,
        start_time,
        expiry_time,
        status,
        is_gift,
        gift_message
    );
}
```

##### verify_beneficiary_can_claim()
```func
int verify_beneficiary_can_claim(int policy_id, slice claimant) method_id {
    load_data();

    (slice policy_data, int found) = policies.udict_get?(64, policy_id);
    throw_unless(404, found);

    // Skip to beneficiary address (after policy_id and buyer_address)
    policy_data~load_uint(64);  // policy_id
    policy_data~load_msg_addr();  // buyer_address
    slice beneficiary = policy_data~load_msg_addr();

    // Check if claimant is beneficiary
    return equal_slices(claimant, beneficiary);
}
```

---

### 2. Enterprise Policy Manager

**File**: `contracts/EnterprisePolicyManager.fc`

**Purpose**: Manage bulk policies for corporate accounts

#### Storage
```func
global cell enterprise_accounts;  // Dict: company_id => account_data
global cell employee_policies;    // Dict: employee_addr => policy_ids[]
global int total_companies;
```

#### Key Functions

##### register_enterprise()
```func
() register_enterprise(
    slice company_admin,
    slice company_name,
    int coverage_tier,
    int monthly_budget
) impure {
    load_data();

    int company_id = total_companies + 1;

    cell account_data = begin_cell()
        .store_uint(company_id, 64)
        .store_slice(company_admin)
        .store_ref(company_name)  // String as ref
        .store_uint(coverage_tier, 8)
        .store_coins(monthly_budget)
        .store_uint(now(), 64)  // Created at
        .store_uint(0, 1)  // Status: active
        .end_cell();

    enterprise_accounts~udict_set(64, company_id, account_data.begin_parse());

    total_companies += 1;
    save_data();

    emit_log("ENTERPRISE_REGISTERED", company_id);
}
```

##### bulk_create_employee_policies()
```func
() bulk_create_employee_policies(
    int company_id,
    cell employee_list,  // Dict: employee_addr => coverage_amount
    int coverage_type,
    int duration_days
) impure {
    load_data();

    // Verify company exists and sender is admin
    (slice account_data, int found) = enterprise_accounts.udict_get?(64, company_id);
    throw_unless(404, found);

    slice company_admin = account_data~skip_bits(64)~load_msg_addr();
    throw_unless(403, equal_slices(sender(), company_admin));

    // Iterate employee list
    int employee_count = 0;
    slice employee_addr = employee_list~dict_get_min?(267);  // 267 bits = address

    while (~ employee_addr.null?()) {
        int coverage_amount = employee_list~udict_get?(267, employee_addr);

        // Calculate premium (company pays)
        int premium = calculate_premium(coverage_type, coverage_amount, duration_days);

        // Create policy (company as buyer, employee as beneficiary)
        create_policy_with_beneficiary(
            company_admin,     // Buyer: company
            employee_addr,     // Beneficiary: employee
            coverage_type,
            coverage_amount,
            duration_days,
            premium,
            0,  // Not a gift
            null  // No gift message
        );

        employee_count += 1;

        // Get next employee
        employee_addr = employee_list~dict_get_next?(267, employee_addr);
    }

    emit_log("BULK_POLICIES_CREATED", company_id, employee_count);

    save_data();
}
```

---

### 3. Escrow Insurance Contract

**File**: `contracts/EscrowInsurance.fc`

**Purpose**: Combined escrow + insurance functionality

#### Storage
```func
global cell escrows;           // Dict: escrow_id => escrow_data
global cell escrow_milestones; // Dict: escrow_id => milestones[]
global int total_escrows;
```

#### Escrow Data Structure
```func
cell escrow_data = begin_cell()
    .store_uint(escrow_id, 64)
    .store_slice(buyer_addr)
    .store_slice(seller_addr)
    .store_coins(escrow_amount)
    .store_uint(policy_id, 64)  // Associated insurance policy
    .store_uint(milestones_count, 8)
    .store_uint(milestones_completed, 8)
    .store_uint(status, 8)  // 0=active, 1=completed, 2=disputed
    .store_uint(created_at, 64)
    .end_cell();
```

#### Key Functions

##### create_escrow_with_insurance()
```func
() create_escrow_with_insurance(
    slice buyer,
    slice seller,
    int escrow_amount,
    int insurance_coverage,
    int coverage_type,
    int duration_days,
    cell milestones  // Array of milestone descriptions
) impure {
    load_data();

    // Validate payment (escrow + insurance premium + escrow fee)
    int insurance_premium = calculate_premium(coverage_type, insurance_coverage, duration_days);
    int escrow_fee = muldiv(escrow_amount, 5, 1000);  // 0.5%
    int total_required = escrow_amount + insurance_premium + escrow_fee;

    throw_unless(400, msg_value >= total_required);

    // Create insurance policy (seller as beneficiary)
    int policy_id = create_policy_with_beneficiary(
        buyer,           // Buyer pays
        seller,          // Seller protected
        coverage_type,
        insurance_coverage,
        duration_days,
        insurance_premium,
        0,  // Not a gift
        null
    );

    // Create escrow
    int escrow_id = total_escrows + 1;

    cell escrow_data = begin_cell()
        .store_uint(escrow_id, 64)
        .store_slice(buyer)
        .store_slice(seller)
        .store_coins(escrow_amount)
        .store_uint(policy_id, 64)
        .store_uint(milestones.dict_size(), 8)
        .store_uint(0, 8)  // Milestones completed
        .store_uint(0, 8)  // Status: active
        .store_uint(now(), 64)
        .end_cell();

    escrows~udict_set(64, escrow_id, escrow_data.begin_parse());
    escrow_milestones~udict_set(64, escrow_id, milestones.begin_parse());

    total_escrows += 1;
    save_data();

    emit_log("ESCROW_CREATED", escrow_id, policy_id);
}
```

##### complete_milestone()
```func
() complete_milestone(
    int escrow_id,
    int milestone_index
) impure {
    load_data();

    (slice escrow_data, int found) = escrows.udict_get?(64, escrow_id);
    throw_unless(404, found);

    slice buyer = escrow_data~skip_bits(64)~load_msg_addr();
    slice seller = escrow_data~load_msg_addr();
    int escrow_amount = escrow_data~load_coins();
    int policy_id = escrow_data~load_uint(64);
    int total_milestones = escrow_data~load_uint(8);
    int completed = escrow_data~load_uint(8);

    // Only buyer can mark milestone complete
    throw_unless(403, equal_slices(sender(), buyer));

    // Load milestone details
    (slice milestones_data, int found_milestones) = escrow_milestones.udict_get?(64, escrow_id);
    throw_unless(404, found_milestones);

    // Get milestone
    (slice milestone, int found_milestone) = milestones_data.udict_get?(8, milestone_index);
    throw_unless(404, found_milestone);

    int release_percentage = milestone~load_uint(16);  // e.g., 3000 = 30%

    // Calculate release amount
    int release_amount = muldiv(escrow_amount, release_percentage, 10000);

    // Send to seller
    send_raw_message(seller, release_amount, "Milestone payment");

    // Update escrow
    completed += 1;

    // If all milestones complete, close escrow and policy
    if (completed == total_milestones) {
        // Close escrow
        // Optionally: Cancel insurance policy (seller protected, deal completed)
    }

    save_data();

    emit_log("MILESTONE_COMPLETED", escrow_id, milestone_index);
}
```

---

## Database Schema

### New Tables

#### enterprise_accounts
```sql
CREATE TABLE enterprise_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    admin_address TEXT NOT NULL,
    coverage_tier TEXT CHECK (coverage_tier IN ('basic', 'premium', 'enterprise')),
    monthly_budget BIGINT NOT NULL,
    employees JSONB DEFAULT '[]', -- Array of {address, name, email}
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_enterprise_admin ON enterprise_accounts(admin_address);
```

#### employee_coverage
```sql
CREATE TABLE employee_coverage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enterprise_id UUID REFERENCES enterprise_accounts(id),
    employee_address TEXT NOT NULL,
    employee_name TEXT,
    employee_email TEXT,
    policy_id UUID REFERENCES policies(id),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX idx_employee_address ON employee_coverage(employee_address);
CREATE INDEX idx_enterprise_policies ON employee_coverage(enterprise_id);
```

#### gift_certificates
```sql
CREATE TABLE gift_certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID REFERENCES policies(id),
    reveal_code TEXT UNIQUE NOT NULL,
    gift_message TEXT,
    certificate_url TEXT, -- Generated image URL
    revealed BOOLEAN DEFAULT FALSE,
    revealed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reveal_code ON gift_certificates(reveal_code);
```

#### escrow_contracts
```sql
CREATE TABLE escrow_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_address TEXT NOT NULL,
    buyer_address TEXT NOT NULL,
    seller_address TEXT NOT NULL,
    escrow_amount BIGINT NOT NULL,
    policy_id UUID REFERENCES policies(id),
    milestones JSONB NOT NULL, -- Array of {description, percentage, completed, completed_at}
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'disputed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_escrow_buyer ON escrow_contracts(buyer_address);
CREATE INDEX idx_escrow_seller ON escrow_contracts(seller_address);
```

#### lending_policies
```sql
CREATE TABLE lending_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id UUID REFERENCES policies(id),
    lender_address TEXT NOT NULL, -- Beneficiary
    borrower_address TEXT NOT NULL, -- Buyer
    loan_amount BIGINT NOT NULL,
    loan_contract_address TEXT, -- External lending protocol address
    loan_start TIMESTAMPTZ NOT NULL,
    loan_maturity TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'defaulted')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lending_lender ON lending_policies(lender_address);
CREATE INDEX idx_lending_borrower ON lending_policies(borrower_address);
```

### Extended Policies Table
```sql
ALTER TABLE policies ADD COLUMN IF NOT EXISTS buyer_address TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS beneficiary_address TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS is_gift BOOLEAN DEFAULT FALSE;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS gift_message TEXT;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS gift_revealed_at TIMESTAMPTZ;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS product_line TEXT DEFAULT 'standard'
    CHECK (product_line IN ('standard', 'gift', 'enterprise', 'escrow', 'lending', 'dao_grant', 'remittance'));

-- Backward compatibility: Set beneficiary_address = user_address for existing policies
UPDATE policies SET beneficiary_address = user_address WHERE beneficiary_address IS NULL;
UPDATE policies SET buyer_address = user_address WHERE buyer_address IS NULL;

CREATE INDEX idx_policies_buyer ON policies(buyer_address);
CREATE INDEX idx_policies_beneficiary ON policies(beneficiary_address);
CREATE INDEX idx_policies_product_line ON policies(product_line);
```

---

## API Specifications

### Base URL
`https://api.tonsurance.com/v1`

### Authentication
All endpoints require TON Connect wallet signature or API key (for enterprise).

---

### Gift Insurance Endpoints

#### POST /policies/gift
Create insurance policy as a gift.

**Request:**
```json
{
  "buyerAddress": "EQD...",
  "beneficiaryAddress": "EQC...",  // Optional, can use reveal code instead
  "coverageType": "depeg",
  "coverageAmount": 50000,  // $500 in cents
  "durationDays": 90,
  "giftMessage": "Happy Birthday! Stay safe in crypto ❤️",
  "generateRevealCode": true  // If true, policy inactive until revealed
}
```

**Response:**
```json
{
  "policyId": "123e4567-e89b-12d3-a456-426614174000",
  "premium": 197,  // $1.97 in cents
  "giftCertificate": {
    "revealCode": "GIFT-A7B9C2",
    "certificateUrl": "https://tonsurance.com/gift/GIFT-A7B9C2",
    "shareableLink": "https://t.me/tonsurancebot?start=gift_GIFT-A7B9C2",
    "qrCodeUrl": "https://cdn.tonsurance.com/qr/GIFT-A7B9C2.png"
  },
  "transaction": {
    "hash": "0x...",
    "status": "confirmed"
  }
}
```

#### GET /gifts/:reveal_code
Redeem gift certificate.

**Response:**
```json
{
  "policy": {
    "id": "123e4567...",
    "coverageType": "depeg",
    "coverageAmount": 50000,
    "duration": 90,
    "giftMessage": "Happy Birthday! Stay safe in crypto ❤️",
    "from": "Anonymous",  // Or sender name if provided
    "status": "pending_activation"
  },
  "activateUrl": "/policies/gift/activate"
}
```

#### POST /policies/gift/activate
Activate gifted policy (recipient confirms wallet).

**Request:**
```json
{
  "revealCode": "GIFT-A7B9C2",
  "beneficiaryAddress": "EQC..."  // Recipient's wallet
}
```

**Response:**
```json
{
  "policyId": "123e4567...",
  "status": "active",
  "activatedAt": "2025-01-15T10:30:00Z",
  "expiresAt": "2025-04-15T10:30:00Z"
}
```

---

### Enterprise Endpoints

#### POST /enterprise/register
Register company for employee benefits program.

**Request:**
```json
{
  "companyName": "Acme Web3 Inc.",
  "adminAddress": "EQD...",
  "coverageTier": "premium",
  "monthlyBudget": 500000,  // $5,000 in cents
  "employees": [
    {
      "address": "EQC...",
      "name": "Alice Smith",
      "email": "alice@acme.com"
    },
    {
      "address": "EQB...",
      "name": "Bob Jones",
      "email": "bob@acme.com"
    }
  ]
}
```

**Response:**
```json
{
  "enterpriseId": "ent_a1b2c3d4",
  "companyName": "Acme Web3 Inc.",
  "status": "active",
  "dashboardUrl": "https://tonsurance.com/enterprise/ent_a1b2c3d4",
  "apiKey": "sk_live_..."
}
```

#### POST /enterprise/:id/enroll-employees
Bulk enroll employees (create policies).

**Request:**
```json
{
  "coverageType": "depeg",
  "coverageAmount": 2500000,  // $25,000 per employee
  "duration": 365,
  "employees": [
    "EQC...",
    "EQB...",
    "EQA..."
  ]
}
```

**Response:**
```json
{
  "enrolled": 3,
  "policies": [
    {
      "employee": "EQC...",
      "policyId": "policy_1",
      "premium": 3500
    },
    {
      "employee": "EQB...",
      "policyId": "policy_2",
      "premium": 3500
    },
    {
      "employee": "EQA...",
      "policyId": "policy_3",
      "premium": 3500
    }
  ],
  "totalPremium": 10500,
  "budgetRemaining": 489500
}
```

#### GET /enterprise/:id/dashboard
Get company dashboard data.

**Response:**
```json
{
  "company": {
    "id": "ent_a1b2c3d4",
    "name": "Acme Web3 Inc.",
    "tier": "premium"
  },
  "stats": {
    "employeesEnrolled": 25,
    "activePolicies": 25,
    "totalCoverage": 625000,  // $625k
    "monthlySpend": 87500,
    "budgetUtilization": 0.175
  },
  "claims": {
    "filed": 2,
    "approved": 1,
    "pending": 1,
    "totalPaidOut": 5000
  },
  "recentActivity": [...]
}
```

---

### Escrow Endpoints

#### POST /escrow/create
Create escrow + insurance bundle.

**Request:**
```json
{
  "buyer": "EQD...",
  "seller": "EQC...",
  "escrowAmount": 5000000,  // $50,000
  "insuranceCoverage": 5000000,
  "coverageType": "depeg",
  "duration": 90,
  "milestones": [
    {
      "description": "Design mockups delivered",
      "percentage": 20
    },
    {
      "description": "MVP completed",
      "percentage": 50
    },
    {
      "description": "Final delivery and launch",
      "percentage": 30
    }
  ]
}
```

**Response:**
```json
{
  "escrowId": "esc_x1y2z3",
  "policyId": "policy_456",
  "contractAddress": "EQE...",
  "totalCost": {
    "escrow": 5000000,
    "insurance": 12500,
    "escrowFee": 25000,
    "total": 5037500
  },
  "milestones": [...]
}
```

#### POST /escrow/:id/milestone/:milestone_index/complete
Mark milestone as complete (releases escrow funds).

**Request:**
```json
{
  "buyerAddress": "EQD...",
  "signature": "..."
}
```

**Response:**
```json
{
  "milestoneIndex": 0,
  "description": "Design mockups delivered",
  "releaseAmount": 1000000,  // 20% of $50k
  "releasedTo": "EQC...",
  "remainingEscrow": 4000000,
  "milestonesCompleted": 1,
  "totalMilestones": 3
}
```

---

### Lending Protection Endpoints

#### POST /lending/policy-requirement
Lender creates insurance requirement for loan.

**Request:**
```json
{
  "lenderAddress": "EQD...",
  "loanAmount": 1000000,  // $10,000
  "insuranceRequirement": {
    "coverageType": "depeg",
    "minCoverage": 800000,  // 80% of loan
    "duration": 180
  },
  "loanTerms": {
    "apr": 12.5,
    "maturityDays": 180
  }
}
```

**Response:**
```json
{
  "requirementId": "req_a1b2c3",
  "borrowerLink": "https://tonsurance.com/lending/req_a1b2c3",
  "telegramBotCommand": "/insure_loan req_a1b2c3",
  "estimatedPremium": 6400  // $64
}
```

#### POST /lending/:requirement_id/fulfill
Borrower fulfills insurance requirement.

**Request:**
```json
{
  "borrowerAddress": "EQC...",
  "acceptTerms": true
}
```

**Response:**
```json
{
  "policyId": "policy_789",
  "lenderNotified": true,
  "loanCanProceed": true,
  "verificationCode": "VERIFY-X7Y8Z9"  // Lender uses this to confirm
}
```

---

### Remittance Protection Endpoints

#### POST /remittance/send-protected
Send stablecoins with automatic insurance.

**Request:**
```json
{
  "senderAddress": "EQD...",
  "recipientAddress": "EQC...",  // Or Telegram username
  "amount": 50000,  // $500
  "currency": "USDT",
  "autoInsure": true
}
```

**Response:**
```json
{
  "transferId": "txn_a1b2c3",
  "transfer": {
    "amount": 50000,
    "fee": 100,
    "total": 50100
  },
  "insurance": {
    "policyId": "policy_quick_a1b2",
    "coverage": 50000,
    "duration": 48,  // hours
    "premium": 150,  // $1.50 (0.3%)
    "expires": "2025-01-17T10:30:00Z"
  },
  "totalCost": 50250,
  "transactionHash": "0x...",
  "recipientNotification": "Sent via Telegram"
}
```

---

## Frontend Components

### 1. Beneficiary Selector Component

**File**: `frontend/src/components/BeneficiarySelector.tsx`

```tsx
import { useState } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Address } from '@ton/core';

interface BeneficiarySelectorProps {
  onSelect: (beneficiaryAddress: string | null) => void;
  allowSelf?: boolean;
}

export function BeneficiarySelector({ onSelect, allowSelf = true }: BeneficiarySelectorProps) {
  const userAddress = useTonAddress();
  const [mode, setMode] = useState<'self' | 'other'>('self');
  const [beneficiaryInput, setBeneficiaryInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateAddress = (address: string): boolean => {
    try {
      Address.parse(address);
      return true;
    } catch {
      return false;
    }
  };

  const handleModeChange = (newMode: 'self' | 'other') => {
    setMode(newMode);
    setValidationError(null);

    if (newMode === 'self') {
      onSelect(userAddress);
    } else {
      onSelect(null);
    }
  };

  const handleAddressInput = (value: string) => {
    setBeneficiaryInput(value);

    if (value.trim() === '') {
      setValidationError(null);
      onSelect(null);
      return;
    }

    if (validateAddress(value)) {
      setValidationError(null);
      onSelect(value);
    } else {
      setValidationError('Invalid TON address');
      onSelect(null);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold text-text-secondary mb-2 uppercase">
        Who will be covered?
      </label>

      {/* Mode Selector */}
      <div className="grid grid-cols-2 gap-3">
        {allowSelf && (
          <button
            onClick={() => handleModeChange('self')}
            className={`px-4 py-3 border-2 transition-all text-left ${
              mode === 'self'
                ? 'border-copper-500 bg-copper-50'
                : 'border-cream-400 hover:bg-cream-300'
            }`}
          >
            <div className="font-semibold text-sm">Myself</div>
            <div className="text-xs text-text-tertiary mt-1">
              I'll be the beneficiary
            </div>
          </button>
        )}

        <button
          onClick={() => handleModeChange('other')}
          className={`px-4 py-3 border-2 transition-all text-left ${
            mode === 'other'
              ? 'border-copper-500 bg-copper-50'
              : 'border-cream-400 hover:bg-cream-300'
          }`}
        >
          <div className="font-semibold text-sm">Someone Else</div>
          <div className="text-xs text-text-tertiary mt-1">
            Buy as gift or for beneficiary
          </div>
        </button>
      </div>

      {/* Address Input (shown when mode === 'other') */}
      {mode === 'other' && (
        <div>
          <input
            type="text"
            value={beneficiaryInput}
            onChange={(e) => handleAddressInput(e.target.value)}
            className={`w-full px-3 py-2 bg-cream-300/50 border font-mono text-sm ${
              validationError
                ? 'border-red-500'
                : 'border-cream-400'
            }`}
            placeholder="EQC... or UQC..."
          />

          {validationError && (
            <p className="text-xs text-red-600 mt-1">
              {validationError}
            </p>
          )}

          <p className="text-xs text-text-tertiary mt-1">
            Enter the TON wallet address of the person you want to protect
          </p>
        </div>
      )}

      {/* Summary */}
      {mode === 'self' && (
        <div className="p-3 bg-terminal-green/10 border border-terminal-green">
          <div className="text-xs font-mono text-terminal-green">
            ✓ You ({userAddress.slice(0, 6)}...{userAddress.slice(-4)}) will be the beneficiary
          </div>
        </div>
      )}

      {mode === 'other' && beneficiaryInput && !validationError && (
        <div className="p-3 bg-terminal-green/10 border border-terminal-green">
          <div className="text-xs font-mono text-terminal-green">
            ✓ Covering: {beneficiaryInput.slice(0, 6)}...{beneficiaryInput.slice(-4)}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

### 2. Gift Certificate Preview

**File**: `frontend/src/components/GiftCertificatePreview.tsx`

```tsx
import { QRCodeSVG } from 'qrcode.react';

interface GiftCertificateProps {
  revealCode: string;
  giftMessage?: string;
  coverageType: string;
  coverageAmount: number;
  duration: number;
  certificateUrl: string;
}

export function GiftCertificatePreview({
  revealCode,
  giftMessage,
  coverageType,
  coverageAmount,
  duration,
  certificateUrl
}: GiftCertificateProps) {
  const shareUrl = `https://t.me/tonsurancebot?start=gift_${revealCode}`;

  return (
    <div className="max-w-md mx-auto bg-gradient-to-br from-cream-100 to-copper-100 p-6 border-3 border-copper-500 shadow-lg">
      {/* Header */}
      <div className="text-center mb-6">
        <div className="text-sm text-copper-600 font-mono mb-1">
          &gt; GIFT CERTIFICATE
        </div>
        <h2 className="text-2xl font-bold text-copper-600 font-mono">
          TONSURANCE
        </h2>
        <div className="text-xs text-text-secondary mt-1">
          Crypto Insurance Gift 🎁
        </div>
      </div>

      {/* Gift Message */}
      {giftMessage && (
        <div className="mb-6 p-4 bg-white/50 border-2 border-copper-300">
          <div className="text-xs text-copper-600 font-semibold mb-2">
            MESSAGE FOR YOU:
          </div>
          <p className="text-sm italic text-text-primary">
            "{giftMessage}"
          </p>
        </div>
      )}

      {/* Coverage Details */}
      <div className="mb-6 space-y-2 text-sm font-mono">
        <div className="flex justify-between">
          <span className="text-text-secondary">COVERAGE:</span>
          <span className="font-semibold">${(coverageAmount / 100).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">TYPE:</span>
          <span className="font-semibold">{coverageType.toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-secondary">DURATION:</span>
          <span className="font-semibold">{duration} DAYS</span>
        </div>
      </div>

      {/* QR Code */}
      <div className="flex justify-center mb-6">
        <div className="p-4 bg-white border-2 border-copper-500">
          <QRCodeSVG value={shareUrl} size={150} />
        </div>
      </div>

      {/* Reveal Code */}
      <div className="text-center mb-6">
        <div className="text-xs text-text-secondary mb-1">REVEAL CODE:</div>
        <div className="text-2xl font-bold font-mono text-copper-600 tracking-wider">
          {revealCode}
        </div>
      </div>

      {/* Instructions */}
      <div className="text-center text-xs text-text-tertiary space-y-1 border-t-2 border-copper-300 pt-4">
        <p>Scan QR code or visit:</p>
        <p className="font-mono break-all text-copper-600">
          {shareUrl}
        </p>
        <p className="mt-2">
          Connect your TON wallet to activate this gift
        </p>
      </div>

      {/* Share Button */}
      <button
        onClick={() => {
          navigator.clipboard.writeText(shareUrl);
          alert('Gift link copied to clipboard!');
        }}
        className="w-full mt-4 px-4 py-2 bg-copper-500 text-white font-semibold border-2 border-copper-600 hover:bg-copper-600 transition-colors"
      >
        📋 COPY GIFT LINK
      </button>
    </div>
  );
}
```

---

## Implementation Timeline

### Phase 1: Foundation (Weeks 1-4)

**Week 1-2: Smart Contract Updates**
- [ ] Update `PolicyFactory.fc` with beneficiary support
- [ ] Add `create_policy_with_beneficiary()` function
- [ ] Add getter functions for beneficiary data
- [ ] Write comprehensive unit tests
- [ ] Deploy to testnet

**Week 3-4: Database & API**
- [ ] Extend `policies` table schema
- [ ] Create new tables (gift_certificates, enterprise_accounts, etc.)
- [ ] Implement gift API endpoints
- [ ] Implement basic enterprise endpoints
- [ ] Write API tests

### Phase 2: Product Lines (Weeks 5-12)

**Week 5-6: Insurance Gifts**
- [ ] Build `BeneficiarySelector` component
- [ ] Build `GiftCertificatePreview` component
- [ ] Implement gift purchase flow
- [ ] Create gift reveal page
- [ ] Test end-to-end

**Week 7-8: Employee Benefits MVP**
- [ ] Deploy `EnterprisePolicyManager.fc` contract
- [ ] Build enterprise registration flow
- [ ] Create basic admin dashboard
- [ ] Implement bulk enrollment
- [ ] Test with pilot company

**Week 9-10: Escrow Integration**
- [ ] Deploy `EscrowInsurance.fc` contract
- [ ] Build escrow creation flow
- [ ] Implement milestone tracker
- [ ] Create escrow dashboard
- [ ] Test escrow+insurance bundle

**Week 11-12: Lending Protection**
- [ ] Create lending policy API
- [ ] Build lender requirement flow
- [ ] Build borrower fulfillment flow
- [ ] Integrate with TON lending protocols
- [ ] Test full lending flow

### Phase 3: Scale & Optimize (Weeks 13-16)

**Week 13-14: DAO Grants**
- [ ] Create bulk grant API
- [ ] Build DAO admin interface
- [ ] Implement grant+insurance distribution
- [ ] Test with partner DAO

**Week 15-16: Remittance Protection**
- [ ] Build quick-insure send flow
- [ ] Integrate with Telegram Bot
- [ ] Create `/sendprotected` command
- [ ] Optimize for low-premium, high-volume
- [ ] Launch beta in target markets

### Phase 4: Polish & Launch (Weeks 17-20)

**Week 17-18: Testing & Security**
- [ ] Comprehensive security audit
- [ ] Load testing (10k+ transactions)
- [ ] Bug fixes and optimizations
- [ ] Documentation updates

**Week 19-20: Marketing & Launch**
- [ ] Product announcements
- [ ] Partner integrations live
- [ ] Launch campaigns
- [ ] Monitor metrics

---

## Testing Strategy

### Smart Contract Tests

#### Beneficiary Logic Tests
```typescript
describe('PolicyFactory - Beneficiary Support', () => {
  it('should create policy with different buyer and beneficiary', async () => {
    const buyer = await blockchain.treasury('buyer');
    const beneficiary = await blockchain.treasury('beneficiary');

    const result = await policyFactory.sendCreatePolicyWithBeneficiary(
      buyer.getSender(),
      {
        buyerAddress: buyer.address,
        beneficiaryAddress: beneficiary.address,
        coverageType: 0, // depeg
        coverageAmount: toNano('500'),
        duration: 90,
        premium: toNano('2'),
        isGift: 1,
        giftMessage: 'Happy Birthday!'
      }
    );

    expect(result.transactions).toHaveTransaction({
      from: buyer.address,
      to: policyFactory.address,
      success: true
    });

    const policy = await policyFactory.getPolicyData(1);
    expect(policy.buyer).toEqualAddress(buyer.address);
    expect(policy.beneficiary).toEqualAddress(beneficiary.address);
  });

  it('should only allow beneficiary to file claim', async () => {
    // Buyer tries to claim
    const buyerClaimResult = await policyFactory.sendFileClaim(
      buyer.getSender(),
      { policyId: 1 }
    );

    expect(buyerClaimResult.transactions).toHaveTransaction({
      from: buyer.address,
      to: policyFactory.address,
      success: false,
      exitCode: 403 // Unauthorized
    });

    // Beneficiary claims successfully
    const beneficiaryClaimResult = await policyFactory.sendFileClaim(
      beneficiary.getSender(),
      { policyId: 1 }
    );

    expect(beneficiaryClaimResult.transactions).toHaveTransaction({
      from: beneficiary.address,
      to: policyFactory.address,
      success: true
    });
  });
});
```

#### Enterprise Bulk Enrollment Tests
```typescript
describe('EnterprisePolicyManager', () => {
  it('should create policies for 100 employees in bulk', async () => {
    const company = await blockchain.treasury('company');
    const employees = [];

    // Generate 100 employee wallets
    for (let i = 0; i < 100; i++) {
      employees.push(await blockchain.treasury(`employee_${i}`));
    }

    // Register enterprise
    await enterpriseManager.sendRegisterEnterprise(
      company.getSender(),
      {
        companyName: 'Test Corp',
        coverageTier: 1, // Premium
        monthlyBudget: toNano('50000')
      }
    );

    // Bulk enroll
    const result = await enterpriseManager.sendBulkCreatePolicies(
      company.getSender(),
      {
        companyId: 1,
        employees: employees.map(e => ({
          address: e.address,
          coverage: toNano('25000')
        })),
        coverageType: 0,
        duration: 365
      }
    );

    expect(result.transactions).toHaveLength(102); // 1 request + 100 policy creations + 1 success

    // Verify each employee has policy
    for (const employee of employees) {
      const policies = await policyFactory.getUserPolicies(employee.address);
      expect(policies.length).toBe(1);
    }
  });
});
```

### Integration Tests

#### Gift Flow E2E Test
```typescript
describe('Gift Insurance Flow', () => {
  it('should complete full gift purchase and reveal flow', async () => {
    // Step 1: Buyer purchases gift (beneficiary unknown)
    const giftResponse = await api.post('/policies/gift', {
      buyerAddress: buyer.address,
      coverageType: 'depeg',
      coverageAmount: 50000,
      durationDays: 90,
      giftMessage: 'Happy Birthday!',
      generateRevealCode: true
    });

    expect(giftResponse.status).toBe(201);
    expect(giftResponse.data.giftCertificate.revealCode).toMatch(/^GIFT-[A-Z0-9]{6}$/);

    const revealCode = giftResponse.data.giftCertificate.revealCode;

    // Step 2: Recipient views gift
    const giftData = await api.get(`/gifts/${revealCode}`);

    expect(giftData.status).toBe(200);
    expect(giftData.data.policy.giftMessage).toBe('Happy Birthday!');
    expect(giftData.data.policy.status).toBe('pending_activation');

    // Step 3: Recipient activates gift
    const activateResponse = await api.post('/policies/gift/activate', {
      revealCode,
      beneficiaryAddress: recipient.address
    });

    expect(activateResponse.status).toBe(200);
    expect(activateResponse.data.status).toBe('active');

    // Step 4: Verify policy on-chain
    const policy = await policyFactory.getPolicyData(activateResponse.data.policyId);
    expect(policy.buyer).toEqualAddress(buyer.address);
    expect(policy.beneficiary).toEqualAddress(recipient.address);
    expect(policy.status).toBe(1); // Active
  });
});
```

### Load Testing

#### Bulk Enterprise Enrollment Performance
```typescript
describe('Performance: Enterprise Bulk Operations', () => {
  it('should handle 1000 employee enrollments within 60 seconds', async () => {
    const startTime = Date.now();

    const result = await enterpriseManager.sendBulkCreatePolicies(
      company.getSender(),
      {
        companyId: 1,
        employees: generateEmployees(1000),
        coverageType: 0,
        duration: 365
      }
    );

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(60000); // 60 seconds
    expect(result.success).toBe(true);
  });
});
```

---

## Revenue Model

### Pricing Matrix

| Product Line | Premium Model | Processing Fee | Target Margin |
|-------------|---------------|----------------|---------------|
| Insurance Gifts | Standard + $0.50 | $0.50 | 30% |
| Employee Benefits | Tiered ($8-$35/mo) | $0 | 35% |
| Business Escrow | Standard + 0.5% escrow fee | 0.5% of escrow | 25% |
| Lending Protection | Standard + monitoring $5/mo | $5/mo | 30% |
| DAO Grants | Bulk discount (20% off) | $0 | 40% |
| Remittance | 0.1-0.3% of transfer | 0.3% | 20% |

### Revenue Projections (Year 1)

#### Q1: Launch + Insurance Gifts
- **Gift Policies**: 2,500 @ $12 avg premium = $30,000
- **Processing Fees**: 2,500 @ $0.50 = $1,250
- **Total Q1**: $31,250

#### Q2: + Employee Benefits
- **Gifts**: 5,000 @ $12 = $60,000
- **Enterprise**: 5 companies, 250 employees @ $20/mo avg = $50,000
- **Total Q2**: $110,000 (+252% QoQ)

#### Q3: + Escrow & Lending
- **Gifts**: 8,000 @ $12 = $96,000
- **Enterprise**: 15 companies, 750 employees @ $20/mo = $150,000
- **Escrow**: 500 transactions @ $100 avg = $50,000
- **Lending**: 200 policies @ $50 avg = $10,000
- **Total Q3**: $306,000 (+178% QoQ)

#### Q4: + DAO Grants & Remittance
- **Gifts**: 12,000 @ $12 = $144,000
- **Enterprise**: 30 companies, 1,500 employees @ $20/mo = $300,000
- **Escrow**: 1,000 @ $100 = $100,000
- **Lending**: 500 @ $50 = $25,000
- **DAO Grants**: 3 DAOs, 200 grants @ $30 avg = $18,000
- **Remittance**: 50,000 transfers @ $1.50 avg = $75,000
- **Total Q4**: $662,000 (+116% QoQ)

**Year 1 Total Revenue**: $1,109,250

### Year 3 Projection

| Product Line | Annual Revenue | % of Total |
|-------------|----------------|------------|
| Insurance Gifts | $2,500,000 | 15% |
| Employee Benefits | $4,200,000 | 25% |
| Business Escrow | $1,680,000 | 10% |
| Lending Protection | $3,024,000 | 18% |
| DAO Grants | $1,344,000 | 8% |
| Remittance Protection | $4,032,000 | 24% |
| **Total** | **$16,780,000** | **100%** |

---

## Success Metrics

### Product-Specific KPIs

#### Insurance Gifts
- **Adoption**: 15% of all policies are gifts by Month 12
- **Conversion**: 15% of gift recipients purchase additional policies
- **Viral Coefficient**: 1.3 (each gift generates 1.3 new users)
- **Average Gift Value**: $12 premium

#### Employee Benefits
- **Enterprise Customers**: 30 companies by Month 12
- **Employees Covered**: 1,500 by Month 12
- **Retention Rate**: 85% annual renewal
- **Upgrade Rate**: 40% Basic → Premium

#### Business Escrow
- **Transaction Volume**: $2M combined escrow+insurance by Month 12
- **Average Transaction**: $100 premium
- **Completion Rate**: 90% of escrows complete successfully
- **Dispute Rate**: <5%

#### Lending Protection
- **Protocol Integrations**: 3 TON DeFi protocols by Month 12
- **Active Loans Covered**: 500 by Month 12
- **Default Claim Rate**: <10%
- **Repeat Borrower Rate**: 60%

#### DAO Grants
- **Partner DAOs**: 3-5 major DAOs by Month 12
- **Grants Protected**: 200 by Month 12
- **Average Grant Premium**: $30
- **DAO Renewal Rate**: 90%

#### Remittance Protection
- **Monthly Transfers**: 50,000 by Month 12
- **Average Transfer Premium**: $1.50
- **Target Markets**: Philippines, Indonesia, Turkey
- **User Retention**: 40% (high churn, high volume)

---

## Next Steps

### Immediate Actions (Week 1)

1. **Smart Contract Team**:
   - Review and approve smart contract specifications
   - Begin `PolicyFactory.fc` modifications
   - Set up testnet deployment pipeline

2. **Backend Team**:
   - Review and approve database schema changes
   - Begin API endpoint implementation
   - Set up staging environment

3. **Frontend Team**:
   - Review component specifications
   - Begin `BeneficiarySelector` development
   - Design gift certificate templates

4. **Product Team**:
   - Finalize pricing for each product line
   - Identify pilot enterprise customers
   - Draft marketing materials

### Week 2 Milestones

- [ ] Smart contracts deployed to testnet
- [ ] Database migrations complete
- [ ] Gift API endpoints functional
- [ ] `BeneficiarySelector` component complete
- [ ] Initial tests passing

---

**Document Status**: APPROVED FOR IMPLEMENTATION
**Next Review**: Weekly during development
**Owner**: Engineering Team
**Contact**: eng@tonsurance.com

---

*Stay Tonsured, Stay Secure* 🛡️
*Now Protecting Everyone You Care About* ❤️
