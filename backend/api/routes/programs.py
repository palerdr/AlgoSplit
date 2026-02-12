"""
Program management routes
"""

from typing import Optional
from datetime import date
from fastapi import APIRouter, HTTPException, Depends, Query, status
from db.supabase import get_supabase_client_with_token
from schemas.programs import (
    ProgramCreate, ProgramUpdate, ProgramResponse, ProgramListResponse, ProgramDetailResponse,
    ProgramSessionResponse, ProgramSessionExerciseResponse,
    TodaySessionItem, TodaySessionsResponse,
)
from schemas.auth import ErrorResponse
from api.dependencies import get_current_user, AuthUser

router = APIRouter(prefix="/api/programs", tags=["Programs"])


def build_program_response(program_data: dict, session_count: int = 0) -> ProgramResponse:
    return ProgramResponse(
        id=program_data["id"],
        user_id=program_data["user_id"],
        name=program_data["name"],
        start_date=program_data.get("start_date"),
        end_date=program_data.get("end_date"),
        goal=program_data.get("goal"),
        status=program_data.get("status", "draft"),
        stimulus_duration=program_data.get("stimulus_duration", 48),
        maintenance_volume=program_data.get("maintenance_volume", 4),
        dataset=program_data.get("dataset", "schoenfeld"),
        session_count=session_count,
        created_at=program_data["created_at"],
        updated_at=program_data["updated_at"],
    )


def build_session_response(s: dict) -> ProgramSessionResponse:
    exercises = [
        ProgramSessionExerciseResponse(**ex)
        for ex in s.get("program_session_exercises", []) or []
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


@router.post("", response_model=ProgramResponse, status_code=status.HTTP_201_CREATED)
async def create_program(program: ProgramCreate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        insert_data = {
            "user_id": current_user.id,
            "name": program.name,
            "stimulus_duration": program.stimulus_duration,
            "maintenance_volume": program.maintenance_volume,
            "dataset": program.dataset,
        }
        if program.start_date:
            insert_data["start_date"] = program.start_date.isoformat()
        if program.end_date:
            insert_data["end_date"] = program.end_date.isoformat()
        if program.goal:
            insert_data["goal"] = program.goal

        result = supabase.table("programs").insert(insert_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create program")
        return build_program_response(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create program: {str(e)}")


@router.get("", response_model=ProgramListResponse)
async def list_programs(current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("programs").select("*, program_sessions(count)").order("created_at", desc=True).execute()
        if not result.data:
            return ProgramListResponse(programs=[], total=0)

        programs = []
        draft_with_sessions = []
        for p in result.data:
            count_data = p.pop("program_sessions", [])
            session_count = count_data[0]["count"] if count_data else 0
            # Auto-promote drafts that already have sessions
            if p.get("status", "draft") == "draft" and session_count > 0:
                p["status"] = "active"
                draft_with_sessions.append(p["id"])
            programs.append(build_program_response(p, session_count))

        # Batch-fix stuck drafts in DB
        if draft_with_sessions:
            for pid in draft_with_sessions:
                supabase.table("programs").update({"status": "active"}).eq("id", pid).execute()

        return ProgramListResponse(programs=programs, total=len(programs))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list programs: {str(e)}")


@router.get("/sessions/today", response_model=TodaySessionsResponse)
async def get_today_sessions(
    current_user: AuthUser = Depends(get_current_user),
    date: date = Query(..., description="Date to check (YYYY-MM-DD)"),
):
    """Get all planned program sessions for a given date"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Fetch planned sessions for this date, joined with program name
        result = supabase.table("program_sessions").select(
            "id, program_id, date, template_id, custom_name, status, programs(name), session_templates(name)"
        ).eq("date", date.isoformat()).eq("status", "planned").execute()

        sessions = []
        for s in result.data or []:
            # Build display name: custom_name > template name > "Session"
            display_name = (
                s.get("custom_name")
                or (s.get("session_templates", {}) or {}).get("name")
                or "Session"
            )
            program_name = (s.get("programs", {}) or {}).get("name", "Unknown Program")

            sessions.append(TodaySessionItem(
                id=s["id"],
                program_id=s["program_id"],
                program_name=program_name,
                date=s["date"],
                display_name=display_name,
                status=s["status"],
                template_id=s.get("template_id"),
            ))

        return TodaySessionsResponse(sessions=sessions)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get today's sessions: {str(e)}")


@router.get("/{program_id}", response_model=ProgramDetailResponse)
async def get_program(program_id: str, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("programs").select("*").eq("id", program_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Program not found")
        program = result.data[0]

        # Fetch sessions with template names and exercise overrides
        sessions_result = supabase.table("program_sessions").select(
            "*, session_templates(name), program_session_exercises(*)"
        ).eq("program_id", program_id).order("date").execute()

        sessions = [build_session_response(s) for s in (sessions_result.data or [])]

        return ProgramDetailResponse(
            id=program["id"],
            user_id=program["user_id"],
            name=program["name"],
            start_date=program.get("start_date"),
            end_date=program.get("end_date"),
            goal=program.get("goal"),
            status=program.get("status", "draft"),
            stimulus_duration=program.get("stimulus_duration", 48),
            maintenance_volume=program.get("maintenance_volume", 4),
            dataset=program.get("dataset", "schoenfeld"),
            sessions=sessions,
            created_at=program["created_at"],
            updated_at=program["updated_at"],
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get program: {str(e)}")


@router.put("/{program_id}", response_model=ProgramResponse)
async def update_program(program_id: str, update: ProgramUpdate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        update_data = {}
        for field in ["name", "goal", "status", "stimulus_duration", "maintenance_volume", "dataset"]:
            val = getattr(update, field, None)
            if val is not None:
                update_data[field] = val
        for field in ["start_date", "end_date"]:
            val = getattr(update, field, None)
            if val is not None:
                update_data[field] = val.isoformat()

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        result = supabase.table("programs").update(update_data).eq("id", program_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Program not found")
        return build_program_response(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update program: {str(e)}")


@router.delete("/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_program(program_id: str, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("programs").delete().eq("id", program_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Program not found")
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete program: {str(e)}")
