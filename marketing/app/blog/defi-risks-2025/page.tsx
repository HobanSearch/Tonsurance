'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';
import Link from 'next/link';

export default function DeFiRisks2025() {
  return (
    <Layout>
      <SEO
        title="Top 5 DeFi Risks in 2025 (and How to Protect Yourself) | Blog"
        description="Stablecoin depegs, smart contract exploits, oracle failures, bridge hacks, and rug pulls. Here's what you need to know and how Tonsurance helps."
      />

      <Section className="pt-20">
        <div className="max-w-4xl mx-auto">
          <Link
            href="/blog"
            className="inline-flex items-center text-copper-500 hover:text-copper-600 mb-8 transition-colors"
          >
            ← Back to Blog
          </Link>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="mb-6">
              <span className="text-sm font-semibold px-3 py-1 rounded-full bg-copper-500 text-white">
                Education
              </span>
            </div>

            <h1 className="text-5xl font-heading font-bold text-text-primary mb-6">
              Top 5 DeFi Risks in 2025 (and How to Protect Yourself)
            </h1>

            <div className="flex items-center gap-4 mb-8 text-text-secondary">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🤖</span>
                <span className="font-medium">Tonny</span>
              </div>
              <span>•</span>
              <span>Oct 2025</span>
              <span>•</span>
              <span>10 min read</span>
            </div>
          </motion.div>

          <article className="prose prose-lg max-w-none">
            <div className="bg-cream-300 rounded-2xl p-8 mb-8">
              <p className="text-xl text-text-primary font-medium mb-0">
                DeFi offers amazing opportunities, but it also comes with unique risks. Let's talk about the top 5 threats in 2025—and how you can protect yourself. 🛡️
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              1. Stablecoin Depegs 💵
            </h2>

            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-red-600 mb-3">
                ⚠️ Recent Examples
              </h3>
              <ul className="space-y-2">
                <li className="text-text-primary"><strong>USDC (March 2023):</strong> Dropped to $0.88 during Silicon Valley Bank crisis</li>
                <li className="text-text-primary"><strong>UST (May 2022):</strong> Catastrophic depeg from $1.00 to $0.01, $40B wiped out</li>
                <li className="text-text-primary"><strong>USDD (June 2022):</strong> Dropped to $0.93 after UST collapse</li>
              </ul>
            </div>

            <h3 className="text-2xl font-heading font-bold text-text-primary mt-8 mb-4">
              What Causes Depegs?
            </h3>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Centralized Reserve Issues:</strong> Banking problems (USDC), regulatory seizures, reserve mismanagement
              </li>
              <li className="text-text-primary">
                <strong>Algorithmic Failures:</strong> Broken peg mechanisms (UST), death spirals, liquidity crises
              </li>
              <li className="text-text-primary">
                <strong>Market Panic:</strong> Bank runs, coordinated attacks, confidence loss
              </li>
              <li className="text-text-primary">
                <strong>Smart Contract Bugs:</strong> Minting exploits, collateral miscalculations
              </li>
            </ul>

            <div className="bg-terminal-green/10 border-2 border-terminal-green rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-terminal-green mb-3">
                ✓ How Tonsurance Protects You
              </h3>
              <p className="text-text-primary mb-3">
                Our depeg coverage monitors stablecoin prices every minute across multiple oracles. When a stablecoin drops below your chosen threshold (e.g., $0.95), your payout triggers automatically.
              </p>
              <p className="text-text-primary mb-0">
                <strong>Average payout time: 6 minutes</strong>. No waiting for the peg to recover or hoping your funds are safe.
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              2. Smart Contract Exploits ⚠️
            </h2>

            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-red-600 mb-3">
                ⚠️ 2024 Statistics
              </h3>
              <ul className="space-y-2">
                <li className="text-text-primary"><strong>$1.8B stolen</strong> in smart contract exploits</li>
                <li className="text-text-primary"><strong>127 major hacks</strong> reported</li>
                <li className="text-text-primary"><strong>Average hack size:</strong> $14.2M</li>
              </ul>
            </div>

            <h3 className="text-2xl font-heading font-bold text-text-primary mt-8 mb-4">
              Common Exploit Types
            </h3>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Reentrancy Attacks:</strong> Recursive calls that drain funds before state updates
              </li>
              <li className="text-text-primary">
                <strong>Flash Loan Attacks:</strong> Uncollateralized loans used to manipulate prices/oracles
              </li>
              <li className="text-text-primary">
                <strong>Access Control Bugs:</strong> Missing permission checks allowing unauthorized actions
              </li>
              <li className="text-text-primary">
                <strong>Integer Overflow/Underflow:</strong> Arithmetic bugs causing unexpected behavior
              </li>
              <li className="text-text-primary">
                <strong>Front-Running:</strong> MEV bots exploiting transaction ordering
              </li>
            </ul>

            <div className="bg-copper-500 text-white rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold mb-3">
                📊 Risk by Protocol Type
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-cream-200">Lending Protocols:</span>
                  <span className="font-bold">HIGH RISK</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cream-200">DEXs:</span>
                  <span className="font-bold">MEDIUM-HIGH RISK</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cream-200">Yield Aggregators:</span>
                  <span className="font-bold">MEDIUM RISK</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cream-200">Simple Token Contracts:</span>
                  <span className="font-bold">LOW-MEDIUM RISK</span>
                </div>
              </div>
            </div>

            <div className="bg-terminal-green/10 border-2 border-terminal-green rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-terminal-green mb-3">
                ✓ How Tonsurance Protects You
              </h3>
              <p className="text-text-primary mb-0">
                Our smart contract coverage monitors protocols 24/7 for exploit indicators. When a verified incident occurs (funds drained, protocol paused, admin keys compromised), your payout triggers automatically. We work with security firms like CertiK and Trail of Bits for rapid verification.
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              3. Oracle Failures 🔮
            </h2>

            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-red-600 mb-3">
                ⚠️ Notable Oracle Failures
              </h3>
              <ul className="space-y-2">
                <li className="text-text-primary"><strong>Mango Markets (Oct 2022):</strong> $114M drained via oracle price manipulation</li>
                <li className="text-text-primary"><strong>Venus Protocol (May 2021):</strong> $200M liquidations from incorrect price feeds</li>
                <li className="text-text-primary"><strong>Synthetix (June 2019):</strong> Oracle bug allowed massive sKRW minting</li>
              </ul>
            </div>

            <h3 className="text-2xl font-heading font-bold text-text-primary mt-8 mb-4">
              Oracle Failure Modes
            </h3>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Price Manipulation:</strong> Flash loan attacks, thin liquidity, wash trading
              </li>
              <li className="text-text-primary">
                <strong>Stale Prices:</strong> Oracle downtime, network congestion, keeper failures
              </li>
              <li className="text-text-primary">
                <strong>Incorrect Data:</strong> Bugs in aggregation logic, compromised data sources
              </li>
              <li className="text-text-primary">
                <strong>Single Point of Failure:</strong> Centralized oracles, lack of redundancy
              </li>
            </ul>

            <div className="bg-terminal-green/10 border-2 border-terminal-green rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-terminal-green mb-3">
                ✓ How Tonsurance Protects You
              </h3>
              <p className="text-text-primary mb-0">
                Our oracle coverage monitors deviations between multiple price feeds (Chainlink, Pyth, Band). If a price feed shows anomalous data (e.g., 50% deviation from consensus), or if oracles go offline for extended periods, coverage triggers. We use multi-oracle consensus to verify legitimate failures vs. normal volatility.
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              4. Bridge Hacks 🌉
            </h2>

            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-red-600 mb-3">
                ⚠️ Biggest Bridge Hacks
              </h3>
              <ul className="space-y-2">
                <li className="text-text-primary"><strong>Ronin Bridge (March 2022):</strong> $625M stolen (validator key compromise)</li>
                <li className="text-text-primary"><strong>Wormhole (Feb 2022):</strong> $325M stolen (signature verification bug)</li>
                <li className="text-text-primary"><strong>Poly Network (Aug 2021):</strong> $611M stolen (later returned)</li>
              </ul>
            </div>

            <h3 className="text-2xl font-heading font-bold text-text-primary mt-8 mb-4">
              Why Bridges Are Vulnerable
            </h3>

            <p className="text-text-primary mb-6">
              Cross-chain bridges hold massive amounts of locked assets ($7.5B+ TVL) and rely on complex trust assumptions:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Validator Compromise:</strong> Multisig thresholds breached, key leaks
              </li>
              <li className="text-text-primary">
                <strong>Smart Contract Bugs:</strong> Minting exploits, proof verification failures
              </li>
              <li className="text-text-primary">
                <strong>Relay Attacks:</strong> Message spoofing, replay attacks
              </li>
              <li className="text-text-primary">
                <strong>Economic Attacks:</strong> MEV extraction, front-running, liquidity drains
              </li>
            </ul>

            <div className="bg-terminal-green/10 border-2 border-terminal-green rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-terminal-green mb-3">
                ✓ How Tonsurance Protects You
              </h3>
              <p className="text-text-primary mb-0">
                Our bridge coverage monitors bridge health metrics 24/7: locked vs. minted supply discrepancies, validator activity, abnormal withdrawal patterns. If a bridge is exploited or paused due to security concerns, coverage triggers for all active policies on that bridge.
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              5. Rug Pulls & Exit Scams 🚩
            </h2>

            <div className="bg-red-50 border-2 border-red-400 rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-red-600 mb-3">
                ⚠️ 2024 Rug Pull Statistics
              </h3>
              <ul className="space-y-2">
                <li className="text-text-primary"><strong>$347M stolen</strong> in exit scams</li>
                <li className="text-text-primary"><strong>2,100+ tokens rugged</strong></li>
                <li className="text-text-primary"><strong>Average rug size:</strong> $165K</li>
              </ul>
            </div>

            <h3 className="text-2xl font-heading font-bold text-text-primary mt-8 mb-4">
              Types of Rug Pulls
            </h3>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Liquidity Removal:</strong> Dev removes all DEX liquidity, token becomes worthless
              </li>
              <li className="text-text-primary">
                <strong>Mint Function Exploit:</strong> Hidden backdoor allows unlimited token minting
              </li>
              <li className="text-text-primary">
                <strong>Sell Restrictions:</strong> Code allows buys but blocks sells
              </li>
              <li className="text-text-primary">
                <strong>Upgrade Scams:</strong> Proxy contract upgraded to malicious implementation
              </li>
            </ul>

            <div className="bg-copper-500 text-white rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold mb-3">
                🚨 Red Flags to Watch For
              </h3>
              <ul className="space-y-2 text-sm">
                <li className="text-cream-200">• Anonymous team with no track record</li>
                <li className="text-cream-200">• No contract audit from reputable firm</li>
                <li className="text-cream-200">• Ownership not renounced or transferred to multisig</li>
                <li className="text-cream-200">• Unrealistic APY promises (&gt;1000%)</li>
                <li className="text-cream-200">• Low initial liquidity with no lock</li>
                <li className="text-cream-200">• Copycat of existing successful projects</li>
              </ul>
            </div>

            <p className="text-text-primary mb-6">
              <strong>Important:</strong> Tonsurance currently does NOT cover rug pulls on new/unvetted tokens. We focus on established protocols with security audits. If you're aping into low-cap gems, DYOR and only invest what you can afford to lose.
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Building a Risk Management Strategy
            </h2>

            <p className="text-text-primary mb-6">
              Smart DeFi users layer multiple protections:
            </p>

            <div className="space-y-6 mb-8">
              <div className="bg-cream-300 rounded-xl p-6">
                <h4 className="font-heading font-bold text-text-primary mb-3">
                  1️⃣ Diversification
                </h4>
                <p className="text-text-primary mb-0">
                  Don't put all funds in one protocol or stablecoin. Spread across multiple chains, protocols, and asset types.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h4 className="font-heading font-bold text-text-primary mb-3">
                  2️⃣ Due Diligence
                </h4>
                <p className="text-text-primary mb-0">
                  Check audits, TVL history, team reputation, and smart contract permissions before depositing.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h4 className="font-heading font-bold text-text-primary mb-3">
                  3️⃣ Parametric Coverage
                </h4>
                <p className="text-text-primary mb-0">
                  Buy coverage for your largest holdings. Tonsurance offers protection for the 4 risks above with automated payouts.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h4 className="font-heading font-bold text-text-primary mb-3">
                  4️⃣ Position Sizing
                </h4>
                <p className="text-text-primary mb-0">
                  Never allocate more than you can afford to lose. High-risk strategies should be small % of portfolio.
                </p>
              </div>
            </div>

            <div className="bg-copper-500 text-white rounded-2xl p-8 text-center my-12">
              <h3 className="text-3xl font-heading font-bold mb-4">
                Protect Your DeFi Assets Today
              </h3>
              <p className="text-xl text-cream-200 mb-6">
                Get coverage for stablecoin depegs, smart contract exploits, oracle failures, and bridge hacks with automated payouts in minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" size="lg" href="https://t.me/TonsuranceBot/tonsurance">
                  Launch App →
                </Button>
                <Button variant="outline" size="lg" href="https://t.me/TonsuranceBot">
                  Chat with Tonny 💎
                </Button>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Final Thoughts
            </h2>

            <p className="text-text-primary mb-6">
              DeFi isn't going away—it's growing. But with growth comes new attack vectors and increasingly sophisticated exploits. The users who thrive long-term are those who:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">Understand the risks</li>
              <li className="text-text-primary">Size positions appropriately</li>
              <li className="text-text-primary">Diversify across protocols and chains</li>
              <li className="text-text-primary">Use parametric coverage for peace of mind</li>
            </ul>

            <p className="text-text-primary mb-6">
              Stay safe out there, and feel free to reach out if you have questions! 🤖
            </p>

            <div className="border-t border-cream-400 pt-8 mt-12">
              <p className="text-text-secondary text-center mb-4">
                Want a personalized risk assessment? Let's chat!
              </p>
              <div className="text-center">
                <Button variant="primary" size="md" href="https://t.me/TonsuranceBot">
                  Chat with Tonny
                </Button>
              </div>
            </div>
          </article>
        </div>
      </Section>
    </Layout>
  );
}
