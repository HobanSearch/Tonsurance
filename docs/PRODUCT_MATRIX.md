# Product Matrix - 560 Products

**Version**: 1.0
**Last Updated**: 2025-10-15
**Total Products**: 560 (5 coverage types × 9 chains × 14 stablecoins) - ~480 valid combinations

---

## Overview

This document lists all possible insurance products in the Tonsurance 3-dimensional matrix. Products are organized by coverage type, with availability and typical pricing for each chain-stablecoin combination.

**Dimensions:**
- **Coverage Types**: 5 (Depeg, Bridge Exploit, Smart Contract, Oracle Failure, CEX Liquidation)
- **Blockchains**: 9 (Ethereum, Arbitrum, Base, Polygon, Optimism, Bitcoin, Lightning, Solana, TON)
- **Stablecoins**: 14 (USDC, USDT, USDP, DAI, FRAX, BUSD, USDe, sUSDe, USDY, PYUSD, GHO, LUSD, crvUSD, mkUSD)

---

## Coverage Type 1: Depeg Protection (126 products)

**Available on**: All 9 chains × All 14 stablecoins = 126 products

### Top 20 Products by Expected Volume

| Rank | Product | Chain | Coverage Multiplier | Expected Annual Volume |
|------|---------|-------|-------------------|----------------------|
| 1 | USDC Depeg on Ethereum | Ethereum | 1.0x | $50M |
| 2 | USDT Depeg on Ethereum | Ethereum | 1.0x | $40M |
| 3 | USDC Depeg on Arbitrum | Arbitrum | 1.1x | $15M |
| 4 | USDC Depeg on Base | Base | 1.1x | $12M |
| 5 | DAI Depeg on Ethereum | Ethereum | 1.0x | $10M |
| 6 | USDT Depeg on Arbitrum | Arbitrum | 1.1x | $8M |
| 7 | USDC Depeg on Polygon | Polygon | 1.2x | $7M |
| 8 | USDP Depeg on Ethereum | Ethereum | 1.0x | $6M |
| 9 | USDC Depeg on Optimism | Optimism | 1.1x | $5M |
| 10 | FRAX Depeg on Ethereum | Ethereum | 1.0x | $4M |
| 11 | USDT Depeg on Base | Base | 1.1x | $4M |
| 12 | USDe Depeg on Ethereum | Ethereum | 1.0x | $3.5M |
| 13 | PYUSD Depeg on Ethereum | Ethereum | 1.0x | $3M |
| 14 | USDC Depeg on Solana | Solana | 1.4x | $2.5M |
| 15 | DAI Depeg on Arbitrum | Arbitrum | 1.1x | $2M |
| 16 | BUSD Depeg on Ethereum | Ethereum | 1.0x | $1.5M |
| 17 | USDC Depeg on TON | TON | 1.15x | $1.5M |
| 18 | GHO Depeg on Ethereum | Ethereum | 1.0x | $1.2M |
| 19 | LUSD Depeg on Ethereum | Ethereum | 1.0x | $1M |
| 20 | USDT Depeg on Polygon | Polygon | 1.2x | $1M |

### Sample Pricing (Depeg)

**Baseline**: $100,000 coverage, 30 days
- USDC on Ethereum: $328.77
- USDC on Arbitrum: $361.65 (+10%)
- USDC on Polygon: $394.52 (+20%)
- USDC on Solana: $460.27 (+40%)
- USDe on Ethereum: $451.06 (+37% for Tier 3 stablecoin)

---

## Coverage Type 2: Smart Contract Exploits (98 products)

**Available on**: Ethereum, Arbitrum, Base, Polygon, Optimism, Solana, TON (7 chains) × All 14 stablecoins = 98 products

**Not Available on**: Bitcoin, Lightning (no smart contracts)

### Top 15 Products by Expected Volume

| Rank | Product | Chain | Coverage Multiplier | Expected Annual Volume |
|------|---------|-------|-------------------|----------------------|
| 1 | USDC Smart Contract on Ethereum | Ethereum | 1.3x | $25M |
| 2 | USDT Smart Contract on Ethereum | Ethereum | 1.3x | $18M |
| 3 | DAI Smart Contract on Ethereum | Ethereum | 1.3x | $12M |
| 4 | USDC Smart Contract on Arbitrum | Arbitrum | 1.43x | $8M |
| 5 | USDe Smart Contract on Ethereum | Ethereum | 1.3x | $6M |
| 6 | USDC Smart Contract on Base | Base | 1.43x | $5M |
| 7 | USDC Smart Contract on Polygon | Polygon | 1.56x | $4M |
| 8 | FRAX Smart Contract on Ethereum | Ethereum | 1.3x | $3M |
| 9 | GHO Smart Contract on Ethereum | Ethereum | 1.3x | $2.5M |
| 10 | USDT Smart Contract on Arbitrum | Arbitrum | 1.43x | $2M |
| 11 | USDC Smart Contract on Optimism | Optimism | 1.43x | $2M |
| 12 | crvUSD Smart Contract on Ethereum | Ethereum | 1.3x | $1.5M |
| 13 | LUSD Smart Contract on Ethereum | Ethereum | 1.3x | $1.2M |
| 14 | USDC Smart Contract on Solana | Solana | 1.82x | $1M |
| 15 | DAI Smart Contract on Arbitrum | Arbitrum | 1.43x | $800K |

### Sample Pricing (Smart Contract)

**Baseline**: $100,000 coverage, 30 days
- USDC on Ethereum: $427.40 (1.3x base)
- USDC on Arbitrum: $470.14 (1.43x base)
- USDC on Polygon: $512.88 (1.56x base)
- USDe on Ethereum: $586.38 (1.3x + Tier 3 adjustment)

---

## Coverage Type 3: Oracle Failure (98 products)

**Available on**: Ethereum, Arbitrum, Base, Polygon, Optimism, Solana, TON (7 chains) × All 14 stablecoins = 98 products

**Not Available on**: Bitcoin, Lightning (no oracle infrastructure)

### Top 10 Products by Expected Volume

| Rank | Product | Chain | Coverage Multiplier | Expected Annual Volume |
|------|---------|-------|-------------------|----------------------|
| 1 | USDC Oracle on Ethereum | Ethereum | 1.2x | $10M |
| 2 | USDT Oracle on Ethereum | Ethereum | 1.2x | $7M |
| 3 | DAI Oracle on Ethereum | Ethereum | 1.2x | $5M |
| 4 | USDC Oracle on Arbitrum | Arbitrum | 1.32x | $3M |
| 5 | USDC Oracle on Polygon | Polygon | 1.44x | $2M |
| 6 | USDe Oracle on Ethereum | Ethereum | 1.2x | $1.5M |
| 7 | FRAX Oracle on Ethereum | Ethereum | 1.2x | $1.2M |
| 8 | USDC Oracle on Base | Base | 1.32x | $1M |
| 9 | GHO Oracle on Ethereum | Ethereum | 1.2x | $800K |
| 10 | USDT Oracle on Arbitrum | Arbitrum | 1.32x | $600K |

### Sample Pricing (Oracle)

**Baseline**: $100,000 coverage, 30 days
- USDC on Ethereum: $394.52 (1.2x base)
- USDC on Arbitrum: $433.97 (1.32x base)
- USDC on Polygon: $473.43 (1.44x base)

---

## Coverage Type 4: Bridge Exploit (126 products)

**Available on**: All 9 chains × All 14 stablecoins = 126 products

### Top 15 Products by Expected Volume

| Rank | Product | Chain | Coverage Multiplier | Expected Annual Volume |
|------|---------|-------|-------------------|----------------------|
| 1 | USDC Bridge Exploit on Ethereum | Ethereum | 1.5x | $20M |
| 2 | USDT Bridge Exploit on Ethereum | Ethereum | 1.5x | $15M |
| 3 | USDC Bridge Exploit on Arbitrum | Arbitrum | 1.65x | $10M |
| 4 | USDC Bridge Exploit on Polygon | Polygon | 1.8x | $7M |
| 5 | USDC Bridge Exploit on Solana | Solana | 2.1x | $5M |
| 6 | DAI Bridge Exploit on Ethereum | Ethereum | 1.5x | $4M |
| 7 | USDT Bridge Exploit on Arbitrum | Arbitrum | 1.65x | $3.5M |
| 8 | USDC Bridge Exploit on Base | Base | 1.65x | $3M |
| 9 | USDC Bridge Exploit on Optimism | Optimism | 1.65x | $2.5M |
| 10 | USDT Bridge Exploit on Polygon | Polygon | 1.8x | $2M |
| 11 | USDe Bridge Exploit on Ethereum | Ethereum | 1.5x | $1.5M |
| 12 | USDC Bridge Exploit on TON | TON | 1.725x | $1.2M |
| 13 | FRAX Bridge Exploit on Ethereum | Ethereum | 1.5x | $1M |
| 14 | PYUSD Bridge Exploit on Ethereum | Ethereum | 1.5x | $800K |
| 15 | USDC Bridge Exploit on Lightning | Lightning | 1.95x | $500K |

### Sample Pricing (Bridge Exploit)

**Baseline**: $100,000 coverage, 30 days
- USDC on Ethereum: $493.16 (1.5x base)
- USDC on Arbitrum: $542.47 (1.65x base)
- USDC on Polygon: $591.78 (1.8x base)
- USDC on Solana: $690.40 (2.1x base)

---

## Coverage Type 5: CEX Liquidation (126 products)

**Available on**: All 9 chains × All 14 stablecoins = 126 products

### Top 12 Products by Expected Volume

| Rank | Product | Chain | Coverage Multiplier | Expected Annual Volume |
|------|---------|-------|-------------------|----------------------|
| 1 | USDT CEX Liquidation on Ethereum | Ethereum | 1.4x | $15M |
| 2 | USDC CEX Liquidation on Ethereum | Ethereum | 1.4x | $12M |
| 3 | USDT CEX Liquidation on Arbitrum | Arbitrum | 1.54x | $5M |
| 4 | USDC CEX Liquidation on Arbitrum | Arbitrum | 1.54x | $4M |
| 5 | USDT CEX Liquidation on Polygon | Polygon | 1.68x | $3M |
| 6 | BUSD CEX Liquidation on Ethereum | Ethereum | 1.4x | $2.5M |
| 7 | USDC CEX Liquidation on Base | Base | 1.54x | $2M |
| 8 | DAI CEX Liquidation on Ethereum | Ethereum | 1.4x | $1.5M |
| 9 | USDT CEX Liquidation on Solana | Solana | 1.96x | $1.2M |
| 10 | USDC CEX Liquidation on Polygon | Polygon | 1.68x | $1M |
| 11 | PYUSD CEX Liquidation on Ethereum | Ethereum | 1.4x | $800K |
| 12 | USDC CEX Liquidation on TON | TON | 1.61x | $600K |

### Sample Pricing (CEX Liquidation)

**Baseline**: $100,000 coverage, 30 days
- USDT on Ethereum: $460.27 (1.4x base)
- USDT on Arbitrum: $506.30 (1.54x base)
- USDT on Polygon: $552.33 (1.68x base)

---

## Product Availability Summary

| Coverage Type | Ethereum | Arbitrum | Base | Polygon | Optimism | Bitcoin | Lightning | Solana | TON | Total |
|--------------|----------|----------|------|---------|----------|---------|-----------|--------|-----|-------|
| **Depeg** | 14 | 14 | 14 | 14 | 14 | 14 | 14 | 14 | 14 | **126** |
| **Smart Contract** | 14 | 14 | 14 | 14 | 14 | ❌ | ❌ | 14 | 14 | **98** |
| **Oracle** | 14 | 14 | 14 | 14 | 14 | ❌ | ❌ | 14 | 14 | **98** |
| **Bridge Exploit** | 14 | 14 | 14 | 14 | 14 | 14 | 14 | 14 | 14 | **126** |
| **CEX Liquidation** | 14 | 14 | 14 | 14 | 14 | 14 | 14 | 14 | 14 | **126** |
| **Chain Total** | 70 | 70 | 70 | 70 | 70 | 42 | 42 | 70 | 70 | **574** |

**Adjusted Total**: 574 theoretical products, ~480 practical products (excluding very low demand combinations)

---

## Volume Projections

### Year 1 (Testnet → Mainnet)

**Total Target**: $200M coverage sold
- Depeg products: $140M (70%)
- Smart Contract: $35M (17.5%)
- Bridge Exploit: $15M (7.5%)
- Oracle: $7M (3.5%)
- CEX Liquidation: $3M (1.5%)

### Year 2 (Scale)

**Total Target**: $1.5B coverage sold
- Depeg products: $900M (60%)
- Smart Contract: $375M (25%)
- Bridge Exploit: $150M (10%)
- CEX Liquidation: $45M (3%)
- Oracle: $30M (2%)

### Expected Product Distribution

**Top 50 Products** (by volume):
- Will account for ~85% of total coverage
- Dominated by USDC/USDT on Ethereum/Arbitrum/Base
- Tier 1 stablecoins will be 75%+ of volume

**Long Tail (450+ products)**:
- 15% of total coverage
- Niche use cases (Tier 3 stablecoins, newer chains)
- Important for diversification

---

## Product Exclusions

### Invalid Combinations

1. **Bitcoin + Smart Contract** (14 products excluded)
   - Bitcoin has no smart contract layer
   - Lightning is payment-only

2. **Bitcoin + Oracle** (14 products excluded)
   - No oracle infrastructure on Bitcoin L1
   - Lightning doesn't use oracles

**Total Excluded**: 28 products
**Valid Products**: 560 - 28 = 532 products

### Low Demand Products (Deprioritized)

Products unlikely to see significant volume in Year 1:
- Tier 3 stablecoins on Solana/Lightning (low liquidity × high risk)
- Oracle coverage on TON (limited oracle usage)
- CEX Liquidation on Bitcoin (limited CEX integration)

**Estimated**: ~50 products with <$10K annual volume

---

## Product Roadmap

### Phase 1 (Months 1-3): Core Products

Launch 20 highest-demand products:
- Depeg: USDC, USDT, DAI on Ethereum, Arbitrum, Base
- Smart Contract: USDC, USDT on Ethereum, Arbitrum
- Bridge: USDC, USDT on Ethereum → Arbitrum/Polygon

**Target**: $10M TVL

### Phase 2 (Months 4-6): Expansion

Add 50 more products:
- All Tier 1 stablecoins across all chains
- Tier 2 stablecoins on Ethereum/Arbitrum
- CEX Liquidation products

**Target**: $50M TVL

### Phase 3 (Months 7-12): Full Matrix

Launch remaining products:
- All Tier 3 stablecoins
- All coverage types on all chains
- Long-tail combinations

**Target**: $200M TVL

---

## Product Data Schema

Each product is tracked in PostgreSQL:

```sql
SELECT
  coverage_type,
  chain_id,
  stablecoin_id,
  COUNT(*) as policy_count,
  SUM(coverage_amount) as total_coverage,
  SUM(premium_paid) as total_premium
FROM policies
WHERE status = 'active'
GROUP BY coverage_type, chain_id, stablecoin_id
ORDER BY total_coverage DESC;
```

See `backend/migrations/002_add_multi_dimensional_coverage.sql` for schema details.

---

## API Integration

### Fetch Available Products

```bash
GET /api/v1/products

Response:
{
  "products": [
    {
      "coverage_type": "depeg",
      "chain": "ethereum",
      "stablecoin": "USDC",
      "available": true,
      "base_premium_rate_bps": 400,
      "chain_multiplier": 1.0,
      "current_tvl": 50000000,
      "policy_count": 1250
    },
    ...
  ]
}
```

### Get Product-Specific Quote

```bash
POST /api/v1/quote

Body:
{
  "coverage_type": "depeg",
  "chain": "ethereum",
  "asset": "USDC",
  "coverage_amount_usd": 100000,
  "trigger_price": 0.97,
  "floor_price": 0.90,
  "duration_days": 30
}

Response:
{
  "premium_usd": 328.77,
  "premium_rate_bps": 400,
  "coverage_multiplier": 1.0,
  "chain_multiplier": 1.0,
  "stablecoin_adjustment_bps": 0,
  "available": true
}
```

---

## References

- Risk multipliers: `docs/RISK_MATRIX.md`
- API documentation: `docs/API_REFERENCE.md`
- Architecture overview: `docs/CLAUDE.md`
- Backend pricing logic: `backend/pricing/pricing_engine.ml`
- Chain risk calculation: `backend/risk/chain_risk_calculator.ml`

---

**Document Version History:**
- v1.0 (2025-10-15): Initial 560-product matrix documentation
