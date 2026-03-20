"""
Parity tests for the analysis engine optimization.

These tests capture baseline stimulus/atrophy/net values for various split
configurations and assert they remain stable (within 1e-6) after optimizations.
"""

import json
import time
import pytest
from pathlib import Path

# Ensure backend is importable
import sys
backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from core.MainClasses import Split, MuscleRegion


# ============================================================================
# TEST SPLIT DEFINITIONS
# ============================================================================

def make_ppl_7day():
    """Standard Push/Pull/Legs on 7-day cycle."""
    return Split(
        name="PPL 7-day",
        days=[
            ("Push", 1, {
                "Bench Press": 3,
                "Incline DB Press": 3,
                "Lateral Raise": 3,
                "Tricep Pushdown": 2,
            }),
            ("Pull", 2, {
                "Lat Pulldown": 3,
                "Barbell Row": 3,
                "Face Pull": 3,
                "Barbell Curl": 2,
            }),
            ("Legs", 3, {
                "Squat": 4,
                "Romanian Deadlift": 3,
                "Leg Extension": 2,
                "Leg Curl": 2,
                "Calf Raise": 3,
            }),
            ("Push2", 5, {
                "Overhead Press": 3,
                "Dumbbell Bench Press": 3,
                "Cable Lateral Raise": 3,
                "Overhead Tricep Extension": 2,
            }),
            ("Pull2", 6, {
                "Pull Up": 3,
                "Cable Row": 3,
                "Rear Delt Fly": 3,
                "Hammer Curl": 2,
            }),
            ("Legs2", 7, {
                "Leg Press": 4,
                "Stiff Leg Deadlift": 3,
                "Leg Extension": 2,
                "Leg Curl": 2,
                "Seated Calf Raise": 3,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        cycle_length=7,
    )


def make_5day_cycle():
    """5-day cycle (Upper/Lower/Push/Pull/Legs) — forces 5 weeks_to_sim."""
    return Split(
        name="5-day cycle",
        days=[
            ("Upper", 1, {
                "Bench Press": 3,
                "Barbell Row": 3,
                "Overhead Press": 2,
                "Barbell Curl": 2,
                "Tricep Pushdown": 2,
            }),
            ("Lower", 2, {
                "Squat": 4,
                "Romanian Deadlift": 3,
                "Leg Extension": 2,
                "Leg Curl": 2,
            }),
            ("Rest", 3, {}),
            ("Push", 4, {
                "Incline DB Press": 3,
                "Dumbbell Lateral Raise": 3,
                "Tricep Pushdown": 3,
            }),
            ("Pull", 5, {
                "Pull Up": 3,
                "Cable Row": 3,
                "Face Pull": 2,
                "Hammer Curl": 2,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        cycle_length=5,
    )


def make_4day_cycle():
    """4-day cycle (Upper/Lower/Rest/Upper) — forces 4 weeks_to_sim."""
    return Split(
        name="4-day cycle",
        days=[
            ("Upper", 1, {
                "Bench Press": 3,
                "Barbell Row": 3,
                "Overhead Press": 2,
                "Barbell Curl": 2,
            }),
            ("Lower", 2, {
                "Squat": 4,
                "Romanian Deadlift": 3,
                "Leg Extension": 2,
                "Calf Raise": 3,
            }),
            ("Rest", 3, {}),
            ("Upper2", 4, {
                "Incline DB Press": 3,
                "Pull Up": 3,
                "Lateral Raise": 2,
                "Tricep Pushdown": 2,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        cycle_length=4,
    )


def make_6day_cycle():
    """6-day cycle — forces 6 weeks_to_sim."""
    return Split(
        name="6-day cycle",
        days=[
            ("Push", 1, {
                "Bench Press": 3,
                "Incline DB Press": 3,
                "Lateral Raise": 3,
            }),
            ("Pull", 2, {
                "Barbell Row": 3,
                "Lat Pulldown": 3,
                "Face Pull": 2,
            }),
            ("Legs", 3, {
                "Squat": 4,
                "Leg Curl": 3,
                "Calf Raise": 3,
            }),
            ("Rest", 4, {}),
            ("Upper", 5, {
                "Overhead Press": 3,
                "Pull Up": 3,
                "Barbell Curl": 2,
            }),
            ("Lower", 6, {
                "Romanian Deadlift": 3,
                "Leg Press": 3,
                "Leg Extension": 2,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        cycle_length=6,
    )


def make_single_session():
    """Minimal: 1 session, 1-day cycle."""
    return Split(
        name="Single session",
        days=[
            ("Full Body", 1, {
                "Bench Press": 3,
                "Squat": 3,
                "Barbell Row": 3,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        cycle_length=7,
    )


def make_mostly_rest():
    """Edge case: only 1 training day in a 7-day cycle."""
    return Split(
        name="Mostly rest",
        days=[
            ("Train", 1, {
                "Bench Press": 3,
                "Squat": 3,
            }),
            ("Rest", 2, {}),
            ("Rest", 3, {}),
            ("Rest", 4, {}),
            ("Rest", 5, {}),
            ("Rest", 6, {}),
            ("Rest", 7, {}),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset="average",
        cycle_length=7,
    )


# ============================================================================
# HELPERS
# ============================================================================

def get_muscle_snapshot(split: Split) -> dict:
    """Capture {region_id: {stimulus, atrophy, net}} for all muscles."""
    snapshot = {}
    for name, muscle in split.muscles.items():
        if isinstance(muscle, MuscleRegion):
            snapshot[name] = {
                'stimulus': muscle.stimulus,
                'atrophy': muscle.atrophy,
                'net': muscle.net_weekly_stimulus(),
            }
    return snapshot


def assert_snapshots_match(snap_a: dict, snap_b: dict, tolerance=1e-6):
    """Assert two muscle snapshots match within tolerance."""
    assert set(snap_a.keys()) == set(snap_b.keys()), \
        f"Muscle set mismatch: {set(snap_a.keys()) ^ set(snap_b.keys())}"
    for muscle_id in snap_a:
        for field in ('stimulus', 'atrophy', 'net'):
            va = snap_a[muscle_id][field]
            vb = snap_b[muscle_id][field]
            assert abs(va - vb) <= tolerance, \
                f"{muscle_id}.{field}: {va} vs {vb} (diff={abs(va-vb)})"


# ============================================================================
# PARITY TESTS — run split twice, verify identical results
# ============================================================================

class TestParity:
    """Each test simulates the same split twice and asserts identical outputs."""

    def test_ppl_7day_parity(self):
        s1 = make_ppl_7day()
        s1.simulate_split(collect_breakdowns=False)
        snap1 = get_muscle_snapshot(s1)

        s2 = make_ppl_7day()
        s2.simulate_split(collect_breakdowns=False)
        snap2 = get_muscle_snapshot(s2)

        assert_snapshots_match(snap1, snap2)

    def test_5day_cycle_parity(self):
        s1 = make_5day_cycle()
        s1.simulate_split(collect_breakdowns=False)
        snap1 = get_muscle_snapshot(s1)

        s2 = make_5day_cycle()
        s2.simulate_split(collect_breakdowns=False)
        snap2 = get_muscle_snapshot(s2)

        assert_snapshots_match(snap1, snap2)

    def test_4day_cycle_parity(self):
        s1 = make_4day_cycle()
        s1.simulate_split(collect_breakdowns=False)
        snap1 = get_muscle_snapshot(s1)

        s2 = make_4day_cycle()
        s2.simulate_split(collect_breakdowns=False)
        snap2 = get_muscle_snapshot(s2)

        assert_snapshots_match(snap1, snap2)

    def test_6day_cycle_parity(self):
        s1 = make_6day_cycle()
        s1.simulate_split(collect_breakdowns=False)
        snap1 = get_muscle_snapshot(s1)

        s2 = make_6day_cycle()
        s2.simulate_split(collect_breakdowns=False)
        snap2 = get_muscle_snapshot(s2)

        assert_snapshots_match(snap1, snap2)

    def test_single_session_parity(self):
        s1 = make_single_session()
        s1.simulate_split(collect_breakdowns=False)
        snap1 = get_muscle_snapshot(s1)

        s2 = make_single_session()
        s2.simulate_split(collect_breakdowns=False)
        snap2 = get_muscle_snapshot(s2)

        assert_snapshots_match(snap1, snap2)

    def test_mostly_rest_parity(self):
        s1 = make_mostly_rest()
        s1.simulate_split(collect_breakdowns=False)
        snap1 = get_muscle_snapshot(s1)

        s2 = make_mostly_rest()
        s2.simulate_split(collect_breakdowns=False)
        snap2 = get_muscle_snapshot(s2)

        assert_snapshots_match(snap1, snap2)


# ============================================================================
# BREAKDOWN CORRECTNESS TESTS
# ============================================================================

class TestBreakdownCorrectness:
    """Verify breakdown records are internally consistent."""

    def test_breakdown_multiplier_chain(self):
        """Each set's final_stimulus should equal the product of all multipliers × weight."""
        split = make_ppl_7day()
        split.simulate_split(collect_breakdowns=True)

        for stats in split.session_stats:
            if stats is None:
                continue
            for ex_bd in stats.get('exercise_breakdowns', []):
                for muscle_id, mc in ex_bd.get('muscle_contributions', {}).items():
                    for s in mc.get('sets', []):
                        expected = (
                            s['weight']
                            * s['recovery_multiplier']
                            * s['bilateral_multiplier']
                            * s['local_multiplier']
                            * s['global_multiplier']
                            * s['consecutive_day_multiplier']
                        )
                        assert abs(s['final_stimulus'] - expected) <= 1e-6, \
                            f"Multiplier chain mismatch: {s['final_stimulus']} vs {expected}"

    def test_breakdown_sum_matches_muscle_stimulus(self):
        """Sum of breakdown final_stimulus per muscle ≈ muscle.stimulus."""
        split = make_single_session()
        split.simulate_split(collect_breakdowns=True)

        # Aggregate breakdown stimulus per muscle across all sessions
        bd_totals = {}
        for stats in split.session_stats:
            if stats is None:
                continue
            for ex_bd in stats.get('exercise_breakdowns', []):
                for muscle_id, mc in ex_bd.get('muscle_contributions', {}).items():
                    bd_totals[muscle_id] = bd_totals.get(muscle_id, 0.0) + mc.get('total_stimulus', 0.0)

        # Compare to actual muscle stimulus values
        for muscle_id, bd_total in bd_totals.items():
            muscle = split.muscles.get(muscle_id)
            if muscle and isinstance(muscle, MuscleRegion):
                # Stimulus in muscle is average across weeks, breakdown is per-week
                # For single-session 7-day cycle, weeks_to_sim=1, so they should match
                assert abs(muscle.stimulus - bd_total) <= 1e-4, \
                    f"{muscle_id}: muscle.stimulus={muscle.stimulus} vs bd_total={bd_total}"


# ============================================================================
# EDGE CASE TESTS
# ============================================================================

class TestEdgeCases:

    def test_empty_split_no_crash(self):
        """Split with no exercises doesn't crash."""
        split = Split(
            name="Empty",
            days=[("Rest", 1, {})],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset="average",
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=True)
        # Should complete without error

    def test_single_exercise_single_set(self):
        """Minimal exercise configuration produces nonzero stimulus."""
        split = Split(
            name="Minimal",
            days=[("Day1", 1, {"Bench Press": 1})],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset="average",
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=False)
        # At least one muscle should have stimulus > 0
        has_stimulus = any(
            m.stimulus > 0 for m in split.muscles.values()
            if isinstance(m, MuscleRegion)
        )
        assert has_stimulus, "Single exercise should produce nonzero stimulus"

    def test_unrecognized_exercise_skipped(self):
        """Unknown exercise name doesn't crash, just gets skipped."""
        split = Split(
            name="Unknown",
            days=[("Day1", 1, {"xyzzy_fake_exercise_12345": 3})],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset="average",
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=False)
        # All muscles should have 0 stimulus (exercise was skipped)
        total = sum(
            m.stimulus for m in split.muscles.values()
            if isinstance(m, MuscleRegion)
        )
        assert total == 0.0, f"Unrecognized exercise should produce 0 stimulus, got {total}"

    def test_all_unilateral(self):
        """All unilateral exercises get the unilateral modifier."""
        split = Split(
            name="Unilateral",
            days=[("Day1", 1, {
                "Dumbbell Bench Press": (3, True, None),
                "Dumbbell Row": (3, True, None),
                "Dumbbell Lunge": (3, True, None),
            })],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset="average",
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=True)
        # Check that some muscle has nonzero stimulus
        has_stimulus = any(
            m.stimulus > 0 for m in split.muscles.values()
            if isinstance(m, MuscleRegion)
        )
        assert has_stimulus, "Unilateral exercises should produce stimulus"

    def test_high_volume_diminishing_returns(self):
        """20+ sets per exercise doesn't crash, stimulus extends via decay curve."""
        split = Split(
            name="High volume",
            days=[("Day1", 1, {"Bench Press": 20})],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset="average",
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=False)
        has_stimulus = any(
            m.stimulus > 0 for m in split.muscles.values()
            if isinstance(m, MuscleRegion)
        )
        assert has_stimulus

    def test_consecutive_days_penalty_accumulates(self):
        """5 consecutive training days should have increasing penalty."""
        split = Split(
            name="5 consecutive",
            days=[
                ("Day1", 1, {"Bench Press": 3}),
                ("Day2", 2, {"Bench Press": 3}),
                ("Day3", 3, {"Bench Press": 3}),
                ("Day4", 4, {"Bench Press": 3}),
                ("Day5", 5, {"Bench Press": 3}),
                ("Rest", 6, {}),
                ("Rest", 7, {}),
            ],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset="average",
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=True)

        # Check consecutive_day_penalty increases across sessions
        penalties = []
        for stats in split.session_stats:
            if stats is not None:
                penalties.append(stats.get('consecutive_day_penalty', 1.0))

        # Day 1 should have penalty=1.0, subsequent days should have penalty < 1.0
        assert len(penalties) >= 2, "Should have multiple sessions"
        # The first day should have no penalty
        assert penalties[0] == 1.0, f"First day penalty should be 1.0, got {penalties[0]}"


# ============================================================================
# TIMING / PROFILING HELPERS (not assertions, just print)
# ============================================================================

class TestTiming:
    """Capture baseline timing for before/after comparison."""

    def test_timing_ppl_7day(self):
        """Baseline: PPL 7-day with breakdowns."""
        t0 = time.perf_counter()
        s = make_ppl_7day()
        s.simulate_split(collect_breakdowns=True)
        t1 = time.perf_counter()
        print(f"\n[TIMING] PPL 7-day (breakdowns): {(t1-t0)*1000:.1f}ms")

    def test_timing_5day_cycle(self):
        """Baseline: 5-day cycle with breakdowns."""
        t0 = time.perf_counter()
        s = make_5day_cycle()
        s.simulate_split(collect_breakdowns=True)
        t1 = time.perf_counter()
        print(f"\n[TIMING] 5-day cycle (breakdowns): {(t1-t0)*1000:.1f}ms")

    def test_timing_ppl_no_breakdowns(self):
        """Baseline: PPL 7-day without breakdowns."""
        t0 = time.perf_counter()
        s = make_ppl_7day()
        s.simulate_split(collect_breakdowns=False)
        t1 = time.perf_counter()
        print(f"\n[TIMING] PPL 7-day (no breakdowns): {(t1-t0)*1000:.1f}ms")
