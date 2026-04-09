# Architecture Overview

## System Design

The Smart Grid platform follows a **microservices architecture** where each service has a single responsibility. They communicate through two channels:

1. **MQTT** (Message Queuing Telemetry Transport) — for real-time sensor data streaming
2. **REST API** — for the frontend to query processed data

### Why this design?

| Decision | Rationale |
|----------|-----------|
| Separate MQTT client process | Keeps the FastAPI server non-blocking; MQTT subscribing is a long-running loop that would conflict with the async event loop |
| Redis for live readings | Database queries are slow for "latest value" lookups; Redis serves sub-millisecond responses |
| TimescaleDB for history | Purpose-built for time-series data; automatic data partitioning and fast time-range queries |
| Pre-trained LSTM bundled | API is ready for predictions on first startup — no warmup needed |

---

## Full Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Docker Compose Network                       │
│                                                                     │
│  ┌──────────────┐         ┌──────────────┐                         │
│  │   Sensor     │  MQTT   │  Mosquitto   │                         │
│  │  Simulator   │────────▶│   Broker     │                         │
│  │  (Python)    │ Publish │  Port 1883   │                         │
│  └──────────────┘         └──────┬───────┘                         │
│                                  │ Subscribe                        │
│                           ┌──────▼───────┐                         │
│                           │  MQTT Client │                         │
│                           │  (Python)    │                         │
│                           └──┬───────┬───┘                         │
│                     INSERT   │       │  CACHE                      │
│                   ┌──────────▼┐   ┌──▼──────────┐                  │
│                   │TimescaleDB│   │    Redis     │                  │
│                   │  Port 5432│   │  Port 6379   │                  │
│                   └──────┬────┘   └──────┬───────┘                  │
│                          │ Query         │ Read                     │
│                   ┌──────▼───────────────▼───────┐                  │
│                   │       FastAPI Backend         │                  │
│                   │       Port 8000               │                  │
│                   │  ┌──────────┐ ┌────────────┐ │                  │
│                   │  │  LSTM    │ │   Load     │ │                  │
│                   │  │Forecaster│ │  Balancer  │ │                  │
│                   │  └──────────┘ └────────────┘ │                  │
│                   └──────────┬───────────────────┘                  │
│                              │ REST API                             │
│                   ┌──────────▼───────────────────┐                  │
│                   │    React Dashboard (nginx)    │                  │
│                   │    Port 3000                  │                  │
│                   └──────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow — Step by Step

### 1. Data Generation (Every 10 seconds)
The Simulator creates realistic electricity readings for **10 virtual meters** and publishes them as JSON to the MQTT topic `grid/meters`.

### 2. Data Ingestion
The MQTT Client subscribes to `grid/meters` and for each message:
- **Inserts** the reading into TimescaleDB's `sensor_readings` hypertable
- **Caches** the latest reading per meter in a Redis hash
- **Checks** for anomalies (voltage sag, frequency drop, load spike)
- If anomaly found → inserts an **alert** into the `alerts` table

### 3. API Serving
FastAPI reads from two sources depending on the endpoint:
- **Live data** (`/api/grid/live`) → reads from **Redis** (fast, sub-ms latency)
- **Historical data** (`/api/grid/history`) → queries **TimescaleDB** (time-range queries)
- **Forecasting** (`/api/predictions/forecast`) → fetches recent data from TimescaleDB, runs **LSTM inference**

### 4. Dashboard Rendering
React polls all three API endpoints every **5 seconds** and updates:
- **DemandChart** — line chart of actual vs predicted demand
- **GridMap** — color-coded meter status cards
- **AlertPanel** — scrollable feed of anomaly alerts

---

## Service Communication Matrix

```
Simulator    ─── MQTT Publish ───▶  Mosquitto
Mosquitto    ─── MQTT Deliver ───▶  MQTT Client
MQTT Client  ─── SQL INSERT  ────▶  TimescaleDB
MQTT Client  ─── Redis SET   ────▶  Redis
FastAPI      ─── SQL SELECT  ────▶  TimescaleDB
FastAPI      ─── Redis GET   ────▶  Redis
React        ─── HTTP GET/POST ──▶  FastAPI (via nginx proxy)
```

---

## Port Map

| Service | Internal Port | Exposed Port | Purpose |
|---------|--------------|--------------|---------|
| TimescaleDB | 5432 | 5432 | PostgreSQL protocol |
| Redis | 6379 | 6379 | Redis protocol |
| Mosquitto | 1883 | 1883 | MQTT protocol |
| FastAPI | 8000 | 8000 | REST API |
| Frontend (nginx) | 80 | 3000 | Web dashboard |
