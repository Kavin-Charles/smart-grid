"""
FastAPI Dependencies — Smart Grid Optimization

Authentication dependencies for route protection.
"""

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_token
from app.services.db import get_async_session


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_async_session),
):
    """
    FastAPI dependency that extracts and validates the current user
    from the access_token httpOnly cookie.

    Raises HTTP 401 if:
      - Cookie is missing
      - Token is invalid or expired
      - Token type is not "access"
      - User not found in database
      - User account is inactive
    """
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    # Ensure this is an access token, not a refresh token
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    email: str | None = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Fetch user from database
    result = await db.execute(
        text("SELECT id, email, is_active FROM users WHERE email = :email"),
        {"email": email},
    )
    user = result.fetchone()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    if not user[2]:  # is_active
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is inactive",
        )

    return user
