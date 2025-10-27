# Binance Futures Symbol Mapping for Insurance Hedging

## Overview

This document explains the hedge symbol mapping logic in `hedge_orchestrator.ml:343-398`. The mapping is critical for proper risk hedging - incorrect mappings lead to ineffective hedges.

---

## Depeg Insurance

**Strategy**: SHORT the stablecoin itself (when available) to profit when it depegs

| Stablecoin | Binance Symbol | Rationale |
|------------|----------------|-----------|
| USDC | `USDCUSDT` | Direct short - profit when USDC < $1.00 |
| USDT | `BTCUSDT` | Can't short USDT (quote currency), use BTC inverse correlation |
| DAI | `DAIUSDT` | Direct short - profit when DAI < $1.00 |
| BUSD | `BUSDUSDT` | Direct short - profit when BUSD < $1.00 |
| FRAX | `BTCUSDT` | FRAX perp unavailable, use BTC proxy |
| Others | `BTCUSDT` | Fallback: BTC often rises when stables depeg (flight to safety) |

**Example**:
- User buys USDC depeg insurance for $10,000
- We SHORT $2,000 of USDCUSDT perpetual (20% hedge allocation)
- If USDC drops to $0.95:
  - Insurance payout: $5,000 (50% interpolation from trigger $0.98 to floor $0.90)
  - Hedge profit: USDC fell 3.16%, we profit ~$63 on the short
  - Net cost to vault: $5,000 - $63 = $4,937

---

## Smart Contract Insurance

**Strategy**: SHORT the chain's native token (exploits dump token prices)

| Chain | Binance Symbol | Rationale |
|-------|----------------|-----------|
| Ethereum | `ETHUSDT` | ETH drops when Ethereum contracts exploited |
| Arbitrum | `ARBUSDT` | ARB token correlates with Arbitrum ecosystem health |
| Base | `ETHUSDT` | Base is Ethereum L2, uses ETH for gas |
| Polygon | `MATICUSDT` | MATIC/POL is native token |
| Avalanche | `AVAXUSDT` | AVAX is native token |
| Solana | `SOLUSDT` | SOL drops when Solana contracts exploited |
| TON | `TONUSDT` | TON is native token |
| Bitcoin | `BTCUSDT` | BTC for Bitcoin-native contracts |
| Others | `ETHUSDT` | Default to ETH (largest smart contract ecosystem) |

**Example**:
- User buys Ethereum smart contract exploit insurance for $10,000
- We SHORT $3,500 of ETHUSDT perpetual (35% hedge allocation)
- If exploit occurs and ETH drops 10%:
  - Insurance payout: $10,000
  - Hedge profit: 10% on $3,500 = $350 (with 5x leverage = $1,750)
  - Net cost to vault: $10,000 - $1,750 = $8,250

---

## Bridge Insurance

**Strategy**: SHORT the dominant chain's token (bridge hacks affect both sides)

| Chain | Binance Symbol | Rationale |
|-------|----------------|-----------|
| Ethereum/Arbitrum/Base | `ETHUSDT` | ETH ecosystem bridges |
| Solana | `SOLUSDT` | Solana bridge hacks dump SOL |
| Avalanche | `AVAXUSDT` | AVAX bridge hacks dump AVAX |
| Polygon | `MATICUSDT` | MATIC bridge hacks dump MATIC |
| Others | `ETHUSDT` | Default to ETH (most bridge volume) |

---

## CEX Liquidation Insurance

**Strategy**: SHORT BTC (CEX insolvency causes market-wide dumps)

| Product | Binance Symbol | Rationale |
|---------|----------------|-----------|
| CEX Liquidation | `BTCUSDT` | CEX failures correlate with BTC dumps (Mt. Gox, FTX) |

**Example**:
- User buys Binance liquidation insurance for $10,000
- We SHORT $3,500 of BTCUSDT perpetual
- If Binance goes insolvent, BTC dumps 20%:
  - Insurance payout: $10,000
  - Hedge profit: 20% on $3,500 = $700 (with 5x leverage = $3,500)
  - Net cost to vault: $10,000 - $3,500 = $6,500

---

## Oracle Malfunction Insurance

**Strategy**: SHORT LINK (oracle failures affect Chainlink price)

| Product | Binance Symbol | Rationale |
|---------|----------------|-----------|
| Oracle Malfunction | `LINKUSDT` | LINK drops when Chainlink oracle issues occur |

---

## Slashing Insurance

**Strategy**: SHORT ETH (slashing events on Ethereum staking)

| Product | Binance Symbol | Rationale |
|---------|----------------|-----------|
| Slashing | `ETHUSDT` | ETH staking slashing events dump ETH price |

---

## Exploit Insurance (General)

**Strategy**: SHORT the chain's native token

| Chain | Binance Symbol | Rationale |
|-------|----------------|-----------|
| Ethereum | `ETHUSDT` | ETH ecosystem exploits |
| Solana | `SOLUSDT` | SOL ecosystem exploits |
| Avalanche | `AVAXUSDT` | AVAX ecosystem exploits |
| Others | `BTCUSDT` | Default to BTC |

---

## Leverage Settings

All Binance Futures positions use **5x leverage**:
- Lower risk than 10x+ leverage
- Higher capital efficiency than 1x
- Standard for institutional hedging

**Example**:
- Hedge allocation: $10,000
- With 5x leverage, controls: $50,000 notional
- If underlying drops 2%, profit: $1,000 (10% ROI)

---

## Important Notes

### USDT Limitation
- **USDT cannot be shorted** on Binance Futures (it's the quote currency)
- For USDT depeg insurance, we use **BTCUSDT** as a proxy
- **Rationale**: Historically, when USDT depegs, BTC often rises (flight to safety)
- **Example**: March 2023 USDT depeg to $0.985 → BTC +8% in 48 hours

### Symbol Availability
Check Binance Futures symbol availability before deployment:
```bash
curl https://fapi.binance.com/fapi/v1/exchangeInfo | jq '.symbols[] | .symbol'
```

### Fallback Logic
If the mapped symbol is unavailable or delisted:
1. Log warning: `"Symbol {symbol} unavailable, using BTCUSDT fallback"`
2. Use `BTCUSDT` as universal fallback
3. Alert ops team to update mapping

---

## Testing the Mapping

```bash
# Test depeg hedge (USDC)
curl -X POST http://localhost:8080/api/v2/hedges/execute \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "Depeg",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "hedge_amount_cents": 200000
  }'

# Expected: Opens short position on USDCUSDT

# Test smart contract hedge (Ethereum)
curl -X POST http://localhost:8080/api/v2/hedges/execute \
  -H "Content-Type: application/json" \
  -d '{
    "coverage_type": "SmartContract",
    "chain": "Ethereum",
    "stablecoin": "USDC",
    "hedge_amount_cents": 350000
  }'

# Expected: Opens short position on ETHUSDT
```

---

## Future Improvements

1. **Dynamic Symbol Selection**: Query Binance API for available symbols at runtime
2. **Correlation Analysis**: Use historical correlation data to optimize symbol selection
3. **Multi-Symbol Hedging**: Hedge with portfolio of correlated assets (e.g., ETH + ARB for Arbitrum)
4. **Options Integration**: Use Binance Options for better tail-risk hedging
5. **Cross-Venue**: Combine Binance + Deribit + FTX for deeper liquidity

---

## References

- Binance Futures API: https://binance-docs.github.io/apidocs/futures/en/
- Symbol List: https://fapi.binance.com/fapi/v1/exchangeInfo
- Leverage Limits: https://www.binance.com/en/support/faq/leverage-and-margin
