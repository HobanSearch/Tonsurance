'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';
import Link from 'next/link';

export default function HedgedCoverageExplained() {
  return (
    <Layout>
      <SEO
        title="Hedged Coverage: How We Reduce Premiums by 30% | Blog"
        description="Learn how Tonsurance's swing pricing model uses external hedges via Polymarket, Perpetuals, and Allianz to lower your coverage costs."
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
                Product
              </span>
            </div>

            <h1 className="text-5xl font-heading font-bold text-text-primary mb-6">
              Hedged Coverage: How We Reduce Premiums by 30%
            </h1>

            <div className="flex items-center gap-4 mb-8 text-text-secondary">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🤖</span>
                <span className="font-medium">Tonny</span>
              </div>
              <span>•</span>
              <span>Oct 2025</span>
              <span>•</span>
              <span>8 min read</span>
            </div>
          </motion.div>

          <article className="prose prose-lg max-w-none">
            <div className="bg-cream-300 rounded-2xl p-8 mb-8">
              <p className="text-xl text-text-primary font-medium mb-0">
                What if I told you we could reduce your coverage premiums by up to 30% while maintaining the same protection? That's what hedged coverage does. Let me explain how. 📈
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              The Problem with Traditional Coverage
            </h2>

            <p className="text-text-primary mb-6">
              Traditional parametric coverage requires 100% on-chain collateral. If you want $10,000 in coverage, we need to lock up $10,000+ in reserves. This capital inefficiency drives up premium costs.
            </p>

            <p className="text-text-primary mb-6">
              But what if we could <strong>hedge</strong> that risk externally? Instead of holding 100% reserves, we could hold 80% on-chain and hedge the remaining 20% through external markets. This is exactly what hedged coverage does.
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              How Hedged Coverage Works
            </h2>

            <p className="text-text-primary mb-6">
              Tonsurance's hedged coverage uses a <strong>swing pricing model</strong> that combines on-chain collateral with external risk hedges. Here's the breakdown:
            </p>

            <div className="bg-copper-500 text-white rounded-xl p-6 my-8">
              <h3 className="text-2xl font-heading font-bold mb-4">Capital Allocation (Example: $10M Coverage)</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-cream-200">On-Chain (80%):</span>
                  <span className="font-bold">$8M</span>
                </div>
                <div className="pl-4 space-y-2 text-sm">
                  <div className="flex justify-between text-cream-300">
                    <span>Primary Vault (45%):</span>
                    <span>$4.5M</span>
                  </div>
                  <div className="flex justify-between text-cream-300">
                    <span>Secondary Vault (20%):</span>
                    <span>$2M</span>
                  </div>
                  <div className="flex justify-between text-cream-300">
                    <span>TradFi Buffer (10%):</span>
                    <span>$1M</span>
                  </div>
                  <div className="flex justify-between text-cream-300">
                    <span>Reserve (25%):</span>
                    <span>$2.5M</span>
                  </div>
                </div>
                <div className="border-t border-cream-300 pt-3 mt-3">
                  <div className="flex justify-between">
                    <span className="text-cream-200">External Hedges (20%):</span>
                    <span className="font-bold">$2M</span>
                  </div>
                  <div className="pl-4 space-y-2 text-sm mt-2">
                    <div className="flex justify-between text-cream-300">
                      <span>Polymarket (40%):</span>
                      <span>$800K</span>
                    </div>
                    <div className="flex justify-between text-cream-300">
                      <span>Perpetuals (40%):</span>
                      <span>$800K</span>
                    </div>
                    <div className="flex justify-between text-cream-300">
                      <span>Allianz Parametric (20%):</span>
                      <span>$400K</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Three External Hedge Venues
            </h2>

            <p className="text-text-primary mb-6">
              We diversify risk across three complementary hedge venues:
            </p>

            <div className="space-y-6 mb-8">
              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  1. Polymarket (40% allocation)
                </h3>
                <p className="text-text-primary mb-3">
                  Prediction markets for crypto events. We buy YES shares on events like "USDT &lt; $0.98 in Q1" to hedge depeg risk.
                </p>
                <p className="text-text-secondary text-sm">
                  <strong>Advantages:</strong> Deep liquidity, instant settlement, transparent on-chain pricing
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  2. Binance Perpetuals (40% allocation)
                </h3>
                <p className="text-text-primary mb-3">
                  Perpetual futures for inverse exposure. We short TON/USDT pairs to hedge against price drops.
                </p>
                <p className="text-text-secondary text-sm">
                  <strong>Advantages:</strong> High leverage, funding rate opportunities, 24/7 liquidity
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  3. Allianz Parametric (20% allocation)
                </h3>
                <p className="text-text-primary mb-3">
                  Traditional reinsurance for tail risk. Enterprise-grade parametric insurance from a Fortune 50 insurer.
                </p>
                <p className="text-text-secondary text-sm">
                  <strong>Advantages:</strong> Regulatory backing, catastrophic risk coverage, institutional trust
                </p>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Real Premium Comparison
            </h2>

            <p className="text-text-primary mb-6">
              Let's see how hedged coverage affects your premium for $10,000 USDT depeg protection over 30 days:
            </p>

            <div className="grid md:grid-cols-2 gap-6 my-8">
              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-4">
                  Traditional Coverage
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Base Premium (0.8% APR):</span>
                    <span className="text-text-primary font-mono">$6.58</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">100% Collateral Cost:</span>
                    <span className="text-text-primary font-mono">$343.42</span>
                  </div>
                  <div className="border-t border-cream-400 pt-2 mt-2 flex justify-between font-bold">
                    <span className="text-text-primary">Total Premium:</span>
                    <span className="text-copper-500 font-mono">$350.00</span>
                  </div>
                </div>
              </div>

              <div className="bg-copper-500 text-white rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold mb-4">
                  Hedged Coverage ✨
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-cream-300">Base Premium:</span>
                    <span className="font-mono">$6.58</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cream-300">Polymarket (40%):</span>
                    <span className="font-mono">$100.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cream-300">Perpetuals (40%):</span>
                    <span className="font-mono">$60.00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-cream-300">Allianz (20%):</span>
                    <span className="font-mono">$9.00</span>
                  </div>
                  <div className="border-t border-cream-300 pt-2 mt-2 flex justify-between font-bold">
                    <span>Total Premium:</span>
                    <span className="font-mono">$175.58</span>
                  </div>
                  <div className="border-t border-cream-300 pt-2 mt-2 flex justify-between font-bold text-lg">
                    <span>Savings:</span>
                    <span className="text-terminal-green">50% ($174.42)</span>
                  </div>
                </div>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              How Claims Work
            </h2>

            <p className="text-text-primary mb-6">
              When a hedged policy triggers, here's what happens:
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-4">
                <span className="text-3xl">1️⃣</span>
                <div>
                  <h4 className="font-bold text-text-primary mb-2">Immediate Payout (5 seconds)</h4>
                  <p className="text-text-secondary text-sm">
                    You receive 100% payout instantly: 80% from on-chain reserves, 20% from temporary float.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="text-3xl">2️⃣</span>
                <div>
                  <h4 className="font-bold text-text-primary mb-2">Hedge Liquidation (30s - 5min)</h4>
                  <p className="text-text-secondary text-sm">
                    Our keepers liquidate external hedge positions (Polymarket, Perpetuals, Allianz) in parallel.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <span className="text-3xl">3️⃣</span>
                <div>
                  <h4 className="font-bold text-text-primary mb-2">Reserve Refill</h4>
                  <p className="text-text-secondary text-sm">
                    Hedge proceeds refill the reserve vault. The 20% float is replenished automatically.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-terminal-green/10 border-2 border-terminal-green rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-terminal-green mb-3">
                ✓ You Never Wait for Hedges
              </h3>
              <p className="text-text-primary mb-0">
                Unlike traditional reinsurance (which can take weeks to settle), you get paid immediately. Hedge settlements happen in the background and don't delay your payout.
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              When Should You Choose Hedged Coverage?
            </h2>

            <p className="text-text-primary mb-6">
              Hedged coverage is ideal when:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                External hedge markets are liquid and fairly priced
              </li>
              <li className="text-text-primary">
                You want the lowest possible premium
              </li>
              <li className="text-text-primary">
                You're comfortable with our external hedge counterparties
              </li>
              <li className="text-text-primary">
                Market conditions favor hedging (low volatility, favorable funding rates)
              </li>
            </ul>

            <p className="text-text-primary mb-6">
              <strong>Traditional coverage</strong> may be better when external hedges are expensive or unavailable (high volatility periods, illiquid markets).
            </p>

            <div className="bg-copper-500 text-white rounded-2xl p-8 text-center my-12">
              <h3 className="text-3xl font-heading font-bold mb-4">
                Try Hedged Coverage Today
              </h3>
              <p className="text-xl text-cream-200 mb-6">
                Chat with me to compare hedged vs. traditional pricing for your coverage needs!
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
              Questions?
            </h2>

            <p className="text-text-primary mb-6">
              Want to learn more about how swing pricing works or see live hedge breakdowns? Feel free to reach out! 🤖
            </p>

            <div className="border-t border-cream-400 pt-8 mt-12">
              <p className="text-text-secondary text-center mb-4">
                Ready to get lower premiums? Let's chat!
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
