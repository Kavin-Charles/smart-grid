import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export default function LoadBalancePanel() {
  const [balance, setBalance] = useState(null);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/predictions/balance`);
      if (!res.ok) return;
      const data = await res.json();
      setBalance(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  const hasRecs = balance?.recommendations && balance.recommendations.length > 0;

  return (
    <div className="load-balance glass-card">
      <div className="section-header">
        <div className="section-header__title">
          AI Load Redistribution Engine
        </div>
        <span className={`section-header__badge ${hasRecs ? 'section-header__badge--ai' : ''}`}>
          {hasRecs ? `${balance.recommendations.length} actions` : 'Balanced'}
        </span>
      </div>

      <div className="load-balance__body">
        {hasRecs ? (
          <div className="recommendation-list">
            {balance.recommendations.map((rec, i) => (
              <div key={i} className="rec-item">
                <div className="rec-item__arrow">
                  <span className="rec-item__from">{rec.from}</span>
                  <svg className="rec-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                  <span className="rec-item__to">{rec.to}</span>
                </div>
                <div className="rec-item__amount">
                  {rec.shift_kw?.toFixed(0) || '—'} kW
                </div>
                <div className="rec-item__reason">{rec.reason || 'Rebalance overloaded substation'}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="load-balance__ok">
            <svg className="load-balance__ok-icon" viewBox="0 0 24 24" fill="none" stroke="var(--accent-green)" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>All substations within safe operating thresholds</span>
          </div>
        )}
      </div>
    </div>
  );
}
