"""
Database Access Layer — Smart Grid Optimization

Provides two connection modes:
  1. Sync (psycopg2) for the standalone MQTT client service
  2. Async (asyncpg + SQLAlchemy) for FastAPI route handlers via dependency injection
"""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import psycopg2
import psycopg2.pool
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# ── Environment ────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:postgres@timescaledb:5432/smartgrid",
)
# asyncpg needs postgresql+asyncpg:// scheme
ASYNC_DATABASE_URL = DATABASE_URL.replace(
    "postgresql://", "postgresql+asyncpg://"
)

# ═══════════════════════════════════════════════════════════════
# SYNC MODE — used by MQTT client service
# ═══════════════════════════════════════════════════════════════

_sync_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def get_sync_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Get or lazily create the synchronous connection pool."""
    global _sync_pool
    if _sync_pool is None or _sync_pool.closed:
        _sync_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=10,
            dsn=DATABASE_URL,
        )
    return _sync_pool


def insert_reading(reading: dict) -> None:
    """Insert a sensor reading into the hypertable (sync)."""
    pool = get_sync_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO sensor_readings
                    (time, meter_id, load_kw, voltage, frequency, power_factor, is_anomaly)
                VALUES
                    (%(timestamp)s, %(meter_id)s, %(load_kw)s, %(voltage)s,
                     %(frequency)s, %(power_factor)s, %(is_anomaly)s)
                """,
                reading,
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        pool.putconn(conn)


def insert_alert(alert: dict) -> None:
    """Insert an alert record (sync)."""
    pool = get_sync_pool()
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO alerts (time, meter_id, alert_type, message, severity)
                VALUES (%(time)s, %(meter_id)s, %(alert_type)s, %(message)s, %(severity)s)
                """,
                alert,
            )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        pool.putconn(conn)


def close_sync_pool() -> None:
    """Gracefully close the sync pool."""
    global _sync_pool
    if _sync_pool and not _sync_pool.closed:
        _sync_pool.closeall()
        _sync_pool = None


# ═══════════════════════════════════════════════════════════════
# ASYNC MODE — used by FastAPI via dependency injection
# ═══════════════════════════════════════════════════════════════

_async_engine = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_async_engine() -> None:
    """Initialize the async engine and session factory. Call once at startup."""
    global _async_engine, _async_session_factory
    _async_engine = create_async_engine(
        ASYNC_DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )
    _async_session_factory = async_sessionmaker(
        _async_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


async def close_async_engine() -> None:
    """Dispose the async engine. Call on shutdown."""
    global _async_engine, _async_session_factory
    if _async_engine:
        await _async_engine.dispose()
        _async_engine = None
        _async_session_factory = None


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an async DB session.

    Usage in route handlers:
        @router.get("/endpoint")
        async def handler(db: AsyncSession = Depends(get_async_session)):
            result = await db.execute(text("SELECT ..."))
    """
    if _async_session_factory is None:
        raise RuntimeError("Async DB engine not initialized. Call init_async_engine() first.")
    async with _async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()
