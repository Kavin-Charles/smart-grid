"""
Pretrain Script — Smart Grid Optimization

Generates 24 hours of synthetic Tamil Nadu industrial load data,
trains the LSTM forecaster, and saves weights to model_weights/lstm.pt.

Run: python scripts/pretrain.py
"""

import sys
import os
import math
import random

import numpy as np

# Add parent dir so we can import from backend/app
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend", "app"))

from models.lstm_forecaster import DemandForecaster

# ── Configuration ──────────────────────────────────────────────
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "..", "model_weights", "lstm.pt")
DURATION_HOURS = 24
SAMPLE_INTERVAL_SECONDS = 10
NUM_METERS = 10
EPOCHS = 50
BATCH_SIZE = 64


def tamil_nadu_load_profile(hour_float: float, meter_seed: int) -> float:
    """
    Generate realistic Tamil Nadu industrial load (kW) for a given hour.
    Mirrors the simulator's profile function.
    """
    rng = random.Random(meter_seed)
    base_load = rng.uniform(400, 600)
    peak_amplitude = rng.uniform(150, 250)

    diurnal = -math.cos(2 * math.pi * (hour_float - 4) / 24)
    morning_peak = 0.7 * math.exp(-0.5 * ((hour_float - 8) / 1.5) ** 2)
    evening_peak = 1.0 * math.exp(-0.5 * ((hour_float - 20) / 2.0) ** 2)

    load = base_load + peak_amplitude * (0.5 * diurnal + morning_peak + evening_peak)
    return max(load, 100)


def generate_synthetic_data(meter_index: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """
    Generate 24 hours of synthetic sensor data for one meter.

    Returns:
        data: (N, 4) array of [load_kw, voltage, frequency, power_factor]
        hours: (N,) array of hour floats
    """
    num_samples = int(DURATION_HOURS * 3600 / SAMPLE_INTERVAL_SECONDS)  # 8640
    data = []
    hours = []

    for i in range(num_samples):
        seconds = i * SAMPLE_INTERVAL_SECONDS
        hour_float = (seconds / 3600) % 24
        hours.append(hour_float)

        load = tamil_nadu_load_profile(hour_float, meter_index)
        load += np.random.normal(0, 15)  # Gaussian noise

        # Occasional anomalies (~2%)
        if random.random() < 0.02:
            load *= random.uniform(1.4, 1.8)

        voltage = 230 + np.random.normal(0, 3)
        frequency = 50.0 + np.random.normal(0, 0.05)
        power_factor = min(0.99, max(0.75, 0.92 + np.random.normal(0, 0.03)))

        data.append([load, voltage, frequency, power_factor])

    return np.array(data), np.array(hours)


def main():
    print("=" * 60)
    print("  Smart Grid — LSTM Pre-training Script")
    print("=" * 60)
    print(f"  Duration:    {DURATION_HOURS} hours of synthetic data")
    print(f"  Interval:    {SAMPLE_INTERVAL_SECONDS}s ({DURATION_HOURS * 3600 // SAMPLE_INTERVAL_SECONDS} samples)")
    print(f"  Meters:      {NUM_METERS}")
    print(f"  Epochs:      {EPOCHS}")
    print(f"  Output:      {os.path.abspath(OUTPUT_PATH)}")
    print("=" * 60)

    # Generate combined training data from all meters
    all_data = []
    all_hours = []

    for meter_idx in range(NUM_METERS):
        data, hours = generate_synthetic_data(meter_idx)
        all_data.append(data)
        all_hours.append(hours)
        print(f"  Generated data for meter_{meter_idx+1:03d}: "
              f"load range [{data[:, 0].min():.0f}, {data[:, 0].max():.0f}] kW")

    # Concatenate all meter data for training
    combined_data = np.vstack(all_data)
    combined_hours = np.concatenate(all_hours)

    # Shuffle to prevent meter-order bias
    indices = np.random.permutation(len(combined_data))
    # Actually, for time series we should NOT shuffle the data itself
    # but train on each meter's sequence. Let's train on meter 0 which is representative.
    # Using a single 24h sequence gives the model the temporal patterns it needs.
    print(f"\n  Training on meter_001 sequence ({len(all_data[0])} samples)...")

    train_data = all_data[0]
    train_hours = all_hours[0]

    # Create forecaster and train
    forecaster = DemandForecaster(weights_path=OUTPUT_PATH)
    losses = forecaster.train(
        raw_data=train_data,
        hours=train_hours,
        epochs=EPOCHS,
        batch_size=BATCH_SIZE,
        lr=0.001,
        verbose=True,
    )

    # Save weights
    forecaster.save_weights(OUTPUT_PATH)

    # Quick validation: predict on the last chunk
    recent = train_data[-60:]
    recent_hours = train_hours[-60:]
    predictions = forecaster.predict(recent, recent_hours)

    print(f"\n  Validation — Predictions for next 30 min (5-min intervals):")
    for i, pred in enumerate(predictions):
        print(f"    +{(i+1)*5:2d} min: {pred:.2f} kW")

    actual_last = train_data[-1, 0]
    print(f"\n  Last actual load: {actual_last:.2f} kW")
    print(f"  Model ready! Weights saved to: {os.path.abspath(OUTPUT_PATH)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
