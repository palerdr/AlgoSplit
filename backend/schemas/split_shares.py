"""Pydantic contracts for immutable split-share snapshots."""

from datetime import datetime

from pydantic import BaseModel, Field

from schemas.splits import SplitCreate


class SplitShareCreateResponse(BaseModel):
    """The one-time raw token returned when a share is created."""

    token: str = Field(
        ...,
        min_length=43,
        max_length=43,
        pattern=r"^[A-Za-z0-9_-]{43}$",
        description="URL-safe share token. It is not stored by the server.",
    )
    expires_at: datetime
    active_count: int = Field(..., ge=1)
    review_exercises: list[str] = Field(default_factory=list)


class SplitShareStatusResponse(BaseModel):
    """Number of currently active links for one split."""

    active_count: int = Field(..., ge=0)


class SplitShareRevokeResponse(BaseModel):
    """Number of immutable share rows removed by revoke-all."""

    revoked_count: int = Field(..., ge=0)


class PublicSplitShareResponse(BaseModel):
    """Public, sanitized snapshot resolved from a share token."""

    split: SplitCreate
    expires_at: datetime
    review_exercises: list[str] = Field(default_factory=list)


class SplitShareReviewDetail(BaseModel):
    """Structured reason a shared split cannot be copied safely."""

    message: str
    review_exercises: list[str] = Field(..., min_length=1)


class SplitShareReviewError(BaseModel):
    """HTTP 409 response body for nonportable or conflicting exercises."""

    detail: SplitShareReviewDetail
