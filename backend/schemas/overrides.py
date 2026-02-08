"""
Pydantic schemas for exercise overrides and custom exercises
"""

from typing import List, Dict, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field, model_validator


class ExerciseOverrideCreate(BaseModel):
    """Request to create an exercise override"""

    exercise_name: str = Field(..., min_length=1, description="Exercise name to override")
    pattern_override: str = Field(..., min_length=1, description="Correct movement pattern")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "exercise_name": "DB Bench",
                    "pattern_override": "horizontal press",
                }
            ]
        }
    }


class ExerciseOverrideResponse(BaseModel):
    """Exercise override response"""

    id: str = Field(..., description="Override ID")
    user_id: str = Field(..., description="User ID")
    exercise_name: str = Field(..., description="Exercise name")
    pattern_override: str = Field(..., description="Movement pattern override")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "override-uuid",
                    "user_id": "user-uuid",
                    "exercise_name": "DB Bench",
                    "pattern_override": "horizontal press",
                    "created_at": "2026-01-14T10:00:00Z",
                    "updated_at": "2026-01-14T10:00:00Z",
                }
            ]
        }
    }


class ExerciseOverrideListResponse(BaseModel):
    """List of exercise overrides"""

    overrides: List[ExerciseOverrideResponse] = Field(..., description="User's overrides")
    total: int = Field(..., description="Total number of overrides")

    model_config = {
        "json_schema_extra": {"examples": [{"overrides": [], "total": 0}]}
    }


# ============================================================================
# CUSTOM EXERCISE SCHEMAS
# ============================================================================

class CustomExerciseCreate(BaseModel):
    """Request to create a fully custom exercise with user-defined muscle targets"""

    exercise_name: str = Field(..., min_length=1, max_length=100, description="Custom exercise name")
    prime_targets: Dict[str, float] = Field(default_factory=dict, description="Prime movers: muscle_id -> weight")
    secondary_targets: Dict[str, float] = Field(default_factory=dict, description="Secondary movers: muscle_id -> weight")
    tertiary_targets: Dict[str, float] = Field(default_factory=dict, description="Tertiary movers: muscle_id -> weight")
    quaternary_targets: Dict[str, float] = Field(default_factory=dict, description="Quaternary/stabilizers: muscle_id -> weight")
    axial_load: float = Field(0.0, ge=0.0, le=1.0, description="Spinal fatigue contribution (0-1)")
    resistance_profile: Literal['ascending', 'mid', 'descending'] = Field('mid', description="Resistance curve type")
    is_bilateral: bool = Field(True, description="Whether exercise is bilateral")

    @model_validator(mode='after')
    def validate_weights(self) -> 'CustomExerciseCreate':
        """Validate that all weights sum to 1.0 and individual weights are valid"""
        total = 0.0
        all_targets = [
            self.prime_targets,
            self.secondary_targets,
            self.tertiary_targets,
            self.quaternary_targets
        ]

        for targets in all_targets:
            for muscle_id, weight in targets.items():
                if weight < 0 or weight > 1:
                    raise ValueError(f"Weight for {muscle_id} must be between 0 and 1, got {weight}")
                total += weight

        if abs(total - 1.0) > 0.01:  # Allow small floating point tolerance
            raise ValueError(f"All muscle weights must sum to 1.0, got {total:.3f}")

        return self

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "exercise_name": "Custom Chest Fly",
                    "prime_targets": {"sternocostal": 0.6, "clavicular": 0.25},
                    "secondary_targets": {"anterior_deltoid": 0.1},
                    "tertiary_targets": {"biceps_brachii": 0.05},
                    "quaternary_targets": {},
                    "axial_load": 0.0,
                    "resistance_profile": "descending",
                    "is_bilateral": True,
                }
            ]
        }
    }


class CustomExerciseUpdate(BaseModel):
    """Request to update a custom exercise (partial update supported)"""

    exercise_name: Optional[str] = Field(None, min_length=1, max_length=100)
    prime_targets: Optional[Dict[str, float]] = None
    secondary_targets: Optional[Dict[str, float]] = None
    tertiary_targets: Optional[Dict[str, float]] = None
    quaternary_targets: Optional[Dict[str, float]] = None
    axial_load: Optional[float] = Field(None, ge=0.0, le=1.0)
    resistance_profile: Optional[Literal['ascending', 'mid', 'descending']] = None
    is_bilateral: Optional[bool] = None

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "exercise_name": "Updated Custom Fly",
                    "axial_load": 0.1,
                }
            ]
        }
    }


class CustomExerciseResponse(BaseModel):
    """Custom exercise response with full details"""

    id: str = Field(..., description="Custom exercise ID")
    user_id: str = Field(..., description="Owner user ID")
    exercise_name: str = Field(..., description="Exercise name")
    prime_targets: Dict[str, float] = Field(..., description="Prime movers")
    secondary_targets: Dict[str, float] = Field(..., description="Secondary movers")
    tertiary_targets: Dict[str, float] = Field(..., description="Tertiary movers")
    quaternary_targets: Dict[str, float] = Field(..., description="Quaternary/stabilizers")
    axial_load: float = Field(..., description="Spinal fatigue contribution")
    resistance_profile: str = Field(..., description="Resistance curve type")
    is_bilateral: bool = Field(..., description="Whether exercise is bilateral")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "custom-uuid",
                    "user_id": "user-uuid",
                    "exercise_name": "Custom Chest Fly",
                    "prime_targets": {"sternocostal": 0.6, "clavicular": 0.25},
                    "secondary_targets": {"anterior_deltoid": 0.1},
                    "tertiary_targets": {"biceps_brachii": 0.05},
                    "quaternary_targets": {},
                    "axial_load": 0.0,
                    "resistance_profile": "descending",
                    "is_bilateral": True,
                    "created_at": "2026-01-14T10:00:00Z",
                    "updated_at": "2026-01-14T10:00:00Z",
                }
            ]
        }
    }


class CustomExerciseListResponse(BaseModel):
    """List of custom exercises"""

    exercises: List[CustomExerciseResponse] = Field(..., description="User's custom exercises")
    total: int = Field(..., description="Total number of custom exercises")

    model_config = {
        "json_schema_extra": {"examples": [{"exercises": [], "total": 0}]}
    }
