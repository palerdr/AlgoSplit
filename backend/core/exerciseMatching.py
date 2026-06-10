"""
Exercise matching with user-specific overrides and custom exercises
Wrapper around movementMatching that supports database-backed user overrides
"""

from typing import Optional, Dict, Any, Tuple, cast
from core.movementMatching import (
    move_match as default_move_match,
    move_match_detailed as default_move_match_detailed,
    MatchResult,
    Movement,
)
from core.granular_patterns import GRANULAR_PATTERNS
from db.supabase import get_supabase_client

UserExerciseMaps = Dict[str, Dict[str, Any]]


def _as_dict(value: Any) -> Optional[Dict[str, Any]]:
    if isinstance(value, dict):
        return cast(Dict[str, Any], value)
    return None


def _get_custom_exercise(exercise_name: str, user_id: str) -> Optional[Dict[str, Any]]:
    """
    Check if user has a custom exercise definition for this name.

    Returns:
        Custom exercise dict or None
    """
    try:
        supabase = get_supabase_client()
        normalized_name = exercise_name.lower().strip()

        result = supabase.table("custom_exercises").select("*").eq(
            "user_id", user_id
        ).ilike("exercise_name", normalized_name).limit(1).execute()

        if result.data and len(result.data) > 0:
            row = _as_dict(result.data[0])
            if row is not None:
                return row

    except Exception as e:
        print(f"Error checking custom exercises: {e}")

    return None


def _build_movement_from_custom(custom: Dict[str, Any], exercise_name: str) -> Movement:
    """Build a Movement object from a custom exercise definition."""
    # Merge all targets into a flat dict for backward compatibility
    all_targets = {}
    for targets in [
        custom.get("prime_targets", {}),
        custom.get("secondary_targets", {}),
        custom.get("tertiary_targets", {}),
        custom.get("quaternary_targets", {}),
    ]:
        if targets:
            all_targets.update(targets)

    return Movement(
        name=f"custom:{custom['exercise_name']}",
        targets=all_targets,
        resistance_profile=custom.get("resistance_profile", "mid"),
        is_unilateral=not custom.get("is_bilateral", True),
        # Store tiered targets for granular processing
        tiered_targets={
            "prime": custom.get("prime_targets", {}),
            "secondary": custom.get("secondary_targets", {}),
            "tertiary": custom.get("tertiary_targets", {}),
            "quaternary": custom.get("quaternary_targets", {}),
        },
        axial_load=float(custom.get("axial_load", 0.0)),
        is_custom=True,
    )


def preload_user_exercise_maps(user_id: str) -> UserExerciseMaps:
    """
    Load all user custom exercises and overrides once.

    Returns:
        {
            "custom": {normalized_exercise_name: custom_exercise_row},
            "overrides": {normalized_exercise_name: pattern_override}
        }
    """
    custom_map: Dict[str, Dict[str, Any]] = {}
    override_map: Dict[str, str] = {}

    try:
        supabase = get_supabase_client()

        custom_result = (
            supabase.table("custom_exercises")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        for row in custom_result.data or []:
            row_dict = _as_dict(row)
            if row_dict is None:
                continue
            exercise_name_value = row_dict.get("exercise_name")
            exercise_name = exercise_name_value.lower().strip() if isinstance(exercise_name_value, str) else ""
            if exercise_name:
                custom_map[exercise_name] = row_dict

        override_result = (
            supabase.table("exercise_overrides")
            .select("exercise_name, pattern_override")
            .eq("user_id", user_id)
            .execute()
        )
        for row in override_result.data or []:
            row_dict = _as_dict(row)
            if row_dict is None:
                continue
            exercise_name_value = row_dict.get("exercise_name")
            exercise_name = exercise_name_value.lower().strip() if isinstance(exercise_name_value, str) else ""
            pattern_override = row_dict.get("pattern_override")
            if exercise_name and isinstance(pattern_override, str):
                override_map[exercise_name] = pattern_override
    except Exception as e:
        print(f"Error preloading user exercise maps: {e}")

    return {
        "custom": custom_map,
        "overrides": {k: v for k, v in override_map.items()},
    }


def move_match_with_overrides(
    exercise_name: str,
    user_id: Optional[str] = None,
    user_maps: Optional[UserExerciseMaps] = None,
    movement_cache: Optional[Dict[str, Optional[Movement]]] = None,
) -> Optional[Movement]:
    """
    Match an exercise to a movement pattern with user-specific overrides

    Args:
        exercise_name: Raw exercise name string
        user_id: Optional user ID to check for user-specific overrides

    Returns:
        Movement object with pattern name, muscle targets, and unilateral flag
        or None if exercise not recognized

    Priority order:
        1. User's custom exercises (fully user-defined targets)
        2. User's pattern overrides (remaps to existing pattern)
        3. Default pattern matching
    """
    normalized_name = exercise_name.lower().strip()

    if movement_cache is not None and normalized_name in movement_cache:
        return movement_cache[normalized_name]

    # If user_id provided, check for custom exercise first, then overrides
    if user_id:
        try:
            custom = None
            pattern_override = None

            if user_maps is not None:
                custom = user_maps.get("custom", {}).get(normalized_name)
                pattern_override = user_maps.get("overrides", {}).get(normalized_name)
            else:
                # 1. Check for custom exercise (highest priority)
                custom = _get_custom_exercise(exercise_name, user_id)

                # 2. Check for pattern override
                supabase = get_supabase_client()
                result = (
                    supabase.table("exercise_overrides")
                    .select("pattern_override")
                    .eq("user_id", user_id)
                    .ilike("exercise_name", normalized_name)
                    .limit(1)
                    .execute()
                )
                if result.data and len(result.data) > 0:
                    row = _as_dict(result.data[0])
                    if row is not None:
                        value = row.get("pattern_override")
                        if isinstance(value, str):
                            pattern_override = value

            if custom:
                movement = _build_movement_from_custom(custom, exercise_name)
                if movement_cache is not None:
                    movement_cache[normalized_name] = movement
                return movement

            if pattern_override in GRANULAR_PATTERNS:
                targets = GRANULAR_PATTERNS[pattern_override]

                is_unilateral = any(
                    word in normalized_name
                    for word in ["single", "one", "unilateral", "dumbbell", "db"]
                )

                movement = Movement(
                    pattern_override,
                    targets,
                    resistance_profile=None,
                    is_unilateral=is_unilateral,
                )
                if movement_cache is not None:
                    movement_cache[normalized_name] = movement
                return movement

        except Exception as e:
            # If database query fails, fall back to default matching
            # Log error in production
            print(f"Error checking exercise overrides: {e}")
            pass

    # 3. Fall back to default pattern matching
    movement = default_move_match(exercise_name)
    if movement_cache is not None:
        movement_cache[normalized_name] = movement
    return movement


def move_match_with_overrides_detailed(
    exercise_name: str,
    user_id: Optional[str] = None,
    user_maps: Optional[UserExerciseMaps] = None,
) -> Tuple[Optional[Movement], MatchResult]:
    """
    Like move_match_with_overrides, but also returns MatchResult confidence
    signals for callers that triage matches (e.g. the import preview).

    Custom exercises and explicit user overrides are treated as fully
    confident matches (score=100, never ambiguous).
    """
    movement = None
    if user_id:
        normalized_name = exercise_name.lower().strip()
        try:
            if user_maps is not None:
                custom = user_maps.get("custom", {}).get(normalized_name)
                pattern_override = user_maps.get("overrides", {}).get(normalized_name)
                if custom:
                    movement = _build_movement_from_custom(custom, exercise_name)
                elif pattern_override in GRANULAR_PATTERNS:
                    movement = move_match_with_overrides(exercise_name, user_id, user_maps)
            else:
                movement = move_match_with_overrides(exercise_name, user_id)
                if movement is not None and not movement.is_custom:
                    # Distinguish a default match from a user override: a
                    # default match carries the default MatchResult below.
                    default_movement, default_result = default_move_match_detailed(exercise_name)
                    if default_movement is not None and default_movement.name == movement.name:
                        return (movement, default_result)
        except Exception as e:
            print(f"Error checking exercise overrides: {e}")
            movement = None

        if movement is not None:
            return (movement, MatchResult(movement.name, movement.unilateral, score=100))

    return default_move_match_detailed(exercise_name)


def get_exercise_pattern(exercise_name: str, user_id: Optional[str] = None) -> dict:
    """
    Get pattern information for an exercise (for API responses)

    Args:
        exercise_name: Exercise name
        user_id: Optional user ID for override checking

    Returns:
        Dictionary with pattern info:
        - recognized: bool
        - pattern: str | None
        - pattern_name: str | None
        - targets: dict | None
        - unilateral: bool
        - confidence: str (high, medium, low, or unknown)
        - source: str (user_override or default)
    """
    # Check for user override first
    source = "default"
    if user_id:
        try:
            supabase = get_supabase_client()
            normalized_name = exercise_name.lower().strip()

            result = supabase.table("exercise_overrides").select("pattern_override").eq(
                "user_id", user_id
            ).ilike("exercise_name", normalized_name).limit(1).execute()

            if result.data and len(result.data) > 0:
                source = "user_override"

        except Exception:
            pass

    movement = move_match_with_overrides(exercise_name, user_id)

    if not movement:
        return {
            "recognized": False,
            "pattern": None,
            "pattern_name": None,
            "targets": None,
            "unilateral": False,
            "confidence": "unknown",
            "source": source,
        }

    # Determine confidence based on source
    confidence = "high" if source == "user_override" else "medium"

    return {
        "recognized": True,
        "pattern": movement.name,
        "pattern_name": movement.name.title(),
        "targets": movement.targets,
        "unilateral": movement.unilateral,
        "confidence": confidence,
        "source": source,
    }
