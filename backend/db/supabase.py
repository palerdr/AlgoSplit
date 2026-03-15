"""
Supabase client configuration and singleton
Provides authenticated and admin Supabase clients.

Per-request authenticated access uses a shared httpx connection pool
with lightweight per-request PostgREST wrappers so each request gets
its own auth headers without paying the cost of a full create_client().
"""

import os
from typing import Optional, Union
import httpx
from supabase import create_client, Client
from postgrest import SyncPostgrestClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Validate required environment variables
if not SUPABASE_URL:
    raise ValueError(
        "SUPABASE_URL environment variable is not set. "
        "Please copy .env.example to .env and configure your Supabase credentials."
    )

if not SUPABASE_ANON_KEY:
    raise ValueError(
        "SUPABASE_ANON_KEY environment variable is not set. "
        "Please copy .env.example to .env and configure your Supabase credentials."
    )

# Singleton instances
_supabase_client: Optional[Client] = None
_supabase_admin: Optional[Client] = None

# ── Shared connection pool for per-request PostgREST clients ──────────
_postgrest_http: Optional[httpx.Client] = None
_postgrest_rest_url: Optional[str] = None


def _get_postgrest_pool() -> tuple[httpx.Client, str]:
    """Return the shared httpx connection pool and REST URL, creating on first use."""
    global _postgrest_http, _postgrest_rest_url
    if _postgrest_http is None:
        _postgrest_rest_url = f"{SUPABASE_URL}/rest/v1"
        _postgrest_http = httpx.Client(
            base_url=_postgrest_rest_url,
            http2=True,
            follow_redirects=True,
            timeout=httpx.Timeout(15.0),
        )
    return _postgrest_http, _postgrest_rest_url


def get_supabase_client() -> Client:
    """
    Get the Supabase client instance (uses anon key)
    This client respects Row Level Security (RLS) policies

    Returns:
        Client: Supabase client instance
    """
    global _supabase_client

    if _supabase_client is None:
        _supabase_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    return _supabase_client


def get_supabase_admin() -> Client:
    """
    Get the Supabase admin client instance (uses service role key)
    This client bypasses Row Level Security (RLS) policies
    USE WITH CAUTION - only for server-side operations that need elevated privileges

    Returns:
        Client: Supabase admin client instance

    Raises:
        ValueError: If SUPABASE_SERVICE_ROLE_KEY is not set
    """
    global _supabase_admin

    if not SUPABASE_SERVICE_ROLE_KEY:
        raise ValueError(
            "SUPABASE_SERVICE_ROLE_KEY environment variable is not set. "
            "This is required for admin operations."
        )

    if _supabase_admin is None:
        _supabase_admin = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    return _supabase_admin


def reset_clients():
    """
    Reset client instances (useful for testing)
    """
    global _supabase_client, _supabase_admin, _postgrest_http, _postgrest_rest_url
    _supabase_client = None
    _supabase_admin = None
    if _postgrest_http is not None:
        _postgrest_http.close()
    _postgrest_http = None
    _postgrest_rest_url = None


def get_supabase_client_with_token(access_token: str) -> SyncPostgrestClient:
    """
    Get a PostgREST client authenticated with the user's JWT token.

    Reuses a shared httpx connection pool (HTTP/2, keep-alive) but
    creates a lightweight SyncPostgrestClient wrapper per request so
    each request gets its own auth headers — no race conditions, no
    expensive full-client construction.

    The old implementation created a full supabase.Client per request,
    which allocated two httpx.Client instances (auth + postgrest) even
    though only postgrest was ever used.  This version skips the unused
    auth/storage/realtime initialization entirely.

    Args:
        access_token: The user's JWT access token from authentication

    Returns:
        SyncPostgrestClient: PostgREST client with the user's auth context.
            Supports .table(), .from_(), .rpc() — the same API surface
            used by all 74 route call-sites.
    """
    http_client, rest_url = _get_postgrest_pool()
    return SyncPostgrestClient(
        rest_url,
        schema="public",
        headers={
            "apiKey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {access_token}",
        },
        http_client=http_client,
    )
