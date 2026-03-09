"""
Database layer for AlgoSplit
Handles Supabase connection and database operations
"""

from .supabase import get_supabase_client, get_supabase_admin

__all__ = ["get_supabase_client", "get_supabase_admin"]
