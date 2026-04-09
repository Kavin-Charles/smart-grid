# LSTM Demand Forecaster

**File:** `backend/app/models/lstm_forecaster.py`  
**Pre-training:** `scripts/pretrain.py`  
**Weights:** `model_weights/lstm.pt`

The LSTM (Long Short-Term Memory) demand forecaster is a neural network that predicts electricity load **30 minutes into the future**. It uses recent sensor readings to forecast demand, enabling grid operators to prepare for upcoming load changes.

---

## Why LSTM?

Electricity demand is a **time series** — the current load is heavily influenced by what happened in the recent past. LSTMs are a type of recurrent neural network specifically designed for sequential data:

```
                    ┌─────────────────────────────────────┐
  Time series:      │ t-60  t-59  t-58  ...  t-2  t-1  t │  60 past readings
                    └───────────────┬─────────────────────┘
                                    │
                              ┌─────▼─────┐
                              │   LSTM     │  Learns temporal patterns
                              │  Network   │  (peaks, troughs, trends)
                              └─────┬─────┘
                                    │
                    ┌───────────────▼──────────────────────┐
  Predictions:      │  t+5   t+10   t+15   t+20  t+25  t+30 │  6 future values
                    └─────────────────────────────────────┘
                       5min  10min  15min  20min  25min  30min
```

**Why not a simpler model?** Linear regression or moving averages miss the *temporal dependencies*. An LSTM can learn patterns like "if load was rising for the last 10 minutes AND it's 17:30, it's probably the evening peak starting."

---

## Model Architecture

```python
class LSTMModel(nn.Module):
    def __init__(self):
        super().__init__()

        # LSTM layer: the core sequential learning component
        self.lstm = nn.LSTM(
            input_size=5,      # 5 features per timestep
            hidden_size=64,    # Internal memory capacity
            num_layers=2,      # Stack 2 LSTM layers for deeper learning
            batch_first=True,  # Input shape: (batch, sequence, features)
            dropout=0.2,       # 20% dropout between layers to prevent overfitting
        )

        self.dropout = nn.Dropout(0.2)

        # Linear layer: maps the LSTM's 64-dim output to 6 predictions
        self.fc = nn.Linear(64, 6)

    def forward(self, x):
        # x shape: (batch_size, 60, 5) — 60 timesteps, 5 features each

        lstm_out, _ = self.lstm(x)
        # lstm_out shape: (batch_size, 60, 64) — LSTM output at each timestep

        last_output = lstm_out[:, -1, :]
        # Take only the LAST timestep's output: (batch_size, 64)
        # This contains the LSTM's "summary" of the entire 60-step sequence

        out = self.dropout(last_output)
        out = self.fc(out)
        # Final shape: (batch_size, 6) — 6 predicted loads

        return out
```

### What Makes LSTM Special?

A regular neural network processes each data point independently. An LSTM **remembers** previous inputs through its hidden state. This is critical for time series because:

- The load at 18:00 depends on whether it's been rising since 17:00 (evening peak starting) or falling since 16:00 (unusual pattern)
- Seasonality: the model learns that 20:00 typically has high demand

The `hidden_size=64` means the LSTM maintains a 64-dimensional "memory" that it updates at each timestep.

---

## Input Features

Each timestep in the input sequence has 5 features:

| Feature | Why included |
|---------|-------------|
| `load_kw` | Primary signal — the actual electricity consumption |
| `voltage` | Grid health indicator — drops during overload |
| `frequency` | Grid stability — drops when supply can't meet demand |
| `power_factor` | Efficiency metric — affects actual power delivery |
| `hour_sin` | **Cyclical time encoding** — tells the model what time of day it is |

### Cyclical Time Encoding

We can't feed the hour directly as a number (0-23) because the model would think midnight (hour 0) and 11 PM (hour 23) are far apart, when they're actually 1 hour apart. We use sine encoding:

```python
hour_sin = np.sin(2 * np.pi * hours / 24)
```

This maps hours onto a circle:
```
                12:00 (sin = 0)
                  │
   06:00 ─────── + ──────── 18:00
  (sin = 1)      │        (sin = -1)
                  │
                00:00 (sin = 0)
```

Now the model can learn "when sin is near -1, it's evening peak time."

---

## Data Normalization

Before feeding data to the LSTM, we scale all features to the [0, 1] range using `MinMaxScaler`:

```python
from sklearn.preprocessing import MinMaxScaler

self.scaler = MinMaxScaler()
self.scaler.fit(data)           # Learn the min/max of each feature
scaled_data = self.scaler.transform(data)  # Scale to [0, 1]
```

**Why normalize?** Neural networks work best when inputs are small and in similar ranges. If load_kw is 400-800 but frequency is 49.9-50.1, the model would be dominated by the load_kw signal.

The scaler parameters are **saved with the model weights** so we can reproduce the same scaling during inference.

---

## Training Sequence Creation

We slice the time series into overlapping windows:

```python
def prepare_sequences(self, data, seq_len=60):
    X, y = [], []
    forecast_gap = 30  # 30 readings × 10s = 5 minutes

    for i in range(seq_len, len(data) - total_forecast):
        # Input: 60 consecutive readings
        X.append(data[i - seq_len : i])

        # Output: load values at 5-min intervals over next 30 min
        future_loads = [
            data[i + (j + 1) * forecast_gap, 0]  # Column 0 = load_kw
            for j in range(6)
        ]
        y.append(future_loads)

    return np.array(X), np.array(y)
```

Visually:

```
Data: ─────[window of 60]──────────────────────────────────
           ╰── Input X ──╯     ↑    ↑    ↑    ↑    ↑    ↑
                              +5   +10  +15  +20  +25  +30 min
                               ╰──── Target y (6 values) ────╯
```

---

## Training Loop

```python
self.model.train()
optimizer = torch.optim.Adam(self.model.parameters(), lr=0.001)
criterion = nn.MSELoss()  # Mean Squared Error

for epoch in range(epochs):
    for batch_X, batch_y in loader:
        optimizer.zero_grad()             # Reset gradients
        output = self.model(batch_X)      # Forward pass
        loss = criterion(output, batch_y) # Calculate error
        loss.backward()                   # Compute gradients

        # Prevent exploding gradients (common with RNNs)
        torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)

        optimizer.step()                  # Update weights
```

**Gradient clipping** (`clip_grad_norm_`) is important for LSTMs. Without it, gradients can grow exponentially during backpropagation through time, causing training to diverge.

---

## Pre-training Script

The `scripts/pretrain.py` generates 24 hours of synthetic data and trains the model:

```
Pre-training Output:
  Duration:    24 hours of synthetic data
  Interval:    10s (8,640 samples per meter)
  Training on: 8,400 sequences
  Result:      Final loss: 0.003168
  Weights:     model_weights/lstm.pt (211 KB)
```

This means the API has a working model **from the moment it starts**, without needing to wait for real data to accumulate.

---

## Prediction (Inference)

```python
def predict(self, recent_data, hours=None):
    # Add time features and scale
    data = self.add_time_features(recent_data, hours)
    scaled = self.scaler.transform(data)

    # Take last 60 readings
    sequence = scaled[-60:]
    x = torch.FloatTensor(sequence).unsqueeze(0)  # Add batch dimension

    # Run inference (no gradient computation needed)
    self.model.eval()
    with torch.no_grad():
        prediction = self.model(x).squeeze(0).cpu().numpy()

    # Convert predictions back to original scale (kW)
    load_min = self.scaler.data_min_[0]
    load_range = self.scaler.data_range_[0]
    predictions_kw = prediction * load_range + load_min

    return predictions_kw  # Array of 6 predicted load values
```

**`torch.no_grad()`** tells PyTorch not to compute gradients during prediction. This saves memory and is faster — we only need gradients during training.

---

## Singleton Pattern

The forecaster is instantiated once and reused:

```python
_forecaster: DemandForecaster | None = None

def get_forecaster() -> DemandForecaster:
    """Get or create the singleton forecaster instance."""
    global _forecaster
    if _forecaster is None:
        _forecaster = DemandForecaster()
    return _forecaster
```

Loading the model and scaler parameters is expensive (~200ms). By using a singleton, we pay this cost once at startup, and every subsequent prediction is fast (~5ms).
