"""
Workout logging routes
Handles logging completed workouts and viewing history
"""

from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, status, Query
from db.supabase import get_supabase_client_with_token
from schemas.workouts import (
    WorkoutLogCreate,
    WorkoutLogResponse,
    WorkoutHistoryResponse,
    WorkoutStatsResponse,
    WorkoutExerciseResponse,
)
from schemas.auth import ErrorResponse
from api.dependencies import get_current_user, AuthUser

router = APIRouter(prefix="/api/workouts", tags=["Workouts"])


# ============================================================================
# Helper Functions
# ============================================================================

def build_workout_response(workout_data: dict, exercises_data: list) -> WorkoutLogResponse:
    """
    Build a complete WorkoutLogResponse from database records

    Args:
        workout_data: Workout log record from database
        exercises_data: List of workout exercise records

    Returns:
        WorkoutLogResponse with all nested data
    """
    exercises = [
        WorkoutExerciseResponse(
            id=ex["id"],
            workout_log_id=ex["workout_log_id"],
            exercise_name=ex["exercise_name"],
            sets_completed=ex["sets_completed"],
            reps=ex["reps"],
            weight=ex["weight"],
            order_index=ex["order_index"],
            notes=ex.get("notes"),
            rir=ex.get("rir"),
            created_at=ex["created_at"],
        )
        for ex in exercises_data
    ]

    return WorkoutLogResponse(
        id=workout_data["id"],
        user_id=workout_data["user_id"],
        session_id=workout_data.get("session_id"),
        split_id=workout_data.get("split_id"),
        session_name=workout_data["session_name"],
        completed_at=workout_data["completed_at"],
        duration_minutes=workout_data.get("duration_minutes"),
        notes=workout_data.get("notes"),
        exercises=exercises,
        created_at=workout_data["created_at"],
    )


# ============================================================================
# Workout Logging Endpoints
# ============================================================================

@router.post(
    "",
    response_model=WorkoutLogResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid workout data"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        500: {"model": ErrorResponse, "description": "Server error"},
    },
    summary="Log a completed workout",
    description="Record a completed workout with exercises, sets, reps, and weights",
)
async def log_workout(
    workout: WorkoutLogCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Log a completed workout

    - Records all exercise data (sets, reps, weights)
    - Optionally links to a planned session
    - Supports notes at both workout and exercise level
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Validate exercise data consistency
        for exercise in workout.exercises:
            if len(exercise.reps) != exercise.sets_completed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Exercise '{exercise.exercise_name}': reps array length "
                           f"({len(exercise.reps)}) must match sets_completed ({exercise.sets_completed})",
                )
            if len(exercise.weight) != exercise.sets_completed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Exercise '{exercise.exercise_name}': weight array length "
                           f"({len(exercise.weight)}) must match sets_completed ({exercise.sets_completed})",
                )
            if exercise.rir is not None and len(exercise.rir) != exercise.sets_completed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Exercise '{exercise.exercise_name}': rir array length "
                           f"({len(exercise.rir)}) must match sets_completed ({exercise.sets_completed})",
                )

        # Use provided completed_at or default to now
        completed_at = workout.completed_at or datetime.utcnow()

        # Insert workout log
        workout_data = {
            "user_id": current_user.id,
            "session_name": workout.session_name,
            "completed_at": completed_at.isoformat(),
        }

        # Validate session_id FK before inserting — the session may have been
        # deleted/recreated if the user replaced exercises mid-workout
        session_id = workout.session_id
        if session_id:
            session_check = supabase.table("sessions").select("id").eq(
                "id", session_id
            ).execute()
            if session_check.data:
                workout_data["session_id"] = session_id

        if workout.split_id:
            workout_data["split_id"] = workout.split_id
        if workout.duration_minutes:
            workout_data["duration_minutes"] = workout.duration_minutes
        if workout.notes:
            workout_data["notes"] = workout.notes

        workout_result = supabase.table("workout_logs").insert(workout_data).execute()

        if not workout_result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create workout log",
            )

        workout_log_id = workout_result.data[0]["id"]
        exercises_data = []

        # Insert workout exercises
        for idx, exercise in enumerate(workout.exercises):
            exercise_data = {
                "workout_log_id": workout_log_id,
                "exercise_name": exercise.exercise_name,
                "sets_completed": exercise.sets_completed,
                "reps": exercise.reps,
                "weight": exercise.weight,
                "order_index": idx,
            }

            if exercise.notes:
                exercise_data["notes"] = exercise.notes
            if exercise.rir is not None:
                exercise_data["rir"] = exercise.rir

            exercise_result = supabase.table("workout_exercises").insert(
                exercise_data
            ).execute()

            if exercise_result.data:
                exercises_data.append(exercise_result.data[0])

        # If linked to a program session, mark it completed
        if workout.program_session_id:
            try:
                auth_supabase = get_supabase_client_with_token(current_user.access_token)
                auth_supabase.table("program_sessions").update({
                    "workout_log_id": workout_log_id,
                    "status": "completed",
                }).eq("id", workout.program_session_id).eq("status", "planned").execute()
            except Exception:
                pass  # Non-critical — workout is already saved

        # Build and return response
        return build_workout_response(workout_result.data[0], exercises_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to log workout: {str(e)}",
        )


@router.get(
    "",
    response_model=WorkoutHistoryResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
    summary="Get workout history",
    description="Get all logged workouts for the authenticated user",
)
async def get_workout_history(
    current_user: AuthUser = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=500, description="Number of workouts to return"),
    offset: int = Query(0, ge=0, description="Number of workouts to skip"),
    days: Optional[int] = Query(None, ge=1, description="Filter to last N days"),
):
    """
    Get workout history

    - Returns workouts in reverse chronological order
    - Supports pagination via limit/offset
    - Can filter to recent workouts via days parameter
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Build query
        query = supabase.table("workout_logs").select("*").eq(
            "user_id", current_user.id
        )

        # Filter by date if specified
        if days:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            query = query.gte("completed_at", cutoff_date.isoformat())

        # Execute with pagination
        result = query.order("completed_at", desc=True).range(
            offset, offset + limit - 1
        ).execute()

        if not result.data:
            return WorkoutHistoryResponse(workouts=[], total=0)

        # Batch-fetch all exercises for returned workouts (avoids N+1 queries)
        workout_ids = [w["id"] for w in result.data]
        exercises_result = supabase.table("workout_exercises").select("*").in_(
            "workout_log_id", workout_ids
        ).order("order_index").execute()

        # Group exercises by workout_log_id
        exercises_by_workout: dict[str, list] = {}
        for ex in (exercises_result.data or []):
            wid = ex["workout_log_id"]
            if wid not in exercises_by_workout:
                exercises_by_workout[wid] = []
            exercises_by_workout[wid].append(ex)

        workouts = []
        for workout_data in result.data:
            exercises_data = exercises_by_workout.get(workout_data["id"], [])
            workouts.append(build_workout_response(workout_data, exercises_data))

        # Get total count (for pagination)
        count_query = supabase.table("workout_logs").select(
            "id", count="exact"
        ).eq("user_id", current_user.id)

        if days:
            count_query = count_query.gte("completed_at", cutoff_date.isoformat())

        count_result = count_query.execute()
        total = count_result.count if count_result.count else len(workouts)

        return WorkoutHistoryResponse(workouts=workouts, total=total)

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch workout history: {str(e)}",
        )


@router.delete(
    "/exercises/by-name/{exercise_name}",
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
    summary="Clear exercise history",
    description="Delete all past workout_exercises rows for a specific exercise name",
)
async def clear_exercise_history(
    exercise_name: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Delete all logged data for a specific exercise across all workouts.
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Get user's workout IDs
        logs = supabase.table("workout_logs").select("id").eq(
            "user_id", current_user.id
        ).execute()

        if not logs.data:
            return {"deleted_count": 0}

        log_ids = [w["id"] for w in logs.data]

        # Delete matching exercises (case-insensitive)
        result = supabase.table("workout_exercises").delete() \
            .in_("workout_log_id", log_ids) \
            .ilike("exercise_name", exercise_name) \
            .execute()

        return {"deleted_count": len(result.data) if result.data else 0}

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear exercise history: {str(e)}",
        )


@router.put(
    "/{workout_id}",
    response_model=WorkoutLogResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid workout data"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Workout not found"},
    },
    summary="Update a logged workout",
    description="Replace exercises in a logged workout (does NOT update split template)",
)
async def update_workout(
    workout_id: str,
    workout: WorkoutLogCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Update a logged workout's exercises.
    Deletes existing exercises and replaces with the provided list.
    This only mutates the logged record — it does NOT touch the split template.
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Verify workout belongs to user
        existing = supabase.table("workout_logs").select("id").eq(
            "id", workout_id
        ).eq("user_id", current_user.id).execute()

        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workout not found",
            )

        # Validate exercise data
        for exercise in workout.exercises:
            if len(exercise.reps) != exercise.sets_completed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Exercise '{exercise.exercise_name}': reps length mismatch",
                )
            if len(exercise.weight) != exercise.sets_completed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Exercise '{exercise.exercise_name}': weight length mismatch",
                )
            if exercise.rir is not None and len(exercise.rir) != exercise.sets_completed:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Exercise '{exercise.exercise_name}': rir length mismatch",
                )

        # Update workout log metadata
        update_data = {"session_name": workout.session_name}
        if workout.completed_at:
            update_data["completed_at"] = workout.completed_at.isoformat()
        if workout.duration_minutes is not None:
            update_data["duration_minutes"] = workout.duration_minutes
        update_data["notes"] = workout.notes

        supabase.table("workout_logs").update(update_data).eq("id", workout_id).execute()

        # Delete old exercises
        supabase.table("workout_exercises").delete().eq(
            "workout_log_id", workout_id
        ).execute()

        # Insert new exercises
        exercises_data = []
        for idx, exercise in enumerate(workout.exercises):
            exercise_data = {
                "workout_log_id": workout_id,
                "exercise_name": exercise.exercise_name,
                "sets_completed": exercise.sets_completed,
                "reps": exercise.reps,
                "weight": exercise.weight,
                "order_index": idx,
            }
            if exercise.notes:
                exercise_data["notes"] = exercise.notes
            if exercise.rir is not None:
                exercise_data["rir"] = exercise.rir

            result = supabase.table("workout_exercises").insert(exercise_data).execute()
            if result.data:
                exercises_data.append(result.data[0])

        # Fetch updated workout
        workout_result = supabase.table("workout_logs").select("*").eq(
            "id", workout_id
        ).execute()

        return build_workout_response(workout_result.data[0], exercises_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update workout: {str(e)}",
        )


@router.get(
    "/{workout_id}",
    response_model=WorkoutLogResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Workout not found"},
    },
    summary="Get a specific workout",
    description="Get details of a specific workout by ID",
)
async def get_workout(
    workout_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Get a specific workout by ID

    Returns workout with all exercise details
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Get workout log (app-level user_id check + RLS)
        workout_result = supabase.table("workout_logs").select("*").eq(
            "id", workout_id
        ).eq("user_id", current_user.id).execute()

        if not workout_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workout not found",
            )

        workout_data = workout_result.data[0]

        # Get exercises
        exercises_result = supabase.table("workout_exercises").select("*").eq(
            "workout_log_id", workout_id
        ).order("order_index").execute()

        exercises_data = exercises_result.data or []

        return build_workout_response(workout_data, exercises_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch workout: {str(e)}",
        )


@router.get(
    "/stats/summary",
    response_model=WorkoutStatsResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
    summary="Get workout statistics",
    description="Get aggregate statistics and progress metrics",
)
async def get_workout_stats(
    current_user: AuthUser = Depends(get_current_user),
    days: Optional[int] = Query(None, ge=1, description="Calculate stats for last N days"),
):
    """
    Get workout statistics

    - Total workouts logged
    - Total sets completed
    - Total volume (sets × reps × weight)
    - Average workout duration
    - Most frequent exercises
    - Last workout date
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Build query
        query = supabase.table("workout_logs").select("*").eq(
            "user_id", current_user.id
        )

        # Filter by date if specified
        if days:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            query = query.gte("completed_at", cutoff_date.isoformat())

        workouts_result = query.execute()

        if not workouts_result.data:
            return WorkoutStatsResponse(
                total_workouts=0,
                total_sets=0,
                total_volume_pounds=0.0,
                average_duration_minutes=None,
                most_frequent_exercises=[],
                last_workout_date=None,
            )

        workout_ids = [w["id"] for w in workouts_result.data]

        # Get all exercises for these workouts
        exercises_result = supabase.table("workout_exercises").select("*").in_(
            "workout_log_id", workout_ids
        ).execute()

        exercises_data = exercises_result.data or []

        # Calculate statistics
        total_workouts = len(workouts_result.data)
        total_sets = sum(ex["sets_completed"] for ex in exercises_data)

        # Calculate total volume
        total_volume = 0.0
        exercise_counts = {}

        for ex in exercises_data:
            # Volume = sum of (reps × weight) for each set
            for reps, weight in zip(ex["reps"], ex["weight"]):
                total_volume += reps * weight

            # Count exercise frequency
            exercise_name = ex["exercise_name"]
            exercise_counts[exercise_name] = exercise_counts.get(exercise_name, 0) + 1

        # Calculate average duration
        durations = [
            w["duration_minutes"]
            for w in workouts_result.data
            if w.get("duration_minutes")
        ]
        avg_duration = sum(durations) / len(durations) if durations else None

        # Get most frequent exercises
        most_frequent = sorted(
            [{"exercise": name, "count": count} for name, count in exercise_counts.items()],
            key=lambda x: x["count"],
            reverse=True,
        )[:10]  # Top 10

        # Get last workout date
        last_workout = max(
            workouts_result.data, key=lambda w: w["completed_at"]
        )["completed_at"]

        return WorkoutStatsResponse(
            total_workouts=total_workouts,
            total_sets=total_sets,
            total_volume_pounds=total_volume,
            average_duration_minutes=avg_duration,
            most_frequent_exercises=most_frequent,
            last_workout_date=last_workout,
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to calculate stats: {str(e)}",
        )


@router.delete(
    "/{workout_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Workout not found"},
    },
    summary="Delete a workout",
    description="Delete a logged workout (cascade deletes exercises)",
)
async def delete_workout(
    workout_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Delete a workout log

    This will also delete all associated exercises (cascade)
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Delete workout (app-level user_id check + RLS)
        result = supabase.table("workout_logs").delete().eq(
            "id", workout_id
        ).eq("user_id", current_user.id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workout not found",
            )

        return None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete workout: {str(e)}",
        )
