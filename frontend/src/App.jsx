import { useState, useEffect, useCallback } from 'react';
import KPICards from './components/KPICards';
import DemandChart from './components/DemandChart';
import GridMap from './components/GridMap';
import AlertPanel from './components/AlertPanel';
import LoadBalancePanel from './components/LoadBalancePanel';
import './index.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const POLL_INTERVAL = 5000;

export default function App() {
  const [liveData, setLiveData] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);

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
      setIsConnected(false);
      setError(err.message);
    }
  }, []);

  const fetchForecast = useCallback(async () => {
    try {
      const meterToForecast = 'meter_001';
      const res = await fetch(`${API_BASE}/api/predictions/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meter_id: meterToForecast, lookback_minutes: 10 }),
      });
      if (!res.ok) {
        if (res.status === 400) { setForecastData(null); return; }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setForecastData(data);
    } catch {
      // silent
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/grid/alerts?limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchLiveData();
    fetchForecast();
    fetchAlerts();
    const interval = setInterval(() => {
      fetchLiveData();
      fetchForecast();
      fetchAlerts();
    }, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLiveData, fetchForecast, fetchAlerts]);

  return (
    <div className="app">
      {/* Header */}
      <header className="header glass-card" id="app-header">
        <div className="header__brand">
          <div className="header__logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <div>
            <div className="header__title">Smart Grid Optimization Platform</div>
            <div className="header__subtitle">
              AI-Powered Load Management
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
                {lastUpdate.toLocaleTimeString('en-IN')}
              </span>
            </div>
          )}

          {forecastData?.model_ready && (
            <div className="status-indicator">
              <div className="status-dot status-dot--ai" />
              <span>LSTM Model Active</span>
            </div>
          )}

          {error && (
            <div className="status-indicator" style={{ color: 'var(--accent-red)' }}>
              {error}
            </div>
          )}
        </div>
      </header>

      {/* KPI Cards */}
      <KPICards liveData={liveData} alerts={alerts} forecastData={forecastData} />

      {/* Main Dashboard */}
      <main className="dashboard" id="dashboard">
        <div className="dashboard__chart">
          <DemandChart liveData={liveData} forecastData={forecastData} />
        </div>

        <div className="dashboard__panels">
          <GridMap meters={liveData} />
          <div className="dashboard__right">
            <AlertPanel alerts={alerts} />
            <LoadBalancePanel />
          </div>
        </div>
      </main>
    </div>
  );
}
