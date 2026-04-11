"""
Pydantic Schemas — Smart Grid Optimization

All API request/response models with ISO 8601 timestamps.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ── Sensor Readings ────────────────────────────────────────────

class SensorReading(BaseModel):
    """A single meter reading."""
    meter_id: str
    timestamp: datetime
    load_kw: float
    voltage: float
    frequency: float
    power_factor: float
    is_anomaly: bool = False


class LiveReadingsResponse(BaseModel):
    """Response for GET /api/grid/live."""
    meters: list[SensorReading]
    count: int
    retrieved_at: datetime


# ── Predictions ────────────────────────────────────────────────

class ForecastRequest(BaseModel):
    """Request body for POST /api/predictions/forecast."""
    meter_id: str = Field(..., description="Meter ID to forecast for")
    lookback_minutes: int = Field(default=10, ge=2, le=60, description="Minutes of history to use")


class ForecastPoint(BaseModel):
    """A single forecast point."""
    timestamp: datetime
    predicted_load_kw: float


class ForecastResponse(BaseModel):
    """Response for POST /api/predictions/forecast."""
    meter_id: str
    predictions: list[ForecastPoint]
    model_ready: bool = True
    generated_at: datetime


# ── Alerts ─────────────────────────────────────────────────────

class Alert(BaseModel):
    """An anomaly alert."""
    id: Optional[int] = None
    time: datetime
    meter_id: str
    alert_type: str
    message: str
    severity: str = "warning"
    acknowledged: bool = False


class AlertsResponse(BaseModel):
    """Response for GET /api/grid/alerts."""
    alerts: list[Alert]
    count: int


# ── Load Balancing ─────────────────────────────────────────────

class LoadBalanceRecommendation(BaseModel):
    """A single load redistribution recommendation."""
    source_meter: str
    target_meter: str
    shift_kw: float
    reason: str
    priority: str


class MeterStatus(BaseModel):
    """Status summary for a single meter."""
    meter_id: str
    load_kw: float
    utilization: float


class LoadBalanceResponse(BaseModel):
    """Response for GET /api/predictions/balance."""
    status: str
    total_load_kw: float
    avg_load_kw: float
    overloaded: list[MeterStatus]
    underloaded: list[MeterStatus]
    normal: list[MeterStatus]
    recommendations: list[LoadBalanceRecommendation]


# ── Stats ──────────────────────────────────────────────────────

class GridStats(BaseModel):
    """Aggregate grid statistics."""
    total_load_kw: float
    avg_load_kw: float
    peak_load_kw: float
    min_load_kw: float
    meter_count: int
    timestamp: datetime


# ── Health ─────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = "ok"
    version: str = "1.0.0"
    timestamp: datetime


# ── Authentication ─────────────────────────────────────────────

class LoginRequest(BaseModel):
    """Login request body."""
    email: str
    password: str = Field(..., min_length=8)


class UserResponse(BaseModel):
    """Public user data (no password hash)."""
    id: int
    email: str


class AuthResponse(BaseModel):
    """Login success response."""
    user: UserResponse
    message: str


class AcknowledgeResponse(BaseModel):
    id: int
    acknowledged: bool
