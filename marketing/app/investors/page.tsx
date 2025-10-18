'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';

export default function Investors() {
  return (
    <Layout>
      <SEO
        title="Investors | Tonsurance LP Vault Tranches"
        description="Earn yield by providing liquidity to Tonsurance risk vaults. 6-tier waterfall structure with APYs from 4% to 20%. Choose your risk-reward profile."
      />
      {/* Hero */}
      <Section className="pt-20 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-5xl md:text-6xl font-heading font-bold text-text-primary mb-6">
            LP Vault Tranches
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-8 leading-relaxed">
            Earn yield by providing liquidity to risk vaults.
            <br />
            6-tier waterfall structure with risk-adjusted returns from 4% to 20% APY.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="primary" size="lg" href="https://t.me/TonsuranceBot/tonsurance">
              Launch App →
            </Button>
            <Button variant="outline-dark" size="lg" href="#tranches">
              Explore Tranches
            </Button>
          </div>
        </motion.div>
      </Section>

      {/* How It Works */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          How LP Vaults Work
        </h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <ProcessStep
            number="1"
            title="Deposit Capital"
            description="Choose your tranche and deposit stablecoins, TON, or wBTC"
            icon="💰"
          />
          <ProcessStep
            number="2"
            title="Earn Premiums"
            description="Your capital backs risk contracts and earns premium revenue"
            icon="📈"
          />
          <ProcessStep
            number="3"
            title="Receive Yield"
            description="Automatic daily distributions with no lock-up period"
            icon="💎"
          />
        </div>
      </Section>

      {/* 6-Tier Waterfall Structure */}
      <Section id="tranches">
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          6-Tier Waterfall Structure
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <TrancheCard
            icon="🟦"
            name="SURE-BTC"
            apyRange="4%"
            curve="FLAT"
            risk="Safest"
            allocation="25%"
            lossRange="75-100%"
            description="Ultra-Senior tranche. Bitcoin-focused capital with constant 4% APY. Last to absorb losses, providing maximum safety for institutions and treasuries."
            features={[
              'Flat 4% APY (no variation)',
              'Priority in waterfall',
              'Absorbs 75-100% of claims',
              'Lock-up period required'
            ]}
            target="Institutions, Treasuries"
          />
          <TrancheCard
            icon="🟩"
            name="SURE-SNR"
            apyRange="6.5% → 10%"
            curve="LOGARITHMIC"
            risk="Very Low"
            allocation="20%"
            lossRange="55-75%"
            description="Senior tranche with logarithmic curve. Conservative DeFi investors benefit from stable, predictable returns with minimal volatility."
            features={[
              'Logarithmic APY growth',
              'Fifth in loss absorption',
              'Absorbs 55-75% of claims',
              'Lock-up period required'
            ]}
            target="Conservative DeFi Users"
          />
          <TrancheCard
            icon="🟨"
            name="SURE-MEZZ"
            apyRange="9% → 15%"
            curve="LINEAR"
            risk="Low"
            allocation="18%"
            lossRange="37-55%"
            description="Mezzanine tranche with linear curve. Balanced risk-reward profile perfect for DeFi investors seeking moderate returns."
            features={[
              'Linear APY progression',
              'Fourth in loss absorption',
              'Absorbs 37-55% of claims',
              'Lock-up period required'
            ]}
            target="Balanced DeFi Investors"
          />
          <TrancheCard
            icon="🟧"
            name="SURE-JNR"
            apyRange="12.5% → 16%"
            curve="SIGMOIDAL"
            risk="Medium"
            allocation="15%"
            lossRange="22-37%"
            description="Junior tranche with sigmoidal curve. Designed for crypto natives and active traders comfortable with moderate risk."
            features={[
              'Sigmoidal APY curve',
              'Third in loss absorption',
              'Absorbs 22-37% of claims',
              'No lock-up period'
            ]}
            target="Crypto Natives, Active Traders"
          />
          <TrancheCard
            icon="🟥"
            name="SURE-JNR+"
            apyRange="16% → 22%"
            curve="QUADRATIC"
            risk="High"
            allocation="12%"
            lossRange="10-22%"
            description="Junior Plus tranche with quadratic curve. Aggressive yields for high-risk tolerance investors seeking enhanced returns."
            features={[
              'Quadratic APY acceleration',
              'Second in loss absorption',
              'Absorbs 10-22% of claims',
              'No lock-up period'
            ]}
            target="High-Risk Tolerance Investors"
          />
          <TrancheCard
            icon="🟪"
            name="SURE-EQT"
            apyRange="15% → 25%"
            curve="EXPONENTIAL"
            risk="Highest"
            allocation="10%"
            lossRange="0-10%"
            description="Equity tranche with exponential curve capped at 25%. First-loss capital for degen yield farmers and protocol seed investors seeking maximum returns."
            features={[
              'Exponential APY (capped 25%)',
              'First loss absorption',
              'Absorbs 0-10% of claims',
              'No lock-up period'
            ]}
            target="Degen Yield Farmers, Seed Capital"
          />
        </div>
      </Section>

      {/* Collateral Options */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Accepted Collateral
        </h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <CollateralCard
            icon="💵"
            name="Stablecoins"
            symbol="USDT/USDC"
            description="Deposit with USDT or USDC for stable, predictable returns"
            available="All Tranches"
          />
          <CollateralCard
            icon="⚡"
            name="TON"
            symbol="TON"
            description="Stake native TON and earn yields in TON"
            available="All Tranches"
          />
          <CollateralCard
            icon="₿"
            name="Wrapped BTC"
            symbol="wBTC"
            description="Bitcoin holders can earn yield on TON blockchain"
            available="SURE-BTC Only"
          />
        </div>
      </Section>

      {/* Bonding Curves */}
      <Section>
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Dynamic Bonding Curves
        </h2>
        <div className="max-w-4xl mx-auto mb-12">
          <Card hover={false}>
            <p className="text-text-secondary mb-6">
              Each tranche uses a different bonding curve to determine APY based on vault utilization and market conditions. This creates a dynamic, efficient market for risk capital.
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-3 bg-cream-200 rounded">
                <h4 className="font-heading font-bold text-copper-500 mb-2">📉 FLAT (SURE-BTC)</h4>
                <p className="text-sm text-text-secondary">Constant 4% APY regardless of utilization. Maximum predictability for institutional capital.</p>
              </div>
              <div className="p-3 bg-cream-200 rounded">
                <h4 className="font-heading font-bold text-copper-500 mb-2">📊 LOGARITHMIC (SURE-SNR)</h4>
                <p className="text-sm text-text-secondary">Slow, steady growth from 6.5% to 10%. Conservative increase as utilization rises.</p>
              </div>
              <div className="p-3 bg-cream-200 rounded">
                <h4 className="font-heading font-bold text-copper-500 mb-2">📈 LINEAR (SURE-MEZZ)</h4>
                <p className="text-sm text-text-secondary">Proportional increase from 9% to 15%. Balanced response to market demand.</p>
              </div>
              <div className="p-3 bg-cream-200 rounded">
                <h4 className="font-heading font-bold text-copper-500 mb-2">〰️ SIGMOIDAL (SURE-JNR)</h4>
                <p className="text-sm text-text-secondary">S-curve from 12.5% to 16%. Gradual acceleration with steeper growth in mid-range.</p>
              </div>
              <div className="p-3 bg-cream-200 rounded">
                <h4 className="font-heading font-bold text-copper-500 mb-2">📐 QUADRATIC (SURE-JNR+)</h4>
                <p className="text-sm text-text-secondary">Accelerating growth from 16% to 22%. Rewards capital during high-demand periods.</p>
              </div>
              <div className="p-3 bg-cream-200 rounded">
                <h4 className="font-heading font-bold text-copper-500 mb-2">🚀 EXPONENTIAL (SURE-EQT)</h4>
                <p className="text-sm text-text-secondary">Rapid acceleration from 15% to 25% cap. Maximum yield for first-loss capital.</p>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* Waterfall Mechanics */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Waterfall Mechanics
        </h2>
        <div className="max-w-4xl mx-auto">
          <Card hover={false}>
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-heading font-bold text-copper-500 mb-3">
                  Premium Distribution (Revenue Waterfall)
                </h3>
                <p className="text-text-secondary mb-3">
                  Risk premiums are distributed from safest to riskiest tranches:
                </p>
                <ol className="space-y-2 text-sm">
                  <li className="flex items-start">
                    <span className="text-blue-600 font-bold mr-2">1.</span>
                    <span>🟦 <strong>SURE-BTC</strong> receives base 4% APY first</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-600 font-bold mr-2">2.</span>
                    <span>🟩 <strong>SURE-SNR</strong> receives 6.5%-10% APY second</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-yellow-600 font-bold mr-2">3.</span>
                    <span>🟨 <strong>SURE-MEZZ</strong> receives 9%-15% APY third</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-orange-600 font-bold mr-2">4.</span>
                    <span>🟧 <strong>SURE-JNR</strong> receives 12.5%-16% APY fourth</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-red-600 font-bold mr-2">5.</span>
                    <span>🟥 <strong>SURE-JNR+</strong> receives 16%-22% APY fifth</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-600 font-bold mr-2">6.</span>
                    <span>🟪 <strong>SURE-EQT</strong> receives 15%-25% APY</span>
                  </li>
                </ol>
              </div>

              <div className="border-t-2 border-cream-400 pt-6">
                <h3 className="text-xl font-heading font-bold text-copper-500 mb-3">
                  Loss Absorption (Payout Waterfall)
                </h3>
                <p className="text-text-secondary mb-3">
                  When risk payouts occur, losses are absorbed in reverse order:
                </p>
                <ol className="space-y-2 text-sm">
                  <li className="flex items-start">
                    <span className="text-purple-600 font-bold mr-2">1.</span>
                    <span>🟪 <strong>SURE-EQT</strong> absorbs 0-10% of claims (first-loss capital)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-red-600 font-bold mr-2">2.</span>
                    <span>🟥 <strong>SURE-JNR+</strong> absorbs 10-22% of claims</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-orange-600 font-bold mr-2">3.</span>
                    <span>🟧 <strong>SURE-JNR</strong> absorbs 22-37% of claims</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-yellow-600 font-bold mr-2">4.</span>
                    <span>🟨 <strong>SURE-MEZZ</strong> absorbs 37-55% of claims</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-600 font-bold mr-2">5.</span>
                    <span>🟩 <strong>SURE-SNR</strong> absorbs 55-75% of claims (well-protected)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-600 font-bold mr-2">6.</span>
                    <span>🟦 <strong>SURE-BTC</strong> absorbs 75-100% of claims (maximum protection)</span>
                  </li>
                </ol>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      {/* Overcollateralization Impact */}
      <Section>
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Overcollateralization Impact
        </h2>
        <div className="max-w-4xl mx-auto">
          <Card hover={false}>
            <p className="text-text-secondary mb-6">
              Different bonding curves attract capital at different rates, affecting the protocol's overcollateralization ratio. Higher overcollateralization means more capital backing each dollar of coverage, reducing risk for all tranches.
            </p>
            <div className="space-y-3">
              <div className="p-4 bg-cream-200 rounded border-l-4 border-purple-500">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-heading font-bold text-text-primary">🟪 Exponential (SURE-EQT)</h4>
                  <span className="text-sm font-mono font-bold text-purple-600">150-200%</span>
                </div>
                <p className="text-sm text-text-secondary">High APY at high utilization attracts aggressive capital quickly, dramatically increasing overcollateralization.</p>
              </div>

              <div className="p-4 bg-cream-200 rounded border-l-4 border-red-500">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-heading font-bold text-text-primary">🟥 Quadratic (SURE-JNR+)</h4>
                  <span className="text-sm font-mono font-bold text-red-600">150-200%</span>
                </div>
                <p className="text-sm text-text-secondary">Accelerating APY curve incentivizes capital deployment during high-demand periods, boosting overcollateralization.</p>
              </div>

              <div className="p-4 bg-cream-200 rounded border-l-4 border-orange-500">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-heading font-bold text-text-primary">🟧 Sigmoidal (SURE-JNR)</h4>
                  <span className="text-sm font-mono font-bold text-orange-600">130-150%</span>
                </div>
                <p className="text-sm text-text-secondary">Balanced S-curve provides good market-making dynamics, maintaining healthy overcollateralization.</p>
              </div>

              <div className="p-4 bg-cream-200 rounded border-l-4 border-yellow-500">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-heading font-bold text-text-primary">🟨 Linear (SURE-MEZZ)</h4>
                  <span className="text-sm font-mono font-bold text-yellow-600">120-140%</span>
                </div>
                <p className="text-sm text-text-secondary">Proportional growth ensures steady capital inflows, supporting consistent overcollateralization.</p>
              </div>

              <div className="p-4 bg-cream-200 rounded border-l-4 border-green-500">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-heading font-bold text-text-primary">🟩 Logarithmic (SURE-SNR)</h4>
                  <span className="text-sm font-mono font-bold text-green-600">120-130%</span>
                </div>
                <p className="text-sm text-text-secondary">Fast initial growth then plateaus, providing stable, predictable overcollateralization.</p>
              </div>

              <div className="p-4 bg-cream-200 rounded border-l-4 border-blue-500">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-heading font-bold text-text-primary">🟦 Flat (SURE-BTC)</h4>
                  <span className="text-sm font-mono font-bold text-blue-600">110-120%</span>
                </div>
                <p className="text-sm text-text-secondary">Minimal variation ensures consistent, reliable overcollateralization for institutional needs.</p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-copper-50 border border-copper-200 rounded">
              <h4 className="font-heading font-bold text-copper-500 mb-2">💡 Why This Matters</h4>
              <p className="text-sm text-text-secondary">
                Higher overcollateralization ratios mean the protocol can absorb larger losses before affecting senior tranches. The combination of different curves creates a self-balancing system where high-risk tranches attract capital when needed most, protecting conservative investors.
              </p>
            </div>
          </Card>
        </div>
      </Section>

      {/* Key Features */}
      <Section className="bg-cream-300">
        <h2 className="text-4xl font-heading font-bold text-text-primary text-center mb-12">
          Vault Features
        </h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <FeatureCard
            icon="🔓"
            title="Flexible Lock-Ups"
            description="Junior and Equity tranches have no lock-ups. Senior and Mezzanine have lock-up periods for stability."
          />
          <FeatureCard
            icon="📊"
            title="Daily Distributions"
            description="Rewards are calculated and distributed automatically every 24 hours"
          />
          <FeatureCard
            icon="♻️"
            title="Auto-Compounding"
            description="Earned yields are automatically reinvested to maximize returns"
          />
          <FeatureCard
            icon="🔍"
            title="Full Transparency"
            description="All vault operations and balances visible on-chain in real-time"
          />
          <FeatureCard
            icon="⚖️"
            title="Risk-Adjusted Returns"
            description="Choose the tranche that matches your risk tolerance and goals"
          />
          <FeatureCard
            icon="💱"
            title="Multi-Asset Support"
            description="Deposit with stablecoins, TON, or wBTC based on your preference"
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
            Ready to Start Earning Yield?
          </h2>
          <p className="text-xl text-cream-300 mb-8 max-w-2xl mx-auto leading-relaxed">
            Choose your tranche and start earning yield on your capital today.
            <br />
            No lock-ups, daily distributions, fully automated.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="secondary" size="lg" href="https://t.me/TonsuranceBot/tonsurance">
              Launch App →
            </Button>
            <Button variant="outline" size="lg" href="/about">
              Learn More About Tonsurance
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
}: {
  number: string;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -100px 0px" }}
      transition={{ duration: 0.5 }}
    >
      <Card className="h-full text-center">
        <div className="text-6xl mb-4">{icon}</div>
        <div className="text-4xl font-heading font-bold text-copper-500 mb-2">
          {number}
        </div>
        <h3 className="text-2xl font-heading font-bold text-text-primary mb-3">
          {title}
        </h3>
        <p className="text-text-secondary">{description}</p>
      </Card>
    </motion.div>
  );
}

function TrancheCard({
  icon,
  name,
  apyRange,
  curve,
  risk,
  allocation,
  lossRange,
  description,
  features,
  target,
}: {
  icon: string;
  name: string;
  apyRange: string;
  curve: string;
  risk: string;
  allocation: string;
  lossRange: string;
  description: string;
  features: string[];
  target: string;
}) {
  return (
    <Card className="h-full">
      <div className="flex items-center gap-2 pb-3 border-b-2 border-cream-400 mb-4">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-xl font-heading font-bold text-copper-500 uppercase">
          {name}
        </h3>
      </div>

      <div className="mb-4">
        <div className="text-2xl font-heading font-bold text-terminal-green mb-1">
          {apyRange}
        </div>
        <div className="text-xs text-text-secondary mb-2">APY Range</div>
        <div className="text-xs font-mono px-2 py-1 bg-cream-200 rounded inline-block">
          {curve} CURVE
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
        <div className="p-2 bg-cream-200 rounded">
          <div className="text-xs text-text-secondary">Risk Level</div>
          <div className="font-semibold">{risk}</div>
        </div>
        <div className="p-2 bg-cream-200 rounded">
          <div className="text-xs text-text-secondary">Allocation</div>
          <div className="font-semibold">{allocation}</div>
        </div>
      </div>

      <div className="p-2 bg-copper-50 border border-copper-200 rounded mb-4">
        <div className="text-xs text-text-secondary">Loss Range</div>
        <div className="text-sm font-semibold text-copper-600">{lossRange}</div>
      </div>

      <p className="text-sm text-text-secondary mb-3">
        {description}
      </p>

      <div className="mb-4 p-2 bg-cream-200 rounded">
        <div className="text-xs text-text-secondary mb-1">Target Audience:</div>
        <div className="text-xs font-semibold text-text-primary">{target}</div>
      </div>

      <ul className="space-y-2">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-start text-sm">
            <span className="text-terminal-green mr-2">•</span>
            <span className="text-text-primary">{feature}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CollateralCard({
  icon,
  name,
  symbol,
  description,
  available,
}: {
  icon: string;
  name: string;
  symbol: string;
  description: string;
  available: string;
}) {
  return (
    <Card>
      <div className="text-center">
        <div className="text-5xl mb-4">{icon}</div>
        <h3 className="text-xl font-heading font-bold text-text-primary mb-2">{name}</h3>
        <div className="text-sm font-mono text-copper-500 mb-3">{symbol}</div>
        <p className="text-sm text-text-secondary mb-4">{description}</p>
        <div className="text-xs text-text-tertiary">
          Available for: <strong>{available}</strong>
        </div>
      </div>
    </Card>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <div className="text-center">
        <div className="text-4xl mb-3">{icon}</div>
        <h3 className="text-lg font-heading font-bold text-text-primary mb-2">{title}</h3>
        <p className="text-sm text-text-secondary">{description}</p>
      </div>
    </Card>
  );
}
