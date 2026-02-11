"""
Split management routes
Handles CRUD operations for training splits
"""

from typing import List
from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client_with_token
from schemas.splits import (
    SplitCreate,
    SplitUpdate,
    SplitResponse,
    SplitListResponse,
    SessionResponse,
    ExerciseResponse,
)
from schemas.auth import ErrorResponse
from api.dependencies import get_current_user, AuthUser
from core.movementMatching import move_match

router = APIRouter(prefix="/api/splits", tags=["Splits"])


# ============================================================================
# Helper Functions
# ============================================================================

def validate_exercises(exercises: List[dict]) -> List[str]:
    """
    Validate that all exercises can be classified

    Args:
        exercises: List of exercise dicts with 'name' key

    Returns:
        List of unrecognized exercise names (empty if all valid)
    """
    unrecognized = []
    for exercise in exercises:
        name = exercise["name"]
        result = move_match(name)
        # move_match returns a Movement object if recognized, None otherwise
        if result is None:
            print(f"[DEBUG] Unrecognized exercise: '{name}'")
            unrecognized.append(name)
        else:
            print(f"[DEBUG] Exercise '{name}' -> pattern '{result.name}'")
    return unrecognized


def _detach_completed_session(supabase, program_session_id: str, template_id: str):
    """
    Freeze a completed program session by copying its template exercises
    into program_session_exercises and unlinking the template.

    Idempotent: skips if session already has program_session_exercises.
    """
    # Check if already detached (has override exercises)
    existing = supabase.table("program_session_exercises").select("id").eq(
        "program_session_id", program_session_id
    ).limit(1).execute()

    if existing.data:
        # Already has exercises — just unlink template_id
        supabase.table("program_sessions").update(
            {"template_id": None}
        ).eq("id", program_session_id).execute()
        return

    # Copy current template exercises into program_session_exercises
    tex = supabase.table("session_template_exercises").select("*").eq(
        "template_id", template_id
    ).order("order_index").execute()

    if tex.data:
        rows = [
            {
                "program_session_id": program_session_id,
                "exercise_name": ex["exercise_name"],
                "sets": ex["sets"],
                "order_index": ex["order_index"],
                "unilateral": ex.get("unilateral", False),
                "resistance_profile": ex.get("resistance_profile"),
            }
            for ex in tex.data
        ]
        supabase.table("program_session_exercises").insert(rows).execute()

    # Unlink template
    supabase.table("program_sessions").update(
        {"template_id": None}
    ).eq("id", program_session_id).execute()


def sync_linked_templates(supabase, split_id: str, new_sessions: List[dict]) -> dict:
    """
    After a split is replaced, cascade exercise changes to all linked
    session templates. Completed program sessions are detached first so
    their exercises are frozen.

    Args:
        supabase: Authenticated Supabase client
        split_id: The split that was just saved
        new_sessions: List of dicts with keys: id, name, exercises
            where exercises is a list of dicts from the exercises table

    Returns:
        Stats dict with templates_updated, sessions_detached, errors
    """
    stats = {"templates_updated": 0, "sessions_detached": 0, "errors": []}

    # Find all templates linked to this split
    templates_result = supabase.table("session_templates").select(
        "id, name, source_session_id"
    ).eq("source_split_id", split_id).execute()

    if not templates_result.data:
        return stats

    # Build name → new session lookup
    session_by_name = {}
    for s in new_sessions:
        session_by_name[s["name"]] = s

    for template in templates_result.data:
        template_id = template["id"]
        template_name = template["name"]

        try:
            # Match template to new session by name
            matched_session = session_by_name.get(template_name)
            if not matched_session:
                # Session was renamed or removed — skip this template
                continue

            # Find completed program_sessions referencing this template
            completed = supabase.table("program_sessions").select("id").eq(
                "template_id", template_id
            ).eq("status", "completed").execute()

            for ps in (completed.data or []):
                try:
                    _detach_completed_session(supabase, ps["id"], template_id)
                    stats["sessions_detached"] += 1
                except Exception as detach_err:
                    stats["errors"].append(
                        f"Failed to detach session {ps['id']}: {str(detach_err)}"
                    )

            # Delete old template exercises
            supabase.table("session_template_exercises").delete().eq(
                "template_id", template_id
            ).execute()

            # Insert new exercises from matched session
            new_exercises = matched_session.get("exercises", [])
            if new_exercises:
                exercise_rows = [
                    {
                        "template_id": template_id,
                        "exercise_name": ex["exercise_name"],
                        "sets": ex["sets"],
                        "order_index": ex.get("order_index", idx),
                        "unilateral": ex.get("unilateral", False),
                        "resistance_profile": ex.get("resistance_profile"),
                    }
                    for idx, ex in enumerate(new_exercises)
                ]
                supabase.table("session_template_exercises").insert(
                    exercise_rows
                ).execute()

            # Update source_session_id to point to new session
            supabase.table("session_templates").update(
                {"source_session_id": matched_session["id"]}
            ).eq("id", template_id).execute()

            stats["templates_updated"] += 1

        except Exception as tmpl_err:
            stats["errors"].append(
                f"Failed to sync template {template_id} ({template_name}): {str(tmpl_err)}"
            )

    return stats


def build_split_response(split_data: dict, sessions_data: List[dict]) -> SplitResponse:
    """
    Build a complete SplitResponse from database records

    Args:
        split_data: Split record from database
        sessions_data: List of session records with exercises

    Returns:
        SplitResponse with all nested data
    """
    if split_data is None:
        raise ValueError("split_data cannot be None")

    sessions = []
    for session in sessions_data:
        if session is None:
            raise ValueError("session in sessions_data cannot be None")

        exercises = [
            ExerciseResponse(
                id=ex["id"],
                session_id=ex["session_id"],
                exercise_name=ex["exercise_name"],
                sets=ex["sets"],
                order_index=ex["order_index"],
                unilateral=ex.get("unilateral", False),
                resistance_profile=ex.get("resistance_profile"),
                created_at=ex["created_at"],
            )
            for ex in session.get("exercises", [])
            if ex is not None
        ]

        sessions.append(
            SessionResponse(
                id=session["id"],
                split_id=session["split_id"],
                name=session["name"],
                day_number=session["day_number"],
                exercises=exercises,
                created_at=session["created_at"],
                updated_at=session["updated_at"],
            )
        )

    return SplitResponse(
        id=split_data["id"],
        user_id=split_data["user_id"],
        name=split_data["name"],
        cycle_length=split_data.get("cycle_length"),
        stimulus_duration=split_data["stimulus_duration"],
        maintenance_volume=split_data["maintenance_volume"],
        dataset=split_data["dataset"],
        sessions=sessions,
        created_at=split_data["created_at"],
        updated_at=split_data["updated_at"],
    )


# ============================================================================
# Split CRUD Endpoints
# ============================================================================

@router.post(
    "",
    response_model=SplitResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid data or unrecognized exercises"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        500: {"model": ErrorResponse, "description": "Server error"},
    },
    summary="Create a new split",
    description="Create a new training split with sessions and exercises",
)
async def create_split(
    split: SplitCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Create a new training split

    - Validates all exercises are recognized
    - Creates split, sessions, and exercises in database
    - Returns complete split with all IDs
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Validate all exercises across all sessions
        all_exercises = []
        for session in split.sessions:
            for exercise in session.exercises:
                all_exercises.append({"name": exercise.name})

        unrecognized = validate_exercises(all_exercises)
        if unrecognized:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Some exercises could not be recognized",
                    "unrecognized_exercises": unrecognized,
                    "hint": "Check spelling or use /api/parse-exercise to verify exercise names"
                },
            )

        # Insert split
        split_insert_data = {
            "user_id": current_user.id,
            "name": split.name,
            "stimulus_duration": split.stimulus_duration,
            "maintenance_volume": split.maintenance_volume,
            "dataset": split.dataset,
        }
        if split.cycle_length is not None:
            split_insert_data["cycle_length"] = split.cycle_length
        split_result = supabase.table("splits").insert(split_insert_data).execute()

        if not split_result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create split: no data returned from database",
            )

        split_record = split_result.data[0]
        split_id = split_record["id"]

        # Batch insert all sessions at once
        session_rows = [
            {"split_id": split_id, "name": s.name, "day_number": s.day_number}
            for s in split.sessions
        ]
        sessions_result = supabase.table("sessions").insert(session_rows).execute()

        if not sessions_result.data or len(sessions_result.data) != len(split.sessions):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create sessions",
            )

        # Build exercise rows for batch insert, mapping to returned session IDs
        # Sessions come back in insert order
        exercise_rows = []
        for session_idx, session in enumerate(split.sessions):
            session_id = sessions_result.data[session_idx]["id"]
            for ex_idx, exercise in enumerate(session.exercises):
                exercise_rows.append({
                    "session_id": session_id,
                    "exercise_name": exercise.name,
                    "sets": exercise.sets,
                    "order_index": ex_idx,
                    "unilateral": exercise.unilateral,
                    "resistance_profile": exercise.resistance_profile,
                })

        # Batch insert all exercises at once
        exercises_result = supabase.table("exercises").insert(exercise_rows).execute() if exercise_rows else None

        # Build response by mapping exercises back to their sessions
        exercise_map = {}  # session_id -> [exercise_records]
        if exercises_result and exercises_result.data:
            for ex in exercises_result.data:
                sid = ex["session_id"]
                if sid not in exercise_map:
                    exercise_map[sid] = []
                exercise_map[sid].append(ex)

        sessions_data = []
        for session_record in sessions_result.data:
            sd = dict(session_record)
            sd["exercises"] = exercise_map.get(session_record["id"], [])
            sessions_data.append(sd)

        return build_split_response(split_record, sessions_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create split: {str(e)}",
        )


@router.get(
    "",
    response_model=SplitListResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
    summary="List all splits",
    description="Get all splits for the authenticated user",
)
async def list_splits(
    current_user: AuthUser = Depends(get_current_user),
):
    """
    List all splits for the current user

    Returns splits with their sessions and exercises
    """
    try:
        # Use client with user's token for proper RLS enforcement
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Single nested query - fetches splits, sessions, and exercises in one request
        splits_result = supabase.table("splits").select(
            "*, sessions(*, exercises(*))"
        ).order("created_at", desc=True).execute()

        if not splits_result.data:
            return SplitListResponse(splits=[], total=0)

        # Process nested data: sort sessions by day_number and exercises by order_index
        splits = []
        for split_data in splits_result.data:
            sessions_data = split_data.pop("sessions", []) or []
            # Sort sessions by day_number
            sessions_data.sort(key=lambda s: s.get("day_number", 0))
            # Sort exercises within each session by order_index
            for session in sessions_data:
                exercises = session.get("exercises", []) or []
                exercises.sort(key=lambda e: e.get("order_index", 0))
                session["exercises"] = exercises

            splits.append(build_split_response(split_data, sessions_data))

        return SplitListResponse(splits=splits, total=len(splits))

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch splits: {str(e)}",
        )


@router.get(
    "/{split_id}",
    response_model=SplitResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Split not found"},
    },
    summary="Get a specific split",
    description="Get details of a specific split by ID",
)
async def get_split(
    split_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Get a specific split by ID

    Returns split with all sessions and exercises
    """
    try:
        # Use client with user's token for proper RLS enforcement
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Single nested query - fetches split, sessions, and exercises in one request
        split_result = supabase.table("splits").select(
            "*, sessions(*, exercises(*))"
        ).eq("id", split_id).execute()

        if not split_result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Split not found",
            )

        split_data = split_result.data[0]

        # Extract and sort nested sessions/exercises
        sessions_data = split_data.pop("sessions", []) or []
        sessions_data.sort(key=lambda s: s.get("day_number", 0))
        for session in sessions_data:
            exercises = session.get("exercises", []) or []
            exercises.sort(key=lambda e: e.get("order_index", 0))
            session["exercises"] = exercises

        return build_split_response(split_data, sessions_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch split: {str(e)}",
        )


@router.put(
    "/{split_id}",
    response_model=SplitResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Split not found"},
    },
    summary="Update a split",
    description="Update split metadata (name, settings). To modify sessions/exercises, delete and recreate.",
)
async def update_split(
    split_id: str,
    split_update: SplitUpdate,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Update split metadata

    Currently supports updating:
    - name
    - stimulus_duration
    - maintenance_volume
    - dataset

    To modify sessions/exercises, delete the split and create a new one.
    """
    try:
        # Use client with user's token for proper RLS enforcement
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Build update dict (only include provided fields)
        update_data = {}
        if split_update.name is not None:
            update_data["name"] = split_update.name
        if split_update.cycle_length is not None:
            update_data["cycle_length"] = split_update.cycle_length
        if split_update.stimulus_duration is not None:
            update_data["stimulus_duration"] = split_update.stimulus_duration
        if split_update.maintenance_volume is not None:
            update_data["maintenance_volume"] = split_update.maintenance_volume
        if split_update.dataset is not None:
            update_data["dataset"] = split_update.dataset

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update",
            )

        # Update split (RLS ensures user can only update their own)
        result = supabase.table("splits").update(update_data).eq(
            "id", split_id
        ).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Split not found",
            )

        # Fetch complete split to return
        return await get_split(split_id, current_user)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update split: {str(e)}",
        )


@router.put(
    "/{split_id}/full",
    response_model=SplitResponse,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid data or unrecognized exercises"},
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Split not found"},
    },
    summary="Replace a split completely",
    description="Replace a split's metadata, sessions, and exercises entirely",
)
async def replace_split(
    split_id: str,
    split: SplitCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Replace a split entirely with new data

    This will:
    1. Update split metadata
    2. Delete all existing sessions and exercises
    3. Create new sessions and exercises from the request
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Verify split exists and belongs to user
        existing = supabase.table("splits").select("id").eq("id", split_id).execute()
        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Split not found",
            )

        # Validate all exercises
        all_exercises = []
        for session in split.sessions:
            for exercise in session.exercises:
                all_exercises.append({"name": exercise.name})

        unrecognized = validate_exercises(all_exercises)
        if unrecognized:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unrecognized exercises: {', '.join(unrecognized)}. "
                       f"Use /api/parse-exercise to check exercise names.",
            )

        # Update split metadata (always include cycle_length so null can clear old values)
        split_update_data = {
            "name": split.name,
            "cycle_length": split.cycle_length,
            "stimulus_duration": split.stimulus_duration,
            "maintenance_volume": split.maintenance_volume,
            "dataset": split.dataset,
        }
        supabase.table("splits").update(split_update_data).eq("id", split_id).execute()

        # Delete existing sessions (exercises cascade delete)
        supabase.table("sessions").delete().eq("split_id", split_id).execute()

        # Batch insert all sessions at once
        session_rows = [
            {"split_id": split_id, "name": s.name, "day_number": s.day_number}
            for s in split.sessions
        ]
        sessions_result = supabase.table("sessions").insert(session_rows).execute()

        if not sessions_result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create sessions",
            )

        # Batch insert all exercises at once
        exercise_rows = []
        for session_idx, session in enumerate(split.sessions):
            session_id = sessions_result.data[session_idx]["id"]
            for ex_idx, exercise in enumerate(session.exercises):
                exercise_rows.append({
                    "session_id": session_id,
                    "exercise_name": exercise.name,
                    "sets": exercise.sets,
                    "order_index": ex_idx,
                    "unilateral": exercise.unilateral,
                    "resistance_profile": exercise.resistance_profile,
                })

        exercises_result = supabase.table("exercises").insert(exercise_rows).execute() if exercise_rows else None

        # Map exercises back to sessions
        exercise_map = {}
        if exercises_result and exercises_result.data:
            for ex in exercises_result.data:
                sid = ex["session_id"]
                if sid not in exercise_map:
                    exercise_map[sid] = []
                exercise_map[sid].append(ex)

        sessions_data = []
        for session_record in sessions_result.data:
            sd = dict(session_record)
            sd["exercises"] = exercise_map.get(session_record["id"], [])
            sessions_data.append(sd)

        # Cascade exercise changes to linked session templates
        try:
            sessions_with_exercises = [
                {
                    "id": sessions_result.data[idx]["id"],
                    "name": sessions_result.data[idx]["name"],
                    "exercises": exercise_map.get(sessions_result.data[idx]["id"], []),
                }
                for idx in range(len(sessions_result.data))
            ]
            sync_stats = sync_linked_templates(supabase, split_id, sessions_with_exercises)
            if sync_stats["errors"]:
                print(f"[WARN] Template sync had errors: {sync_stats['errors']}")
            if sync_stats["templates_updated"] > 0:
                print(f"[INFO] Synced {sync_stats['templates_updated']} template(s), "
                      f"detached {sync_stats['sessions_detached']} completed session(s)")
        except Exception as sync_err:
            # Sync failure should NOT fail the split save
            print(f"[WARN] Template sync failed (non-fatal): {str(sync_err)}")

        # Get updated split record
        split_result = supabase.table("splits").select("*").eq("id", split_id).execute()
        return build_split_response(split_result.data[0], sessions_data)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to replace split: {str(e)}",
        )


@router.delete(
    "/{split_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Split not found"},
    },
    summary="Delete a split",
    description="Delete a split and all its sessions/exercises (cascade delete)",
)
async def delete_split(
    split_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Delete a split

    This will also delete all associated sessions and exercises (cascade)
    """
    try:
        # Use client with user's token for proper RLS enforcement
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Delete split (RLS ensures user can only delete their own)
        # Sessions and exercises will be cascade deleted
        result = supabase.table("splits").delete().eq("id", split_id).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Split not found",
            )

        return None

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete split: {str(e)}",
        )


@router.post(
    "/{split_id}/analyze",
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        404: {"model": ErrorResponse, "description": "Split not found"},
    },
    summary="Analyze a saved split",
    description="Run the stimulus analysis on a saved split",
)
async def analyze_split(
    split_id: str,
    include_breakdowns: bool = False,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Analyze a saved split using the stimulus algorithm

    This converts the saved split to the format expected by the analysis engine
    and returns optimization suggestions
    """
    try:
        # Get the split
        split = await get_split(split_id, current_user)

        # Convert to analysis format (using correct model names)
        from schemas.models import SplitRequest, SessionInput, ExerciseInput
        from api.analysis_routes import analyze_split as run_analysis

        # Build sessions for analysis
        analysis_sessions = []
        for session in split.sessions:
            exercises = [
                ExerciseInput(
                    name=ex.exercise_name,
                    sets=ex.sets,
                    unilateral=ex.unilateral,
                    resistance_profile=ex.resistance_profile,
                )
                for ex in session.exercises
            ]
            analysis_sessions.append(
                SessionInput(
                    name=session.name,
                    day=session.day_number,
                    exercises=exercises,
                )
            )

        # Build split request
        split_request = SplitRequest(
            name=split.name,
            sessions=analysis_sessions,
            cycle_length=split.cycle_length,
            stimulus_duration=split.stimulus_duration,
            maintenance_volume=split.maintenance_volume,
            dataset=split.dataset,
            include_breakdowns=include_breakdowns,
        )

        # Run analysis using existing endpoint logic
        return await run_analysis(split_request)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze split: {str(e)}",
        )
