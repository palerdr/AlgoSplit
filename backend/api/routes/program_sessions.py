"""
Program session (calendar) routes
"""

from typing import Optional
from datetime import date
from fastapi import APIRouter, HTTPException, Depends, Query, status
from db.supabase import get_supabase_client_with_token
from schemas.programs import (
    ProgramSessionCreate, ProgramSessionUpdate, ProgramSessionResponse,
    ProgramSessionListResponse, ProgramSessionBatchCreate,
    ProgramSessionExerciseResponse, ResolvedExercise, ResolvedExerciseList,
)
from schemas.auth import ErrorResponse
from api.dependencies import get_current_user, AuthUser

router = APIRouter(prefix="/api/programs/{program_id}/sessions", tags=["Program Sessions"])


def build_session_response(s: dict) -> ProgramSessionResponse:
    exercises = [
        ProgramSessionExerciseResponse(**ex)
        for ex in sorted(s.get("program_session_exercises", []) or [], key=lambda e: e.get("order_index", 0))
    ]
    return ProgramSessionResponse(
        id=s["id"],
        program_id=s["program_id"],
        micro_id=s.get("micro_id"),
        date=s["date"],
        template_id=s.get("template_id"),
        template_name=s.get("session_templates", {}).get("name") if s.get("session_templates") else None,
        custom_name=s.get("custom_name"),
        status=s.get("status", "planned"),
        notes=s.get("notes"),
        workout_log_id=s.get("workout_log_id"),
        exercises=exercises,
        created_at=s["created_at"],
        updated_at=s["updated_at"],
    )


@router.post("", response_model=ProgramSessionResponse, status_code=status.HTTP_201_CREATED)
async def schedule_session(
    program_id: str,
    session: ProgramSessionCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Verify program exists
        prog = supabase.table("programs").select("id").eq("id", program_id).execute()
        if not prog.data:
            raise HTTPException(status_code=404, detail="Program not found")

        insert_data = {
            "program_id": program_id,
            "date": session.date.isoformat(),
            "template_id": session.template_id,
            "custom_name": session.custom_name,
            "notes": session.notes,
        }

        result = supabase.table("program_sessions").insert(insert_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to schedule session")

        # Re-fetch with joins
        full = supabase.table("program_sessions").select(
            "*, session_templates(name), program_session_exercises(*)"
        ).eq("id", result.data[0]["id"]).execute()

        return build_session_response(full.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to schedule session: {str(e)}")


@router.post("/batch", response_model=ProgramSessionListResponse, status_code=status.HTTP_201_CREATED)
async def batch_schedule(
    program_id: str,
    batch: ProgramSessionBatchCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        prog = supabase.table("programs").select("id").eq("id", program_id).execute()
        if not prog.data:
            raise HTTPException(status_code=404, detail="Program not found")

        rows = [
            {
                "program_id": program_id,
                "date": s.date.isoformat(),
                "template_id": s.template_id,
                "custom_name": s.custom_name,
                "notes": s.notes,
            }
            for s in batch.sessions
        ]

        result = supabase.table("program_sessions").insert(rows).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to batch schedule")

        ids = [r["id"] for r in result.data]
        full = supabase.table("program_sessions").select(
            "*, session_templates(name), program_session_exercises(*)"
        ).in_("id", ids).order("date").execute()

        sessions = [build_session_response(s) for s in (full.data or [])]
        return ProgramSessionListResponse(sessions=sessions, total=len(sessions))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to batch schedule: {str(e)}")


@router.get("", response_model=ProgramSessionListResponse)
async def list_sessions(
    program_id: str,
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        query = supabase.table("program_sessions").select(
            "*, session_templates(name), program_session_exercises(*)"
        ).eq("program_id", program_id)

        if start_date:
            query = query.gte("date", start_date.isoformat())
        if end_date:
            query = query.lte("date", end_date.isoformat())

        result = query.order("date").execute()
        sessions = [build_session_response(s) for s in (result.data or [])]
        return ProgramSessionListResponse(sessions=sessions, total=len(sessions))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list sessions: {str(e)}")


@router.put("/{session_id}", response_model=ProgramSessionResponse)
async def update_session(
    program_id: str,
    session_id: str,
    update: ProgramSessionUpdate,
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        update_data = {}
        for field in ["template_id", "custom_name", "status", "notes"]:
            val = getattr(update, field, None)
            if val is not None:
                update_data[field] = val
        if update.date is not None:
            update_data["date"] = update.date.isoformat()

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = supabase.table("program_sessions").update(update_data).eq("id", session_id).eq("program_id", program_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Session not found")

        full = supabase.table("program_sessions").select(
            "*, session_templates(name), program_session_exercises(*)"
        ).eq("id", session_id).execute()
        return build_session_response(full.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update session: {str(e)}")


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    program_id: str,
    session_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("program_sessions").delete().eq("id", session_id).eq("program_id", program_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Session not found")
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")


@router.get("/{session_id}/exercises", response_model=ResolvedExerciseList)
async def get_session_exercises(
    program_id: str,
    session_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Resolve exercises for a program session.
    1. If program_session_exercises rows exist → return those (detached session)
    2. Else if template_id set → fetch from session_template_exercises
    3. Else → empty list
    """
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Get session with overrides
        sess = supabase.table("program_sessions").select(
            "id, template_id, program_session_exercises(*)"
        ).eq("id", session_id).eq("program_id", program_id).execute()

        if not sess.data:
            raise HTTPException(status_code=404, detail="Session not found")

        session = sess.data[0]
        overrides = session.get("program_session_exercises") or []

        if overrides:
            # Use session-level overrides
            exercises = [
                ResolvedExercise(
                    exercise_name=ex["exercise_name"],
                    sets=ex["sets"],
                    order_index=ex.get("order_index", 0),
                    unilateral=ex.get("unilateral", False),
                    resistance_profile=ex.get("resistance_profile"),
                )
                for ex in sorted(overrides, key=lambda e: e.get("order_index", 0))
            ]
            return ResolvedExerciseList(exercises=exercises)

        template_id = session.get("template_id")
        if template_id:
            # Fetch from template
            tex = supabase.table("session_template_exercises").select("*").eq(
                "template_id", template_id
            ).order("order_index").execute()

            exercises = [
                ResolvedExercise(
                    exercise_name=ex["exercise_name"],
                    sets=ex["sets"],
                    order_index=ex.get("order_index", 0),
                    unilateral=ex.get("unilateral", False),
                    resistance_profile=ex.get("resistance_profile"),
                )
                for ex in (tex.data or [])
            ]
            return ResolvedExerciseList(exercises=exercises)

        return ResolvedExerciseList(exercises=[])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get session exercises: {str(e)}")


@router.put("/{session_id}/detach", response_model=ProgramSessionResponse)
async def detach_session(
    program_id: str,
    session_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Copy template exercises into session-level overrides and unlink template"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Get session with template
        sess = supabase.table("program_sessions").select("*, session_templates(id)").eq("id", session_id).eq("program_id", program_id).execute()
        if not sess.data:
            raise HTTPException(status_code=404, detail="Session not found")

        session = sess.data[0]
        template_id = session.get("template_id")
        if not template_id:
            raise HTTPException(status_code=400, detail="Session has no template to detach")

        # Get template exercises
        tex = supabase.table("session_template_exercises").select("*").eq("template_id", template_id).order("order_index").execute()

        # Copy to session exercises
        if tex.data:
            rows = [
                {
                    "program_session_id": session_id,
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
        supabase.table("program_sessions").update({"template_id": None}).eq("id", session_id).execute()

        # Re-fetch
        full = supabase.table("program_sessions").select(
            "*, session_templates(name), program_session_exercises(*)"
        ).eq("id", session_id).execute()
        return build_session_response(full.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to detach session: {str(e)}")
