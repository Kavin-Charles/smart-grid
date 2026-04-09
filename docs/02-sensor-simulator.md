# Sensor Simulator

**File:** `simulator/sensor_simulator.py`

The sensor simulator generates realistic electricity load data that mimics what you'd see from industrial meters in Tamil Nadu, India. It publishes this data over MQTT to the `grid/meters` topic.

---

## What Problem Does This Solve?

In a real deployment, physical smart meters would be sending data. For development and testing, we need a **synthetic data generator** that produces *realistic* patterns — not just random numbers. Our simulator models the actual electricity consumption patterns observed in Tamil Nadu's industrial grid.

---

## Tamil Nadu Load Profile

The load profile is based on regulations from the **Tamil Nadu Electricity Regulatory Commission (TNERC)**:

```
Load (kW)
 800 ┤               ╭──╮                     ╭────╮
 700 ┤              ╭╯  ╰╮                  ╭─╯    ╰──╮
 600 ┤             ╭╯    ╰╮               ╭─╯          ╰╮
 500 ┤────────────╭╯      ╰──────────────╭╯             ╰──
 400 ┤           ╭╯                     ╭╯
 350 ┤──╮    ╭──╱                      ╱
 300 ┤   ╰──╯
     └──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──┬──
       00 02 04 06 08 10 12 14 16 18 20 22 24
                      Hour of Day (IST)
            ▲              ▲
         Trough      Morning Peak    Evening Peak
        03:00-05:00  06:00-10:00     18:00-22:00
```

---

## Core Algorithm: `tamil_nadu_load_profile()`

This function uses **superimposed mathematical curves** to model the load pattern:

```python
def tamil_nadu_load_profile(hour_float: float, meter_seed: int) -> float:
    rng = random.Random(meter_seed)
    base_load = rng.uniform(400, 600)       # Each meter has a unique base load
    peak_amplitude = rng.uniform(150, 250)  # And unique peak swing

    # 1. Primary cycle: follows a cosine wave over 24 hours
    #    Minimum at 04:00 (cos = -1), maximum at 16:00 (cos = +1)
    diurnal = -math.cos(2 * math.pi * (hour_float - 4) / 24)

    # 2. Morning peak: Gaussian bump centered at 08:00
    #    σ=1.5 means the bump spans roughly 06:00-10:00
    morning_peak = 0.7 * math.exp(-0.5 * ((hour_float - 8) / 1.5) ** 2)

    # 3. Evening peak: Gaussian bump centered at 20:00
    #    σ=2.0 means wider spread (18:00-22:00), coefficient 1.0 = stronger
    evening_peak = 1.0 * math.exp(-0.5 * ((hour_float - 20) / 2.0) ** 2)

    # Combine all components
    load = base_load + peak_amplitude * (0.5 * diurnal + morning_peak + evening_peak)
    return max(load, 100)  # Never below 100 kW
```

**Why this approach?** Real electricity demand isn't a simple sine wave. It has:
- A **base diurnal cycle** (people use more power during the day)
- **Sharp peaks** at specific hours (industrial startup, evening cooking/lighting)
- A **floor** — some load always exists (refrigeration, servers, street lights)

The **Gaussian bumps** (`exp(-0.5 * ((x-center)/σ)²)`) create localized peaks at specific hours. The `σ` (sigma) parameter controls how wide each peak is.

---

## Reading Structure

Each reading is a JSON object with these fields:

```python
reading = {
    "meter_id": "meter_003",           # Which meter sent this
    "timestamp": "2026-04-09T18:30:00+05:30",  # ISO 8601 with IST timezone
    "load_kw": 756.4,                  # Electricity consumption in kilowatts
    "voltage": 232.1,                  # Grid voltage (nominal 230V ± noise)
    "frequency": 49.98,               # Grid frequency (nominal 50Hz ± drift)
    "power_factor": 0.92,             # Efficiency ratio (0.85-0.98 typical)
    "is_anomaly": False                # Was this flagged as anomalous?
}
```

---

## Anomaly Injection

2% of readings are intentionally anomalous to test the detection system:

```python
is_anomaly = random.random() < 0.02  # 2% probability

if is_anomaly:
    load *= random.uniform(1.4, 1.8)           # Spike: 40-80% above normal
    voltage += random.choice([-15, 15])         # Voltage sag or swell
    frequency -= random.uniform(0.3, 0.8)       # Frequency drop
```

**Why inject anomalies?** Without them, the anomaly detection system would have nothing to find. In real grids, anomalies are caused by equipment failures, sudden demand surges, or grid faults.

---

## MQTT Connection with Retry

The simulator connects to the broker with exponential backoff:

```python
for attempt in range(30):
    try:
        client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
        client.loop_start()
        break
    except Exception as e:
        wait = min(2 ** attempt, 30)  # 1s, 2s, 4s, 8s... max 30s
        time.sleep(wait)
```

**Why retry?** In Docker, services start in parallel. The simulator might boot before Mosquitto is ready. Exponential backoff prevents hammering a service that isn't up yet.

---

## Configuration

All configurable via environment variables in `docker-compose.yml`:

| Variable | Default | What it controls |
|----------|---------|-----------------|
| `MQTT_HOST` | `mosquitto` | Broker hostname |
| `MQTT_PORT` | `1883` | Broker port |
| `PUBLISH_INTERVAL` | `10` | Seconds between publish cycles |
| `NUM_METERS` | `10` | How many virtual meters to simulate |
