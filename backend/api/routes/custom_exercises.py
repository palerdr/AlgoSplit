"""
Custom Exercises API Routes

CRUD endpoints for user-defined custom exercises with full muscle targeting control.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional

from schemas.overrides import (
    CustomExerciseCreate,
    CustomExerciseUpdate,
    CustomExerciseResponse,
    CustomExerciseListResponse,
)
from api.dependencies import get_current_user, AuthUser
from db.supabase import get_supabase_client_with_token
from core.muscle_regions import get_all_muscle_regions

router = APIRouter(prefix="/api/custom-exercises", tags=["custom-exercises"])


def _validate_muscle_ids(targets: dict) -> None:
    """Validate that all muscle IDs in targets are from the 29-region model."""
    valid_ids = set(get_all_muscle_regions().keys())
    for muscle_id in targets.keys():
        if muscle_id not in valid_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid muscle region: '{muscle_id}'. See GET /api/muscle-regions for valid IDs."
            )


def _build_response(row: dict) -> CustomExerciseResponse:
    """Build CustomExerciseResponse from database row."""
    return CustomExerciseResponse(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        exercise_name=row["exercise_name"],
        prime_targets=row.get("prime_targets") or {},
        secondary_targets=row.get("secondary_targets") or {},
        tertiary_targets=row.get("tertiary_targets") or {},
        quaternary_targets=row.get("quaternary_targets") or {},
        axial_load=float(row.get("axial_load", 0.0)),
        resistance_profile=row.get("resistance_profile", "mid"),
        is_bilateral=row.get("is_bilateral", True),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("", response_model=CustomExerciseListResponse)
async def list_custom_exercises(
    user: AuthUser = Depends(get_current_user),
):
    """List all custom exercises for the current user."""
    try:
        supabase = get_supabase_client_with_token(user.access_token)
        result = (
            supabase.table("custom_exercises")
            .select("*")
            .eq("user_id", user.id)
            .order("exercise_name")
            .execute()
        )

        exercises = [_build_response(row) for row in result.data]
        return CustomExerciseListResponse(exercises=exercises, total=len(exercises))
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] list_custom_exercises failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.post("", response_model=CustomExerciseResponse, status_code=201)
async def create_custom_exercise(
    data: CustomExerciseCreate,
    user: AuthUser = Depends(get_current_user),
):
    """
    Create a new custom exercise.

    All muscle weights must sum to 1.0 across all tiers.
    Muscle IDs must be valid (from the 29-region model).
    """
    # Validate muscle IDs
    _validate_muscle_ids(data.prime_targets)
    _validate_muscle_ids(data.secondary_targets)
    _validate_muscle_ids(data.tertiary_targets)
    _validate_muscle_ids(data.quaternary_targets)

    try:
        supabase = get_supabase_client_with_token(user.access_token)

        # Check for duplicate name
        existing = (
            supabase.table("custom_exercises")
            .select("id")
            .eq("user_id", user.id)
            .eq("exercise_name", data.exercise_name)
            .execute()
        )
        if existing.data:
            raise HTTPException(
                status_code=409,
                detail=f"Custom exercise '{data.exercise_name}' already exists"
            )

        # Insert
        insert_data = {
            "user_id": user.id,
            "exercise_name": data.exercise_name,
            "prime_targets": data.prime_targets,
            "secondary_targets": data.secondary_targets,
            "tertiary_targets": data.tertiary_targets,
            "quaternary_targets": data.quaternary_targets,
            "axial_load": data.axial_load,
            "resistance_profile": data.resistance_profile,
            "is_bilateral": data.is_bilateral,
        }

        result = supabase.table("custom_exercises").insert(insert_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create custom exercise - no data returned")

        return _build_response(result.data[0])

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] create_custom_exercise failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@router.get("/{exercise_id}", response_model=CustomExerciseResponse)
async def get_custom_exercise(
    exercise_id: str,
    user: AuthUser = Depends(get_current_user),
):
    """Get a specific custom exercise by ID."""
    supabase = get_supabase_client_with_token(user.access_token)
    result = (
        supabase.table("custom_exercises")
        .select("*")
        .eq("id", exercise_id)
        .eq("user_id", user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Custom exercise not found")

    return _build_response(result.data[0])


@router.put("/{exercise_id}", response_model=CustomExerciseResponse)
async def update_custom_exercise(
    exercise_id: str,
    data: CustomExerciseUpdate,
    user: AuthUser = Depends(get_current_user),
):
    """
    Update a custom exercise.

    If updating muscle targets, all weights must still sum to 1.0.
    """
    supabase = get_supabase_client_with_token(user.access_token)

    # Check exists
    existing = (
        supabase.table("custom_exercises")
        .select("*")
        .eq("id", exercise_id)
        .eq("user_id", user.id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Custom exercise not found")

    current = existing.data[0]

    # Build update dict
    update_data = {}
    if data.exercise_name is not None:
        # Check for duplicate name (if changing)
        if data.exercise_name != current["exercise_name"]:
            name_check = (
                supabase.table("custom_exercises")
                .select("id")
                .eq("user_id", user.id)
                .eq("exercise_name", data.exercise_name)
                .execute()
            )
            if name_check.data:
                raise HTTPException(
                    status_code=409,
                    detail=f"Custom exercise '{data.exercise_name}' already exists"
                )
        update_data["exercise_name"] = data.exercise_name

    # Handle target updates with validation
    targets_updated = False
    new_targets = {
        "prime_targets": data.prime_targets if data.prime_targets is not None else current.get("prime_targets", {}),
        "secondary_targets": data.secondary_targets if data.secondary_targets is not None else current.get("secondary_targets", {}),
        "tertiary_targets": data.tertiary_targets if data.tertiary_targets is not None else current.get("tertiary_targets", {}),
        "quaternary_targets": data.quaternary_targets if data.quaternary_targets is not None else current.get("quaternary_targets", {}),
    }

    if any([data.prime_targets, data.secondary_targets, data.tertiary_targets, data.quaternary_targets]):
        targets_updated = True
        # Validate muscle IDs
        for key, targets in new_targets.items():
            if targets:
                _validate_muscle_ids(targets)

        # Validate weights sum to 1.0
        total = sum(sum(t.values()) for t in new_targets.values() if t)
        if abs(total - 1.0) > 0.01:
            raise HTTPException(
                status_code=400,
                detail=f"All muscle weights must sum to 1.0, got {total:.3f}"
            )

        update_data.update(new_targets)

    if data.axial_load is not None:
        update_data["axial_load"] = data.axial_load
    if data.resistance_profile is not None:
        update_data["resistance_profile"] = data.resistance_profile
    if data.is_bilateral is not None:
        update_data["is_bilateral"] = data.is_bilateral

    if not update_data:
        return _build_response(current)

    result = (
        supabase.table("custom_exercises")
        .update(update_data)
        .eq("id", exercise_id)
        .eq("user_id", user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update custom exercise")

    return _build_response(result.data[0])


@router.delete("/{exercise_id}", status_code=204)
async def delete_custom_exercise(
    exercise_id: str,
    user: AuthUser = Depends(get_current_user),
):
    """Delete a custom exercise."""
    supabase = get_supabase_client_with_token(user.access_token)
    result = (
        supabase.table("custom_exercises")
        .delete()
        .eq("id", exercise_id)
        .eq("user_id", user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Custom exercise not found")

    return None
