"""
MQTT Client Service — Smart Grid Optimization

Standalone process that:
  1. Subscribes to grid/meters MQTT topic
  2. Inserts readings into TimescaleDB
  3. Caches latest reading per meter in Redis
  4. Detects anomalies and writes alerts
"""

import json
import os
import time
from collections import defaultdict
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import redis

from app.services.db import insert_reading, insert_alert, get_sync_pool, close_sync_pool

# ── Configuration ──────────────────────────────────────────────
MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = "grid/meters"

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))

# Anomaly thresholds
FREQUENCY_LOW_THRESHOLD = 49.5    # Hz
VOLTAGE_SAG_THRESHOLD = 210       # V
VOLTAGE_SWELL_THRESHOLD = 250     # V
LOAD_SPIKE_FACTOR = 1.5           # × rolling average

# ── State ──────────────────────────────────────────────────────
rolling_loads: dict[str, list[float]] = defaultdict(list)
ROLLING_WINDOW = 30  # readings to keep for rolling average

# ── Redis client ───────────────────────────────────────────────
redis_client: redis.Redis | None = None


def get_redis() -> redis.Redis:
    """Get or create Redis connection."""
    global redis_client
    if redis_client is None:
        redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True,
        )
    return redis_client


def check_anomalies(reading: dict) -> list[dict]:
    """Check a reading for anomalies and return alert dicts."""
    alerts = []
    meter_id = reading["meter_id"]
    timestamp = reading["timestamp"]
    load = reading["load_kw"]
    voltage = reading["voltage"]
    frequency = reading["frequency"]

    # ── Frequency drop ─────────────────────────────────────
    if frequency < FREQUENCY_LOW_THRESHOLD:
        alerts.append({
            "time": timestamp,
            "meter_id": meter_id,
            "alert_type": "frequency_low",
            "message": f"Frequency dropped to {frequency:.3f} Hz (threshold: {FREQUENCY_LOW_THRESHOLD} Hz)",
            "severity": "critical" if frequency < 49.0 else "warning",
        })

    # ── Voltage sag / swell ────────────────────────────────
    if voltage < VOLTAGE_SAG_THRESHOLD:
        alerts.append({
            "time": timestamp,
            "meter_id": meter_id,
            "alert_type": "voltage_sag",
            "message": f"Voltage sag detected: {voltage:.2f} V",
            "severity": "warning",
        })
    elif voltage > VOLTAGE_SWELL_THRESHOLD:
        alerts.append({
            "time": timestamp,
            "meter_id": meter_id,
            "alert_type": "voltage_swell",
            "message": f"Voltage swell detected: {voltage:.2f} V",
            "severity": "warning",
        })

    # ── Load spike detection ───────────────────────────────
    history = rolling_loads[meter_id]
    if len(history) >= 5:
        avg_load = sum(history) / len(history)
        if load > avg_load * LOAD_SPIKE_FACTOR:
            alerts.append({
                "time": timestamp,
                "meter_id": meter_id,
                "alert_type": "load_spike",
                "message": f"Load spike: {load:.2f} kW (avg: {avg_load:.2f} kW, {load/avg_load:.1f}× average)",
                "severity": "critical" if load > avg_load * 2 else "warning",
            })

    # Update rolling window
    history.append(load)
    if len(history) > ROLLING_WINDOW:
        history.pop(0)

    return alerts


def on_connect(client, userdata, flags, reason_code, properties):
    """Called when connected to MQTT broker."""
    print(f"[MQTT Client] Connected with result code {reason_code}")
    client.subscribe(MQTT_TOPIC, qos=1)
    print(f"[MQTT Client] Subscribed to {MQTT_TOPIC}")


def on_message(client, userdata, msg):
    """Called for each message received on subscribed topics."""
    try:
        payload = json.loads(msg.payload.decode("utf-8"))

        # 1. Insert into TimescaleDB
        insert_reading(payload)

        # 2. Cache latest in Redis
        r = get_redis()
        r.hset(
            f"meter:{payload['meter_id']}:latest",
            mapping={
                "meter_id": payload["meter_id"],
                "timestamp": payload["timestamp"],
                "load_kw": str(payload["load_kw"]),
                "voltage": str(payload["voltage"]),
                "frequency": str(payload["frequency"]),
                "power_factor": str(payload["power_factor"]),
                "is_anomaly": str(payload["is_anomaly"]),
            },
        )
        # Also track all meter IDs in a set
        r.sadd("meters:all", payload["meter_id"])

        # 3. Check for anomalies
        alerts = check_anomalies(payload)
        for alert in alerts:
            insert_alert(alert)
            # Also push to Redis for fast access
            r.lpush("alerts:recent", json.dumps(alert))
            r.ltrim("alerts:recent", 0, 99)  # Keep last 100
            print(f"  ⚠ ALERT [{alert['severity']}] {alert['meter_id']}: {alert['message']}")

    except Exception as e:
        print(f"[MQTT Client] Error processing message: {e}")


def main():
    """Entry point: connect to MQTT broker and process messages."""
    print(f"[MQTT Client] Starting — MQTT={MQTT_HOST}:{MQTT_PORT}, Redis={REDIS_HOST}:{REDIS_PORT}")

    # Wait for dependencies
    print("[MQTT Client] Waiting for TimescaleDB...")
    for attempt in range(30):
        try:
            pool = get_sync_pool()
            conn = pool.getconn()
            conn.cursor().execute("SELECT 1")
            pool.putconn(conn)
            print("[MQTT Client] TimescaleDB is ready")
            break
        except Exception as e:
            print(f"  Attempt {attempt+1}: {e}")
            time.sleep(2)
    else:
        print("[MQTT Client] Could not connect to TimescaleDB. Exiting.")
        return

    print("[MQTT Client] Waiting for Redis...")
    for attempt in range(15):
        try:
            get_redis().ping()
            print("[MQTT Client] Redis is ready")
            break
        except Exception as e:
            print(f"  Attempt {attempt+1}: {e}")
            time.sleep(2)
    else:
        print("[MQTT Client] Could not connect to Redis. Exiting.")
        return

    # Set up MQTT client
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message

    # Connect with retry
    for attempt in range(30):
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
            break
        except Exception as e:
            wait = min(2 ** attempt, 30)
            print(f"[MQTT Client] MQTT connection attempt {attempt+1} failed: {e}. Retrying in {wait}s...")
            time.sleep(wait)
    else:
        print("[MQTT Client] Could not connect to MQTT broker. Exiting.")
        return

    print("[MQTT Client] Entering message loop...")
    try:
        client.loop_forever()
    except KeyboardInterrupt:
        print("\n[MQTT Client] Shutting down...")
    finally:
        client.disconnect()
        close_sync_pool()


if __name__ == "__main__":
    main()
