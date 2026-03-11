import api.analysis_routes as analysis_routes


def test_analyze_workouts_honors_client_timezone_offset(client, fake_supabase, auth_user, monkeypatch):
    monkeypatch.setattr(
        analysis_routes,
        "get_supabase_client_with_token",
        lambda _token: fake_supabase,
    )

    workout = fake_supabase.table("workout_logs").insert({
        "user_id": auth_user.id,
        "session_name": "Push Day",
        "completed_at": "2026-03-11T00:30:00Z",
    }).execute().data[0]

    fake_supabase.table("workout_exercises").insert({
        "workout_log_id": workout["id"],
        "exercise_name": "Bench Press",
        "sets_completed": 4,
        "order_index": 0,
    }).execute()

    response = client.post(
        "/api/analyze-workouts?days=7&end_date=2026-03-10&timezone_offset_minutes=300"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["total_sets"] == 4
    assert body["summary"]["muscles_trained"] > 0
    assert len(body["muscles"]) > 0
