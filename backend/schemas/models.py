"""
Pydantic models for Split.AI API

Defines request/response schemas for the 29-region granular muscle model.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field, validator


# ============================================================================
# REQUEST MODELS
# ============================================================================

class ExerciseInput(BaseModel):
    """Single exercise with name and set count"""
    name: str = Field(..., min_length=1, description="Exercise name (e.g., 'Bench Press')")
    sets: int = Field(..., ge=1, le=20, description="Number of sets (1-20)")
    unilateral: bool = Field(default=False, description="Whether exercise is performed unilaterally (+5% stimulus)")
    resistance_profile: Optional[str] = Field(
        default=None,
        description="Override resistance profile: 'ascending' (hardest at top/shortened), 'mid' (hardest mid-range), 'descending' (hardest at bottom/lengthened)"
    )

    @validator('resistance_profile')
    def validate_resistance_profile(cls, v):
        if v is not None and v not in ['ascending', 'mid', 'descending']:
            raise ValueError("resistance_profile must be 'ascending', 'mid', or 'descending'")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "name": "Bench Press",
                "sets": 4,
                "unilateral": False,
                "resistance_profile": None
            }
        }


class SessionInput(BaseModel):
    """A single training session (e.g., Monday's workout)"""
    name: str = Field(..., description="Session name (e.g., 'Push Day', 'Monday')")
    day: int = Field(..., ge=1, le=14, description="Day number in the split (1-14)")
    exercises: List[ExerciseInput] = Field(..., min_length=1, description="List of exercises")

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
    sessions: List[SessionInput] = Field(..., min_length=1, max_length=14, description="Training sessions (1-14 days)")
    cycle_length: Optional[int] = Field(default=None, ge=1, le=14, description="Cycle length in days (defaults to max day number)")
    stimulus_duration: int = Field(default=48, ge=24, le=96, description="Muscle stimulus duration in hours (24-96)")
    maintenance_volume: int = Field(default=3, ge=1, le=9, description="Maintenance volume sets (1-9)")
    dataset: str = Field(default="pelland", description="Fatigue curve dataset")
    include_breakdowns: bool = Field(default=True, description="Include per-session exercise breakdowns (set false for faster responses)")

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


class ExerciseParseRequest(BaseModel):
    """Request to parse a single exercise"""
    text: str = Field(..., min_length=1, description="Exercise text to parse")

    class Config:
        json_schema_extra = {
            "example": {
                "text": "Bench Press"
            }
        }


# ============================================================================
# MUSCLE STATS (29 anatomical regions)
# ============================================================================

class MuscleStats(BaseModel):
    """Statistics for a single anatomical muscle region"""
    region_id: str = Field(..., description="Unique region identifier (e.g., 'sternocostal')")
    display_name: str = Field(..., description="Human-readable name (e.g., 'Mid-Lower Chest')")
    parent_group: str = Field(..., description="Parent muscle group (e.g., 'chest')")
    stimulus: float = Field(..., description="Total weekly stimulus")
    atrophy: float = Field(..., description="Total weekly atrophy")
    net_stimulus: float = Field(..., description="Net weekly stimulus (stimulus - atrophy)")
    primary_sets: int = Field(..., description="Sets where this was a prime mover")
    prime_sets: int = Field(..., description="Sets as prime mover (full penalty)")
    secondary_sets: int = Field(..., description="Sets as secondary mover (60% penalty)")
    tertiary_sets: int = Field(..., description="Sets as tertiary mover (35% penalty)")
    frequency: float = Field(..., description="Training frequency (sessions per week)")
    leverage: str = Field(..., description="Leverage type (S=Short, M=Medium, L=Long)")
    damage_tier: str = Field(..., description="Volume tolerance suggestion (+, 0, -)")

    class Config:
        json_schema_extra = {
            "example": {
                "region_id": "sternocostal",
                "display_name": "Mid-Lower Chest",
                "parent_group": "chest",
                "stimulus": 4.47,
                "atrophy": 0.56,
                "net_stimulus": 3.91,
                "primary_sets": 6,
                "prime_sets": 6,
                "secondary_sets": 3,
                "tertiary_sets": 0,
                "frequency": 2,
                "leverage": "M",
                "damage_tier": "-"
            }
        }


class MuscleGroupSummary(BaseModel):
    """Summary stats for a parent muscle group"""
    group: str = Field(..., description="Parent group name (e.g., 'chest')")
    total_net_stimulus: float = Field(..., description="Combined net stimulus of all regions")
    total_sets: int = Field(..., description="Combined sets across all regions")
    regions: List[str] = Field(..., description="List of region IDs in this group")


# ============================================================================
# OPTIMIZATION & SUMMARY
# ============================================================================

class OptimizationSuggestion(BaseModel):
    """A single optimization suggestion"""
    priority: str = Field(..., description="Priority level (HIGH, MEDIUM, LOW)")
    muscle: str = Field(..., description="Target muscle region")
    issue: str = Field(..., description="Issue identified")
    suggestion: str = Field(..., description="Recommended action")


class SummaryStats(BaseModel):
    """Overall summary statistics"""
    total_sets: int
    muscles_trained: int
    total_muscles: int = Field(default=29, description="Total muscle regions (always 29)")
    avg_net_stimulus: float
    avg_sets_per_muscle: float
    group_summaries: Optional[List[MuscleGroupSummary]] = Field(
        default=None, description="Per-group stimulus summaries"
    )


# ============================================================================
# STIMULUS BREAKDOWN MODELS
# ============================================================================

class SetBreakdown(BaseModel):
    """Breakdown of a single set's stimulus for one muscle"""
    set_number: int = Field(..., description="Set number (1-indexed)")
    weight: float = Field(..., description="Input weight (after leverage redistribution)")
    recovery_multiplier: float = Field(..., description="Recovery penalty (0.0-1.0, 1.0 = fully recovered)")
    bilateral_multiplier: float = Field(..., description="Bilateral/unilateral modifier (0.95/1.0/1.05)")
    local_multiplier: float = Field(..., description="Diminishing returns curve value")
    global_multiplier: float = Field(..., description="CNS fatigue multiplier")
    consecutive_day_multiplier: float = Field(default=1.0, description="Consecutive training day penalty (0.25-1.0)")
    final_stimulus: float = Field(..., description="Product of all modifiers")


class MuscleContribution(BaseModel):
    """One muscle's contribution breakdown for an exercise"""
    muscle_id: str = Field(..., description="Muscle region identifier")
    display_name: str = Field(..., description="Human-readable muscle name")
    tier: str = Field(..., description="Stimulus tier (prime/secondary/tertiary/quaternary)")
    base_weight: float = Field(..., description="Original pattern weight before leverage redistribution")
    leverage_weight: float = Field(..., description="Weight after leverage redistribution")
    sets: List[SetBreakdown] = Field(..., description="Per-set breakdown data")
    total_stimulus: float = Field(..., description="Sum of final_stimulus across all sets")


class ExerciseBreakdown(BaseModel):
    """Full breakdown of an exercise's stimulus across all muscles"""
    name: str = Field(..., description="Exercise name")
    pattern: str = Field(..., description="Matched movement pattern")
    sets: int = Field(..., description="Number of sets")
    resistance_profile: str = Field(..., description="Resistance profile (ascending/mid/descending)")
    is_bilateral: bool = Field(..., description="Whether exercise is bilateral")
    is_unilateral: bool = Field(..., description="Whether exercise is unilateral")
    axial_load: float = Field(..., description="Axial/spinal loading factor")
    muscle_contributions: List[MuscleContribution] = Field(..., description="Per-muscle breakdowns")


class SessionBreakdown(BaseModel):
    """Breakdown of all exercises in a session"""
    session_name: str = Field(..., description="Session name")
    day_number: int = Field(..., description="Day number in cycle")
    exercises: List[ExerciseBreakdown] = Field(..., description="Per-exercise breakdowns")
    cumulative_sets: int = Field(..., description="Total sets in session")
    cumulative_axial_fatigue: float = Field(..., description="Final axial fatigue level")
    final_cns_multiplier: float = Field(..., description="CNS multiplier at end of session")
    consecutive_days: int = Field(default=1, description="Number of consecutive training days")
    consecutive_day_penalty: float = Field(default=1.0, description="MUR penalty from consecutive training (0.25-1.0)")


# ============================================================================
# ANALYSIS RESPONSE
# ============================================================================

class AnalysisResponse(BaseModel):
    """Complete analysis response with 29-region muscle model"""
    split_name: str
    cycle_length: int
    stimulus_duration: int
    maintenance_volume: int
    dataset: str
    muscles: List[MuscleStats] = Field(..., description="Per-region stimulus data")
    group_summaries: List[MuscleGroupSummary] = Field(..., description="Per-group summaries")
    suggestions: List[OptimizationSuggestion]
    summary: SummaryStats
    session_breakdowns: Optional[List[SessionBreakdown]] = Field(
        default=None, description="Per-session stimulus calculation breakdowns"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "split_name": "Push/Pull/Legs",
                "cycle_length": 4,
                "stimulus_duration": 48,
                "maintenance_volume": 4,
                "dataset": "average",
                "muscles": [
                    {
                        "region_id": "sternocostal",
                        "display_name": "Mid-Lower Chest",
                        "parent_group": "chest",
                        "stimulus": 4.47,
                        "atrophy": 0.56,
                        "net_stimulus": 3.91,
                        "primary_sets": 6,
                        "prime_sets": 6,
                        "secondary_sets": 3,
                        "tertiary_sets": 0,
                        "frequency": 2,
                        "leverage": "M",
                        "damage_tier": "-"
                    }
                ],
                "group_summaries": [
                    {
                        "group": "chest",
                        "total_net_stimulus": 6.59,
                        "total_sets": 9,
                        "regions": ["clavicular", "sternocostal"]
                    }
                ],
                "suggestions": [],
                "summary": {
                    "total_sets": 45,
                    "muscles_trained": 22,
                    "total_muscles": 29,
                    "avg_net_stimulus": 2.5,
                    "avg_sets_per_muscle": 2.0
                }
            }
        }


# ============================================================================
# MUSCLE REGION REFERENCE
# ============================================================================

class MuscleRegionInfo(BaseModel):
    """Information about a single muscle region"""
    region_id: str = Field(..., description="Unique identifier")
    display_name: str = Field(..., description="Human-readable name")
    parent_group: str = Field(..., description="Parent muscle group")
    leverage: str = Field(..., description="Leverage type (S/M/L) - optimal force position")
    damage_tier: str = Field(..., description="Volume tolerance (+/0/-) - soft recommendation")
    recovery_modifier: float = Field(..., description="Recovery time multiplier")
    axial_fatigue_contributor: bool = Field(..., description="Contributes to spinal fatigue")
    primary_actions: List[str] = Field(..., description="Primary movement actions")
    notes: Optional[str] = Field(None, description="Additional notes")


class MuscleRegionsResponse(BaseModel):
    """List of all muscle regions"""
    regions: List[MuscleRegionInfo]
    total_count: int
    parent_groups: List[str] = Field(..., description="List of unique parent groups")


# ============================================================================
# TIERED PATTERN TARGETS
# ============================================================================

class TieredTargets(BaseModel):
    """Muscle targets organized by stimulus tier"""
    prime: Dict[str, float] = Field(default_factory=dict, description="Prime movers (full penalty)")
    secondary: Dict[str, float] = Field(default_factory=dict, description="Secondary movers (60% penalty)")
    tertiary: Dict[str, float] = Field(default_factory=dict, description="Tertiary movers (35% penalty)")
    quaternary: Dict[str, float] = Field(default_factory=dict, description="Stabilizers (15% penalty)")


class PatternInfo(BaseModel):
    """Information about a movement pattern"""
    name: str = Field(..., description="Pattern identifier")
    display_name: str = Field(..., description="Human-readable name")
    tiered_targets: TieredTargets = Field(..., description="Muscle targets by tier")
    bilateral: bool = Field(..., description="Is this a bilateral movement")
    axial_load: float = Field(..., description="Spinal loading factor (0.0-1.0)")
    resistance_profile: str = Field(default="mid", description="Resistance profile (ascending/mid/descending)")
    notes: Optional[str] = Field(None, description="Additional notes")


class PatternsResponse(BaseModel):
    """List of all movement patterns"""
    patterns: List[PatternInfo]
    total_count: int


# ============================================================================
# EXERCISE PARSING
# ============================================================================

class ExerciseParseResponse(BaseModel):
    """Response from exercise parsing with tiered targets"""
    original_text: str
    recognized: bool
    pattern: Optional[str] = None
    pattern_name: Optional[str] = None
    tiered_targets: Optional[TieredTargets] = None
    bilateral: bool = False
    unilateral: bool = False
    axial_load: float = 0.0
    resistance_profile: str = Field(default="mid", description="Resistance profile (ascending/mid/descending)")
    confidence: str = Field(default="unknown", description="Confidence level (high, medium, low)")

    class Config:
        json_schema_extra = {
            "example": {
                "original_text": "Bench Press",
                "recognized": True,
                "pattern": "humeral_adduction_compound",
                "pattern_name": "Humeral Adduction Compound",
                "tiered_targets": {
                    "prime": {"sternocostal": 0.70},
                    "secondary": {"clavicular": 0.15, "anterior_deltoid": 0.10},
                    "tertiary": {"triceps_lateral_medial": 0.05},
                    "quaternary": {}
                },
                "bilateral": True,
                "unilateral": False,
                "axial_load": 0.0,
                "resistance_profile": "mid",
                "confidence": "high"
            }
        }
