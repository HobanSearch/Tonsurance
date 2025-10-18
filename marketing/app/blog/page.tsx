'use client';

import { Layout, Section } from '@/components/Layout';
import { Card } from '@/components/Card';
import { motion } from 'framer-motion';
import { SEO } from '@/components/SEO';
import Link from 'next/link';

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  category: string;
  readTime: string;
}

const blogPosts: BlogPost[] = [
  {
    slug: 'introducing-tonsurance',
    title: 'Introducing Tonsurance: Parametric Risk Coverage on TON',
    excerpt: 'We\'re excited to launch Tonsurance, bringing automated parametric coverage to the TON blockchain. Learn how we\'re making DeFi protection instant and transparent.',
    date: '2025-10-01',
    author: 'Tonny',
    category: 'Product',
    readTime: '5 min read',
  },
  {
    slug: 'why-parametric-insurance',
    title: 'Why Parametric Coverage is the Future of DeFi Protection',
    excerpt: 'Traditional insurance is broken for crypto. Discover how parametric triggers eliminate claims processes and deliver payouts in minutes, not months.',
    date: '2025-10-01',
    author: 'Tonny',
    category: 'Education',
    readTime: '7 min read',
  },
  {
    slug: 'multi-chain-coverage-guide',
    title: 'Multi-Chain Coverage: Protecting Assets Across 5 Blockchains',
    excerpt: 'Tonsurance now supports coverage across TON, Ethereum, BSC, Polygon, and Arbitrum. Here\'s how to protect your multi-chain portfolio with a single interface.',
    date: '2025-10-01',
    author: 'Tonny',
    category: 'Tutorial',
    readTime: '6 min read',
  },
  {
    slug: 'hedged-coverage-explained',
    title: 'Hedged Coverage: How We Reduce Premiums by 30%',
    excerpt: 'Learn how Tonsurance\'s swing pricing model uses external hedges via Polymarket, Perpetuals, and Allianz to lower your coverage costs.',
    date: '2025-10-01',
    author: 'Tonny',
    category: 'Product',
    readTime: '8 min read',
  },
  {
    slug: 'enterprise-bulk-purchase',
    title: 'Enterprise Bulk Purchase: Protecting Your Team at Scale',
    excerpt: 'New feature alert! Companies can now protect entire teams with CSV upload, bulk discounts up to 25%, and centralized management.',
    date: '2025-10-01',
    author: 'Tonny',
    category: 'Product',
    readTime: '4 min read',
  },
  {
    slug: 'defi-risks-2025',
    title: 'Top 5 DeFi Risks in 2025 (and How to Protect Yourself)',
    excerpt: 'Stablecoin depegs, smart contract exploits, oracle failures, bridge hacks, and rug pulls. Here\'s what you need to know and how Tonsurance helps.',
    date: '2025-10-01',
    author: 'Tonny',
    category: 'Education',
    readTime: '10 min read',
  },
];

export default function Blog() {
  return (
    <Layout>
      <SEO
        title="Blog | Tonsurance - DeFi Risk Coverage Insights"
        description="Learn about parametric insurance, DeFi risk protection, multi-chain coverage, and the latest updates from Tonsurance. Educational guides and product announcements."
      />

      <Section className="pt-20 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-5xl font-heading font-bold text-text-primary mb-6">
            Tonsurance Blog
          </h1>
          <p className="text-xl text-text-secondary max-w-3xl mx-auto mb-8">
            Insights on parametric coverage, DeFi risk protection, and product updates from Tonny and the team.
          </p>
        </motion.div>
      </Section>

      <Section className="bg-cream-300">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.map((post, index) => (
              <BlogPostCard key={post.slug} post={post} index={index} />
            ))}
          </div>
        </div>
      </Section>

      <Section className="text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="bg-copper-500 text-white rounded-2xl p-12 max-w-3xl mx-auto">
            <h2 className="text-4xl font-heading font-bold mb-6">
              Want to Learn More?
            </h2>
            <p className="text-xl mb-8 text-cream-200">
              Chat with Tonny on Telegram for personalized coverage recommendations and answers to your questions!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="https://t.me/TonsuranceBot"
                className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium rounded-lg transition-all duration-200 bg-cream-300 hover:bg-cream-400 text-text-primary border-2 border-cream-400 shadow-sm hover:shadow-md font-semibold"
              >
                Chat with Tonny
              </a>
            </div>
          </div>
        </motion.div>
      </Section>
    </Layout>
  );
}

function BlogPostCard({ post, index }: { post: BlogPost; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
    >
      <Link href={`/blog/${post.slug}`}>
        <Card className="h-full flex flex-col hover:shadow-xl transition-shadow duration-300">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-copper-500 text-white">
                {post.category}
              </span>
              <span className="text-xs text-text-secondary">{post.readTime}</span>
            </div>

            <h3 className="text-xl font-heading font-bold text-text-primary mb-3 line-clamp-2">
              {post.title}
            </h3>

            <p className="text-text-secondary text-sm mb-4 line-clamp-3">
              {post.excerpt}
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-cream-400">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤖</span>
              <span className="text-sm font-medium text-text-primary">{post.author}</span>
            </div>
            <span className="text-xs text-text-secondary">
              {new Date(post.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </span>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}
