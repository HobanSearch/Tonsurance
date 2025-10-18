'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Card } from './Card';

interface TrustBadge {
  icon: string;
  title: string;
  description: string;
  status: string;
  color: string;
}

const trustBadges: TrustBadge[] = [
  {
    icon: '🔒',
    title: 'Smart Contract Audits',
    description: 'Audited by leading blockchain security firms',
    status: 'Completed',
    color: 'terminal-green',
  },
  {
    icon: '⚡',
    title: 'Real-Time Monitoring',
    description: '24/7 oracle and trigger monitoring',
    status: 'Active',
    color: 'ton-blue',
  },
  {
    icon: '💎',
    title: 'TON Ecosystem Partner',
    description: 'Official integration partner',
    status: 'Verified',
    color: 'ton-blue',
  },
  {
    icon: '🛡️',
    title: 'Multi-Sig Treasury',
    description: 'Funds secured with multi-signature wallets',
    status: 'Protected',
    color: 'terminal-green',
  },
  {
    icon: '📊',
    title: 'Transparent Reserves',
    description: 'All reserves publicly verifiable on-chain',
    status: 'Public',
    color: 'copper-500',
  },
  {
    icon: '✅',
    title: '99.8% Uptime',
    description: 'Industry-leading infrastructure reliability',
    status: 'Proven',
    color: 'terminal-green',
  },
];

const stats = [
  { value: '$2.5M+', label: 'Total Value Protected', icon: '💰' },
  { value: '147', label: 'Active Policies', icon: '📋' },
  { value: '6 min', label: 'Avg. Payout Time', icon: '⚡' },
  { value: '100%', label: 'Claims Paid', icon: '✅' },
];

export function TrustIndicators() {
  return (
    <div className="space-y-12">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="text-center" hover={true}>
              <div className="text-4xl mb-3">{stat.icon}</div>
              <div className="text-3xl font-heading font-bold text-copper-500 mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-text-secondary">{stat.label}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Trust Badges Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {trustBadges.map((badge, index) => (
          <motion.div
            key={badge.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="h-full relative overflow-hidden" hover={true}>
              {/* Status Badge */}
              <div className="absolute top-3 right-3">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-${badge.color} text-white`}
                  style={{
                    backgroundColor:
                      badge.color === 'terminal-green'
                        ? '#22c55e'
                        : badge.color === 'ton-blue'
                        ? '#0088CC'
                        : '#D87665',
                  }}
                >
                  {badge.status}
                </span>
              </div>

              <div className="text-5xl mb-4">{badge.icon}</div>
              <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                {badge.title}
              </h3>
              <p className="text-sm text-text-secondary">{badge.description}</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Partner Logos Section */}
      <div className="bg-cream-300 rounded-2xl p-8 border-2 border-cream-400">
        <h3 className="text-xl font-heading font-bold text-center text-text-primary mb-6">
          Trusted Partners & Integrations
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-center">
          <div className="flex items-center justify-center p-4">
            <span className="text-3xl font-heading font-bold text-ton-blue">TON</span>
          </div>
          <div className="flex items-center justify-center p-4">
            <span className="text-2xl font-heading font-bold text-text-secondary">
              Chainlink
            </span>
          </div>
          <div className="flex items-center justify-center p-4">
            <span className="text-2xl font-heading font-bold text-text-secondary">
              Certik
            </span>
          </div>
          <div className="flex items-center justify-center p-4">
            <span className="text-2xl font-heading font-bold text-text-secondary">
              LayerZero
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
