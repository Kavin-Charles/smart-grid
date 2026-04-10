"""
Predictions Router — Smart Grid Optimization

ML prediction endpoints:
  - POST /api/predictions/forecast — LSTM 30-minute demand forecast
  - GET  /api/predictions/balance  — Load balance recommendations
"""

import os
from datetime import datetime, timezone, timedelta

import numpy as np
import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_user
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import (
    ForecastRequest,
    ForecastResponse,
    ForecastPoint,
    LoadBalanceResponse,
    MeterStatus,
    LoadBalanceRecommendation,
)
from app.services.db import get_async_session
from app.models.lstm_forecaster import get_forecaster, SEQUENCE_LENGTH
from app.models.load_balancer import analyze_load_distribution

router = APIRouter(prefix="/api/predictions", tags=["predictions"])

# ── Redis async client (lazy singleton) ────────────────────────
_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Get async Redis client."""
    global _redis
    if _redis is None:
        _redis = aioredis.Redis(
            host=os.getenv("REDIS_HOST", "redis"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            decode_responses=True,
        )
    return _redis


# ── POST /api/predictions/forecast ────────────────────────────

@router.post("/forecast", response_model=ForecastResponse)
async def get_forecast(
    request: ForecastRequest,
    db: AsyncSession = Depends(get_async_session),
    current_user=Depends(get_current_user),
):
    """
    Run LSTM inference to predict load for the next 30 minutes.
    Fetches recent data from TimescaleDB, runs the model, returns predictions.
    """
    forecaster = get_forecaster()

    # Check if model is ready
    if not forecaster.is_fitted:
        return ForecastResponse(
            meter_id=request.meter_id,
            predictions=[],
            model_ready=False,
            generated_at=datetime.now(timezone.utc),
        )

    # Fetch recent sensor data (need at least SEQUENCE_LENGTH readings)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=request.lookback_minutes)

    result = await db.execute(
        text("""
            SELECT time, load_kw, voltage, frequency, power_factor
            FROM sensor_readings
            WHERE meter_id = :meter_id AND time >= :cutoff
            ORDER BY time ASC
        """),
        {"meter_id": request.meter_id, "cutoff": cutoff},
    )

    rows = result.fetchall()

    if len(rows) < SEQUENCE_LENGTH:
        # Not enough data — try to pad with available data
        # Fetch more aggressively
        result2 = await db.execute(
            text("""
                SELECT time, load_kw, voltage, frequency, power_factor
                FROM sensor_readings
                WHERE meter_id = :meter_id
                ORDER BY time DESC
                LIMIT :limit
            """),
            {"meter_id": request.meter_id, "limit": SEQUENCE_LENGTH},
        )
        rows = list(reversed(result2.fetchall()))

    if len(rows) < SEQUENCE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough data for {request.meter_id}. "
                   f"Need {SEQUENCE_LENGTH} readings, got {len(rows)}. "
                   f"Wait for more data to accumulate.",
        )

    # Convert to numpy arrays
    data = np.array([[r[1], r[2], r[3], r[4]] for r in rows], dtype=np.float64)
    timestamps = [r[0] for r in rows]
    hours = np.array([t.hour + t.minute / 60 + t.second / 3600 for t in timestamps])

    # Run prediction
    try:
        predictions_kw = forecaster.predict(data, hours)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

    # Build forecast points (5-minute intervals from now)
    now = datetime.now(timezone.utc)
    forecast_points = [
        ForecastPoint(
            timestamp=now + timedelta(minutes=5 * (i + 1)),
            predicted_load_kw=round(float(pred), 2),
        )
        for i, pred in enumerate(predictions_kw)
    ]

    return ForecastResponse(
        meter_id=request.meter_id,
        predictions=forecast_points,
        model_ready=True,
        generated_at=now,
    )


# ── GET /api/predictions/balance ──────────────────────────────

@router.get("/balance", response_model=LoadBalanceResponse)
async def get_load_balance(current_user=Depends(get_current_user)):
    """
    Analyze current load distribution and return redistribution recommendations.
    Reads current loads from Redis cache.
    """
    r = await get_redis()
    meter_ids = await r.smembers("meters:all")

    meter_loads = {}
    for meter_id in meter_ids:
        data = await r.hgetall(f"meter:{meter_id}:latest")
        if data:
            meter_loads[meter_id] = float(data["load_kw"])

    if not meter_loads:
        raise HTTPException(status_code=404, detail="No meter data available")

    analysis = analyze_load_distribution(meter_loads)

    return LoadBalanceResponse(
        status=analysis["status"],
        total_load_kw=analysis["total_load_kw"],
        avg_load_kw=analysis["avg_load_kw"],
        overloaded=[MeterStatus(**m) for m in analysis["overloaded"]],
        underloaded=[MeterStatus(**m) for m in analysis["underloaded"]],
        normal=[MeterStatus(**m) for m in analysis["normal"]],
        recommendations=[
            LoadBalanceRecommendation(**r) for r in analysis["recommendations"]
        ],
    )
