'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { CoverageCard, StatCard } from '@/components/Card';
import { Testimonials } from '@/components/Testimonials';
import { TonnyCharacter } from '@/components/TonnyCharacter';
import { CoverageCalculator } from '@/components/CoverageCalculator';
import { TrustIndicators } from '@/components/TrustIndicators';
import { PayoutTimeline } from '@/components/PayoutTimeline';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';

export default function Home() {
  return (
    <Layout>
      <SEO
        title="Tonsurance | Parametric Risk Coverage on TON Blockchain"
        description="Automated parametric risk coverage on TON blockchain. Multi-chain protection, hedged coverage, bulk purchase, gifting, and escrow. Coverage for stablecoin depegs, smart contract exploits, oracle failures, and bridge incidents. Payouts in 5-10 minutes."
      />
      {/* Hero Section */}
      <Section className="pt-20 pb-12">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-5xl md:text-6xl font-heading font-bold text-text-primary mb-6">
              Parametric Risk Coverage on TON!
            </h1>
            <p className="text-xl text-text-secondary mb-8 leading-relaxed">
              Automated payouts in 5-10 minutes. No claims process needed!
              <br />
              <br />
              Get protection for stablecoin depegs, smart contract exploits, oracle failures, and bridge incidents.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button variant="primary" size="lg" href="https://t.me/TonsuranceBot/tonsurance">
                Launch App →
              </Button>
              <Button variant="outline-dark" size="lg" href="https://t.me/TonsuranceBot">
                Chat with Tonny 💎
              </Button>
            </div>
          </motion.div>

          <motion.div
            className="relative"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <div className="bg-cream-300 rounded-2xl p-12 flex items-center justify-center border-4 border-copper-500 shadow-2xl">
              <div className="text-center">
                <div className="mb-4">
                  <TonnyCharacter size="2xl" animate={true} />
                </div>
                <p className="text-2xl font-heading font-bold text-text-primary">
                  Hey! I&apos;m Tonny
                </p>
                <p className="text-text-secondary mt-2">Your coverage companion</p>
              </div>
            </div>
          </motion.div>
        </div>
      </Section>

      {/* TODO: Uncomment when we have real stats to display */}
      {/* Stats Section */}
      {/* <Section className="bg-cream-300 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <StatCard value="$2.5M+" label="Total Coverage" icon="💎" />
          <StatCard value="147" label="Active Contracts" icon="📋" />
          <StatCard value="6 min" label="Avg Payout Time" icon="⚡" />
          <StatCard value="99.8%" label="Uptime" icon="✅" />
        </div>
      </Section> */}

      {/* How It Works Section */}
      <Section>
        <div className="text-center mb-12">
          <h2 className="text-4xl font-heading font-bold text-text-primary mb-4">
            How It Works
          </h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            Get protection in three simple steps. Tonny is here to help!
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <div className="text-6xl mb-4">1️⃣</div>
            <h3 className="text-2xl font-heading font-bold text-text-primary mb-3">
              Choose Your Coverage
            </h3>
            <p className="text-text-secondary">
              Select the risk type and coverage amount. I&apos;ll fetch live rates for you!
            </p>
          </motion.div>

          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="text-6xl mb-4">2️⃣</div>
            <h3 className="text-2xl font-heading font-bold text-text-primary mb-3">
              Smart Contract Deploys
            </h3>
            <p className="text-text-secondary">
              Your coverage contract is deployed automatically on TON blockchain.
            </p>
          </motion.div>

          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-6xl mb-4">3️⃣</div>
            <h3 className="text-2xl font-heading font-bold text-text-primary mb-3">
              Instant Payouts ⚡
            </h3>
            <p className="text-text-secondary">
              When conditions are met, payouts trigger automatically. No claims needed!
            </p>
          </motion.div>
        </div>
      </Section>

      {/* Coverage Types Section */}
      <Section className="bg-cream-300">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-heading font-bold text-text-primary mb-4">
            Coverage Types
          </h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            We provide automated risk protection for the most critical DeFi scenarios.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <CoverageCard
            icon="💵"
            title="Stablecoin Depeg"
            description="Protection against stablecoin price deviations from their peg."
            features={[
              'Real-time price monitoring',
              'Automated trigger at threshold',
              'Payout in 5-10 minutes',
            ]}
          />

          <CoverageCard
            icon="⚠️"
            title="Smart Contract Exploits"
            description="Coverage for security incidents and contract vulnerabilities."
            features={[
              'Continuous security monitoring',
              'Incident verification system',
              'Fast claim resolution',
            ]}
          />

          <CoverageCard
            icon="🔮"
            title="Oracle Failures"
            description="Protection when price feed oracles fail or provide incorrect data."
            features={[
              'Multi-oracle monitoring',
              'Deviation detection',
              'Automated compensation',
            ]}
          />

          <CoverageCard
            icon="🌉"
            title="Bridge Security"
            description="Coverage for cross-chain bridge incidents and fund losses."
            features={[
              'Bridge health monitoring',
              'Incident detection',
              'Rapid payout execution',
            ]}
          />
        </div>
      </Section>

      {/* Advanced Features Section */}
      <Section>
        <div className="text-center mb-12">
          <h2 className="text-4xl font-heading font-bold text-text-primary mb-4">
            Advanced Features
          </h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            Enterprise-grade capabilities for comprehensive risk protection.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <CoverageCard
            icon="🌐"
            title="Multi-Chain Coverage"
            description="Protect assets across TON, Ethereum, BSC, Polygon, and Arbitrum."
            features={[
              'Unified cross-chain interface',
              'Gift coverage to any chain',
              'Bridge health monitoring',
            ]}
          />

          <CoverageCard
            icon="📈"
            title="Hedged Coverage"
            description="Lower premiums through external risk hedging."
            features={[
              'Up to 30% savings',
              'Transparent hedge breakdown',
              'External market hedges',
            ]}
          />

          <CoverageCard
            icon="🏢"
            title="Enterprise Bulk"
            description="Protect your entire organization with bulk discounts."
            features={[
              'CSV upload for teams',
              'Up to 25% bulk discount',
              'Centralized management',
            ]}
          />
        </div>
      </Section>

      {/* Why Parametric Section */}
      <Section>
        <div className="bg-copper-500 text-cream-200 rounded-2xl p-12 text-center">
          <h2 className="text-4xl font-heading font-bold mb-6">
            Why Parametric Coverage?
          </h2>
          <div className="grid md:grid-cols-3 gap-8 mt-8">
            <div>
              <div className="text-5xl mb-3">⚡</div>
              <h3 className="text-xl font-heading font-bold mb-2">Lightning Fast</h3>
              <p className="text-cream-300 leading-relaxed">
                Payouts in minutes, not weeks.
                <br />
                Triggers fire automatically when conditions are met.
              </p>
            </div>
            <div>
              <div className="text-5xl mb-3">🔒</div>
              <h3 className="text-xl font-heading font-bold mb-2">Fully Transparent</h3>
              <p className="text-cream-300 leading-relaxed">
                All logic on-chain.
                <br />
                No subjective claims process or disputes.
              </p>
            </div>
            <div>
              <div className="text-5xl mb-3">💎</div>
              <h3 className="text-xl font-heading font-bold mb-2">Lower Costs</h3>
              <p className="text-cream-300 leading-relaxed">
                Automated processes mean lower premiums and better coverage for you.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* Payout Timeline Section */}
      <Section className="bg-cream-300">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-heading font-bold text-text-primary mb-4">
            How Payouts Work
          </h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            See exactly how our automated payout process works from trigger to payment.
          </p>
        </div>
        <PayoutTimeline />
      </Section>

      {/* Coverage Calculator Section */}
      <Section>
        <div className="text-center mb-12">
          <h2 className="text-4xl font-heading font-bold text-text-primary mb-4">
            Calculate Your Coverage
          </h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            Get an instant quote and see how affordable parametric coverage can be.
          </p>
        </div>
        <CoverageCalculator />
      </Section>

      {/* TODO: Uncomment when we have ecosystem partnership, security audits, and real testimonials */}
      {/* Trust Indicators Section */}
      {/* <Section className="bg-cream-300">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-heading font-bold text-text-primary mb-4">
            Security & Trust
          </h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            Enterprise-grade security and transparency you can verify.
          </p>
        </div>
        <TrustIndicators />
      </Section> */}

      {/* TODO: Uncomment when we have real user testimonials */}
      {/* Testimonials Section */}
      {/* <Section>
        <div className="text-center mb-12">
          <h2 className="text-4xl font-heading font-bold text-text-primary mb-4">
            Trusted by DeFi Users Worldwide
          </h2>
          <p className="text-xl text-text-secondary max-w-2xl mx-auto">
            Real stories from real users who've experienced the speed and reliability of parametric coverage.
          </p>
        </div>
        <Testimonials />
      </Section> */}

      {/* CTA Section */}
      <Section className="text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-4xl font-heading font-bold text-text-primary mb-4">
            Ready to get protected?
          </h2>
          <p className="text-xl text-text-secondary mb-8 max-w-2xl mx-auto leading-relaxed">
            Chat with Tonny on Telegram to get a live quote and deploy your coverage contract in minutes!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="primary" size="lg" href="https://t.me/TonsuranceBot/tonsurance">
              Launch App →
            </Button>
            <Button variant="secondary" size="lg" href="/how-it-works">
              Learn More
            </Button>
          </div>
        </motion.div>
      </Section>
    </Layout>
  );
}
