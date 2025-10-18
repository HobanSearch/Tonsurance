import React from 'react';
import { motion } from 'framer-motion';
import { Card } from './Card';

interface Testimonial {
  name: string;
  role: string;
  quote: string;
  amount?: string;
  chain?: string;
  timeSaved?: string;
}

const testimonials: Testimonial[] = [
  {
    name: "Sarah Chen",
    role: "DeFi Trader",
    quote: "When USDT depegged to $0.89 last month, my payout arrived in 7 minutes. No forms, no waiting, no stress. Tonsurance saved my portfolio.",
    amount: "$50,000",
    chain: "TON",
    timeSaved: "7 minutes",
  },
  {
    name: "Michael Rodriguez",
    role: "Crypto Fund Manager",
    quote: "We protect $2M across 5 chains with Tonsurance. The unified dashboard and instant payouts are game-changing for institutional investors.",
    amount: "$2,000,000",
    chain: "Multi-Chain",
    timeSaved: "6 minutes avg",
  },
  {
    name: "Alex Thompson",
    role: "Yield Farmer",
    quote: "After losing $30k in a bridge exploit last year, I won't farm without Tonsurance. The peace of mind is worth every satoshi of the premium.",
    amount: "$100,000",
    chain: "Arbitrum",
    timeSaved: "5 minutes",
  },
  {
    name: "Priya Patel",
    role: "Enterprise CFO",
    quote: "We use the bulk purchase feature to protect 150 employee wallets. 25% discount, one CSV upload, done. It's insurance without the insurance company nonsense.",
    amount: "$500,000",
    chain: "Ethereum",
    timeSaved: "Saved 40 hours setup",
  },
];

export function Testimonials() {
  return (
    <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
      {testimonials.map((testimonial, index) => (
        <TestimonialCard key={index} testimonial={testimonial} index={index} />
      ))}
    </div>
  );
}

function TestimonialCard({ testimonial, index }: { testimonial: Testimonial; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
    >
      <Card className="h-full flex flex-col">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-copper-500 flex items-center justify-center text-white font-heading font-bold text-xl">
              {testimonial.name.charAt(0)}
            </div>
            <div>
              <div className="font-heading font-bold text-text-primary">
                {testimonial.name}
              </div>
              <div className="text-sm text-text-secondary">{testimonial.role}</div>
            </div>
          </div>

          <blockquote className="text-text-primary mb-4 italic">
            "{testimonial.quote}"
          </blockquote>
        </div>

        <div className="pt-4 border-t border-cream-400">
          <div className="grid grid-cols-3 gap-2 text-center">
            {testimonial.amount && (
              <div>
                <div className="text-xs text-text-secondary mb-1">Protected</div>
                <div className="text-sm font-semibold text-copper-500">{testimonial.amount}</div>
              </div>
            )}
            {testimonial.chain && (
              <div>
                <div className="text-xs text-text-secondary mb-1">Chain</div>
                <div className="text-sm font-semibold text-text-primary">{testimonial.chain}</div>
              </div>
            )}
            {testimonial.timeSaved && (
              <div>
                <div className="text-xs text-text-secondary mb-1">Payout</div>
                <div className="text-sm font-semibold text-terminal-green">{testimonial.timeSaved}</div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
