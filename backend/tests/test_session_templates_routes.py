def _template_payload(name: str = "Push Day"):
    return {
        "name": name,
        "exercises": [
            {"exercise_name": "Bench Press", "sets": 4},
            {"exercise_name": "Overhead Press", "sets": 3, "order_index": 1},
        ],
    }


def test_create_list_get_and_delete_template(client):
    create_resp = client.post("/api/session-templates", json=_template_payload())
    assert create_resp.status_code == 201
    created = create_resp.json()
    template_id = created["id"]

    assert created["name"] == "Push Day"
    assert [ex["exercise_name"] for ex in created["exercises"]] == [
        "Bench Press",
        "Overhead Press",
    ]

    list_resp = client.get("/api/session-templates")
    assert list_resp.status_code == 200
    listed = list_resp.json()
    assert listed["total"] == 1
    assert listed["templates"][0]["id"] == template_id
    assert len(listed["templates"][0]["exercises"]) == 2

    get_resp = client.get(f"/api/session-templates/{template_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == template_id

    delete_resp = client.delete(f"/api/session-templates/{template_id}")
    assert delete_resp.status_code == 204

    missing_resp = client.get(f"/api/session-templates/{template_id}")
    assert missing_resp.status_code == 404


def test_update_template_replaces_name_and_exercises(client, fake_supabase):
    create_resp = client.post("/api/session-templates", json=_template_payload())
    template_id = create_resp.json()["id"]

    update_resp = client.put(
        f"/api/session-templates/{template_id}",
        json={
            "name": "Push Day Revised",
            "exercises": [
                {"exercise_name": "Incline Bench Press", "sets": 5},
            ],
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()
    assert updated["id"] == template_id
    assert updated["name"] == "Push Day Revised"
    assert [ex["exercise_name"] for ex in updated["exercises"]] == ["Incline Bench Press"]

    # Old exercise rows are fully replaced, not accumulated.
    remaining = [
        ex
        for ex in fake_supabase.tables["session_template_exercises"]
        if ex["template_id"] == template_id
    ]
    assert len(remaining) == 1

    get_resp = client.get(f"/api/session-templates/{template_id}")
    assert get_resp.json()["name"] == "Push Day Revised"


def test_update_missing_template_returns_404(client):
    resp = client.put(
        "/api/session-templates/does-not-exist",
        json=_template_payload("Ghost"),
    )
    assert resp.status_code == 404


def test_template_requires_at_least_one_exercise(client):
    resp = client.post(
        "/api/session-templates",
        json={"name": "Empty", "exercises": []},
    )
    assert resp.status_code == 422

    create_resp = client.post("/api/session-templates", json=_template_payload())
    template_id = create_resp.json()["id"]
    update_resp = client.put(
        f"/api/session-templates/{template_id}",
        json={"name": "Empty", "exercises": []},
    )
    assert update_resp.status_code == 422
