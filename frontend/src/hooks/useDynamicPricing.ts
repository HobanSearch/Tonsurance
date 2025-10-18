/**
 * useDynamicPricing Hook
 *
 * WebSocket-based real-time dynamic pricing for Tonsurance
 * Subscribes to pricing_updates channel and maintains current quote
 *
 * Features:
 * - Real-time multiplier updates (every 60s)
 * - Auto-reconnection on disconnect
 * - 30-second quote caching
 * - Price locking (2-minute validity)
 * - Visual indicators for price changes
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface ProductSelection {
  coverageType: string;
  blockchain: string;
  stablecoin: string;
}

export interface MultiplierComponents {
  base: number;
  market_adj: number;
  volatility: number;
  total: number;
}

export interface MarketFactors {
  stablecoin_price: number;
  bridge_health?: number;
  cex_liquidation_rate: number;
  chain_congestion: 'low' | 'medium' | 'high';
  overall_volatility: number;
}

export interface DynamicQuote {
  base_premium: number;
  market_adjustment_pct: number;
  volatility_premium_pct: number;
  final_premium: number;
  effective_apr: number;
  valid_until: number;
  multiplier_components: MultiplierComponents;
  market_factors: MarketFactors;
}

export interface PriceLock {
  lock_id: string;
  locked_premium: number;
  locked_rate_bps: number;
  valid_until: number;
  expires_in_seconds: number;
}

interface PricingUpdate {
  channel: string;
  type: string;
  products: Array<{
    coverage_type: string;
    chain: string;
    stablecoin: string;
    multiplier: number;
    market_adjustment: number;
    volatility_premium: number;
  }>;
  volatility_index: number;
  timestamp: number;
}

interface UseDynamicPricingOptions {
  product: ProductSelection | null;
  coverageAmount: number;
  durationDays: number;
  autoRefresh?: boolean;
  wsUrl?: string;
  apiUrl?: string;
}

interface UseDynamicPricingReturn {
  quote: DynamicQuote | null;
  isLoading: boolean;
  isConnected: boolean;
  error: string | null;
  lastUpdate: number | null;
  priceChange: 'up' | 'down' | 'stable';
  lockPrice: () => Promise<PriceLock | null>;
  refreshQuote: () => Promise<void>;
  currentMultiplier: number | null;
}

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

export function useDynamicPricing(options: UseDynamicPricingOptions): UseDynamicPricingReturn {
  const {
    product,
    coverageAmount,
    durationDays,
    autoRefresh = true,
    wsUrl = WS_URL,
    apiUrl = API_URL,
  } = options;

  const [quote, setQuote] = useState<DynamicQuote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [priceChange, setPriceChange] = useState<'up' | 'down' | 'stable'>('stable');
  const [currentMultiplier, setCurrentMultiplier] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousPremiumRef = useRef<number | null>(null);

  /**
   * Calculate fallback quote using static multipliers when backend unavailable
   */
  const calculateFallbackQuote = useCallback((
    prod: ProductSelection,
    amount: number,
    days: number
  ): DynamicQuote => {
    // Base APR rates (in basis points) from contracts/libs/risk_multipliers.fc
    const baseRates: Record<string, number> = {
      depeg: 80,           // 0.80% APR
      exploit: 250,        // 2.50% APR
      bridge: 150,         // 1.50% APR
      cex_liquidation: 200, // 2.00% APR
      cex_freeze: 100,     // 1.00% APR
    };

    // Chain multipliers (basis points, 10000 = 1.0x)
    const chainMultipliers: Record<string, number> = {
      ethereum: 10000,   // 1.0x (baseline)
      bsc: 12000,        // 1.2x
      polygon: 11000,    // 1.1x
      avalanche: 11500,  // 1.15x
      arbitrum: 10500,   // 1.05x
      optimism: 10500,   // 1.05x
      ton: 9500,         // 0.95x (native chain discount)
      solana: 13000,     // 1.3x
    };

    const baseRate = baseRates[prod.coverageType] || 100;
    const chainMult = chainMultipliers[prod.blockchain.toLowerCase()] || 10000;

    // Calculate base premium: amount * rate * (days/365)
    const basePremium = (amount * baseRate / 10000) * (days / 365);

    // Apply chain multiplier
    const chainAdjusted = basePremium * (chainMult / 10000);

    // Market adjustment (static fallback: +10% average)
    const marketAdjPct = 10;
    const marketAdjustment = chainAdjusted * (marketAdjPct / 100);

    // Volatility premium (static fallback: +5% average)
    const volatilityPct = 5;
    const volatilityPremium = chainAdjusted * (volatilityPct / 100);

    const finalPremium = chainAdjusted + marketAdjustment + volatilityPremium;
    const effectiveApr = (finalPremium / amount) * (365 / days) * 100;

    return {
      base_premium: basePremium,
      market_adjustment_pct: marketAdjPct,
      volatility_premium_pct: volatilityPct,
      final_premium: finalPremium,
      effective_apr: effectiveApr,
      valid_until: Math.floor(Date.now() / 1000) + 120, // 2 minutes
      multiplier_components: {
        base: baseRate,
        market_adj: marketAdjPct * 100, // Convert to basis points
        volatility: volatilityPct * 100,
        total: baseRate + (marketAdjPct * 100) + (volatilityPct * 100),
      },
      market_factors: {
        stablecoin_price: 1.0,
        cex_liquidation_rate: 0.05,
        chain_congestion: 'low',
        overall_volatility: 0.05,
      },
    };
  }, []);

  /**
   * Fetch quote from REST API
   */
  const fetchQuote = useCallback(async () => {
    if (!product || coverageAmount <= 0 || durationDays <= 0) {
      setQuote(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        coverage_type: product.coverageType,
        chain: product.blockchain.toLowerCase(),
        stablecoin: product.stablecoin,
        amount: coverageAmount.toString(),
        duration_days: durationDays.toString(),
      });

      const response = await fetch(`${apiUrl}/api/v2/pricing/dynamic-quote?${params}`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch quote: ${response.statusText}`);
      }

      const data: DynamicQuote = await response.json();

      // Detect price change
      if (previousPremiumRef.current !== null) {
        const priceDiff = data.final_premium - previousPremiumRef.current;
        if (Math.abs(priceDiff) > 0.01) { // >$0.01 change
          setPriceChange(priceDiff > 0 ? 'up' : 'down');

          // Reset change indicator after 3 seconds
          setTimeout(() => setPriceChange('stable'), 3000);
        }
      }
      previousPremiumRef.current = data.final_premium;

      setQuote(data);
      setCurrentMultiplier(data.multiplier_components.total);
      setLastUpdate(Date.now());
    } catch (err) {
      console.error('[useDynamicPricing] Error fetching quote, using fallback:', err);

      // Use fallback calculation when backend unavailable
      const fallbackQuote = calculateFallbackQuote(product, coverageAmount, durationDays);
      setQuote(fallbackQuote);
      setCurrentMultiplier(fallbackQuote.multiplier_components.total);
      setLastUpdate(Date.now());
      setError('Using fallback pricing (backend unavailable)');
    } finally {
      setIsLoading(false);
    }
  }, [product, coverageAmount, durationDays, apiUrl, calculateFallbackQuote]);

  /**
   * Lock current price for 2 minutes
   */
  const lockPrice = useCallback(async (): Promise<PriceLock | null> => {
    if (!product || !quote) {
      setError('No quote available to lock');
      return null;
    }

    try {
      const response = await fetch(`${apiUrl}/api/v2/pricing/lock-price`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_address: 'USER_ADDRESS_HERE', // Replace with actual user address
          coverage_type: product.coverageType,
          chain: product.blockchain,
          stablecoin: product.stablecoin,
          amount: coverageAmount,
          duration_days: durationDays,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to lock price: ${response.statusText}`);
      }

      const data: { success: boolean; lock_id: string } & PriceLock = await response.json();

      if (data.success) {
        console.log('[useDynamicPricing] Price locked:', data.lock_id);
        return {
          lock_id: data.lock_id,
          locked_premium: data.locked_premium,
          locked_rate_bps: data.locked_rate_bps,
          valid_until: data.valid_until,
          expires_in_seconds: data.expires_in_seconds,
        };
      } else {
        throw new Error('Price lock failed');
      }
    } catch (err) {
      console.error('[useDynamicPricing] Error locking price:', err);
      setError(err instanceof Error ? err.message : 'Failed to lock price');
      return null;
    }
  }, [product, quote, coverageAmount, durationDays, apiUrl]);

  /**
   * Connect to WebSocket for real-time updates
   */
  const connectWebSocket = useCallback(() => {
    if (!autoRefresh) return;

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[useDynamicPricing] WebSocket connected');
        setIsConnected(true);
        setError(null);

        // Subscribe to pricing_updates channel
        ws.send(JSON.stringify({
          action: 'subscribe',
          channel: 'pricing_updates',
        }));

        // Send periodic pings (every 30s)
        const pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              action: 'ping',
              channel: 'heartbeat',
            }));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'subscribed' && data.channel === 'pricing_updates') {
            console.log('[useDynamicPricing] Subscribed to pricing_updates');
          }

          if (data.channel === 'pricing_updates' && data.type === 'multiplier_update') {
            const update = data as PricingUpdate;

            // Check if update affects current product
            if (product) {
              const relevantUpdate = update.products.find(p =>
                p.coverage_type === product.coverageType &&
                p.chain.toLowerCase() === product.blockchain.toLowerCase() &&
                p.stablecoin === product.stablecoin
              );

              if (relevantUpdate) {
                console.log('[useDynamicPricing] Relevant multiplier update received:', relevantUpdate.multiplier);

                // Refresh quote with new multiplier
                fetchQuote();
              }
            }

            setLastUpdate(Date.now());
          }
        } catch (err) {
          console.error('[useDynamicPricing] Error parsing WebSocket message:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('[useDynamicPricing] WebSocket error:', event);
        setError('WebSocket connection error');
      };

      ws.onclose = () => {
        console.log('[useDynamicPricing] WebSocket disconnected');
        setIsConnected(false);

        // Attempt reconnection after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[useDynamicPricing] Attempting to reconnect...');
          connectWebSocket();
        }, 5000);
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[useDynamicPricing] Error connecting to WebSocket:', err);
      setError(err instanceof Error ? err.message : 'WebSocket connection failed');
    }
  }, [autoRefresh, wsUrl, product, fetchQuote]);

  /**
   * Disconnect WebSocket
   */
  const disconnectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  /**
   * Initial quote fetch
   */
  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  /**
   * WebSocket lifecycle
   */
  useEffect(() => {
    if (autoRefresh) {
      connectWebSocket();
    }

    return () => {
      disconnectWebSocket();
    };
  }, [autoRefresh, connectWebSocket, disconnectWebSocket]);

  return {
    quote,
    isLoading,
    isConnected,
    error,
    lastUpdate,
    priceChange,
    lockPrice,
    refreshQuote: fetchQuote,
    currentMultiplier,
  };
}

/**
 * Helper hook for market conditions display
 */
export function useMarketConditions(apiUrl = API_URL) {
  const [conditions, setConditions] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchConditions = useCallback(async () => {
    setIsLoading(true);

    try {
      const response = await fetch(`${apiUrl}/api/v2/pricing/market-conditions`);

      if (!response.ok) {
        throw new Error('Failed to fetch market conditions');
      }

      const data = await response.json();
      setConditions(data);
    } catch (err) {
      console.error('[useMarketConditions] Error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchConditions();

    // Refresh every 60 seconds
    const interval = setInterval(fetchConditions, 60000);

    return () => clearInterval(interval);
  }, [fetchConditions]);

  return { conditions, isLoading, refresh: fetchConditions };
}
