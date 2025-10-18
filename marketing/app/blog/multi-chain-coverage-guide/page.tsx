'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';
import Link from 'next/link';

export default function MultiChainCoverageGuide() {
  return (
    <Layout>
      <SEO
        title="Multi-Chain Coverage: Protecting Assets Across 5 Blockchains | Blog"
        description="Tonsurance now supports coverage across TON, Ethereum, BSC, Polygon, and Arbitrum. Here's how to protect your multi-chain portfolio with a single interface."
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
                Tutorial
              </span>
            </div>

            <h1 className="text-5xl font-heading font-bold text-text-primary mb-6">
              Multi-Chain Coverage: Protecting Assets Across 5 Blockchains
            </h1>

            <div className="flex items-center gap-4 mb-8 text-text-secondary">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🤖</span>
                <span className="font-medium">Tonny</span>
              </div>
              <span>•</span>
              <span>Oct 2025</span>
              <span>•</span>
              <span>6 min read</span>
            </div>
          </motion.div>

          <article className="prose prose-lg max-w-none">
            <div className="bg-cream-300 rounded-2xl p-8 mb-8">
              <p className="text-xl text-text-primary font-medium mb-0">
                Your assets are spread across multiple chains—why shouldn't your coverage be? Here's everything you need to know about Tonsurance multi-chain protection. 🌐
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              The Multi-Chain Reality
            </h2>

            <p className="text-text-primary mb-6">
              If you're active in DeFi, you know the reality: Your assets aren't on just one blockchain anymore.
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">You hold USDT on TON for yield farming</li>
              <li className="text-text-primary">You have USDC on Ethereum for DeFi protocols</li>
              <li className="text-text-primary">You use BSC for lower gas fees</li>
              <li className="text-text-primary">You bridge to Arbitrum for L2 benefits</li>
              <li className="text-text-primary">You experiment on Polygon for gaming</li>
            </ul>

            <p className="text-text-primary mb-6">
              Each chain has its own risks. Each asset needs protection. Managing coverage across all of them? That used to be a nightmare.
            </p>

            <p className="text-text-primary mb-6">
              Not anymore. 🚀
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Supported Chains
            </h2>

            <p className="text-text-primary mb-6">
              Tonsurance multi-chain coverage currently supports:
            </p>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <Card hover={false} className="bg-ton-blue text-white">
                <h3 className="text-2xl font-heading font-bold mb-2">TON</h3>
                <p className="text-cream-200 text-sm mb-0">
                  Native support for TON blockchain with the fastest settlement times
                </p>
              </Card>

              <Card hover={false}>
                <h3 className="text-2xl font-heading font-bold text-text-primary mb-2">Ethereum</h3>
                <p className="text-text-secondary text-sm mb-0">
                  Full coverage for mainnet Ethereum assets and protocols
                </p>
              </Card>

              <Card hover={false}>
                <h3 className="text-2xl font-heading font-bold text-text-primary mb-2">BSC</h3>
                <p className="text-text-secondary text-sm mb-0">
                  Binance Smart Chain protection with low-cost coverage options
                </p>
              </Card>

              <Card hover={false}>
                <h3 className="text-2xl font-heading font-bold text-text-primary mb-2">Polygon</h3>
                <p className="text-text-secondary text-sm mb-0">
                  L2 scaling solution coverage with fast, affordable premiums
                </p>
              </Card>

              <Card hover={false}>
                <h3 className="text-2xl font-heading font-bold text-text-primary mb-2">Arbitrum</h3>
                <p className="text-text-secondary text-sm mb-0">
                  Optimistic rollup protection for your L2 DeFi positions
                </p>
              </Card>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              How Multi-Chain Coverage Works
            </h2>

            <p className="text-text-primary mb-6">
              The beauty of Tonsurance multi-chain is that you manage everything from a <strong>single interface</strong>. Here's how it works:
            </p>

            <div className="space-y-6 mb-8">
              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                  1️⃣ Select Your Chain
                </h3>
                <p className="text-text-primary mb-0">
                  Choose which blockchain you want to protect. You can see your balances across all supported chains.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                  2️⃣ Choose Asset & Risk Type
                </h3>
                <p className="text-text-primary mb-0">
                  Select the stablecoin or asset you want to protect (USDT, USDC, DAI, etc.) and the coverage type (depeg, exploit, oracle failure, bridge).
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                  3️⃣ Set Coverage Parameters
                </h3>
                <p className="text-text-primary mb-0">
                  Configure your coverage amount, duration, and trigger thresholds. Premiums are chain-specific based on risk.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                  4️⃣ Deploy Coverage Contract
                </h3>
                <p className="text-text-primary mb-0">
                  Your coverage contract deploys on the selected chain. You can monitor all your active coverages from one dashboard.
                </p>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Bridge Health Monitoring
            </h2>

            <p className="text-text-primary mb-6">
              One of the most critical risks in multi-chain DeFi is <strong>bridge security</strong>. When you move assets between chains, you rely on bridges—and bridges are frequent targets for exploits.
            </p>

            <div className="bg-copper-500 text-white rounded-xl p-6 my-8">
              <h3 className="text-2xl font-heading font-bold mb-4">Bridge Coverage Included</h3>
              <p className="text-cream-200 mb-0">
                Multi-chain coverage automatically includes bridge health monitoring. If a bridge you've used suffers an exploit within your coverage period, you're protected.
              </p>
            </div>

            <p className="text-text-primary mb-6">
              We monitor the most popular bridges:
            </p>

            <ul className="space-y-2 mb-8">
              <li className="text-text-primary">✅ TON Bridge (TON ↔ Ethereum)</li>
              <li className="text-text-primary">✅ Multichain / Anyswap</li>
              <li className="text-text-primary">✅ Wormhole</li>
              <li className="text-text-primary">✅ Synapse Protocol</li>
              <li className="text-text-primary">✅ Hop Protocol</li>
              <li className="text-text-primary">✅ Polygon Bridge</li>
              <li className="text-text-primary">✅ Arbitrum Bridge</li>
            </ul>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Chain-Specific Risks & Premiums
            </h2>

            <p className="text-text-primary mb-6">
              Not all chains have the same risk profile. Premiums vary based on:
            </p>

            <div className="overflow-x-auto mb-8">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-cream-300">
                    <th className="border border-cream-400 p-4 text-left font-heading font-bold text-text-primary">
                      Chain
                    </th>
                    <th className="border border-cream-400 p-4 text-left font-heading font-bold text-text-primary">
                      Typical Premium
                    </th>
                    <th className="border border-cream-400 p-4 text-left font-heading font-bold text-text-primary">
                      Risk Factors
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      TON
                    </td>
                    <td className="border border-cream-400 p-4 text-terminal-green font-semibold">
                      0.3% - 0.8%
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary text-sm">
                      Lower risk, newer ecosystem
                    </td>
                  </tr>
                  <tr className="bg-cream-300">
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      Ethereum
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary font-semibold">
                      0.5% - 1.2%
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary text-sm">
                      Mature, high liquidity, complex protocols
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      BSC
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary font-semibold">
                      0.6% - 1.5%
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary text-sm">
                      Higher exploit history, centralized
                    </td>
                  </tr>
                  <tr className="bg-cream-300">
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      Polygon
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary font-semibold">
                      0.4% - 1.0%
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary text-sm">
                      L2 risks, bridge dependencies
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-cream-400 p-4 font-semibold text-text-primary">
                      Arbitrum
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary font-semibold">
                      0.4% - 1.0%
                    </td>
                    <td className="border border-cream-400 p-4 text-text-primary text-sm">
                      L2 risks, optimistic rollup delays
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="text-text-primary mb-6">
              <em className="text-text-secondary">Note: These are example ranges. Actual premiums are calculated in real-time based on market volatility, TVL, recent incidents, and coverage duration.</em>
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Gifting Coverage Across Chains
            </h2>

            <p className="text-text-primary mb-6">
              One powerful feature: You can <strong>gift coverage for assets on any supported chain</strong>. The recipient gets protection for their holdings on their preferred chain, with all payouts settled on TON blockchain.
            </p>

            <p className="text-text-primary mb-6">
              Use cases:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Protect a friend's wallet:</strong> They hold USDC on Polygon—you buy them coverage. If triggered, they receive payout on TON.
              </li>
              <li className="text-text-primary">
                <strong>Employee benefits:</strong> Provide coverage for your team's crypto holdings across multiple chains. All payouts on TON.
              </li>
              <li className="text-text-primary">
                <strong>Family protection:</strong> Cover your family members' stablecoins on their preferred chains. They receive payouts on TON.
              </li>
            </ul>

            <div className="bg-terminal-green/10 border-2 border-terminal-green rounded-xl p-6 mb-8">
              <p className="text-text-primary mb-3">
                <strong>How it works:</strong> Select the chain where the assets are held, enter the recipient's TON address, and choose coverage parameters. They receive the coverage even if they've never used Tonsurance before.
              </p>
              <p className="text-terminal-green font-bold mb-0">
                ✓ All payouts settle on TON blockchain—recipient must provide a TON wallet address for claims.
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Managing Multi-Chain Coverage
            </h2>

            <p className="text-text-primary mb-6">
              All your coverage contracts across all chains appear in a <strong>unified dashboard</strong>:
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <h4 className="font-heading font-bold text-text-primary mb-1">Portfolio Overview</h4>
                  <p className="text-text-primary text-sm mb-0">
                    See total coverage amount, active contracts, and premiums paid across all chains at a glance
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">⏰</span>
                <div>
                  <h4 className="font-heading font-bold text-text-primary mb-1">Expiration Tracking</h4>
                  <p className="text-text-primary text-sm mb-0">
                    Get notifications before coverage expires on any chain, with one-click renewal
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">📈</span>
                <div>
                  <h4 className="font-heading font-bold text-text-primary mb-1">Risk Monitoring</h4>
                  <p className="text-text-primary text-sm mb-0">
                    Real-time alerts for covered assets across all chains when conditions approach trigger thresholds
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="text-2xl">💰</span>
                <div>
                  <h4 className="font-heading font-bold text-text-primary mb-1">Payout History</h4>
                  <p className="text-text-primary text-sm mb-0">
                    Track all payouts received across chains, with on-chain verification links
                  </p>
                </div>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Example: Protecting a Multi-Chain Portfolio
            </h2>

            <p className="text-text-primary mb-6">
              Let's say you have:
            </p>

            <ul className="space-y-2 mb-6">
              <li className="text-text-primary">50,000 USDT on TON (yield farming)</li>
              <li className="text-text-primary">100,000 USDC on Ethereum (Aave lending)</li>
              <li className="text-text-primary">25,000 USDT on BSC (PancakeSwap)</li>
              <li className="text-text-primary">30,000 USDC on Arbitrum (GMX trading)</li>
            </ul>

            <p className="text-text-primary mb-6">
              Here's how you'd set up comprehensive protection:
            </p>

            <div className="bg-cream-300 rounded-xl p-6 mb-8">
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-text-primary mb-2">TON Coverage</h4>
                  <ul className="text-sm space-y-1">
                    <li className="text-text-primary">• Coverage: 50,000 TON worth of USDT</li>
                    <li className="text-text-primary">• Trigger: USDT below $0.95</li>
                    <li className="text-text-primary">• Duration: 90 days</li>
                    <li className="text-text-primary">• Premium: ~300 TON (0.6%)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-text-primary mb-2">Ethereum Coverage</h4>
                  <ul className="text-sm space-y-1">
                    <li className="text-text-primary">• Coverage: $100,000 USDC</li>
                    <li className="text-text-primary">• Trigger: USDC below $0.95 OR Aave exploit</li>
                    <li className="text-text-primary">• Duration: 180 days</li>
                    <li className="text-text-primary">• Premium: ~$800 (0.8%)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-text-primary mb-2">BSC Coverage</h4>
                  <ul className="text-sm space-y-1">
                    <li className="text-text-primary">• Coverage: $25,000 USDT</li>
                    <li className="text-text-primary">• Trigger: USDT below $0.95 OR PancakeSwap exploit</li>
                    <li className="text-text-primary">• Duration: 90 days</li>
                    <li className="text-text-primary">• Premium: ~$250 (1.0%)</li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-text-primary mb-2">Arbitrum Coverage</h4>
                  <ul className="text-sm space-y-1">
                    <li className="text-text-primary">• Coverage: $30,000 USDC</li>
                    <li className="text-text-primary">• Trigger: USDC below $0.95 OR bridge incident</li>
                    <li className="text-text-primary">• Duration: 60 days</li>
                    <li className="text-text-primary">• Premium: ~$180 (0.6%)</li>
                  </ul>
                </div>

                <div className="pt-4 border-t border-cream-400">
                  <h4 className="font-bold text-text-primary">Total Multi-Chain Protection</h4>
                  <p className="text-text-primary text-sm mb-0">
                    <strong>Total Coverage:</strong> $205,000 across 4 chains<br />
                    <strong>Total Premium:</strong> ~$1,530 (0.75% average)<br />
                    <strong>Managed from:</strong> Single unified dashboard
                  </p>
                </div>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Getting Started with Multi-Chain Coverage
            </h2>

            <p className="text-text-primary mb-6">
              Ready to protect your multi-chain portfolio? Here's how:
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-copper-500 text-white rounded-full flex items-center justify-center font-heading font-bold">
                  1
                </div>
                <div>
                  <p className="text-text-primary mb-0">
                    <strong>Chat with me on Telegram</strong> - Tell me which chains you're active on
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-copper-500 text-white rounded-full flex items-center justify-center font-heading font-bold">
                  2
                </div>
                <div>
                  <p className="text-text-primary mb-0">
                    <strong>Review your holdings</strong> - I can help you see your balances across supported chains
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-copper-500 text-white rounded-full flex items-center justify-center font-heading font-bold">
                  3
                </div>
                <div>
                  <p className="text-text-primary mb-0">
                    <strong>Get multi-chain quotes</strong> - I'll fetch live rates for each chain and recommend coverage
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-copper-500 text-white rounded-full flex items-center justify-center font-heading font-bold">
                  4
                </div>
                <div>
                  <p className="text-text-primary mb-0">
                    <strong>Deploy coverage contracts</strong> - One-click deployment on each chain you want to protect
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-8 h-8 bg-copper-500 text-white rounded-full flex items-center justify-center font-heading font-bold">
                  5
                </div>
                <div>
                  <p className="text-text-primary mb-0">
                    <strong>Monitor from unified dashboard</strong> - Track all coverage, get alerts, manage renewals
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-copper-500 text-white rounded-2xl p-8 text-center my-12">
              <h3 className="text-3xl font-heading font-bold mb-4">
                Protect Your Multi-Chain Portfolio Today
              </h3>
              <p className="text-xl text-cream-200 mb-6">
                Get comprehensive coverage across TON, Ethereum, BSC, Polygon, and Arbitrum—all from one place!
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

            <div className="border-t border-cream-400 pt-8 mt-12">
              <p className="text-text-secondary text-center mb-4">
                Questions about multi-chain coverage? Need help choosing the right protection? Let's chat! 🤖
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
