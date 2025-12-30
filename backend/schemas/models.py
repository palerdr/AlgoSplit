from typing import Dict, List, Optional
from pydantic import BaseModel, Field, validator


class ExerciseInput(BaseModel):
    """Single exercise with name and set count"""
    name: str = Field(..., min_length=1, description="Exercise name (e.g., 'Bench Press')")
    sets: int = Field(..., ge=1, le=20, description="Number of sets (1-20)")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Bench Press",
                "sets": 4
            }
        }


class SessionInput(BaseModel):
    """A single training session (e.g., Monday's workout)"""
    name: str = Field(..., description="Session name (e.g., 'Push Day', 'Monday')")
    day: int = Field(..., ge=1, le=7, description="Day number in the split (1-7)")
    exercises: List[ExerciseInput] = Field(..., min_items=1, description="List of exercises")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Push Day",
                "day": 1,
                "exercises": [
                    {"name": "Bench Press", "sets": 4},
                    {"name": "Incline DB Press", "sets": 3},
                    {"name": "Cable Fly", "sets": 3}
                ]
            }
        }


class SplitRequest(BaseModel):
    """Complete training split to analyze"""
    name: str = Field(default="My Split", description="Name of the split")
    sessions: List[SessionInput] = Field(..., min_items=1, max_items=14, description="Training sessions (1-14 days)")
    stimulus_duration: int = Field(default=48, ge=24, le=96, description="Muscle stimulus duration in hours (24-96)")
    maintenance_volume: int = Field(default=4, ge=1, le=9, description="Maintenance volume sets (1-9)")
    dataset: str = Field(default="average", description="Fatigue curve dataset")

    @validator('dataset')
    def validate_dataset(cls, v):
        allowed = ['schoenfeld', 'pelland', 'average']
        if v not in allowed:
            raise ValueError(f"Dataset must be one of: {allowed}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "name": "PPL Split",
                "sessions": [
                    {
                        "name": "Push",
                        "day": 1,
                        "exercises": [
                            {"name": "Bench Press", "sets": 4},
                            {"name": "Overhead Press", "sets": 3}
                        ]
                    },
                    {
                        "name": "Pull",
                        "day": 2,
                        "exercises": [
                            {"name": "Pullups", "sets": 4},
                            {"name": "Cable Row", "sets": 3}
                        ]
                    }
                ],
                "stimulus_duration": 48,
                "maintenance_volume": 4,
                "dataset": "average"
            }
        }


class MuscleStats(BaseModel):
    """Statistics for a single muscle group"""
    name: str
    stimulus: float = Field(..., description="Total weekly stimulus")
    atrophy: float = Field(..., description="Total weekly atrophy")
    net_stimulus: float = Field(..., description="Net weekly stimulus (stimulus - atrophy)")
    primary_sets: int = Field(..., description="Number of primary sets per week")
    frequency: int = Field(..., description="Training frequency (sessions per week)")
    leverage: str = Field(..., description="Leverage type (S=Short, M=Medium, L=Long)")
    damage_tier: str = Field(..., description="Damage tier (+, 0, -)")


class OptimizationSuggestion(BaseModel):
    """A single optimization suggestion"""
    priority: str = Field(..., description="Priority level (HIGH, MEDIUM, LOW)")
    muscle: str = Field(..., description="Target muscle group")
    issue: str = Field(..., description="Issue identified")
    suggestion: str = Field(..., description="Recommended action")


class SummaryStats(BaseModel):
    """Overall summary statistics"""
    total_sets: int
    muscles_trained: int
    total_muscles: int
    avg_net_stimulus: float
    avg_sets_per_muscle: float


class AnalysisResponse(BaseModel):
    """Complete analysis response"""
    split_name: str
    cycle_length: int
    stimulus_duration: int
    maintenance_volume: int
    dataset: str
    muscles: List[MuscleStats]
    suggestions: List[OptimizationSuggestion]
    summary: SummaryStats


class ExerciseParseRequest(BaseModel):
    """Request to parse a single exercise"""
    text: str = Field(..., min_length=1, description="Exercise text to parse")

    class Config:
        json_schema_extra = {
            "example": {
                "text": "Bench Press"
            }
        }


class ExerciseParseResponse(BaseModel):
    """Response from exercise parsing"""
    original_text: str
    recognized: bool
    pattern: Optional[str] = None
    pattern_name: Optional[str] = None
    targets: Optional[Dict[str, float]] = None
    unilateral: bool = False
    confidence: str = Field(default="unknown", description="Confidence level (high, medium, low)")

    class Config:
        json_schema_extra = {
            "example": {
                "original_text": "Bench Press",
                "recognized": True,
                "pattern": "horizontal press",
                "pattern_name": "Horizontal Press",
                "targets": {
                    "pecs": 0.80,
                    "front_delt": 0.10,
                    "triceps": 0.10
                },
                "unilateral": False,
                "confidence": "high"
            }
        }


class MovementPattern(BaseModel):
    """A single movement pattern definition"""
    name: str
    display_name: str
    targets: Dict[str, float]
    description: Optional[str] = None


class MovementPatternsResponse(BaseModel):
    """List of all available movement patterns"""
    patterns: List[MovementPattern]
    total_count: int
