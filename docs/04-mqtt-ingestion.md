# 📡 MQTT Ingestion Service

**File:** `backend/app/services/mqtt_client.py`

The MQTT client is the **data pipeline backbone** — it subscribes to the MQTT broker, processes every sensor reading, stores it in the database, caches it in Redis, and runs anomaly detection. It's a standalone Python process, not part of the FastAPI server.

---

## Why a Separate Process?

MQTT subscribing is a **blocking, long-running loop** — the client sits and waits for messages forever. If we embedded this inside FastAPI:

- It would **block the async event loop**, preventing API requests from being served
- We'd need complex threading or async wrappers to make it work
- A crash in the MQTT loop could bring down the entire API

By running it as a separate Docker service, each service can fail and restart independently.

---

## Message Flow

```
MQTT Broker                   MQTT Client
    │                             │
    │─── Message arrives ────────▶│
    │                             ├──▶ 1. Parse JSON
    │                             ├──▶ 2. INSERT into TimescaleDB
    │                             ├──▶ 3. Cache in Redis
    │                             ├──▶ 4. Check for anomalies
    │                             │    └──▶ 4a. INSERT alert (if found)
    │                             │
    │─── Next message ───────────▶│
    │         ...                 │
```

---

## Connection & Subscription

The client uses `paho-mqtt` with callback-based architecture:

```python
def on_connect(client, userdata, flags, reason_code, properties):
    """Called automatically when connected to the broker."""
    print(f"[MQTT Client] Connected with result code {reason_code}")
    client.subscribe(MQTT_TOPIC, qos=1)  # Subscribe to 'grid/meters'
```

**What is QoS 1?** MQTT has three quality-of-service levels:
- **QoS 0**: Fire and forget (might lose messages)
- **QoS 1**: At least once delivery (guarantees delivery, might duplicate)
- **QoS 2**: Exactly once (guaranteed, no duplicates, but slower)

We use QoS 1 because losing occasional readings is acceptable, but we want reliable delivery for anomaly detection.

---

## Message Processing: `on_message()`

This function runs for **every** message received:

```python
def on_message(client, userdata, msg):
    payload = json.loads(msg.payload.decode("utf-8"))

    # 1. Store in TimescaleDB (permanent storage)
    insert_reading(payload)

    # 2. Cache latest reading in Redis (fast access)
    r = get_redis()
    r.hset(
        f"meter:{payload['meter_id']}:latest",  # Key: "meter:meter_001:latest"
        mapping={
            "meter_id": payload["meter_id"],
            "timestamp": payload["timestamp"],
            "load_kw": str(payload["load_kw"]),
            # ... other fields
        },
    )
    # Track all known meter IDs in a Redis set
    r.sadd("meters:all", payload["meter_id"])

    # 3. Check for anomalies
    alerts = check_anomalies(payload)
    for alert in alerts:
        insert_alert(alert)
        # Also push to Redis list for fast API access
        r.lpush("alerts:recent", json.dumps(alert))
        r.ltrim("alerts:recent", 0, 99)  # Keep only last 100
```

**Why both TimescaleDB AND Redis?**
- **TimescaleDB** is for historical queries ("show me the last hour of data")
- **Redis** is for instant lookups ("what's the latest reading for meter_003?")

Redis serves the `/api/grid/live` endpoint in sub-millisecond time, while TimescaleDB would need a `SELECT ... ORDER BY time DESC LIMIT 1` query per meter (~5-10ms each).

---

## Anomaly Detection Engine

The `check_anomalies()` function runs three detection rules:

### 1. Frequency Drop
```python
FREQUENCY_LOW_THRESHOLD = 49.5  # Hz (nominal is 50.0)

if frequency < FREQUENCY_LOW_THRESHOLD:
    alerts.append({
        "alert_type": "frequency_low",
        "severity": "critical" if frequency < 49.0 else "warning",
        "message": f"Frequency dropped to {frequency:.3f} Hz",
    })
```
**Real-world context:** Grid frequency dropping below 49.5 Hz indicates the generators can't keep up with demand. Below 49.0 Hz risks equipment damage and rolling blackouts.

### 2. Voltage Sag/Swell
```python
VOLTAGE_SAG_THRESHOLD = 210    # V (nominal is 230V)
VOLTAGE_SWELL_THRESHOLD = 250  # V

if voltage < VOLTAGE_SAG_THRESHOLD:
    # Voltage sag — can damage motors and equipment
    alerts.append({"alert_type": "voltage_sag", ...})
elif voltage > VOLTAGE_SWELL_THRESHOLD:
    # Voltage swell — can blow fuses and damage electronics
    alerts.append({"alert_type": "voltage_swell", ...})
```

### 3. Load Spike (Rolling Average Comparison)
```python
LOAD_SPIKE_FACTOR = 1.5  # 150% of average

# Keep a sliding window of the last 30 readings per meter
history = rolling_loads[meter_id]

if len(history) >= 5:
    avg_load = sum(history) / len(history)
    if load > avg_load * LOAD_SPIKE_FACTOR:
        alerts.append({
            "alert_type": "load_spike",
            "severity": "critical" if load > avg_load * 2 else "warning",
            "message": f"Load spike: {load:.2f} kW ({load/avg_load:.1f}× average)",
        })

# Update the rolling window
history.append(load)
if len(history) > ROLLING_WINDOW:
    history.pop(0)  # Remove oldest reading
```

**Why a rolling average?** A fixed threshold (like "alert if > 800 kW") wouldn't work because meters have different base loads. Meter_001 might normally operate at 700 kW while meter_005 runs at 400 kW. The rolling average adapts to each meter's normal behavior.

---

## Startup Sequence with Dependency Waiting

Docker services start in parallel, so the MQTT client must wait for its dependencies:

```python
# Wait for TimescaleDB to be ready
for attempt in range(30):
    try:
        pool = get_sync_pool()
        conn = pool.getconn()
        conn.cursor().execute("SELECT 1")  # Simple health check
        pool.putconn(conn)
        print("[MQTT Client] TimescaleDB is ready")
        break
    except Exception as e:
        print(f"  Attempt {attempt+1}: {e}")
        time.sleep(2)

# Wait for Redis to be ready
for attempt in range(15):
    try:
        get_redis().ping()
        print("[MQTT Client] Redis is ready")
        break
    except Exception as e:
        time.sleep(2)
```

Even though Docker Compose has `depends_on` with health checks, the application-level retry ensures we handle any edge cases where the service is up but not fully initialized.
