"""
Regression tests for the analysis engine optimization work.

These tests compare the current engine output against fixtures generated from
the production `main` branch so we can refactor the hot path without changing
stimulus semantics.
"""

import json
import time
from pathlib import Path
import sys
from typing import Any

import pytest


backend_path = Path(__file__).parent.parent
sys.path.insert(0, str(backend_path))

from core.MainClasses import MuscleRegion, Split


FIXTURE_PATH = Path(__file__).parent / 'fixtures' / 'analysis_engine_main_baseline.json'
BASELINE_FIXTURES = json.loads(FIXTURE_PATH.read_text(encoding='utf-8'))


def make_ppl_7day() -> Split:
    return Split(
        name='PPL 7-day',
        days=[
            ('Push', 1, {
                'Bench Press': 3,
                'Incline DB Press': 3,
                'Lateral Raise': 3,
                'Tricep Pushdown': 2,
            }),
            ('Pull', 2, {
                'Lat Pulldown': 3,
                'Barbell Row': 3,
                'Face Pull': 3,
                'Barbell Curl': 2,
            }),
            ('Legs', 3, {
                'Squat': 4,
                'Romanian Deadlift': 3,
                'Leg Extension': 2,
                'Leg Curl': 2,
                'Calf Raise': 3,
            }),
            ('Push2', 5, {
                'Overhead Press': 3,
                'Dumbbell Bench Press': 3,
                'Cable Lateral Raise': 3,
                'Overhead Tricep Extension': 2,
            }),
            ('Pull2', 6, {
                'Pull Up': 3,
                'Cable Row': 3,
                'Rear Delt Fly': 3,
                'Hammer Curl': 2,
            }),
            ('Legs2', 7, {
                'Leg Press': 4,
                'Stiff Leg Deadlift': 3,
                'Leg Extension': 2,
                'Leg Curl': 2,
                'Seated Calf Raise': 3,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset='average',
        cycle_length=7,
    )


def make_5day_cycle() -> Split:
    return Split(
        name='5-day cycle',
        days=[
            ('Upper', 1, {
                'Bench Press': 3,
                'Barbell Row': 3,
                'Overhead Press': 2,
                'Barbell Curl': 2,
                'Tricep Pushdown': 2,
            }),
            ('Lower', 2, {
                'Squat': 4,
                'Romanian Deadlift': 3,
                'Leg Extension': 2,
                'Leg Curl': 2,
            }),
            ('Rest', 3, {}),
            ('Push', 4, {
                'Incline DB Press': 3,
                'Dumbbell Lateral Raise': 3,
                'Tricep Pushdown': 3,
            }),
            ('Pull', 5, {
                'Pull Up': 3,
                'Cable Row': 3,
                'Face Pull': 2,
                'Hammer Curl': 2,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset='average',
        cycle_length=5,
    )


def make_4day_cycle() -> Split:
    return Split(
        name='4-day cycle',
        days=[
            ('Upper', 1, {
                'Bench Press': 3,
                'Barbell Row': 3,
                'Overhead Press': 2,
                'Barbell Curl': 2,
            }),
            ('Lower', 2, {
                'Squat': 4,
                'Romanian Deadlift': 3,
                'Leg Extension': 2,
                'Calf Raise': 3,
            }),
            ('Rest', 3, {}),
            ('Upper2', 4, {
                'Incline DB Press': 3,
                'Pull Up': 3,
                'Lateral Raise': 2,
                'Tricep Pushdown': 2,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset='average',
        cycle_length=4,
    )


def make_6day_cycle() -> Split:
    return Split(
        name='6-day cycle',
        days=[
            ('Push', 1, {
                'Bench Press': 3,
                'Incline DB Press': 3,
                'Lateral Raise': 3,
            }),
            ('Pull', 2, {
                'Barbell Row': 3,
                'Lat Pulldown': 3,
                'Face Pull': 2,
            }),
            ('Legs', 3, {
                'Squat': 4,
                'Leg Curl': 3,
                'Calf Raise': 3,
            }),
            ('Rest', 4, {}),
            ('Upper', 5, {
                'Overhead Press': 3,
                'Pull Up': 3,
                'Barbell Curl': 2,
            }),
            ('Lower', 6, {
                'Romanian Deadlift': 3,
                'Leg Press': 3,
                'Leg Extension': 2,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset='average',
        cycle_length=6,
    )


def make_single_session() -> Split:
    return Split(
        name='Single session',
        days=[
            ('Full Body', 1, {
                'Bench Press': 3,
                'Squat': 3,
                'Barbell Row': 3,
            }),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset='average',
        cycle_length=7,
    )


def make_mostly_rest() -> Split:
    return Split(
        name='Mostly rest',
        days=[
            ('Train', 1, {
                'Bench Press': 3,
                'Squat': 3,
            }),
            ('Rest', 2, {}),
            ('Rest', 3, {}),
            ('Rest', 4, {}),
            ('Rest', 5, {}),
            ('Rest', 6, {}),
            ('Rest', 7, {}),
        ],
        stimulus_duration=48,
        maintenance_volume=3,
        dataset='average',
        cycle_length=7,
    )


def normalized_snapshot(split: Split) -> dict:
    split.simulate_split(collect_breakdowns=False)
    return {
        muscle_id: {
            'stimulus': round(muscle.stimulus, 8),
            'atrophy': round(muscle.atrophy, 8),
            'net': round(muscle.net_weekly_stimulus(), 8),
            'primary_sets': muscle.primary_sets,
            'weekly_frequency': round(muscle.weekly_frequency, 8),
        }
        for muscle_id, muscle in split.muscles.items()
        if isinstance(muscle, MuscleRegion)
    }


def normalized_breakdowns(split: Split) -> list[dict]:
    split.simulate_split(collect_breakdowns=True)

    normalized = []
    for stats in split.session_stats:
        exercise_breakdowns = []
        for exercise in stats.get('exercise_breakdowns', []):
            muscle_contributions = []
            for muscle_id, contribution in sorted(exercise.get('muscle_contributions', {}).items()):
                set_breakdowns = []
                for set_info in contribution.get('sets', []):
                    set_breakdowns.append({
                        'set_number': getattr(set_info, 'set_number'),
                        'weight': round(getattr(set_info, 'weight'), 8),
                        'recovery_multiplier': round(getattr(set_info, 'recovery_multiplier'), 8),
                        'bilateral_multiplier': round(getattr(set_info, 'bilateral_multiplier'), 8),
                        'local_multiplier': round(getattr(set_info, 'local_multiplier'), 8),
                        'global_multiplier': round(getattr(set_info, 'global_multiplier'), 8),
                        'consecutive_day_multiplier': round(getattr(set_info, 'consecutive_day_multiplier'), 8),
                        'final_stimulus': round(getattr(set_info, 'final_stimulus'), 8),
                    })

                muscle_contributions.append({
                    'muscle_id': muscle_id,
                    'display_name': contribution['display_name'],
                    'tier': contribution['tier'],
                    'base_weight': round(contribution['base_weight'], 8),
                    'leverage_weight': round(contribution['leverage_weight'], 8),
                    'sets': set_breakdowns,
                    'total_stimulus': round(contribution['total_stimulus'], 8),
                })

            exercise_breakdowns.append({
                'name': exercise['name'],
                'pattern': exercise['pattern'],
                'sets': exercise['sets'],
                'resistance_profile': exercise['resistance_profile'],
                'is_bilateral': exercise['is_bilateral'],
                'is_unilateral': exercise['is_unilateral'],
                'axial_load': round(exercise['axial_load'], 8),
                'muscle_contributions': muscle_contributions,
            })

        normalized.append({
            'time': stats['time'],
            'total_sets': stats['total_sets'],
            'muscles_trained': sorted(stats['muscles_trained']),
            'stimulus_by_muscle': {
                muscle_id: round(value, 8)
                for muscle_id, value in sorted(stats['stimulus_by_muscle'].items())
            },
            'axial_fatigue': round(stats['axial_fatigue'], 8),
            'bilateral_compounds': stats['bilateral_compounds'],
            'bilateral_compound_sets': stats['bilateral_compound_sets'],
            'consecutive_day_penalty': round(stats['consecutive_day_penalty'], 8),
            'exercise_breakdowns': exercise_breakdowns,
            'final_cns_multiplier': round(stats['final_cns_multiplier'], 8),
            'week': stats['week'],
            'consecutive_days': stats['consecutive_days'],
        })

    return normalized


def without_timeline_metrics(snapshot: dict) -> dict:
    return {
        muscle_id: {
            key: value for key, value in values.items()
            if key not in {'stimulus', 'atrophy', 'net'}
        }
        for muscle_id, values in snapshot.items()
    }


class TestNonAtrophyRegression:
    def test_ppl_7day_matches_main_baseline(self):
        assert without_timeline_metrics(normalized_snapshot(make_ppl_7day())) == without_timeline_metrics(BASELINE_FIXTURES['ppl_7day'])

    def test_cycle_4_day_matches_main_baseline(self):
        assert without_timeline_metrics(normalized_snapshot(make_4day_cycle())) == without_timeline_metrics(BASELINE_FIXTURES['cycle_4_day'])

    def test_cycle_5_day_matches_main_baseline(self):
        assert without_timeline_metrics(normalized_snapshot(make_5day_cycle())) == without_timeline_metrics(BASELINE_FIXTURES['cycle_5_day'])

    def test_cycle_6_day_matches_main_baseline(self):
        assert without_timeline_metrics(normalized_snapshot(make_6day_cycle())) == without_timeline_metrics(BASELINE_FIXTURES['cycle_6_day'])

    def test_single_session_breakdown_matches_main_baseline(self):
        assert normalized_breakdowns(make_single_session()) == BASELINE_FIXTURES['single_session_breakdown']


class TestBreakdownCorrectness:
    def test_breakdown_multiplier_chain(self):
        split = make_ppl_7day()
        split.simulate_split(collect_breakdowns=True)

        for stats in split.session_stats:
            for exercise in stats.get('exercise_breakdowns', []):
                for muscle_id, contribution in exercise.get('muscle_contributions', {}).items():
                    set_breakdowns = contribution.get('sets', [])

                    set_ids = [id(set_info) for set_info in set_breakdowns]
                    assert len(set_ids) == len(set(set_ids)), f'{muscle_id}: set breakdown objects should be distinct'

                    for set_info in set_breakdowns:
                        expected = (
                            set_info.weight
                            * set_info.recovery_multiplier
                            * set_info.bilateral_multiplier
                            * set_info.local_multiplier
                            * set_info.global_multiplier
                            * set_info.consecutive_day_multiplier
                        )
                        assert abs(set_info.final_stimulus - expected) <= 1e-6

                    set_numbers = [set_info.set_number for set_info in set_breakdowns]
                    assert set_numbers == list(range(1, len(set_numbers) + 1))

    def test_breakdown_sum_matches_muscle_stimulus(self):
        split = make_single_session()
        split.simulate_split(collect_breakdowns=True)

        breakdown_totals: dict[str, float] = {}
        for stats in split.session_stats:
            for exercise in stats.get('exercise_breakdowns', []):
                for muscle_id, contribution in exercise.get('muscle_contributions', {}).items():
                    breakdown_totals[muscle_id] = breakdown_totals.get(muscle_id, 0.0) + contribution.get('total_stimulus', 0.0)

        for muscle_id, total_stimulus in breakdown_totals.items():
            muscle = split.muscles.get(muscle_id)
            if muscle and isinstance(muscle, MuscleRegion):
                assert abs(muscle.stimulus - total_stimulus) <= 1e-4


class TestEdgeCases:
    def test_empty_split_no_crash(self):
        split = Split(
            name='Empty',
            days=[('Rest', 1, {})],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset='average',
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=True)

    def test_single_exercise_single_set(self):
        split = Split(
            name='Minimal',
            days=[('Day1', 1, {'Bench Press': 1})],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset='average',
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=False)

        assert any(
            muscle.stimulus > 0
            for muscle in split.muscles.values()
            if isinstance(muscle, MuscleRegion)
        )

    def test_unrecognized_exercise_skipped(self):
        split = Split(
            name='Unknown',
            days=[('Day1', 1, {'xyzzy_fake_exercise_12345': 3})],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset='average',
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=False)

        total_stimulus = sum(
            muscle.stimulus
            for muscle in split.muscles.values()
            if isinstance(muscle, MuscleRegion)
        )
        assert total_stimulus == 0.0

    def test_all_unilateral(self):
        unilateral_days: list[tuple[str, int, dict[str, Any]]] = [
            ('Day1', 1, {
                'Dumbbell Bench Press': (3, True, None),
                'Dumbbell Row': (3, True, None),
                'Dumbbell Lunge': (3, True, None),
            }),
        ]
        split = Split(
            name='Unilateral',
            days=unilateral_days,
            stimulus_duration=48,
            maintenance_volume=3,
            dataset='average',
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=True)

        assert any(
            muscle.stimulus > 0
            for muscle in split.muscles.values()
            if isinstance(muscle, MuscleRegion)
        )

    def test_high_volume_diminishing_returns(self):
        split = Split(
            name='High volume',
            days=[('Day1', 1, {'Bench Press': 20})],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset='average',
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=False)

        assert any(
            muscle.stimulus > 0
            for muscle in split.muscles.values()
            if isinstance(muscle, MuscleRegion)
        )

    def test_consecutive_days_penalty_accumulates(self):
        split = Split(
            name='5 consecutive',
            days=[
                ('Day1', 1, {'Bench Press': 3}),
                ('Day2', 2, {'Bench Press': 3}),
                ('Day3', 3, {'Bench Press': 3}),
                ('Day4', 4, {'Bench Press': 3}),
                ('Day5', 5, {'Bench Press': 3}),
                ('Rest', 6, {}),
                ('Rest', 7, {}),
            ],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset='average',
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=True)

        penalties = [
            stats.get('consecutive_day_penalty', 1.0)
            for stats in split.session_stats
            if stats is not None
        ]

        assert len(penalties) >= 2
        assert penalties[0] == 1.0
        for penalty in penalties[1:]:
            assert penalty <= 1.0


class TestContinuousAtrophyTimeline:
    @staticmethod
    def muscle() -> MuscleRegion:
        return MuscleRegion(
            region_id='test', display_name='Test', parent_group='test',
            leverage='M', damage_tier='0'
        )

    def test_elapsed_post_window_time_is_charged_once(self):
        muscle = self.muscle()
        muscle.reset_atrophy_clock(0.0)

        muscle.account_atrophy_through(72.0, 48, 3, 'schoenfeld')
        first = muscle.atrophy
        muscle.account_atrophy_through(120.0, 48, 3, 'schoenfeld')
        second = muscle.atrophy
        muscle.account_atrophy_through(168.0, 48, 3, 'schoenfeld')

        assert first > 0
        assert second == pytest.approx(first * 3)
        assert muscle.atrophy == pytest.approx(first * 5)

    def test_only_prime_exposure_resets_clock(self):
        uninterrupted = self.muscle()
        uninterrupted.reset_atrophy_clock(0.0)
        uninterrupted.account_atrophy_through(168.0, 48, 3, 'schoenfeld')

        with_lower_tier_event = self.muscle()
        with_lower_tier_event.reset_atrophy_clock(0.0)
        with_lower_tier_event.account_atrophy_through(72.0, 48, 3, 'schoenfeld')
        # A secondary/tertiary/quaternary exposure intentionally makes no
        # reset_atrophy_clock call.
        with_lower_tier_event.account_atrophy_through(168.0, 48, 3, 'schoenfeld')

        with_new_prime = self.muscle()
        with_new_prime.reset_atrophy_clock(0.0)
        with_new_prime.account_atrophy_through(120.0, 48, 3, 'schoenfeld')
        with_new_prime.reset_atrophy_clock(120.0)
        with_new_prime.account_atrophy_through(168.0, 48, 3, 'schoenfeld')

        assert with_lower_tier_event.atrophy == pytest.approx(uninterrupted.atrophy)
        assert with_new_prime.atrophy < uninterrupted.atrophy

    def test_duplicate_entries_are_both_executed(self):
        split = Split(
            name='Duplicates',
            days=[('Push', 1, [
                ('Bench Press', (2, False, None)),
                ('Bench Press', (3, False, None)),
            ])],
            stimulus_duration=48,
            maintenance_volume=3,
            dataset='average',
            cycle_length=7,
        )
        split.simulate_split(collect_breakdowns=True)

        assert [item['name'] for item in split.session_stats[0]['exercise_breakdowns']] == [
            'Bench Press', 'Bench Press'
        ]


class TestTiming:
    def test_timing_ppl_7day(self):
        start = time.perf_counter()
        split = make_ppl_7day()
        split.simulate_split(collect_breakdowns=True)
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f'\n[TIMING] PPL 7-day (breakdowns): {elapsed_ms:.1f}ms')

    def test_timing_5day_cycle(self):
        start = time.perf_counter()
        split = make_5day_cycle()
        split.simulate_split(collect_breakdowns=True)
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f'\n[TIMING] 5-day cycle (breakdowns): {elapsed_ms:.1f}ms')

    def test_timing_ppl_no_breakdowns(self):
        start = time.perf_counter()
        split = make_ppl_7day()
        split.simulate_split(collect_breakdowns=False)
        elapsed_ms = (time.perf_counter() - start) * 1000
        print(f'\n[TIMING] PPL 7-day (no breakdowns): {elapsed_ms:.1f}ms')
