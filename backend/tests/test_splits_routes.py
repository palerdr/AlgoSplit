from datetime import datetime, timezone

import api.analysis_routes as analysis_routes
import api.routes.splits as splits_routes
from schemas.splits import ExerciseResponse, SessionResponse, SplitResponse


def _create_payload(name: str = "PPL Basic"):
    return {
        "name": name,
        "stimulus_duration": 48,
        "maintenance_volume": 4,
        "dataset": "average",
        "sessions": [
            {
                "name": "Push",
                "day_number": 1,
                "exercises": [
                    {"name": "Bench Press", "sets": 4},
                    {"name": "Overhead Press", "sets": 3},
                ],
            },
            {
                "name": "Pull",
                "day_number": 2,
                "exercises": [
                    {"name": "Barbell Row", "sets": 4},
                ],
            },
        ],
    }


def test_create_list_get_update_and_delete_split(client):
    create_resp = client.post("/api/splits", json=_create_payload())
    assert create_resp.status_code == 201
    created = create_resp.json()
    split_id = created["id"]

    assert created["name"] == "PPL Basic"
    assert len(created["sessions"]) == 2
    assert created["sessions"][0]["name"] == "Push"
    assert created["sessions"][0]["exercises"][0]["exercise_name"] == "Bench Press"

    list_resp = client.get("/api/splits")
    assert list_resp.status_code == 200
    listed = list_resp.json()
    assert listed["total"] == 1
    assert listed["splits"][0]["id"] == split_id

    get_resp = client.get(f"/api/splits/{split_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == split_id

    update_resp = client.put(
        f"/api/splits/{split_id}",
        json={"name": "Updated Name", "dataset": "pelland"},
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["name"] == "Updated Name"
    assert update_resp.json()["dataset"] == "pelland"

    delete_resp = client.delete(f"/api/splits/{split_id}")
    assert delete_resp.status_code == 204

    missing_resp = client.get(f"/api/splits/{split_id}")
    assert missing_resp.status_code == 404


def test_replace_split_rewrites_sessions_and_exercises(client):
    create_resp = client.post("/api/splits", json=_create_payload("Replace Target"))
    split_id = create_resp.json()["id"]

    replacement = {
        "name": "Replaced Plan",
        "cycle_length": 4,
        "stimulus_duration": 36,
        "maintenance_volume": 3,
        "dataset": "schoenfeld",
        "sessions": [
            {
                "name": "Full Body",
                "day_number": 1,
                "exercises": [
                    {"name": "Romanian Deadlift", "sets": 3, "unilateral": False, "resistance_profile": "mid"},
                ],
            }
        ],
    }
    replace_resp = client.put(f"/api/splits/{split_id}/full", json=replacement)
    assert replace_resp.status_code == 200

    body = replace_resp.json()
    assert body["name"] == "Replaced Plan"
    assert body["cycle_length"] == 4
    assert body["stimulus_duration"] == 36
    assert len(body["sessions"]) == 1
    assert body["sessions"][0]["name"] == "Full Body"
    assert body["sessions"][0]["exercises"][0]["exercise_name"] == "Romanian Deadlift"


def test_analyze_saved_split_passes_include_breakdowns_query(monkeypatch, client):
    now = datetime.now(timezone.utc)
    split = SplitResponse(
        id="split-1",
        user_id="user-123",
        name="Analysis Split",
        cycle_length=2,
        stimulus_duration=48,
        maintenance_volume=4,
        dataset="average",
        created_at=now,
        updated_at=now,
        sessions=[
            SessionResponse(
                id="session-1",
                split_id="split-1",
                name="Push",
                day_number=1,
                created_at=now,
                updated_at=now,
                exercises=[
                    ExerciseResponse(
                        id="exercise-1",
                        session_id="session-1",
                        exercise_name="Bench Press",
                        sets=4,
                        order_index=0,
                        unilateral=False,
                        resistance_profile=None,
                        created_at=now,
                    )
                ],
            )
        ],
    )

    async def fake_get_split(_split_id, _current_user):
        return split

    captured = {"include_breakdowns": None}

    async def fake_run_analysis(request):
        captured["include_breakdowns"] = request.include_breakdowns
        return {"ok": True, "include_breakdowns": request.include_breakdowns}

    monkeypatch.setattr(splits_routes, "get_split", fake_get_split)
    monkeypatch.setattr(analysis_routes, "analyze_split", fake_run_analysis)

    response = client.post("/api/splits/split-1/analyze?include_breakdowns=true")
    assert response.status_code == 200
    assert response.json()["include_breakdowns"] is True
    assert captured["include_breakdowns"] is True
