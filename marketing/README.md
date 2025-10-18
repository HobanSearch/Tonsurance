# Tonsurance Marketing Website

Marketing website for Tonsurance - Parametric risk coverage on TON blockchain.

## Overview

Public-facing marketing website built with Next.js 15 and deployed on Cloudflare Pages. Features:

- **Tonny's Voice**: Copy aligned with Tonny's personality from the bot
- **Brand Consistency**: Matching color scheme with mini-app (cream #F7F3ED, copper #D87665)
- **Responsive Design**: Mobile-first with Tailwind CSS, mobile menu navigation
- **SEO Optimized**: Page-specific metadata, Open Graph, sitemap, robots.txt
- **Accessibility**: ARIA labels, skip links, focus states, semantic HTML
- **Smooth UX**: Smooth scroll, reusable components (FAQ, SEO)

## Tech Stack

- Next.js 15 (App Router), Tailwind CSS, Framer Motion
- Deployed on Cloudflare Pages
- Fonts: Space Grotesk + Inter (Google Fonts)

## Local Development

```bash
npm install
npm run dev    # Development server at localhost:3000
npm run build  # Production build
```

## Deployment to Cloudflare Pages

1. Connect GitHub repository to Cloudflare Pages
2. Configure build settings:
   - Framework: Next.js
   - Build command: `npm run build`
   - Build output: `.next`
3. Add custom domain: `tonsurance.com`
4. Deploy automatically on commits to `main`

## Structure

```
marketing/
├── app/
│   ├── page.tsx          # Landing page
│   ├── layout.tsx        # Root metadata & SEO
│   ├── globals.css       # Theme, accessibility styles
│   ├── how-it-works/     # Process explanation
│   ├── coverage/         # Coverage options
│   ├── developers/       # API docs
│   ├── about/            # Mission & team
│   ├── legal/            # Terms, Privacy, Risk
│   ├── not-found.tsx     # Custom 404
│   ├── sitemap.ts
│   └── robots.ts
├── components/
│   ├── Button.tsx        # Interactive button
│   ├── Card.tsx          # Card variants
│   ├── Layout.tsx        # Header (mobile menu), Footer
│   ├── FAQ.tsx           # Reusable FAQ component
│   └── SEO.tsx           # Dynamic meta tags
└── public/               # Assets (see ASSETS.md)
```

## Pages Status

All pages complete and production-ready:

- ✅ **Landing Page** (`/`) - Hero, stats, how it works, coverage cards, CTA
- ✅ **How It Works** (`/how-it-works`) - Detailed process, comparison, triggers, FAQ
- ✅ **Coverage** (`/coverage`) - Coverage types, parameters, pricing, important info
- ✅ **Developers** (`/developers`) - Quick start, contracts, integration examples
- ✅ **About** (`/about`) - Mission, why parametric, Tonny intro, security
- ✅ **Legal** (`/legal`) - Terms of Service, Privacy Policy, Risk Disclosure
- ✅ **404 Page** (`/not-found`) - Custom error page with Tonny

**Build Status**: ✅ Production build successful (12 routes, ~160-162KB bundle)

## Recent Improvements (Round 2)

Latest enhancements for better UX and accessibility:

- ✅ **Page-specific SEO**: Dynamic meta tags via SEO component for all pages
- ✅ **Mobile Navigation**: Responsive hamburger menu with smooth animations
- ✅ **Accessibility**: ARIA labels, skip-to-main link, focus states, semantic HTML
- ✅ **Smooth Scroll**: CSS scroll-behavior for anchor link navigation
- ✅ **Reusable FAQ**: Extracted FAQ component for code organization
- ✅ **Focus Styles**: Copper-colored focus rings for keyboard navigation

## Recent Improvements (Round 3)

Animation and interaction enhancements:

- ✅ **Enhanced Card Animations**: Spring-based hover effects with lift and scale
- ✅ **Animated Icons**: Icons in cards rotate/scale on hover for playful interaction
- ✅ **Stagger Animations**: Coverage card features fade in sequentially
- ✅ **Stat Card Animations**: Icons gently wiggle, values scale in on view
- ✅ **Complete SEO Coverage**: All pages now have custom meta tags
- ✅ **Performance Optimizations**: Optimized animation transitions with spring physics

## Tonny's Voice Guidelines

✅ Use "parametric risk coverage" (not "insurance")
✅ Be helpful: "Let me help!", "Great question!"
✅ Use emojis sparingly: 🤖💎⚡
❌ Don't say "AI-powered" or mention Tonny is AI
❌ Avoid insurance jargon: "underwriting", "claims"
