'use client';

import { Card } from './Card';
import { motion } from 'framer-motion';

interface FAQItemProps {
  question: string;
  answer: string;
}

export function FAQItem({ question, answer }: FAQItemProps) {
  return (
    <Card hover={false}>
      <h3 className="text-lg font-heading font-bold text-text-primary mb-3">
        {question}
      </h3>
      <p className="text-text-secondary">{answer}</p>
    </Card>
  );
}

interface FAQSectionProps {
  title?: string;
  faqs: FAQItemProps[];
  className?: string;
}

export function FAQSection({ title = 'Common Questions', faqs, className = '' }: FAQSectionProps) {
  return (
    <div className={className}>
      <motion.h2
        className="text-4xl font-heading font-bold text-text-primary text-center mb-12"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        {title}
      </motion.h2>

      <div className="max-w-3xl mx-auto space-y-6">
        {faqs.map((faq, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
          >
            <FAQItem question={faq.question} answer={faq.answer} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
