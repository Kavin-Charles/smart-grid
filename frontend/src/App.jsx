import { useState, useEffect, useCallback } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import KPICards from './components/KPICards';
import DemandChart from './components/DemandChart';
import GridMap from './components/GridMap';
import AlertPanel from './components/AlertPanel';
import LoadBalancePanel from './components/LoadBalancePanel';
import './index.css';

const API_BASE = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL = 5000;

/**
 * Dashboard — the existing grid dashboard, now protected by auth.
 * All fetch calls use authFetch to include cookies and handle 401.
 */
function Dashboard() {
  const { authFetch, user, logout } = useAuth();
  const [liveData, setLiveData] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);

  const fetchLiveData = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/grid/live`);
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
  }, [authFetch]);

  const fetchForecast = useCallback(async () => {
    try {
      const meterToForecast = 'meter_001';
      const res = await authFetch(`${API_BASE}/api/predictions/forecast`, {
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
  }, [authFetch]);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/grid/alerts?limit=50`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch {
      // silent
    }
  }, [authFetch]);

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

          {/* User info & Logout */}
          <div className="header__user" id="header-user">
            <span className="header__user-email">{user?.email}</span>
            <button
              className="header__logout-btn"
              onClick={logout}
              title="Sign out"
              id="logout-btn"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              <span>Logout</span>
            </button>
          </div>
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


/**
 * App — Root component with routing.
 * AuthProvider wraps everything to provide auth state.
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
