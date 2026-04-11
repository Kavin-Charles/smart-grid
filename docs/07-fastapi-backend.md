# FastAPI Backend

**Files:**
- `backend/app/main.py` — Application entry point
- `backend/app/schemas.py` — Pydantic request/response models
- `backend/app/routers/grid.py` — Grid data endpoints
- `backend/app/routers/predictions.py` — ML prediction endpoints

The FastAPI backend is the REST API layer that connects the database, cache, and ML models to the React frontend.

---

## Application Setup (`main.py`)

### Lifespan Handler

FastAPI uses a **lifespan** context manager to run setup and teardown code:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── STARTUP ──────────────────────────────
    # 1. Initialize the async database engine
    init_async_engine()

    # 2. Pre-load the LSTM model weights
    from app.models.lstm_forecaster import get_forecaster
    forecaster = get_forecaster()
    if forecaster.is_fitted:
        print("[API] LSTM model loaded with pre-trained weights")

    yield  # ← Server is running and handling requests here

    # ── SHUTDOWN ─────────────────────────────
    await close_async_engine()
```

**Why is this here and not in the constructor?** Because database connections and ML model loading are **async-aware operations** that need to happen within the event loop context. The lifespan handler guarantees they run at the right time.

### CORS Middleware

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",   # Frontend (nginx)
        "http://localhost:5173",   # Vite dev server
        "http://frontend:3000",    # Docker internal
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**What is CORS?** Cross-Origin Resource Sharing. Browsers block frontend JavaScript from making requests to a different domain/port by default. The frontend on port 3000 needs to call the API on port 8000 — CORS middleware explicitly allows this.

---

## Pydantic Schemas (`schemas.py`)

Every API request and response has a **Pydantic model** that validates data types and structure:

```python
class SensorReading(BaseModel):
    meter_id: str
    timestamp: datetime          # Automatically parsed from ISO 8601 strings
    load_kw: float
    voltage: float
    frequency: float
    power_factor: float
    is_anomaly: bool = False     # Default value if not provided

class ForecastRequest(BaseModel):
    meter_id: str = Field(..., description="Meter ID to forecast for")
    lookback_minutes: int = Field(
        default=10,
        ge=2,        # Must be >= 2
        le=60,       # Must be <= 60
        description="Minutes of history to use"
    )
```

**Why Pydantic?** It gives us:
1. **Automatic validation** — wrong types return a 422 error with clear messages
2. **Auto-documentation** — FastAPI generates OpenAPI/Swagger docs from the models
3. **Serialization** — `datetime` objects are automatically converted to ISO 8601 strings in responses

---

## Grid Data Router (`grid.py`)

### `GET /api/grid/live` — Latest Readings (from Redis)

```python
@router.get("/live", response_model=LiveReadingsResponse)
async def get_live_readings():
    r = await get_redis()  # Async Redis client

    # Get all known meter IDs from the Redis set
    meter_ids = await r.smembers("meters:all")

    meters = []
    for meter_id in sorted(meter_ids):
        # Each meter's latest reading is stored in a Redis hash
        data = await r.hgetall(f"meter:{meter_id}:latest")
        if data:
            meters.append(SensorReading(
                meter_id=data["meter_id"],
                timestamp=datetime.fromisoformat(data["timestamp"]),
                load_kw=float(data["load_kw"]),
                # ... other fields
            ))

    return LiveReadingsResponse(
        meters=meters,
        count=len(meters),
        retrieved_at=datetime.now(timezone.utc),
    )
```

**No database query here!** This endpoint reads exclusively from Redis, responding in under 1ms even with 100 meters.

---

### `GET /api/grid/history/{meter_id}` — Historical Data (from TimescaleDB)

```python
@router.get("/history/{meter_id}")
async def get_meter_history(
    meter_id: str,
    minutes: int = Query(default=60, ge=1, le=1440),
    db: AsyncSession = Depends(get_async_session),  # ← Dependency injection
):
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
    # ... format and return
```

**Note the `Depends(get_async_session)`** — this is FastAPI's dependency injection system. The `db` parameter is automatically populated with an async SQLAlchemy session. After the request completes, the session is automatically closed.

---

### `GET /api/grid/alerts` — Anomaly Alerts

```python
@router.get("/alerts", response_model=AlertsResponse)
async def get_alerts(
    limit: int = Query(default=50, ge=1, le=200),
    meter_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_async_session),
    current_user=Depends(get_current_user),
):
    query = """
        SELECT id, time, meter_id, alert_type, message, severity, acknowledged
        FROM alerts
        WHERE acknowledged = FALSE
    """
    params = {"limit": limit}
    
    if meter_id:
        query += " AND meter_id = :meter_id"
        params["meter_id"] = meter_id
        
    query += " ORDER BY time DESC LIMIT :limit"

    result = await db.execute(text(query), params)
```

Only returns **unacknowledged** alerts, sorted by most recent first. The `meter_id` query parameter is used by the `MeterDetail` view to show alerts specific to one meter.

---

### `PATCH /api/grid/alerts/{alert_id}/acknowledge` — Dismiss Alert

Marks a specific alert as acknowledged so it no longer appears in the active alert feed for operators. Returns `{ "id": alert_id, "acknowledged": True }`.

---

## Predictions Router (`predictions.py`)

### `POST /api/predictions/forecast` — LSTM Demand Forecast

This is the most complex endpoint — it ties together the database, the ML model, and data preprocessing:

```python
@router.post("/forecast", response_model=ForecastResponse)
async def get_forecast(
    request: ForecastRequest,
    db: AsyncSession = Depends(get_async_session),
):
    forecaster = get_forecaster()  # Singleton LSTM model

    # 1. Check if model is ready
    if not forecaster.is_fitted:
        return ForecastResponse(
            meter_id=request.meter_id,
            predictions=[],
            model_ready=False,  # Frontend shows "Model loading..." message
            generated_at=datetime.now(timezone.utc),
        )

    # 2. Fetch recent data from TimescaleDB
    result = await db.execute(
        text("""
            SELECT time, load_kw, voltage, frequency, power_factor
            FROM sensor_readings
            WHERE meter_id = :meter_id
            ORDER BY time DESC
            LIMIT :limit
        """),
        {"meter_id": request.meter_id, "limit": SEQUENCE_LENGTH},
    )
    rows = list(reversed(result.fetchall()))

    # 3. Need at least 60 readings (10 minutes of data)
    if len(rows) < SEQUENCE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough data. Need {SEQUENCE_LENGTH} readings, got {len(rows)}.",
        )

    # 4. Convert to numpy and run prediction
    data = np.array([[r[1], r[2], r[3], r[4]] for r in rows])
    hours = np.array([t.hour + t.minute / 60 for t in [r[0] for r in rows]])
    predictions_kw = forecaster.predict(data, hours)

    # 5. Build forecast points (5-min intervals from now)
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
```

**Error handling:** The endpoint returns `400 Bad Request` when there's not enough data. The React frontend handles this gracefully — it simply shows no forecast data until 10+ minutes of readings have accumulated.

---

## API Documentation

FastAPI automatically generates interactive API docs. Once running:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

---

## Endpoint Reference

| Method | Path | Data Source | Response Time |
|--------|------|-------------|--------------|
| GET | `/api/health` | — | < 1ms |
| GET | `/api/grid/live` | Redis | < 1ms |
| GET | `/api/grid/history/{meter_id}` | TimescaleDB | 5-20ms |
| GET | `/api/grid/alerts` | TimescaleDB | 5-10ms |
| PATCH | `/api/grid/alerts/{alert_id}/acknowledge` | TimescaleDB | < 5ms |
| GET | `/api/grid/stats` | Redis | < 1ms |
| POST | `/api/predictions/forecast` | TimescaleDB + LSTM | 15-50ms |
| GET | `/api/predictions/balance` | Redis + Algorithm | < 5ms |
