const CAPACITY_KW = 900;

function getStatus(loadKw) {
  const utilization = loadKw / CAPACITY_KW;
  if (utilization > 0.85) return 'red';
  if (utilization > 0.60) return 'amber';
  return 'green';
}

function getStatusLabel(status) {
  switch (status) {
    case 'red': return 'OVERLOADED';
    case 'amber': return 'HIGH LOAD';
    default: return 'NORMAL';
  }
}

function MeterCard({ meter }) {
  const status = getStatus(meter.load_kw);
  const utilization = ((meter.load_kw / CAPACITY_KW) * 100).toFixed(0);

  return (
    <div className={`meter-card meter-card--${status}`}>
      <div className="meter-card__id">{meter.meter_id}</div>
      <div className={`meter-card__load meter-card__load--${status}`}>
        {meter.load_kw.toFixed(0)}
        <span className="meter-card__unit"> kW</span>
      </div>
      <div className="meter-card__voltage">
        {meter.voltage.toFixed(1)}V · {meter.frequency.toFixed(2)}Hz
      </div>
      <div className="meter-card__status" style={{
        color: status === 'red' ? 'var(--accent-red)' :
               status === 'amber' ? 'var(--accent-amber)' :
               'var(--accent-green)'
      }}>
        {getStatusLabel(status)} · {utilization}%
      </div>
    </div>
  );
}

export default function GridMap({ meters }) {
  if (!meters || meters.length === 0) {
    return (
      <div className="grid-map glass-card">
        <div className="section-header">
          <div className="section-header__title">
            Live Substation Topology — Real-Time Telemetry
          </div>
        </div>
        <div className="empty-state">
          <span>No meters online</span>
        </div>
      </div>
    );
  }

  const overloadCount = meters.filter(m => getStatus(m.load_kw) === 'red').length;
  const warningCount = meters.filter(m => getStatus(m.load_kw) === 'amber').length;

  return (
    <div className="grid-map glass-card">
      <div className="section-header">
        <div className="section-header__title">
          Live Substation Topology — Real-Time Telemetry
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {overloadCount > 0 && (
            <span className="section-header__badge section-header__badge--danger">
              {overloadCount} critical
            </span>
          )}
          {warningCount > 0 && (
            <span className="section-header__badge section-header__badge--warning">
              {warningCount} warning
            </span>
          )}
          <span className="section-header__badge">
            {meters.length} meters
          </span>
        </div>
      </div>

      <div className="grid-map__body">
        <div className="meter-grid">
          {meters.map((meter) => (
            <MeterCard key={meter.meter_id} meter={meter} />
          ))}
        </div>
      </div>
    </div>
  );
}
