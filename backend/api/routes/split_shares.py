"""Secure creation and public resolution of immutable split-share snapshots."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import ValidationError

from api.dependencies import AuthUser, get_current_user
from db.supabase import get_supabase_admin, get_supabase_client_with_token
from schemas.split_shares import (
    PublicSplitShareResponse,
    SplitShareCreateResponse,
    SplitShareRevokeResponse,
    SplitShareReviewError,
    SplitShareStatusResponse,
)
from schemas.splits import SplitCreate, SplitResponse


logger = logging.getLogger("algosplit.split_shares")

router = APIRouter(tags=["Split Sharing"])

_TOKEN_BYTES = 32
_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")
_NOT_FOUND_DETAIL = "Shared split not found"
_REVIEW_MESSAGE = "Review these exercises before copying the shared split"
_REVIEW_ERROR_PREFIX = "share_review_required:"
_NO_STORE_HEADERS = {"Cache-Control": "no-store"}


def _normalize_rpc_payload(result: Any, function_name: str) -> Any:
    """Normalize scalar JSONB RPC payloads across PostgREST client versions."""
    data = result.data
    if isinstance(data, list) and len(data) == 1:
        candidate = data[0]
        if isinstance(candidate, dict) and function_name in candidate:
            return candidate[function_name]
        return candidate
    return data


def _share_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def _shared_split_not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=_NOT_FOUND_DETAIL,
        headers=_NO_STORE_HEADERS,
    )


def _raise_share_rpc_error(exc: Exception) -> None:
    code = str(getattr(exc, "code", ""))
    message = str(getattr(exc, "message", exc)).lower()
    if code in {"P0002", "22P02"} or "split_not_found" in message:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Split not found",
        ) from exc
    if code == "54000" or "snapshot_too_large" in message:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Split is too large to share",
        ) from exc
    if code == "22023" or "split_not_shareable" in message:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Update this split before sharing it",
        ) from exc
    if "share_limit_reached" in message:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Revoke an existing share link before creating another",
        ) from exc
    if code in {"42883", "PGRST202"} or "schema cache" in message:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Split sharing is temporarily unavailable.",
        ) from exc
    raise exc


def _raise_copy_rpc_error(exc: Exception) -> None:
    """Map capability and review failures without leaking share existence."""
    code = str(getattr(exc, "code", ""))
    message = str(getattr(exc, "message", exc))
    normalized = message.lower()

    marker_index = message.find(_REVIEW_ERROR_PREFIX)
    if marker_index >= 0:
        encoded_names = message[
            marker_index + len(_REVIEW_ERROR_PREFIX):
        ].strip()
        try:
            decoded = json.loads(encoded_names)
        except (TypeError, ValueError):
            decoded = []
        review_exercises = sorted({
            name for name in decoded
            if isinstance(name, str) and name
        })
        if review_exercises:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "message": _REVIEW_MESSAGE,
                    "review_exercises": review_exercises,
                },
            ) from exc

    if code in {"P0002", "22P02"} or "shared_split_not_found" in normalized:
        raise _shared_split_not_found() from exc
    if code in {"42883", "PGRST202"} or "schema cache" in normalized:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Split sharing is temporarily unavailable.",
        ) from exc
    raise exc


@router.post(
    "/api/splits/{split_id}/shares",
    response_model=SplitShareCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an immutable split share",
)
def create_split_share(
    split_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Snapshot an owned split and return a raw token exactly once."""
    token = secrets.token_urlsafe(_TOKEN_BYTES)
    token_hash = _share_token_hash(token)
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.rpc(
            "create_split_share",
            {
                "p_split_id": split_id,
                "p_token_hash": token_hash,
            },
        ).execute()
        payload = _normalize_rpc_payload(result, "create_split_share")
        if not isinstance(payload, dict):
            raise RuntimeError("create_split_share returned an invalid payload")
        return SplitShareCreateResponse(token=token, **payload)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to create a split share for split %s", split_id)
        _raise_share_rpc_error(exc)


@router.get(
    "/api/splits/{split_id}/shares/status",
    response_model=SplitShareStatusResponse,
    summary="Get active split-share count",
)
def get_split_share_status(
    split_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return the number of unexpired links for an owned split."""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.rpc(
            "get_split_share_status",
            {"p_split_id": split_id},
        ).execute()
        payload = _normalize_rpc_payload(result, "get_split_share_status")
        if not isinstance(payload, dict):
            raise RuntimeError("get_split_share_status returned an invalid payload")
        return SplitShareStatusResponse.model_validate(payload)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to read split-share status for split %s", split_id)
        _raise_share_rpc_error(exc)


@router.delete(
    "/api/splits/{split_id}/shares",
    response_model=SplitShareRevokeResponse,
    summary="Revoke every share for a split",
)
def revoke_split_shares(
    split_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Delete every immutable share row for an owned split."""
    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.rpc(
            "revoke_split_shares",
            {"p_split_id": split_id},
        ).execute()
        payload = _normalize_rpc_payload(result, "revoke_split_shares")
        if not isinstance(payload, dict):
            raise RuntimeError("revoke_split_shares returned an invalid payload")
        return SplitShareRevokeResponse.model_validate(payload)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to revoke split shares for split %s", split_id)
        _raise_share_rpc_error(exc)


@router.get(
    "/api/split-shares/{token}",
    response_model=PublicSplitShareResponse,
    responses={404: {"description": _NOT_FOUND_DETAIL}},
    summary="Resolve a public split share",
)
def get_public_split_share(token: str, response: Response):
    """
    Resolve an active share without authentication.

    Invalid, expired, and revoked tokens intentionally have the same response.
    """
    response.headers["Cache-Control"] = "no-store"
    if not _TOKEN_PATTERN.fullmatch(token):
        raise _shared_split_not_found()

    try:
        # The resolver RPC is service-role only so callers cannot bypass this
        # route's public IP rate limit through the Supabase Data API.
        supabase = get_supabase_admin()
        result = supabase.rpc(
            "get_public_split_share",
            {"p_token_hash": _share_token_hash(token)},
        ).execute()
        payload = _normalize_rpc_payload(result, "get_public_split_share")
        if not isinstance(payload, dict):
            raise _shared_split_not_found()

        # Revalidation both enforces the public contract and strips any
        # unexpected fields if a database row predates the current schema.
        split = SplitCreate.model_validate(payload.get("split"))
        return PublicSplitShareResponse(
            split=split,
            expires_at=payload.get("expires_at"),
            review_exercises=payload.get("review_exercises") or [],
        )
    except HTTPException:
        raise
    except ValidationError:
        logger.warning("Rejected an invalid stored split-share snapshot")
        raise _shared_split_not_found()
    except Exception as exc:
        code = str(getattr(exc, "code", ""))
        message = str(getattr(exc, "message", exc)).lower()
        if code in {"42883", "PGRST202"} or "schema cache" in message:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Split sharing is temporarily unavailable.",
            ) from exc
        logger.exception("Failed to resolve a public split share")
        raise


@router.post(
    "/api/split-shares/{token}/copy",
    response_model=SplitResponse,
    responses={
        404: {"description": _NOT_FOUND_DETAIL},
        409: {
            "model": SplitShareReviewError,
            "description": "Exercises require review before copying",
        },
    },
    summary="Save an idempotent copy of a shared split",
)
def copy_shared_split(
    token: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Copy an active portable snapshot once for the authenticated recipient."""
    if not _TOKEN_PATTERN.fullmatch(token):
        raise _shared_split_not_found()

    try:
        supabase = get_supabase_client_with_token(current_user.access_token)
        result = supabase.rpc(
            "copy_split_share",
            {"p_token_hash": _share_token_hash(token)},
        ).execute()
        payload = _normalize_rpc_payload(result, "copy_split_share")
        if not isinstance(payload, dict):
            raise _shared_split_not_found()
        return SplitResponse.model_validate(payload)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to copy a shared split")
        _raise_copy_rpc_error(exc)
