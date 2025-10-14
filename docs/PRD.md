# Tonsurance - Product Requirements Document (PRD)

**Version**: 1.0
**Last Updated**: January 2025
**Status**: Official Product Specification
**Owner**: Product Team

---

## Executive Summary

### Product Vision
Tonsurance is the first DeFi insurance protocol built as a Telegram Mini-App on the TON blockchain, making crypto protection simple, affordable, and accessible to retail users.

### Mission
To protect everyday crypto users from DeFi risks through an intuitive, community-driven insurance platform that lives where users already are—inside Telegram.

### Target Launch
Q1 2025

---

## Table of Contents

1. [Product Strategy](#product-strategy)
2. [User Personas](#user-personas)
3. [User Journey Maps](#user-journey-maps)
4. [Feature Specifications](#feature-specifications)
5. [Technical Requirements](#technical-requirements)
6. [Success Metrics](#success-metrics)
7. [Launch Roadmap](#launch-roadmap)
8. [Risk Assessment](#risk-assessment)

---

## Product Strategy

### Market Position

**Primary Market**: Retail crypto users on Telegram/TON ecosystem
**Secondary Market**: Active DeFi participants seeking affordable protection
**Total Addressable Market**: 500M+ Telegram users, 50M+ crypto holders

### Competitive Differentiation

| Feature | Tonsurance | Nexus Mutual | InsurAce | Unslashed |
|---------|-----------|--------------|----------|-----------|
| Platform | Telegram Mini-App | Web | Web | Web |
| UX Complexity | Simple (60s to policy) | Complex | Medium | Complex |
| Target User | Retail | Institutional | Mixed | Enterprise |
| Min Coverage | $10 | $1,000+ | $100+ | $10,000+ |
| Brand | Approachable | Professional | Generic | Technical |
| Chain | TON | Ethereum | Multi-chain | Ethereum |

### Value Propositions

**For Users:**
- ⚡ **Fast**: Get covered in 60 seconds, no KYC
- 🎯 **Simple**: No jargon, clear terms, mobile-first
- 💰 **Affordable**: Premiums from $1/month, micro-coverage available
- 🔒 **Trustless**: Smart contracts, transparent on-chain claims
- 📱 **Native**: Built for Telegram, where crypto users live

**For Protocol:**
- First-mover advantage in TON insurance
- Viral distribution via Telegram network effects
- Community-owned governance model
- Sustainable premium-based revenue

---

## User Personas

### Persona 1: "Cautious Carl"

**Demographics:**
- Age: 24
- Location: Philippines
- Occupation: Freelance graphic designer
- Crypto Experience: 1 year
- Portfolio: $500 in USDT, small TON holdings

**Behaviors:**
- Checks Telegram 20+ times daily
- Plays Hamster Kombat, Notcoin
- Holds mostly stablecoins (USDT)
- Afraid of losing savings to depeg/hack
- Shares crypto tips with friends

**Pain Points:**
- "I don't understand traditional insurance"
- "What if USDT loses its peg?"
- "Insurance is too expensive for my small portfolio"
- "I don't trust centralized platforms"

**Goals:**
- Protect $500 USDT holdings
- Sleep better at night
- Understand what he's buying
- Spend less than $5/month

**How Tonsurance Helps:**
- Simple USDT depeg coverage
- $2-3 premium for $500 coverage
- Explains risks in plain language
- Telegram-native, no new apps

---

### Persona 2: "DeFi Degen Dana"

**Demographics:**
- Age: 28
- Location: Turkey
- Occupation: Software developer
- Crypto Experience: 3 years
- Portfolio: $8,000 across multiple protocols

**Behaviors:**
- Active on STON.fi, DeDust
- Provides liquidity, yields farming
- Researches protocols before investing
- Participates in DAOs and governance
- Early adopter of new apps

**Pain Points:**
- "I've been rugged twice"
- "Smart contract exploits keep me up at night"
- "I want to try new protocols but afraid of risk"
- "Existing insurance is too corporate/boring"

**Goals:**
- Cover positions in new protocols
- Explore DeFi without fear
- Support community-driven projects
- Have fun while being protected

**How Tonsurance Helps:**
- Protocol exploit coverage for STON.fi, DeDust
- Governance token for DAO participation
- Gamified experience (badges, referrals)
- Community voting on claims

---

### Persona 3: "Telegram Tina"

**Demographics:**
- Age: 21
- Location: Indonesia
- Occupation: University student
- Crypto Experience: 6 months
- Portfolio: $200 in various tokens

**Behaviors:**
- Discovered crypto via Telegram mini-apps
- Plays tap-to-earn games
- Participates in airdrops
- Shares discoveries with university friends
- Influenced by social proof

**Pain Points:**
- "I don't want to leave Telegram to use apps"
- "My portfolio is small, insurance seems unnecessary"
- "I don't understand complex financial products"
- "I trust what my friends recommend"

**Goals:**
- Stay safe while exploring crypto
- Find apps her friends will love
- Earn rewards/airdrops
- Keep everything in Telegram

**How Tonsurance Helps:**
- Never leaves Telegram
- Micro-coverage for $100+ portfolios
- Referral rewards for sharing
- Fun, shareable interface
- Future SURE token airdrop

---

## User Journey Maps

### Journey 1: First-Time Policy Purchase

**Entry Point**: User sees Tonsurance shared in Telegram group

#### Stage 1: Discovery (0-30 seconds)
**User Actions:**
- Clicks shared link/bot message
- Sees mini-app preview in Telegram
- Reads quick description

**User Thoughts:**
- "What is this?"
- "Is this legit?"
- "Do I need this?"

**Touchpoints:**
- Mini-app preview card
- Initial loading screen
- Welcome message

**Success Criteria:**
- User clicks "Open App"
- Completion rate: >70%

---

#### Stage 2: Onboarding (30-90 seconds)
**User Actions:**
- Views welcome screen
- Scans "How It Works" (3 simple steps)
- Clicks "Get Started"

**User Thoughts:**
- "This looks simple"
- "I understand what this does"
- "Let me try it"

**Touchpoints:**
- Welcome animation
- Value proposition cards
- "Get Started" CTA

**UI Requirements:**
- Maximum 3 onboarding screens
- Skip option available
- Visual illustrations (not text-heavy)

**Success Criteria:**
- User proceeds to wallet connection
- Drop-off rate: <15%

---

#### Stage 3: Wallet Connection (90-120 seconds)
**User Actions:**
- Clicks "Connect Wallet"
- Authorizes TON Connect
- Sees wallet balance

**User Thoughts:**
- "Is this secure?"
- "Will they take my money?"
- "Good, I can see my balance"

**Touchpoints:**
- TON Connect integration
- Security badge/messaging
- Balance confirmation

**Technical Requirements:**
- Support TON Space, Tonkeeper, MyTonWallet
- Show wallet address (truncated)
- Display TON balance

**Success Criteria:**
- Wallet connected successfully
- Drop-off rate: <10%

---

#### Stage 4: Coverage Selection (120-180 seconds)
**User Actions:**
- Views coverage types (4 cards)
- Selects "USDT Depeg Protection"
- Reads brief explanation

**User Thoughts:**
- "I hold USDT, this makes sense"
- "What does depeg mean?" (tooltip explains)
- "Okay, let's continue"

**Touchpoints:**
- Coverage type cards
- Explainer tooltips
- "Select" button

**UI Requirements:**
- 4 coverage cards with icons
- 1-sentence description each
- "Learn More" expandable
- Visual risk indicators

**Coverage Options (MVP):**
1. USDT Depeg Protection ⭐ (Recommended)
2. Protocol Exploit (STON.fi, DeDust)
3. Bridge Hack Protection
4. Rug Pull Insurance (Coming Soon)

**Success Criteria:**
- User selects coverage type
- Engagement with tooltips
- Drop-off rate: <20%

---

#### Stage 5: Amount & Duration (180-240 seconds)
**User Actions:**
- Moves slider to select coverage amount
- Sees real-time premium calculation
- Selects duration (30/90/180 days)
- Sees total premium update

**User Thoughts:**
- "I can afford $2 for $500 coverage"
- "90 days seems reasonable"
- "The price is fair"

**Touchpoints:**
- Interactive slider ($10 - $1,000 range)
- Live premium calculator
- Duration selector (chips/buttons)

**UI Requirements:**
- Smooth slider interaction
- Instant premium updates (<100ms)
- Clear breakdown:
  - Coverage Amount: $500
  - Duration: 90 days
  - Premium: $1.97
  - You Pay: 0.15 TON

**Calculation Display:**
```
Coverage: $500 USDT Depeg
Duration: 90 days
Premium: $1.97 (0.15 TON)

If USDT drops below $0.95 for 4+ hours,
you'll receive $500 payout in TON.
```

**Success Criteria:**
- User sets amount & duration
- Understands premium calculation
- Drop-off rate: <25%

---

#### Stage 6: Review & Confirm (240-300 seconds)
**User Actions:**
- Reviews policy summary
- Reads simplified terms
- Clicks "Purchase Policy"

**User Thoughts:**
- "Let me make sure this is right"
- "The terms are actually understandable"
- "Okay, I'm ready to buy"

**Touchpoints:**
- Policy summary card
- Terms & conditions (simplified)
- Purchase button

**UI Requirements:**
- Clean summary card:
  - Coverage type + icon
  - Amount covered
  - Premium cost
  - Duration
  - Start date
  - What's covered / not covered
- Checkbox: "I understand the terms"
- Prominent "Purchase Policy" button

**Legal Requirements:**
- Terms of Service link
- Risk disclaimers
- Coverage limitations
- Claim process overview

**Success Criteria:**
- User clicks "Purchase Policy"
- Terms checkbox checked
- Drop-off rate: <30%

---

#### Stage 7: Payment (300-330 seconds)
**User Actions:**
- Confirms transaction in wallet
- Waits for blockchain confirmation
- Sees success animation

**User Thoughts:**
- "Processing... hope this works"
- "Confirmed! That was fast"

**Touchpoints:**
- Transaction pending screen
- Blockchain confirmation
- Success animation

**Technical Requirements:**
- TON payment processing
- Real-time tx status
- Error handling (insufficient funds, timeout)

**UI States:**
1. Initiating payment...
2. Confirm in your wallet
3. Processing transaction...
4. Success! ✓

**Success Criteria:**
- Transaction completes successfully
- Clear error messages if failure
- Retry option for failed tx

---

#### Stage 8: Success & Share (330-360 seconds)
**User Actions:**
- Sees "You're Tonsured!" success screen
- Views policy NFT certificate
- Shares on social (optional)
- Receives welcome message

**User Thoughts:**
- "That was so easy!"
- "I want to show my friends"
- "I feel more secure now"

**Touchpoints:**
- Success screen with celebration
- Policy certificate (NFT)
- Share buttons
- Referral code

**UI Requirements:**
- Celebratory animation/confetti
- Policy card preview
- Share options:
  - Share to Telegram friends
  - Post to Twitter
  - Copy referral link
- "View My Policies" button

**Social Sharing Template:**
```
🛡️ Just got Tonsured!

Protected my crypto in 60 seconds with @tonsurance

Stay Tonsured, Stay Secure 💎

[Get 5% off with my referral link]
```

**Success Criteria:**
- User sees success confirmation
- Policy NFT minted
- Share rate: >15%
- Referral code generated

---

### Journey 2: Filing a Claim

**Trigger**: User suspects covered event has occurred

#### Stage 1: Claim Initiation (0-60 seconds)
**User Actions:**
- Opens Tonsurance mini-app
- Sees "File a Claim" button
- Clicks to start process

**User Thoughts:**
- "Did my covered event happen?"
- "How do I file a claim?"
- "I hope this is easy"

**Touchpoints:**
- Home screen "File Claim" CTA
- Active policies list

**UI Requirements:**
- Prominent "File Claim" button
- List of active policies
- Status indicators

---

#### Stage 2: Event Selection (60-120 seconds)
**User Actions:**
- Selects affected policy
- Describes what happened
- Provides evidence (optional)

**User Thoughts:**
- "Let me select my USDT policy"
- "USDT dropped to $0.93"
- "Should I add proof?"

**Touchpoints:**
- Policy selector
- Event description form
- Evidence upload

**UI Requirements:**
- Dropdown: Select policy
- Text area: Describe event
- Optional fields:
  - Transaction hashes
  - Screenshots
  - Links to announcements

**Auto-Detection:**
- System checks if event meets auto-approval criteria
- USDT price < $0.95 for 4+ hours (Chainlink oracle)
- Show: "We've detected this event. Auto-processing..."

---

#### Stage 3: Claim Submission (120-180 seconds)
**User Actions:**
- Reviews claim summary
- Submits claim
- Receives confirmation

**User Thoughts:**
- "Looks good, submitting now"
- "What happens next?"

**Touchpoints:**
- Claim summary
- Submit button
- Confirmation message

**UI Requirements:**
- Claim summary card:
  - Policy details
  - Event description
  - Evidence attached
  - Processing timeline
- "Submit Claim" button
- Estimated resolution time

**Notification:**
```
Claim Submitted Successfully! 🎯

Your claim is being processed.

Auto-Approval: If verified automatically,
payout within 4 hours.

Manual Review: If needed, community voting
begins in 24 hours (72-hour period).

We'll notify you of updates.
```

---

#### Stage 4: Waiting Period (Varies)

**Scenario A: Auto-Approved (4-24 hours)**
**User Actions:**
- Receives notification
- Checks claim status
- Sees approval message

**User Thoughts:**
- "It got auto-approved!"
- "When do I get paid?"

**Touchpoints:**
- Push notification
- Claim status page
- Payout timeline

**UI Requirements:**
- Status: Approved ✓
- Payout amount: $500 (15.4 TON)
- Expected payout: Within 24 hours
- Transaction link (when processed)

---

**Scenario B: Manual Review (72 hours + voting)**
**User Actions:**
- Receives notification about voting
- Checks voting status
- Sees community discussion

**User Thoughts:**
- "Why does it need voting?"
- "What are people saying?"
- "I hope they approve it"

**Touchpoints:**
- Voting announcement
- Live vote tracker
- Discussion forum

**UI Requirements:**
- Voting status dashboard:
  - Yes votes: 67%
  - No votes: 33%
  - Total votes: 1,234 SURE
  - Time remaining: 48h 23m
- View arguments (pro/con)
- Live updates

---

#### Stage 5: Resolution (Approval)
**User Actions:**
- Receives approval notification
- Checks payout status
- Receives funds to wallet

**User Thoughts:**
- "Approved! Thank you!"
- "The payout is in my wallet"
- "This actually works!"

**Touchpoints:**
- Approval notification
- Payout confirmation
- Wallet balance update

**UI Requirements:**
- Success message
- Transaction details
- Policy closure notice

**Notification:**
```
Claim Approved! 🎉

Payout: $500 (15.4 TON)
Status: Processing...

You'll receive funds within 24 hours.

Your policy is now closed.
Want to get Tonsured again? [Buy Policy]
```

---

#### Stage 6: Post-Claim (Follow-up)
**User Actions:**
- Rates experience
- Shares success story (optional)
- Considers new policy

**User Thoughts:**
- "That was smoother than expected"
- "I should tell others about this"
- "I'll buy another policy soon"

**Touchpoints:**
- Satisfaction survey
- Share CTA
- Re-purchase prompt

**UI Requirements:**
- Rating: 1-5 stars
- Feedback form
- Social share template
- Discount for repurchase

---

### Journey 3: Community Governance Participation

**Entry Point**: User holds SURE tokens and wants to participate

#### Stage 1: Stake Tokens (For Voting Rights)
**User Actions:**
- Navigates to Governance tab
- Views staking options
- Stakes SURE tokens

**Requirements:**
- Minimum stake: 100 SURE
- Lock period: 7 days minimum
- Rewards: Share of 50% protocol fees

---

#### Stage 2: Vote on Claims
**User Actions:**
- Sees active claims needing votes
- Reviews evidence
- Casts vote (Yes/No)

**UI Requirements:**
- Active claims feed
- Evidence viewer
- Voting buttons
- Stake weight display

---

#### Stage 3: Governance Proposals
**User Actions:**
- Views active proposals
- Reads discussion
- Votes on governance decisions

**Proposal Types:**
- Add new coverage types
- Adjust premium rates
- Protocol upgrades
- Treasury allocation

---

## Feature Specifications

### MVP Features (Phase 1 - Month 0-3)

#### 1. Wallet Connection
**Priority**: P0 (Must Have)

**Functional Requirements:**
- FR1.1: Support TON Connect 2.0 protocol
- FR1.2: Compatible with TON Space, Tonkeeper, MyTonWallet
- FR1.3: Display connected wallet address (truncated format)
- FR1.4: Show wallet TON balance
- FR1.5: Allow wallet disconnection
- FR1.6: Persist connection state (session)

**Technical Requirements:**
- TR1.1: Use @tonconnect/ui-react library
- TR1.2: Implement secure session management
- TR1.3: Handle connection errors gracefully
- TR1.4: Support wallet switching

**Acceptance Criteria:**
- User can connect wallet in <10 seconds
- Connection persists across app sessions
- Error messages are clear and actionable
- Works on mobile and desktop Telegram

---

#### 2. Policy Purchase Flow
**Priority**: P0 (Must Have)

**Functional Requirements:**
- FR2.1: Select coverage type (4 options)
- FR2.2: Set coverage amount via slider ($10-$1,000)
- FR2.3: Choose duration (30/90/180 days)
- FR2.4: Real-time premium calculation (<100ms)
- FR2.5: Review policy summary
- FR2.6: Accept terms & conditions
- FR2.7: Process TON payment
- FR2.8: Mint policy NFT on success

**Technical Requirements:**
- TR2.1: Smart contract: PolicyFactory
- TR2.2: Premium calculation engine
- TR2.3: TON payment processing
- TR2.4: NFT minting (TEP-62 standard)
- TR2.5: Transaction status tracking

**Acceptance Criteria:**
- Complete flow in <90 seconds
- Premium calculations are accurate
- Policy NFT minted immediately on payment
- All edge cases handled (insufficient funds, etc.)

---

#### 3. Coverage Types (MVP)
**Priority**: P0 (Must Have)

##### 3.1 USDT Depeg Protection
**What's Covered:**
- USDT price drops below $0.95 for 4+ consecutive hours

**Trigger:**
- Chainlink oracle verification
- Auto-approval if criteria met

**Payout:**
- Coverage amount in TON (at market rate)
- Example: $500 coverage = 15.4 TON (if TON = $32.50)

**Premium Calculation:**
```
Base Rate: 0.8% APR
Example:
$500 coverage × 0.008 × (90/365) = $0.99
With time factor (90 days = 1.0x) = $0.99
In TON: 0.99 / 32.50 = 0.030 TON
```

**Exclusions:**
- Temporary price fluctuations <4 hours
- User error (sent to wrong address)
- Exchange-specific depegs

---

##### 3.2 Protocol Exploit Coverage
**What's Covered:**
- Smart contract exploits on supported protocols:
  - STON.fi
  - DeDust
  - (More added based on audits)

**Trigger:**
- Protocol officially announces exploit
- Total Value Lost (TVL) drops >20% in 1 hour
- Multiple user reports + evidence

**Payout:**
- Coverage amount in TON
- Proportional if partial recovery occurs

**Premium Calculation:**
```
Base Rate: Varies by protocol (1.5% - 3% APR)
- STON.fi: 1.5% (audited, established)
- DeDust: 2.0% (audited, newer)
- New protocols: 3.0%

Example:
$1000 on STON.fi × 0.015 × (90/365) = $3.70
```

**Exclusions:**
- Economic exploits (flash loans, MEV)
- Governance attacks
- Oracle manipulation (unless contract bug)

---

##### 3.3 Bridge Hack Protection
**What's Covered:**
- TON Bridge exploits
- Official TON <> EVM bridges
- Funds lost during bridge transactions

**Trigger:**
- Bridge contract exploited
- Bridge paused by team due to hack
- Transaction stuck >7 days (verified)

**Payout:**
- Amount lost (up to coverage limit)
- In TON tokens

**Premium Calculation:**
```
Base Rate: 2.0% APR

Example:
$800 bridge coverage × 0.02 × (90/365) = $3.95
```

**Exclusions:**
- User error (wrong address)
- Phishing attacks
- Bridge congestion/delays <7 days

---

##### 3.4 Rug Pull Insurance
**Status**: Coming Soon (Phase 2)

**What's Covered:**
- New token launches with liquidity rug pulls
- Developer abandons project with user funds

**Requirements for Coverage:**
- Token must have liquidity locked
- Team KYC verified
- Audit completed
- Minimum 30-day history

**Premium**: 5% APR (high risk)

---

#### 4. Claims Processing
**Priority**: P0 (Must Have)

**Functional Requirements:**
- FR4.1: File claim with evidence
- FR4.2: Auto-verification system
- FR4.3: Manual review workflow
- FR4.4: Community voting mechanism
- FR4.5: Payout processing
- FR4.6: Appeal system

**Auto-Approval Triggers:**
| Event | Verification | Timeline |
|-------|--------------|----------|
| USDT Depeg | Chainlink oracle | 4 hours |
| Protocol Exploit | Official announcement + TVL data | 24 hours |
| Bridge Hack | Bridge pause status | 8 hours |

**Manual Review Process:**
1. Claim submitted
2. Evidence review (24h)
3. Voting period opens (72h)
4. Community votes (SURE token holders)
5. Result: Approve/Reject
6. Payout (if approved, within 24h)

**Technical Requirements:**
- TR4.1: Oracle integration (Chainlink)
- TR4.2: Voting smart contract
- TR4.3: Payout automation
- TR4.4: Fraud detection

**Acceptance Criteria:**
- Auto-approved claims processed within 24h
- Manual claims resolved within 96h
- <5% fraud rate
- 100% payout accuracy

---

#### 5. Policy Dashboard
**Priority**: P0 (Must Have)

**Functional Requirements:**
- FR5.1: View all active policies
- FR5.2: See policy details (coverage, expiry)
- FR5.3: Track claims status
- FR5.4: View claim history
- FR5.5: Renew expiring policies
- FR5.6: Download policy certificates

**UI Components:**
- Active policies grid/list
- Policy cards with status
- Claims tracker
- Renewal reminders
- Certificate viewer (NFT display)

**Technical Requirements:**
- TR5.1: Query blockchain for user policies
- TR5.2: Real-time status updates
- TR5.3: NFT metadata rendering
- TR5.4: Push notifications (Telegram)

---

#### 6. Governance (SURE Token)
**Priority**: P1 (Should Have for MVP)

**Functional Requirements:**
- FR6.1: Stake SURE tokens
- FR6.2: Vote on claims (weighted by stake)
- FR6.3: Submit governance proposals
- FR6.4: Vote on protocol changes
- FR6.5: Earn fee share rewards

**Token Economics:**
- Total Supply: 1,000,000,000 SURE
- Voting Power: 1 SURE = 1 vote
- Minimum Stake: 100 SURE
- Rewards: 50% of protocol premiums

**Technical Requirements:**
- TR6.1: SURE token contract (Jetton standard)
- TR6.2: Staking contract
- TR6.3: Governance contract
- TR6.4: Reward distribution

---

### Phase 2 Features (Month 4-9)

#### 7. Liquidity Mining
- Stake TON or SURE to provide insurance pool liquidity
- Earn yield from premiums + SURE rewards
- Dynamic APY based on utilization

#### 8. Advanced Coverage
- NFT insurance (protect valuable NFTs)
- Wallet insurance (multi-wallet protection)
- DeFi position insurance (LP tokens)

#### 9. Mobile App (iOS/Android)
- Standalone app (beyond mini-app)
- Enhanced features
- Push notifications

#### 10. API for Protocols
- Embed Tonsurance into other dApps
- White-label insurance offerings
- Affiliate program

---

### Phase 3 Features (Month 10-12)

#### 11. Cross-Chain Expansion
- Support other L1s (Solana, Base)
- Bridge insurance for multi-chain users

#### 12. Institutional Tier
- "Tonsurance Pro" for whales
- Higher coverage limits ($100k+)
- Premium support

#### 13. Analytics Dashboard
- Risk metrics
- Protocol health scores
- Historical claims data

---

## Technical Requirements

### Platform Requirements

**Primary Platform**: Telegram Mini-App (TWA - Telegram Web App)

**Supported Environments:**
- Telegram iOS app (latest 2 versions)
- Telegram Android app (latest 2 versions)
- Telegram Desktop (macOS, Windows, Linux)
- Telegram Web (Chrome, Safari, Firefox)

**Minimum Requirements:**
- Internet connection: 3G or better
- Telegram version: 9.0+
- Device: Smartphone or tablet (responsive design)

---

### Blockchain Requirements

**Primary Chain**: TON (The Open Network)

**Smart Contracts:**
1. PolicyFactory.fc - Create and manage policies
2. ClaimsProcessor.fc - Handle claims logic
3. GovernanceVoting.fc - Community voting
4. SUREToken.fc - Governance token (Jetton standard)
5. StakingPool.fc - Stake SURE, earn rewards
6. Treasury.fc - Hold premiums and payouts

**Oracles:**
- Chainlink (for USDT price feeds)
- Custom oracle for protocol TVL data

**Standards:**
- Jettons (TON's fungible tokens - TEP-74)
- NFTs (TON's non-fungible tokens - TEP-62)
- TON Connect (wallet integration)

---

### Frontend Requirements

**Framework**: React 18+ with TypeScript

**Key Libraries:**
- @tonconnect/ui-react - Wallet integration
- @telegram-apps/sdk - Telegram Mini-App SDK
- @ton/ton - TON blockchain interaction
- Lucide React - Icons
- TailwindCSS - Styling

**Performance:**
- Initial load: <2 seconds
- Time to interactive: <3 seconds
- Smooth 60fps animations

**Accessibility:**
- WCAG 2.1 Level AA compliance
- Keyboard navigation support
- Screen reader friendly

---

### Backend Requirements

**API Framework**: Node.js + Express (or Nest.js)

**Services:**
- User management
- Transaction indexing
- Push notifications (Telegram Bot API)
- Analytics tracking
- Oracle data aggregation

**Database:**
- PostgreSQL (user data, claims history)
- Redis (caching, session management)

**Infrastructure:**
- Cloud provider: AWS, Google Cloud, or DigitalOcean
- CDN: Cloudflare
- Monitoring: Sentry, DataDog

---

### Security Requirements

**Smart Contract Security:**
- SR1: Minimum 2 independent audits
- SR2: Bug bounty program ($50k+ rewards)
- SR3: Time-locked upgrades (48h minimum)
- SR4: Multi-sig for admin functions (3-of-5)

**Application Security:**
- SR5: HTTPS only
- SR6: Content Security Policy (CSP)
- SR7: Rate limiting on API endpoints
- SR8: Input validation and sanitization
- SR9: No storage of private keys
- SR10: Regular penetration testing

**Operational Security:**
- SR11: Incident response plan
- SR12: Regular security audits
- SR13: Secure key management (HSM or MPC)
- SR14: Team security training

---

### Integration Requirements

**Required Integrations:**
1. TON Connect - Wallet connection
2. Telegram Bot API - Notifications
3. Chainlink Oracles - Price feeds
4. STON.fi API - Protocol data
5. DeDust API - Protocol data

**Optional Integrations (Phase 2):**
6. Twitter API - Social sharing
7. Discord webhooks - Community alerts
8. Analytics platforms - User tracking

---

## Success Metrics

### North Star Metric
**Total Value Protected (TVP)**: Total $ value of active policies

**Target**: $10M TVP by Month 12

---

### Key Performance Indicators (KPIs)

#### Acquisition Metrics
| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| Mini-App Installs | 10,000 | 50,000 | 500,000 |
| Active Policies | 1,000 | 5,000 | 50,000 |
| Unique Users | 800 | 4,000 | 40,000 |

#### Engagement Metrics
| Metric | Target |
|--------|--------|
| Policy Purchase Completion Rate | >70% |
| Repeat Purchase Rate | >30% |
| Average Policies per User | 1.5 |
| DAU/MAU Ratio | >25% |

#### Financial Metrics
| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| Total Premiums Collected | $10k | $50k | $500k |
| Total Value Locked (TVL) | $100k | $500k | $10M |
| Average Premium per Policy | $10 | $10 | $10 |
| Gross Margin | 80% | 80% | 80% |

#### Claims Metrics
| Metric | Target |
|--------|--------|
| Claims Filed | 50 (Month 3) |
| Auto-Approval Rate | >60% |
| Average Claim Processing Time | <72 hours |
| Claim Approval Rate | 70-80% |
| Fraud Rate | <5% |

#### Community Metrics
| Metric | Month 3 | Month 6 | Month 12 |
|--------|---------|---------|----------|
| Telegram Group Members | 2,000 | 10,000 | 50,000 |
| Discord Members | 500 | 2,000 | 10,000 |
| Twitter Followers | 5,000 | 20,000 | 100,000 |
| Governance Participants | 200 | 1,000 | 5,000 |

#### Brand Metrics
| Metric | Target |
|--------|--------|
| Net Promoter Score (NPS) | >60 |
| Customer Satisfaction (CSAT) | >4.5/5 |
| Brand Awareness (TON ecosystem) | Top 10 |

---

### Leading Indicators (Monitor Weekly)
1. Mini-app install rate (trend)
2. Purchase funnel conversion rate
3. Wallet connection success rate
4. Policy completion rate
5. Referral rate
6. Social media engagement rate
7. Support ticket volume

---

## Launch Roadmap

### Pre-Launch (Weeks -8 to 0)

#### Week -8 to -6: Foundation
- ✅ Smart contract development complete
- ✅ Security audits scheduled
- ✅ Frontend MVP complete
- ✅ Backend infrastructure deployed
- ✅ Testnet deployment
- ✅ Brand assets finalized

#### Week -6 to -4: Testing
- ✅ Internal testing (team)
- ✅ Bug fixes
- ✅ Smart contract audit results
- ✅ Audit issues remediated
- ✅ Beta testing group recruited (50 users)

#### Week -4 to -2: Beta Launch
- ✅ Beta mini-app live
- ✅ Beta user feedback collection
- ✅ UX improvements
- ✅ Performance optimization
- ✅ Final security audit

#### Week -2 to 0: Pre-Launch Marketing
- ✅ Waitlist opened (target: 5,000 signups)
- ✅ Teaser campaign (Twitter, Telegram)
- ✅ Influencer partnerships confirmed
- ✅ Press kit distributed
- ✅ Launch materials prepared
- ✅ Support team trained

---

### Launch Week (Week 0)

#### Day 1: Official Launch
- 🚀 Mini-app goes live on Telegram
- 📢 Press release distributed
- 🐦 Twitter announcement thread
- 📱 Telegram announcement in groups
- 🎉 Discord launch party
- 💬 Influencer posts

**Goals:**
- 1,000 installs
- 100 policies sold

#### Day 2-3: Education Blitz
- 📚 "How Tonsurance Works" content
- 🎥 Tutorial videos released
- 🧵 Educational Twitter threads
- 💬 AMA sessions in Telegram/Discord

**Goals:**
- 2,000 installs
- 200 policies

#### Day 4-5: Social Proof
- ⭐ User testimonials shared
- 📊 Milestone celebrations (500 policies!)
- 🏆 Top users highlighted
- 🎁 Early adopter rewards announced

**Goals:**
- 5,000 installs
- 500 policies

#### Day 6-7: FOMO Push
- ⏰ Launch bonus ending soon
- 🎯 Referral competition announced
- 📈 Growth stats shared
- 🎊 Week 1 recap

**Goals:**
- 10,000 installs
- 1,000 policies

---

### Post-Launch (Weeks 1-12)

#### Month 1 (Weeks 1-4): Stabilization
**Focus**: Bug fixes, UX improvements, community building

**Milestones:**
- Week 2: 2,500 policies
- Week 3: Ambassador program launch
- Week 4: First month recap, 5,000 policies

**Activities:**
- Daily user feedback review
- Weekly product iterations
- Community engagement (AMAs, contests)
- Influencer partnerships round 2

---

#### Month 2 (Weeks 5-8): Growth
**Focus**: User acquisition, feature expansion

**Milestones:**
- Week 6: SURE token launch
- Week 7: Governance goes live
- Week 8: 10,000 active policies

**Activities:**
- Paid user acquisition begins
- Content marketing ramp-up
- Partnership announcements
- First governance proposals

---

#### Month 3 (Weeks 9-12): Optimization
**Focus**: Retention, scaling, profitability

**Milestones:**
- Week 10: Liquidity mining starts
- Week 11: Protocol partnerships
- Week 12: 50,000 policies, break-even

**Activities:**
- Retention campaigns
- Advanced features development
- Series A preparation
- Year 1 roadmap planning

---

## Risk Assessment

### Product Risks

#### High Severity

**Risk 1: Low User Adoption**
- **Probability**: Medium (30%)
- **Impact**: High
- **Mitigation**:
  - Extensive user research before launch
  - Beta testing with target users
  - Referral incentives
  - Continuous UX optimization
- **Contingency**:
  - Pivot to web app if mini-app fails
  - Adjust pricing (lower premiums)
  - Partner with existing mini-apps

**Risk 2: High Claim Rate (>50%)**
- **Probability**: Medium (25%)
- **Impact**: Critical
- **Mitigation**:
  - Conservative pricing model
  - Actuarial analysis of risks
  - Dynamic premium adjustment
  - Claim limits per period
- **Contingency**:
  - Increase premiums
  - Reduce coverage limits
  - Pause new policies temporarily

**Risk 3: Smart Contract Exploit**
- **Probability**: Low (10%)
- **Impact**: Critical
- **Mitigation**:
  - Multiple security audits
  - Bug bounty program
  - Gradual rollout (coverage limits)
  - Emergency pause mechanism
- **Contingency**:
  - Emergency response plan
  - Insurance on our insurance (Nexus Mutual)
  - Treasury reserve for payouts

---

#### Medium Severity

**Risk 4: Regulatory Uncertainty**
- **Probability**: Medium (40%)
- **Impact**: Medium
- **Mitigation**:
  - Legal counsel engaged
  - Terms carefully drafted
  - Avoid restricted jurisdictions
  - Decentralized governance
- **Contingency**:
  - Geographic restrictions
  - Pivot to "parametric coverage" framing
  - DAO governance transition

**Risk 5: Competitor Launches Similar Product**
- **Probability**: High (60%)
- **Impact**: Medium
- **Mitigation**:
  - First-mover advantage
  - Strong brand identity
  - Community loyalty
  - Continuous innovation
- **Contingency**:
  - Double down on UX
  - Exclusive partnerships
  - Lower pricing
  - Unique features (gamification)

---

#### Low Severity

**Risk 6: Telegram Policy Changes**
- **Probability**: Low (15%)
- **Impact**: High
- **Mitigation**:
  - Diversify distribution (web app backup)
  - Stay compliant with Telegram ToS
  - Build relationships with Telegram team
- **Contingency**:
  - Launch standalone mobile app
  - Pivot to web-based application

**Risk 7: TON Blockchain Issues**
- **Probability**: Very Low (5%)
- **Impact**: High
- **Mitigation**:
  - Monitor TON network health
  - Participate in TON governance
  - Multi-chain research (backup)
- **Contingency**:
  - Pause new policies during outages
  - Migrate to TON L2 or other chain

---

### Technical Risks

**Risk 8: Scalability Bottlenecks**
- **Probability**: Medium (30%)
- **Impact**: Medium
- **Mitigation**:
  - Load testing before launch
  - Scalable architecture (microservices)
  - CDN for frontend assets
  - Database optimization
- **Contingency**:
  - Increase infrastructure budget
  - Implement queuing system
  - Gradual rollout by region

**Risk 9: Oracle Failures**
- **Probability**: Low (15%)
- **Impact**: High
- **Mitigation**:
  - Use multiple oracle sources
  - Fallback mechanisms
  - Manual override capability
- **Contingency**:
  - Pause auto-approvals
  - Switch to manual claims only
  - Integrate backup oracles

---

### Market Risks

**Risk 10: Crypto Bear Market**
- **Probability**: Medium (40%)
- **Impact**: Medium
- **Mitigation**:
  - Focus on stablecoin coverage (always needed)
  - Build loyal community during bear
  - Reduce burn rate, extend runway
- **Contingency**:
  - Shift marketing to "safety" narrative
  - Reduce team size if needed
  - Fundraise in bull market

---

## Appendix

### A. User Testing Results
*(To be completed after beta testing)*

### B. Competitive Analysis Details
*(See Brand Strategy doc)*

### C. Technical Architecture Diagrams
*(See Technical Specification doc)*

### D. Legal Disclaimers
*(To be drafted with legal counsel)*

### E. Marketing Campaign Briefs
*(See Brand Strategy doc)*

---

## Document Control

**Approvals Required:**
- [ ] Product Lead
- [ ] Engineering Lead
- [ ] Design Lead
- [ ] Legal Counsel
- [ ] CEO/Founder

**Review Schedule:**
- Weekly during development
- Monthly post-launch
- Quarterly for strategic updates

**Change Log:**
| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | Jan 2025 | Initial PRD | Product Team |

---

## Questions & Decisions Needed

### Open Questions
1. ❓ Exact SURE token launch date (Month 1 or 3)?
2. ❓ Initial liquidity pool size?
3. ❓ Subsidize premiums at launch or full price?
4. ❓ Cross-chain priority (Solana vs Base vs Ethereum)?
5. ❓ Team size needed for launch?

### Upcoming Decisions
- **By Week -6**: Finalize token economics
- **By Week -4**: Confirm launch date
- **By Week -2**: Set initial premium rates
- **By Week 0**: Approve go-live

---

**Document Status**: DRAFT
**Next Review**: Pre-Launch Week -4
**Owner**: Product Team
**Contact**: product@tonsurance.com

---

*"Stay Tonsured, Stay Secure" 🛡️*
