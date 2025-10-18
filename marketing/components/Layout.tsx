'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from './Button';
import { FloatingTonnyChat } from './FloatingTonnyChat';
import { TonnyCharacter } from './TonnyCharacter';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-cream-200">
      <a href="#main-content" className="skip-to-main">
        Skip to main content
      </a>
      <Header />
      <main id="main-content">{children}</main>
      <Footer />
      <FloatingTonnyChat />
    </div>
  );
}

function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-cream-200/95 backdrop-blur-sm border-b border-cream-400" role="banner">
      <nav className="container mx-auto px-6 py-4" role="navigation" aria-label="Main navigation">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <span className="text-xl font-heading font-bold text-text-primary">
              Tonsurance
            </span>
          </Link>

          <div className="hidden md:flex items-center space-x-8">
            <NavLink href="/how-it-works">How It Works</NavLink>
            <NavLink href="/coverage">Coverage</NavLink>
            <NavLink href="/investors">Investors</NavLink>
            <NavLink href="/partners">Partners</NavLink>
            <NavLink href="/about">About</NavLink>
            <NavLink href="/blog">Blog</NavLink>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            <Button variant="outline-dark" size="sm" href="https://t.me/TonsuranceBot">
              Chat with Tonny
            </Button>
            <Button variant="primary" size="sm" href="https://t.me/TonsuranceBot/tonsurance">
              Launch App
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 text-text-primary hover:text-copper-500 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle mobile menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg
              className="w-6 h-6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4 space-y-4">
            <MobileNavLink href="/how-it-works" onClick={() => setMobileMenuOpen(false)}>
              How It Works
            </MobileNavLink>
            <MobileNavLink href="/coverage" onClick={() => setMobileMenuOpen(false)}>
              Coverage
            </MobileNavLink>
            <MobileNavLink href="/investors" onClick={() => setMobileMenuOpen(false)}>
              Investors
            </MobileNavLink>
            <MobileNavLink href="/partners" onClick={() => setMobileMenuOpen(false)}>
              Partners
            </MobileNavLink>
            <MobileNavLink href="/about" onClick={() => setMobileMenuOpen(false)}>
              About
            </MobileNavLink>
            <MobileNavLink href="/blog" onClick={() => setMobileMenuOpen(false)}>
              Blog
            </MobileNavLink>
            <div className="pt-4 space-y-3">
              <Button
                variant="outline-dark"
                size="sm"
                href="https://t.me/TonsuranceBot"
                className="w-full"
              >
                Chat with Tonny
              </Button>
              <Button
                variant="primary"
                size="sm"
                href="https://t.me/TonsuranceBot/tonsurance"
                className="w-full"
              >
                Launch App
              </Button>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-text-secondary hover:text-copper-500 transition-colors duration-200 font-medium"
    >
      {children}
    </Link>
  );
}

function MobileNavLink({
  href,
  children,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block py-2 text-text-primary hover:text-copper-500 transition-colors duration-200 font-medium border-b border-cream-400"
    >
      {children}
    </Link>
  );
}

function Footer() {
  return (
    <footer className="bg-cream-300 border-t border-cream-400 mt-24" role="contentinfo">
      <div className="container mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="mb-4">
              <span className="text-xl font-heading font-bold text-text-primary">
                Tonsurance
              </span>
            </div>
            <p className="text-text-secondary text-sm">
              Parametric risk coverage on TON blockchain. Automated payouts in minutes.
            </p>
          </div>

          <div>
            <h4 className="font-heading font-bold text-text-primary mb-4">Product</h4>
            <FooterLinks
              links={[
                { href: '/how-it-works', label: 'How It Works' },
                { href: '/coverage', label: 'Coverage Types' },
                { href: '/partners', label: 'Partners' },
                { href: 'https://t.me/TonsuranceBot/tonsurance', label: 'Launch App' },
              ]}
            />
          </div>

          <div>
            <h4 className="font-heading font-bold text-text-primary mb-4">Resources</h4>
            <FooterLinks
              links={[
                { href: '/blog', label: 'Blog' },
                { href: '/about', label: 'About' },
                { href: '/legal', label: 'Terms of Service' },
                { href: '/legal#privacy', label: 'Privacy Policy' },
              ]}
            />
          </div>

          <div>
            <h4 className="font-heading font-bold text-text-primary mb-4">Community</h4>
            <FooterLinks
              links={[
                { href: 'https://t.me/TonsuranceBot', label: 'Telegram Bot' },
                { href: 'https://t.me/TonsuranceCommunity', label: 'Telegram Channel' },
                { href: 'https://twitter.com/tonsurance', label: 'Twitter' },
              ]}
            />
          </div>
        </div>

        <div className="border-t border-cream-400 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-text-secondary text-sm">
            © 2025 Tonsurance. All rights reserved.
          </p>
          <div className="flex items-center space-x-4 mt-4 md:mt-0">
            <span className="text-sm text-text-secondary">Built on</span>
            <span className="text-ton-blue font-heading font-bold">TON</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({ links }: { links: { href: string; label: string }[] }) {
  return (
    <ul className="space-y-2">
      {links.map((link) => (
        <li key={link.href}>
          <Link
            href={link.href}
            className="text-text-secondary hover:text-copper-500 transition-colors duration-200 text-sm"
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
}

export function Section({ children, className = '', id }: SectionProps) {
  return (
    <section id={id} className={`py-16 md:py-24 ${className}`}>
      <div className="container mx-auto px-6">{children}</div>
    </section>
  );
}

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function Container({ children, className = '' }: ContainerProps) {
  return <div className={`container mx-auto px-6 ${className}`}>{children}</div>;
}
