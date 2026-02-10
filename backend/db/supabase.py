"""
Supabase client configuration and singleton
Provides authenticated and admin Supabase clients
"""

import os
from typing import Optional
from supabase import create_client, Client
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
    global _supabase_client, _supabase_admin
    _supabase_client = None
    _supabase_admin = None


def get_supabase_client_with_token(access_token: str) -> Client:
    """
    Get a Supabase client authenticated with the user's JWT token.

    Creates a fresh client per request to avoid race conditions where
    concurrent requests overwrite each other's auth headers on a shared
    singleton. This ensures RLS policies using auth.uid() always resolve
    to the correct user.

    Args:
        access_token: The user's JWT access token from authentication

    Returns:
        Client: Supabase client with the user's auth context
    """
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.headers["authorization"] = f"Bearer {access_token}"
    return client
