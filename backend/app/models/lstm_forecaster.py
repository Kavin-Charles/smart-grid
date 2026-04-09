"""
LSTM Demand Forecaster — Smart Grid Optimization

A PyTorch LSTM model that predicts electricity load 30 minutes ahead
based on recent sensor readings.

Architecture:
  - Input:  60 timesteps × 5 features (load_kw, voltage, frequency, power_factor, hour_sin)
  - LSTM:   2 layers, 64 hidden units, dropout 0.2
  - Output: 6 values (predicted load at 5-minute intervals over next 30 minutes)
"""

import os
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
from sklearn.preprocessing import MinMaxScaler

# ── Configuration ──────────────────────────────────────────────
MODEL_WEIGHTS_PATH = os.getenv("MODEL_WEIGHTS_PATH", "/app/model_weights/lstm.pt")
INPUT_SIZE = 5       # features per timestep
HIDDEN_SIZE = 64
NUM_LAYERS = 2
OUTPUT_SIZE = 6      # 6 × 5min = 30 min forecast
SEQUENCE_LENGTH = 60 # 60 past readings (10 min at 10s intervals)
DROPOUT = 0.2

FEATURE_COLUMNS = ["load_kw", "voltage", "frequency", "power_factor", "hour_sin"]


class LSTMModel(nn.Module):
    """PyTorch LSTM for time-series demand forecasting."""

    def __init__(
        self,
        input_size: int = INPUT_SIZE,
        hidden_size: int = HIDDEN_SIZE,
        num_layers: int = NUM_LAYERS,
        output_size: int = OUTPUT_SIZE,
        dropout: float = DROPOUT,
    ):
        super().__init__()
        self.hidden_size = hidden_size
        self.num_layers = num_layers

        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0,
        )
        self.dropout = nn.Dropout(dropout)
        self.fc = nn.Linear(hidden_size, output_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Forward pass.
        Args:
            x: Tensor of shape (batch_size, seq_len, input_size)
        Returns:
            Tensor of shape (batch_size, output_size)
        """
        # LSTM output: (batch, seq_len, hidden_size)
        lstm_out, _ = self.lstm(x)
        # Take the last timestep's output
        last_output = lstm_out[:, -1, :]
        out = self.dropout(last_output)
        out = self.fc(out)
        return out


class DemandForecaster:
    """High-level wrapper for the LSTM forecaster with train/predict interface."""

    def __init__(self, weights_path: str = MODEL_WEIGHTS_PATH):
        self.device = torch.device("cpu")
        self.model = LSTMModel().to(self.device)
        self.scaler = MinMaxScaler()
        self.load_scaler = MinMaxScaler()
        self.is_fitted = False
        self.weights_path = weights_path

        # Try to load pre-trained weights
        if os.path.exists(weights_path):
            self._load_weights(weights_path)

    def _load_weights(self, path: str) -> None:
        """Load model weights and scaler parameters from a checkpoint."""
        try:
            checkpoint = torch.load(path, map_location=self.device, weights_only=False)
            self.model.load_state_dict(checkpoint["model_state_dict"])
            self.scaler.min_ = np.array(checkpoint["scaler_min"])
            self.scaler.scale_ = np.array(checkpoint["scaler_scale"])
            self.scaler.data_min_ = np.array(checkpoint["scaler_data_min"])
            self.scaler.data_max_ = np.array(checkpoint["scaler_data_max"])
            self.scaler.data_range_ = np.array(checkpoint["scaler_data_range"])
            self.scaler.n_features_in_ = checkpoint["scaler_n_features"]
            self.scaler.feature_range = (0, 1)
            self.scaler.n_samples_seen_ = checkpoint.get("scaler_n_samples", 1000)

            self.load_scaler.min_ = np.array(checkpoint["load_scaler_min"])
            self.load_scaler.scale_ = np.array(checkpoint["load_scaler_scale"])
            self.load_scaler.data_min_ = np.array(checkpoint["load_scaler_data_min"])
            self.load_scaler.data_max_ = np.array(checkpoint["load_scaler_data_max"])
            self.load_scaler.data_range_ = np.array(checkpoint["load_scaler_data_range"])
            self.load_scaler.n_features_in_ = checkpoint["load_scaler_n_features"]
            self.load_scaler.feature_range = (0, 1)
            self.load_scaler.n_samples_seen_ = checkpoint.get("load_scaler_n_samples", 1000)

            self.is_fitted = True
            self.model.eval()
            print(f"[LSTM] Loaded pre-trained weights from {path}")
        except Exception as e:
            print(f"[LSTM] Warning: Could not load weights from {path}: {e}")
            self.is_fitted = False

    def save_weights(self, path: str | None = None) -> None:
        """Save model weights and scaler parameters."""
        path = path or self.weights_path
        os.makedirs(os.path.dirname(path), exist_ok=True)
        checkpoint = {
            "model_state_dict": self.model.state_dict(),
            "scaler_min": self.scaler.min_.tolist(),
            "scaler_scale": self.scaler.scale_.tolist(),
            "scaler_data_min": self.scaler.data_min_.tolist(),
            "scaler_data_max": self.scaler.data_max_.tolist(),
            "scaler_data_range": self.scaler.data_range_.tolist(),
            "scaler_n_features": self.scaler.n_features_in_,
            "scaler_n_samples": getattr(self.scaler, 'n_samples_seen_', 1000),
            "load_scaler_min": self.load_scaler.min_.tolist(),
            "load_scaler_scale": self.load_scaler.scale_.tolist(),
            "load_scaler_data_min": self.load_scaler.data_min_.tolist(),
            "load_scaler_data_max": self.load_scaler.data_max_.tolist(),
            "load_scaler_data_range": self.load_scaler.data_range_.tolist(),
            "load_scaler_n_features": self.load_scaler.n_features_in_,
            "load_scaler_n_samples": getattr(self.load_scaler, 'n_samples_seen_', 1000),
        }
        torch.save(checkpoint, path)
        print(f"[LSTM] Saved weights to {path}")

    @staticmethod
    def add_time_features(data: np.ndarray, timestamps: list | None = None) -> np.ndarray:
        """
        Add cyclical hour encoding as a feature.
        If timestamps not provided, generates evenly spaced hours.

        Args:
            data: (N, 4) array of [load_kw, voltage, frequency, power_factor]
            timestamps: optional list of hour floats

        Returns:
            (N, 5) array with hour_sin appended
        """
        n = len(data)
        if timestamps is not None:
            hours = np.array(timestamps)
        else:
            hours = np.linspace(0, 24 * (n / 8640), n) % 24

        hour_sin = np.sin(2 * np.pi * hours / 24).reshape(-1, 1)
        return np.hstack([data, hour_sin])

    def prepare_sequences(
        self, data: np.ndarray, seq_len: int = SEQUENCE_LENGTH
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Create input/output sequences for training.

        Args:
            data: (N, 5) feature array (already scaled)
            seq_len: lookback window

        Returns:
            X: (num_sequences, seq_len, 5)
            y: (num_sequences, OUTPUT_SIZE) — future load values
        """
        X, y = [], []
        # Each output point is 30 readings apart (30 × 10s = 5 min)
        forecast_gap = 30
        total_forecast = OUTPUT_SIZE * forecast_gap  # 180 readings = 30 min

        for i in range(seq_len, len(data) - total_forecast):
            X.append(data[i - seq_len : i])
            # Extract load (column 0) at 5-min intervals
            future_loads = [
                data[i + (j + 1) * forecast_gap, 0]
                for j in range(OUTPUT_SIZE)
            ]
            y.append(future_loads)

        return np.array(X), np.array(y)

    def train(
        self,
        raw_data: np.ndarray,
        hours: np.ndarray | None = None,
        epochs: int = 50,
        batch_size: int = 64,
        lr: float = 0.001,
        verbose: bool = True,
    ) -> list[float]:
        """
        Train the LSTM on raw sensor data.

        Args:
            raw_data: (N, 4) array of [load_kw, voltage, frequency, power_factor]
            hours: (N,) array of hour floats for cyclical encoding
            epochs: training epochs
            batch_size: batch size
            lr: learning rate
            verbose: print training progress

        Returns:
            List of loss values per epoch
        """
        # Add time features
        data = self.add_time_features(raw_data, hours)

        # Fit scalers
        self.scaler.fit(data)
        scaled_data = self.scaler.transform(data)

        # Fit a separate scaler for load column (for inverse transform)
        self.load_scaler.fit(raw_data[:, 0:1])

        # Create sequences
        X, y = self.prepare_sequences(scaled_data)
        if len(X) == 0:
            raise ValueError("Not enough data to create training sequences")

        if verbose:
            print(f"[LSTM] Training on {len(X)} sequences, {epochs} epochs")

        # Convert to tensors
        X_tensor = torch.FloatTensor(X).to(self.device)
        y_tensor = torch.FloatTensor(y).to(self.device)

        # Training setup
        dataset = torch.utils.data.TensorDataset(X_tensor, y_tensor)
        loader = torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=True)

        self.model.train()
        optimizer = torch.optim.Adam(self.model.parameters(), lr=lr)
        criterion = nn.MSELoss()

        losses = []
        for epoch in range(epochs):
            epoch_loss = 0.0
            for batch_X, batch_y in loader:
                optimizer.zero_grad()
                output = self.model(batch_X)
                loss = criterion(output, batch_y)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                optimizer.step()
                epoch_loss += loss.item()

            avg_loss = epoch_loss / len(loader)
            losses.append(avg_loss)

            if verbose and (epoch + 1) % 10 == 0:
                print(f"  Epoch {epoch+1}/{epochs} — Loss: {avg_loss:.6f}")

        self.is_fitted = True
        self.model.eval()

        if verbose:
            print(f"[LSTM] Training complete. Final loss: {losses[-1]:.6f}")

        return losses

    def predict(self, recent_data: np.ndarray, hours: np.ndarray | None = None) -> np.ndarray:
        """
        Predict load for the next 30 minutes.

        Args:
            recent_data: (N, 4) array of recent [load_kw, voltage, frequency, power_factor]
                         Must have at least SEQUENCE_LENGTH rows.
            hours: (N,) array of hour floats for cyclical encoding

        Returns:
            (OUTPUT_SIZE,) array of predicted load values in original scale (kW)
        """
        if not self.is_fitted:
            raise RuntimeError("Model has not been trained or weights not loaded")

        # Add time features and scale
        data = self.add_time_features(recent_data, hours)
        scaled = self.scaler.transform(data)

        # Take last SEQUENCE_LENGTH readings
        sequence = scaled[-SEQUENCE_LENGTH:]
        x = torch.FloatTensor(sequence).unsqueeze(0).to(self.device)

        # Inference
        self.model.eval()
        with torch.no_grad():
            prediction = self.model(x).squeeze(0).cpu().numpy()

        # Inverse scale the load predictions
        # Predictions are in the scaled space of column 0
        # We need to inverse transform using the feature scaler's column 0 params
        load_min = self.scaler.data_min_[0]
        load_range = self.scaler.data_range_[0]
        predictions_kw = prediction * load_range + load_min

        return predictions_kw


# ── Module-level singleton ─────────────────────────────────────
_forecaster: DemandForecaster | None = None


def get_forecaster() -> DemandForecaster:
    """Get or create the singleton forecaster instance."""
    global _forecaster
    if _forecaster is None:
        _forecaster = DemandForecaster()
    return _forecaster
