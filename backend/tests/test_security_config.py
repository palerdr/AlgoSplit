import os
import subprocess
import sys
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _security_import(
    extra_env: dict[str, str],
    script: str = "import api.security",
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(
        {
            "APP_ENV": "production",
            "AUTH_COOKIE_PATH": "/",
            "AUTH_COOKIE_SAMESITE": "lax",
        }
    )
    env.update(extra_env)
    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def test_production_rejects_cross_subdomain_auth_cookies():
    result = _security_import({"AUTH_COOKIE_DOMAIN": ".example.com"})

    assert result.returncode != 0
    assert "must be host-only" in result.stderr


def test_production_accepts_host_only_secure_lax_cookies():
    result = _security_import(
        {"AUTH_COOKIE_DOMAIN": ""},
        "from fastapi import Response; "
        "from api.security import set_auth_cookies; "
        "response = Response(); "
        "set_auth_cookies(response, 'access', 'refresh', 3600); "
        "print('\\n'.join(value.decode() for name, value in response.raw_headers if name == b'set-cookie'))",
    )

    assert result.returncode == 0, result.stderr
    cookie_headers = result.stdout.splitlines()
    assert len(cookie_headers) == 3
    assert all("Secure" in value for value in cookie_headers)
    assert all("SameSite=lax" in value for value in cookie_headers)
    assert all("Domain=" not in value for value in cookie_headers)
    assert "HttpOnly" in cookie_headers[0]
    assert "HttpOnly" in cookie_headers[1]
    assert "HttpOnly" not in cookie_headers[2]
