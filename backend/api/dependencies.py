"""
FastAPI dependencies for authentication and authorization
"""

import os
import httpx
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, jwk
from jose.utils import base64url_decode
from dotenv import load_dotenv
import json

# Load environment variables
load_dotenv()

# JWT configuration
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
SUPABASE_URL = os.getenv("SUPABASE_URL")

# Cache for JWKS
_jwks_cache = None

def get_jwks():
    """Fetch JWKS from Supabase for ES256 token validation"""
    global _jwks_cache
    if _jwks_cache is None:
        jwks_url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        response = httpx.get(jwks_url)
        if response.status_code == 200:
            _jwks_cache = response.json()
    return _jwks_cache

# Security scheme
security = HTTPBearer()


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


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
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
    token = credentials.credentials

    try:
        # First, get the algorithm from the token header
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg == "ES256":
            # Use JWKS for ES256 tokens (newer Supabase projects)
            jwks = get_jwks()
            if not jwks:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Could not fetch JWKS from Supabase",
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
                    detail="Token signing key not found",
                    headers={"WWW-Authenticate": "Bearer"},
                )

            # Decode with the public key
            payload = jwt.decode(
                token,
                key,
                algorithms=["ES256"],
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": False,
                },
            )
        else:
            # Use shared secret for HS256 tokens (legacy)
            if not SUPABASE_JWT_SECRET:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Server configuration error: JWT secret not set",
                )
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_aud": False,
                },
            )

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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(
        HTTPBearer(auto_error=False)
    ),
) -> Optional[AuthUser]:
    """
    Dependency to get the current user if authenticated, otherwise None
    Useful for endpoints that work differently for authenticated vs anonymous users

    Args:
        credentials: Optional HTTP Authorization header

    Returns:
        Optional[AuthUser]: The authenticated user or None
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None
