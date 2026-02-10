"""
Security configuration helpers shared across auth modules.
"""

import os
import secrets
from typing import Optional

from fastapi import Response


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


_app_env = os.getenv("APP_ENV", os.getenv("ENV", "development")).strip().lower()
_is_production = _app_env in {"prod", "production"}

AUTH_COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "splitai_access_token")
CSRF_COOKIE_NAME = os.getenv("CSRF_COOKIE_NAME", "splitai_csrf_token")
CSRF_HEADER_NAME = os.getenv("CSRF_HEADER_NAME", "X-CSRF-Token")
CSRF_PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

AUTH_COOKIE_SECURE = _env_bool("AUTH_COOKIE_SECURE", _is_production)
AUTH_COOKIE_HTTPONLY = _env_bool("AUTH_COOKIE_HTTPONLY", True)
AUTH_COOKIE_PATH = os.getenv("AUTH_COOKIE_PATH", "/")
AUTH_COOKIE_DOMAIN: Optional[str] = os.getenv("AUTH_COOKIE_DOMAIN")
AUTH_COOKIE_SAMESITE = os.getenv(
    "AUTH_COOKIE_SAMESITE",
    "none" if AUTH_COOKIE_SECURE else "lax",
).strip().lower()
if AUTH_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    AUTH_COOKIE_SAMESITE = "none" if AUTH_COOKIE_SECURE else "lax"

AUTH_EXPOSE_ACCESS_TOKEN = _env_bool("AUTH_EXPOSE_ACCESS_TOKEN", False)


def _cookie_common() -> dict:
    return {
        "path": AUTH_COOKIE_PATH,
        "domain": AUTH_COOKIE_DOMAIN,
        "secure": AUTH_COOKIE_SECURE,
        "samesite": AUTH_COOKIE_SAMESITE,
    }


def set_auth_cookies(response: Response, access_token: str, max_age: int) -> str:
    csrf_token = secrets.token_urlsafe(32)

    auth_cookie = _cookie_common()
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=access_token,
        max_age=max_age,
        httponly=AUTH_COOKIE_HTTPONLY,
        **auth_cookie,
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
    response.delete_cookie(CSRF_COOKIE_NAME, **cookie)
