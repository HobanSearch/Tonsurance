import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  variant?: 'default' | 'highlight';
}

export function Card({ children, className = '', hover = true, variant = 'default' }: CardProps) {
  const baseClasses = 'rounded-xl p-6 shadow-md terminal-texture card-vignette';

  const variantClasses = {
    default: 'bg-cream-300 border border-cream-400',
    highlight: 'bg-copper-500 text-cream-200 border border-copper-600',
  };

  const classes = `${baseClasses} ${variantClasses[variant]} ${className}`;

  if (!hover) {
    return <div className={classes}><div className="relative z-10">{children}</div></div>;
  }

  return (
    <motion.div
      className={classes}
      whileHover={{ scale: 1.02, y: -4 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

interface CoverageCardProps {
  icon: string;
  title: string;
  description: string;
  features: string[];
}

export function CoverageCard({ icon, title, description, features }: CoverageCardProps) {
  return (
    <Card>
      <motion.div
        className="text-4xl mb-4 inline-block"
        whileHover={{ scale: 1.2, rotate: 10 }}
        transition={{ type: 'spring', stiffness: 400, damping: 15 }}
      >
        {icon}
      </motion.div>
      <h3 className="text-xl font-heading font-bold text-text-primary mb-2">{title}</h3>
      <p className="text-text-secondary mb-4">{description}</p>
      <ul className="space-y-2">
        {features.map((feature, index) => (
          <motion.li
            key={index}
            className="flex items-start"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
          >
            <span className="text-terminal-green mr-2">✓</span>
            <span className="text-sm text-text-primary">{feature}</span>
          </motion.li>
        ))}
      </ul>
    </Card>
  );
}

interface StatCardProps {
  value: string | number;
  label: string;
  icon?: string;
}

export function StatCard({ value, label, icon }: StatCardProps) {
  return (
    <motion.div
      className="text-center p-6 rounded-xl shadow-md bg-cream-300 border border-cream-400 terminal-texture card-vignette"
      whileHover={{ scale: 1.05, y: -5, borderColor: '#D87665' }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      <div className="relative z-10">
        {icon && (
          <motion.div
            className="text-3xl mb-2"
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            {icon}
          </motion.div>
        )}
        <motion.div
          className="text-3xl font-heading font-bold text-copper-500 mb-1"
          initial={{ opacity: 0, scale: 0.5 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ type: 'spring', stiffness: 200 }}
        >
          {value}
        </motion.div>
        <div className="text-sm text-text-secondary">{label}</div>
      </div>
    </motion.div>
  );
}
