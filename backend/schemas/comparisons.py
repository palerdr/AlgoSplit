"""
Pydantic schemas for split comparisons
"""

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


class ComparisonCreate(BaseModel):
    """Request to create a new comparison"""

    name: str = Field(..., min_length=1, max_length=200, description="Comparison name")
    split_ids: List[str] = Field(
        ..., min_length=2, max_length=4, description="IDs of splits to compare (2-4)"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "PPL vs Upper/Lower",
                    "split_ids": ["uuid-1", "uuid-2"],
                }
            ]
        }
    }


class ComparisonUpdate(BaseModel):
    """Request to update a comparison"""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    split_ids: Optional[List[str]] = Field(None, min_length=2, max_length=4)


class ComparisonResponse(BaseModel):
    """Comparison response with database ID"""

    id: str = Field(..., description="Comparison ID")
    user_id: str = Field(..., description="Owner user ID")
    name: str = Field(..., description="Comparison name")
    split_ids: List[str] = Field(..., description="IDs of splits being compared")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")


class ComparisonListResponse(BaseModel):
    """List of comparisons"""

    comparisons: List[ComparisonResponse] = Field(..., description="User's comparisons")
    total: int = Field(..., description="Total number of comparisons")
