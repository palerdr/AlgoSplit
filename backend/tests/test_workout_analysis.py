"""Regression tests for rolling-window workout analysis.

Tests the pure _build_workout_analysis transform directly, without
Supabase or HTTP fixtures.
"""

from datetime import datetime, timedelta

from api.analysis_routes import _build_workout_analysis


def _make_workout(workout_id: str, completed_at: datetime, session_name: str = "Push") -> dict:
    return {
        "id": workout_id,
        "completed_at": completed_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "session_name": session_name,
    }


def _make_exercise(workout_id: str, name: str, sets: int) -> dict:
    return {
        "workout_log_id": workout_id,
        "exercise_name": name,
        "sets_completed": sets,
    }


# ------------------------------------------------------------------ #
#  1. No workouts in 7 days → zero response
# ------------------------------------------------------------------ #

def test_no_workouts_returns_zero():
    result = _build_workout_analysis([], [], days=7)
    assert result.summary.total_sets == 0
    assert result.summary.muscles_trained == 0
    assert len(result.muscles) == 0
    assert result.split_name == "Logged Workouts"


# ------------------------------------------------------------------ #
#  2. One workout 6 days ago → decayed stimulus, not "fresh"
# ------------------------------------------------------------------ #

def test_workout_6_days_ago_has_atrophy():
    now = datetime(2026, 3, 9, 12, 0, 0)
    six_days_ago = now - timedelta(days=6)

    workouts = [_make_workout("w1", six_days_ago)]
    exercises = [_make_exercise("w1", "Bench Press", 4)]

    result = _build_workout_analysis(
        workouts, exercises, days=7, stimulus_duration=48, now=now,
    )

    # Should have trained some muscles (chest at minimum)
    assert result.summary.total_sets > 0
    trained_muscles = [m for m in result.muscles if m.stimulus > 0]
    assert len(trained_muscles) > 0

    # Every stimulated muscle should show meaningful atrophy after 6 days
    for m in trained_muscles:
        assert m.atrophy > 0, f"{m.display_name} should have atrophy after 6 days"
        assert m.net_stimulus < m.stimulus, (
            f"{m.display_name} net_stimulus should be less than raw stimulus"
        )

    assert any(m.secondary_sets > 0 for m in trained_muscles), (
        "Bench Press should stimulate at least one indirect mover for this regression to matter"
    )


# ------------------------------------------------------------------ #
#  3. One workout today > one workout 6 days ago
# ------------------------------------------------------------------ #

def test_today_workout_beats_6_day_old():
    now = datetime(2026, 3, 9, 12, 0, 0)
    six_days_ago = now - timedelta(days=6)

    workout_today = [_make_workout("w1", now)]
    workout_old = [_make_workout("w1", six_days_ago)]
    exercises = [_make_exercise("w1", "Bench Press", 4)]

    result_today = _build_workout_analysis(
        workout_today, exercises, days=7, stimulus_duration=48, now=now,
    )
    result_old = _build_workout_analysis(
        workout_old, exercises, days=7, stimulus_duration=48, now=now,
    )

    today_trained = {m.region_id for m in result_today.muscles if m.stimulus > 0}
    old_trained = {m.region_id for m in result_old.muscles if m.stimulus > 0}
    today_map = {m.region_id: m.net_stimulus for m in result_today.muscles}
    old_map = {m.region_id: m.net_stimulus for m in result_old.muscles}

    trained_common = today_trained & old_trained
    assert len(trained_common) > 0, "Should have at least one commonly trained region"

    for region in trained_common:
        assert today_map[region] > old_map[region], (
            f"{region}: today ({today_map[region]:.3f}) should beat "
            f"6-day-old ({old_map[region]:.3f})"
        )


# ------------------------------------------------------------------ #
#  4. Duplicate exercise rows accumulate sets correctly
# ------------------------------------------------------------------ #

def test_duplicate_exercises_accumulate_sets():
    now = datetime(2026, 3, 9, 12, 0, 0)

    workouts = [_make_workout("w1", now)]

    # Two separate Bench Press entries: 3 + 2 = 5 sets total
    exercises_dup = [
        _make_exercise("w1", "Bench Press", 3),
        _make_exercise("w1", "Bench Press", 2),
    ]
    # Single entry with 5 sets
    exercises_single = [
        _make_exercise("w1", "Bench Press", 5),
    ]

    result_dup = _build_workout_analysis(
        workouts, exercises_dup, days=7, stimulus_duration=48, now=now,
    )
    result_single = _build_workout_analysis(
        workouts, exercises_single, days=7, stimulus_duration=48, now=now,
    )

    # Both should produce identical muscle stimulus
    dup_map = {m.region_id: m.net_stimulus for m in result_dup.muscles}
    single_map = {m.region_id: m.net_stimulus for m in result_single.muscles}

    assert set(dup_map.keys()) == set(single_map.keys())
    for region in dup_map:
        assert abs(dup_map[region] - single_map[region]) < 0.01, (
            f"{region}: dup ({dup_map[region]:.3f}) != single ({single_map[region]:.3f})"
        )


# ------------------------------------------------------------------ #
#  5. Unknown exercise names do not throw
# ------------------------------------------------------------------ #

def test_unknown_exercise_does_not_crash():
    now = datetime(2026, 3, 9, 12, 0, 0)
    workouts = [_make_workout("w1", now)]
    exercises = [_make_exercise("w1", "Xylophone Reverse Curl", 3)]

    # Should not raise
    result = _build_workout_analysis(
        workouts, exercises, days=7, stimulus_duration=48, now=now,
    )
    # Might have zero stimulus (unrecognized exercise), but must not crash
    assert result.summary is not None
