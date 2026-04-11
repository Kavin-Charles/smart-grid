import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Legend, ReferenceLine
} from 'recharts';

const CAPACITY_KW = 900;
const API_BASE = import.meta.env.VITE_API_URL || '';

export default function MeterDetail() {
  const { meterId } = useParams();
  const navigate = useNavigate();
  const { authFetch } = useAuth();

  const [loading, setLoading] = useState(true);
  const [historyData, setHistoryData] = useState([]);
  const [liveMeter, setLiveMeter] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [forecast, setForecast] = useState(null);
  const [balance, setBalance] = useState(null);
  const [toast, setToast] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [histRes, liveRes, alertsRes, forecastRes, balanceRes] = await Promise.all([
        authFetch(`${API_BASE}/api/grid/history/${meterId}?minutes=1440`),
        authFetch(`${API_BASE}/api/grid/live`),
        authFetch(`${API_BASE}/api/grid/alerts?meter_id=${meterId}`),
        authFetch(`${API_BASE}/api/predictions/forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meter_id: meterId, lookback_minutes: 10 }),
        }).catch(() => ({ ok: false })),
        authFetch(`${API_BASE}/api/predictions/balance`).catch(() => ({ ok: false }))
      ]);

      if (histRes.status === 401 || liveRes.status === 401) {
        navigate('/login');
        return;
      }

      if (histRes.ok) {
        const histJson = await histRes.json();
        setHistoryData(histJson.readings || []);
      }
      
      if (liveRes.ok) {
        const liveJson = await liveRes.json();
        const m = liveJson.meters?.find(x => x.meter_id === meterId);
        if (m) setLiveMeter(m);
      }

      if (alertsRes.ok) {
        const alertsJson = await alertsRes.json();
        setAlerts(alertsJson.alerts || []);
      }

      if (forecastRes && forecastRes.ok) {
        const forecastJson = await forecastRes.json();
        setForecast(forecastJson);
      } else {
        setForecast(null);
      }

      if (balanceRes && balanceRes.ok) {
        const balanceJson = await balanceRes.json();
        setBalance(balanceJson);
      } else {
        setBalance(null);
      }

      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }, [meterId, authFetch, navigate]);

  useEffect(() => {
    fetchData();
    const intv = setInterval(fetchData, 10000);
    return () => clearInterval(intv);
  }, [fetchData]);

  const handleRecommendationClick = () => {
    setToast('Recommendation noted — operator action required');
    setTimeout(() => setToast(null), 3000);
  };

  const chartData = useMemo(() => {
    const points = [];
    historyData.forEach(r => {
      points.push({
        time: r.timestamp,
        timestampValue: new Date(r.timestamp).getTime(),
        actual: r.load_kw,
        predicted: null
      });
    });
    if (forecast && forecast.predictions) {
      forecast.predictions.forEach(p => {
        points.push({
          time: p.timestamp,
          timestampValue: new Date(p.timestamp).getTime(),
          actual: null,
          predicted: p.predicted_load_kw
        });
      });
    }
    // Sort just in case
    points.sort((a, b) => a.timestampValue - b.timestampValue);
    return points;
  }, [historyData, forecast]);

  const targetRecommendation = useMemo(() => {
    if (!balance || !balance.recommendations) return null;
    return balance.recommendations.find(r => r.source_meter === meterId);
  }, [balance, meterId]);

  if (loading) {
    return (
      <div className="app">
        <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginTop: '100px' }}>
          <div className="glass-card" style={{ width: 200, height: 120, animation: 'pulse 1.5s infinite' }} />
          <div className="glass-card" style={{ width: 200, height: 120, animation: 'pulse 1.5s infinite' }} />
          <div className="glass-card" style={{ width: 200, height: 120, animation: 'pulse 1.5s infinite' }} />
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }`}</style>
      </div>
    );
  }

  const liveLoad = liveMeter?.load_kw || 0;
  const loadPct = (liveLoad / CAPACITY_KW) * 100;
  let loadStatus = 'green';
  let loadColor = '#00ff88';
  if (loadPct > 85) { loadStatus = 'red'; loadColor = '#ff3b5c'; }
  else if (loadPct > 60) { loadStatus = 'amber'; loadColor = '#f59e0b'; }

  const formatTime = (t) => {
    return new Date(t).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const getStatusBadge = () => {
    if (loadPct > 85) return <span style={{ background: 'rgba(255,59,92,0.15)', color: '#ff3b5c', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>CRITICAL</span>;
    if (loadPct > 60) return <span style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>HIGH</span>;
    return <span style={{ background: 'rgba(0,255,136,0.15)', color: '#00ff88', padding: '4px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold' }}>NORMAL</span>;
  };

  const nowTimestamp = new Date().getTime();

  return (
    <div className="app" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
      
      {/* 1. Navigation Bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(6,10,20,0.8)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px', borderRadius: '12px'
      }}>
        <div 
          onClick={() => navigate('/')} 
          style={{ color: 'rgba(255,255,255,0.4)', fontSize: '13px', cursor: 'pointer', transition: 'color 0.2s' }}
          onMouseEnter={(e) => e.target.style.color = 'rgba(255,255,255,0.8)'}
          onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.4)'}
        >
          ← Dashboard
        </div>
        <div style={{ color: '#fff', fontSize: '18px', fontWeight: '700', textTransform: 'uppercase' }}>
          {meterId}
        </div>
        <div>
          {getStatusBadge()}
        </div>
      </div>

      {/* 2. Four Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Current Load</div>
          <div style={{ fontSize: '28px', fontWeight: '600', color: loadColor }}>
            {liveLoad.toFixed(0)} kW
          </div>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Voltage</div>
          <div style={{ fontSize: '28px', fontWeight: '600', color: (liveMeter && liveMeter.voltage >= 210 && liveMeter.voltage <= 250) ? '#fff' : '#ff3b5c' }}>
            {liveMeter?.voltage?.toFixed(1) || 'N/A'} V
          </div>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Frequency</div>
          <div style={{ fontSize: '28px', fontWeight: '600', color: (liveMeter && liveMeter.frequency >= 49.5 && liveMeter.frequency <= 50.5) ? '#fff' : '#ff3b5c' }}>
            {liveMeter?.frequency?.toFixed(2) || 'N/A'} Hz
          </div>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px', borderRadius: '12px' }}>
          <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', marginBottom: '8px' }}>Power Factor</div>
          <div style={{ fontSize: '28px', fontWeight: '600', color: (liveMeter?.power_factor > 0.90) ? '#00ff88' : (liveMeter?.power_factor >= 0.85) ? '#f59e0b' : '#ff3b5c' }}>
            {liveMeter?.power_factor?.toFixed(2) || 'N/A'}
          </div>
        </div>
      </div>

      {/* 3. History + Forecast Chart */}
      <div className="glass-card" style={{ height: '280px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff' }}>24-HOUR HISTORY + 30-MIN FORECAST</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>{formatTime(nowTimestamp)}</div>
        </div>
        <div style={{ flex: 1, padding: '10px', paddingBottom: '20px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="areaActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgba(0,212,255,0.2)" stopOpacity={1}/>
                  <stop offset="95%" stopColor="rgba(0,212,255,0)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="time" 
                tickFormatter={formatTime} 
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                minTickGap={60}
                axisLine={false} tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                axisLine={false} tickLine={false}
                domain={['auto', 'auto']}
                padding={{ top: 20, bottom: 20 }}
              />
              <Tooltip 
                contentStyle={{ background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                labelFormatter={(l) => {
                  const d = new Date(l);
                  return isNaN(d.getTime()) ? l : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#fff', paddingTop: '10px' }} verticalAlign="bottom" align="right" />
              <ReferenceLine x={historyData.length > 0 ? historyData[historyData.length-1].time : undefined} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
              
              <Area type="monotone" dataKey="actual" stroke="none" fill="url(#areaActual)" />
              <Line type="monotone" dataKey="actual" name="Actual" stroke="#00d4ff" strokeWidth={2} dot={false} connectNulls={false} />
              <Line type="monotone" dataKey="predicted" name="Predicted" stroke="#a855f7" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '60% calc(40% - 16px)', gap: '16px' }}>
        
        {/* Left: Alert History */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#fff' }}>ALERT HISTORY</div>
            {alerts.length > 0 && (
              <span style={{ background: 'rgba(255,59,92,0.15)', color: '#ff3b5c', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>
                {alerts.length} Total
              </span>
            )}
          </div>
          <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
            {alerts.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: '13px', marginTop: '20px' }}>
                No alerts for this meter
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ color: 'rgba(255,255,255,0.3)', fontSize: '11px', textTransform: 'uppercase' }}>
                    <th style={{ paddingBottom: '8px' }}>Time</th>
                    <th style={{ paddingBottom: '8px' }}>Type</th>
                    <th style={{ paddingBottom: '8px' }}>Severity</th>
                    <th style={{ paddingBottom: '8px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 !== 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                      <td style={{ padding: '10px 0', fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
                        {new Date(a.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} <span style={{ fontSize: '10px' }}>{new Date(a.time).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}</span>
                      </td>
                      <td style={{ padding: '10px 0', fontSize: '13px', color: '#fff' }}>
                        {a.alert_type.replace(/_/g, ' ')}
                      </td>
                      <td style={{ padding: '10px 0' }}>
                        <span style={{ 
                          background: a.severity === 'critical' ? 'rgba(255,59,92,0.15)' : 'rgba(245,158,11,0.15)', 
                          color: a.severity === 'critical' ? '#ff3b5c' : '#f59e0b',
                          border: `1px solid ${a.severity === 'critical' ? 'rgba(255,59,92,0.3)' : 'rgba(245,158,11,0.3)'}`,
                          padding: '2px 6px', borderRadius: '6px', fontSize: '10px', textTransform: 'uppercase'
                        }}>{a.severity}</span>
                      </td>
                      <td style={{ padding: '10px 0', fontSize: '12px', color: a.acknowledged ? 'rgba(0,255,136,0.7)' : '#ff3b5c' }}>
                        {a.acknowledged ? 'Resolved' : 'Active'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Load Balance */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: 'rgba(0,212,255,0.8)' }}>AI RECOMMENDATION</div>
          </div>
          <div style={{ padding: '20px', flex: 1 }}>
            {targetRecommendation ? (
              <div>
                <div style={{ fontSize: '16px', color: '#fff', fontWeight: '600', marginBottom: '4px' }}>
                  Shift {targetRecommendation.shift_kw.toFixed(0)} kW to {targetRecommendation.target_meter}
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginBottom: '20px' }}>
                  {targetRecommendation.target_meter} has ample headroom
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>This meter</span>
                    <span style={{ color: '#ff3b5c' }}>-{targetRecommendation.shift_kw.toFixed(0)} kW</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, Math.max(0, loadPct))}%`, height: '100%', background: '#ff3b5c' }} />
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '16px', color: 'rgba(255,255,255,0.2)' }}>↓</div>

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>Target: {targetRecommendation.target_meter}</span>
                    <span style={{ color: '#00ff88' }}>+{targetRecommendation.shift_kw.toFixed(0)} kW</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: '40%', height: '100%', background: '#00ff88' }} />
                  </div>
                </div>

                <button 
                  onClick={handleRecommendationClick}
                  style={{
                    width: '100%', padding: '10px 0', background: 'rgba(0,255,136,0.06)',
                    border: '1px solid rgba(0,255,136,0.35)', color: '#00ff88',
                    fontWeight: '600', fontSize: '14px', borderRadius: '8px', cursor: 'pointer'
                  }}
                >
                  Apply recommendation
                </button>
                {toast && (
                  <div style={{ marginTop: '12px', color: '#00ff88', fontSize: '12px', textAlign: 'center' }}>
                    {toast}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.8 }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.5)', fontSize: '20px', marginBottom: '16px' }}>
                  ✓
                </div>
                <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>Load is balanced</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)' }}>This meter is operating within normal range</div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
