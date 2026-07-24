from main import app


def test_openapi_contains_core_paths():
    schema = app.openapi()
    paths = schema["paths"]

    for required in [
        "/auth/signup",
        "/auth/login",
        "/auth/user",
        "/auth/csrf",
        "/auth/logout-all",
        "/api/splits",
        "/api/splits/{split_id}",
        "/api/splits/{split_id}/shares",
        "/api/splits/{split_id}/shares/status",
        "/api/split-shares/{token}",
        "/api/split-shares/{token}/copy",
        "/api/splits/{split_id}/analyze",
        "/api/analyze-split",
        "/api/profile",
        "/api/friends",
        "/api/friends/requests",
        "/api/friends/requests/{request_id}/accept",
        "/api/friends/{friend_id}/snapshot",
        "/api/friends/{friend_id}/compare",
        "/api/splits/{split_id}/share",
        "/api/friends/{friend_id}/shared-splits",
        "/api/shared-splits/{share_id}/copy",
    ]:
        assert required in paths


def test_saved_split_analysis_query_param_is_exposed():
    schema = app.openapi()
    params = schema["paths"]["/api/splits/{split_id}/analyze"]["post"]["parameters"]
    names = {param["name"] for param in params}
    assert "include_breakdowns" in names
