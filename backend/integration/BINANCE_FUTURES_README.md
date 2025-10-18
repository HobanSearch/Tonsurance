# Binance Futures Integration

## Overview

This module provides real exchange integration with Binance Futures API for hedging Tonsurance's bitcoin float exposure through short BTC futures positions.

**Purpose**: When Tonsurance accumulates BTC in its float (reserves), it can hedge price risk by opening short positions on Binance Futures. This allows the protocol to maintain USD-neutral exposure while still benefiting from the BTC float strategy.

## Architecture

### Core Components

1. **binance_futures_client.ml** - Main client module
   - Open/close short positions
   - Real-time position tracking
   - Funding rate monitoring
   - Rate limiting and error handling

2. **bitcoin_float_manager.ml** - Float manager with hedging
   - Integrated `execute_trade_with_hedge()` function
   - Automatic hedge opening when buying BTC
   - Automatic hedge closing when selling BTC
   - Hedge position tracking

3. **binance_futures_client_test.ml** - Comprehensive test suite
   - Unit tests (signature, rate limiter, etc.)
   - Integration tests with testnet
   - 90%+ code coverage

## Setup Instructions

### 1. Create Binance Futures Testnet Account

1. Go to https://testnet.binancefuture.com/
2. Register for a testnet account (free)
3. You'll receive 10,000 USDT testnet balance automatically

### 2. Generate API Keys

1. Login to testnet account
2. Navigate to API Management
3. Click "Create API"
4. Save your API Key and Secret Key (shown only once!)

**Security Notes:**
- Testnet keys only work on testnet (cannot access real funds)
- For production, use separate API keys with withdrawal disabled
- Store keys in environment variables, never commit to git
- Use IP whitelisting for production keys

### 3. Set Environment Variables

For **testing**:

```bash
export BINANCE_TESTNET_API_KEY="your_testnet_api_key_here"
export BINANCE_TESTNET_API_SECRET="your_testnet_api_secret_here"
```

For **production** (when ready):

```bash
export BINANCE_API_KEY="your_production_api_key_here"
export BINANCE_API_SECRET="your_production_api_secret_here"
```

Add to your `.bashrc` or `.zshrc` for persistence:

```bash
echo 'export BINANCE_TESTNET_API_KEY="your_key"' >> ~/.bashrc
echo 'export BINANCE_TESTNET_API_SECRET="your_secret"' >> ~/.bashrc
source ~/.bashrc
```

### 4. Verify Setup

Run the test suite:

```bash
cd backend
dune exec test/binance_futures_client_test.exe
```

Expected output:
```
✓ Rate limiter test passed
✓ Signature generation test passed
✓ Connectivity test passed: Successfully connected to Binance testnet
✓ Mark price test passed: BTC mark price = $67,234.50
```

## Usage Examples

### Basic Configuration

```ocaml
open Binance_futures_client.BinanceFuturesClient

let config = {
  api_key = Sys.getenv "BINANCE_TESTNET_API_KEY";
  api_secret = Sys.getenv "BINANCE_TESTNET_API_SECRET";
  testnet = true;  (* Use testnet for development *)
  rate_limit_weight_per_minute = 1200;
  timeout_seconds = 10.0;
}
```

### Open Short Position

```ocaml
let%lwt result = open_short
  ~config
  ~symbol:"BTCUSDT"
  ~quantity:0.5  (* Short 0.5 BTC *)
  ~leverage:5    (* Use 5x leverage *)
in

match result with
| Ok position ->
    Printf.printf "Position opened: %s @ $%.2f\n"
      position.position_id position.entry_price
| Error e ->
    Printf.eprintf "Error: %s\n" (error_to_string e)
```

### Close Position

```ocaml
let%lwt result = close_position
  ~config
  ~position_id:"12345"
in

match result with
| Ok pnl ->
    Printf.printf "Position closed: realized PnL = $%.2f\n" pnl.net_pnl
| Error e ->
    Printf.eprintf "Error: %s\n" (error_to_string e)
```

### Get Current Position

```ocaml
let%lwt result = get_position ~config ~symbol:"BTCUSDT" in

match result with
| Ok (Some position) ->
    Printf.printf "Position: %.8f BTC short @ $%.2f (PnL: $%.2f)\n"
      position.quantity position.entry_price position.unrealized_pnl
| Ok None ->
    Printf.printf "No active position\n"
| Error e ->
    Printf.eprintf "Error: %s\n" (error_to_string e)
```

### Get Funding Rate

```ocaml
let%lwt result = get_funding_rate ~config ~symbol:"BTCUSDT" in

match result with
| Ok rate ->
    Printf.printf "Current funding rate: %.6f%%\n" (rate *. 100.0)
| Error e ->
    Printf.eprintf "Error: %s\n" (error_to_string e)
```

### Integrated Hedging (Float Manager)

```ocaml
open Bitcoin_float_manager.BitcoinFloatManager.TradingEngine

let%lwt result = execute_trade_with_hedge
  (BuyBTC 10_000.0)  (* Buy $10k worth of BTC *)
  vault
  ~btc_price:67_000.0
  ~reason:"Rebalancing"
  ~binance_config:config
  ~hedge_state:empty_hedge_state
in

match result with
| Ok (new_vault, Some execution, new_hedge_state) ->
    Printf.printf "Trade executed: bought %.8f BTC (hedged)\n"
      execution.btc_amount
| Error err ->
    Printf.eprintf "Trade failed: %s\n" err
```

## API Rate Limits

Binance Futures enforces rate limits based on "weight":

- **1200 weight per minute** (default)
- Different endpoints have different weights:
  - `/fapi/v1/ping` - 1 weight
  - `/fapi/v1/order` (POST) - 1 weight
  - `/fapi/v2/positionRisk` (GET) - 5 weight

The client automatically handles rate limiting using a token bucket algorithm.

## Error Handling

The client returns `Result.t` types with detailed error information:

```ocaml
type error =
  | API_error of int * string      (* HTTP code + message *)
  | Rate_limited                   (* 429 rate limit exceeded *)
  | Network_error of string        (* Connection issues *)
  | Parse_error of string          (* JSON parsing failed *)
  | Authentication_error of string (* Invalid API keys *)
  | Insufficient_margin            (* Not enough margin for trade *)
```

**Exponential Backoff**: On rate limits or server errors (5xx), requests automatically retry with delays: 1s, 2s, 4s.

## Funding Rates

Binance Futures charges/pays funding every 8 hours:

- **Positive funding rate**: Longs pay shorts (you earn when short)
- **Negative funding rate**: Shorts pay longs (you pay when short)
- Typical range: -0.5% to +0.5% per funding period
- Annual impact: Funding rate × 3 (daily) × 365

**Example**: With 0.01% funding rate (positive), holding 10 BTC short:
- Per funding: 10 BTC × 0.01% = 0.001 BTC (~$67)
- Per day: $67 × 3 = $201
- Per year: $201 × 365 = $73,365

Monitor funding rates using `get_funding_rate()` and adjust hedge positions accordingly.

## Production Deployment

### Security Checklist

- [ ] Use production API keys (not testnet)
- [ ] Enable IP whitelist on Binance API keys
- [ ] Disable withdrawal permission on API keys
- [ ] Store keys in AWS Secrets Manager (not environment variables)
- [ ] Use separate keys for each service
- [ ] Monitor rate limit usage
- [ ] Set up alerting for failed hedge executions
- [ ] Test failover scenarios

### Risk Management

1. **Leverage**: Use 5x or lower (lower = safer)
2. **Position size**: Never exceed 50% of BTC float
3. **Liquidation price**: Monitor and close position if within 20% of liquidation
4. **Funding costs**: Track cumulative funding costs monthly
5. **Emergency procedures**: Manual close positions via Binance UI if API fails

### Monitoring

```ocaml
(* Check position health every 5 minutes *)
let%lwt position = get_position ~config ~symbol:"BTCUSDT" in

match position with
| Ok (Some pos) ->
    (* Alert if close to liquidation *)
    let liquidation_distance =
      Float.abs (pos.mark_price -. pos.liquidation_price) /. pos.mark_price
    in
    if liquidation_distance < 0.20 then
      alert "Position close to liquidation: %.1f%%" (liquidation_distance *. 100.0)

    (* Alert if unrealized loss exceeds threshold *)
    if pos.unrealized_pnl < -10_000.0 then
      alert "Large unrealized loss: $%.2f" pos.unrealized_pnl
| _ -> ()
```

## Testing

### Unit Tests

```bash
cd backend
dune runtest
```

Tests include:
- Rate limiter functionality
- HMAC signature generation
- Error handling
- Position serialization
- PnL calculations

### Integration Tests (Testnet)

```bash
export BINANCE_TESTNET_API_KEY="your_key"
export BINANCE_TESTNET_API_SECRET="your_secret"
dune exec test/binance_futures_client_test.exe
```

Tests include:
- API connectivity
- Market data fetching
- Position opening/closing
- Real-time funding rates

**Note**: Integration tests require testnet balance. Request testnet funds from Binance faucet if needed.

### Coverage

Run with coverage:

```bash
dune runtest --instrument-with bisect_ppx
bisect-ppx-report html
open _coverage/index.html
```

Target: 90%+ coverage

## Troubleshooting

### "Authentication failed"

- Verify API keys are correct
- Check if using testnet keys with testnet URL
- Ensure timestamp is within 5 seconds of server time

### "Insufficient margin"

- Check testnet balance on https://testnet.binancefuture.com
- Request more testnet funds from faucet
- Reduce position size or leverage

### "Rate limited"

- Wait 60 seconds for rate limit reset
- Reduce request frequency
- Client automatically handles this with retries

### "Position not found"

- Verify symbol is correct ("BTCUSDT" not "BTC-USDT")
- Check if position was already closed
- Use `get_position()` to verify current state

## API Documentation

- **Binance Futures API**: https://binance-docs.github.io/apidocs/futures/en/
- **Testnet**: https://testnet.binancefuture.com
- **Trading Rules**: https://www.binance.com/en/futures/trading-rules

## Support

For issues with:
- **Tonsurance integration**: Open GitHub issue
- **Binance API**: https://dev.binance.vision
- **Testnet issues**: https://t.me/binance_api_english

## License

This integration is part of the Tonsurance protocol. See LICENSE file in repository root.
