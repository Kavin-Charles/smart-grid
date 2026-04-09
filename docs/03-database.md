# Database Layer

**File:** `backend/app/services/db.py`  
**Schema:** `db/init.sql`

The database layer provides a **dual-mode access pattern** — synchronous for the MQTT ingestion service and asynchronous for the FastAPI backend. This is one of the most important architectural decisions in the project.

---

## Why Two Modes?

```
┌─────────────────┐                    ┌─────────────────┐
│   MQTT Client   │                    │  FastAPI Server  │
│ (Standalone     │                    │ (Async event     │
│  Python process)│                    │  loop via        │
│                 │                    │  uvicorn)        │
│  Uses: psycopg2 │                    │  Uses: asyncpg   │
│  (synchronous)  │                    │  (asynchronous)  │
└────────┬────────┘                    └────────┬─────────┘
         │                                      │
         └─────────────┐  ┌────────────────────┘
                       ▼  ▼
              ┌────────────────────┐
              │    TimescaleDB     │
              │   (PostgreSQL)     │
              └────────────────────┘
```

The **MQTT client** runs in its own process with a simple message loop — it doesn't need async. Using `psycopg2` (the standard PostgreSQL driver) keeps things simple.

The **FastAPI server** runs on an async event loop. Using synchronous database calls would **block the entire server** while waiting for a query to complete. That's why we use `asyncpg` through SQLAlchemy's async engine.

---

## TimescaleDB Schema

TimescaleDB is PostgreSQL with a time-series extension. The key feature is the **hypertable** — it automatically partitions data by time intervals for fast range queries.

```sql
-- Regular table definition
CREATE TABLE IF NOT EXISTS sensor_readings (
    time            TIMESTAMPTZ NOT NULL,
    meter_id        TEXT NOT NULL,
    load_kw         DOUBLE PRECISION,
    voltage         DOUBLE PRECISION,
    frequency       DOUBLE PRECISION,
    power_factor    DOUBLE PRECISION,
    is_anomaly      BOOLEAN DEFAULT FALSE
);

-- This single line converts it into a hypertable.
-- TimescaleDB will automatically create "chunks" (partitions) by time period.
-- Queries like "WHERE time >= NOW() - INTERVAL '1 hour'" become very fast
-- because they only scan the relevant chunks.
SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);
```

**What's a hypertable?** Think of it like a regular table, but internally the data is split into time-based chunks (e.g., 7-day intervals). When you query "give me the last hour of data," PostgreSQL only searches the newest chunk instead of scanning the entire table.

---

## Synchronous Mode (MQTT Client)

The sync mode uses a **connection pool** — a set of pre-opened database connections that can be reused:

```python
_sync_pool: psycopg2.pool.ThreadedConnectionPool | None = None

def get_sync_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Get or lazily create the synchronous connection pool."""
    global _sync_pool
    if _sync_pool is None or _sync_pool.closed:
        _sync_pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=2,   # Always keep 2 connections open
            maxconn=10,  # Allow up to 10 under heavy load
            dsn=DATABASE_URL,
        )
    return _sync_pool
```

**Why a connection pool?** Opening a new database connection takes ~50-100ms (TCP handshake, authentication, etc.). A pool keeps connections open and ready, so each query only takes the actual query time (~1-5ms).

### Inserting a Reading

```python
def insert_reading(reading: dict) -> None:
    pool = get_sync_pool()
    conn = pool.getconn()        # Borrow a connection from the pool
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
                reading,  # psycopg2 maps dict keys to %(key)s placeholders
            )
        conn.commit()            # Make the insert permanent
    except Exception as e:
        conn.rollback()          # Undo any partial work on error
        raise e
    finally:
        pool.putconn(conn)       # Always return the connection to the pool
```

**Key pattern:** `getconn()` → use → `putconn()` with a `finally` block ensures connections are never leaked, even if an error occurs.

---

## Asynchronous Mode (FastAPI)

The async mode uses SQLAlchemy's async engine with `asyncpg` under the hood:

```python
def init_async_engine() -> None:
    """Initialize the async engine and session factory. Call once at startup."""
    global _async_engine, _async_session_factory

    _async_engine = create_async_engine(
        ASYNC_DATABASE_URL,        # postgresql+asyncpg://...
        pool_size=10,              # Max connections in the pool
        max_overflow=20,           # Extra connections allowed under burst load
        pool_pre_ping=True,        # Test each connection before using it
    )

    _async_session_factory = async_sessionmaker(
        _async_engine,
        class_=AsyncSession,
        expire_on_commit=False,    # Don't invalidate data after commit
    )
```

### The Dependency Injection Function

This is the function that FastAPI route handlers use to get a database session:

```python
async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency — yields an async DB session.
    The session is automatically closed after the request completes.
    """
    if _async_session_factory is None:
        raise RuntimeError("Async DB engine not initialized")

    async with _async_session_factory() as session:
        try:
            yield session       # Hand session to the route handler
        finally:
            await session.close()  # Clean up after the request
```

**How is this used?** In route handlers, you declare it as a dependency:

```python
from fastapi import Depends

@router.get("/api/grid/alerts")
async def get_alerts(db: AsyncSession = Depends(get_async_session)):
    # `db` is a ready-to-use async database session
    result = await db.execute(text("SELECT * FROM alerts LIMIT 50"))
    return result.fetchall()
```

FastAPI automatically:
1. Calls `get_async_session()` before your handler
2. Passes the yielded `session` as the `db` parameter
3. After your handler returns, continues past `yield` to hit the `finally` block

This is called the **Dependency Injection (DI) pattern** — your route handler doesn't need to know *how* to create a database session, it just declares "I need one."

---

## URL Scheme Translation

TimescaleDB is PostgreSQL, so connection URLs follow the PostgreSQL format. However, the async driver (`asyncpg`) needs a different URL scheme:

```python
DATABASE_URL = "postgresql://postgres:postgres@timescaledb:5432/smartgrid"

# For asyncpg, we swap the scheme:
ASYNC_DATABASE_URL = DATABASE_URL.replace(
    "postgresql://", "postgresql+asyncpg://"
)
# Result: "postgresql+asyncpg://postgres:postgres@timescaledb:5432/smartgrid"
```

SQLAlchemy uses the `+asyncpg` suffix to know which driver to use internally.
