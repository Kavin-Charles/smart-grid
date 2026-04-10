"""
Auth Router — Smart Grid Optimization

Authentication endpoints:
  - POST /api/auth/login   — Authenticate and issue JWT cookies
  - POST /api/auth/refresh — Refresh access token silently
  - POST /api/auth/logout  — Clear auth cookies
  - GET  /api/auth/me      — Return current user info
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.requests import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_password,
    verify_token,
)
from app.core.deps import get_current_user
from app.schemas import AuthResponse, LoginRequest, UserResponse
from app.services.db import get_async_session

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Cookie settings ────────────────────────────────────────────
_COOKIE_OPTS = dict(
    httponly=True,
    samesite="lax",
    secure=False,   # Set True in production behind HTTPS
    path="/",
)


# ── POST /api/auth/login ──────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_async_session),
):
    """
    Authenticate user with email + password.
    On success, sets httpOnly cookies for access_token and refresh_token.
    """
    # Fetch user by email
    result = await db.execute(
        text("SELECT id, email, hashed_password, is_active FROM users WHERE email = :email"),
        {"email": body.email},
    )
    user = result.fetchone()

    # Generic error — never reveal whether email or password is wrong
    if user is None or not verify_password(body.password, user[2]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user[3]:  # is_active
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Create tokens
    token_data = {"sub": user[1]}  # email
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    # Set httpOnly cookies
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=60 * 60,  # 1 hour
        **_COOKIE_OPTS,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=7 * 24 * 60 * 60,  # 7 days
        **_COOKIE_OPTS,
    )

    return AuthResponse(
        user=UserResponse(id=user[0], email=user[1]),
        message="Login successful",
    )


# ── POST /api/auth/refresh ────────────────────────────────────

@router.post("/refresh")
async def refresh_token(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_async_session),
):
    """
    Silently refresh the access token using the refresh_token cookie.
    Issues a new access_token cookie.
    """
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token missing",
        )

    payload = verify_token(token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Verify user still exists and is active
    result = await db.execute(
        text("SELECT id, email, is_active FROM users WHERE email = :email"),
        {"email": email},
    )
    user = result.fetchone()

    if user is None or not user[2]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Issue new access token
    new_access_token = create_access_token({"sub": user[1]})
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        max_age=60 * 60,
        **_COOKIE_OPTS,
    )

    return {"message": "Token refreshed"}


# ── POST /api/auth/logout ─────────────────────────────────────

@router.post("/logout")
async def logout(response: Response):
    """
    Clear auth cookies by setting max_age=0.
    """
    response.delete_cookie(key="access_token", path="/")
    response.delete_cookie(key="refresh_token", path="/")
    return {"message": "Logged out"}


# ── GET /api/auth/me ──────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
async def get_me(current_user=Depends(get_current_user)):
    """
    Return the currently authenticated user's info.
    Used by frontend AuthContext to validate existing cookie sessions.
    """
    return UserResponse(id=current_user[0], email=current_user[1])
