import { useState, useEffect, useCallback } from 'react';
import { useContracts } from './useContracts';
import { fromNano, Address } from '@ton/core';

export interface TrancheData {
  trancheId: number;
  name: string;
  capital: number; // In TON
  apyMin: number; // Percentage
  apyMax: number; // Percentage
  curveType: number;
  allocationPercent: number;
  accumulatedYield: number;
  tokenAddress: Address | null;
  totalTokens: number;
  utilization: number; // Percentage 0-100
  nav: number; // Net Asset Value in TON
  currentApy: number; // Current APY based on utilization
}

export interface VaultSummary {
  totalCapital: number;
  totalCoverageSold: number;
  accumulatedPremiums: number;
  accumulatedLosses: number;
  paused: boolean;
}

const TRANCHE_NAMES: Record<number, string> = {
  1: 'SURE-BTC',
  2: 'SURE-SNR',
  3: 'SURE-MEZZ',
  4: 'SURE-JNR',
  5: 'SURE-JNR+',
  6: 'SURE-EQT',
};

export const useMultiTrancheVault = () => {
  const { contracts } = useContracts();
  const [trancheData, setTrancheData] = useState<Record<number, TrancheData>>({});
  const [vaultSummary, setVaultSummary] = useState<VaultSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTrancheData = useCallback(async (trancheId: number): Promise<TrancheData | null> => {
    if (!contracts.multiTrancheVault) return null;

    try {
      const info = await contracts.multiTrancheVault.getTrancheInfo(trancheId);
      const state = await contracts.multiTrancheVault.getTrancheState(trancheId);
      const nav = await contracts.multiTrancheVault.getTrancheNAV(trancheId);

      // Calculate current APY based on utilization and curve type
      const utilization = Number(state.utilization);
      const apyMin = Number(info.apyMin) / 100; // Convert basis points to %
      const apyMax = Number(info.apyMax) / 100;

      let currentApy = apyMin;
      if (utilization > 0) {
        // Simple linear interpolation for current APY based on utilization
        const utilizationFactor = utilization / 100;
        currentApy = apyMin + (apyMax - apyMin) * utilizationFactor;
      }

      return {
        trancheId,
        name: TRANCHE_NAMES[trancheId] || `Tranche ${trancheId}`,
        capital: parseFloat(fromNano(info.capital)),
        apyMin,
        apyMax,
        curveType: Number(info.curveType),
        allocationPercent: Number(info.allocationPercent),
        accumulatedYield: parseFloat(fromNano(info.accumulatedYield)),
        tokenAddress: info.tokenAddress,
        totalTokens: parseFloat(fromNano(info.totalTokens)),
        utilization,
        nav: parseFloat(fromNano(nav)),
        currentApy,
      };
    } catch (err) {
      console.error(`Error fetching tranche ${trancheId}:`, err);
      return null;
    }
  }, [contracts.multiTrancheVault]);

  const fetchVaultSummary = useCallback(async (): Promise<VaultSummary | null> => {
    if (!contracts.multiTrancheVault) return null;

    try {
      const totalCapital = await contracts.multiTrancheVault.getTotalCapital();
      const totalCoverageSold = await contracts.multiTrancheVault.getTotalCoverageSold();
      const accumulatedPremiums = await contracts.multiTrancheVault.getAccumulatedPremiums();
      const accumulatedLosses = await contracts.multiTrancheVault.getAccumulatedLosses();
      const paused = await contracts.multiTrancheVault.getPaused();

      return {
        totalCapital: parseFloat(fromNano(totalCapital)),
        totalCoverageSold: parseFloat(fromNano(totalCoverageSold)),
        accumulatedPremiums: parseFloat(fromNano(accumulatedPremiums)),
        accumulatedLosses: parseFloat(fromNano(accumulatedLosses)),
        paused,
      };
    } catch (err) {
      console.error('Error fetching vault summary:', err);
      return null;
    }
  }, [contracts.multiTrancheVault]);

  const fetchAllData = useCallback(async () => {
    if (!contracts.multiTrancheVault) {
      setError('MultiTrancheVault not configured');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch all 6 tranches in parallel
      const tranchePromises = [1, 2, 3, 4, 5, 6].map(id => fetchTrancheData(id));
      const tranches = await Promise.all(tranchePromises);

      // Build tranche data map
      const data: Record<number, TrancheData> = {};
      tranches.forEach((tranche, index) => {
        if (tranche) {
          data[index + 1] = tranche;
        }
      });

      setTrancheData(data);

      // Fetch vault summary
      const summary = await fetchVaultSummary();
      setVaultSummary(summary);
    } catch (err) {
      console.error('Error fetching vault data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch vault data');
    } finally {
      setLoading(false);
    }
  }, [contracts.multiTrancheVault, fetchTrancheData, fetchVaultSummary]);

  // Auto-fetch on mount and setup refresh interval
  useEffect(() => {
    fetchAllData();

    // Refresh every 60 seconds
    const interval = setInterval(fetchAllData, 60000);

    return () => clearInterval(interval);
  }, [fetchAllData]);

  // Get user's balance in a specific tranche
  const getUserBalance = useCallback(async (userAddress: string, trancheId: number): Promise<{
    balance: number;
    lockUntil: number;
    stakeStartTime: number;
  } | null> => {
    if (!contracts.multiTrancheVault || !userAddress) return null;

    try {
      const addr = Address.parse(userAddress);
      const depositorData = await contracts.multiTrancheVault.getDepositorBalance(addr);

      // Check if this is the correct tranche
      if (Number(depositorData.trancheId) !== trancheId) {
        return { balance: 0, lockUntil: 0, stakeStartTime: 0 };
      }

      return {
        balance: parseFloat(fromNano(depositorData.balance)),
        lockUntil: Number(depositorData.lockUntil),
        stakeStartTime: Number(depositorData.stakeStartTime),
      };
    } catch (err) {
      console.error(`Error fetching user balance for tranche ${trancheId}:`, err);
      return null;
    }
  }, [contracts.multiTrancheVault]);

  return {
    trancheData,
    vaultSummary,
    loading,
    error,
    refetch: fetchAllData,
    getUserBalance,
  };
};
