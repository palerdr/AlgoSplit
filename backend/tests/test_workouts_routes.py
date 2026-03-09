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
