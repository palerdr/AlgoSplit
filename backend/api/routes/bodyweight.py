"""
Bodyweight tracking routes
"""

from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client_with_token
from schemas.bodyweight import (
    BodyweightEntryCreate,
    BodyweightEntryResponse,
    BodyweightEntryListResponse,
    BodyweightBatchCreate,
)
from schemas.auth import ErrorResponse
from api.dependencies import get_current_user, AuthUser

router = APIRouter(prefix="/api/bodyweight", tags=["Bodyweight"])


@router.get(
    "",
    response_model=BodyweightEntryListResponse,
    responses={401: {"model": ErrorResponse}},
    summary="List bodyweight entries",
)
async def list_entries(current_user: AuthUser = Depends(get_current_user)):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("bodyweight_entries").select("*").order(
            "recorded_at", desc=False
        ).execute()

        entries = [BodyweightEntryResponse(**e) for e in (result.data or [])]
        return BodyweightEntryListResponse(entries=entries, total=len(entries))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list entries: {str(e)}")


@router.post(
    "",
    response_model=BodyweightEntryResponse,
    status_code=status.HTTP_201_CREATED,
    responses={401: {"model": ErrorResponse}},
    summary="Log a bodyweight entry",
)
async def create_entry(
    entry: BodyweightEntryCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        insert_data = {
            "user_id": current_user.id,
            "weight": entry.weight,
        }
        if entry.recorded_at is not None:
            insert_data["recorded_at"] = entry.recorded_at.isoformat()
        if entry.notes is not None:
            insert_data["notes"] = entry.notes

        result = supabase.table("bodyweight_entries").insert(insert_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create entry")

        return BodyweightEntryResponse(**result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create entry: {str(e)}")


@router.post(
    "/batch",
    response_model=BodyweightEntryListResponse,
    status_code=status.HTTP_201_CREATED,
    responses={401: {"model": ErrorResponse}},
    summary="Import multiple bodyweight entries",
)
async def batch_create(
    batch: BodyweightBatchCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    """Import multiple entries at once, e.g. migrating from localStorage"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        rows = []
        for entry in batch.entries:
            row = {
                "user_id": current_user.id,
                "weight": entry.weight,
            }
            if entry.recorded_at is not None:
                row["recorded_at"] = entry.recorded_at.isoformat()
            if entry.notes is not None:
                row["notes"] = entry.notes
            rows.append(row)

        result = supabase.table("bodyweight_entries").insert(rows).execute()
        entries = [BodyweightEntryResponse(**e) for e in (result.data or [])]
        return BodyweightEntryListResponse(entries=entries, total=len(entries))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to batch create: {str(e)}")


@router.delete(
    "/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}},
    summary="Delete a bodyweight entry",
)
async def delete_entry(
    entry_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.table("bodyweight_entries").delete().eq("id", entry_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Entry not found")
        return None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete entry: {str(e)}")
