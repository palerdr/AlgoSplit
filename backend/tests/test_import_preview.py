"""
Route tests for POST /api/splits/import/preview.
"""

import pytest

import api.routes.imports as imports_routes


@pytest.fixture
def import_client(client, monkeypatch: pytest.MonkeyPatch):
    # The preview endpoint preloads user custom exercises/overrides; route
    # tests run against the default matcher only.
    monkeypatch.setattr(
        imports_routes,
        "preload_user_exercise_maps",
        lambda _user_id: {"custom": {}, "overrides": {}},
    )
    return client


LONG_SHEET = {
    "name": "My Program",
    "grid": [
        ["Session", "Day", "Exercise", "Sets"],
        ["Push", "1", "Bench Press", "4"],
        ["Push", "1", "Overhead Press", "3"],
        ["Pull", "2", "Barbell Rows", "4"],
        ["Pull", "2", "Flux Capacitor Press", "3"],
    ],
}


def test_preview_long_format(import_client):
    resp = import_client.post("/api/splits/import/preview", json={"sheets": [LONG_SHEET]})
    assert resp.status_code == 200
    body = resp.json()

    assert body["layout"] == "long"
    assert body["sheet_name"] == "My Program"
    split = body["split"]
    assert split["name"] == "My Program"
    assert [s["day_number"] for s in split["sessions"]] == [1, 2]
    assert split["sessions"][0]["exercises"][0] == {
        "name": "Bench Press", "sets": 4, "unilateral": False,
        "resistance_profile": None,
    }

    statuses = {e["raw_name"]: e["status"] for e in body["exercises"]}
    assert statuses["Bench Press"] == "matched"
    assert statuses["Flux Capacitor Press"] == "unrecognized"


def test_preview_uses_name_hint(import_client):
    resp = import_client.post(
        "/api/splits/import/preview",
        json={"sheets": [LONG_SHEET], "split_name_hint": "Summer Block"},
    )
    assert resp.status_code == 200
    assert resp.json()["split"]["name"] == "Summer Block"


def test_preview_non_split_content_returns_warnings_not_error(import_client):
    resp = import_client.post(
        "/api/splits/import/preview",
        json={"sheets": [{"name": "Budget", "grid": [["Item", "Cost"], ["Rent", "1200"]]}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["split"] is None
    assert body["layout"] == "unknown"
    assert body["warnings"]


def test_preview_oversized_grid_rejected(import_client):
    huge = {"name": "big", "grid": [["x"] * 50] * 500}  # 25k cells > 20k cap
    resp = import_client.post("/api/splits/import/preview", json={"sheets": [huge]})
    assert resp.status_code == 422


def test_preview_requires_auth():
    # A bare TestClient without the auth override must be rejected.
    from fastapi.testclient import TestClient
    from main import app, rate_limiter

    rate_limiter.enabled = False
    with TestClient(app) as anon:
        resp = anon.post("/api/splits/import/preview", json={"sheets": [LONG_SHEET]})
    assert resp.status_code in (401, 403)
