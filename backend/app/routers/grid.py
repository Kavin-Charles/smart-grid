"""
Grid Data Router — Smart Grid Optimization

Endpoints for live meter readings, historical data, alerts, and stats.
All handlers use async SQLAlchemy sessions via dependency injection.
"""

import json
from datetime import datetime, timezone, timedelta

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, Query

from app.core.deps import get_current_user
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import (
    SensorReading,
    LiveReadingsResponse,
    Alert,
    AlertsResponse,
    GridStats,
)
from app.services.db import get_async_session

router = APIRouter(prefix="/api/grid", tags=["grid"])

# ── Redis async client (lazy singleton) ────────────────────────
_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Get async Redis client."""
    global _redis
    if _redis is None:
        import os
        _redis = aioredis.Redis(
            host=os.getenv("REDIS_HOST", "redis"),
            port=int(os.getenv("REDIS_PORT", "6379")),
            decode_responses=True,
        )
    return _redis


# ── GET /api/grid/live ─────────────────────────────────────────

@router.get("/live", response_model=LiveReadingsResponse)
async def get_live_readings(current_user=Depends(get_current_user)):
    """
    Returns the latest reading for each meter from Redis cache.
    This is the fastest path — no database query needed.
    """
    r = await get_redis()
    meter_ids = await r.smembers("meters:all")

    meters = []
    for meter_id in sorted(meter_ids):
        data = await r.hgetall(f"meter:{meter_id}:latest")
        if data:
            meters.append(SensorReading(
                meter_id=data["meter_id"],
                timestamp=datetime.fromisoformat(data["timestamp"]),
                load_kw=float(data["load_kw"]),
                voltage=float(data["voltage"]),
                frequency=float(data["frequency"]),
                power_factor=float(data["power_factor"]),
                is_anomaly=data["is_anomaly"] == "True",
            ))

    return LiveReadingsResponse(
        meters=meters,
        count=len(meters),
        retrieved_at=datetime.now(timezone.utc),
    )


# ── GET /api/grid/history/{meter_id} ──────────────────────────

@router.get("/history/{meter_id}")
async def get_meter_history(
    meter_id: str,
    minutes: int = Query(default=60, ge=1, le=1440),
    db: AsyncSession = Depends(get_async_session),
    current_user=Depends(get_current_user),
):
    """
    Returns recent readings for a specific meter from TimescaleDB.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)

    result = await db.execute(
        text("""
            SELECT time, meter_id, load_kw, voltage, frequency, power_factor, is_anomaly
            FROM sensor_readings
            WHERE meter_id = :meter_id AND time >= :cutoff
            ORDER BY time ASC
            LIMIT 1000
        """),
        {"meter_id": meter_id, "cutoff": cutoff},
    )

    rows = result.fetchall()
    readings = [
        {
            "timestamp": row[0].isoformat(),
            "meter_id": row[1],
            "load_kw": row[2],
            "voltage": row[3],
            "frequency": row[4],
            "power_factor": row[5],
            "is_anomaly": row[6],
        }
        for row in rows
    ]

    return {"meter_id": meter_id, "readings": readings, "count": len(readings)}


# ── GET /api/grid/alerts ──────────────────────────────────────

@router.get("/alerts", response_model=AlertsResponse)
async def get_alerts(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_async_session),
    current_user=Depends(get_current_user),
):
    """
    Returns recent unacknowledged alerts from TimescaleDB.
    """
    result = await db.execute(
        text("""
            SELECT id, time, meter_id, alert_type, message, severity, acknowledged
            FROM alerts
            WHERE acknowledged = FALSE
            ORDER BY time DESC
            LIMIT :limit
        """),
        {"limit": limit},
    )

    rows = result.fetchall()
    alerts = [
        Alert(
            id=row[0],
            time=row[1],
            meter_id=row[2],
            alert_type=row[3],
            message=row[4],
            severity=row[5],
            acknowledged=row[6],
        )
        for row in rows
    ]

    return AlertsResponse(alerts=alerts, count=len(alerts))


# ── GET /api/grid/stats ──────────────────────────────────────

@router.get("/stats", response_model=GridStats)
async def get_grid_stats(current_user=Depends(get_current_user)):
    """
    Returns aggregate stats from the latest Redis-cached readings.
    """
    r = await get_redis()
    meter_ids = await r.smembers("meters:all")

    loads = []
    for meter_id in meter_ids:
        data = await r.hgetall(f"meter:{meter_id}:latest")
        if data:
            loads.append(float(data["load_kw"]))

    if not loads:
        return GridStats(
            total_load_kw=0,
            avg_load_kw=0,
            peak_load_kw=0,
            min_load_kw=0,
            meter_count=0,
            timestamp=datetime.now(timezone.utc),
        )

    return GridStats(
        total_load_kw=round(sum(loads), 2),
        avg_load_kw=round(sum(loads) / len(loads), 2),
        peak_load_kw=round(max(loads), 2),
        min_load_kw=round(min(loads), 2),
        meter_count=len(loads),
        timestamp=datetime.now(timezone.utc),
    )
