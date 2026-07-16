from db.supabase import get_supabase_auth_client, reset_clients


def test_auth_requests_use_isolated_state_with_a_shared_http_pool():
    reset_clients()
    try:
        first = get_supabase_auth_client()
        second = get_supabase_auth_client()

        assert first is not second
        assert first._storage is not second._storage
        assert first._http_client is second._http_client
        assert first._persist_session is False
        assert first._auto_refresh_token is False
    finally:
        reset_clients()
