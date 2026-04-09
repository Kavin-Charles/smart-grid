# Smart Grid Optimization — Documentation

Welcome to the documentation for the **AI Smart Grid Optimization** platform. This guide explains every component of the system, how they communicate, and how the data flows from simulated sensors all the way to the React dashboard.

---

## Table of Contents

| # | Document | What you'll learn |
|---|----------|-------------------|
| 1 | [Architecture Overview](./01-architecture.md) | How all services connect, data flow, and design decisions |
| 2 | [Sensor Simulator](./02-sensor-simulator.md) | How we generate realistic Tamil Nadu electricity data |
| 3 | [Database Layer](./03-database.md) | TimescaleDB schema, dual-mode access pattern, connection pooling |
| 4 | [MQTT Ingestion](./04-mqtt-ingestion.md) | Real-time data pipeline from MQTT broker to database |
| 5 | [LSTM Forecaster](./05-lstm-forecaster.md) | PyTorch model architecture, training, and inference |
| 6 | [Load Balancer](./06-load-balancer.md) | Grid optimization logic and redistribution algorithm |
| 7 | [FastAPI Backend](./07-fastapi-backend.md) | REST API design, dependency injection, route handlers |
| 8 | [React Dashboard](./08-react-dashboard.md) | Frontend components, polling architecture, design system |
| 9 | [Docker & Infrastructure](./09-docker-setup.md) | Container orchestration, networking, and deployment |

---

## Quick Architecture Diagram

```
  Simulator ──MQTT──▶ Mosquitto ──▶ MQTT Client ──▶ TimescaleDB
                                        │                │
                                        ▼                ▼
                                      Redis ◀──── FastAPI Backend
                                                        │
                                                        ▼
                                                 React Dashboard
```

## Getting Started

```bash
# 1. Navigate to the project
cd smart-grid

# 2. Start everything
docker compose up --build

# 3. Open the dashboard
# http://localhost:3000

# 4. Check the API directly
# http://localhost:8000/api/health
```
