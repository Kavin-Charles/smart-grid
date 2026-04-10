"""
FastAPI Application — Smart Grid Optimization

Main entry point with:
  - Lifespan handler for DB/Redis initialization
  - CORS middleware for frontend access
  - Router registration
  - Health check endpoint
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, grid, predictions
from app.schemas import HealthResponse
from app.services.db import init_async_engine, close_async_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize and cleanup resources."""
    # ── Startup ────────────────────────────────────────────
    # Validate required environment variables
    if not os.getenv("JWT_SECRET_KEY"):
        raise RuntimeError(
            "JWT_SECRET_KEY environment variable is required. "
            "Set it to a random string of at least 32 characters."
        )

    print("[API] Initializing async database engine...")
    init_async_engine()
    print("[API] Database engine ready")

    # Pre-load LSTM model weights
    print("[API] Loading LSTM forecaster...")
    from app.models.lstm_forecaster import get_forecaster
    forecaster = get_forecaster()
    if forecaster.is_fitted:
        print("[API] LSTM model loaded with pre-trained weights")
    else:
        print("[API] LSTM model initialized (no pre-trained weights found)")

    yield

    # ── Shutdown ───────────────────────────────────────────
    print("[API] Shutting down...")
    await close_async_engine()


# ── App creation ───────────────────────────────────────────────
app = FastAPI(
    title="Smart Grid Optimization API",
    description="AI-powered electricity grid monitoring, forecasting, and optimization",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ───────────────────────────────────────────────────────
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:5173", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(grid.router)
app.include_router(predictions.router)


# ── Health check ───────────────────────────────────────────────
@app.get("/api/health", response_model=HealthResponse, tags=["system"])
async def health_check():
    """Basic health check endpoint."""
    return HealthResponse(
        status="ok",
        version="1.0.0",
        timestamp=datetime.now(timezone.utc),
    )
