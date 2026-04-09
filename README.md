# ⚡ Smart Grid Optimization Platform

AI-powered electricity grid monitoring, demand forecasting, and load optimization dashboard.

## Architecture

```
┌─────────────┐     MQTT      ┌────────────┐     INSERT     ┌──────────────┐
│   Sensor    │──────────────▶│  Mosquitto  │──────────────▶│  TimescaleDB │
│  Simulator  │   grid/meters │   Broker   │  MQTT Client  │  (Postgres)  │
└─────────────┘               └────────────┘               └──────┬───────┘
                                                                   │
                                                          ┌───────▼───────┐
                                                          │    Redis      │
                                                          │   (Cache)     │
                                                          └───────┬───────┘
                                                                   │
┌─────────────┐   REST API    ┌────────────┐    Query     ┌───────▼───────┐
│   React     │◀─────────────│  FastAPI    │◀────────────│   DB / Cache  │
│  Dashboard  │  Poll / 5s   │  Backend   │  LSTM Model  │               │
└─────────────┘               └────────────┘               └───────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, PyTorch, scikit-learn |
| Database | TimescaleDB (time-series), Redis (cache) |
| Messaging | MQTT via Eclipse Mosquitto |
| Frontend | React + Vite, Recharts |
| ML Model | LSTM (PyTorch) — 30-minute demand forecasting |
| Infrastructure | Docker Compose |

## Quick Start

### Prerequisites
- Docker & Docker Compose installed
- ~4GB free disk space (for PyTorch image)

### 1. Clone and navigate
```bash
cd smart-grid
```

### 2. Pre-train the LSTM model (optional — weights are bundled)
If you want to regenerate the model weights:
```bash
pip install torch numpy scikit-learn
python scripts/pretrain.py
```

### 3. Start all services
```bash
docker-compose up --build
```

### 4. Access the dashboard
Open **http://localhost:3000** in your browser.

The system will:
1. Start TimescaleDB, Redis, and Mosquitto
2. Launch the sensor simulator (10 virtual meters)
3. Start the MQTT ingestion service
4. Start FastAPI with the pre-trained LSTM model
5. Build and serve the React dashboard

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/grid/live` | Latest readings for all meters |
| GET | `/api/grid/history/{meter_id}?minutes=60` | Historical readings |
| GET | `/api/grid/alerts?limit=50` | Recent anomaly alerts |
| GET | `/api/grid/stats` | Aggregate grid statistics |
| POST | `/api/predictions/forecast` | 30-minute LSTM demand forecast |
| GET | `/api/predictions/balance` | Load redistribution recommendations |

### Example: Get forecast
```bash
curl -X POST http://localhost:8000/api/predictions/forecast \
  -H "Content-Type: application/json" \
  -d '{"meter_id": "meter_001", "lookback_minutes": 10}'
```

## Simulated Load Profile

The simulator generates **Tamil Nadu industrial load profiles** aligned with TNERC peak hours:

- **Morning Peak**: 06:00–10:00 IST (industrial startup)
- **Evening Peak**: 18:00–22:00 IST (domestic + industrial)
- **Trough**: 03:00–05:00 IST
- **Anomaly injection**: ~2% probability per reading

## Project Structure

```
smart-grid/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI entry point
│   │   ├── schemas.py           # Pydantic models
│   │   ├── routers/
│   │   │   ├── grid.py          # Grid data endpoints
│   │   │   └── predictions.py   # ML prediction endpoints
│   │   ├── models/
│   │   │   ├── lstm_forecaster.py   # Demand forecasting LSTM
│   │   │   └── load_balancer.py     # Load optimization
│   │   └── services/
│   │       ├── mqtt_client.py   # MQTT → DB ingestion
│   │       └── db.py            # Database access (sync + async)
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Main dashboard component
│   │   ├── index.css            # Design system
│   │   └── components/
│   │       ├── DemandChart.jsx  # Real-time demand visualization
│   │       ├── GridMap.jsx      # Meter status topology
│   │       └── AlertPanel.jsx   # Anomaly alert feed
│   ├── Dockerfile
│   └── nginx.conf
├── simulator/
│   └── sensor_simulator.py     # MQTT sensor data generator
├── scripts/
│   └── pretrain.py             # LSTM pre-training script
├── model_weights/
│   └── lstm.pt                 # Pre-trained model weights
├── db/
│   └── init.sql                # TimescaleDB schema
├── mosquitto/
│   └── mosquitto.conf
├── docker-compose.yml
└── README.md
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@timescaledb:5432/smartgrid` | TimescaleDB connection |
| `REDIS_HOST` | `redis` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `MQTT_HOST` | `mosquitto` | MQTT broker hostname |
| `MQTT_PORT` | `1883` | MQTT broker port |
| `MODEL_WEIGHTS_PATH` | `/app/model_weights/lstm.pt` | Path to LSTM weights |
| `PUBLISH_INTERVAL` | `10` | Simulator publish interval (seconds) |
| `NUM_METERS` | `10` | Number of simulated meters |

## License

Internal use only — proprietary.
