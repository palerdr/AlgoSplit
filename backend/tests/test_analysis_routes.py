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


def test_analyze_workouts_exposes_recovery_readiness(client, fake_supabase, auth_user, monkeypatch):
    """Every muscle in the response carries a `recovery_readiness` field. Trained
    muscles get a 0..1 fraction (the same time-since/recovery-window ratio the
    engine uses internally); untrained muscles get None so the dashboard treats
    them as fully ready."""
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
    muscles = response.json()["muscles"]
    assert muscles, "expected at least one muscle in response"

    # The field is present on every entry.
    assert all("recovery_readiness" in m for m in muscles)

    trained = [m for m in muscles if m["stimulus"] > 0]
    untrained = [m for m in muscles if m["stimulus"] == 0]

    # Untrained muscles read None (frontend treats as fully ready).
    for m in untrained:
        assert m["recovery_readiness"] is None

    # Every non-None readiness is a finite 0..1 fraction.
    for m in muscles:
        r = m["recovery_readiness"]
        assert r is None or 0.0 <= r <= 1.0

    # At least one prime-mover muscle from this session has a real readiness
    # value (the engine only updates last_trained_time for prime movers, so
    # secondary-only muscles legitimately keep None and are treated as ready).
    prime_movers_with_readiness = [
        m for m in trained if m["prime_sets"] > 0 and m["recovery_readiness"] is not None
    ]
    assert prime_movers_with_readiness, (
        "expected at least one prime-mover muscle to report a recovery_readiness"
    )
