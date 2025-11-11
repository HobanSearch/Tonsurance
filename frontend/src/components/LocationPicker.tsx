import { useState } from 'react';

interface LocationPickerProps {
  onLocationSelect: (lat: number, lon: number, address?: string) => void;
  defaultMode?: 'address' | 'manual';
}

export const LocationPicker = ({ onLocationSelect, defaultMode = 'address' }: LocationPickerProps) => {
  const [mode, setMode] = useState<'address' | 'manual'>(defaultMode);
  const [addressInput, setAddressInput] = useState('');
  const [latInput, setLatInput] = useState('');
  const [lonInput, setLonInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lon: number;
    address?: string;
  } | null>(null);

  // Pre-defined popular locations for quick selection
  const popularLocations = [
    { name: 'Miami, FL', lat: 25.7617, lon: -80.1918, description: 'Hurricane-prone coastal city' },
    { name: 'New Orleans, LA', lat: 29.9511, lon: -90.0715, description: 'Gulf Coast hurricane risk' },
    { name: 'San Francisco, CA', lat: 37.7749, lon: -122.4194, description: 'High earthquake risk' },
    { name: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437, description: 'Earthquake-prone area' },
    { name: 'Tokyo, Japan', lat: 35.6762, lon: 139.6503, description: 'Earthquake & typhoon risk' },
    { name: 'Manila, Philippines', lat: 14.5995, lon: 120.9842, description: 'Typhoon-prone region' },
  ];

  // Geocode address using Nominatim (OpenStreetMap)
  const geocodeAddress = async () => {
    if (!addressInput.trim()) {
      setError('Please enter an address');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(addressInput)}&format=json&limit=1`
      );
      const data = await response.json();

      if (data.length === 0) {
        setError('Address not found. Try a different search or use manual entry.');
        setIsLoading(false);
        return;
      }

      const location = {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        address: data[0].display_name,
      };

      setSelectedLocation(location);
      onLocationSelect(location.lat, location.lon, location.address);
      setIsLoading(false);
    } catch (err) {
      setError('Geocoding failed. Please try manual entry.');
      setIsLoading(false);
    }
  };

  // Handle manual coordinate entry
  const handleManualEntry = () => {
    const lat = parseFloat(latInput);
    const lon = parseFloat(lonInput);

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError('Latitude must be between -90 and 90');
      return;
    }

    if (isNaN(lon) || lon < -180 || lon > 180) {
      setError('Longitude must be between -180 and 180');
      return;
    }

    setError(null);
    const location = { lat, lon };
    setSelectedLocation(location);
    onLocationSelect(lat, lon);
  };

  // Handle popular location selection
  const handlePopularLocation = (location: { name: string; lat: number; lon: number }) => {
    const loc = { lat: location.lat, lon: location.lon, address: location.name };
    setSelectedLocation(loc);
    onLocationSelect(location.lat, location.lon, location.name);
  };

  return (
    <div className="border-2 border-cream-400 p-4 bg-cream-100">
      <h3 className="font-mono text-sm font-bold text-text-primary mb-3">&gt; COVERAGE_LOCATION</h3>

      {/* Mode Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('address')}
          className={`px-3 py-1 border-2 font-mono text-sm transition-colors ${
            mode === 'address'
              ? 'bg-copper-500 text-cream-50 border-copper-600'
              : 'border-cream-400 hover:bg-cream-200 text-text-primary'
          }`}
        >
          ADDRESS_SEARCH
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`px-3 py-1 border-2 font-mono text-sm transition-colors ${
            mode === 'manual'
              ? 'bg-copper-500 text-cream-50 border-copper-600'
              : 'border-cream-400 hover:bg-cream-200 text-text-primary'
          }`}
        >
          MANUAL_COORDS
        </button>
      </div>

      {/* Address Search Mode */}
      {mode === 'address' && (
        <div className="space-y-3">
          <div>
            <label className="block font-mono text-xs text-text-secondary mb-1">
              Enter address or city:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && geocodeAddress()}
                placeholder="e.g., Miami, FL or 123 Main St, New York"
                className="flex-1 px-3 py-2 border-2 border-cream-400 bg-cream-50 font-mono text-sm focus:outline-none focus:border-copper-500"
              />
              <button
                onClick={geocodeAddress}
                disabled={isLoading}
                className="px-4 py-2 border-2 border-cream-400 bg-copper-500 text-cream-50 font-mono text-sm hover:bg-copper-600 disabled:opacity-50 transition-colors"
              >
                {isLoading ? 'SEARCHING...' : 'SEARCH'}
              </button>
            </div>
          </div>

          {/* Popular Locations */}
          <div>
            <label className="block font-mono text-xs text-text-secondary mb-2">
              Or select a popular location:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {popularLocations.map((loc) => (
                <button
                  key={loc.name}
                  onClick={() => handlePopularLocation(loc)}
                  className="p-2 border-2 border-cream-400 bg-cream-50 hover:bg-copper-100 text-left transition-colors"
                >
                  <div className="font-mono text-sm font-bold text-text-primary">{loc.name}</div>
                  <div className="font-mono text-xs text-text-secondary">{loc.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manual Coordinates Mode */}
      {mode === 'manual' && (
        <div className="space-y-3">
          <div>
            <label className="block font-mono text-xs text-text-secondary mb-1">
              Latitude (-90 to 90):
            </label>
            <input
              type="number"
              value={latInput}
              onChange={(e) => setLatInput(e.target.value)}
              placeholder="e.g., 25.7617"
              step="0.0001"
              min="-90"
              max="90"
              className="w-full px-3 py-2 border-2 border-cream-400 bg-cream-50 font-mono text-sm focus:outline-none focus:border-copper-500"
            />
          </div>

          <div>
            <label className="block font-mono text-xs text-text-secondary mb-1">
              Longitude (-180 to 180):
            </label>
            <input
              type="number"
              value={lonInput}
              onChange={(e) => setLonInput(e.target.value)}
              placeholder="e.g., -80.1918"
              step="0.0001"
              min="-180"
              max="180"
              className="w-full px-3 py-2 border-2 border-cream-400 bg-cream-50 font-mono text-sm focus:outline-none focus:border-copper-500"
            />
          </div>

          <button
            onClick={handleManualEntry}
            className="w-full px-4 py-2 border-2 border-cream-400 bg-copper-500 text-cream-50 font-mono text-sm hover:bg-copper-600 transition-colors"
          >
            SET_LOCATION
          </button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-3 p-2 border-2 border-red-400 bg-red-50 font-mono text-xs text-red-700">
          ERROR: {error}
        </div>
      )}

      {/* Selected Location Display */}
      {selectedLocation && (
        <div className="mt-3 p-3 border-2 border-green-400 bg-green-50">
          <div className="font-mono text-xs font-bold text-green-700 mb-1">✓ LOCATION_SET:</div>
          {selectedLocation.address && (
            <div className="font-mono text-xs text-green-700 mb-1">
              {selectedLocation.address}
            </div>
          )}
          <div className="font-mono text-xs text-green-700">
            Coordinates: {selectedLocation.lat.toFixed(4)}°N, {Math.abs(selectedLocation.lon).toFixed(4)}°
            {selectedLocation.lon >= 0 ? 'E' : 'W'}
          </div>
        </div>
      )}
    </div>
  );
};
