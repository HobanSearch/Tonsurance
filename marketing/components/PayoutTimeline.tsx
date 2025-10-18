'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface TimelineStep {
  time: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const timelineSteps: TimelineStep[] = [
  {
    time: '0:00',
    title: 'Event Detected',
    description: 'Oracle systems detect triggering condition (e.g., stablecoin depeg)',
    icon: '🔍',
    color: 'copper-500',
  },
  {
    time: '0:30',
    title: 'Multi-Oracle Verification',
    description: 'Cross-check with multiple oracle sources for accuracy',
    icon: '✓',
    color: 'ton-blue',
  },
  {
    time: '2:00',
    title: 'Threshold Confirmed',
    description: 'Event meets parametric trigger conditions',
    icon: '⚡',
    color: 'terminal-green',
  },
  {
    time: '3:00',
    title: 'Smart Contract Execution',
    description: 'Payout logic automatically executes on-chain',
    icon: '🤖',
    color: 'copper-500',
  },
  {
    time: '5:00',
    title: 'Funds Released',
    description: 'Payment sent directly to your wallet',
    icon: '💰',
    color: 'terminal-green',
  },
];

export function PayoutTimeline() {
  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="text-center mb-12">
        <motion.div
          className="inline-block bg-terminal-green text-white px-4 py-2 rounded-full text-sm font-semibold mb-4"
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
        >
          Average: 5-10 minutes
        </motion.div>
        <p className="text-text-secondary">
          How payouts happen automatically when conditions are met
        </p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-12 top-0 bottom-0 w-1 bg-cream-400" />

        {/* Timeline Steps */}
        <div className="space-y-8">
          {timelineSteps.map((step, index) => (
            <motion.div
              key={step.time}
              className="relative flex gap-6"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.15 }}
            >
              {/* Time badge */}
              <div className="flex-shrink-0 w-24 text-right">
                <div className="inline-block bg-cream-300 border-2 border-cream-400 rounded-lg px-3 py-1 text-sm font-semibold text-text-primary">
                  {step.time}
                </div>
              </div>

              {/* Icon circle */}
              <div className="flex-shrink-0 relative z-10">
                <motion.div
                  className="w-12 h-12 rounded-full bg-white border-4 flex items-center justify-center text-2xl shadow-lg"
                  style={{
                    borderColor:
                      step.color === 'terminal-green'
                        ? '#22c55e'
                        : step.color === 'ton-blue'
                        ? '#0088CC'
                        : '#D87665',
                  }}
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {step.icon}
                </motion.div>
              </div>

              {/* Content card */}
              <div className="flex-1 pb-8">
                <motion.div
                  className="bg-white rounded-xl p-6 border-2 border-cream-400 shadow-md hover:shadow-xl transition-shadow"
                  whileHover={{ y: -4 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <h3 className="text-xl font-heading font-bold text-text-primary mb-2">
                    {step.title}
                  </h3>
                  <p className="text-text-secondary">{step.description}</p>
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Success indicator */}
        <motion.div
          className="mt-8 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.8 }}
        >
          <div className="inline-flex items-center gap-3 bg-terminal-green text-white px-6 py-3 rounded-full font-semibold text-lg shadow-lg">
            <span className="text-2xl">✓</span>
            <span>Coverage Paid Out</span>
          </div>
        </motion.div>
      </div>

      {/* Comparison box */}
      <motion.div
        className="mt-12 bg-cream-300 rounded-xl p-8 border-2 border-cream-400"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 1 }}
      >
        <div className="grid md:grid-cols-2 gap-8">
          <div>
            <h4 className="font-heading font-bold text-text-primary mb-3 flex items-center gap-2">
              <span className="text-2xl">⚡</span>
              Parametric Coverage
            </h4>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-terminal-green mt-0.5">✓</span>
                <span>Automated trigger detection</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-terminal-green mt-0.5">✓</span>
                <span>No claims process needed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-terminal-green mt-0.5">✓</span>
                <span>Payout in 5-10 minutes</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-terminal-green mt-0.5">✓</span>
                <span>100% transparent on-chain</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-heading font-bold text-text-primary mb-3 flex items-center gap-2">
              <span className="text-2xl">📄</span>
              Traditional Insurance
            </h4>
            <ul className="space-y-2 text-sm text-text-secondary">
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">✗</span>
                <span>Manual claims filing required</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">✗</span>
                <span>Subjective assessment process</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">✗</span>
                <span>Payouts in weeks or months</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 mt-0.5">✗</span>
                <span>Opaque terms and conditions</span>
              </li>
            </ul>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
