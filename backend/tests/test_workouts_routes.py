import api.routes.workouts as workouts_routes


def test_get_workout_history_summaries_returns_compact_rows(client, fake_supabase, auth_user, monkeypatch):
    monkeypatch.setattr(
        workouts_routes,
        "get_supabase_client_with_token",
        lambda _token: fake_supabase,
    )

    log_one = fake_supabase.table("workout_logs").insert({
        "user_id": auth_user.id,
        "session_name": "Push Day",
        "completed_at": "2026-03-08T10:00:00Z",
        "duration_minutes": 62,
    }).execute().data[0]
    log_two = fake_supabase.table("workout_logs").insert({
        "user_id": auth_user.id,
        "session_name": "Pull Day",
        "completed_at": "2026-03-09T10:00:00Z",
        "duration_minutes": 58,
    }).execute().data[0]

    fake_supabase.table("workout_exercises").insert([
        {
            "workout_log_id": log_one["id"],
            "exercise_name": "Bench Press",
            "sets_completed": 3,
            "order_index": 0,
        },
        {
            "workout_log_id": log_one["id"],
            "exercise_name": "Incline Press",
            "sets_completed": 2,
            "order_index": 1,
        },
        {
            "workout_log_id": log_two["id"],
            "exercise_name": "Barbell Row",
            "sets_completed": 4,
            "order_index": 0,
        },
    ]).execute()

    response = client.get("/api/workouts/summaries?limit=10")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert len(body["workouts"]) == 2

    latest = body["workouts"][0]
    assert latest["session_name"] == "Pull Day"
    assert latest["exercise_count"] == 1
    assert latest["total_sets"] == 4
    assert latest["exercise_names"] == ["Barbell Row"]

    earlier = body["workouts"][1]
    assert earlier["session_name"] == "Push Day"
    assert earlier["exercise_count"] == 2
    assert earlier["total_sets"] == 5
    assert earlier["exercise_names"] == ["Bench Press", "Incline Press"]


def test_log_workout_rejects_out_of_range_rir(client, fake_supabase, monkeypatch):
    monkeypatch.setattr(
        workouts_routes,
        "get_supabase_client_with_token",
        lambda _token: fake_supabase,
    )

    response = client.post(
        "/api/workouts",
        json={
            "session_name": "Push Day",
            "exercises": [
                {
                    "exercise_name": "Bench Press",
                    "sets_completed": 1,
                    "reps": [8],
                    "weight": [185],
                    "rir": [99],
                }
            ],
        },
    )

    assert response.status_code == 422
    assert "rir" in response.text


def test_log_workout_rejects_all_zero_reps(client, fake_supabase, monkeypatch):
    monkeypatch.setattr(
        workouts_routes,
        "get_supabase_client_with_token",
        lambda _token: fake_supabase,
    )

    response = client.post(
        "/api/workouts",
        json={
            "session_name": "Push Day",
            "exercises": [
                {
                    "exercise_name": "Bench Press",
                    "sets_completed": 3,
                    "reps": [0, 0, 0],
                    "weight": [185, 185, 185],
                }
            ],
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Workout must include at least one set with reps greater than 0"


def test_log_workout_marks_dropped_session_id_in_response(client, fake_supabase, monkeypatch, caplog):
    monkeypatch.setattr(
        workouts_routes,
        "get_supabase_client_with_token",
        lambda _token: fake_supabase,
    )

    with caplog.at_level("WARNING"):
        response = client.post(
            "/api/workouts",
            json={
                "session_id": "missing-session",
                "session_name": "Push Day",
                "exercises": [
                    {
                        "exercise_name": "Bench Press",
                        "sets_completed": 1,
                        "reps": [8],
                        "weight": [185],
                    }
                ],
            },
        )

    assert response.status_code == 201
    body = response.json()
    assert body["session_id"] is None
    assert body["session_id_dropped"] is True
    assert "Dropping stale workout session_id" in caplog.text


def test_log_workout_retry_is_idempotent(client, fake_supabase, monkeypatch):
    monkeypatch.setattr(
        workouts_routes,
        "get_supabase_client_with_token",
        lambda _token: fake_supabase,
    )
    payload = {
        "client_request_id": "workout-123",
        "session_name": "Push Day",
        "completed_at": "2026-07-15T12:00:00Z",
        "exercises": [
            {
                "exercise_name": "Bench Press",
                "sets_completed": 1,
                "reps": [8],
                "weight": [185],
                "rir": [2],
            }
        ],
    }

    first = client.post("/api/workouts", json=payload)
    retried = client.post("/api/workouts", json=payload)

    assert first.status_code == 201
    assert retried.status_code == 201
    assert retried.json()["id"] == first.json()["id"]
    assert len(fake_supabase.tables["workout_logs"]) == 1
    assert len(fake_supabase.tables["workout_exercises"]) == 1


def test_log_workout_retry_repairs_interrupted_exercise_insert(client, fake_supabase, auth_user, monkeypatch):
    monkeypatch.setattr(
        workouts_routes,
        "get_supabase_client_with_token",
        lambda _token: fake_supabase,
    )
    existing = fake_supabase.table("workout_logs").insert(
        {
            "user_id": auth_user.id,
            "client_request_id": "interrupted-123",
            "session_name": "Pull Day",
            "completed_at": "2026-07-15T13:00:00Z",
        }
    ).execute().data[0]

    response = client.post(
        "/api/workouts",
        json={
            "client_request_id": "interrupted-123",
            "session_name": "Pull Day",
            "completed_at": "2026-07-15T13:00:00Z",
            "exercises": [
                {
                    "exercise_name": "Barbell Row",
                    "sets_completed": 1,
                    "reps": [10],
                    "weight": [135],
                }
            ],
        },
    )

    assert response.status_code == 201
    assert response.json()["id"] == existing["id"]
    assert response.json()["exercises"][0]["exercise_name"] == "Barbell Row"
    assert len(fake_supabase.tables["workout_logs"]) == 1
    assert len(fake_supabase.tables["workout_exercises"]) == 1


def test_workout_history_strips_legacy_unilateral_note_prefixes(client, fake_supabase, auth_user, monkeypatch):
    monkeypatch.setattr(
        workouts_routes,
        "get_supabase_client_with_token",
        lambda _token: fake_supabase,
    )

    workout = fake_supabase.table("workout_logs").insert({
        "user_id": auth_user.id,
        "session_name": "Leg Day",
        "completed_at": "2026-03-10T10:00:00Z",
    }).execute().data[0]
    fake_supabase.table("workout_exercises").insert([
        {
            "workout_log_id": workout["id"],
            "exercise_name": "Single-leg Curl",
            "sets_completed": 1,
            "reps": [10],
            "weight": [45],
            "order_index": 0,
            "notes": "L | keep hips square",
        },
        {
            "workout_log_id": workout["id"],
            "exercise_name": "Single-leg Curl",
            "sets_completed": 1,
            "reps": [9],
            "weight": [45],
            "order_index": 1,
            "notes": "R | keep hips square",
        },
    ]).execute()

    response = client.get("/api/workouts")

    assert response.status_code == 200
    assert [exercise["notes"] for exercise in response.json()["workouts"][0]["exercises"]] == [
        "keep hips square",
        "keep hips square",
    ]


def test_compact_overview_is_gzipped_and_no_store(client, fake_supabase, monkeypatch):
    monkeypatch.setattr(workouts_routes, "get_supabase_client_with_token", lambda _token: fake_supabase)

    def execute_rpc(name, params):
        assert name == "get_workout_overview"
        assert params == {"p_days": 180}
        return [
            {
                "id": f"00000000-0000-0000-0000-{index:012d}",
                "completed_at": f"2026-01-{(index % 28) + 1:02d}T10:00:00Z",
                "total_sets": 3,
                "total_volume": 2400,
            }
            for index in range(80)
        ]

    monkeypatch.setattr(fake_supabase, "execute_rpc", execute_rpc)
    response = client.get("/api/workouts/overview?days=180", headers={"Accept-Encoding": "gzip"})

    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["content-encoding"] == "gzip"
    assert len(response.json()["workouts"]) == 80


def test_progress_groups_duplicate_rows_and_preserves_rir(client, fake_supabase, monkeypatch):
    monkeypatch.setattr(workouts_routes, "get_supabase_client_with_token", lambda _token: fake_supabase)

    def execute_rpc(name, params):
        assert name == "get_workout_progress"
        assert params["p_exercise_name"] == "Bench Press"
        return [
            {
                "workout_id": "00000000-0000-0000-0000-000000000001",
                "completed_at": "2026-01-01T10:00:00Z",
                "session_name": "Push",
                "exercise_name": "Bench Press",
                "reps": [8, 7],
                "weight": [185, 185],
                "rir": [2, 1],
                "order_index": 0,
                "total_count": 1,
            },
            {
                "workout_id": "00000000-0000-0000-0000-000000000001",
                "completed_at": "2026-01-01T10:00:00Z",
                "session_name": "Push",
                "exercise_name": "Bench Press",
                "reps": [10],
                "weight": [135],
                "rir": None,
                "order_index": 2,
                "total_count": 1,
            },
        ]

    monkeypatch.setattr(fake_supabase, "execute_rpc", execute_rpc)
    response = client.get("/api/workouts/progress?exercise_name=Bench%20Press&days=30")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["workouts"]) == 1
    assert body["workouts"][0]["exercises"][0]["rir"] == [2, 1]
    assert len(body["workouts"][0]["exercises"]) == 2


def test_missing_performance_rpc_returns_actionable_service_error(client, fake_supabase, monkeypatch):
    monkeypatch.setattr(workouts_routes, "get_supabase_client_with_token", lambda _token: fake_supabase)
    response = client.get("/api/workouts/overview")
    assert response.status_code == 503
    assert "migration 012" in response.json()["detail"]
