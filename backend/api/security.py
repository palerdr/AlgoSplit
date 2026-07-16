"""
Security configuration helpers shared across auth modules.
"""

import os
import secrets
from typing import Optional

from fastapi import HTTPException, Request, Response, status


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


_app_env = os.getenv("APP_ENV", os.getenv("ENV", "development")).strip().lower()
IS_PRODUCTION = _app_env in {"prod", "production"}

AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "algosplit_access_token")
AUTH_REFRESH_COOKIE_NAME = os.getenv("AUTH_REFRESH_COOKIE_NAME", "algosplit_refresh_token")
CSRF_COOKIE_NAME = os.getenv("CSRF_COOKIE_NAME", "algosplit_csrf_token")
CSRF_HEADER_NAME = os.getenv("CSRF_HEADER_NAME", "X-CSRF-Token")
CSRF_PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Production cookies must never be readable by script or sent over HTTP. Local
# development can opt out to support an http://localhost backend.
AUTH_COOKIE_SECURE = True if IS_PRODUCTION else _env_bool("AUTH_COOKIE_SECURE", False)
AUTH_COOKIE_HTTPONLY = True if IS_PRODUCTION else _env_bool("AUTH_COOKIE_HTTPONLY", True)
AUTH_COOKIE_PATH = os.getenv("AUTH_COOKIE_PATH", "/")
AUTH_COOKIE_DOMAIN: Optional[str] = os.getenv("AUTH_COOKIE_DOMAIN")
AUTH_COOKIE_SAMESITE = os.getenv(
    "AUTH_COOKIE_SAMESITE",
    "lax",  # Lax is correct: Vercel rewrites make API calls same-origin
).strip().lower()
if AUTH_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    AUTH_COOKIE_SAMESITE = "lax"
if AUTH_COOKIE_SAMESITE == "none" and not AUTH_COOKIE_SECURE:
    raise RuntimeError("AUTH_COOKIE_SAMESITE=none requires AUTH_COOKIE_SECURE=true")

# Browser sessions use HttpOnly cookies by default in production, keeping both
# access and refresh tokens out of localStorage and JavaScript. Native-only
# deployments can explicitly set this to true and continue using SecureStore.
AUTH_EXPOSE_ACCESS_TOKEN = _env_bool("AUTH_EXPOSE_ACCESS_TOKEN", not IS_PRODUCTION)
NATIVE_CLIENT_HEADER_NAME = "X-AlgoSplit-Client"
AUTH_REFRESH_COOKIE_MAX_AGE_SECONDS = int(
    os.getenv("AUTH_REFRESH_COOKIE_MAX_AGE_SECONDS", str(30 * 24 * 60 * 60))
)


def should_expose_auth_tokens(request: Request) -> bool:
    """Expose JSON credentials only to the explicit native client flow.

    Browser sessions continue to receive Secure, HttpOnly cookies even when
    native token responses are enabled for the same deployment.
    """
    return (
        AUTH_EXPOSE_ACCESS_TOKEN
        and request.headers.get(NATIVE_CLIENT_HEADER_NAME, "").strip().lower() == "native"
    )


def _cookie_common() -> dict:
    return {
        "path": AUTH_COOKIE_PATH,
        "domain": AUTH_COOKIE_DOMAIN,
        "secure": AUTH_COOKIE_SECURE,
        "samesite": AUTH_COOKIE_SAMESITE,
    }


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    max_age: int,
) -> str:
    csrf_token = secrets.token_urlsafe(32)

    auth_cookie = _cookie_common()
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=access_token,
        max_age=max_age,
        httponly=AUTH_COOKIE_HTTPONLY,
        **auth_cookie,
    )

    if refresh_token:
        refresh_cookie = _cookie_common()
        response.set_cookie(
            key=AUTH_REFRESH_COOKIE_NAME,
            value=refresh_token,
            max_age=AUTH_REFRESH_COOKIE_MAX_AGE_SECONDS,
            httponly=True,
            **refresh_cookie,
        )

    csrf_cookie = _cookie_common()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf_token,
        max_age=max_age,
        httponly=False,
        **csrf_cookie,
    )
    return csrf_token


def clear_auth_cookies(response: Response) -> None:
    cookie = _cookie_common()
    response.delete_cookie(AUTH_COOKIE_NAME, **cookie)
    response.delete_cookie(AUTH_REFRESH_COOKIE_NAME, **cookie)
    response.delete_cookie(CSRF_COOKIE_NAME, **cookie)


def validate_csrf_request(request: Request) -> None:
    """Enforce double-submit CSRF protection for a cookie-authenticated write."""
    if request.method.upper() not in CSRF_PROTECTED_METHODS:
        return

    csrf_cookie = request.cookies.get(CSRF_COOKIE_NAME)
    csrf_header = request.headers.get(CSRF_HEADER_NAME)
    if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid CSRF token",
        )
