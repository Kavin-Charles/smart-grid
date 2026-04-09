import { useEffect, useRef } from 'react';

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

  return (
    <div className={`alert-item alert-item--${severity}`}>
      <div className="alert-item__header">
        <span className="alert-item__meter">
          <span className={`alert-item__severity alert-item__severity--${severity}`}>
            {severity}
          </span>
          {alert.meter_id}
        </span>
        <span className="alert-item__time">{formatTime(alert.time)}</span>
      </div>
      <div className="alert-item__message">{alert.message}</div>
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
