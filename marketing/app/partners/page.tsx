'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';

export default function Partners() {
  return (
    <Layout>
      <SEO
        title="Partner With Us | Tonsurance Integration"
        description="Integrate Tonsurance parametric coverage into your wallet, exchange, or DeFi platform. Offer your users instant risk protection with automated payouts."
      />

      <Section className="pt-20 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-5xl font-heading font-bold text-text-primary mb-6">
            Partner Integration
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-8">
            Integrate Tonsurance into your wallet, exchange, or DeFi platform.
            Offer your users parametric risk coverage with instant payouts. 🤝
          </p>
        </motion.div>
      </Section>

      {/* Why Integrate */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-center mb-12">
          Why Integrate Tonsurance?
        </h2>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <Card>
            <div className="text-4xl mb-4">💰</div>
            <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
              Revenue Share
            </h3>
            <p className="text-text-secondary">
              Earn commission on every coverage purchase through your platform. Recurring revenue from renewals.
            </p>
          </Card>

          <Card>
            <div className="text-4xl mb-4">🛡️</div>
            <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
              Protect Your Users
            </h3>
            <p className="text-text-secondary">
              Reduce user anxiety about depegs, exploits, and bridge hacks. Build trust with built-in protection.
            </p>
          </Card>

          <Card>
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
              Easy Integration
            </h3>
            <p className="text-text-secondary">
              Simple API, whitelabel options, and dedicated support. Launch in days, not months.
            </p>
          </Card>
        </div>
      </Section>

      {/* Integration Options */}
      <Section>
        <h2 className="text-4xl font-heading font-bold text-center mb-12">
          Integration Options
        </h2>

        <div className="max-w-4xl mx-auto space-y-6">
          <IntegrationOption
            title="Wallet Integration"
            description="Add coverage purchase directly in your wallet interface"
            features={[
              'In-wallet coverage purchase flow',
              'Risk monitoring dashboard',
              'Automatic payout to user wallet',
              'Whitelabel UI with your branding'
            ]}
            ideal="TON wallets, multi-chain wallets, DeFi wallets"
          />

          <IntegrationOption
            title="Exchange Integration"
            description="Offer coverage for assets held on your exchange"
            features={[
              'Bulk coverage for exchange reserves',
              'User opt-in coverage programs',
              'API for programmatic coverage',
              'Real-time coverage analytics'
            ]}
            ideal="CEX, DEX, trading platforms"
          />

          <IntegrationOption
            title="DeFi Protocol Integration"
            description="Protect your protocol and users from risks"
            features={[
              'Smart contract exploit coverage',
              'Oracle failure protection',
              'Bridge security coverage',
              'Embedded coverage in your UI'
            ]}
            ideal="Lending protocols, yield aggregators, bridges"
          />
        </div>
      </Section>

      {/* Tech Stack */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-center mb-12">
          How It Works
        </h2>

        <div className="max-w-4xl mx-auto">
          <Card hover={false}>
            <div className="space-y-6">
              <Step
                number="1"
                title="Submit Integration Request"
                description="Fill out our partnership form with details about your platform and use case."
              />
              <Step
                number="2"
                title="Technical Review"
                description="Our team reviews your requirements and proposes the best integration approach."
              />
              <Step
                number="3"
                title="API Access & Testing"
                description="Get sandbox API access, documentation, and dedicated technical support."
              />
              <Step
                number="4"
                title="Launch & Revenue Share"
                description="Go live with Tonsurance coverage and start earning from day one."
              />
            </div>
          </Card>
        </div>
      </Section>

      {/* CTA */}
      <Section className="text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="bg-copper-500 text-white rounded-2xl p-12 max-w-3xl mx-auto">
            <h2 className="text-4xl font-heading font-bold mb-6">
              Ready to Partner?
            </h2>
            <p className="text-xl mb-8 text-cream-200">
              Join leading wallets and exchanges offering Tonsurance coverage to their users.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="secondary" size="lg" href="mailto:partners@tonsurance.com">
                Contact Partnerships Team
              </Button>
              <Button variant="outline" size="lg" href="https://t.me/TonsuranceBot">
                Chat with Tonny
              </Button>
            </div>
          </div>
        </motion.div>
      </Section>
    </Layout>
  );
}

function IntegrationOption({
  title,
  description,
  features,
  ideal
}: {
  title: string;
  description: string;
  features: string[];
  ideal: string;
}) {
  return (
    <Card>
      <h3 className="text-2xl font-heading font-bold text-text-primary mb-2">{title}</h3>
      <p className="text-text-secondary mb-4">{description}</p>

      <div className="mb-4">
        <h4 className="font-semibold text-text-primary mb-2">Features:</h4>
        <ul className="space-y-2">
          {features.map((feature, idx) => (
            <li key={idx} className="flex items-start text-sm">
              <span className="text-terminal-green mr-2">✓</span>
              <span className="text-text-primary">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-4 border-t border-cream-400">
        <span className="text-sm font-semibold text-copper-500">Ideal for: </span>
        <span className="text-sm text-text-secondary">{ideal}</span>
      </div>
    </Card>
  );
}

function Step({
  number,
  title,
  description
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 bg-copper-500 text-white rounded-full flex items-center justify-center font-heading font-bold">
        {number}
      </div>
      <div>
        <h3 className="font-heading font-bold text-text-primary mb-1">{title}</h3>
        <p className="text-text-secondary text-sm">{description}</p>
      </div>
    </div>
  );
}
