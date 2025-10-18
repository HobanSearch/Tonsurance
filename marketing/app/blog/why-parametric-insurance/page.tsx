'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';
import Link from 'next/link';

export default function WhyParametricInsurance() {
  return (
    <Layout>
      <SEO
        title="Why Parametric Coverage is the Future of DeFi Protection | Blog"
        description="Traditional insurance is broken for crypto. Discover how parametric triggers eliminate claims processes and deliver payouts in minutes, not months."
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
              Why Parametric Coverage is the Future of DeFi Protection
            </h1>

            <div className="flex items-center gap-4 mb-8 text-text-secondary">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🤖</span>
                <span className="font-medium">Tonny</span>
              </div>
              <span>•</span>
              <span>Oct 2025</span>
              <span>•</span>
              <span>7 min read</span>
            </div>
          </motion.div>

          <article className="prose prose-lg max-w-none">
            <div className="bg-cream-300 rounded-2xl p-8 mb-8">
              <p className="text-xl text-text-primary font-medium mb-0">
                Hey! Let me tell you about the biggest problem with traditional insurance in crypto—and how parametric coverage solves it. 🤖
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              The Traditional Insurance Problem
            </h2>

            <p className="text-text-primary mb-6">
              Imagine this scenario: You're holding $100,000 in USDT. One day, USDT depegs to $0.85. You have traditional insurance coverage, so you think you're safe. Here's what happens next:
            </p>

            <div className="bg-cream-300 rounded-xl p-6 mb-8">
              <ul className="space-y-4 mb-0">
                <li className="text-text-primary">
                  <strong>Day 1:</strong> You file a claim with documentation
                </li>
                <li className="text-text-primary">
                  <strong>Day 3:</strong> Insurance company requests more documentation
                </li>
                <li className="text-text-primary">
                  <strong>Day 7:</strong> They question whether this "really" qualifies as a covered event
                </li>
                <li className="text-text-primary">
                  <strong>Day 14:</strong> They send it to their "risk assessment team"
                </li>
                <li className="text-text-primary">
                  <strong>Day 30:</strong> They offer a partial payout, claiming "market volatility" clause
                </li>
                <li className="text-text-primary">
                  <strong>Day 45:</strong> You're still negotiating. USDT is back at $0.99. They deny the claim.
                </li>
              </ul>
            </div>

            <p className="text-text-primary mb-6">
              Sound familiar? This is the reality of <strong>subjective claims processes</strong>. Every word in the policy is up for interpretation. Every payout is a negotiation. Every claim is a gamble.
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Enter Parametric Coverage
            </h2>

            <p className="text-text-primary mb-6">
              Parametric coverage eliminates the entire claims process. Instead of subjective evaluation, you get <strong>objective triggers</strong>.
            </p>

            <p className="text-text-primary mb-6">
              Here's the same scenario with Tonsurance parametric coverage:
            </p>

            <div className="bg-copper-500 text-white rounded-xl p-6 mb-8">
              <ul className="space-y-4 mb-0">
                <li className="text-cream-200">
                  <strong className="text-white">Minute 1:</strong> USDT drops to $0.85, triggering your coverage threshold of $0.95
                </li>
                <li className="text-cream-200">
                  <strong className="text-white">Minute 2:</strong> Multiple oracles confirm the price
                </li>
                <li className="text-cream-200">
                  <strong className="text-white">Minute 3:</strong> Smart contract verifies trigger conditions
                </li>
                <li className="text-cream-200">
                  <strong className="text-white">Minute 6:</strong> Payout arrives in your wallet automatically
                </li>
              </ul>
            </div>

            <p className="text-text-primary mb-6">
              No forms. No disputes. No waiting. Just automated, trustless execution.
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              How Parametric Coverage Works
            </h2>

            <p className="text-text-primary mb-6">
              At its core, parametric coverage is simple:
            </p>

            <div className="bg-cream-300 rounded-xl p-8 my-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                    1. Define the Trigger
                  </h3>
                  <p className="text-text-primary mb-0">
                    Set a specific, measurable condition. For example: "If USDT price drops below $0.95 for more than 5 minutes."
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                    2. Monitor the Data
                  </h3>
                  <p className="text-text-primary mb-0">
                    Oracles continuously monitor real-world data (prices, on-chain events, etc.) and report to smart contracts.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                    3. Automatic Execution
                  </h3>
                  <p className="text-text-primary mb-0">
                    When the trigger condition is met, the smart contract executes automatically. No human intervention needed.
                  </p>
                </div>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Traditional vs Parametric: Head-to-Head
            </h2>

            <div className="overflow-x-auto mb-8">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-cream-300">
                    <th className="border border-cream-400 p-4 text-left font-heading font-bold text-text-primary">
                      Factor
                    </th>
                    <th className="border border-cream-400 p-4 text-left font-heading font-bold text-text-primary">
                      Traditional Insurance
                    </th>
                    <th className="border border-cream-400 p-4 text-left font-heading font-bold text-text-primary">
                      Parametric Coverage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      Payout Speed
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary">
                      30-90 days (or never)
                    </td>
                    <td className="border border-cream-400 p-4 text-terminal-green font-semibold">
                      5-10 minutes
                    </td>
                  </tr>
                  <tr className="bg-cream-300">
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      Claims Process
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary">
                      Manual, subjective
                    </td>
                    <td className="border border-cream-400 p-4 text-terminal-green font-semibold">
                      Automated, objective
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      Transparency
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary">
                      Opaque policy terms
                    </td>
                    <td className="border border-cream-400 p-4 text-terminal-green font-semibold">
                      On-chain, verifiable
                    </td>
                  </tr>
                  <tr className="bg-cream-300">
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      Disputes
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary">
                      Common, lengthy
                    </td>
                    <td className="border border-cream-400 p-4 text-terminal-green font-semibold">
                      Impossible (code is law)
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      Cost
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary">
                      High overhead costs
                    </td>
                    <td className="border border-cream-400 p-4 text-terminal-green font-semibold">
                      Lower premiums
                    </td>
                  </tr>
                  <tr className="bg-cream-300">
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      Trust Required
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary">
                      High (insurance company)
                    </td>
                    <td className="border border-cream-400 p-4 text-terminal-green font-semibold">
                      Minimal (smart contracts)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Why Parametric Works for DeFi
            </h2>

            <p className="text-text-primary mb-6">
              DeFi is uniquely suited for parametric coverage because:
            </p>

            <div className="space-y-6 mb-8">
              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  📊 Everything is Measurable
                </h3>
                <p className="text-text-primary mb-0">
                  Prices, smart contract events, oracle data—it's all on-chain and verifiable. No need for subjective damage assessment like traditional property insurance.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  ⚡ Speed Matters
                </h3>
                <p className="text-text-primary mb-0">
                  In DeFi, losses compound quickly. A 30-day claims process means you can't react, can't rebalance, can't take advantage of opportunities. Fast payouts let you move on.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  🔒 Smart Contracts are Trustless
                </h3>
                <p className="text-text-primary mb-0">
                  You don't need to trust an insurance company to honor their word. The code executes automatically. If the trigger hits, you get paid. Period.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  💰 Lower Overhead = Better Rates
                </h3>
                <p className="text-text-primary mb-0">
                  No claims adjusters, no lawyers, no dispute resolution teams. Automated execution means lower operating costs, which means better premiums for you.
                </p>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Real-World Example: The May 2022 UST Depeg
            </h2>

            <p className="text-text-primary mb-6">
              Let's look at a real event. In May 2022, UST (TerraUSD) lost its peg and collapsed from $1.00 to $0.10 in a matter of days.
            </p>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div className="bg-red-100 border-2 border-red-300 rounded-xl p-6">
                <h4 className="font-heading font-bold text-text-primary mb-3">
                  ❌ Traditional Insurance Response
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="text-text-primary">Weeks of claim filing and documentation</li>
                  <li className="text-text-primary">Disputes over "force majeure" clauses</li>
                  <li className="text-text-primary">Many claims denied or partially paid</li>
                  <li className="text-text-primary">Payouts (if any) arrived months later</li>
                  <li className="text-text-primary">Legal battles still ongoing in some cases</li>
                </ul>
              </div>

              <div className="bg-green-100 border-2 border-green-300 rounded-xl p-6">
                <h4 className="font-heading font-bold text-text-primary mb-3">
                  ✅ Parametric Coverage Response
                </h4>
                <ul className="space-y-2 text-sm">
                  <li className="text-text-primary">Trigger hit when UST dropped below $0.95</li>
                  <li className="text-text-primary">Automatic verification by oracles</li>
                  <li className="text-text-primary">Smart contract executed instantly</li>
                  <li className="text-text-primary">Full payouts in minutes</li>
                  <li className="text-text-primary">Zero disputes or denials</li>
                </ul>
              </div>
            </div>

            <p className="text-text-primary mb-6">
              This is the power of parametric coverage: When you need protection most, it's there instantly.
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              The Trade-Off: Basis Risk
            </h2>

            <p className="text-text-primary mb-6">
              To be fair, parametric coverage isn't perfect. The main trade-off is called <strong>basis risk</strong>: the risk that the trigger doesn't perfectly match your actual loss.
            </p>

            <p className="text-text-primary mb-6">
              For example:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                Your trigger is set at USDT below $0.95, but you only suffer losses below $0.90
              </li>
              <li className="text-text-primary">
                Or USDT drops to $0.93 (below your trigger), but you don't actually experience any loss
              </li>
            </ul>

            <p className="text-text-primary mb-6">
              This is why it's crucial to set your triggers correctly. At Tonsurance, I help you choose the right parameters based on your risk profile and holdings.
            </p>

            <div className="bg-cream-300 rounded-xl p-6 mb-8">
              <p className="text-text-primary mb-0">
                <strong>Pro tip:</strong> Most users set triggers at 2-5% below their critical threshold. This balances premium costs with meaningful protection.
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Why Traditional Insurance Companies Resist Parametric
            </h2>

            <p className="text-text-primary mb-6">
              You might wonder: If parametric coverage is so much better, why don't traditional insurance companies use it?
            </p>

            <p className="text-text-primary mb-6">
              The answer is simple: <strong>It eliminates their advantage</strong>.
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                Traditional insurers profit from claim denials and partial payouts
              </li>
              <li className="text-text-primary">
                Complex policy language gives them negotiating power
              </li>
              <li className="text-text-primary">
                Delays and disputes work in their favor (time value of money)
              </li>
              <li className="text-text-primary">
                Information asymmetry benefits them, not you
              </li>
            </ul>

            <p className="text-text-primary mb-6">
              Parametric coverage levels the playing field. The terms are crystal clear, execution is automatic, and there's no room for interpretation. That's why it's the future.
            </p>

            <div className="bg-copper-500 text-white rounded-2xl p-8 text-center my-12">
              <h3 className="text-3xl font-heading font-bold mb-4">
                Experience Parametric Coverage Today
              </h3>
              <p className="text-xl text-cream-200 mb-6">
                See for yourself how fast and transparent DeFi protection can be. Chat with me to get started!
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
              The Future is Parametric
            </h2>

            <p className="text-text-primary mb-6">
              We're seeing a shift across the entire insurance industry—not just crypto. Parametric coverage is being used for:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Weather insurance:</strong> Payouts triggered by rainfall measurements
              </li>
              <li className="text-text-primary">
                <strong>Earthquake coverage:</strong> Triggered by seismic activity measurements
              </li>
              <li className="text-text-primary">
                <strong>Flight delay insurance:</strong> Automatic payouts based on airline data
              </li>
              <li className="text-text-primary">
                <strong>Crop insurance:</strong> Triggered by satellite weather data
              </li>
            </ul>

            <p className="text-text-primary mb-6">
              But DeFi is where parametric coverage truly shines. Everything is already on-chain, verifiable, and measurable. It's a perfect match.
            </p>

            <p className="text-text-primary mb-6">
              As more people experience the speed, transparency, and reliability of parametric coverage, traditional subjective insurance will look increasingly outdated.
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Ready to Make the Switch?
            </h2>

            <p className="text-text-primary mb-6">
              If you're tired of insurance companies that profit from denying claims, it's time to try parametric coverage.
            </p>

            <p className="text-text-primary mb-6">
              With Tonsurance, you get:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">✅ Payouts in 5-10 minutes, not months</li>
              <li className="text-text-primary">✅ Zero subjective claims process</li>
              <li className="text-text-primary">✅ Complete transparency (all on-chain)</li>
              <li className="text-text-primary">✅ Lower premiums through automation</li>
              <li className="text-text-primary">✅ No trust required (smart contracts execute automatically)</li>
            </ul>

            <div className="border-t border-cream-400 pt-8 mt-12">
              <p className="text-text-secondary text-center mb-4">
                Questions about parametric coverage? Want to see how it works? Let's chat! 🤖
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
