# Telegram Mini App Guide

**Complete guide to deploying Tonsurance as a Telegram Mini App**

**Last Updated:** October 15, 2025
**Version:** 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Setup Steps](#setup-steps)
4. [Mini App Configuration](#mini-app-configuration)
5. [TON Connect Integration](#ton-connect-integration)
6. [Telegram Features](#telegram-features)
7. [Testing](#testing)
8. [Production Deployment](#production-deployment)
9. [Troubleshooting](#troubleshooting)

---

## 1. Overview

### What are Telegram Mini Apps?

Telegram Mini Apps (TWAs - Telegram Web Apps) are web applications that run inside Telegram with deep platform integration. They provide:

- **Native wallet integration** with Tonkeeper, TonSpace, and TON Wallet
- **Seamless authentication** using Telegram user data
- **Push notifications** via Telegram bot
- **In-app payments** with TON cryptocurrency
- **Social features** like sharing and invite links
- **Cross-platform** support (iOS, Android, Desktop, Web)

### Why Tonsurance on Telegram?

1. **700M+ users** with built-in TON wallet support
2. **Instant onboarding** - no app installation required
3. **Native payment rails** - TON integrated into Telegram
4. **Viral distribution** - share policies with friends
5. **Push notifications** - claim alerts, policy expirations

### Architecture

```
┌───────────────────────────────────────────────────┐
│             Telegram Client (iOS/Android)         │
│  ┌─────────────────────────────────────────────┐  │
│  │         Tonsurance Mini App (WebView)       │  │
│  │  ┌───────────────────────────────────────┐  │  │
│  │  │   React Frontend (Vite build)         │  │  │
│  │  │   https://app.tonsurance.io           │  │  │
│  │  └──────────┬────────────────────────────┘  │  │
│  └─────────────┼────────────────────────────────┘  │
│                │                                    │
│      ┌─────────┼─────────────┐                     │
│      │ Telegram Web App API  │                     │
│      │ - initData (user auth)│                     │
│      │ - MainButton control  │                     │
│      │ - BackButton control  │                     │
│      │ - HapticFeedback      │                     │
│      └─────────┼─────────────┘                     │
└────────────────┼───────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────┐
│          TON Connect (Wallet Bridge)             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │ Tonkeeper  │  │  TonSpace  │  │ TON Wallet │ │
│  └────────────┘  └────────────┘  └────────────┘ │
└──────────────────┼───────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│              TON Blockchain                      │
│       (Smart Contracts + Transactions)           │
└──────────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────┐
│          Tonsurance Backend (OCaml)              │
│   API Server + WebSocket + Oracle Keepers        │
└──────────────────────────────────────────────────┘
```

---

## 2. Prerequisites

### Required Accounts

1. **Telegram Account**
   - Active Telegram account
   - Admin access to create bots

2. **TON Wallet**
   - Tonkeeper or TonSpace installed
   - Testnet TON for deployment (get from @testgiver_ton_bot)
   - Mainnet TON for production

3. **Domain & SSL Certificate**
   - Mini Apps REQUIRE HTTPS
   - Domain name (e.g., `app.tonsurance.io`)
   - SSL certificate (Let's Encrypt recommended)

4. **Hosting**
   - Web server with Node.js support
   - CDN for static assets (Cloudflare, AWS CloudFront)
   - Or use Vercel/Netlify (easiest option)

### Required Tools

```bash
# Install Telegram Bot API tools
npm install -g telegraf

# Install Node.js 18+
node --version  # Should be 18+

# Install Vite (frontend build tool)
npm install -g vite
```

---

## 3. Setup Steps

### Step 1: Create Telegram Bot

1. **Open BotFather**
   - Open Telegram
   - Search for `@BotFather`
   - Start chat with `/start`

2. **Create Bot**
   ```
   /newbot
   Bot Name: Tonsurance
   Bot Username: TonsuranceBot  # Must end with 'bot'
   ```

3. **Save Bot Token**
   ```
   BotFather will reply with:

   Done! Congratulations on your new bot.
   Token: 1234567890:ABCdefGHIjklMNOpqrsTUVwxyz

   Copy this token to .env as TELEGRAM_BOT_TOKEN
   ```

4. **Set Bot Commands**
   ```
   /setcommands
   Select: @TonsuranceBot

   Paste commands:
   start - Launch Tonsurance Mini App
   policies - View active policies
   vault - Check vault balance
   claim - File insurance claim
   help - Get help
   ```

5. **Set Bot Description**
   ```
   /setdescription
   Select: @TonsuranceBot

   Paste:
   Tonsurance - Decentralized insurance for stablecoins.
   Protect your USDC, USDT, DAI across 8 blockchains.
   Powered by TON blockchain.
   ```

6. **Set Bot Picture**
   ```
   /setuserpic
   Select: @TonsuranceBot
   Upload: TonnyEnvelope.png (from repository)
   ```

### Step 2: Register Mini App

1. **Create Web App**
   ```
   /newapp
   Select: @TonsuranceBot

   Title: Tonsurance
   Short name: tonsurance  # Must be unique, lowercase, no spaces
   Description: Cross-chain stablecoin insurance
   Photo: Upload TonnyEnvelope.png
   GIF: (optional) Upload demo.gif
   ```

2. **Set Web App URL**
   ```
   # For testing (local development)
   URL: https://example.com  # Placeholder (HTTPS required)

   # After deployment
   /editapp
   Select: @TonsuranceBot → Tonsurance
   Change URL → https://app.tonsurance.io
   ```

3. **Note: Mini App URL**
   ```
   BotFather will reply with:

   https://t.me/TonsuranceBot/tonsurance

   This is your Mini App launch URL!
   Users click this to open the app.
   ```

### Step 3: Build Frontend for Production

**Configure environment:**
```bash
cd frontend

# Create production .env
cat > .env.production << 'EOF'
# Backend API (production)
VITE_BACKEND_API_URL=https://api.tonsurance.io
VITE_BACKEND_WS_URL=wss://api.tonsurance.io/ws

# TON Network
VITE_TON_NETWORK=mainnet  # Or testnet for testing

# Contract addresses (mainnet)
VITE_POLICY_FACTORY_ADDRESS=EQC...
VITE_MULTI_TRANCHE_VAULT_ADDRESS=EQD...
VITE_PRICING_ORACLE_ADDRESS=EQE...
VITE_POLICY_ROUTER_ADDRESS=EQF...

# Telegram Mini App
VITE_TELEGRAM_BOT_NAME=TonsuranceBot
VITE_IS_TELEGRAM_MINI_APP=true
EOF
```

**Build production bundle:**
```bash
cd frontend

# Install dependencies
npm install

# Build for production
npm run build

# Output will be in frontend/dist/
# This folder contains:
# - index.html
# - assets/ (JS, CSS, images)
# - vite.svg, etc.
```

**Optimize for Mini Apps:**
```typescript
// frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [react(), nodePolyfills()],

  // Optimize for Telegram WebView
  build: {
    target: 'es2020', // Modern browsers
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'ton': ['@ton/core', '@ton/ton', '@tonconnect/ui-react'],
          'charts': ['recharts'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // 1MB chunks
  },

  // Add base URL if deploying to subdirectory
  base: '/',
});
```

### Step 4: Deploy Frontend

#### Option A: Vercel (Easiest)

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
cd frontend
vercel --prod

# Vercel will output:
# ✅ Production: https://tonsurance.vercel.app

# Configure custom domain
vercel domains add app.tonsurance.io
# Follow DNS instructions
```

**vercel.json:**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Frame-Options",
          "value": "ALLOW-FROM https://web.telegram.org"
        },
        {
          "key": "Content-Security-Policy",
          "value": "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org"
        }
      ]
    }
  ]
}
```

#### Option B: Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
cd frontend
netlify deploy --prod

# Follow prompts:
# Build command: npm run build
# Publish directory: dist

# Configure custom domain in Netlify dashboard
```

**netlify.toml:**
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "ALLOW-FROM https://web.telegram.org"
    Content-Security-Policy = "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org"
```

#### Option C: Custom Server (Nginx)

**1. Build frontend:**
```bash
cd frontend
npm run build
# Output: frontend/dist/
```

**2. Transfer to server:**
```bash
# Using SCP
scp -r dist/* user@server:/var/www/tonsurance/

# Or using rsync
rsync -avz dist/ user@server:/var/www/tonsurance/
```

**3. Configure Nginx:**
```nginx
# /etc/nginx/sites-available/tonsurance
server {
    listen 443 ssl http2;
    server_name app.tonsurance.io;

    # SSL certificates (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/app.tonsurance.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.tonsurance.io/privkey.pem;

    # Security headers for Telegram Mini Apps
    add_header X-Frame-Options "ALLOW-FROM https://web.telegram.org" always;
    add_header Content-Security-Policy "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Root directory
    root /var/www/tonsurance;
    index index.html;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA routing - redirect all to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket proxy
    location /ws {
        proxy_pass http://localhost:8081;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name app.tonsurance.io;
    return 301 https://$server_name$request_uri;
}
```

**4. Enable site and reload Nginx:**
```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/tonsurance /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Obtain SSL certificate (if not already)
sudo certbot --nginx -d app.tonsurance.io
```

### Step 5: Update Mini App URL

```
1. Open BotFather in Telegram
2. /editapp
3. Select: @TonsuranceBot → Tonsurance
4. Change URL
5. Enter: https://app.tonsurance.io
6. Done!

Your Mini App is now live at:
https://t.me/TonsuranceBot/tonsurance
```

---

## 4. Mini App Configuration

### Integrate Telegram Web App SDK

**Install SDK:**
```bash
cd frontend
npm install @twa-dev/sdk
```

**Create Telegram provider:**
```typescript
// frontend/src/contexts/TelegramContext.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import WebApp from '@twa-dev/sdk';

interface TelegramContextType {
  user: any;
  initData: string;
  initDataUnsafe: any;
  themeParams: any;
  platform: string;
  isReady: boolean;
  showMainButton: (text: string, onClick: () => void) => void;
  hideMainButton: () => void;
  showBackButton: (onClick: () => void) => void;
  hideBackButton: () => void;
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
  hapticFeedback: (type: 'impact' | 'notification' | 'selection') => void;
  close: () => void;
}

const TelegramContext = createContext<TelegramContextType | null>(null);

export const TelegramProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Initialize Telegram Web App
    WebApp.ready();
    WebApp.expand(); // Expand to full height

    // Set viewport to prevent zoom
    WebApp.setHeaderColor('#1a1a2e');
    WebApp.setBackgroundColor('#1a1a2e');

    setIsReady(true);

    // Log user data for debugging
    console.log('[Telegram] User:', WebApp.initDataUnsafe?.user);
    console.log('[Telegram] Platform:', WebApp.platform);
    console.log('[Telegram] Version:', WebApp.version);
  }, []);

  const showMainButton = (text: string, onClick: () => void) => {
    WebApp.MainButton.setText(text);
    WebApp.MainButton.show();
    WebApp.MainButton.onClick(onClick);
  };

  const hideMainButton = () => {
    WebApp.MainButton.hide();
  };

  const showBackButton = (onClick: () => void) => {
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(onClick);
  };

  const hideBackButton = () => {
    WebApp.BackButton.hide();
  };

  const showAlert = (message: string): Promise<void> => {
    return new Promise((resolve) => {
      WebApp.showAlert(message, () => resolve());
    });
  };

  const showConfirm = (message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      WebApp.showConfirm(message, (confirmed) => resolve(confirmed));
    });
  };

  const hapticFeedback = (type: 'impact' | 'notification' | 'selection') => {
    if (type === 'impact') {
      WebApp.HapticFeedback.impactOccurred('medium');
    } else if (type === 'notification') {
      WebApp.HapticFeedback.notificationOccurred('success');
    } else {
      WebApp.HapticFeedback.selectionChanged();
    }
  };

  const close = () => {
    WebApp.close();
  };

  const value: TelegramContextType = {
    user: WebApp.initDataUnsafe?.user,
    initData: WebApp.initData,
    initDataUnsafe: WebApp.initDataUnsafe,
    themeParams: WebApp.themeParams,
    platform: WebApp.platform,
    isReady,
    showMainButton,
    hideMainButton,
    showBackButton,
    hideBackButton,
    showAlert,
    showConfirm,
    hapticFeedback,
    close,
  };

  return (
    <TelegramContext.Provider value={value}>
      {children}
    </TelegramContext.Provider>
  );
};

export const useTelegram = () => {
  const context = useContext(TelegramContext);
  if (!context) {
    throw new Error('useTelegram must be used within TelegramProvider');
  }
  return context;
};
```

**Wrap App with provider:**
```typescript
// frontend/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { TelegramProvider } from './contexts/TelegramContext';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TelegramProvider>
      <TonConnectUIProvider manifestUrl="https://app.tonsurance.io/tonconnect-manifest.json">
        <App />
      </TonConnectUIProvider>
    </TelegramProvider>
  </React.StrictMode>
);
```

### Use Telegram Features in Components

**Example: Policy Purchase with Telegram UI**
```typescript
// frontend/src/pages/PolicyPurchase.tsx
import { useTelegram } from '../contexts/TelegramContext';

export const PolicyPurchase = () => {
  const telegram = useTelegram();
  const [premium, setPremium] = useState(0);

  useEffect(() => {
    // Show "Purchase Policy" button at bottom
    telegram.showMainButton('Purchase Policy', handlePurchase);

    // Show back button
    telegram.showBackButton(() => {
      navigate('/');
    });

    // Cleanup
    return () => {
      telegram.hideMainButton();
      telegram.hideBackButton();
    };
  }, [premium]);

  const handlePurchase = async () => {
    // Haptic feedback
    telegram.hapticFeedback('impact');

    // Confirm purchase
    const confirmed = await telegram.showConfirm(
      `Purchase policy for $${premium.toFixed(2)}?`
    );

    if (confirmed) {
      try {
        // Call contract
        await createPolicy();

        // Success feedback
        telegram.hapticFeedback('notification');
        await telegram.showAlert('Policy purchased successfully!');

        // Navigate to dashboard
        navigate('/policies');
      } catch (error) {
        await telegram.showAlert(`Error: ${error.message}`);
      }
    }
  };

  return (
    <div style={{
      backgroundColor: telegram.themeParams.bg_color,
      color: telegram.themeParams.text_color,
    }}>
      {/* Your component UI */}
    </div>
  );
};
```

---

## 5. TON Connect Integration

### Configure TON Connect for Telegram

**Create manifest file:**
```json
// frontend/public/tonconnect-manifest.json
{
  "url": "https://app.tonsurance.io",
  "name": "Tonsurance",
  "iconUrl": "https://app.tonsurance.io/icon-512.png",
  "termsOfUseUrl": "https://tonsurance.io/terms",
  "privacyPolicyUrl": "https://tonsurance.io/privacy"
}
```

**Optimize wallet connection:**
```typescript
// frontend/src/hooks/useContracts.ts
import { useTonConnectUI, useTonAddress } from '@tonconnect/ui-react';
import { useTelegram } from '../contexts/TelegramContext';

export const useContracts = () => {
  const [tonConnectUI] = useTonConnectUI();
  const userAddress = useTonAddress();
  const telegram = useTelegram();

  const connectWallet = async () => {
    try {
      // Show loading in Telegram MainButton
      telegram.showMainButton('Connecting...', () => {});

      await tonConnectUI.connectWallet();

      // Success feedback
      telegram.hapticFeedback('notification');
      telegram.hideMainButton();

    } catch (error) {
      telegram.showAlert('Failed to connect wallet');
    }
  };

  return { connectWallet, userAddress, /* ... */ };
};
```

### Wallet Recommendations

For Telegram Mini Apps, prioritize these wallets:

1. **Tonkeeper** (Most popular, 5M+ users)
2. **TonSpace** (Built by Telegram, seamless integration)
3. **TON Wallet** (Telegram's official wallet bot)

---

## 6. Telegram Features

### Push Notifications via Bot

**Setup notification bot:**
```typescript
// backend/services/telegram_bot.ts
import { Telegraf } from 'telegraf';

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

// Store user chat IDs in database
bot.command('start', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  // Save to database
  await db.query(
    'INSERT INTO telegram_users (user_id, chat_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [userId, chatId]
  );

  ctx.reply('Welcome to Tonsurance! You will receive notifications about your policies.');
});

// Send notification
export async function sendPolicyNotification(userId: number, message: string) {
  const result = await db.query(
    'SELECT chat_id FROM telegram_users WHERE user_id = $1',
    [userId]
  );

  if (result.rows.length > 0) {
    const chatId = result.rows[0].chat_id;
    await bot.telegram.sendMessage(chatId, message);
  }
}

// Example: Claim approved notification
export async function notifyClaimApproved(userId: number, policyId: string, amount: number) {
  const message = `
✅ **Claim Approved**

Policy ID: ${policyId}
Payout: $${amount.toLocaleString()}

Your funds will arrive within 5 seconds.

[View Policy](https://t.me/TonsuranceBot/tonsurance?startapp=policy_${policyId})
  `;

  await sendPolicyNotification(userId, message);
}

bot.launch();
```

### Share Functionality

```typescript
// frontend/src/components/SharePolicy.tsx
import { useTelegram } from '../contexts/TelegramContext';

export const SharePolicy = ({ policyId }: { policyId: string }) => {
  const telegram = useTelegram();

  const sharePolicy = () => {
    const shareUrl = `https://t.me/share/url?url=https://t.me/TonsuranceBot/tonsurance?startapp=policy_${policyId}&text=Check%20out%20my%20Tonsurance%20policy!`;

    telegram.close(); // Close Mini App
    window.open(shareUrl, '_blank'); // Opens Telegram share dialog
  };

  return (
    <button onClick={sharePolicy}>
      Share Policy with Friends
    </button>
  );
};
```

### Referral System

```typescript
// frontend/src/App.tsx
import { useEffect } from 'react';
import { useTelegram } from './contexts/TelegramContext';

export const App = () => {
  const telegram = useTelegram();

  useEffect(() => {
    // Parse start parameter for referrals
    const startParam = telegram.initDataUnsafe?.start_param;

    if (startParam?.startsWith('ref_')) {
      const referrerId = startParam.replace('ref_', '');
      console.log('Referred by:', referrerId);

      // Save referral to backend
      fetch('/api/v2/referral/track', {
        method: 'POST',
        body: JSON.stringify({
          referrer_id: referrerId,
          referee_id: telegram.user.id,
        }),
      });
    }
  }, [telegram.initDataUnsafe]);

  return <div>...</div>;
};

// Generate referral link
const generateReferralLink = (userId: number) => {
  return `https://t.me/TonsuranceBot/tonsurance?startapp=ref_${userId}`;
};
```

---

## 7. Testing

### Test in Telegram Desktop

1. Open Telegram Desktop
2. Navigate to: `https://t.me/TonsuranceBot/tonsurance`
3. Click "Launch" button
4. Mini App opens in Telegram

### Test in Mobile (iOS/Android)

1. Open Telegram app
2. Search for `@TonsuranceBot`
3. Tap "Start" or send `/start`
4. Tap "Launch Tonsurance" menu button
5. Mini App opens full screen

### Test Locally (Development)

**Use ngrok for HTTPS tunnel:**
```bash
# Install ngrok
brew install ngrok

# Start local frontend
cd frontend
npm run dev
# Running on http://localhost:5173

# Create HTTPS tunnel
ngrok http 5173

# ngrok will output:
# Forwarding: https://abc123.ngrok.io -> http://localhost:5173

# Update Mini App URL in BotFather
/editapp
Select: @TonsuranceBot → Tonsurance
Change URL → https://abc123.ngrok.io

# Now test in Telegram
# https://t.me/TonsuranceBot/tonsurance
```

### Debug Tools

**Telegram Web App Debugger:**
```typescript
// Add to frontend/src/main.tsx
if (import.meta.env.DEV) {
  // Enable Telegram WebApp debug mode
  (window as any).Telegram = (window as any).Telegram || {};
  (window as any).Telegram.WebApp = (window as any).Telegram.WebApp || {};
  (window as any).Telegram.WebApp.isVersionAtLeast = () => true;

  console.log('[Telegram Debug]', {
    initData: (window as any).Telegram?.WebApp?.initData,
    user: (window as any).Telegram?.WebApp?.initDataUnsafe?.user,
    platform: (window as any).Telegram?.WebApp?.platform,
  });
}
```

**Chrome DevTools for Telegram WebView:**
1. Open Telegram Desktop
2. Right-click in Mini App → "Inspect Element"
3. DevTools opens (same as Chrome)

---

## 8. Production Deployment

### Pre-Launch Checklist

- [ ] HTTPS enabled (required)
- [ ] Domain configured and SSL valid
- [ ] Frontend built and deployed
- [ ] Backend API accessible
- [ ] Smart contracts deployed to mainnet
- [ ] TON Connect manifest published
- [ ] Bot commands configured
- [ ] Bot description and picture set
- [ ] Mini App URL updated in BotFather
- [ ] Tested on iOS, Android, Desktop
- [ ] Push notifications working
- [ ] Analytics integrated (Google Analytics, Mixpanel)
- [ ] Error tracking enabled (Sentry)

### Performance Optimization

**1. Enable caching:**
```nginx
# Nginx config
location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

**2. Compress assets:**
```bash
# In frontend build
npm run build

# Gzip all static files
cd dist
find . -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) -exec gzip -9 -k {} \;
```

**3. Use CDN:**
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'js/[name]-[hash].js',
        entryFileNames: 'js/[name]-[hash].js',
      },
    },
  },
});

// Upload dist/ to CDN (e.g., Cloudflare R2, AWS S3)
// Update Mini App URL to CDN: https://cdn.tonsurance.io
```

### Monitoring

**Setup analytics:**
```typescript
// frontend/src/utils/analytics.ts
export const trackEvent = (event: string, params?: any) => {
  // Google Analytics
  if (window.gtag) {
    window.gtag('event', event, params);
  }

  // Telegram Analytics
  if (window.Telegram?.WebApp) {
    // Telegram doesn't have built-in analytics yet
    // Send to your backend
    fetch('/api/v2/analytics/track', {
      method: 'POST',
      body: JSON.stringify({ event, params }),
    });
  }
};

// Usage
trackEvent('policy_purchased', {
  coverage_type: 'Depeg',
  amount: 10000,
  premium: 218.43,
});
```

---

## 9. Troubleshooting

### Mini App Not Loading

**Symptoms:**
- Blank screen in Telegram
- "Page not found" error

**Solutions:**
```
1. Verify HTTPS is enabled
   - Mini Apps REQUIRE HTTPS
   - Check certificate: https://www.ssllabs.com/ssltest/

2. Check X-Frame-Options header
   - Must allow Telegram to embed
   - Add header: X-Frame-Options: ALLOW-FROM https://web.telegram.org

3. Verify URL in BotFather
   - /editapp → Change URL
   - Ensure no typos

4. Clear Telegram cache
   - Settings → Data and Storage → Clear Cache
   - Restart Telegram
```

### Wallet Not Connecting

**Symptoms:**
- TON Connect modal not appearing
- "Wallet connection failed" error

**Solutions:**
```typescript
// 1. Verify manifest URL is accessible
fetch('https://app.tonsurance.io/tonconnect-manifest.json')
  .then(res => res.json())
  .then(data => console.log('Manifest:', data))
  .catch(err => console.error('Manifest error:', err));

// 2. Check CORS headers
// Backend must allow Telegram origin:
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://web.telegram.org');
  next();
});

// 3. Use TonSpace (Telegram's native wallet)
// It has better integration with Mini Apps
```

### Telegram WebApp API Not Working

**Symptoms:**
- `window.Telegram` is undefined
- `WebApp.initData` is empty

**Solutions:**
```html
<!-- Ensure Telegram SDK is loaded BEFORE your app -->
<!-- Add to frontend/index.html -->
<head>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <!-- Your app scripts -->
</head>

<!-- Or install package -->
npm install @twa-dev/sdk

<!-- Check in console -->
<script>
  console.log('Telegram WebApp:', window.Telegram?.WebApp);
  console.log('User:', window.Telegram?.WebApp?.initDataUnsafe?.user);
</script>
```

### Push Notifications Not Sending

**Symptoms:**
- Bot doesn't send messages
- "Chat not found" error

**Solutions:**
```typescript
// 1. User must start bot first
// Add prompt in Mini App:
const startBot = () => {
  window.open('https://t.me/TonsuranceBot?start', '_blank');
};

// 2. Verify bot token
console.log('Bot token:', process.env.TELEGRAM_BOT_TOKEN);

// 3. Check user chat ID is saved
const chatId = await db.query(
  'SELECT chat_id FROM telegram_users WHERE user_id = $1',
  [userId]
);
console.log('Chat ID:', chatId);

// 4. Test notification manually
curl -X POST https://api.telegram.org/bot<TOKEN>/sendMessage \
  -H "Content-Type: application/json" \
  -d '{"chat_id": 123456789, "text": "Test notification"}'
```

### Performance Issues

**Symptoms:**
- Slow loading in Telegram
- High bundle size warnings

**Solutions:**
```bash
# 1. Analyze bundle size
cd frontend
npm run build
npx vite-bundle-visualizer

# 2. Lazy load routes
# frontend/src/App.tsx
const PolicyPurchase = lazy(() => import('./pages/PolicyPurchase'));

# 3. Reduce bundle size
# Remove unused dependencies
npm uninstall <package>

# 4. Enable compression
# Add to vite.config.ts
build: {
  minify: 'terser',
  terserOptions: {
    compress: {
      drop_console: true,
    },
  },
}
```

---

**End of Telegram Mini App Guide**

For local development setup, see [LOCAL_DEVELOPMENT.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/LOCAL_DEVELOPMENT.md).

For frontend-contract integration, see [FRONTEND_INTEGRATION.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/FRONTEND_INTEGRATION.md).

For API reference, see [API_REFERENCE.md](/Users/ben/Documents/Work/HS/Application/Tonsurance/API_REFERENCE.md).
