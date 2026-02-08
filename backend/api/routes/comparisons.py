"""
Comparison management routes
Handles CRUD operations for split comparisons
"""

from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client_with_token
from schemas.comparisons import (
    ComparisonCreate,
    ComparisonUpdate,
    ComparisonResponse,
    ComparisonListResponse,
)
from schemas.auth import ErrorResponse
from api.dependencies import get_current_user, AuthUser

router = APIRouter(prefix="/api/comparisons", tags=["Comparisons"])


@router.get(
    "",
    response_model=ComparisonListResponse,
    responses={401: {"model": ErrorResponse}},
    summary="List saved comparisons",
)
async def list_comparisons(
    current_user: AuthUser = Depends(get_current_user),
):
    """List all comparisons for the current user"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = (
            supabase.table("comparisons")
            .select("*")
            .order("updated_at", desc=True)
            .execute()
        )

        comparisons = [
            ComparisonResponse(
                id=row["id"],
                user_id=row["user_id"],
                name=row["name"],
                split_ids=row["split_ids"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
            for row in (result.data or [])
        ]

        return ComparisonListResponse(comparisons=comparisons, total=len(comparisons))

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list comparisons: {str(e)}",
        )


@router.post(
    "",
    response_model=ComparisonResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
    },
    summary="Create a comparison",
)
async def create_comparison(
    comparison: ComparisonCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    """Create a new saved comparison"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Verify all referenced splits exist and belong to the user
        for split_id in comparison.split_ids:
            split_check = (
                supabase.table("splits")
                .select("id")
                .eq("id", split_id)
                .execute()
            )
            if not split_check.data:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Split not found: {split_id}",
                )

        result = (
            supabase.table("comparisons")
            .insert({
                "user_id": current_user.id,
                "name": comparison.name,
                "split_ids": comparison.split_ids,
            })
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create comparison",
            )

        row = result.data[0]
        return ComparisonResponse(
            id=row["id"],
            user_id=row["user_id"],
            name=row["name"],
            split_ids=row["split_ids"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create comparison: {str(e)}",
        )


@router.get(
    "/{comparison_id}",
    response_model=ComparisonResponse,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
    summary="Get a comparison",
)
async def get_comparison(
    comparison_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Get a specific comparison"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = (
            supabase.table("comparisons")
            .select("*")
            .eq("id", comparison_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comparison not found",
            )

        row = result.data[0]
        return ComparisonResponse(
            id=row["id"],
            user_id=row["user_id"],
            name=row["name"],
            split_ids=row["split_ids"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get comparison: {str(e)}",
        )


@router.put(
    "/{comparison_id}",
    response_model=ComparisonResponse,
    responses={
        400: {"model": ErrorResponse},
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
    summary="Update a comparison",
)
async def update_comparison(
    comparison_id: str,
    comparison: ComparisonUpdate,
    current_user: AuthUser = Depends(get_current_user),
):
    """Update a comparison's name or split_ids"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        # Verify exists
        existing = (
            supabase.table("comparisons")
            .select("id")
            .eq("id", comparison_id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comparison not found",
            )

        update_data = {}
        if comparison.name is not None:
            update_data["name"] = comparison.name
        if comparison.split_ids is not None:
            # Verify all splits exist
            for split_id in comparison.split_ids:
                split_check = (
                    supabase.table("splits")
                    .select("id")
                    .eq("id", split_id)
                    .execute()
                )
                if not split_check.data:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Split not found: {split_id}",
                    )
            update_data["split_ids"] = comparison.split_ids

        if not update_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update",
            )

        result = (
            supabase.table("comparisons")
            .update(update_data)
            .eq("id", comparison_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update comparison",
            )

        row = result.data[0]
        return ComparisonResponse(
            id=row["id"],
            user_id=row["user_id"],
            name=row["name"],
            split_ids=row["split_ids"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update comparison: {str(e)}",
        )


@router.delete(
    "/{comparison_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
    },
    summary="Delete a comparison",
)
async def delete_comparison(
    comparison_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Delete a comparison"""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)

        existing = (
            supabase.table("comparisons")
            .select("id")
            .eq("id", comparison_id)
            .execute()
        )
        if not existing.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comparison not found",
            )

        supabase.table("comparisons").delete().eq("id", comparison_id).execute()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete comparison: {str(e)}",
        )
