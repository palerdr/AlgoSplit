"""
Session template routes
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client_with_token
from schemas.programs import (
    SessionTemplateCreate, SessionTemplateUpdate, SessionTemplateResponse,
    SessionTemplateListResponse, TemplateExerciseResponse, CreateTemplateFromSession,
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


def _rpc_payload(result, name: str) -> dict:
    data = result.data
    if isinstance(data, list) and len(data) == 1 and isinstance(data[0], dict):
        data = data[0]
    if not isinstance(data, dict):
        raise RuntimeError(f"{name} returned an invalid payload")
    return data


def _template_payload(template) -> dict:
    payload = template.model_dump(mode="json")
    for index, exercise in enumerate(payload.get("exercises", [])):
        if exercise.get("order_index", 0) == 0:
            exercise["order_index"] = index
    return payload


@router.post("", response_model=SessionTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template(template: SessionTemplateCreate, current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        result = supabase.rpc("save_session_template_full", {
            "p_template_id": None,
            "p_template": _template_payload(template),
        }).execute()
        return build_template_response(_rpc_payload(result, "save_session_template_full"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create template: {str(e)}")


@router.post("/from-session", response_model=SessionTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_template_from_session(body: CreateTemplateFromSession, current_user: AuthUser = Depends(get_current_user)):
    """Clone a split session into a reusable template"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        result = supabase.rpc("create_session_template_from_session", {
            "p_session_id": body.session_id,
            "p_name": body.name,
        }).execute()
        return build_template_response(_rpc_payload(result, "create_session_template_from_session"))
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


@router.put("/{template_id}", response_model=SessionTemplateResponse)
async def update_template(
    template_id: str,
    template: SessionTemplateUpdate,
    current_user: AuthUser = Depends(get_current_user),
):
    """Replace a template's name, notes, and exercises."""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        result = supabase.rpc("save_session_template_full", {
            "p_template_id": template_id,
            "p_template": _template_payload(template),
        }).execute()
        return build_template_response(_rpc_payload(result, "save_session_template_full"))
    except HTTPException:
        raise
    except Exception as e:
        if getattr(e, "code", None) == "P0002" or "not_found" in str(e):
            raise HTTPException(status_code=404, detail="Template not found") from e
        raise HTTPException(status_code=500, detail=f"Failed to update template: {str(e)}")


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
