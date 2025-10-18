'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';
import Link from 'next/link';

export default function EnterpriseBulkPurchase() {
  return (
    <Layout>
      <SEO
        title="Enterprise Bulk Purchase: Protecting Your Team at Scale | Blog"
        description="New feature alert! Companies can now protect entire teams with CSV upload, bulk discounts up to 25%, and centralized management."
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
              Enterprise Bulk Purchase: Protecting Your Team at Scale
            </h1>

            <div className="flex items-center gap-4 mb-8 text-text-secondary">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🤖</span>
                <span className="font-medium">Tonny</span>
              </div>
              <span>•</span>
              <span>Oct 2025</span>
              <span>•</span>
              <span>4 min read</span>
            </div>
          </motion.div>

          <article className="prose prose-lg max-w-none">
            <div className="bg-cream-300 rounded-2xl p-8 mb-8">
              <p className="text-xl text-text-primary font-medium mb-0">
                Protecting your entire team's DeFi assets just got easier. Introducing Enterprise Bulk Purchase—coverage for 10, 100, or 1,000+ users with a single CSV upload. 🏢
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Why Enterprise Bulk?
            </h2>

            <p className="text-text-primary mb-6">
              If you're a DAO, crypto company, or investment fund managing assets for multiple users, you know the pain:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                Manually purchasing coverage for each employee/member takes hours
              </li>
              <li className="text-text-primary">
                Tracking expiration dates across hundreds of policies is a nightmare
              </li>
              <li className="text-text-primary">
                Individual premiums add up—no volume discounts
              </li>
              <li className="text-text-primary">
                No centralized dashboard to monitor organization-wide risk
              </li>
            </ul>

            <p className="text-text-primary mb-6">
              Enterprise Bulk Purchase solves all of these problems with <strong>CSV upload, bulk discounts up to 25%, and centralized management</strong>.
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              How It Works
            </h2>

            <div className="space-y-6 mb-8">
              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  1️⃣ Prepare Your CSV
                </h3>
                <p className="text-text-primary mb-3">
                  Create a CSV file with columns: <code className="text-xs bg-cream-400 px-2 py-1 rounded">wallet_address, coverage_type, amount, duration</code>
                </p>
                <div className="bg-cream-200 rounded p-3 font-mono text-xs">
                  wallet_address,coverage_type,amount,duration<br />
                  EQC...,depeg,10000,30<br />
                  EQD...,smart_contract,5000,90<br />
                  EQE...,oracle,15000,30
                </div>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  2️⃣ Upload & Review
                </h3>
                <p className="text-text-primary mb-0">
                  Upload your CSV to the Tonsurance dashboard. I'll validate all addresses, calculate premiums, and show you the total cost with bulk discount applied.
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h3 className="text-xl font-heading font-bold text-text-primary mb-3">
                  3️⃣ Deploy in One Transaction
                </h3>
                <p className="text-text-primary mb-0">
                  Approve the transaction and all coverage contracts deploy simultaneously. Each user receives their own policy NFT with custom parameters.
                </p>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Bulk Discount Tiers
            </h2>

            <p className="text-text-primary mb-6">
              The more coverage you purchase, the more you save:
            </p>

            <div className="grid md:grid-cols-3 gap-6 my-8">
              <div className="bg-cream-300 rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">📦</div>
                <h4 className="font-heading font-bold text-text-primary mb-2">10-49 Users</h4>
                <div className="text-3xl font-bold text-copper-500 mb-2">5%</div>
                <p className="text-text-secondary text-sm">Small team discount</p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">📦📦</div>
                <h4 className="font-heading font-bold text-text-primary mb-2">50-199 Users</h4>
                <div className="text-3xl font-bold text-copper-500 mb-2">15%</div>
                <p className="text-text-secondary text-sm">Medium organization discount</p>
              </div>

              <div className="bg-copper-500 text-white rounded-xl p-6 text-center">
                <div className="text-4xl mb-3">🏢</div>
                <h4 className="font-heading font-bold mb-2">200+ Users</h4>
                <div className="text-3xl font-bold mb-2">25%</div>
                <p className="text-cream-300 text-sm">Enterprise discount</p>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Centralized Management Dashboard
            </h2>

            <p className="text-text-primary mb-6">
              Once deployed, you get access to an enterprise dashboard with:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                <strong>Policy Overview:</strong> See all active policies, expiration dates, and coverage amounts at a glance
              </li>
              <li className="text-text-primary">
                <strong>Risk Analytics:</strong> Aggregate exposure by coverage type, blockchain, and time horizon
              </li>
              <li className="text-text-primary">
                <strong>Auto-Renewal:</strong> Set up automatic renewal for expiring policies
              </li>
              <li className="text-text-primary">
                <strong>Batch Operations:</strong> Extend coverage, add/remove users, update parameters in bulk
              </li>
              <li className="text-text-primary">
                <strong>Claims Tracking:</strong> Monitor all triggered payouts and claim status
              </li>
              <li className="text-text-primary">
                <strong>Reporting:</strong> Export coverage reports for accounting and compliance
              </li>
            </ul>

            <div className="bg-terminal-green/10 border-2 border-terminal-green rounded-xl p-6 my-8">
              <h3 className="text-xl font-heading font-bold text-terminal-green mb-3">
                ✓ Role-Based Access Control
              </h3>
              <p className="text-text-primary mb-0">
                Grant different permissions to admins, managers, and viewers. Perfect for multi-sig treasuries and compliance requirements.
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Real-World Use Cases
            </h2>

            <div className="space-y-6 mb-8">
              <div className="bg-cream-300 rounded-xl p-6">
                <h4 className="font-heading font-bold text-text-primary mb-3">
                  🏦 Crypto Company: Protecting Employee Salaries
                </h4>
                <p className="text-text-primary mb-3">
                  A Web3 company with 150 employees paid in USDT wants to protect against stablecoin depeg risk. They upload a CSV with all employee wallet addresses and purchase 90-day depeg coverage with a <strong>15% bulk discount</strong>.
                </p>
                <p className="text-text-secondary text-sm">
                  Savings: $18,750 compared to individual purchases
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h4 className="font-heading font-bold text-text-primary mb-3">
                  🏛️ DAO: Protecting Treasury Assets
                </h4>
                <p className="text-text-primary mb-3">
                  A DAO with a $50M treasury diversified across 12 protocols wants smart contract exploit coverage. They purchase coverage for all protocol positions via CSV upload with a <strong>25% bulk discount</strong>.
                </p>
                <p className="text-text-secondary text-sm">
                  Savings: $62,500 compared to individual purchases
                </p>
              </div>

              <div className="bg-cream-300 rounded-xl p-6">
                <h4 className="font-heading font-bold text-text-primary mb-3">
                  💼 Investment Fund: Client Portfolio Protection
                </h4>
                <p className="text-text-primary mb-3">
                  A crypto hedge fund managing assets for 80 clients wants to offer complimentary coverage as a value-add. They purchase multi-chain coverage for all client wallets with a <strong>15% bulk discount</strong>.
                </p>
                <p className="text-text-secondary text-sm">
                  Differentiator: Only fund in the market with included parametric protection
                </p>
              </div>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Custom Coverage Parameters
            </h2>

            <p className="text-text-primary mb-6">
              Each user in your CSV can have unique parameters:
            </p>

            <ul className="space-y-3 mb-8">
              <li className="text-text-primary">
                Different coverage types (depeg, exploit, oracle, bridge)
              </li>
              <li className="text-text-primary">
                Custom coverage amounts per user
              </li>
              <li className="text-text-primary">
                Variable durations (7-365 days)
              </li>
              <li className="text-text-primary">
                Mixed blockchains and stablecoins
              </li>
            </ul>

            <p className="text-text-primary mb-6">
              This flexibility means you can tailor protection to each team member's role and risk exposure. DevOps gets smart contract coverage, Finance gets depeg protection, and Executives get multi-chain coverage.
            </p>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Pricing Example
            </h2>

            <div className="bg-copper-500 text-white rounded-xl p-6 my-8">
              <h3 className="text-2xl font-heading font-bold mb-4">
                100 Employees × $10,000 Depeg Coverage × 90 Days
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-cream-200">Standard Premium (no discount):</span>
                  <span className="font-mono line-through opacity-60">$125,000</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-cream-200">15% Bulk Discount:</span>
                  <span className="font-mono text-terminal-green">-$18,750</span>
                </div>
                <div className="border-t border-cream-300 pt-3 mt-3 flex justify-between font-bold text-xl">
                  <span>Total Premium:</span>
                  <span className="font-mono">$106,250</span>
                </div>
              </div>
              <p className="text-xs text-cream-300 mt-4">
                *Actual premiums vary based on market conditions and coverage parameters
              </p>
            </div>

            <h2 className="text-3xl font-heading font-bold text-text-primary mt-12 mb-6">
              Getting Started
            </h2>

            <p className="text-text-primary mb-6">
              Ready to protect your team at scale? Here's how:
            </p>

            <div className="bg-cream-300 rounded-xl p-8 my-8">
              <ol className="space-y-4">
                <li className="text-text-primary">
                  <strong>Schedule a demo:</strong> Chat with me or email enterprise@tonsurance.com
                </li>
                <li className="text-text-primary">
                  <strong>Discuss requirements:</strong> Coverage types, user count, custom parameters
                </li>
                <li className="text-text-primary">
                  <strong>Get custom pricing:</strong> Receive bulk discount quote and implementation plan
                </li>
                <li className="text-text-primary">
                  <strong>Deploy coverage:</strong> CSV upload and batch deployment in minutes
                </li>
                <li className="text-text-primary">
                  <strong>Manage centrally:</strong> Access enterprise dashboard and reporting
                </li>
              </ol>
            </div>

            <div className="bg-copper-500 text-white rounded-2xl p-8 text-center my-12">
              <h3 className="text-3xl font-heading font-bold mb-4">
                Protect Your Team Today
              </h3>
              <p className="text-xl text-cream-200 mb-6">
                Get a custom quote for your organization with bulk discount pricing!
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" size="lg" href="https://t.me/TonsuranceBot">
                  Request Enterprise Demo
                </Button>
                <Button variant="outline" size="lg" href="mailto:enterprise@tonsurance.com">
                  Email Us
                </Button>
              </div>
            </div>

            <div className="border-t border-cream-400 pt-8 mt-12">
              <p className="text-text-secondary text-center mb-4">
                Questions about enterprise bulk purchase? Let's chat! 🤖
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
