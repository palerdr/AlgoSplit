from main import app


def test_openapi_contains_core_paths():
    schema = app.openapi()
    paths = schema["paths"]

    for required in [
        "/auth/signup",
        "/auth/login",
        "/auth/user",
        "/api/splits",
        "/api/splits/{split_id}",
        "/api/splits/{split_id}/analyze",
        "/api/analyze-split",
    ]:
        assert required in paths


def test_saved_split_analysis_query_param_is_exposed():
    schema = app.openapi()
    params = schema["paths"]["/api/splits/{split_id}/analyze"]["post"]["parameters"]
    names = {param["name"] for param in params}
    assert "include_breakdowns" in names
