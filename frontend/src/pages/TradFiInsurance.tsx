import { useState } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { toNano, beginCell } from '@ton/core';
import { TerminalWindow, TerminalOutput, RetroButton } from '../components/terminal';
import { LocationPicker } from '../components/LocationPicker';
import { RadiusSelector } from '../components/RadiusSelector';
import { LiveEventFeed } from '../components/LiveEventFeed';
import { CONTRACTS, PRODUCT_TYPES, getAssetId } from '../config/contracts';
import { useContracts } from '../hooks/useContracts';

type CatastropheType = 'hurricane' | 'earthquake';

interface PolicyDetails {
  catastropheType: CatastropheType;
  coverageAmount: string;
  durationDays: string;
  latitude: number | null;
  longitude: number | null;
  locationAddress?: string;
  radiusKm: number;
}

export const TradFiInsurance = () => {
  const userAddress = useTonAddress();
  const { contracts, sender, isConfigured } = useContracts();
  const [isLoading, setIsLoading] = useState(false);

  // Policy configuration
  const [selectedType, setSelectedType] = useState<CatastropheType | null>(null);
  const [coverageAmount, setCoverageAmount] = useState('10000');
  const [durationValue, setDurationValue] = useState('30');
  const [durationUnit, setDurationUnit] = useState<'hours' | 'days'>('days');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationAddress, setLocationAddress] = useState<string | undefined>(undefined);
  const [radiusKm, setRadiusKm] = useState(50);

  // Calculate duration in days
  const getDurationInDays = (): number => {
    const value = parseFloat(durationValue);
    if (isNaN(value)) return 0;
    return durationUnit === 'hours' ? value / 24 : value;
  };

  // Calculate premium
  const calculatePremium = (): number => {
    if (!selectedType || !coverageAmount || !durationValue) return 0;

    const amount = parseFloat(coverageAmount);
    const days = getDurationInDays();

    // Hurricane: 3% APR, Earthquake: 1.5% APR
    const aprBasisPoints = selectedType === 'hurricane' ? 300 : 150;

    // Formula: coverage × (APR_BPS / 10000) × (days / 365)
    return (amount * aprBasisPoints * days) / (10000 * 365);
  };

  const premium = calculatePremium();

  // Validate duration based on unit
  const isDurationValid = (): boolean => {
    const value = parseFloat(durationValue);
    if (isNaN(value)) return false;

    if (durationUnit === 'hours') {
      return value >= 6 && value <= 8760; // 6 hours to 365 days
    } else {
      return value >= 0.25 && value <= 365; // 0.25 days (6 hours) to 365 days
    }
  };

  const isFormValid =
    selectedType !== null &&
    parseFloat(coverageAmount) >= 1000 &&
    parseFloat(coverageAmount) <= 100000 &&
    isDurationValid() &&
    latitude !== null &&
    longitude !== null &&
    radiusKm >= 10 &&
    radiusKm <= 500;

  // Handle location selection
  const handleLocationSelect = (lat: number, lon: number, address?: string) => {
    setLatitude(lat);
    setLongitude(lon);
    setLocationAddress(address);
  };

  // Handle policy purchase
  const handlePurchase = async () => {
    if (!isFormValid || !userAddress) return;

    if (!isConfigured || !contracts.masterFactory) {
      alert('Contracts not configured. MasterFactory address missing.');
      return;
    }

    setIsLoading(true);

    try {
      // Get asset ID (1=Hurricane, 2=Earthquake)
      const assetId = selectedType === 'hurricane' ? 1 : 2;

      // Convert duration to hours
      const durationHours = durationUnit === 'hours'
        ? parseInt(durationValue)
        : Math.floor(parseFloat(durationValue) * 24);

      // Convert lat/lon to microdegrees (degrees * 1000000)
      const latMicro = Math.floor((latitude || 0) * 1000000);
      const lonMicro = Math.floor((longitude || 0) * 1000000);

      // Build policy params cell for natural catastrophe insurance
      const policyParams = beginCell()
        .storeCoins(toNano(coverageAmount))
        .storeUint(durationHours, 16)
        .storeInt(latMicro, 32)
        .storeInt(lonMicro, 32)
        .storeUint(radiusKm, 16)
        .endCell();

      // Gas: 1.5 TON for first policy of each type (deploys sub-factory), 0.5 TON after
      const gasAmount = toNano('1.5');
      const premiumNano = toNano(premium.toString());

      // Call MasterFactory with v3 architecture
      await contracts.masterFactory.sendCreatePolicy(sender, {
        value: gasAmount + premiumNano,
        productType: PRODUCT_TYPES.TRADFI_NATCAT, // = 5
        assetId: assetId,
        policyParams: policyParams
      });

      const durationDisplay = durationUnit === 'hours'
        ? `${durationValue} hours`
        : `${durationValue} days`;

      alert(`✓ Policy Created Successfully!\n\nType: ${selectedType}\nCoverage: $${coverageAmount}\nDuration: ${durationDisplay}\nPremium: ${premium.toFixed(2)} TON\nLocation: ${locationAddress || `${latitude?.toFixed(4)}°, ${longitude?.toFixed(4)}°`}`);

      setIsLoading(false);
    } catch (error: any) {
      console.error('Policy creation failed:', error);

      if (error.message?.includes('User rejected')) {
        alert('Transaction was rejected');
      } else if (error.message?.includes('Insufficient balance')) {
        alert('Insufficient balance for transaction');
      } else {
        alert(`Failed to create policy: ${error.message || 'Unknown error'}`);
      }

      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-200 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <TerminalWindow title="TRADFI_NATURAL_CATASTROPHE_INSURANCE">
          <TerminalOutput>
            <div className="font-mono">
              <p className="text-copper-500 font-bold mb-2">
                &gt; PARAMETRIC INSURANCE FOR NATURAL CATASTROPHES
              </p>
              <p className="text-text-secondary text-sm mb-4">
                Automated payouts when hurricanes or earthquakes occur within your coverage area.
                <br />
                No claims, no paperwork - instant settlement based on verified event data.
              </p>
            </div>
          </TerminalOutput>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form - Left Column (2/3 width) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Step 1: Select Catastrophe Type */}
              <div className="border-2 border-cream-400 p-4 bg-cream-100">
                <h3 className="font-mono text-sm font-bold text-text-primary mb-3">
                  &gt; STEP_1: SELECT_CATASTROPHE_TYPE
                </h3>

                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedType('hurricane')}
                    className={`p-4 border-2 transition-colors ${
                      selectedType === 'hurricane'
                        ? 'border-copper-500 bg-copper-500 text-cream-50'
                        : 'border-cream-400 bg-cream-50 hover:bg-copper-100 text-text-primary'
                    }`}
                  >
                    <div className="text-4xl mb-2">🌀</div>
                    <div className="font-mono text-sm font-bold">HURRICANE</div>
                    <div className="font-mono text-xs opacity-75 mt-1">
                      Category 3+ triggers
                    </div>
                    <div className="font-mono text-xs opacity-75">3.0% APR</div>
                  </button>

                  <button
                    onClick={() => setSelectedType('earthquake')}
                    className={`p-4 border-2 transition-colors ${
                      selectedType === 'earthquake'
                        ? 'border-copper-500 bg-copper-500 text-cream-50'
                        : 'border-cream-400 bg-cream-50 hover:bg-copper-100 text-text-primary'
                    }`}
                  >
                    <div className="text-4xl mb-2">🏚️</div>
                    <div className="font-mono text-sm font-bold">EARTHQUAKE</div>
                    <div className="font-mono text-xs opacity-75 mt-1">
                      Magnitude 6.0+ triggers
                    </div>
                    <div className="font-mono text-xs opacity-75">1.5% APR</div>
                  </button>
                </div>
              </div>

              {/* Step 2: Coverage Parameters */}
              {selectedType && (
                <div className="border-2 border-cream-400 p-4 bg-cream-100">
                  <h3 className="font-mono text-sm font-bold text-text-primary mb-3">
                    &gt; STEP_2: COVERAGE_PARAMETERS
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block font-mono text-xs text-text-secondary mb-1">
                        Coverage Amount (USD):
                      </label>
                      <input
                        type="number"
                        value={coverageAmount}
                        onChange={(e) => setCoverageAmount(e.target.value)}
                        min="1000"
                        max="100000"
                        step="1000"
                        className="w-full px-3 py-2 border-2 border-cream-400 bg-cream-50 font-mono text-sm focus:outline-none focus:border-copper-500"
                      />
                      <div className="font-mono text-xs text-text-secondary mt-1">
                        Min: $1,000 | Max: $100,000
                      </div>
                    </div>

                    <div>
                      <label className="block font-mono text-xs text-text-secondary mb-1">
                        Duration:
                      </label>

                      {/* Time Unit Selector */}
                      <div className="flex gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            setDurationUnit('hours');
                            setDurationValue('24'); // Default to 24 hours
                          }}
                          className={`px-3 py-1 border-2 transition-colors text-xs font-mono font-bold ${
                            durationUnit === 'hours'
                              ? 'bg-copper-500 text-cream-50 border-copper-600'
                              : 'border-cream-400 hover:bg-cream-200 text-text-primary'
                          }`}
                        >
                          HOURS
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDurationUnit('days');
                            setDurationValue('30'); // Default to 30 days
                          }}
                          className={`px-3 py-1 border-2 transition-colors text-xs font-mono font-bold ${
                            durationUnit === 'days'
                              ? 'bg-copper-500 text-cream-50 border-copper-600'
                              : 'border-cream-400 hover:bg-cream-200 text-text-primary'
                          }`}
                        >
                          DAYS
                        </button>
                      </div>

                      {/* Duration Input */}
                      <input
                        type="number"
                        value={durationValue}
                        onChange={(e) => setDurationValue(e.target.value)}
                        min={durationUnit === 'hours' ? '6' : '0.25'}
                        max={durationUnit === 'hours' ? '8760' : '365'}
                        step={durationUnit === 'hours' ? '1' : '0.25'}
                        className="w-full px-3 py-2 border-2 border-cream-400 bg-cream-50 font-mono text-sm focus:outline-none focus:border-copper-500"
                      />
                      <div className="font-mono text-xs text-text-secondary mt-1">
                        {durationUnit === 'hours'
                          ? 'Min: 6 hrs | Max: 8760 hrs (365 days)'
                          : 'Min: 0.25 days (6 hrs) | Max: 365 days'}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Location Selection */}
              {selectedType && (
                <LocationPicker onLocationSelect={handleLocationSelect} />
              )}

              {/* Step 4: Coverage Radius */}
              {selectedType && latitude !== null && longitude !== null && (
                <RadiusSelector value={radiusKm} onChange={setRadiusKm} />
              )}

              {/* Premium Summary */}
              {selectedType && isFormValid && (
                <div className="border-2 border-green-400 p-4 bg-green-50">
                  <h3 className="font-mono text-sm font-bold text-green-700 mb-3">
                    ✓ PREMIUM_CALCULATION
                  </h3>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between font-mono text-sm">
                      <span className="text-text-secondary">Coverage:</span>
                      <span className="text-text-primary font-bold">
                        ${parseFloat(coverageAmount).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between font-mono text-sm">
                      <span className="text-text-secondary">Duration:</span>
                      <span className="text-text-primary font-bold">
                        {durationUnit === 'hours'
                          ? `${durationValue} hours (${getDurationInDays().toFixed(2)} days)`
                          : `${durationValue} days`}
                      </span>
                    </div>
                    <div className="flex justify-between font-mono text-sm">
                      <span className="text-text-secondary">APR:</span>
                      <span className="text-text-primary font-bold">
                        {selectedType === 'hurricane' ? '3.0%' : '1.5%'}
                      </span>
                    </div>
                    <div className="flex justify-between font-mono text-sm">
                      <span className="text-text-secondary">Location:</span>
                      <span className="text-text-primary font-bold">
                        {locationAddress || `${latitude?.toFixed(4)}°, ${longitude?.toFixed(4)}°`}
                      </span>
                    </div>
                    <div className="flex justify-between font-mono text-sm">
                      <span className="text-text-secondary">Radius:</span>
                      <span className="text-text-primary font-bold">{radiusKm} km</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t-2 border-green-400">
                    <div className="flex justify-between font-mono text-lg">
                      <span className="text-green-700 font-bold">TOTAL PREMIUM:</span>
                      <span className="text-green-700 font-bold">
                        {premium.toFixed(2)} TON
                      </span>
                    </div>
                  </div>

                  {!userAddress && (
                    <div className="mt-4 p-3 border-2 border-yellow-400 bg-yellow-50 font-mono text-xs text-yellow-700">
                      ⚠️ Please connect your wallet to purchase
                    </div>
                  )}

                  {userAddress && (
                    <RetroButton
                      onClick={handlePurchase}
                      disabled={isLoading}
                      className="w-full mt-4"
                    >
                      {isLoading ? 'CREATING_POLICY...' : 'PURCHASE_POLICY'}
                    </RetroButton>
                  )}
                </div>
              )}
            </div>

            {/* Sidebar - Right Column (1/3 width) */}
            <div className="space-y-6">
              {/* Live Event Feed */}
              <LiveEventFeed />

              {/* Info Panel */}
              <div className="border-2 border-cream-400 p-4 bg-cream-100">
                <h3 className="font-mono text-sm font-bold text-text-primary mb-3">
                  &gt; HOW_IT_WORKS
                </h3>
                <div className="space-y-2 font-mono text-xs text-text-secondary">
                  <div>
                    <span className="text-copper-500 font-bold">1. SELECT:</span> Choose hurricane or
                    earthquake coverage
                  </div>
                  <div>
                    <span className="text-copper-500 font-bold">2. CONFIGURE:</span> Set location and
                    radius
                  </div>
                  <div>
                    <span className="text-copper-500 font-bold">3. AUTOMATIC:</span> Policy triggers
                    when event occurs in your area
                  </div>
                  <div>
                    <span className="text-copper-500 font-bold">4. INSTANT:</span> Receive payout
                    within 10 seconds
                  </div>
                </div>
              </div>

              {/* Trigger Info */}
              <div className="border-2 border-cream-400 p-4 bg-cream-100">
                <h3 className="font-mono text-sm font-bold text-text-primary mb-3">
                  &gt; TRIGGER_CRITERIA
                </h3>
                <div className="space-y-3 font-mono text-xs text-text-secondary">
                  <div>
                    <div className="text-copper-500 font-bold mb-1">🌀 HURRICANE:</div>
                    <div>• Category 3+ (111+ mph winds)</div>
                    <div>• Within coverage radius</div>
                    <div>• Data: NOAA NHC</div>
                  </div>
                  <div>
                    <div className="text-copper-500 font-bold mb-1">🏚️ EARTHQUAKE:</div>
                    <div>• Magnitude 6.0+</div>
                    <div>• Epicenter within radius</div>
                    <div>• Data: USGS</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TerminalWindow>
      </div>
    </div>
  );
};
