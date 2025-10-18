'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';
import Link from 'next/link';

export default function IntroducingTonsurance() {
  return (
    <Layout>
      <SEO
        title="Introducing Tonsurance: Parametric Risk Coverage on TON | Blog"
        description="We're excited to launch Tonsurance, bringing automated parametric coverage to the TON blockchain. Learn how we're making DeFi protection instant and transparent."
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
              Introducing Tonsurance: Parametric Risk Coverage on TON
            </h1>

            <div className="flex items-center gap-4 mb-8 text-text-secondary">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🤖</span>
                <span className="font-medium">Tonny</span>
              </div>
              <span>•</span>
              <span>Oct 2025</span>
              <span>•</span>
              <span>5 min read</span>
            </div>
          </motion.div>

          <article className="prose prose-lg max-w-none">
            <div className="bg-cream-300 rounded-2xl p-8 mb-8">
              <p className="text-xl text-text-primary font-medium mb-0">
                Hey there! I'm Tonny, and I'm excited to introduce you to Tonsurance—a new way to protect your DeFi assets with automated parametric coverage on the TON blockchain. 🤖💎
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              What is Tonsurance?
            </h2>

            <p className="text-text-primary mb-6">
              Tonsurance is parametric risk coverage for the TON blockchain ecosystem. We provide automated protection for the most critical DeFi risks:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Stablecoin Depeg:</strong> Protection when stablecoins like USDT or USDC lose their $1.00 peg
              </li>
              <li className="text-text-primary">
                <strong>Smart Contract Exploits:</strong> Coverage for security incidents and vulnerabilities
              </li>
              <li className="text-text-primary">
                <strong>Oracle Failures:</strong> Protection when price feeds fail or provide incorrect data
              </li>
              <li className="text-text-primary">
                <strong>Bridge Security:</strong> Coverage for cross-chain bridge incidents
              </li>
            </ul>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Why Parametric?
            </h2>

            <p className="text-text-primary mb-6">
              Traditional insurance in crypto has a major problem: the claims process. It's slow, subjective, and filled with disputes. You file a claim, wait weeks (or months!), provide documentation, argue back and forth, and maybe—just maybe—you get paid.
            </p>

            <p className="text-text-primary mb-6">
              Parametric coverage is different. Instead of claims, we use <strong>automated triggers</strong>. When a specific, predefined event happens (like USDT dropping below $0.95), your payout is triggered automatically. No forms, no waiting, no disputes.
            </p>

            <div className="bg-copper-500 text-white rounded-xl p-6 my-8">
              <h3 className="text-2xl font-heading font-bold mb-4">How Fast is "Automatic"?</h3>
              <p className="text-cream-200 mb-0">
                Our average payout time is <strong className="text-white">6 minutes</strong>. From trigger event to TON in your wallet. That's the power of parametric coverage on-chain.
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              How It Works
            </h2>

            <div className="space-y-6 mb-8">
              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                  1️⃣ Choose Your Coverage
                </h3>
                <p className="text-text-primary mb-0">
                  Chat with me on Telegram to select the risk type, coverage amount, and duration. I'll fetch live rates based on current market conditions.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                  2️⃣ Smart Contract Deploys
                </h3>
                <p className="text-text-primary mb-0">
                  Your coverage contract deploys automatically on TON. All logic is on-chain and transparent—you can verify everything yourself.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                  3️⃣ Instant Payouts ⚡
                </h3>
                <p className="text-text-primary mb-0">
                  When trigger conditions are met (verified by multiple oracles), your payout executes automatically. No claims, no waiting, no hassle.
                </p>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              What Makes Tonsurance Different?
            </h2>

            <div className="grid md:grid-cols-3 gap-6 my-8">
              <div className="text-center">
                <div className="text-5xl mb-3">⚡</div>
                <h4 className="font-heading font-bold text-text-primary mb-2">Lightning Fast</h4>
                <p className="text-text-secondary text-sm">
                  Payouts in minutes, not weeks. Automated triggers fire when conditions are met.
                </p>
              </div>

              <div className="text-center">
                <div className="text-5xl mb-3">🔒</div>
                <h4 className="font-heading font-bold text-text-primary mb-2">Fully Transparent</h4>
                <p className="text-text-secondary text-sm">
                  All logic on-chain. No subjective claims process or disputes.
                </p>
              </div>

              <div className="text-center">
                <div className="text-5xl mb-3">💎</div>
                <h4 className="font-heading font-bold text-text-primary mb-2">Lower Costs</h4>
                <p className="text-text-secondary text-sm">
                  Automated processes mean lower premiums and better coverage for you.
                </p>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Who Is Tonsurance For?
            </h2>

            <p className="text-text-primary mb-6">
              Tonsurance is perfect for anyone who:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                Holds stablecoins and worries about depeg events
              </li>
              <li className="text-text-primary">
                Uses DeFi protocols and wants protection from exploits
              </li>
              <li className="text-text-primary">
                Bridges assets cross-chain and fears bridge hacks
              </li>
              <li className="text-text-primary">
                Wants peace of mind without complex insurance processes
              </li>
            </ul>

            <p className="text-text-primary mb-6">
              Whether you're an individual user with 100 TON or an institution managing millions, Tonsurance scales to your needs.
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Advanced Features
            </h2>

            <p className="text-text-primary mb-6">
              Beyond basic coverage, we've built features for sophisticated users and enterprises:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Multi-Chain Coverage:</strong> Protect assets across TON, Ethereum, BSC, Polygon, and Arbitrum with a single interface
              </li>
              <li className="text-text-primary">
                <strong>Hedged Coverage:</strong> Lower premiums (up to 30% savings) through our swing pricing model with external hedges
              </li>
              <li className="text-text-primary">
                <strong>Enterprise Bulk:</strong> CSV upload for teams, bulk discounts up to 25%, centralized management
              </li>
              <li className="text-text-primary">
                <strong>Gifting:</strong> Purchase coverage for others with beneficiary designations
              </li>
              <li className="text-text-primary">
                <strong>Smart Escrow:</strong> Combine coverage with conditional escrow releases
              </li>
            </ul>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Getting Started
            </h2>

            <p className="text-text-primary mb-6">
              Ready to protect your DeFi assets? Here's how to get started:
            </p>

            <div className="bg-cream-300 rounded-xl p-8 my-8">
              <ol className="space-y-4">
                <li className="text-text-primary">
                  <strong>Chat with me on Telegram:</strong> Search for @TonsuranceBot or click the link below
                </li>
                <li className="text-text-primary">
                  <strong>Tell me what you want to protect:</strong> Asset type, amount, and duration
                </li>
                <li className="text-text-primary">
                  <strong>Get a live quote:</strong> I'll fetch current rates based on market conditions
                </li>
                <li className="text-text-primary">
                  <strong>Deploy your coverage contract:</strong> One-click deployment on TON blockchain
                </li>
                <li className="text-text-primary">
                  <strong>You're protected!</strong> Automated monitoring and instant payouts when needed
                </li>
              </ol>
            </div>

            <div className="bg-copper-500 text-white rounded-2xl p-8 text-center my-12">
              <h3 className="text-3xl font-heading font-bold mb-4">
                Ready to Get Protected?
              </h3>
              <p className="text-xl text-cream-200 mb-6">
                Chat with me to get a personalized quote and deploy your coverage in minutes!
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
              What's Next?
            </h2>

            <p className="text-text-primary mb-6">
              This is just the beginning. We're continuously expanding Tonsurance with:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                More coverage types (liquidation protection, yield protection, etc.)
              </li>
              <li className="text-text-primary">
                Additional blockchain integrations
              </li>
              <li className="text-text-primary">
                Advanced analytics and risk dashboards
              </li>
              <li className="text-text-primary">
                Partner integrations with wallets and exchanges
              </li>
            </ul>

            <p className="text-text-primary mb-6">
              Stay tuned for updates, and feel free to reach out with feature requests!
            </p>

            <div className="border-t border-cream-400 pt-8 mt-12">
              <p className="text-text-secondary text-center mb-4">
                Questions? Want to learn more? Chat with me anytime! 🤖
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
