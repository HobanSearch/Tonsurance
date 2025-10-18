'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Card } from './Card';
import { Button } from './Button';

type CoverageType = 'depeg' | 'exploit' | 'oracle' | 'bridge';
type Duration = '7' | '30' | '90' | '180';

interface CalculatorState {
  coverageType: CoverageType;
  amount: number;
  duration: Duration;
}

const coverageTypeData = {
  depeg: {
    name: 'Stablecoin Depeg',
    icon: '💵',
    baseRate: 0.02, // 2% annual
    description: 'Protects against stablecoin price deviations',
  },
  exploit: {
    name: 'Smart Contract Exploit',
    icon: '⚠️',
    baseRate: 0.05, // 5% annual
    description: 'Coverage for security incidents',
  },
  oracle: {
    name: 'Oracle Failure',
    icon: '🔮',
    baseRate: 0.03, // 3% annual
    description: 'Protection against price feed failures',
  },
  bridge: {
    name: 'Bridge Security',
    icon: '🌉',
    baseRate: 0.04, // 4% annual
    description: 'Coverage for cross-chain bridge incidents',
  },
};

export function CoverageCalculator() {
  const [state, setState] = useState<CalculatorState>({
    coverageType: 'depeg',
    amount: 10000,
    duration: '30',
  });

  const calculatePremium = () => {
    const typeData = coverageTypeData[state.coverageType];
    const durationMultiplier = parseInt(state.duration) / 365;
    const premium = state.amount * typeData.baseRate * durationMultiplier;
    return premium;
  };

  const premium = calculatePremium();
  const savingsPercent = state.duration === '180' ? 15 : state.duration === '90' ? 10 : 0;
  const finalPremium = premium * (1 - savingsPercent / 100);

  return (
    <Card className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h3 className="text-3xl font-heading font-bold text-text-primary mb-2">
          Coverage Calculator
        </h3>
        <p className="text-text-secondary">
          Get an instant quote for your parametric coverage
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Left: Input Controls */}
        <div className="space-y-6">
          {/* Coverage Type Selection */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-3">
              Coverage Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(Object.keys(coverageTypeData) as CoverageType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setState({ ...state, coverageType: type })}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    state.coverageType === type
                      ? 'border-copper-500 bg-copper-50'
                      : 'border-cream-400 hover:border-copper-300'
                  }`}
                >
                  <div className="text-2xl mb-1">{coverageTypeData[type].icon}</div>
                  <div className="text-sm font-semibold text-text-primary">
                    {coverageTypeData[type].name}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Coverage Amount */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-3">
              Coverage Amount: ${state.amount.toLocaleString()}
            </label>
            <input
              type="range"
              min="1000"
              max="100000"
              step="1000"
              value={state.amount}
              onChange={(e) => setState({ ...state, amount: parseInt(e.target.value) })}
              className="w-full h-2 bg-cream-400 rounded-lg appearance-none cursor-pointer accent-copper-500"
            />
            <div className="flex justify-between text-xs text-text-secondary mt-1">
              <span>$1,000</span>
              <span>$100,000</span>
            </div>
          </div>

          {/* Duration Selection */}
          <div>
            <label className="block text-sm font-semibold text-text-primary mb-3">
              Coverage Duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['7', '30', '90', '180'] as Duration[]).map((duration) => (
                <button
                  key={duration}
                  onClick={() => setState({ ...state, duration })}
                  className={`py-3 px-2 rounded-lg border-2 transition-all font-semibold text-sm ${
                    state.duration === duration
                      ? 'border-copper-500 bg-copper-500 text-white'
                      : 'border-cream-400 text-text-primary hover:border-copper-300'
                  }`}
                >
                  {duration} days
                </button>
              ))}
            </div>
            {savingsPercent > 0 && (
              <p className="text-sm text-terminal-green mt-2">
                ✓ {savingsPercent}% discount for longer duration
              </p>
            )}
          </div>
        </div>

        {/* Right: Quote Summary */}
        <div>
          <div className="bg-cream-300 rounded-xl p-6 border-2 border-copper-500">
            <h4 className="font-heading font-bold text-text-primary mb-4 text-lg">
              Your Quote
            </h4>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm text-text-secondary">Coverage Type</div>
                  <div className="font-semibold text-text-primary">
                    {coverageTypeData[state.coverageType].icon}{' '}
                    {coverageTypeData[state.coverageType].name}
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <div className="text-sm text-text-secondary">Coverage Amount</div>
                <div className="font-semibold text-text-primary">
                  ${state.amount.toLocaleString()}
                </div>
              </div>

              <div className="flex justify-between">
                <div className="text-sm text-text-secondary">Duration</div>
                <div className="font-semibold text-text-primary">{state.duration} days</div>
              </div>

              {savingsPercent > 0 && (
                <div className="flex justify-between text-terminal-green">
                  <div className="text-sm">Duration Discount</div>
                  <div className="font-semibold">-{savingsPercent}%</div>
                </div>
              )}

              <div className="border-t-2 border-cream-400 pt-4">
                <div className="flex justify-between items-baseline mb-2">
                  <div className="text-sm text-text-secondary">Premium</div>
                  <div className="text-3xl font-heading font-bold text-copper-500">
                    ${finalPremium.toFixed(2)}
                  </div>
                </div>
                <div className="text-xs text-text-secondary text-right">
                  (${(finalPremium / parseInt(state.duration)).toFixed(2)}/day)
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-6 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-terminal-green mt-0.5">✓</span>
                <span className="text-text-secondary">Automatic payout in 5-10 minutes</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-terminal-green mt-0.5">✓</span>
                <span className="text-text-secondary">No claims process needed</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-terminal-green mt-0.5">✓</span>
                <span className="text-text-secondary">Fully transparent on-chain</span>
              </div>
            </div>

            <Button
              variant="primary"
              size="lg"
              href="https://t.me/TonsuranceBot/tonsurance"
              className="w-full"
            >
              Get Coverage Now →
            </Button>

            <p className="text-xs text-text-secondary text-center mt-3">
              Chat with Tonny to finalize your coverage
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
