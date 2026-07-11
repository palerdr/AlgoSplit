import importlib.util
import json
from datetime import datetime

import pytest

import api.analysis_routes as analysis_routes
from api.analysis_routes import _build_workout_analysis, _run_split_analysis
from core.rust_analysis import (
    build_rust_analysis_input,
    compare_analysis_responses,
    run_rust_split_analysis,
)
from schemas.models import ExerciseInput, SplitRequest, SessionInput


def _sample_request(include_breakdowns: bool = False) -> SplitRequest:
    return SplitRequest(
        name="Rust PPL Smoke",
        cycle_length=7,
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        include_breakdowns=include_breakdowns,
        sessions=[
            SessionInput(
                name="Push",
                day=1,
                exercises=[
                    ExerciseInput(name="Bench Press", sets=3),
                    ExerciseInput(name="Lateral Raise", sets=2),
                ],
            ),
            SessionInput(
                name="Pull",
                day=3,
                exercises=[ExerciseInput(name="Barbell Row", sets=3)],
            ),
        ],
    )


def test_build_rust_analysis_input_resolves_known_exercises():
    payload = build_rust_analysis_input(_sample_request())

    assert payload["name"] == "Rust PPL Smoke"
    assert len(payload["regions"]) > 0
    bench = payload["sessions"][0]["exercises"][0]
    assert bench["pattern_name"] == "humeral_adduction_compound"
    assert bench["tiered_targets"]["prime"]
    assert bench["resistance_profile"] == "mid"


def test_build_rust_analysis_input_collapses_duplicate_exercise_names_like_python():
    request = SplitRequest(
        name="Duplicate Exercises",
        cycle_length=7,
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        include_breakdowns=False,
        sessions=[
            SessionInput(
                name="Push",
                day=1,
                exercises=[
                    ExerciseInput(name="Bench Press", sets=3),
                    ExerciseInput(name="Squat", sets=2),
                    ExerciseInput(name="Bench Press", sets=5, unilateral=True),
                ],
            )
        ],
    )

    exercises = build_rust_analysis_input(request)["sessions"][0]["exercises"]

    assert [exercise["name"] for exercise in exercises] == ["Bench Press", "Squat"]
    assert exercises[0]["sets"] == 5
    assert exercises[0]["is_unilateral"] is True


@pytest.mark.skipif(
    importlib.util.find_spec("analysis_engine_rs") is None,
    reason="analysis_engine_rs extension has not been built with maturin",
)
def test_rust_engine_returns_analysis_response():
    response = run_rust_split_analysis(_sample_request(include_breakdowns=True))

    assert response.split_name == "Rust PPL Smoke"
    assert response.summary.total_muscles > 0
    assert response.summary.total_sets > 0
    assert response.session_breakdowns


@pytest.mark.skipif(
    importlib.util.find_spec("analysis_engine_rs") is None,
    reason="analysis_engine_rs extension has not been built with maturin",
)
def test_rust_engine_json_boundary_is_stable():
    payload = build_rust_analysis_input(_sample_request())
    module = importlib.import_module("analysis_engine_rs")

    raw = module.analyze_split_json(json.dumps(payload, separators=(",", ":")))
    data = json.loads(raw)

    assert data["split_name"] == "Rust PPL Smoke"
    assert "muscles" in data
    assert "group_summaries" in data


@pytest.mark.skipif(
    importlib.util.find_spec("analysis_engine_rs") is None,
    reason="analysis_engine_rs extension has not been built with maturin",
)
def test_rust_engine_matches_python_response_for_representative_split(monkeypatch):
    request = _sample_request(include_breakdowns=False)

    monkeypatch.setenv("ANALYSIS_ENGINE", "python")
    python_response = _run_split_analysis(request, user_id=None)
    rust_response = run_rust_split_analysis(request)

    assert rust_response.summary.total_sets == python_response.summary.total_sets
    assert rust_response.summary.muscles_trained == python_response.summary.muscles_trained

    python_muscles = {
        muscle.region_id: (
            round(muscle.stimulus, 8),
            round(muscle.atrophy, 8),
            round(muscle.net_stimulus, 8),
            muscle.primary_sets,
            round(muscle.frequency, 8),
        )
        for muscle in python_response.muscles
    }
    rust_muscles = {
        muscle.region_id: (
            round(muscle.stimulus, 8),
            round(muscle.atrophy, 8),
            round(muscle.net_stimulus, 8),
            muscle.primary_sets,
            round(muscle.frequency, 8),
        )
        for muscle in rust_response.muscles
    }
    assert rust_muscles == python_muscles


@pytest.mark.skipif(
    importlib.util.find_spec("analysis_engine_rs") is None,
    reason="analysis_engine_rs extension has not been built with maturin",
)
@pytest.mark.parametrize(
    "split_request",
    [
        _sample_request(include_breakdowns=True),
        SplitRequest(
            name="Five Day Consecutive Cycle",
            cycle_length=5,
            stimulus_duration=24,
            maintenance_volume=9,
            dataset="pelland",
            include_breakdowns=True,
            sessions=[
                SessionInput(
                    name="Heavy Lower",
                    day=1,
                    exercises=[
                        ExerciseInput(name="Squat", sets=5),
                        ExerciseInput(name="Romanian Deadlift", sets=4),
                    ],
                ),
                SessionInput(
                    name="Unilateral Upper",
                    day=2,
                    exercises=[
                        ExerciseInput(name="Single Arm Cable Row", sets=4),
                        ExerciseInput(name="Lateral Raise", sets=5, unilateral=True),
                    ],
                ),
                SessionInput(
                    name="Press",
                    day=5,
                    exercises=[
                        ExerciseInput(
                            name="Bench Press",
                            sets=9,
                            resistance_profile="ascending",
                        ),
                    ],
                ),
            ],
        ),
        SplitRequest(
            name="Average Dataset Duplicate Days",
            cycle_length=7,
            stimulus_duration=96,
            maintenance_volume=1,
            dataset="average",
            include_breakdowns=False,
            sessions=[
                SessionInput(
                    name="First Same Day",
                    day=1,
                    exercises=[ExerciseInput(name="Bench Press", sets=3)],
                ),
                SessionInput(
                    name="Second Same Day",
                    day=1,
                    exercises=[ExerciseInput(name="Squat", sets=2)],
                ),
                SessionInput(
                    name="Unknown",
                    day=4,
                    exercises=[ExerciseInput(name="Not A Recognized Lift", sets=1)],
                ),
            ],
        ),
    ],
    ids=["breakdowns", "five-day", "duplicate-days"],
)
def test_rust_engine_matches_full_python_response_for_golden_cases(monkeypatch, split_request):
    monkeypatch.setenv("ANALYSIS_ENGINE", "python")
    python_response = _run_split_analysis(split_request, user_id=None)
    rust_response = run_rust_split_analysis(split_request)

    assert compare_analysis_responses(python_response, rust_response) is None


@pytest.mark.skipif(
    importlib.util.find_spec("analysis_engine_rs") is None,
    reason="analysis_engine_rs extension has not been built with maturin",
)
def test_rust_engine_matches_python_duplicate_day_breakdown_name(monkeypatch):
    request = SplitRequest(
        name="Duplicate Days",
        cycle_length=7,
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        include_breakdowns=True,
        sessions=[
            SessionInput(
                name="First Same Day",
                day=1,
                exercises=[ExerciseInput(name="Bench Press", sets=2)],
            ),
            SessionInput(
                name="Second Same Day",
                day=1,
                exercises=[ExerciseInput(name="Squat", sets=2)],
            ),
        ],
    )

    monkeypatch.setenv("ANALYSIS_ENGINE", "python")
    python_response = _run_split_analysis(request, user_id=None)
    rust_response = run_rust_split_analysis(request)

    assert [b.session_name for b in rust_response.session_breakdowns] == [
        b.session_name for b in python_response.session_breakdowns
    ]
    assert rust_response.session_breakdowns[-1].session_name == "Second Same Day"


def test_rust_feature_flag_falls_back_to_python(monkeypatch):
    def fail_rust(*_args, **_kwargs):
        raise RuntimeError("rust unavailable")

    monkeypatch.setenv("ANALYSIS_ENGINE", "rust")
    monkeypatch.setenv("ANALYSIS_ENGINE_FALLBACK", "true")
    monkeypatch.setattr(analysis_routes, "run_rust_split_analysis", fail_rust)

    response = _run_split_analysis(_sample_request(), user_id=None)

    assert response.split_name == "Rust PPL Smoke"
    assert response.summary.total_sets > 0


def test_rust_feature_flag_raises_when_fallback_disabled(monkeypatch):
    def fail_rust(*_args, **_kwargs):
        raise RuntimeError("rust unavailable")

    monkeypatch.setenv("ANALYSIS_ENGINE", "rust")
    monkeypatch.setenv("ANALYSIS_ENGINE_FALLBACK", "false")
    monkeypatch.setattr(analysis_routes, "run_rust_split_analysis", fail_rust)

    with pytest.raises(RuntimeError, match="rust unavailable"):
        _run_split_analysis(_sample_request(), user_id=None)


def test_shadow_mode_returns_python_response_and_records_match(monkeypatch, caplog):
    expected = _run_split_analysis(_sample_request(), user_id=None)

    monkeypatch.setenv("ANALYSIS_ENGINE", "shadow")
    monkeypatch.setenv("ANALYSIS_SHADOW_SAMPLE_RATE", "1")
    monkeypatch.setattr(
        analysis_routes,
        "run_rust_split_analysis",
        lambda *_args, **_kwargs: expected,
    )

    with caplog.at_level("INFO"):
        response = _run_split_analysis(_sample_request(), user_id=None)

    assert response == expected
    assert "analysis_engine_event event=shadow_match" in caplog.text


@pytest.mark.skipif(
    importlib.util.find_spec("analysis_engine_rs") is None,
    reason="analysis_engine_rs extension has not been built with maturin",
)
def test_logged_workouts_use_selected_engine_for_long_windows(monkeypatch):
    workouts = [
        {"id": "a", "completed_at": "2026-01-01T10:00:00+00:00", "session_name": "Start"},
        {"id": "b", "completed_at": "2026-01-15T10:00:00+00:00", "session_name": "Middle"},
        {"id": "c", "completed_at": "2026-01-21T10:00:00+00:00", "session_name": "End"},
    ]
    exercises = [
        {"workout_log_id": "a", "exercise_name": "Bench Press", "sets_completed": 4},
        {"workout_log_id": "b", "exercise_name": "Single Arm Cable Row", "sets_completed": 3},
        {"workout_log_id": "c", "exercise_name": "Squat", "sets_completed": 5},
    ]
    kwargs = {
        "days": 21,
        "stimulus_duration": 48,
        "maintenance_volume": 3,
        "dataset": "average",
        "now": datetime.fromisoformat("2026-01-21T23:59:59+00:00"),
    }

    monkeypatch.setenv("ANALYSIS_ENGINE", "python")
    python_response = _build_workout_analysis(workouts, exercises, **kwargs)

    monkeypatch.setenv("ANALYSIS_ENGINE", "rust")
    monkeypatch.setenv("ANALYSIS_ENGINE_FALLBACK", "false")
    rust_response = _build_workout_analysis(workouts, exercises, **kwargs)

    assert python_response.cycle_length == 21
    assert compare_analysis_responses(python_response, rust_response) is None
