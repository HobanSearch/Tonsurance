# Tonsurance

Cross-chain stablecoin insurance protocol on TON blockchain with OCaml-powered oracle aggregation.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TON](https://img.shields.io/badge/TON-Blockchain-blue)](https://ton.org)

## Overview

Tonsurance provides **decentralized insurance for stablecoins** across 8 blockchains with real-time bridge health monitoring and dynamic risk-adjusted pricing.

### Key Features

- 🌐 **Multi-Chain Support**: Ethereum, Arbitrum, Base, Polygon, Bitcoin, Lightning, TON, Solana
- 💵 **14 Stablecoins**: USDC, USDT, USDe, sUSDe, USDY, PYUSD, GHO, LUSD, crvUSD, mkUSD, DAI, FRAX, USDP, BUSD
- 🌉 **Bridge Monitoring**: Real-time health scores for Wormhole, Axelar, LayerZero, Stargate
- 📊 **Oracle Aggregation**: RedStone (40%), Pyth (35%), Chainlink (25%)
- 🏢 **Enterprise Ready**: Bulk employee protection with up to 20% volume discounts

## Quick Start

```bash
# Install dependencies
npm install

# Build all components
npm run build

# Run frontend
npm run dev:frontend

# Run tests
npm test
```

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for production deployment.

## Documentation

- [CLAUDE.md](CLAUDE.md) - AI assistant instructions
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Production guide
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design

## License

MIT License - see LICENSE for details
