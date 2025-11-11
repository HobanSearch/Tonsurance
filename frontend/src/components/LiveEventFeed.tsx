import { useState, useEffect } from 'react';

interface CatastropheEvent {
  id: string;
  type: 'hurricane' | 'earthquake';
  name: string;
  location: string;
  magnitude: number;  // Hurricane: category 1-5, Earthquake: magnitude
  timestamp: number;
  latitude: number;
  longitude: number;
  description: string;
}

export const LiveEventFeed = () => {
  const [events, setEvents] = useState<CatastropheEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch events from NOAA and USGS APIs
  const fetchEvents = async () => {
    try {
      setError(null);

      // For demo purposes, we'll use mock data
      // In production, this would fetch from NOAA Hurricane and USGS Earthquake APIs
      // or use a backend proxy to avoid CORS issues

      // Mock recent events
      const mockEvents: CatastropheEvent[] = [
        {
          id: 'h1',
          type: 'hurricane',
          name: 'Hurricane Idalia',
          location: 'Florida Gulf Coast',
          magnitude: 3,
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2, // 2 days ago
          latitude: 29.6516,
          longitude: -82.3248,
          description: 'Category 3 hurricane made landfall near Cedar Key, Florida',
        },
        {
          id: 'eq1',
          type: 'earthquake',
          name: 'M6.2 Earthquake',
          location: 'Southern California',
          magnitude: 6.2,
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5, // 5 days ago
          latitude: 35.7749,
          longitude: -117.5999,
          description: 'Strong earthquake felt across Los Angeles and San Bernardino counties',
        },
        {
          id: 'h2',
          type: 'hurricane',
          name: 'Tropical Storm Lee',
          location: 'Atlantic Ocean',
          magnitude: 0,  // Tropical Storm (not hurricane yet)
          timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
          latitude: 24.5,
          longitude: -75.0,
          description: 'Strengthening tropical storm, expected to become hurricane',
        },
        {
          id: 'eq2',
          type: 'earthquake',
          name: 'M6.8 Earthquake',
          location: 'Morocco',
          magnitude: 6.8,
          timestamp: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago
          latitude: 31.1,
          longitude: -8.4,
          description: 'Major earthquake struck near Marrakech, significant damage reported',
        },
      ];

      setEvents(mockEvents.sort((a, b) => b.timestamp - a.timestamp));
      setLastUpdate(new Date());
      setIsLoading(false);
    } catch (err) {
      setError('Failed to fetch event data');
      setIsLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchEvents();

    // Refresh every 5 minutes
    const interval = setInterval(fetchEvents, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Format timestamp
  const formatTimestamp = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Get event icon and color
  const getEventStyle = (event: CatastropheEvent) => {
    if (event.type === 'hurricane') {
      if (event.magnitude >= 3) {
        return { icon: '🌀', color: 'text-red-600', label: `Cat ${event.magnitude}` };
      }
      return { icon: '🌀', color: 'text-yellow-600', label: 'Tropical Storm' };
    } else {
      if (event.magnitude >= 7.0) {
        return { icon: '🏚️', color: 'text-red-600', label: `M${event.magnitude.toFixed(1)}` };
      } else if (event.magnitude >= 6.0) {
        return { icon: '🏚️', color: 'text-orange-600', label: `M${event.magnitude.toFixed(1)}` };
      }
      return { icon: '🏚️', color: 'text-yellow-600', label: `M${event.magnitude.toFixed(1)}` };
    }
  };

  return (
    <div className="border-2 border-cream-400 bg-cream-100 p-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-mono text-sm font-bold text-text-primary">&gt; LIVE_EVENTS</h3>
        {lastUpdate && !isLoading && (
          <button
            onClick={fetchEvents}
            className="font-mono text-xs text-copper-500 hover:text-copper-600 underline"
          >
            REFRESH
          </button>
        )}
      </div>

      {isLoading && (
        <div className="text-center py-8 font-mono text-sm text-text-secondary">
          Loading events...
        </div>
      )}

      {error && (
        <div className="p-3 border-2 border-red-400 bg-red-50 font-mono text-xs text-red-700">
          ERROR: {error}
        </div>
      )}

      {!isLoading && !error && events.length === 0 && (
        <div className="text-center py-8 font-mono text-sm text-text-secondary">
          No recent events
        </div>
      )}

      {!isLoading && !error && events.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {events.map((event) => {
            const style = getEventStyle(event);
            return (
              <div
                key={event.id}
                className="border-2 border-cream-400 bg-cream-50 p-3 hover:bg-copper-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{style.icon}</span>
                    <span className={`font-mono text-xs font-bold ${style.color}`}>
                      {style.label}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-text-secondary">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>

                <div className="font-mono text-sm font-bold text-text-primary mb-1">
                  {event.name}
                </div>

                <div className="font-mono text-xs text-text-secondary mb-1">
                  📍 {event.location}
                </div>

                <div className="font-mono text-xs text-text-secondary mb-2">
                  {event.latitude.toFixed(2)}°N, {Math.abs(event.longitude).toFixed(2)}°
                  {event.longitude >= 0 ? 'E' : 'W'}
                </div>

                <div className="font-mono text-xs text-text-primary">
                  {event.description}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {lastUpdate && (
        <div className="mt-3 pt-2 border-t-2 border-cream-400 font-mono text-xs text-text-secondary text-center">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      )}

      {/* Data Sources */}
      <div className="mt-3 pt-2 border-t-2 border-cream-400 font-mono text-xs text-text-secondary">
        <div className="font-bold mb-1">Data Sources:</div>
        <div>🌀 Hurricanes: NOAA National Hurricane Center</div>
        <div>🏚️ Earthquakes: USGS Earthquake Hazards Program</div>
      </div>
    </div>
  );
};
