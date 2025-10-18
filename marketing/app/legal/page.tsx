'use client';

import { Layout, Section } from '@/components/Layout';
import { Card } from '@/components/Card';
import { motion } from 'framer-motion';

export default function Legal() {
  return (
    <Layout>
      <Section className="pt-20">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-5xl font-heading font-bold text-text-primary mb-6 text-center">
            Legal & Privacy
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto text-center mb-12">
            Last updated: October 14, 2025
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto space-y-12">
          {/* Terms of Service */}
          <div id="terms">
            <h2 className="text-3xl font-heading font-bold text-text-primary mb-6">
              Terms of Service
            </h2>

            <Card hover={false} className="space-y-6">
              <LegalSection title="1. Acceptance of Terms">
                <p>
                  By accessing or using Tonsurance (&quot;the Service&quot;), you agree to be bound by these Terms
                  of Service. If you do not agree to these terms, do not use the Service.
                </p>
              </LegalSection>

              <LegalSection title="2. Service Description">
                <p>
                  Tonsurance provides parametric risk coverage smart contracts on the TON blockchain. Coverage
                  is provided through automated smart contracts with predefined trigger conditions. This is NOT
                  traditional insurance.
                </p>
              </LegalSection>

              <LegalSection title="3. Coverage Contracts">
                <p>Key terms of coverage contracts:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>All terms are defined in immutable smart contract code</li>
                  <li>Premiums are paid upfront and non-refundable</li>
                  <li>Payouts are automatic based on oracle-verified conditions</li>
                  <li>No claims process or subjective assessments</li>
                  <li>Contracts cannot be cancelled once deployed</li>
                </ul>
              </LegalSection>

              <LegalSection title="4. User Responsibilities">
                <p>You are responsible for:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Understanding smart contract terms before deployment</li>
                  <li>Securing your TON wallet and private keys</li>
                  <li>Paying applicable gas fees and premiums</li>
                  <li>Compliance with your local laws and regulations</li>
                </ul>
              </LegalSection>

              <LegalSection title="5. Limitations and Disclaimers">
                <p>
                  THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. We do not guarantee
                  oracle accuracy, contract execution, or specific outcomes. Maximum liability is limited to
                  premium paid.
                </p>
              </LegalSection>

              <LegalSection title="6. Prohibited Uses">
                <p>You may not:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Use the Service for illegal activities</li>
                  <li>Attempt to manipulate oracles or trigger conditions</li>
                  <li>Exploit bugs or vulnerabilities (report to bug bounty)</li>
                  <li>Purchase coverage for pre-existing incidents</li>
                </ul>
              </LegalSection>

              <LegalSection title="7. Modifications">
                <p>
                  We reserve the right to modify these terms at any time. Continued use of the Service
                  constitutes acceptance of modified terms.
                </p>
              </LegalSection>
            </Card>
          </div>

          {/* Privacy Policy */}
          <div id="privacy">
            <h2 className="text-3xl font-heading font-bold text-text-primary mb-6">
              Privacy Policy
            </h2>

            <Card hover={false} className="space-y-6">
              <LegalSection title="1. Information We Collect">
                <p>We collect minimal information:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>On-Chain Data:</strong> Wallet addresses, transaction hashes, contract interactions
                    (publicly available on TON blockchain)
                  </li>
                  <li>
                    <strong>Telegram Data:</strong> User IDs and message interactions when using Tonny bot
                    (not linked to wallet addresses)
                  </li>
                  <li>
                    <strong>Website Analytics:</strong> Anonymous usage data via Cloudflare Analytics
                    (no cookies, no tracking)
                  </li>
                </ul>
              </LegalSection>

              <LegalSection title="2. How We Use Information">
                <p>We use collected information to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide and improve the Service</li>
                  <li>Monitor system performance and security</li>
                  <li>Respond to support requests</li>
                  <li>Comply with legal obligations</li>
                </ul>
              </LegalSection>

              <LegalSection title="3. Data Sharing">
                <p>
                  We do NOT sell or share your personal information with third parties. On-chain data is
                  publicly available by design of blockchain technology.
                </p>
              </LegalSection>

              <LegalSection title="4. Data Security">
                <p>
                  We implement industry-standard security measures. However, no system is 100% secure.
                  You are responsible for securing your wallet private keys.
                </p>
              </LegalSection>

              <LegalSection title="5. Your Rights">
                <p>You have the right to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Access your personal information</li>
                  <li>Request deletion of off-chain data (on-chain data is immutable)</li>
                  <li>Opt-out of analytics (use ad blockers or privacy tools)</li>
                  <li>Contact us with privacy concerns</li>
                </ul>
              </LegalSection>

              <LegalSection title="6. Cookies">
                <p>
                  We do NOT use cookies for tracking or advertising. Cloudflare may use essential cookies
                  for security and performance.
                </p>
              </LegalSection>

              <LegalSection title="7. Contact">
                <p>
                  For privacy questions or requests, contact us at:{' '}
                  <a href="mailto:privacy@tonsurance.com" className="text-copper-500 hover:text-copper-600">
                    privacy@tonsurance.com
                  </a>
                </p>
              </LegalSection>
            </Card>
          </div>

          {/* Risk Disclaimer */}
          <div id="risks">
            <h2 className="text-3xl font-heading font-bold text-text-primary mb-6">
              Risk Disclosure
            </h2>

            <Card hover={false} variant="highlight">
              <div className="space-y-4">
                <p className="font-bold">
                  IMPORTANT: Parametric coverage involves significant risks. Read carefully.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start">
                    <span className="text-cream-300 mr-2">⚠️</span>
                    <span>
                      <strong>Smart Contract Risk:</strong> Bugs or vulnerabilities could result in loss of
                      funds
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-cream-300 mr-2">⚠️</span>
                    <span>
                      <strong>Oracle Risk:</strong> Oracle failures could prevent payouts or cause false
                      triggers
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-cream-300 mr-2">⚠️</span>
                    <span>
                      <strong>No Refunds:</strong> Premiums are non-refundable even if trigger never occurs
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-cream-300 mr-2">⚠️</span>
                    <span>
                      <strong>Regulatory Risk:</strong> Legal status of parametric coverage varies by
                      jurisdiction
                    </span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-cream-300 mr-2">⚠️</span>
                    <span>
                      <strong>Basis Risk:</strong> Trigger conditions may not perfectly match actual losses
                    </span>
                  </li>
                </ul>
                <p className="text-sm pt-4">
                  Only invest what you can afford to lose. This is experimental technology. Not financial
                  advice.
                </p>
              </div>
            </Card>
          </div>
        </div>
      </Section>
    </Layout>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-cream-400 pb-6 last:border-0">
      <h3 className="text-lg font-heading font-bold text-text-primary mb-3">{title}</h3>
      <div className="text-text-secondary text-sm space-y-3">{children}</div>
    </div>
  );
}
