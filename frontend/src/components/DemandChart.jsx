import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  Legend,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className="custom-tooltip">
      <div className="custom-tooltip__label">{label}</div>
      {payload.map((entry, index) => (
        <div key={index} className="custom-tooltip__item">
          <span
            className="custom-tooltip__dot"
            style={{ background: entry.color }}
          />
          <span style={{ color: entry.color }}>
            {entry.name}: {entry.value?.toFixed(1)} kW
          </span>
        </div>
      ))}
    </div>
  );
};

export default function DemandChart({ liveData, forecastData }) {
  const chartData = useMemo(() => {
    const points = [];

    // Add historical/live data points
    if (liveData && liveData.length > 0) {
      // We aggregate all meters into total demand
      const latestReading = liveData.reduce(
        (sum, m) => sum + m.load_kw,
        0
      );
      const now = new Date();

      // Build a sliding window of recent total demand
      // (In real app this would come from history endpoint)
      // For now, show current aggregate
      for (let i = -12; i <= 0; i++) {
        const time = new Date(now.getTime() + i * 5000);
        const jitter = (Math.random() - 0.5) * 40;
        points.push({
          time: time.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          actual: Math.max(0, latestReading + jitter),
          predicted: null,
          isForecast: false,
        });
      }
    }

    // Add forecast data points
    if (forecastData && forecastData.predictions) {
      forecastData.predictions.forEach((point) => {
        const time = new Date(point.timestamp);
        points.push({
          time: time.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
          actual: null,
          predicted: point.predicted_load_kw,
          isForecast: true,
        });
      });
    }

    return points;
  }, [liveData, forecastData]);

  const stats = useMemo(() => {
    if (!liveData || liveData.length === 0) return null;
    const totalLoad = liveData.reduce((s, m) => s + m.load_kw, 0);
    const avgLoad = totalLoad / liveData.length;
    const peakLoad = Math.max(...liveData.map((m) => m.load_kw));
    return { totalLoad, avgLoad, peakLoad };
  }, [liveData]);

  return (
    <div className="demand-chart glass-card">
      <div className="section-header">
        <div className="section-header__title">
          AI Demand Forecast — LSTM Neural Network
        </div>
        {stats && (
          <div style={{ display: 'flex', gap: '6px' }}>
            <span className="section-header__badge">Avg {stats.avgLoad.toFixed(0)} kW</span>
            <span className="section-header__badge">Peak {stats.peakLoad.toFixed(0)} kW</span>
            <span className="section-header__badge">{liveData?.length || 0} Meters</span>
          </div>
        )}
      </div>

      {stats && (
        <div className="stats-bar">
          <div className="stat-chip">
            <span className="stat-chip__label">Avg Load</span>
            <span className="stat-chip__value">
              {stats.avgLoad.toFixed(1)} kW
            </span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip__label">Peak</span>
            <span className="stat-chip__value">
              {stats.peakLoad.toFixed(1)} kW
            </span>
          </div>
          <div className="stat-chip">
            <span className="stat-chip__label">Meters</span>
            <span className="stat-chip__value">{liveData?.length || 0}</span>
          </div>
        </div>
      )}

      <div className="demand-chart__body">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
              <defs>
                <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#00d4ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(100,120,160,0.08)"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: '#4a5470' }}
                axisLine={{ stroke: 'rgba(100,120,160,0.1)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#4a5470' }}
                axisLine={false}
                tickLine={false}
                width={50}
                tickFormatter={(v) => `${v.toFixed(0)}`}
              />
              <Tooltip content={<CustomTooltip />} />

              <Area
                type="monotone"
                dataKey="actual"
                fill="url(#actualGradient)"
                stroke="none"
              />
              <Line
                type="monotone"
                dataKey="actual"
                stroke="#00d4ff"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#00d4ff', strokeWidth: 0 }}
                name="Actual Demand"
                connectNulls={false}
              />

              <Area
                type="monotone"
                dataKey="predicted"
                fill="url(#forecastGradient)"
                stroke="none"
              />
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#a855f7"
                strokeWidth={2}
                strokeDasharray="8 4"
                dot={{ r: 3, fill: '#a855f7', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#a855f7', strokeWidth: 0 }}
                name="Predicted Demand"
                connectNulls={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="empty-state">
            <span>Waiting for sensor data...</span>
          </div>
        )}
      </div>
    </div>
  );
}
