"""
Exercise override routes
Allows users to correct exercise classifications
"""

from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client_with_token
from schemas.overrides import (
    ExerciseOverrideCreate,
    ExerciseOverrideResponse,
    ExerciseOverrideListResponse,
)
from schemas.auth import ErrorResponse
from api.dependencies import get_current_user, AuthUser
from core.granular_patterns import GRANULAR_PATTERNS

router = APIRouter(prefix="/api/exercise-overrides", tags=["Exercise Overrides"])


# ============================================================================
# Exercise Override Endpoints
# ============================================================================

@router.get(
    "",
    response_model=ExerciseOverrideListResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
    summary="List exercise overrides",
    description="Get all exercise overrides for the authenticated user",
)
async def list_overrides(
    current_user: AuthUser = Depends(get_current_user),
):
    """
    List all exercise overrides for the current user

    Returns all user-specific exercise pattern corrections
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Get all overrides for user
        result = supabase.table("exercise_overrides").select("*").eq(
            "user_id", current_user.id
        ).order("created_at", desc=True).execute()

        overrides = [
            ExerciseOverrideResponse(
                id=override["id"],
                user_id=override["user_id"],
                exercise_name=override["exercise_name"],
                pattern_override=override["pattern_override"],
                created_at=override["created_at"],
                updated_at=override["updated_at"],
            )
            for override in (result.data or [])
        ]

        return ExerciseOverrideListResponse(overrides=overrides, total=len(overrides))

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch overrides: {str(e)}",
        )


@router.post(
    "",
    response_model=ExerciseOverrideResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid pattern or duplicate override"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        409: {"model": ErrorResponse, "description": "Override already exists"},
        500: {"model": ErrorResponse, "description": "Server error"},
    },
    summary="Create exercise override",
    description="Add a correction for an exercise classification",
)
async def create_override(
    override: ExerciseOverrideCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Create an exercise override

    - Validates the pattern exists in GRANULAR_PATTERNS
    - Prevents duplicate overrides for the same exercise
    - Applies to all future uses of this exercise for this user
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Validate pattern exists
        if override.pattern_override not in GRANULAR_PATTERNS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid pattern '{override.pattern_override}'. "
                       f"Use GET /api/patterns to see available patterns.",
            )

        # Insert override (unique constraint will prevent duplicates)
        try:
            result = supabase.table("exercise_overrides").insert({
                "user_id": current_user.id,
                "exercise_name": override.exercise_name,
                "pattern_override": override.pattern_override,
            }).execute()

            if not result.data:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create override",
                )

            override_data = result.data[0]

            return ExerciseOverrideResponse(
                id=override_data["id"],
                user_id=override_data["user_id"],
                exercise_name=override_data["exercise_name"],
                pattern_override=override_data["pattern_override"],
                created_at=override_data["created_at"],
                updated_at=override_data["updated_at"],
            )

        except Exception as db_error:
            error_str = str(db_error).lower()
            if "unique" in error_str or "duplicate" in error_str:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Override already exists for exercise '{override.exercise_name}'",
                )
            raise

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create override: {str(e)}",
        )


@router.get(
    "/{override_id}",
    response_model=ExerciseOverrideResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Override not found"},
    },
    summary="Get specific override",
    description="Get details of a specific exercise override",
)
async def get_override(
    override_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Get a specific override by ID
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        result = supabase.table("exercise_overrides").select("*").eq(
            "id", override_id
        ).eq("user_id", current_user.id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Override not found",
            )

        override_data = result.data[0]

        return ExerciseOverrideResponse(
            id=override_data["id"],
            user_id=override_data["user_id"],
            exercise_name=override_data["exercise_name"],
            pattern_override=override_data["pattern_override"],
            created_at=override_data["created_at"],
            updated_at=override_data["updated_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch override: {str(e)}",
        )


@router.put(
    "/{override_id}",
    response_model=ExerciseOverrideResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid pattern"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Override not found"},
    },
    summary="Update exercise override",
    description="Update the pattern for an existing override",
)
async def update_override(
    override_id: str,
    pattern_override: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Update an exercise override

    Only the pattern can be updated (exercise name is immutable)
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Validate pattern exists
        if pattern_override not in GRANULAR_PATTERNS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid pattern '{pattern_override}'",
            )

        # Update override (app-level user_id check + RLS)
        result = supabase.table("exercise_overrides").update({
            "pattern_override": pattern_override,
        }).eq("id", override_id).eq("user_id", current_user.id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Override not found",
            )

        override_data = result.data[0]

        return ExerciseOverrideResponse(
            id=override_data["id"],
            user_id=override_data["user_id"],
            exercise_name=override_data["exercise_name"],
            pattern_override=override_data["pattern_override"],
            created_at=override_data["created_at"],
            updated_at=override_data["updated_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update override: {str(e)}",
        )


@router.delete(
    "/{override_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Override not found"},
    },
    summary="Delete exercise override",
    description="Remove an exercise override (reverts to default classification)",
)
async def delete_override(
    override_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Delete an exercise override

    After deletion, the exercise will use default classification
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Delete override (app-level user_id check + RLS)
        result = supabase.table("exercise_overrides").delete().eq(
            "id", override_id
        ).eq("user_id", current_user.id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Override not found",
            )

        return None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete override: {str(e)}",
        )
