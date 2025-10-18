'use client';

import { Layout, Section } from '@/components/Layout';
import { Button } from '@/components/Button';
import { TonnyCharacter } from '@/components/TonnyCharacter';
import { motion } from 'framer-motion';

export default function NotFound() {
  return (
    <Layout>
      <Section className="pt-20 pb-32 text-center min-h-[60vh] flex items-center">
        <div className="w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-8 flex justify-center">
              <TonnyCharacter size="2xl" animate={true} />
            </div>
            <h1 className="text-6xl font-heading font-bold text-text-primary mb-4">
              404
            </h1>
            <h2 className="text-3xl font-heading font-bold text-text-primary mb-6">
              Oops! Page Not Found
            </h2>
            <p className="text-xl text-text-secondary max-w-2xl mx-auto mb-8">
              Looks like this page got depegged from our website! 💎
              <br />
              Don&apos;t worry, Tonny can help you find your way back.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="primary" size="lg" href="/">
                Go to Homepage
              </Button>
              <Button variant="outline" size="lg" href="/how-it-works">
                Learn How It Works
              </Button>
              <Button variant="secondary" size="lg" href="https://t.me/TonsuranceBot">
                Chat with Tonny
              </Button>
            </div>
          </motion.div>
        </div>
      </Section>
    </Layout>
  );
}
