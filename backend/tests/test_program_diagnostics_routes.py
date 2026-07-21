import api.routes.program_diagnostics as diagnostics_routes


def test_session_diagnostics_calls_internal_authenticated_service(
    client, fake_supabase, auth_user, monkeypatch
):
    fake_supabase.tables.setdefault("programs", []).append({
        "id": "program-1", "user_id": auth_user.id,
        "stimulus_duration": 48, "maintenance_volume": 4, "dataset": "average",
    })
    fake_supabase.tables["program_sessions"].append({
        "id": "program-session-1", "program_id": "program-1",
        "custom_name": "Push", "program_session_exercises": [{
            "exercise_name": "Bench Press", "sets": 3, "order_index": 0,
            "unilateral": False, "resistance_profile": None,
        }],
    })
    monkeypatch.setattr(
        diagnostics_routes, "get_supabase_client_with_token", lambda _token: fake_supabase
    )
    captured = {}

    def run_analysis(request, user_id, supabase):
        captured.update(request=request, user_id=user_id, supabase=supabase)
        return {"ok": True}

    monkeypatch.setattr(diagnostics_routes, "_run_split_analysis", run_analysis)

    response = client.post(
        "/api/programs/program-1/diagnostics",
        json={"level": "session", "target_id": "program-session-1"},
    )

    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert captured["user_id"] == auth_user.id
    assert captured["supabase"] is fake_supabase
    assert captured["request"].sessions[0].exercises[0].name == "Bench Press"
