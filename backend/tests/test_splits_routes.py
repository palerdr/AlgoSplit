from datetime import datetime, timezone

import api.analysis_routes as analysis_routes
import api.routes.splits as splits_routes
import core.MainClasses as main_classes
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


def test_create_split_saves_previously_rejected_catalog_exercises(client, fake_supabase):
    names = [
        "Dumbbell Press",
        "Incline Push Up",
        "Dumbbell Kickback",
        "Stir the Pot",
        "Anti-Rotation Press",
    ]
    payload = _create_payload("Catalog Coverage")
    payload["sessions"] = [
        {
            "name": "Full Body",
            "day_number": 1,
            "exercises": [{"name": name, "sets": 3} for name in names],
        }
    ]

    response = client.post("/api/splits", json=payload)

    assert response.status_code == 201
    assert [exercise["exercise_name"] for exercise in fake_supabase.tables["exercises"]] == names


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


def test_split_cycles_up_to_fourteen_days_are_accepted(client):
    payload = _create_payload("Long Cycle")
    payload["cycle_length"] = 14
    payload["sessions"] = [
        payload["sessions"][0],
        {**payload["sessions"][1], "day_number": 9},
        {
            "name": "Finisher",
            "day_number": 14,
            "exercises": [{"name": "Back Squat", "sets": 3}],
        },
    ]

    create_resp = client.post("/api/splits", json=payload)
    assert create_resp.status_code == 201
    body = create_resp.json()
    assert body["cycle_length"] == 14
    assert [session["day_number"] for session in body["sessions"]] == [1, 9, 14]

    analysis_resp = client.post(f"/api/splits/{body['id']}/analyze")
    assert analysis_resp.status_code == 200


def test_single_session_saves_accept_days_8_through_14(client):
    create_resp = client.post("/api/splits", json=_create_payload("Session Cycle"))
    split_id = create_resp.json()["id"]

    create_session = client.post(
        f"/api/splits/{split_id}/sessions",
        json={
            "name": "Deload",
            "day_number": 12,
            "exercises": [{"name": "Back Squat", "sets": 2}],
        },
    )
    assert create_session.status_code in (200, 201)
    session = create_session.json()
    assert session["day_number"] == 12

    move_resp = client.put(
        f"/api/splits/{split_id}/sessions/{session['id']}",
        json={
            "name": "Deload",
            "day_number": 14,
            "exercises": [{"name": "Back Squat", "sets": 2}],
        },
    )
    assert move_resp.status_code == 200
    assert move_resp.json()["day_number"] == 14


def test_split_days_beyond_fourteen_are_rejected(client):
    payload = _create_payload("Too Long")
    payload["sessions"][1]["day_number"] = 15
    assert client.post("/api/splits", json=payload).status_code == 422

    payload = _create_payload("Cycle Too Long")
    payload["cycle_length"] = 15
    assert client.post("/api/splits", json=payload).status_code == 422


def test_empty_rest_session_persists_and_analyzes_as_non_training_day(client):
    payload = _create_payload("Rest Sentinel")
    payload["cycle_length"] = 3
    payload["sessions"] = [
        payload["sessions"][0],
        {"name": "Rest", "day_number": 2, "exercises": []},
        {**payload["sessions"][1], "day_number": 3},
    ]

    create_resp = client.post("/api/splits", json=payload)
    assert create_resp.status_code == 201
    body = create_resp.json()
    rest = next(session for session in body["sessions"] if session["day_number"] == 2)
    assert rest["name"] == "Rest"
    assert rest["exercises"] == []

    analysis_resp = client.post(
        f"/api/splits/{body['id']}/analyze?include_breakdowns=true"
    )
    assert analysis_resp.status_code == 200
    analysis = analysis_resp.json()
    assert analysis["summary"]["total_sets"] > 0
    assert all(
        breakdown["session_name"] != "Rest"
        for breakdown in analysis["session_breakdowns"]
    )


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

    def fake_get_split(_split_id, _current_user):
        return split

    captured = {"include_breakdowns": None}

    def fake_run_analysis(request, user_id=None, supabase=None):
        captured["include_breakdowns"] = request.include_breakdowns
        return {"ok": True, "include_breakdowns": request.include_breakdowns}

    monkeypatch.setattr(splits_routes, "get_split", fake_get_split)
    monkeypatch.setattr(analysis_routes, "_run_split_analysis", fake_run_analysis)

    response = client.post("/api/splits/split-1/analyze?include_breakdowns=true")
    assert response.status_code == 200
    assert response.json()["include_breakdowns"] is True
    assert captured["include_breakdowns"] is True


def test_batch_update_exercise_accepts_custom_exercise_name(monkeypatch, client):
    create_resp = client.post("/api/splits", json=_create_payload("Custom Exercise Update"))
    assert create_resp.status_code == 201
    created = create_resp.json()
    split_id = created["id"]
    exercise_id = created["sessions"][0]["exercises"][0]["id"]

    def fake_match(name: str, user_id: str | None = None, **_kwargs):
        if name == "My Custom Cable Fly" and user_id == "user-123":
            return type("Movement", (), {"name": "custom:my_custom_cable_fly"})()
        return None

    monkeypatch.setattr(splits_routes, "move_match_with_overrides", fake_match)

    resp = client.put(
        f"/api/splits/{split_id}/exercises/batch",
        json={
            "updates": [
                {
                    "id": exercise_id,
                    "name": "My Custom Cable Fly",
                }
            ]
        },
    )

    assert resp.status_code == 200
    assert resp.json()["updated"] == 1

    split_resp = client.get(f"/api/splits/{split_id}")
    assert split_resp.status_code == 200
    assert split_resp.json()["sessions"][0]["exercises"][0]["exercise_name"] == "My Custom Cable Fly"


def test_analyze_saved_split_uses_custom_exercise_overrides(monkeypatch, client):
    def fake_match(name: str, user_id: str | None = None, **_kwargs):
        if name == "Mobile Custom Fly" and user_id == "user-123":
            return type(
                "Movement",
                (),
                {
                    "name": "custom:mobile_custom_fly",
                    "targets": {"sternocostal": 1.0},
                    "resistance_profile": "mid",
                    "unilateral": False,
                    "tiered_targets": {
                        "prime": {"sternocostal": 1.0},
                        "secondary": {},
                        "tertiary": {},
                        "quaternary": {},
                    },
                    "axial_load": 0.0,
                },
            )()
        return None

    monkeypatch.setattr(splits_routes, "move_match_with_overrides", fake_match)
    monkeypatch.setattr(main_classes, "move_match_with_overrides", fake_match)

    create_resp = client.post(
        "/api/splits",
        json={
            "name": "Custom Analysis",
            "stimulus_duration": 48,
            "maintenance_volume": 4,
            "dataset": "average",
            "sessions": [
                {
                    "name": "Day A",
                    "day_number": 1,
                    "exercises": [{"name": "Mobile Custom Fly", "sets": 3}],
                }
            ],
        },
    )
    split_id = create_resp.json()["id"]

    response = client.post(f"/api/splits/{split_id}/analyze")

    assert response.status_code == 200
    body = response.json()
    assert any(muscle["region_id"] == "sternocostal" for muscle in body["muscles"])


def test_update_split_allows_clearing_cycle_length(client):
    payload = _create_payload("Clear Cycle Length")
    payload["cycle_length"] = 7
    create_resp = client.post("/api/splits", json=payload)
    split_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/splits/{split_id}",
        json={"cycle_length": None},
    )

    assert update_resp.status_code == 200
    assert update_resp.json()["cycle_length"] is None


def test_list_splits_can_skip_nested_exercises(client):
    create_resp = client.post("/api/splits", json=_create_payload("Lite List"))
    assert create_resp.status_code == 201

    response = client.get("/api/splits?include_exercises=false")
    assert response.status_code == 200

    body = response.json()
    assert body["total"] == 1
    assert len(body["splits"]) == 1
    assert len(body["splits"][0]["sessions"]) == 2
    assert body["splits"][0]["sessions"][0]["exercises"] == []


def test_standard_exercise_validation_stays_local(monkeypatch):
    database_calls = 0

    monkeypatch.setattr(splits_routes, "default_move_match", lambda _name: object())

    def fail_preload(*_args, **_kwargs):
        nonlocal database_calls
        database_calls += 1
        raise AssertionError("standard exercises must not preload account maps")

    monkeypatch.setattr(splits_routes, "preload_user_exercise_maps", fail_preload)
    exercises = [{"name": f"Known exercise {index}"} for index in range(29)]

    assert splits_routes.validate_exercises(exercises, "user-123", object()) == []
    assert database_calls == 0


def test_unresolved_duplicate_exercises_use_one_preload_and_one_classification(monkeypatch):
    preload_calls = 0
    classification_calls = 0

    monkeypatch.setattr(splits_routes, "default_move_match", lambda _name: None)

    def preload(*_args, **_kwargs):
        nonlocal preload_calls
        preload_calls += 1
        return ({}, {})

    def classify(*_args, **_kwargs):
        nonlocal classification_calls
        classification_calls += 1
        return object()

    monkeypatch.setattr(splits_routes, "preload_user_exercise_maps", preload)
    monkeypatch.setattr(splits_routes, "move_match_with_overrides", classify)

    assert splits_routes.validate_exercises(
        [{"name": "Custom Fly"}, {"name": "custom fly"}], "user-123", object()
    ) == []
    assert preload_calls == 1
    assert classification_calls == 1


def test_session_routes_preserve_id_order_profiles_and_allow_rest(client):
    split_id = client.post("/api/splits", json=_create_payload("Session RPC")).json()["id"]

    rest = client.post(
        f"/api/splits/{split_id}/sessions",
        json={"name": "Rest", "day_number": 3, "exercises": []},
    )
    assert rest.status_code == 201
    session_id = rest.json()["id"]
    assert rest.json()["exercises"] == []

    updated = client.put(
        f"/api/splits/{split_id}/sessions/{session_id}",
        json={
            "name": "Legs",
            "day_number": 3,
            "exercises": [
                {"name": "Leg Press", "sets": 4, "resistance_profile": "ascending"},
                {"name": "Leg Extension", "sets": 3, "resistance_profile": "descending"},
            ],
        },
    )
    assert updated.status_code == 200
    body = updated.json()
    assert body["id"] == session_id
    assert [exercise["order_index"] for exercise in body["exercises"]] == [0, 1]
    assert [exercise["resistance_profile"] for exercise in body["exercises"]] == [
        "ascending",
        "descending",
    ]


def test_delete_split_session_removes_only_requested_day(client):
    created = client.post("/api/splits", json=_create_payload("Delete one day")).json()
    split_id = created["id"]
    deleted_session_id = created["sessions"][0]["id"]
    kept_session_id = created["sessions"][1]["id"]

    response = client.delete(f"/api/splits/{split_id}/sessions/{deleted_session_id}")

    assert response.status_code == 204
    refreshed = client.get(f"/api/splits/{split_id}").json()
    assert [session["id"] for session in refreshed["sessions"]] == [kept_session_id]


def test_delete_split_session_rejects_session_from_another_split(client):
    first = client.post("/api/splits", json=_create_payload("First")).json()
    second = client.post("/api/splits", json=_create_payload("Second")).json()

    response = client.delete(
        f"/api/splits/{first['id']}/sessions/{second['sessions'][0]['id']}"
    )

    assert response.status_code == 404
    assert len(client.get(f"/api/splits/{second['id']}").json()["sessions"]) == 2


def test_session_route_maps_duplicate_day_to_conflict(client):
    split_id = client.post("/api/splits", json=_create_payload("Duplicate Session")).json()["id"]
    response = client.post(
        f"/api/splits/{split_id}/sessions",
        json={"name": "Another Push", "day_number": 1, "exercises": []},
    )
    assert response.status_code == 409
