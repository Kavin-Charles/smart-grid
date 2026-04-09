import { useMemo } from 'react';

const CAPACITY_KW = 900;

export default function KPICards({ liveData, alerts, forecastData }) {
  const kpis = useMemo(() => {
    if (!liveData || liveData.length === 0) return null;

    const totalLoad = liveData.reduce((s, m) => s + m.load_kw, 0);
    const avgVoltage = liveData.reduce((s, m) => s + m.voltage, 0) / liveData.length;
    const avgFreq = liveData.reduce((s, m) => s + m.frequency, 0) / liveData.length;

    // Grid stability: penalize deviation from ideal (230V, 50Hz)
    const voltageDev = Math.abs(avgVoltage - 230) / 230;
    const freqDev = Math.abs(avgFreq - 50) / 50;
    const stability = Math.max(0, (1 - voltageDev * 10 - freqDev * 20) * 100).toFixed(1);

    const overloaded = liveData.filter(m => (m.load_kw / CAPACITY_KW) > 0.85).length;

    return { totalLoad, stability, overloaded };
  }, [liveData]);

  const alertCount = alerts?.length || 0;
  const modelReady = forecastData?.model_ready || false;

  return (
    <div className="kpi-row">
      {/* KPI 1 */}
      <div className="kpi-card">
        <div className="kpi-card__label">Total Grid Load</div>
        <div className="kpi-card__value kpi-card__value--blue">
          {kpis ? (kpis.totalLoad / 1000).toFixed(2) : '—'}
          <span className="kpi-card__unit">MW</span>
        </div>
        <div className="kpi-card__sub">
          {liveData?.length || 0} meters reporting
        </div>
      </div>

      {/* KPI 2 */}
      <div className="kpi-card">
        <div className="kpi-card__label">LSTM Demand Forecast</div>
        <div className={`kpi-card__value ${modelReady ? 'kpi-card__value--purple' : 'kpi-card__value--dim'}`}>
          {modelReady ? 'Active' : 'Loading'}
        </div>
        <div className="kpi-card__sub">
          {modelReady ? '30-min prediction horizon' : 'Accumulating data'}
        </div>
      </div>

      {/* KPI 3 */}
      <div className="kpi-card">
        <div className="kpi-card__label">Grid Stability Index</div>
        <div className={`kpi-card__value ${
          kpis && parseFloat(kpis.stability) > 95 ? 'kpi-card__value--green' :
          kpis && parseFloat(kpis.stability) > 80 ? 'kpi-card__value--amber' :
          'kpi-card__value--red'
        }`}>
          {kpis ? kpis.stability : '—'}
          <span className="kpi-card__unit">%</span>
        </div>
        <div className="kpi-card__sub">
          Voltage & frequency deviation
        </div>
      </div>

      {/* KPI 4 */}
      <div className="kpi-card">
        <div className="kpi-card__label">Active Anomalies</div>
        <div className={`kpi-card__value ${alertCount > 0 ? 'kpi-card__value--red' : 'kpi-card__value--green'}`}>
          {alertCount}
        </div>
        <div className="kpi-card__sub">
          {kpis ? `${kpis.overloaded} overloaded substations` : 'No data'}
        </div>
      </div>
    </div>
  );
}
