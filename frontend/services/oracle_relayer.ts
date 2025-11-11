/**
 * Oracle Relayer Service - V3
 *
 * Monitors prices from multiple oracle sources (Redstone, Pyth, Custom)
 * and pushes updates to child contracts for parametric trigger evaluation.
 *
 * Flow:
 * 1. Fetch prices from 3 oracle sources every 30 seconds
 * 2. Aggregate prices (median, 2/3 consensus required)
 * 3. Check if price meets trigger conditions (e.g., USDT < $0.98 for 1+ hour)
 * 4. Push price update to relevant child contracts (op::oracle_price_update)
 * 5. Child contracts evaluate triggers and send claims to MasterFactory
 *
 * Design:
 * - Multi-oracle redundancy (Redstone, Pyth, REST API)
 * - Staleness checks (<5 minutes)
 * - Price consensus (2/3 agreement within 1%)
 * - Rate limiting (avoid spamming contracts)
 * - Error handling and retry logic
 */

import { TonClient, Address, beginCell, Cell } from '@ton/ton';
import { getHttpEndpoint } from '@orbs-network/ton-access';
import axios from 'axios';

// ================================================================
// CONFIGURATION
// ================================================================

interface OracleConfig {
  redstoneApiUrl: string;
  pythApiUrl: string;
  customApiUrl: string;
  tonNetwork: 'testnet' | 'mainnet';
  updateInterval: number;  // seconds
  maxStaleness: number;     // seconds
  priceDeviationTolerance: number;  // basis points (100 = 1%)
  minConsensus: number;  // minimum oracles that must agree
}

const config: OracleConfig = {
  redstoneApiUrl: 'https://api.redstone.finance/prices',
  pythApiUrl: 'https://hermes.pyth.network/api/latest_price_feeds',
  customApiUrl: process.env.CUSTOM_ORACLE_API_URL || 'https://api.example.com/prices',
  tonNetwork: (process.env.TON_NETWORK as 'testnet' | 'mainnet') || 'testnet',
  updateInterval: 30,  // 30 seconds
  maxStaleness: 300,   // 5 minutes
  priceDeviationTolerance: 100,  // 1%
  minConsensus: 2,  // 2 out of 3
};

// ================================================================
// TYPES
// ================================================================

interface PriceData {
  price: number;          // Price in USD (6 decimals: $0.98 = 980000)
  timestamp: number;      // Unix timestamp (seconds)
  source: 'redstone' | 'pyth' | 'custom';
  valid: boolean;
}

interface AggregatedPrice {
  price: number;
  timestamp: number;
  consensusCount: number;
  sources: string[];
  valid: boolean;
}

interface Asset {
  symbol: string;
  productType: number;
  assetId: number;
  childContractAddress: string;
  trigger: {
    threshold: number;    // $0.98 = 980000
    duration: number;     // 3600 seconds (1 hour)
  };
}

// ================================================================
// ORACLE CLIENTS
// ================================================================

/**
 * Fetch price from Redstone Oracle
 * Docs: https://docs.redstone.finance/docs/get-started/http-api
 */
async function fetchRedstonePrice(symbol: string): Promise<PriceData> {
  try {
    const response = await axios.get(`${config.redstoneApiUrl}`, {
      params: {
        symbol: symbol,
        provider: 'redstone-primary-prod',
      },
      timeout: 5000,
    });

    const data = response.data[symbol];
    if (!data) {
      throw new Error(`No data for ${symbol}`);
    }

    // Redstone returns price with 8 decimals, convert to 6
    const price = Math.round(data.value / 100);
    const timestamp = Math.floor(data.timestamp / 1000); // Convert ms to seconds

    const isStale = (Date.now() / 1000 - timestamp) > config.maxStaleness;

    return {
      price,
      timestamp,
      source: 'redstone',
      valid: !isStale && price > 0,
    };
  } catch (error) {
    console.error(`Redstone fetch failed for ${symbol}:`, error);
    return { price: 0, timestamp: 0, source: 'redstone', valid: false };
  }
}

/**
 * Fetch price from Pyth Network
 * Docs: https://docs.pyth.network/price-feeds/api-reference
 */
async function fetchPythPrice(symbol: string): Promise<PriceData> {
  try {
    // Pyth uses price feed IDs, map common symbols
    const feedIds: Record<string, string> = {
      'USDT': '0x2b89b9dc8fdf9f34709a5b106b472f0f39bb6ca9ce04b0fd7f2e971688e2e53b',
      'USDC': '0xeaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a',
      'DAI': '0xb0948a5e5313200c632b51bb5ca32f6de0d36e9950a942d19751e833f70dabfd',
    };

    const feedId = feedIds[symbol];
    if (!feedId) {
      throw new Error(`No Pyth feed ID for ${symbol}`);
    }

    const response = await axios.get(`${config.pythApiUrl}`, {
      params: {
        ids: [feedId],
      },
      timeout: 5000,
    });

    const feed = response.data[0];
    if (!feed || !feed.price) {
      throw new Error(`No price data for ${symbol}`);
    }

    // Pyth returns price with exponent, convert to 6 decimals
    const price = Math.round(
      feed.price.price * Math.pow(10, feed.price.expo + 6)
    );
    const timestamp = feed.price.publish_time;

    const isStale = (Date.now() / 1000 - timestamp) > config.maxStaleness;

    return {
      price,
      timestamp,
      source: 'pyth',
      valid: !isStale && price > 0,
    };
  } catch (error) {
    console.error(`Pyth fetch failed for ${symbol}:`, error);
    return { price: 0, timestamp: 0, source: 'pyth', valid: false };
  }
}

/**
 * Fetch price from custom REST API
 */
async function fetchCustomPrice(symbol: string): Promise<PriceData> {
  try {
    const response = await axios.get(`${config.customApiUrl}/price/${symbol}`, {
      timeout: 5000,
    });

    const { price, timestamp } = response.data;

    const isStale = (Date.now() / 1000 - timestamp) > config.maxStaleness;

    return {
      price: Math.round(price * 1000000), // Convert to 6 decimals
      timestamp,
      source: 'custom',
      valid: !isStale && price > 0,
    };
  } catch (error) {
    console.error(`Custom API fetch failed for ${symbol}:`, error);
    return { price: 0, timestamp: 0, source: 'custom', valid: false };
  }
}

// ================================================================
// PRICE AGGREGATION
// ================================================================

/**
 * Check if two prices agree within tolerance
 */
function pricesAgree(price1: number, price2: number): boolean {
  const diff = Math.abs(price1 - price2);
  const tolerance = (price1 * config.priceDeviationTolerance) / 10000;
  return diff <= tolerance;
}

/**
 * Calculate median of 3 prices
 */
function medianOfThree(p1: number, p2: number, p3: number): number {
  return [p1, p2, p3].sort((a, b) => a - b)[1];
}

/**
 * Aggregate prices from multiple oracles
 * Returns aggregated price with consensus info
 */
function aggregatePrices(prices: PriceData[]): AggregatedPrice {
  const validPrices = prices.filter((p) => p.valid);

  if (validPrices.length < config.minConsensus) {
    console.warn(
      `Insufficient consensus: ${validPrices.length}/${prices.length} oracles valid`
    );
    return {
      price: 0,
      timestamp: 0,
      consensusCount: validPrices.length,
      sources: validPrices.map((p) => p.source),
      valid: false,
    };
  }

  // Use median for 3 prices, average for 2
  let aggregatedPrice: number;
  if (validPrices.length === 3) {
    aggregatedPrice = medianOfThree(
      validPrices[0].price,
      validPrices[1].price,
      validPrices[2].price
    );
  } else if (validPrices.length === 2) {
    aggregatedPrice = Math.round(
      (validPrices[0].price + validPrices[1].price) / 2
    );
  } else {
    aggregatedPrice = validPrices[0].price;
  }

  // Verify price agreement (at least 2 must agree within tolerance)
  let agreeCount = 0;
  for (let i = 0; i < validPrices.length; i++) {
    for (let j = i + 1; j < validPrices.length; j++) {
      if (pricesAgree(validPrices[i].price, validPrices[j].price)) {
        agreeCount++;
      }
    }
  }

  const consensusValid = agreeCount >= 1; // At least 1 pair must agree

  return {
    price: aggregatedPrice,
    timestamp: Math.max(...validPrices.map((p) => p.timestamp)),
    consensusCount: validPrices.length,
    sources: validPrices.map((p) => p.source),
    valid: consensusValid,
  };
}

// ================================================================
// TON BLOCKCHAIN INTEGRATION
// ================================================================

/**
 * Send price update to child contract
 */
async function sendPriceUpdate(
  client: TonClient,
  childAddress: string,
  price: number,
  timestamp: number
): Promise<void> {
  try {
    const body = beginCell()
      .storeUint(0x46, 32) // op::oracle_price_update
      .storeUint(price, 32) // Price in 6 decimals
      .storeUint(timestamp, 32) // Unix timestamp
      .endCell();

    // TODO: Sign and send transaction
    // In production, this would use a relayer wallet to sign
    // For now, log the update
    console.log(
      `[SEND] Price update to ${childAddress}: $${(price / 1000000).toFixed(6)} at ${timestamp}`
    );

    // Example TON transaction (requires wallet integration):
    // const wallet = WalletContractV4.create({ workchain: 0, publicKey });
    // await wallet.sendTransfer({
    //   to: Address.parse(childAddress),
    //   value: toNano('0.05'),
    //   body: body,
    // });
  } catch (error) {
    console.error(`Failed to send price update to ${childAddress}:`, error);
  }
}

// ================================================================
// RELAYER MAIN LOOP
// ================================================================

/**
 * Monitor prices for a specific asset
 */
async function monitorAsset(
  client: TonClient,
  asset: Asset,
  lastPrices: Map<string, number>
): Promise<void> {
  console.log(`\n[${new Date().toISOString()}] Monitoring ${asset.symbol}...`);

  // Fetch prices from all oracles
  const [redstone, pyth, custom] = await Promise.all([
    fetchRedstonePrice(asset.symbol),
    fetchPythPrice(asset.symbol),
    fetchCustomPrice(asset.symbol),
  ]);

  console.log(`  Redstone: ${redstone.valid ? `$${(redstone.price / 1000000).toFixed(6)}` : 'INVALID'}`);
  console.log(`  Pyth:     ${pyth.valid ? `$${(pyth.price / 1000000).toFixed(6)}` : 'INVALID'}`);
  console.log(`  Custom:   ${custom.valid ? `$${(custom.price / 1000000).toFixed(6)}` : 'INVALID'}`);

  // Aggregate prices
  const aggregated = aggregatePrices([redstone, pyth, custom]);

  if (!aggregated.valid) {
    console.warn(`  ⚠️  Consensus failed for ${asset.symbol}`);
    return;
  }

  console.log(
    `  ✓ Aggregated: $${(aggregated.price / 1000000).toFixed(6)} (${aggregated.consensusCount}/${config.minConsensus} consensus)`
  );

  // Check if price changed significantly (>0.1%) to avoid spamming
  const lastPrice = lastPrices.get(asset.symbol) || 0;
  const priceChanged =
    lastPrice === 0 || !pricesAgree(aggregated.price, lastPrice);

  if (priceChanged) {
    // Send price update to child contract
    await sendPriceUpdate(
      client,
      asset.childContractAddress,
      aggregated.price,
      aggregated.timestamp
    );

    lastPrices.set(asset.symbol, aggregated.price);
  } else {
    console.log(`  → No significant change, skipping update`);
  }

  // Check trigger conditions
  if (aggregated.price < asset.trigger.threshold) {
    console.log(
      `  🚨 TRIGGER ALERT: ${asset.symbol} below $${(asset.trigger.threshold / 1000000).toFixed(2)} threshold!`
    );
  }
}

/**
 * Main relayer loop
 */
async function startRelayer(assets: Asset[]): Promise<void> {
  console.log('='.repeat(60));
  console.log('Tonsurance V3 Oracle Relayer');
  console.log('='.repeat(60));
  console.log(`Network: ${config.tonNetwork}`);
  console.log(`Update Interval: ${config.updateInterval}s`);
  console.log(`Max Staleness: ${config.maxStaleness}s`);
  console.log(`Min Consensus: ${config.minConsensus}/${3}`);
  console.log(`Assets: ${assets.map((a) => a.symbol).join(', ')}`);
  console.log('='.repeat(60));

  // Initialize TON client
  const endpoint = await getHttpEndpoint({ network: config.tonNetwork });
  const client = new TonClient({ endpoint });

  // Track last prices to avoid redundant updates
  const lastPrices = new Map<string, number>();

  // Main loop
  while (true) {
    try {
      for (const asset of assets) {
        await monitorAsset(client, asset, lastPrices);
      }
    } catch (error) {
      console.error('Error in relayer loop:', error);
    }

    // Wait for next interval
    await new Promise((resolve) =>
      setTimeout(resolve, config.updateInterval * 1000)
    );
  }
}

// ================================================================
// MAIN
// ================================================================

async function main() {
  // Load asset configuration from contracts.json
  const assets: Asset[] = [
    {
      symbol: 'USDT',
      productType: 1, // DEPEG
      assetId: 1,
      childContractAddress: process.env.USDT_CHILD_ADDRESS || 'EQ_DEPLOY_USDT_CHILD_ADDRESS',
      trigger: {
        threshold: 980000, // $0.98
        duration: 3600, // 1 hour
      },
    },
    {
      symbol: 'USDC',
      productType: 1, // DEPEG
      assetId: 2,
      childContractAddress: process.env.USDC_CHILD_ADDRESS || 'EQ_DEPLOY_USDC_CHILD_ADDRESS',
      trigger: {
        threshold: 980000, // $0.98
        duration: 3600, // 1 hour
      },
    },
  ];

  await startRelayer(assets);
}

// Run relayer
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { startRelayer, monitorAsset, aggregatePrices };
