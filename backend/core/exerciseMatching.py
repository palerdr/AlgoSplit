"""
Exercise matching with user-specific overrides and custom exercises
Wrapper around movementMatching that supports database-backed user overrides
"""

from typing import Optional, Dict, Tuple, Any
from core.movementMatching import move_match as default_move_match, Movement
from core.granular_patterns import GRANULAR_PATTERNS
from db.supabase import get_supabase_client


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
            return result.data[0]

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


def move_match_with_overrides(exercise_name: str, user_id: Optional[str] = None) -> Optional[Movement]:
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
    # If user_id provided, check for custom exercise first, then overrides
    if user_id:
        # 1. Check for custom exercise (highest priority)
        custom = _get_custom_exercise(exercise_name, user_id)
        if custom:
            return _build_movement_from_custom(custom, exercise_name)

        # 2. Check for pattern override
        try:
            supabase = get_supabase_client()

            # Normalize exercise name for matching (lowercase, strip whitespace)
            normalized_name = exercise_name.lower().strip()

            # Query for user override
            result = supabase.table("exercise_overrides").select("pattern_override").eq(
                "user_id", user_id
            ).ilike("exercise_name", normalized_name).limit(1).execute()

            if result.data and len(result.data) > 0:
                pattern_override = result.data[0]["pattern_override"]

                # Verify pattern exists
                if pattern_override in GRANULAR_PATTERNS:
                    targets = GRANULAR_PATTERNS[pattern_override]

                    # Detect if it's unilateral (could be enhanced)
                    is_unilateral = any(
                        word in normalized_name
                        for word in ["single", "one", "unilateral", "dumbbell", "db"]
                    )

                    return Movement(
                        pattern_override,
                        targets,
                        resistance_profile=None,
                        is_unilateral=is_unilateral,
                    )

        except Exception as e:
            # If database query fails, fall back to default matching
            # Log error in production
            print(f"Error checking exercise overrides: {e}")
            pass

    # 3. Fall back to default pattern matching
    return default_move_match(exercise_name)


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
