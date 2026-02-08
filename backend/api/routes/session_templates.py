"""
Session template routes
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client_with_token
from schemas.programs import (
    SessionTemplateCreate, SessionTemplateResponse, SessionTemplateListResponse,
    TemplateExerciseResponse, CreateTemplateFromSession,
)
from schemas.auth import ErrorResponse
from api.dependencies import get_current_user, AuthUser

router = APIRouter(prefix="/api/session-templates", tags=["Session Templates"])


def build_template_response(t: dict) -> SessionTemplateResponse:
    exercises = [
        TemplateExerciseResponse(**ex)
        for ex in sorted(t.get("session_template_exercises", []) or [], key=lambda e: e.get("order_index", 0))
    ]
    return SessionTemplateResponse(
        id=t["id"],
        user_id=t["user_id"],
        name=t["name"],
        source_session_id=t.get("source_session_id"),
        source_split_id=t.get("source_split_id"),
        notes=t.get("notes"),
        exercises=exercises,
        created_at=t["created_at"],
        updated_at=t["updated_at"],
    )


@router.post("", response_model=SessionTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(template: SessionTemplateCreate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        template_result = supabase.table("session_templates").insert({
            "user_id": current_user.id,
            "name": template.name,
            "notes": template.notes,
        }).execute()

        if not template_result.data:
            raise HTTPException(status_code=500, detail="Failed to create template")

        template_record = template_result.data[0]
        template_id = template_record["id"]

        exercise_rows = [
            {
                "template_id": template_id,
                "exercise_name": ex.exercise_name,
                "sets": ex.sets,
                "order_index": idx if ex.order_index == 0 else ex.order_index,
                "unilateral": ex.unilateral,
                "resistance_profile": ex.resistance_profile,
            }
            for idx, ex in enumerate(template.exercises)
        ]

        ex_result = supabase.table("session_template_exercises").insert(exercise_rows).execute()
        template_record["session_template_exercises"] = ex_result.data or []
        return build_template_response(template_record)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create template: {str(e)}")


@router.post("/from-session", response_model=SessionTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template_from_session(body: CreateTemplateFromSession, current_user: AuthUser = Depends(get_current_user)):
    """Clone a split session into a reusable template"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Fetch the session with exercises
        session_result = supabase.table("sessions").select("*, exercises(*), splits(id)").eq("id", body.session_id).execute()
        if not session_result.data:
            raise HTTPException(status_code=404, detail="Session not found")

        session = session_result.data[0]
        template_name = body.name or session["name"]
        split_id = session.get("splits", {}).get("id") if session.get("splits") else None

        template_result = supabase.table("session_templates").insert({
            "user_id": current_user.id,
            "name": template_name,
            "source_session_id": body.session_id,
            "source_split_id": split_id,
        }).execute()

        if not template_result.data:
            raise HTTPException(status_code=500, detail="Failed to create template")

        template_record = template_result.data[0]
        template_id = template_record["id"]

        exercises = sorted(session.get("exercises", []) or [], key=lambda e: e.get("order_index", 0))
        if exercises:
            exercise_rows = [
                {
                    "template_id": template_id,
                    "exercise_name": ex["exercise_name"],
                    "sets": ex["sets"],
                    "order_index": ex.get("order_index", idx),
                    "unilateral": ex.get("unilateral", False),
                    "resistance_profile": ex.get("resistance_profile"),
                }
                for idx, ex in enumerate(exercises)
            ]
            ex_result = supabase.table("session_template_exercises").insert(exercise_rows).execute()
            template_record["session_template_exercises"] = ex_result.data or []
        else:
            template_record["session_template_exercises"] = []

        return build_template_response(template_record)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create template from session: {str(e)}")


@router.get("", response_model=SessionTemplateListResponse)
async def list_templates(current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("session_templates").select(
            "*, session_template_exercises(*)"
        ).order("created_at", desc=True).execute()

        if not result.data:
            return SessionTemplateListResponse(templates=[], total=0)

        templates = [build_template_response(t) for t in result.data]
        return SessionTemplateListResponse(templates=templates, total=len(templates))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list templates: {str(e)}")


@router.get("/{template_id}", response_model=SessionTemplateResponse)
async def get_template(template_id: str, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("session_templates").select(
            "*, session_template_exercises(*)"
        ).eq("id", template_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Template not found")
        return build_template_response(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get template: {str(e)}")


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: str, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("session_templates").delete().eq("id", template_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Template not found")
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete template: {str(e)}")
