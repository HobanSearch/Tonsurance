'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';
import { FAQSection } from '@/components/FAQ';

export default function HowItWorks() {
  return (
    <Layout>
      <SEO
        title="How It Works | Tonsurance - Parametric Coverage Process"
        description="Learn how Tonsurance parametric coverage works. Get protected in 3 steps with automated payouts in 5-10 minutes. No claims process, fully transparent on-chain."
      />
      {/* Hero */}
      <Section className="pt-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl md:text-6xl font-heading font-bold text-text-primary mb-6">
            How Tonsurance Works
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-8 leading-relaxed">
            Parametric coverage makes risk protection simple, transparent, and lightning-fast. No claims process, no waiting weeks for payouts.
            <br />
            Just automated smart contracts on TON blockchain.
          </p>
        </motion.div>
      </Section>

      {/* 3-Step Process */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Get Protected in 3 Steps
        </h2>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <ProcessStep
            number="1"
            title="Choose Coverage"
            description="Select your risk type and coverage amount. Chat with Tonny on Telegram to get a live quote."
            icon="💬"
            details={[
              'Stablecoin depeg protection',
              'Smart contract exploit coverage',
              'Oracle failure protection',
              'Bridge security coverage',
            ]}
          />

          <ProcessStep
            number="2"
            title="Deploy Contract"
            description="Your smart contract deploys automatically to TON blockchain. All parameters are set in the contract code."
            icon="⚙️"
            details={[
              'Coverage amount locked in contract',
              'Trigger conditions defined',
              'Duration set (7-365 days)',
              'Premium paid upfront',
            ]}
          />

          <ProcessStep
            number="3"
            title="Automatic Payout"
            description="When trigger conditions are met, payout executes automatically. No claims forms, no waiting!"
            icon="⚡"
            details={[
              'Oracles monitor conditions 24/7',
              'Trigger fires when threshold met',
              'Payout in 5-10 minutes',
              'Funds sent to your wallet',
            ]}
          />
        </div>
      </Section>

      {/* Parametric vs Traditional */}
      <Section>
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Parametric vs Traditional Coverage
        </h2>

        <div className="max-w-4xl mx-auto">
          <div className="grid md:grid-cols-2 gap-6">
            <ComparisonCard
              title="Traditional Insurance"
              icon="❌"
              items={[
                { label: 'Claims Process', value: 'Required (weeks/months)' },
                { label: 'Payout Time', value: '2-12 weeks' },
                { label: 'Transparency', value: 'Subjective assessment' },
                { label: 'Costs', value: 'High (manual overhead)' },
                { label: 'Disputes', value: 'Common' },
              ]}
              variant="default"
            />

            <ComparisonCard
              title="Tonsurance Parametric"
              icon="✅"
              items={[
                { label: 'Claims Process', value: 'None - automatic' },
                { label: 'Payout Time', value: '5-10 minutes' },
                { label: 'Transparency', value: 'On-chain, objective' },
                { label: 'Costs', value: 'Lower (automated)' },
                { label: 'Disputes', value: 'Impossible' },
              ]}
              variant="highlight"
            />
          </div>
        </div>
      </Section>

      {/* How Triggers Work */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          How Triggers Work
        </h2>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          <TriggerExample
            title="Stablecoin Depeg Example"
            icon="💵"
            scenario="You buy coverage for USDT at 0.5% depeg threshold"
            steps={[
              '1. Oracle monitors USDT price every minute',
              '2. USDT drops to $0.994 (0.6% depeg)',
              '3. Trigger condition met automatically',
              '4. Smart contract executes payout',
              '5. Funds arrive in your wallet (5-10 min)',
            ]}
          />

          <TriggerExample
            title="Bridge Security Example"
            icon="🌉"
            scenario="You protect $10,000 in a TON-ETH bridge"
            steps={[
              '1. Monitor watches bridge health',
              '2. Bridge exploit detected',
              '3. Security incident verified by oracles',
              '4. Trigger fires automatically',
              '5. Your $10,000 coverage paid out',
            ]}
          />
        </div>
      </Section>

      {/* FAQ Section */}
      <Section>
        <FAQSection
          faqs={[
            {
              question: "What happens if the trigger condition is never met?",
              answer: "Your premium is not refunded - this is how coverage works. Think of it like car insurance: you pay the premium whether or not you have an accident. The premium covers the risk during your coverage period."
            },
            {
              question: "How do I know the oracles are accurate?",
              answer: "We use multiple independent oracles with cross-verification. If oracles disagree, no trigger fires (protecting against false positives). All oracle data is publicly verifiable on-chain."
            },
            {
              question: "Can I cancel my coverage early?",
              answer: "Currently, coverage contracts run for their full duration and cannot be cancelled early. This keeps pricing fair for all participants. Choose your duration carefully!"
            },
            {
              question: "What if there's a dispute about whether the trigger fired?",
              answer: "There can't be disputes! The smart contract code defines exact trigger conditions. Either the condition was met (payout happens) or it wasn't (no payout). Everything is objective and on-chain."
            },
            {
              question: "How are premiums calculated?",
              answer: "Premiums are based on: coverage amount, duration, risk type, and current market conditions. Tonny can fetch live rates for you! Chat with him on Telegram to get a quote. 💎"
            }
          ]}
        />
      </Section>

      {/* CTA */}
      <Section className="bg-copper-500 text-cream-200 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
        >
          <h2 className="text-4xl font-heading font-bold mb-6">
            Ready to Get Protected?
          </h2>
          <p className="text-xl text-cream-300 mb-8 max-w-2xl mx-auto leading-relaxed">
            Chat with Tonny on Telegram to get a live quote and deploy your coverage contract in minutes!
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="secondary" size="lg" href="https://t.me/TonsuranceBot/tonsurance">
              Launch App →
            </Button>
            <Button variant="outline" size="lg" href="/coverage">
              View Coverage Options
            </Button>
          </div>
        </motion.div>
      </Section>
    </Layout>
  );
}

function ProcessStep({
  number,
  title,
  description,
  icon,
  details,
}: {
  number: string;
  title: string;
  description: string;
  icon: string;
  details: string[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -100px 0px" }}
      transition={{ duration: 0.5 }}
    >
      <Card className="h-full">
        <div className="text-center mb-4">
          <div className="text-6xl mb-2">{icon}</div>
          <div className="text-4xl font-heading font-bold text-copper-500 mb-2">
            {number}
          </div>
          <h3 className="text-2xl font-heading font-bold text-text-primary mb-3">
            {title}
          </h3>
        </div>
        <p className="text-text-secondary mb-4">{description}</p>
        <ul className="space-y-2">
          {details.map((detail, idx) => (
            <li key={idx} className="flex items-start text-sm">
              <span className="text-terminal-green mr-2">•</span>
              <span className="text-text-primary">{detail}</span>
            </li>
          ))}
        </ul>
      </Card>
    </motion.div>
  );
}

function ComparisonCard({
  title,
  icon,
  items,
  variant,
}: {
  title: string;
  icon: string;
  items: { label: string; value: string }[];
  variant: 'default' | 'highlight';
}) {
  return (
    <Card variant={variant} hover={false}>
      <div className="text-center mb-6">
        <div className="text-4xl mb-2">{icon}</div>
        <h3 className="text-2xl font-heading font-bold">
          {title}
        </h3>
      </div>
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="border-t border-cream-400 pt-3 first:border-t-0 first:pt-0">
            <div className="text-sm font-medium mb-1 opacity-80">{item.label}</div>
            <div className="font-heading font-semibold">{item.value}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TriggerExample({
  title,
  icon,
  scenario,
  steps,
}: {
  title: string;
  icon: string;
  scenario: string;
  steps: string[];
}) {
  return (
    <Card>
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
        {title}
      </h3>
      <p className="text-text-secondary mb-4 italic">&quot;{scenario}&quot;</p>
      <div className="space-y-2">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-start text-sm">
            <span className="text-copper-500 font-bold mr-2 min-w-[20px]">
              {step.charAt(0)}
            </span>
            <span className="text-text-primary">{step.substring(3)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

