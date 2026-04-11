import { useEffect, useRef, useState } from 'react';

function formatTime(timestamp) {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

function AlertItem({ alert }) {
  const severity = alert.severity || 'warning';
  const [isDismissed, setIsDismissed] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const handleDismiss = async () => {
    if (isDismissing) return;
    setIsDismissing(true);
    setIsDismissed(true);
    setErrorMsg(null);

    try {
      const response = await fetch(`/api/grid/alerts/${alert.id}/acknowledge`, {
        method: 'PATCH',
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to dismiss');
      }
    } catch (err) {
      setIsDismissed(false);
      setErrorMsg("Could not dismiss — try again");
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      setIsDismissing(false);
    }
  };

  if (isDismissed) return null;

  return (
    <div className={`alert-item alert-item--${severity}`} style={{ position: 'relative' }}>
      <button 
        onClick={handleDismiss}
        title="Dismiss alert"
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          fontSize: '11px',
          color: 'rgba(255,255,255,0.25)',
          border: 'none',
          background: 'none',
          cursor: isDismissing ? 'default' : 'pointer',
          padding: '4px',
          pointerEvents: isDismissing ? 'none' : 'auto',
          transition: 'color 0.15s ease',
          opacity: isDismissing ? 0.5 : 1
        }}
        onMouseEnter={(e) => {
           if (!isDismissing) e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
        }}
        onMouseLeave={(e) => {
           if (!isDismissing) e.currentTarget.style.color = 'rgba(255,255,255,0.25)';
        }}
      >
        {isDismissing ? '...' : '✕'}
      </button>
      <div className="alert-item__header" style={{ paddingRight: '24px' }}>
        <span className="alert-item__meter">
          <span className={`alert-item__severity alert-item__severity--${severity}`}>
            {severity}
          </span>
          {alert.meter_id}
        </span>
        <span className="alert-item__time">{formatTime(alert.time)}</span>
      </div>
      <div className="alert-item__message">{alert.message}</div>
      {errorMsg && (
        <div style={{ color: 'rgba(255,59,92,0.8)', fontSize: '0.75rem', marginTop: '6px' }}>
          {errorMsg}
        </div>
      )}
    </div>
  );
}

export default function AlertPanel({ alerts }) {
  const bodyRef = useRef(null);

  // Auto-scroll to top (latest alerts)
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [alerts]);

  return (
    <div className="alert-panel glass-card">
      <div className="section-header">
        <div className="section-header__title">
          Automated Anomaly Detection — Z-Score Analysis
        </div>
        {alerts && alerts.length > 0 && (
          <span className={`section-header__badge ${
            alerts.some(a => a.severity === 'critical')
              ? 'section-header__badge--danger'
              : 'section-header__badge--warning'
          }`}>
            {alerts.length} active
          </span>
        )}
      </div>

      <div className="alert-panel__body" ref={bodyRef}>
        {alerts && alerts.length > 0 ? (
          <div className="alert-list">
            {alerts.map((alert, index) => (
              <AlertItem key={alert.id || index} alert={alert} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span>No active alerts</span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              System operating normally
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
