import { useState, useEffect } from 'react';
import { escrowClient, EscrowStatusResponse } from '../../lib/escrow-client';
import { InfoPanel } from '../terminal';

interface LiveConditionStatusProps {
  escrowId: number;
}

/**
 * LiveConditionStatus Component
 * Displays real-time status of escrow release conditions
 */
export const LiveConditionStatus = ({ escrowId }: LiveConditionStatusProps) => {
  const [status, setStatus] = useState<EscrowStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        setError(null);
        const result = await escrowClient.getEscrowStatus(escrowId);
        setStatus(result);
      } catch (err) {
        console.error('Failed to load status:', err);
        setError(err instanceof Error ? err.message : 'Failed to load status');
      } finally {
        setLoading(false);
      }
    };

    // Load initial status
    loadStatus();

    // Refresh every 10 seconds for real-time updates
    const interval = setInterval(loadStatus, 10000);

    return () => clearInterval(interval);
  }, [escrowId]);

  const formatSeconds = (seconds: number): string => {
    if (seconds <= 0) return 'Expired';

    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const getConditionIcon = (description: string): string => {
    if (description.includes('Oracle')) return '🔮';
    if (description.includes('Time')) return '⏰';
    if (description.includes('Manual') || description.includes('Approval')) return '✍️';
    if (description.includes('Chain') || description.includes('Event')) return '⛓️';
    if (description.includes('Multisig')) return '👥';
    return '📋';
  };

  if (loading) {
    return (
      <div className="font-mono text-sm text-text-secondary animate-pulse">
        Loading condition status...
      </div>
    );
  }

  if (error) {
    return (
      <div className="font-mono text-sm text-terminal-red border-2 border-terminal-red bg-terminal-red/10 p-3">
        ⚠️ Error: {error}
      </div>
    );
  }

  if (!status) {
    return (
      <div className="font-mono text-sm text-text-tertiary">
        No status data available
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Conditions List */}
      {status.conditions_status.map((condition, idx) => (
        <div key={idx} className="border-3 border-cream-600 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">{getConditionIcon(condition.description)}</span>
              <span className="font-mono text-sm font-semibold text-text-primary">
                Condition {condition.index + 1}
              </span>
            </div>
            <span
              className={`font-mono text-xs px-2 py-1 border-2 ${
                condition.met
                  ? 'bg-terminal-green/10 text-terminal-green border-terminal-green'
                  : 'bg-text-tertiary/10 text-text-tertiary border-text-tertiary'
              }`}
            >
              {condition.met ? '✓ MET' : '⏳ PENDING'}
            </span>
          </div>
          <p className="font-mono text-xs text-text-secondary pl-7">
            {condition.description}
          </p>
        </div>
      ))}

      {/* Overall Status */}
      {status.can_release && (
        <div className="border-3 border-terminal-green bg-terminal-green/10 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">✓</span>
            <p className="font-mono text-sm font-semibold text-terminal-green">
              All conditions met! Escrow can be released.
            </p>
          </div>
        </div>
      )}

      {/* Time Remaining */}
      {status.time_remaining_seconds > 0 && (
        <div className="border-3 border-copper-500 bg-copper-50 p-3">
          <div className="flex items-center justify-between font-mono text-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">⏱️</span>
              <span className="text-text-secondary">Time until timeout:</span>
            </div>
            <span className="font-semibold text-copper-600">
              {formatSeconds(status.time_remaining_seconds)}
            </span>
          </div>
        </div>
      )}

      {status.time_remaining_seconds <= 0 && (
        <InfoPanel variant="warning">
          <div className="font-mono text-xs">
            ⚠️ Escrow timeout reached. Timeout action will be executed.
          </div>
        </InfoPanel>
      )}

      {/* Progress Summary */}
      <div className="border-t-2 border-cream-600 pt-3">
        <div className="flex justify-between items-center font-mono text-xs text-text-tertiary">
          <span>Progress:</span>
          <span>
            {status.conditions_status.filter((c) => c.met).length} / {status.conditions_status.length} conditions met
          </span>
        </div>
        <div className="w-full bg-cream-400 h-2 mt-2">
          <div
            className="bg-copper-500 h-2 transition-all duration-300"
            style={{
              width: `${
                (status.conditions_status.filter((c) => c.met).length / status.conditions_status.length) * 100
              }%`,
            }}
          />
        </div>
      </div>

      {/* Auto-refresh Indicator */}
      <div className="text-center text-xs text-text-tertiary font-mono">
        Auto-refreshing every 10 seconds
      </div>
    </div>
  );
};
