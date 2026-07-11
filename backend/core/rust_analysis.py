"""
Adapter for the optional Rust split analysis engine.

The Python layer keeps request validation, auth, caching, user-specific
exercise lookup, and free-text movement matching. The Rust extension receives
resolved canonical exercise data and performs the deterministic simulation.
"""

from __future__ import annotations

import json
import math
from numbers import Real
from typing import Any, Dict, Optional

from core.exerciseMatching import move_match_with_overrides
from core.granular_patterns import (
    GRANULAR_PATTERNS,
    get_pattern_axial_load,
    get_pattern_muscle_targets,
    get_pattern_resistance_profile,
    is_pattern_bilateral,
)
from core.muscle_regions import LEGACY_MUSCLE_MAPPING, get_all_muscle_regions
from schemas.models import AnalysisResponse, SplitRequest


NUMERIC_PARITY_TOLERANCE = 1e-8

try:
    import analysis_engine_rs  # type: ignore
except Exception:  # pragma: no cover - depends on local extension build
    analysis_engine_rs = None


def rust_engine_available() -> bool:
    return analysis_engine_rs is not None


def run_rust_split_analysis(
    request: SplitRequest,
    user_id: Optional[str] = None,
    user_exercise_maps: Optional[Dict[str, Dict[str, Any]]] = None,
) -> AnalysisResponse:
    if analysis_engine_rs is None:
        raise RuntimeError("analysis_engine_rs is not installed")

    payload = build_rust_analysis_input(request, user_id, user_exercise_maps)
    # Keep Python's insertion order. It is part of the response contract for
    # tied per-muscle breakdowns after stable sorting in both engines.
    raw = analysis_engine_rs.analyze_split_json(json.dumps(payload, separators=(",", ":")))
    return AnalysisResponse.model_validate_json(raw)


def compare_analysis_responses(
    expected: AnalysisResponse,
    actual: AnalysisResponse,
    *,
    tolerance: float = NUMERIC_PARITY_TOLERANCE,
) -> Optional[str]:
    """Return the first response difference, or ``None`` when results match.

    Rust and CPython can differ by a few ulps after long floating-point
    simulations. All structural values, strings, counts, list ordering, and
    numeric values outside the documented tolerance remain strict parity
    failures. The returned path deliberately excludes response values so
    callers can emit safe operational telemetry without recording workout data.
    """
    return _first_difference(
        expected.model_dump(mode="json"),
        actual.model_dump(mode="json"),
        path="response",
        tolerance=tolerance,
    )


def _first_difference(
    expected: Any,
    actual: Any,
    *,
    path: str,
    tolerance: float,
) -> Optional[str]:
    if isinstance(expected, bool) or isinstance(actual, bool):
        return None if expected is actual else path

    if isinstance(expected, Real) and isinstance(actual, Real):
        return (
            None
            if math.isclose(float(expected), float(actual), rel_tol=tolerance, abs_tol=tolerance)
            else path
        )

    if type(expected) is not type(actual):
        return path

    if isinstance(expected, dict):
        if list(expected.keys()) != list(actual.keys()):
            return f"{path}.keys"
        for key in expected:
            difference = _first_difference(
                expected[key], actual[key], path=f"{path}.{key}", tolerance=tolerance
            )
            if difference:
                return difference
        return None

    if isinstance(expected, list):
        if len(expected) != len(actual):
            return f"{path}.length"
        for index, (expected_item, actual_item) in enumerate(zip(expected, actual)):
            difference = _first_difference(
                expected_item,
                actual_item,
                path=f"{path}[{index}]",
                tolerance=tolerance,
            )
            if difference:
                return difference
        return None

    return None if expected == actual else path


def build_rust_analysis_input(
    request: SplitRequest,
    user_id: Optional[str] = None,
    user_exercise_maps: Optional[Dict[str, Dict[str, Any]]] = None,
) -> dict:
    return {
        "name": request.name,
        "cycle_length": request.cycle_length,
        "stimulus_duration": request.stimulus_duration,
        "maintenance_volume": request.maintenance_volume,
        "dataset": request.dataset,
        "include_breakdowns": request.include_breakdowns,
        "regions": _build_regions(),
        "sessions": [
            {
                "name": session.name,
                "day": session.day,
                "exercises": _resolve_session_exercises(
                    session.exercises,
                    user_id,
                    user_exercise_maps,
                ),
            }
            for session in request.sessions
        ],
    }


def _build_regions() -> list[dict]:
    return [
        {
            "region_id": region_id,
            "display_name": data.display_name,
            "parent_group": data.parent_group,
            "leverage": data.leverage,
            "damage_tier": data.damage_tier,
            "recovery_modifier": data.recovery_modifier,
            "axial_fatigue_contributor": data.axial_fatigue_contributor,
        }
        for region_id, data in get_all_muscle_regions().items()
    ]


def _resolve_session_exercises(
    exercises: list,
    user_id: Optional[str],
    user_exercise_maps: Optional[Dict[str, Dict[str, Any]]],
) -> list[dict]:
    # Match _run_split_analysis' dict-comprehension behavior: duplicate
    # exercise names keep their first insertion position but use the last value.
    by_name = {}
    for exercise in exercises:
        by_name[exercise.name] = (
            exercise.sets,
            bool(exercise.unilateral),
            exercise.resistance_profile,
        )

    return [
        _resolve_exercise(
            name,
            sets,
            force_unilateral,
            resistance_profile,
            user_id,
            user_exercise_maps,
        )
        for name, (sets, force_unilateral, resistance_profile) in by_name.items()
    ]


def _resolve_exercise(
    exercise_name: str,
    sets: int,
    force_unilateral: bool,
    resistance_profile_override: Optional[str],
    user_id: Optional[str],
    user_exercise_maps: Optional[Dict[str, Dict[str, Any]]],
) -> dict:
    movement = move_match_with_overrides(
        exercise_name,
        user_id,
        user_maps=user_exercise_maps,
    )
    if not movement:
        return {
            "name": exercise_name,
            "sets": sets,
            "pattern_name": None,
            "tiered_targets": _empty_tiers(),
            "is_bilateral": False,
            "is_unilateral": False,
            "axial_load": 0.0,
            "resistance_profile": resistance_profile_override or "mid",
        }

    normalized = movement.name.lower().replace(" ", "_").replace("-", "_")
    pattern_name = normalized if normalized in GRANULAR_PATTERNS else None
    if pattern_name is None:
        for key in GRANULAR_PATTERNS.keys():
            if normalized in key or key in normalized:
                pattern_name = key
                break

    if pattern_name:
        tiered_targets = get_pattern_muscle_targets(pattern_name)
        is_bilateral = is_pattern_bilateral(pattern_name)
        axial_load = get_pattern_axial_load(pattern_name)
        resistance_profile = resistance_profile_override or get_pattern_resistance_profile(pattern_name)
    else:
        tiered_targets = _legacy_to_tiered(movement.targets)
        is_bilateral = not movement.unilateral
        axial_load = 0.0
        resistance_profile = resistance_profile_override or "mid"
        pattern_name = normalized

    is_unilateral = force_unilateral or _is_unilateral(exercise_name) or movement.unilateral
    if is_unilateral:
        is_bilateral = False

    return {
        "name": exercise_name,
        "sets": sets,
        "pattern_name": pattern_name,
        "tiered_targets": tiered_targets,
        "is_bilateral": is_bilateral,
        "is_unilateral": is_unilateral,
        "axial_load": axial_load,
        "resistance_profile": resistance_profile,
    }


def _empty_tiers() -> dict:
    return {"prime": {}, "secondary": {}, "tertiary": {}, "quaternary": {}}


def _legacy_to_tiered(targets: Dict[str, float]) -> dict:
    tiered = _empty_tiers()
    for muscle_name, weight in targets.items():
        granular_regions = LEGACY_MUSCLE_MAPPING.get(muscle_name, [muscle_name])
        weight_per_region = weight / len(granular_regions)
        for region in granular_regions:
            if weight >= 0.5:
                tiered["prime"][region] = weight_per_region
            elif weight >= 0.2:
                tiered["secondary"][region] = weight_per_region
            elif weight >= 0.1:
                tiered["tertiary"][region] = weight_per_region
            else:
                tiered["quaternary"][region] = weight_per_region
    return tiered


def _is_unilateral(exercise_name: str) -> bool:
    unilateral_terms = [
        "single",
        "one arm",
        "one-arm",
        "one leg",
        "one-leg",
        "unilateral",
        "sa ",
        "sl ",
        "single arm",
        "single leg",
        "alternating",
        "1-arm",
        "1-leg",
        "1 arm",
        "1 leg",
    ]
    name_lower = exercise_name.lower()
    return any(term in name_lower for term in unilateral_terms)
