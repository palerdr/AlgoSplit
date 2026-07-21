import time
import asyncio

import pytest
from fastapi import HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

import api.dependencies as dependencies


def _request() -> Request:
    return Request({
        "type": "http", "method": "GET", "path": "/api/splits",
        "headers": [], "query_string": b"", "scheme": "http",
        "server": ("test", 80), "client": ("test", 1),
    })


def _token(**overrides) -> str:
    claims = {
        "sub": "user-123", "email": "test@example.com",
        "role": "authenticated", "aud": "authenticated",
        "iss": "http://localhost:54321/auth/v1",
        "exp": int(time.time()) + 600,
    }
    claims.update(overrides)
    return jwt.encode(claims, "test-jwt-secret", algorithm="HS256")


@pytest.mark.parametrize("overrides", [
    {"role": "anon"},
    {"type": "recovery"},
    {"amr": [{"method": "recovery", "timestamp": 1}]},
])
def test_protected_routes_reject_nonstandard_or_recovery_tokens(overrides):
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=_token(**overrides))
    with pytest.raises(HTTPException) as error:
        asyncio.run(dependencies.get_current_user(_request(), credentials))
    assert error.value.status_code == 401


def test_unknown_jwks_kid_forces_one_refresh(monkeypatch):
    calls = []

    async def fake_jwks(*, force_refresh=False):
        calls.append(force_refresh)
        return {"keys": [{"kid": "new", "kty": "EC"}]} if force_refresh else {"keys": [{"kid": "old", "kty": "EC"}]}

    monkeypatch.setattr(dependencies, "get_jwks", fake_jwks)
    monkeypatch.setattr(dependencies.jwt, "get_unverified_header", lambda _token: {"alg": "ES256", "kid": "new"})
    monkeypatch.setattr(dependencies.jwt, "decode", lambda _token, key, **_kwargs: {"sub": "user-123", "key": key["kid"]})

    payload = asyncio.run(dependencies._decode_token("token"))

    assert payload["key"] == "new"
    assert calls == [False, True]
