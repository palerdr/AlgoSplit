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

    # Every muscle that received ANY stimulus this session reports a real
    # readiness value — not just prime movers. Readiness is derived from
    # last_stimulus_time, which apply_stimulus sets for every tier (prime,
    # secondary, tertiary), so a muscle worked only as a secondary mover (e.g.
    # triceps on bench press: prime_sets == 0, stimulus > 0) must NOT read None.
    # This is the behavior that distinguishes last_stimulus_time from
    # last_trained_time (which the engine updates for prime movers only).
    for m in trained:
        assert m["recovery_readiness"] is not None, (
            f"trained muscle {m['region_id']} (stimulus={m['stimulus']}, "
            f"prime_sets={m['prime_sets']}) should report readiness"
        )

    # And specifically assert a secondary-only muscle exists and is covered —
    # otherwise the loop above could pass vacuously on a fixture where every
    # trained muscle happens to be a prime mover.
    secondary_only = [m for m in trained if m["prime_sets"] == 0]
    assert secondary_only, "fixture should produce at least one secondary-only muscle"
    for m in secondary_only:
        assert m["recovery_readiness"] is not None
