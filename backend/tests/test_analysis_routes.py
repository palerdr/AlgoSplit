def test_analyze_split_returns_nonempty_summary(client):
    payload = {
        "name": "Smoke Analysis",
        "sessions": [
            {
                "name": "Push",
                "day": 1,
                "exercises": [
                    {"name": "Bench Press", "sets": 4},
                    {"name": "Overhead Press", "sets": 3},
                ],
            },
            {
                "name": "Pull",
                "day": 2,
                "exercises": [
                    {"name": "Pullup", "sets": 4},
                    {"name": "Barbell Row", "sets": 3},
                ],
            },
        ],
        "stimulus_duration": 48,
        "maintenance_volume": 4,
        "dataset": "average",
        "include_breakdowns": False,
    }

    response = client.post("/api/analyze-split", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["split_name"] == "Smoke Analysis"
    assert body["summary"]["total_sets"] > 0
    assert body["summary"]["muscles_trained"] > 0
    assert len(body["muscles"]) > 0
    assert len(body["group_summaries"]) > 0


def test_parse_exercise_supports_recognized_and_unrecognized(client):
    recognized = client.post("/api/parse-exercise", json={"text": "Bench Press"})
    assert recognized.status_code == 200
    assert recognized.json()["recognized"] is True

    unknown = client.post("/api/parse-exercise", json={"text": "qwerty-not-an-exercise-xyz"})
    assert unknown.status_code == 200
    assert unknown.json()["recognized"] is False


def test_patterns_endpoint_returns_catalog(client):
    response = client.get("/api/patterns")
    assert response.status_code == 200
    body = response.json()
    assert body["total_count"] > 0
    assert len(body["patterns"]) == body["total_count"]
