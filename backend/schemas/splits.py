"""
Pydantic schemas for split management (database operations)
"""

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


# ============================================================================
# Exercise Schemas
# ============================================================================

class ExerciseCreate(BaseModel):
    """Exercise to be added to a session"""

    name: str = Field(..., min_length=1, description="Exercise name")
    sets: int = Field(..., gt=0, description="Number of sets")
    unilateral: bool = Field(default=False, description="Whether performed unilaterally (+5% stimulus)")
    resistance_profile: Optional[str] = Field(
        default=None,
        description="Override resistance profile: 'ascending', 'mid', or 'descending'"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [{"name": "Bench Press", "sets": 4, "unilateral": False, "resistance_profile": None}]
        }
    }


class ExerciseResponse(BaseModel):
    """Exercise response with database ID"""

    id: str = Field(..., description="Exercise ID")
    session_id: str = Field(..., description="Parent session ID")
    exercise_name: str = Field(..., description="Exercise name")
    sets: int = Field(..., description="Number of sets")
    order_index: int = Field(..., description="Order within session")
    unilateral: bool = Field(default=False, description="Whether performed unilaterally")
    resistance_profile: Optional[str] = Field(default=None, description="Resistance profile override")
    created_at: datetime = Field(..., description="Creation timestamp")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "ex-uuid",
                    "session_id": "sess-uuid",
                    "exercise_name": "Bench Press",
                    "sets": 4,
                    "order_index": 0,
                    "unilateral": False,
                    "resistance_profile": None,
                    "created_at": "2026-01-14T10:00:00Z",
                }
            ]
        }
    }


# ============================================================================
# Session Schemas
# ============================================================================

class SessionCreate(BaseModel):
    """Session to be added to a split"""

    name: str = Field(..., min_length=1, description="Session name (e.g., 'Push Day')")
    day_number: int = Field(..., gt=0, description="Day number in the cycle")
    exercises: List[ExerciseCreate] = Field(..., min_items=1, description="Exercises in this session")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Push Day",
                    "day_number": 1,
                    "exercises": [
                        {"name": "Bench Press", "sets": 4},
                        {"name": "Overhead Press", "sets": 3},
                    ],
                }
            ]
        }
    }


class SessionResponse(BaseModel):
    """Session response with database ID"""

    id: str = Field(..., description="Session ID")
    split_id: str = Field(..., description="Parent split ID")
    name: str = Field(..., description="Session name")
    day_number: int = Field(..., description="Day number in cycle")
    exercises: List[ExerciseResponse] = Field(default=[], description="Exercises in this session")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "sess-uuid",
                    "split_id": "split-uuid",
                    "name": "Push Day",
                    "day_number": 1,
                    "exercises": [],
                    "created_at": "2026-01-14T10:00:00Z",
                    "updated_at": "2026-01-14T10:00:00Z",
                }
            ]
        }
    }


# ============================================================================
# Split Schemas
# ============================================================================

class SplitCreate(BaseModel):
    """Request to create a new split"""

    name: str = Field(..., min_length=1, max_length=200, description="Split name")
    cycle_length: Optional[int] = Field(
        default=None, ge=1, le=14, description="Cycle length in days (auto-calculated from sessions if not provided)"
    )
    stimulus_duration: int = Field(
        default=48, gt=0, description="Hours of elevated protein synthesis"
    )
    maintenance_volume: int = Field(
        default=4, ge=0, description="Sets needed to maintain muscle"
    )
    dataset: str = Field(
        default="pelland",
        pattern="^(schoenfeld|pelland|average)$",
        description="Fatigue curve dataset",
    )
    sessions: List[SessionCreate] = Field(
        ..., min_items=1, description="Sessions in this split"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Push/Pull/Legs",
                    "stimulus_duration": 48,
                    "maintenance_volume": 4,
                    "dataset": "average",
                    "sessions": [
                        {
                            "name": "Push Day",
                            "day_number": 1,
                            "exercises": [
                                {"name": "Bench Press", "sets": 4},
                                {"name": "Overhead Press", "sets": 3},
                            ],
                        },
                        {
                            "name": "Pull Day",
                            "day_number": 2,
                            "exercises": [{"name": "Barbell Row", "sets": 4}],
                        },
                    ],
                }
            ]
        }
    }


class SplitUpdate(BaseModel):
    """Request to update an existing split"""

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    cycle_length: Optional[int] = Field(None, ge=1, le=14)
    stimulus_duration: Optional[int] = Field(None, gt=0)
    maintenance_volume: Optional[int] = Field(None, ge=0)
    dataset: Optional[str] = Field(None, pattern="^(schoenfeld|pelland|average)$")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "Updated Split Name",
                    "stimulus_duration": 48,
                }
            ]
        }
    }


class SplitResponse(BaseModel):
    """Split response with database ID"""

    id: str = Field(..., description="Split ID")
    user_id: str = Field(..., description="Owner user ID")
    name: str = Field(..., description="Split name")
    cycle_length: Optional[int] = Field(None, description="Cycle length in days")
    stimulus_duration: int = Field(..., description="Hours of elevated protein synthesis")
    maintenance_volume: int = Field(..., description="Sets to maintain muscle")
    dataset: str = Field(..., description="Fatigue curve dataset")
    sessions: List[SessionResponse] = Field(default=[], description="Sessions in split")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "split-uuid",
                    "user_id": "user-uuid",
                    "name": "Push/Pull/Legs",
                    "stimulus_duration": 48,
                    "maintenance_volume": 4,
                    "dataset": "average",
                    "sessions": [],
                    "created_at": "2026-01-14T10:00:00Z",
                    "updated_at": "2026-01-14T10:00:00Z",
                }
            ]
        }
    }


class SplitListResponse(BaseModel):
    """List of splits with basic info"""

    splits: List[SplitResponse] = Field(..., description="User's splits")
    total: int = Field(..., description="Total number of splits")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "splits": [],
                    "total": 0,
                }
            ]
        }
    }
