import { useState } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { Address } from '@ton/core';

interface BeneficiarySelectorProps {
  onSelect: (beneficiaryAddress: string | null, mode: 'self' | 'other') => void;
  allowSelf?: boolean;
  initialMode?: 'self' | 'other';
}

export function BeneficiarySelector({
  onSelect,
  allowSelf = true,
  initialMode = 'self'
}: BeneficiarySelectorProps) {
  const userAddress = useTonAddress();
  const [mode, setMode] = useState<'self' | 'other'>(initialMode);
  const [beneficiaryInput, setBeneficiaryInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const validateAddress = (address: string): boolean => {
    try {
      Address.parse(address);
      return true;
    } catch {
      return false;
    }
  };

  const handleModeChange = (newMode: 'self' | 'other') => {
    setMode(newMode);
    setValidationError(null);

    if (newMode === 'self') {
      onSelect(userAddress, 'self');
    } else {
      onSelect(null, 'other');
      setBeneficiaryInput('');
    }
  };

  const handleAddressInput = (value: string) => {
    setBeneficiaryInput(value);

    if (value.trim() === '') {
      setValidationError(null);
      onSelect(null, 'other');
      return;
    }

    if (validateAddress(value)) {
      setValidationError(null);
      onSelect(value, 'other');
    } else {
      setValidationError('Invalid TON address');
      onSelect(null, 'other');
    }
  };

  return (
    <div className="space-y-4">
      <label className="block text-xs font-semibold text-text-secondary mb-2 uppercase">
        Who will be covered?
      </label>

      {/* Mode Selector */}
      <div className="grid grid-cols-2 gap-3">
        {allowSelf && (
          <button
            onClick={() => handleModeChange('self')}
            className={`px-4 py-3 border-3 transition-all text-left ${
              mode === 'self'
                ? 'border-copper-500 bg-copper-50 shadow-[0_0_0_2px_#D87665]'
                : 'border-cream-400 hover:bg-cream-300'
            }`}
          >
            <div className="font-semibold text-sm">Myself</div>
            <div className="text-xs text-text-tertiary mt-1">
              I'll be the beneficiary
            </div>
          </button>
        )}

        <button
          onClick={() => handleModeChange('other')}
          className={`px-4 py-3 border-3 transition-all text-left ${
            mode === 'other'
              ? 'border-copper-500 bg-copper-50 shadow-[0_0_0_2px_#D87665]'
              : 'border-cream-400 hover:bg-cream-300'
          }`}
        >
          <div className="font-semibold text-sm">Someone Else</div>
          <div className="text-xs text-text-tertiary mt-1">
            Buy as gift or for beneficiary
          </div>
        </button>
      </div>

      {/* Address Input (shown when mode === 'other') */}
      {mode === 'other' && (
        <div>
          <input
            type="text"
            value={beneficiaryInput}
            onChange={(e) => handleAddressInput(e.target.value)}
            className={`w-full px-3 py-2 bg-cream-300/50 border-2 font-mono text-sm ${
              validationError
                ? 'border-red-500'
                : 'border-cream-400 focus:border-copper-500'
            } outline-none`}
            placeholder="EQC... or UQC..."
          />

          {validationError && (
            <p className="text-xs text-red-600 mt-1">
              {validationError}
            </p>
          )}

          <p className="text-xs text-text-tertiary mt-1">
            &gt; Enter the TON wallet address of the person you want to protect
          </p>
        </div>
      )}

      {/* Summary */}
      {mode === 'self' && userAddress && (
        <div className="p-3 bg-terminal-green/10 border-2 border-terminal-green">
          <div className="text-xs font-mono text-terminal-green">
            ✓ You ({userAddress.slice(0, 6)}...{userAddress.slice(-4)}) will be the beneficiary
          </div>
        </div>
      )}

      {mode === 'other' && beneficiaryInput && !validationError && (
        <div className="p-3 bg-terminal-green/10 border-2 border-terminal-green">
          <div className="text-xs font-mono text-terminal-green">
            ✓ Covering: {beneficiaryInput.slice(0, 6)}...{beneficiaryInput.slice(-4)}
          </div>
        </div>
      )}
    </div>
  );
}
