"""
Sensor Simulator — Tamil Nadu Industrial Load Profiles
Generates realistic electricity meter data and publishes via MQTT.

Load profile characteristics (TNERC-aligned):
  - Morning peak:  06:00–10:00 IST (industrial startup)
  - Evening peak:  18:00–22:00 IST (domestic + industrial)
  - Trough:        03:00–05:00 IST (minimum demand)
  - Base load per meter: ~400–800 kW range
"""

import json
import math
import os
import random
import time
from datetime import datetime, timezone, timedelta

import numpy as np
import paho.mqtt.client as mqtt

# ── Configuration ──────────────────────────────────────────────
MQTT_HOST = os.getenv("MQTT_HOST", "mosquitto")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = "grid/meters"
PUBLISH_INTERVAL = int(os.getenv("PUBLISH_INTERVAL", "10"))  # seconds
NUM_METERS = int(os.getenv("NUM_METERS", "10"))
ANOMALY_PROBABILITY = 0.02  # 2% chance per reading

# IST offset
IST = timezone(timedelta(hours=5, minutes=30))


def tamil_nadu_load_profile(hour_float: float, meter_seed: int) -> float:
    """
    Compute realistic Tamil Nadu industrial load (kW) for a given hour.

    Uses superimposed sinusoids to model:
      - Base diurnal cycle (24h period)
      - Morning peak bump (Gaussian centered at 08:00)
      - Evening peak bump (Gaussian centered at 20:00)
      - Night trough
    """
    rng = random.Random(meter_seed)
    base_load = rng.uniform(400, 600)       # MW base per meter
    peak_amplitude = rng.uniform(150, 250)  # MW swing

    # Primary diurnal sinusoid: minimum at ~04:00, max at ~16:00
    diurnal = -math.cos(2 * math.pi * (hour_float - 4) / 24)

    # Morning peak gaussian (center=8, σ=1.5)
    morning_peak = 0.7 * math.exp(-0.5 * ((hour_float - 8) / 1.5) ** 2)

    # Evening peak gaussian (center=20, σ=2.0) — stronger and wider
    evening_peak = 1.0 * math.exp(-0.5 * ((hour_float - 20) / 2.0) ** 2)

    load = base_load + peak_amplitude * (0.5 * diurnal + morning_peak + evening_peak)
    return max(load, 100)  # Floor at 100 kW


def generate_reading(meter_id: str, meter_index: int) -> dict:
    """Generate a single sensor reading with realistic noise."""
    now = datetime.now(IST)
    hour_float = now.hour + now.minute / 60.0 + now.second / 3600.0

    # Base load from profile
    load = tamil_nadu_load_profile(hour_float, meter_index)

    # Add Gaussian noise (σ = 15 kW)
    load += np.random.normal(0, 15)

    # Determine if this is an anomaly (spike or dip)
    is_anomaly = random.random() < ANOMALY_PROBABILITY
    if is_anomaly:
        # Random spike: +40% to +80% above normal
        spike_factor = random.uniform(1.4, 1.8)
        load *= spike_factor

    # Voltage: 230V nominal ± small variation
    voltage = 230 + np.random.normal(0, 3)
    if is_anomaly:
        voltage += random.choice([-15, 15])  # Voltage sag or swell

    # Frequency: 50 Hz nominal ± tiny drift
    frequency = 50.0 + np.random.normal(0, 0.05)
    if is_anomaly:
        frequency -= random.uniform(0.3, 0.8)  # Frequency drop during anomaly

    # Power factor: 0.85–0.98 typical industrial
    power_factor = min(0.99, max(0.75, 0.92 + np.random.normal(0, 0.03)))

    return {
        "meter_id": meter_id,
        "timestamp": now.isoformat(),
        "load_kw": round(load, 2),
        "voltage": round(voltage, 2),
        "frequency": round(frequency, 3),
        "power_factor": round(power_factor, 3),
        "is_anomaly": is_anomaly,
    }


def main():
    """Main loop: connect to MQTT and publish meter data."""
    meter_ids = [f"meter_{i+1:03d}" for i in range(NUM_METERS)]

    print(f"[Simulator] Connecting to MQTT broker at {MQTT_HOST}:{MQTT_PORT}")
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)

    # Retry connection with backoff
    connected = False
    for attempt in range(30):
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
            client.loop_start()
            connected = True
            print(f"[Simulator] Connected to MQTT broker")
            break
        except Exception as e:
            wait = min(2 ** attempt, 30)
            print(f"[Simulator] Connection attempt {attempt+1} failed: {e}. Retrying in {wait}s...")
            time.sleep(wait)

    if not connected:
        print("[Simulator] Could not connect to MQTT broker. Exiting.")
        return

    print(f"[Simulator] Publishing data for {NUM_METERS} meters every {PUBLISH_INTERVAL}s")

    try:
        while True:
            for i, meter_id in enumerate(meter_ids):
                reading = generate_reading(meter_id, i)
                payload = json.dumps(reading)
                client.publish(MQTT_TOPIC, payload, qos=1)

                status = "⚠ ANOMALY" if reading["is_anomaly"] else "✓"
                print(
                    f"  [{reading['timestamp']}] {meter_id}: "
                    f"{reading['load_kw']:>8.2f} kW | "
                    f"{reading['voltage']:>6.2f} V | "
                    f"{reading['frequency']:>6.3f} Hz | "
                    f"PF {reading['power_factor']:.3f} {status}"
                )

            time.sleep(PUBLISH_INTERVAL)

    except KeyboardInterrupt:
        print("\n[Simulator] Shutting down...")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
