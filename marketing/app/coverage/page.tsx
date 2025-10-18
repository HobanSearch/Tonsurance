'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { Card, CoverageCard } from '@/components/Card';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';

export default function Coverage() {
  return (
    <Layout>
      <SEO
        title="Coverage Options | Tonsurance - DeFi Risk Protection"
        description="Explore Tonsurance parametric coverage: Stablecoin depeg, smart contract exploits, oracle failures, bridge security, multi-chain, hedged coverage, bulk purchase, gifting, and escrow. Automated payouts in 5-10 minutes."
      />
      {/* Hero */}
      <Section className="pt-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl md:text-6xl font-heading font-bold text-text-primary mb-6">
            Coverage Options
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-8 leading-relaxed">
            Protect your DeFi assets with automated parametric coverage.
            <br />
            Choose the risk type that matters to you.
          </p>
          <Button variant="primary" size="lg" href="https://t.me/TonsuranceBot">
            Get a Quote from Tonny 💎
          </Button>
        </motion.div>
      </Section>

      {/* Coverage Types */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Available Coverage Types
        </h2>

        <div className="grid md:grid-cols-2 gap-8">
          <CoverageCard
            icon="💵"
            title="Stablecoin Depeg"
            description="Protection against stablecoin price deviations from their $1.00 peg."
            features={[
              'Real-time price monitoring every minute',
              'Customizable depeg threshold (0.2% - 5%)',
              'Automated payout when threshold exceeded',
              'Covers USDT, USDC, DAI, and more',
            ]}
          />

          <CoverageCard
            icon="⚠️"
            title="Smart Contract Exploits"
            description="Coverage for security incidents and contract vulnerabilities."
            features={[
              'Continuous security monitoring',
              'Covers major DeFi protocols',
              'Verified incident detection',
              'Rapid payout after verification',
            ]}
          />

          <CoverageCard
            icon="🔮"
            title="Oracle Failures"
            description="Protection when price feed oracles fail or provide incorrect data."
            features={[
              'Multi-oracle monitoring system',
              'Deviation and failure detection',
              'Covers Chainlink, Pyth, Band',
              'Automated compensation triggers',
            ]}
          />

          <CoverageCard
            icon="🌉"
            title="Bridge Security"
            description="Coverage for cross-chain bridge incidents and fund losses."
            features={[
              '24/7 bridge health monitoring',
              'Covers TON, ETH, BSC bridges',
              'Incident verification system',
              'Fast payout on confirmed exploits',
            ]}
          />
        </div>
      </Section>

      {/* Advanced Features */}
      <Section>
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Advanced Features
        </h2>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <CoverageCard
            icon="🌐"
            title="Multi-Chain Coverage"
            description="Protect your assets across multiple blockchains with unified coverage."
            features={[
              'Coverage across TON, Ethereum, BSC, Polygon, Arbitrum',
              'Single interface for all chains',
              'Bridge health monitoring included',
              'Gift coverage to any address on any chain',
            ]}
          />

          <CoverageCard
            icon="📈"
            title="Hedged Coverage"
            description="Advanced swing pricing model with external hedge allocations."
            features={[
              'Lower premiums through risk hedging',
              'Transparent hedge cost breakdown',
              'External hedges via Polymarket, Perpetuals, Allianz',
              'Up to 30% savings vs traditional coverage',
            ]}
          />

          <CoverageCard
            icon="🏢"
            title="Enterprise Bulk Purchase"
            description="Protect your entire team or organization with bulk discounts."
            features={[
              'CSV upload for employee/user lists',
              'Bulk discounts up to 25%',
              'Centralized coverage management',
              'Custom coverage parameters per user',
            ]}
          />

          <CoverageCard
            icon="🎁"
            title="Gifting & Beneficiaries"
            description="Purchase coverage for others or designate beneficiaries."
            features={[
              'Gift coverage to any wallet address',
              'Add personal gift messages',
              'Beneficiary designation for payouts',
              'Perfect for protecting loved ones',
            ]}
          />

          <CoverageCard
            icon="🔒"
            title="Smart Escrow Integration"
            description="Combine coverage with smart escrow for conditional payouts."
            features={[
              'Multi-condition release triggers',
              'Oracle-based verification',
              'Time-locked or multisig releases',
              'Integrated coverage protection',
            ]}
          />
        </div>
      </Section>

      {/* Coverage Parameters */}
      <Section>
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Coverage Parameters
        </h2>

        <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-6">
          <ParameterCard
            title="Coverage Amount"
            description="Minimum: 100 TON | Maximum: 1,000,000 TON"
            icon="💰"
          />

          <ParameterCard
            title="Duration"
            description="Minimum: 7 days | Maximum: 365 days"
            icon="⏰"
          />

          <ParameterCard
            title="Base Premium"
            description="Starting at 0.5% of coverage amount (varies by risk)"
            icon="📊"
          />
        </div>

        <div className="mt-12 max-w-3xl mx-auto">
          <Card variant="highlight" hover={false}>
            <div className="text-center">
              <h3 className="text-2xl font-heading font-bold mb-4">
                Want an Exact Quote?
              </h3>
              <p className="text-cream-300 mb-6 leading-relaxed">
                Chat with Tonny on Telegram!
                <br />
                <br />
                He&apos;ll fetch live rates based on current market conditions and help you find the perfect coverage for your needs.
              </p>
              <Button variant="secondary" size="lg" href="https://t.me/TonsuranceBot">
                Chat with Tonny →
              </Button>
            </div>
          </Card>
        </div>
      </Section>

      {/* How Pricing Works */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          How Pricing Works
        </h2>

        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8">
            <PricingFactor
              title="Risk Type"
              description="Different risks have different base premiums. Stablecoin depeg coverage typically has lower premiums than smart contract exploit coverage."
              impact="Base premium: 0.3% - 2.0%"
            />

            <PricingFactor
              title="Coverage Amount"
              description="Larger coverage amounts may have slightly higher premium rates due to increased risk exposure."
              impact="Scaling factor: 1.0x - 1.3x"
            />

            <PricingFactor
              title="Duration"
              description="Longer coverage periods mean more exposure to risk events, so premiums scale with duration."
              impact="Per-day rate applied"
            />

            <PricingFactor
              title="Market Conditions"
              description="Current volatility and recent incidents affect pricing. Premiums adjust in real-time based on market data."
              impact="Volatility multiplier"
            />
          </div>

          <div className="mt-8 bg-copper-500 text-cream-200 rounded-xl p-6">
            <h3 className="text-xl font-heading font-bold mb-3">Example Calculation</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Coverage Amount:</span>
                <span className="font-mono">10,000 USDT</span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="font-mono">30 days</span>
              </div>
              <div className="flex justify-between">
                <span>Risk Type:</span>
                <span className="font-mono">Stablecoin Depeg</span>
              </div>
              <div className="flex justify-between">
                <span>Base Premium (0.5%):</span>
                <span className="font-mono">50 USDT</span>
              </div>
              <div className="border-t border-cream-300 pt-2 mt-2 flex justify-between font-bold">
                <span>Total Premium:</span>
                <span className="font-mono">~50-75 USDT</span>
              </div>
            </div>
            <p className="text-xs text-cream-300 mt-4">
              *Actual premium varies based on current market conditions. Chat with Tonny for exact quote!
            </p>
          </div>
        </div>
      </Section>

      {/* Coverage Limits */}
      <Section>
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Important Information
        </h2>

        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
          <InfoCard
            title="Coverage Limits"
            items={[
              'Maximum 1M TON per contract',
              'No limit on number of contracts',
              'Coverage pool capacity monitored',
              'Some protocols may have individual limits',
            ]}
          />

          <InfoCard
            title="Exclusions"
            items={[
              'Pre-existing depeg conditions',
              'Coverage bought after incident occurs',
              'Intentional self-inflicted losses',
              'Force majeure blockchain halts',
            ]}
          />

          <InfoCard
            title="Premium Payment"
            items={[
              'Accept TON, USDT, or USDC',
              'Paid upfront at purchase',
              'Partial refunds for unused time',
              'All gas fees covered by Tonsurance',
            ]}
          />

          <InfoCard
            title="Payout Process"
            items={[
              'Automatic trigger verification',
              'Multi-oracle consensus required',
              '5-10 minute payout execution',
              'Direct to your TON wallet',
            ]}
          />
        </div>
      </Section>

      {/* CTA */}
      <Section className="bg-copper-500 text-cream-200 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
        >
          <h2 className="text-4xl font-heading font-bold mb-6">
            Ready to Protect Your Assets?
          </h2>
          <p className="text-xl text-cream-300 mb-8 max-w-2xl mx-auto leading-relaxed">
            Get a personalized quote from Tonny in seconds.
            <br />
            Deploy your coverage contract in minutes!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="secondary" size="lg" href="https://t.me/TonsuranceBot/tonsurance">
              Launch App →
            </Button>
            <Button variant="outline" size="lg" href="/how-it-works">
              Learn How It Works
            </Button>
          </div>
        </motion.div>
      </Section>
    </Layout>
  );
}

function ParameterCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <Card hover={false}>
      <div className="text-center">
        <div className="text-4xl mb-3">{icon}</div>
        <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
          {title}
        </h3>
        <p className="text-text-secondary whitespace-pre-line text-sm">
          {description}
        </p>
      </div>
    </Card>
  );
}

function PricingFactor({
  title,
  description,
  impact,
}: {
  title: string;
  description: string;
  impact: string;
}) {
  return (
    <Card>
      <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
        {title}
      </h3>
      <p className="text-text-secondary mb-4">{description}</p>
      <div className="bg-cream-200 rounded-lg px-3 py-2">
        <span className="text-xs font-medium text-text-secondary">Impact: </span>
        <span className="text-sm font-mono text-copper-500">{impact}</span>
      </div>
    </Card>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card hover={false}>
      <h3 className="text-xl font-heading font-bold text-text-primary mb-4">
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="flex items-start text-sm">
            <span className="text-copper-500 mr-2">•</span>
            <span className="text-text-primary">{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
