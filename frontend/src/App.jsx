import { useState, useEffect, useCallback } from 'react';
import DemandChart from './components/DemandChart';
import GridMap from './components/GridMap';
import AlertPanel from './components/AlertPanel';
import './index.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const POLL_INTERVAL = 5000; // 5 seconds

export default function App() {
  const [liveData, setLiveData] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);

  // ── Fetch live meter data ───────────────────────────────
  const fetchLiveData = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/grid/live`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLiveData(data.meters || []);
      setIsConnected(true);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('[Fetch] Live data error:', err);
      setIsConnected(false);
      setError(err.message);
    }
  }, []);

  // ── Fetch forecast ──────────────────────────────────────
  const fetchForecast = useCallback(async () => {
    try {
      // Forecast for the first meter
      const meterToForecast = 'meter_001';
      const res = await fetch(`${API_BASE}/api/predictions/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meter_id: meterToForecast,
          lookback_minutes: 10,
        }),
      });
      if (!res.ok) {
        // 400 = not enough data yet, don't treat as error
        if (res.status === 400) {
          setForecastData(null);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setForecastData(data);
    } catch (err) {
      console.error('[Fetch] Forecast error:', err);
      // Don't set global error for forecast failures
    }
  }, []);

  // ── Fetch alerts ────────────────────────────────────────
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/grid/alerts?limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('[Fetch] Alerts error:', err);
    }
  }, []);

  // ── Polling ─────────────────────────────────────────────
  useEffect(() => {
    // Initial fetch
    fetchLiveData();
    fetchForecast();
    fetchAlerts();

    // Set up polling
    const interval = setInterval(() => {
      fetchLiveData();
      fetchForecast();
      fetchAlerts();
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [fetchLiveData, fetchForecast, fetchAlerts]);

  return (
    <div className="app">
      {/* ── Header ────────────────────────────────────────── */}
      <header className="header glass-card" id="app-header">
        <div className="header__brand">
          <div className="header__logo">⚡</div>
          <div>
            <div className="header__title">Smart Grid Optimization</div>
            <div className="header__subtitle">
              AI-Powered Load Management · Tamil Nadu Grid
            </div>
          </div>
        </div>

        <div className="header__status">
          <div className="status-indicator">
            <div className={`status-dot ${isConnected ? 'status-dot--live' : 'status-dot--error'}`} />
            <span>{isConnected ? 'Live' : 'Disconnected'}</span>
          </div>

          {lastUpdate && (
            <div className="status-indicator">
              <span style={{ color: 'var(--text-dim)' }}>
                Last update: {lastUpdate.toLocaleTimeString('en-IN')}
              </span>
            </div>
          )}

          {forecastData?.model_ready && (
            <div className="status-indicator">
              <div className="status-dot status-dot--live" style={{
                background: 'var(--accent-purple)',
                boxShadow: '0 0 8px var(--accent-purple)',
              }} />
              <span>AI Model Active</span>
            </div>
          )}

          {error && (
            <div className="status-indicator" style={{ color: 'var(--accent-red)' }}>
              ⚠ {error}
            </div>
          )}
        </div>
      </header>

      {/* ── Dashboard ─────────────────────────────────────── */}
      <main className="dashboard" id="dashboard">
        <div className="dashboard__top">
          <DemandChart
            liveData={liveData}
            forecastData={forecastData}
          />
        </div>

        <div className="dashboard__bottom">
          <GridMap meters={liveData} />
          <AlertPanel alerts={alerts} />
        </div>
      </main>
    </div>
  );
}
