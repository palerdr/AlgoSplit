"""
Pydantic schemas for bodyweight tracking
"""

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class BodyweightEntryCreate(BaseModel):
    weight: float = Field(..., gt=0, le=9999.99, description="Weight in lbs")
    recorded_at: Optional[datetime] = Field(default=None, description="When recorded (defaults to now)")
    notes: Optional[str] = Field(default=None, max_length=500)


class BodyweightEntryResponse(BaseModel):
    id: str
    user_id: str
    weight: float
    recorded_at: datetime
    notes: Optional[str] = None
    created_at: datetime


class BodyweightEntryListResponse(BaseModel):
    entries: List[BodyweightEntryResponse] = Field(default=[])
    total: int


class BodyweightBatchCreate(BaseModel):
    """Import multiple entries at once (for migrating localStorage data)"""
    entries: List[BodyweightEntryCreate] = Field(..., min_length=1, max_length=500)
