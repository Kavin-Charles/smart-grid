# Docker & Infrastructure

**Files:**
- `docker-compose.yml` — Service orchestration
- `backend/Dockerfile` — Python API + LSTM model
- `frontend/Dockerfile` — React build + nginx
- `simulator/Dockerfile` — Sensor simulator
- `frontend/nginx.conf` — Reverse proxy configuration
- `mosquitto/mosquitto.conf` — MQTT broker settings

---

## The 7 Services

```
┌─────────────────────────────────────────────────────────────┐
│                    docker compose up                         │
│                                                             │
│  ┌──────────────┐  ┌──────────┐  ┌──────────────────────┐ │
│  │ timescaledb  │  │  redis   │  │     mosquitto        │ │
│  │  Port 5432   │  │Port 6379 │  │    Port 1883         │ │
│  │  (database)  │  │ (cache)  │  │  (MQTT broker)       │ │
│  └──────┬───────┘  └────┬─────┘  └──────────┬───────────┘ │
│         │               │                    │              │
│         │        ┌──────▼────────────────────▼───────────┐ │
│         ├───────▶│       mqtt-client (ingestion)         │ │
│         │        │  Subscribes, writes to DB + Redis     │ │
│         │        └──────────────────────────────────────┘ │
│         │                                    │              │
│         │        ┌──────────────────────────▼───────────┐ │
│         │        │       simulator (data gen)            │ │
│         │        │  Publishes to mosquitto               │ │
│         │        └──────────────────────────────────────┘ │
│         │                                                   │
│  ┌──────▼───────┐         ┌─────────────────────────────┐ │
│  │   backend    │         │       frontend (nginx)       │ │
│  │  Port 8000   │◀────────│       Port 3000              │ │
│  │  (FastAPI)   │  proxy  │  (React app served by nginx) │ │
│  └──────────────┘         └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Docker Compose Explained

### Infrastructure Services

```yaml
# TimescaleDB — PostgreSQL with time-series superpowers
timescaledb:
  image: timescale/timescaledb:latest-pg16
  environment:
    POSTGRES_USER: postgres
    POSTGRES_PASSWORD: postgres
    POSTGRES_DB: smartgrid
  volumes:
    - timescaledb_data:/var/lib/postgresql/data     # Persist data across restarts
    - ./db/init.sql:/docker-entrypoint-initdb.d/init.sql  # Auto-run schema on first start
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U postgres"]   # "Is PostgreSQL accepting connections?"
    interval: 5s
    retries: 10
```

**Key concept: `healthcheck`**. Docker uses this to determine when a container is "ready." Other services with `depends_on: condition: service_healthy` will wait for the health check to pass before starting.

**Key concept: init script mounting**. The `init.sql` file is mounted into `/docker-entrypoint-initdb.d/`. PostgreSQL images automatically execute any `.sql` files in this directory on **first startup only** (when the data directory is empty).

---

### Application Services

```yaml
# FastAPI Backend
backend:
  build:
    context: ./backend        # Dockerfile location
    dockerfile: Dockerfile
  environment:
    DATABASE_URL: postgresql://postgres:postgres@timescaledb:5432/smartgrid
    REDIS_HOST: redis         # Docker service name = hostname
    MODEL_WEIGHTS_PATH: /app/model_weights/lstm.pt
  volumes:
    - ./model_weights:/app/model_weights  # Mount pre-trained weights
  depends_on:
    timescaledb:
      condition: service_healthy  # Wait until DB is accepting connections
    redis:
      condition: service_healthy
```

**Docker networking**: Inside the Docker Compose network, services reference each other by their **service name**. The backend connects to `timescaledb:5432`, not `localhost:5432`. Docker's internal DNS resolves `timescaledb` to the container's IP address.

---

### MQTT Client — Separate from Backend

```yaml
# Shares the same Docker image as backend, but runs a different command
mqtt-client:
  build:
    context: ./backend                  # Same Dockerfile as backend
    dockerfile: Dockerfile
  command: ["python", "-u", "app/services/mqtt_client.py"]  # Override CMD
  working_dir: /app
```

**Why does it share the backend image?** The MQTT client needs the same Python dependencies (psycopg2, redis, paho-mqtt) that are already installed in the backend image. Building a separate image would duplicate all those layers. The `command` override makes it run the MQTT subscriber instead of uvicorn.

The `-u` flag means **unbuffered output** — without it, Python buffers stdout and you don't see logs in `docker compose logs` until the buffer is full.

---

## Backend Dockerfile — PyTorch CPU Installation

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# System dependencies for psycopg2 (PostgreSQL driver)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (everything except PyTorch)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install PyTorch CPU-only from the dedicated CPU wheel index
# This downloads ~150MB instead of ~2GB for the CUDA version
RUN pip install --no-cache-dir torch==2.4.0+cpu \
    --extra-index-url https://download.pytorch.org/whl/cpu

COPY app/ app/

# Ensure Python can resolve 'app.services.db', 'app.models.lstm_forecaster', etc.
ENV PYTHONPATH=/app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Why `--extra-index-url`?** PyTorch has a separate package index for CPU-only builds. The standard `pip install torch` downloads the CUDA version (~2GB). The CPU version is much smaller (~150MB) and sufficient for inference on server hardware without GPUs.

**Why not in `requirements.txt`?** Because `requirements.txt` doesn't support `--extra-index-url`. You'd need to add it as a global pip config or, as we do, handle it separately in the Dockerfile.

---

## Frontend Dockerfile — Multi-Stage Build

```dockerfile
# Stage 1: Build the React app
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build    # Creates optimized production bundle in dist/

# Stage 2: Serve with nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

**Multi-stage builds** are a Docker optimization:
- **Stage 1** has Node.js, npm, all dev dependencies (~400MB)
- **Stage 2** only has nginx + the built static files (~30MB)

The final image is tiny because it doesn't include Node.js or any build tools.

---

## Nginx Configuration

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;

    # Serve the React SPA
    location / {
        try_files $uri $uri/ /index.html;
        # If the URL doesn't match a file, serve index.html
        # This enables client-side routing (React Router)
    }

    # Proxy API requests to the backend
    location /api/ {
        proxy_pass http://backend:8000;
        # Forward to FastAPI (via Docker networking)
    }
}
```

**Why proxy through nginx?** Two reasons:
1. **Same-origin requests** — The browser makes requests to `localhost:3000/api/...` which nginx forwards to the backend. No CORS issues.
2. **Single entry point** — Users only need to know one URL. The frontend and API are served from the same host.

---

## Mosquitto Configuration

```conf
listener 1883              # Listen on standard MQTT port
allow_anonymous true       # No authentication (dev environment only!)
persistence true           # Retain messages across broker restarts
persistence_location /mosquitto/data/
```

> ⚠️ **Production warning**: `allow_anonymous true` should be replaced with username/password or certificate-based authentication.

---

## Startup Order

Docker Compose starts services in dependency order:

```
1. timescaledb, redis, mosquitto    (no dependencies — start first)
        │
        ▼  (wait for health checks to pass)
2. mqtt-client, backend             (depend on DB + Redis)
        │
        ▼
3. simulator                        (depends on mosquitto)
        │
        ▼
4. frontend                         (depends on backend)
```

---

## Useful Commands

```bash
# Start everything (build images if needed)
docker compose up --build

# Start in background (detached mode)
docker compose up -d

# View logs from a specific service
docker compose logs -f backend
docker compose logs -f mqtt-client

# Stop everything
docker compose down

# Stop and remove volumes (WARNING: deletes all data)
docker compose down -v

# Rebuild a single service
docker compose build backend
docker compose up -d backend

# Shell into a running container
docker compose exec backend bash
docker compose exec timescaledb psql -U postgres -d smartgrid

# Check service status
docker compose ps
```

---

## Named Volumes

```yaml
volumes:
  timescaledb_data:  # Persists database files across container restarts
  mosquitto_data:     # Persists MQTT retained messages
```

These volumes survive `docker compose down` (data is preserved). Only `docker compose down -v` deletes them.
