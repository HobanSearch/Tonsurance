'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TonnyCharacter } from '@/components/TonnyCharacter';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';

export default function About() {
  return (
    <Layout>
      <SEO
        title="About Tonsurance | Our Mission & Team"
        description="Learn about Tonsurance's mission to bring automated, transparent parametric risk coverage to DeFi on TON blockchain. Meet Tonny, your coverage companion."
      />
      <Section className="pt-20 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-5xl font-heading font-bold text-text-primary mb-6">
            About Tonsurance
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto">
            Making parametric risk coverage accessible to everyone in the DeFi ecosystem.
          </p>
        </motion.div>
      </Section>

      <Section className="bg-cream-300">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-4xl font-heading font-bold text-center mb-8">Our Mission</h2>
          <Card hover={false} className="text-center">
            <p className="text-lg text-text-primary leading-relaxed">
              Traditional risk coverage is slow, expensive, and opaque. We believe DeFi deserves better.
              Tonsurance brings automated, transparent, and lightning-fast parametric coverage to the TON
              blockchain, protecting your assets with smart contracts instead of paperwork.
            </p>
          </Card>
        </div>
      </Section>

      <Section>
        <h2 className="text-4xl font-heading font-bold text-center mb-12">Why Parametric?</h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <ValueCard
            icon="⚡"
            title="Lightning Fast"
            description="Payouts in 5-10 minutes instead of weeks. No claims forms, no waiting."
          />
          <ValueCard
            icon="🔒"
            title="Fully Transparent"
            description="All logic on-chain. No subjective assessments or hidden terms."
          />
          <ValueCard
            icon="💎"
            title="Lower Costs"
            description="Automation means lower premiums and better coverage for you."
          />
        </div>
      </Section>

      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-center mb-12">Meet Tonny</h2>
        <div className="max-w-3xl mx-auto">
          <div className="bg-cream-200 rounded-2xl p-12 text-center border-4 border-copper-500">
            <div className="mb-4 flex justify-center">
              <TonnyCharacter size="2xl" animate={true} />
            </div>
            <h3 className="text-3xl font-heading font-bold text-text-primary mb-4">
              Your Coverage Companion
            </h3>
            <p className="text-lg text-text-secondary mb-6">
              Tonny is our friendly Telegram bot who helps you find the perfect coverage. He fetches
              live rates, explains parameters, and guides you through the whole process. Chat with him
              anytime!
            </p>
            <Button variant="primary" size="lg" href="https://t.me/TonsuranceBot">
              Chat with Tonny →
            </Button>
          </div>
        </div>
      </Section>

      <Section>
        <h2 className="text-4xl font-heading font-bold text-center mb-12">Security & Audits</h2>
        <div className="max-w-4xl mx-auto">
          <Card hover={false}>
            <div className="space-y-4">
              <SecurityItem
                title="Smart Contract Audits"
                description="All contracts audited by leading blockchain security firms"
                status="Completed"
              />
              <SecurityItem
                title="Multi-Oracle Verification"
                description="Cross-verification prevents false triggers and ensures accuracy"
                status="Active"
              />
              <SecurityItem
                title="Open Source"
                description="All code publicly available on GitHub for community review"
                status="Public"
              />
              <SecurityItem
                title="Bug Bounty Program"
                description="Up to 100,000 TON for critical vulnerability disclosures"
                status="Active"
              />
            </div>
          </Card>
        </div>
      </Section>

      <Section className="bg-copper-500 text-cream-200 text-center">
        <h2 className="text-4xl font-heading font-bold mb-6">Join Our Community</h2>
        <p className="text-xl text-cream-300 mb-8 max-w-2xl mx-auto">
          Connect with the Tonsurance community on Telegram and Twitter.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button variant="secondary" href="https://t.me/TonsuranceCommunity">
            Telegram Community
          </Button>
          <Button variant="outline" href="https://twitter.com/tonsurance">
            Follow on Twitter
          </Button>
        </div>
      </Section>
    </Layout>
  );
}

function ValueCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <Card>
      <div className="text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <h3 className="text-xl font-heading font-bold text-text-primary mb-3">{title}</h3>
        <p className="text-text-secondary">{description}</p>
      </div>
    </Card>
  );
}

function SecurityItem({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div className="flex justify-between items-start py-4 border-b border-cream-400 last:border-0">
      <div className="flex-1">
        <h4 className="font-heading font-bold text-text-primary mb-1">{title}</h4>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
      <span className="ml-4 px-3 py-1 bg-terminal-green text-cream-200 rounded-full text-xs font-medium">
        {status}
      </span>
    </div>
  );
}
