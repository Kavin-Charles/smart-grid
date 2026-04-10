-- Smart Grid Optimization — TimescaleDB Initialization
-- Creates hypertable for sensor readings and alerts table

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Sensor readings hypertable
CREATE TABLE IF NOT EXISTS sensor_readings (
    time            TIMESTAMPTZ NOT NULL,
    meter_id        TEXT NOT NULL,
    load_kw         DOUBLE PRECISION,
    voltage         DOUBLE PRECISION,
    frequency       DOUBLE PRECISION,
    power_factor    DOUBLE PRECISION,
    is_anomaly      BOOLEAN DEFAULT FALSE
);

SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);

-- Index for fast meter-specific queries
CREATE INDEX IF NOT EXISTS idx_readings_meter_time
    ON sensor_readings (meter_id, time DESC);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
    id              SERIAL PRIMARY KEY,
    time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    meter_id        TEXT NOT NULL,
    alert_type      TEXT NOT NULL,
    message         TEXT,
    severity        TEXT DEFAULT 'warning',
    acknowledged    BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_alerts_time
    ON alerts (time DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_meter
    ON alerts (meter_id, time DESC);

-- ── Users table for authentication ──────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              SERIAL PRIMARY KEY,
    email           TEXT UNIQUE NOT NULL,
    hashed_password TEXT NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default admin (password: Admin@123)
INSERT INTO users (email, hashed_password)
VALUES ('admin@smartgrid.local', '$2b$12$kmN80nPBo67Sm3XALlqfbeRBBU5zCYmaxDOyghezlTa0bNwmYNrAe')
ON CONFLICT (email) DO NOTHING;
