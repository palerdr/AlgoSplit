"""
Pydantic schemas for workout logging
"""

from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field


# ============================================================================
# Workout Exercise Schemas
# ============================================================================

class WorkoutExerciseCreate(BaseModel):
    """Exercise data for a logged workout"""

    exercise_name: str = Field(..., min_length=1, description="Exercise name")
    sets_completed: int = Field(..., gt=0, description="Number of sets completed")
    reps: List[int] = Field(..., min_items=1, description="Reps for each set, e.g., [8, 8, 7]")
    weight: List[float] = Field(..., min_items=1, description="Weight in pounds for each set, e.g., [185, 185, 185]")
    rir: Optional[List[int]] = Field(None, description="Reps in reserve for each set, e.g., [2, 3, 2]")
    notes: Optional[str] = Field(None, max_length=500, description="Notes about this exercise")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "exercise_name": "Bench Press",
                    "sets_completed": 3,
                    "reps": [8, 8, 7],
                    "weight": [185, 185, 185],
                    "notes": "Felt strong today",
                }
            ]
        }
    }


class WorkoutExerciseResponse(BaseModel):
    """Workout exercise response with database ID"""

    id: str = Field(..., description="Workout exercise ID")
    workout_log_id: str = Field(..., description="Parent workout log ID")
    exercise_name: str = Field(..., description="Exercise name")
    sets_completed: int = Field(..., description="Sets completed")
    reps: List[int] = Field(..., description="Reps per set")
    weight: List[float] = Field(..., description="Weight per set")
    order_index: int = Field(..., description="Order within workout")
    notes: Optional[str] = Field(None, description="Exercise notes")
    created_at: datetime = Field(..., description="Creation timestamp")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "we-uuid",
                    "workout_log_id": "wl-uuid",
                    "exercise_name": "Bench Press",
                    "sets_completed": 3,
                    "reps": [8, 8, 7],
                    "weight": [185, 185, 185],
                    "order_index": 0,
                    "notes": "Felt strong",
                    "created_at": "2026-01-14T10:00:00Z",
                }
            ]
        }
    }


# ============================================================================
# Workout Log Schemas
# ============================================================================

class WorkoutLogCreate(BaseModel):
    """Request to log a completed workout"""

    session_id: Optional[str] = Field(
        None, description="Optional reference to planned session"
    )
    split_id: Optional[str] = Field(None, description="Optional reference to split")
    program_session_id: Optional[str] = Field(
        None, description="Program session to mark completed"
    )
    session_name: str = Field(..., min_length=1, description="Name of session performed")
    completed_at: Optional[datetime] = Field(
        None, description="When workout was completed (defaults to now)"
    )
    duration_minutes: Optional[int] = Field(
        None, gt=0, description="Workout duration in minutes"
    )
    notes: Optional[str] = Field(None, max_length=1000, description="Overall workout notes")
    exercises: List[WorkoutExerciseCreate] = Field(
        ..., min_items=1, description="Exercises performed"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "session_id": None,
                    "split_id": None,
                    "session_name": "Push Day",
                    "completed_at": "2026-01-14T10:30:00Z",
                    "duration_minutes": 65,
                    "notes": "Great workout overall",
                    "exercises": [
                        {
                            "exercise_name": "Bench Press",
                            "sets_completed": 3,
                            "reps": [8, 8, 7],
                            "weight": [185, 185, 185],
                            "notes": "Felt strong",
                        },
                        {
                            "exercise_name": "Overhead Press",
                            "sets_completed": 3,
                            "reps": [10, 9, 8],
                            "weight": [95, 95, 95],
                        },
                    ],
                }
            ]
        }
    }


class WorkoutLogResponse(BaseModel):
    """Workout log response with database ID"""

    id: str = Field(..., description="Workout log ID")
    user_id: str = Field(..., description="User who performed workout")
    session_id: Optional[str] = Field(None, description="Reference to planned session")
    split_id: Optional[str] = Field(None, description="Reference to split")
    session_name: str = Field(..., description="Session name")
    completed_at: datetime = Field(..., description="When workout was completed")
    duration_minutes: Optional[int] = Field(None, description="Duration in minutes")
    notes: Optional[str] = Field(None, description="Workout notes")
    exercises: List[WorkoutExerciseResponse] = Field(
        default=[], description="Exercises performed"
    )
    created_at: datetime = Field(..., description="Log creation timestamp")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "wl-uuid",
                    "user_id": "user-uuid",
                    "session_id": None,
                    "split_id": None,
                    "session_name": "Push Day",
                    "completed_at": "2026-01-14T10:30:00Z",
                    "duration_minutes": 65,
                    "notes": "Great workout",
                    "exercises": [],
                    "created_at": "2026-01-14T11:00:00Z",
                }
            ]
        }
    }


class WorkoutHistoryResponse(BaseModel):
    """List of workout logs"""

    workouts: List[WorkoutLogResponse] = Field(..., description="Workout history")
    total: int = Field(..., description="Total number of workouts")

    model_config = {
        "json_schema_extra": {"examples": [{"workouts": [], "total": 0}]}
    }


# ============================================================================
# Workout Stats Schemas
# ============================================================================

class WorkoutStatsResponse(BaseModel):
    """Workout statistics and progress metrics"""

    total_workouts: int = Field(..., description="Total workouts logged")
    total_sets: int = Field(..., description="Total sets completed")
    total_volume_pounds: float = Field(..., description="Total volume (sets × reps × weight)")
    average_duration_minutes: Optional[float] = Field(
        None, description="Average workout duration"
    )
    most_frequent_exercises: List[dict] = Field(
        default=[], description="Most frequently performed exercises"
    )
    last_workout_date: Optional[datetime] = Field(None, description="Most recent workout")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "total_workouts": 25,
                    "total_sets": 450,
                    "total_volume_pounds": 125000.0,
                    "average_duration_minutes": 62.5,
                    "most_frequent_exercises": [
                        {"exercise": "Bench Press", "count": 20},
                        {"exercise": "Squat", "count": 18},
                    ],
                    "last_workout_date": "2026-01-14T10:30:00Z",
                }
            ]
        }
    }
