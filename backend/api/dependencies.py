"""
FastAPI dependencies for authentication and authorization
"""

import os
import logging
import secrets
import httpx
from typing import Optional, Tuple
from time import time

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from dotenv import load_dotenv

from api.security import (
    AUTH_COOKIE_NAME,
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    CSRF_PROTECTED_METHODS,
)

logger = logging.getLogger("splitai.auth")

# Load environment variables
load_dotenv()

# JWT configuration
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_JWT_AUDIENCE = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
SUPABASE_JWT_ISSUER = os.getenv("SUPABASE_JWT_ISSUER")
JWKS_CACHE_TTL_SECONDS = int(os.getenv("JWKS_CACHE_TTL_SECONDS", "3600"))
JWKS_FETCH_TIMEOUT_SECONDS = float(os.getenv("JWKS_FETCH_TIMEOUT_SECONDS", "3.0"))

# Cache for JWKS
_jwks_cache = None
_jwks_cache_at = 0.0

def get_jwks():
    """Fetch JWKS from Supabase for ES256 token validation"""
    global _jwks_cache, _jwks_cache_at
    now = time()
    cache_age = now - _jwks_cache_at
    if _jwks_cache is None or cache_age > JWKS_CACHE_TTL_SECONDS:
        if not SUPABASE_URL:
            return None
        jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        response = httpx.get(jwks_url, timeout=JWKS_FETCH_TIMEOUT_SECONDS)
        if response.status_code == 200:
            _jwks_cache = response.json()
            _jwks_cache_at = now
    return _jwks_cache

# Security scheme
security = HTTPBearer(auto_error=False)


class AuthUser:
    """
    Represents an authenticated user
    """

    def __init__(self, user_id: str, email: Optional[str] = None, access_token: Optional[str] = None):
        self.id = user_id
        self.email = email
        self.access_token = access_token  # Store token for authenticated Supabase requests

    def __repr__(self):
        return f"AuthUser(id={self.id}, email={self.email})"


def _resolve_issuer() -> Optional[str]:
    if SUPABASE_JWT_ISSUER:
        return SUPABASE_JWT_ISSUER
    if SUPABASE_URL:
        return f"{SUPABASE_URL}/auth/v1"
    return None


def _decode_token(token: str) -> dict:
    # First, get the algorithm from the token header
    header = jwt.get_unverified_header(token)
    alg = header.get("alg", "HS256")

    decode_kwargs = {
        "algorithms": [alg],
        "options": {
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": bool(SUPABASE_JWT_AUDIENCE),
            "verify_iss": bool(_resolve_issuer()),
        },
    }
    if SUPABASE_JWT_AUDIENCE:
        decode_kwargs["audience"] = SUPABASE_JWT_AUDIENCE
    issuer = _resolve_issuer()
    if issuer:
        decode_kwargs["issuer"] = issuer

    if alg == "ES256":
        # Use JWKS for ES256 tokens (newer Supabase projects)
        jwks = get_jwks()
        if not jwks:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service unavailable",
            )

        # Find the right key by kid
        kid = header.get("kid")
        key = None
        for k in jwks.get("keys", []):
            if k.get("kid") == kid:
                key = k
                break

        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return jwt.decode(token, key, **decode_kwargs)

    # Use shared secret for HS256 tokens (legacy)
    if not SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: JWT secret not set",
        )
    decode_kwargs["algorithms"] = ["HS256"]
    return jwt.decode(token, SUPABASE_JWT_SECRET, **decode_kwargs)


def _extract_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
) -> Tuple[str, bool]:
    if credentials and credentials.scheme.lower() == "bearer":
        return credentials.credentials, False

    token = request.cookies.get(AUTH_COOKIE_NAME)
    if token:
        return token, True

    logger.warning(
        "No auth token found: bearer=%s cookie=%s method=%s path=%s",
        bool(credentials), bool(token), request.method, request.url.path,
    )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated (no auth cookie or bearer token found)",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _validate_csrf(request: Request):
    if request.method.upper() not in CSRF_PROTECTED_METHODS:
        return
    csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
    csrf_header = request.headers.get(CSRF_HEADER_NAME)
    if not csrf_cookie or not csrf_header:
        logger.warning(
            "CSRF validation failed: cookie_present=%s header_present=%s method=%s path=%s",
            bool(csrf_cookie), bool(csrf_header), request.method, request.url.path,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"CSRF token required (cookie={'present' if csrf_cookie else 'missing'}, header={'present' if csrf_header else 'missing'})",
        )
    if not secrets.compare_digest(csrf_cookie, csrf_header):
        logger.warning(
            "CSRF validation failed: mismatch method=%s path=%s",
            request.method, request.url.path,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token (cookie and header do not match)",
        )


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthUser:
    """
    Dependency to get the current authenticated user from JWT token

    Supports both HS256 (legacy) and ES256 (newer Supabase projects) algorithms.

    Args:
        credentials: HTTP Authorization header with Bearer token

    Returns:
        AuthUser: The authenticated user

    Raises:
        HTTPException: If token is invalid or expired
    """
    token, from_cookie = _extract_token(request, credentials)
    if from_cookie:
        _validate_csrf(request)

    try:
        payload = _decode_token(token)

        # Extract user ID from payload
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing user ID",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Extract email if available
        email: Optional[str] = payload.get("email")

        return AuthUser(user_id=user_id, email=email, access_token=token)

    except JWTError as e:
        logger.warning("JWT validation failed: %s method=%s path=%s", str(e), request.method, request.url.path)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {type(e).__name__}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[AuthUser]:
    """
    Dependency to get the current user if authenticated, otherwise None
    Useful for endpoints that work differently for authenticated vs anonymous users

    Args:
        credentials: Optional HTTP Authorization header

    Returns:
        Optional[AuthUser]: The authenticated user or None
    """
    has_bearer = credentials and credentials.scheme.lower() == "bearer"
    has_cookie = bool(request.cookies.get(AUTH_COOKIE_NAME))
    if not has_bearer and not has_cookie:
        return None

    try:
        return await get_current_user(request, credentials)
    except HTTPException:
        return None
