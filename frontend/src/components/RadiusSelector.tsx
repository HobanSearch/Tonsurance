import { useState, useEffect } from 'react';

interface RadiusSelectorProps {
  value: number;
  onChange: (radius: number) => void;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
}

export const RadiusSelector = ({
  value,
  onChange,
  min = 10,
  max = 500,
  step = 5,
  defaultValue = 50,
}: RadiusSelectorProps) => {
  const [localValue, setLocalValue] = useState(value || defaultValue);

  useEffect(() => {
    setLocalValue(value || defaultValue);
  }, [value, defaultValue]);

  const handleChange = (newValue: number) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  // Quick select presets
  const presets = [
    { label: '10 km', value: 10, description: 'Neighborhood' },
    { label: '25 km', value: 25, description: 'City district' },
    { label: '50 km', value: 50, description: 'Small city' },
    { label: '100 km', value: 100, description: 'Metro area' },
    { label: '200 km', value: 200, description: 'Large region' },
    { label: '500 km', value: 500, description: 'Maximum' },
  ];

  // Calculate percentage for visual display
  const percentage = ((localValue - min) / (max - min)) * 100;

  // Calculate approximate area
  const areaKm2 = Math.PI * localValue * localValue;
  const areaMi2 = areaKm2 * 0.386102;

  return (
    <div className="border-2 border-cream-400 p-4 bg-cream-100">
      <h3 className="font-mono text-sm font-bold text-text-primary mb-3">&gt; COVERAGE_RADIUS</h3>

      {/* Current Value Display */}
      <div className="mb-4 p-3 border-2 border-copper-400 bg-copper-50">
        <div className="flex justify-between items-baseline">
          <span className="font-mono text-2xl font-bold text-copper-600">{localValue} km</span>
          <span className="font-mono text-xs text-text-secondary">
            ({(localValue * 0.621371).toFixed(1)} miles)
          </span>
        </div>
        <div className="font-mono text-xs text-text-secondary mt-1">
          Coverage Area: ~{areaKm2.toLocaleString('en-US', { maximumFractionDigits: 0 })} km²
          ({areaMi2.toLocaleString('en-US', { maximumFractionDigits: 0 })} mi²)
        </div>
      </div>

      {/* Slider */}
      <div className="mb-4">
        <div className="relative pt-1">
          {/* Track */}
          <div className="relative h-3 bg-cream-300 border-2 border-cream-400">
            {/* Fill */}
            <div
              className="absolute h-full bg-copper-500 border-r-2 border-copper-600 transition-all"
              style={{ width: `${percentage}%` }}
            />
          </div>

          {/* Input Range */}
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={localValue}
            onChange={(e) => handleChange(parseInt(e.target.value))}
            className="absolute top-0 w-full h-3 opacity-0 cursor-pointer"
          />
        </div>

        {/* Min/Max Labels */}
        <div className="flex justify-between mt-1">
          <span className="font-mono text-xs text-text-secondary">{min} km</span>
          <span className="font-mono text-xs text-text-secondary">{max} km</span>
        </div>
      </div>

      {/* Quick Presets */}
      <div>
        <label className="block font-mono text-xs text-text-secondary mb-2">
          Quick select:
        </label>
        <div className="grid grid-cols-3 gap-2">
          {presets.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handleChange(preset.value)}
              className={`p-2 border-2 transition-colors ${
                localValue === preset.value
                  ? 'border-copper-500 bg-copper-500 text-cream-50'
                  : 'border-cream-400 bg-cream-50 hover:bg-copper-100 text-text-primary'
              }`}
            >
              <div className="font-mono text-sm font-bold">{preset.label}</div>
              <div className="font-mono text-xs opacity-75">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Manual Input */}
      <div className="mt-4">
        <label className="block font-mono text-xs text-text-secondary mb-1">
          Or enter custom radius (km):
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={localValue}
            onChange={(e) => {
              const val = parseInt(e.target.value);
              if (!isNaN(val) && val >= min && val <= max) {
                handleChange(val);
              }
            }}
            className="flex-1 px-3 py-2 border-2 border-cream-400 bg-cream-50 font-mono text-sm focus:outline-none focus:border-copper-500"
          />
          <span className="flex items-center px-3 border-2 border-cream-400 bg-cream-200 font-mono text-sm text-text-secondary">
            km
          </span>
        </div>
      </div>

      {/* Risk Level Indicator */}
      <div className="mt-4 p-2 border-2 border-cream-400 bg-cream-50">
        <div className="font-mono text-xs text-text-secondary">
          {localValue <= 50 && (
            <span>
              <span className="text-green-600 font-bold">● PRECISION</span> - Specific local area coverage
            </span>
          )}
          {localValue > 50 && localValue <= 150 && (
            <span>
              <span className="text-blue-600 font-bold">● STANDARD</span> - City-level coverage
            </span>
          )}
          {localValue > 150 && localValue <= 300 && (
            <span>
              <span className="text-yellow-600 font-bold">● REGIONAL</span> - Multi-city coverage
            </span>
          )}
          {localValue > 300 && localValue <= 400 && (
            <span>
              <span className="text-orange-600 font-bold">● WIDE AREA</span> - State-level coverage
            </span>
          )}
          {localValue > 400 && (
            <span>
              <span className="text-red-600 font-bold">● MAXIMUM</span> - Multi-state coverage
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
