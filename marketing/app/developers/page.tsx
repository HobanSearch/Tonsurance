'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';

export default function Developers() {
  return (
    <Layout>
      <SEO
        title="Developer Docs | Tonsurance API & Smart Contracts"
        description="Build on Tonsurance with our TON blockchain smart contracts and APIs. Open-source, audited code for parametric coverage integration."
      />
      <Section className="pt-20 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-5xl font-heading font-bold text-text-primary mb-6">
            Developer Documentation
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-8">
            Build on Tonsurance with our smart contracts and APIs. All code is open-source and audited.
          </p>
        </motion.div>
      </Section>

      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-center mb-12">Quick Start</h2>
        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <QuickStartCard
            title="Smart Contracts"
            description="TON blockchain contracts for parametric coverage"
            link="https://github.com/tonsurance/contracts"
          />
          <QuickStartCard
            title="Telegram Bot API"
            description="Integrate Tonny into your application"
            link="https://t.me/TonsuranceBot"
          />
          <QuickStartCard
            title="JavaScript SDK"
            description="Client library for coverage integration"
            link="https://github.com/tonsurance/sdk"
          />
        </div>
      </Section>

      <Section>
        <h2 className="text-4xl font-heading font-bold text-center mb-12">Smart Contract Addresses</h2>
        <Card className="max-w-3xl mx-auto" hover={false}>
          <div className="space-y-4 font-mono text-sm">
            <AddressRow label="Policy Factory" address="EQC..." />
            <AddressRow label="Oracle Manager" address="EQD..." />
            <AddressRow label="Premium Pool" address="EQE..." />
            <AddressRow label="Payout Controller" address="EQF..." />
          </div>
          <p className="text-xs text-text-secondary mt-6">
            All contracts are verified on TONScan. View source code on GitHub.
          </p>
        </Card>
      </Section>

      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-center mb-12">Integration Examples</h2>
        <div className="max-w-4xl mx-auto space-y-6">
          <CodeExample
            title="Get Live Quote"
            code={`// Connect to Tonny API
const quote = await tonsurance.getQuote({
  riskType: 'stablecoin_depeg',
  coverageAmount: 10000,
  duration: 30
});

console.log(quote.premium); // Premium in TON`}
          />
          <CodeExample
            title="Deploy Coverage Contract"
            code={`// Deploy parametric coverage
const coverage = await tonsurance.deployCoverage({
  riskType: 'stablecoin_depeg',
  coverageAmount: 10000,
  duration: 30,
  threshold: 0.5 // 0.5% depeg
});

console.log(coverage.address);`}
          />
        </div>
      </Section>

      <Section className="text-center">
        <h2 className="text-4xl font-heading font-bold mb-6">Questions?</h2>
        <p className="text-xl text-text-secondary mb-8">
          Join our developer community on Telegram or check our docs.
        </p>
        <div className="flex gap-4 justify-center">
          <Button variant="primary" href="https://t.me/TonsuranceDev">
            Join Dev Community
          </Button>
          <Button variant="outline" href="https://github.com/tonsurance">
            View on GitHub
          </Button>
        </div>
      </Section>
    </Layout>
  );
}

function QuickStartCard({ title, description, link }: { title: string; description: string; link: string }) {
  return (
    <Card>
      <h3 className="text-xl font-heading font-bold text-text-primary mb-2">{title}</h3>
      <p className="text-text-secondary mb-4 text-sm">{description}</p>
      <a href={link} className="text-copper-500 hover:text-copper-600 text-sm font-medium">
        Learn more →
      </a>
    </Card>
  );
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex justify-between items-center py-3 border-b border-cream-400 last:border-0">
      <span className="text-text-secondary">{label}:</span>
      <span className="text-copper-500">{address}</span>
    </div>
  );
}

function CodeExample({ title, code }: { title: string; code: string }) {
  return (
    <Card hover={false}>
      <h3 className="text-lg font-heading font-bold text-text-primary mb-3">{title}</h3>
      <pre className="bg-text-primary text-cream-200 p-4 rounded-lg overflow-x-auto text-sm">
        <code>{code}</code>
      </pre>
    </Card>
  );
}
