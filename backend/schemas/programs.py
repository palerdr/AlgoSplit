"""
Pydantic schemas for program management
"""

from typing import Annotated, List, Optional
from datetime import datetime, date
from pydantic import BaseModel, Field
from schemas.constraints import (
    MAX_MAINTENANCE_VOLUME, MAX_STIMULUS_DURATION,
    MIN_MAINTENANCE_VOLUME, MIN_STIMULUS_DURATION,
)


# ============================================================================
# Session Template Schemas
# ============================================================================

class TemplateExerciseCreate(BaseModel):
    """Exercise within a session template"""
    exercise_name: str = Field(..., min_length=1, description="Exercise name")
    sets: int = Field(..., gt=0, description="Number of sets")
    order_index: int = Field(default=0, ge=0, description="Order within template")
    unilateral: bool = Field(default=False, description="Whether performed unilaterally")
    resistance_profile: Optional[str] = Field(
        default=None,
        pattern="^(ascending|mid|descending)$",
        description="Resistance profile override",
    )

class TemplateExerciseResponse(BaseModel):
    """Template exercise response"""
    id: str = Field(..., description="Exercise ID")
    template_id: str = Field(..., description="Parent template ID")
    exercise_name: str = Field(..., description="Exercise name")
    sets: int = Field(..., description="Number of sets")
    order_index: int = Field(..., description="Order within template")
    unilateral: bool = Field(default=False)
    resistance_profile: Optional[str] = Field(default=None)
    created_at: datetime = Field(..., description="Creation timestamp")

class SessionTemplateCreate(BaseModel):
    """Request to create a session template"""
    name: str = Field(..., min_length=1, max_length=200, description="Template name")
    exercises: List[TemplateExerciseCreate] = Field(..., min_items=1, description="Exercises in template")
    notes: Optional[str] = Field(default=None, max_length=1000)

class SessionTemplateUpdate(BaseModel):
    """Request to update a session template (full replacement of exercises)"""
    name: str = Field(..., min_length=1, max_length=200, description="Template name")
    exercises: List[TemplateExerciseCreate] = Field(..., min_items=1, description="Exercises in template")
    notes: Optional[str] = Field(default=None, max_length=1000)

class SessionTemplateResponse(BaseModel):
    """Session template response"""
    id: str
    user_id: str
    name: str
    source_session_id: Optional[str] = None
    source_split_id: Optional[str] = None
    notes: Optional[str] = None
    exercises: List[TemplateExerciseResponse] = Field(default=[])
    created_at: datetime
    updated_at: datetime

class SessionTemplateListResponse(BaseModel):
    templates: List[SessionTemplateResponse] = Field(default=[])
    total: int


# ============================================================================
# Program Schemas
# ============================================================================

class ProgramCreate(BaseModel):
    """Request to create a program"""
    name: str = Field(..., min_length=1, max_length=200, description="Program name")
    start_date: Optional[date] = Field(default=None, description="Program start date")
    end_date: Optional[date] = Field(default=None, description="Program end date")
    goal: Optional[str] = Field(default=None, max_length=500, description="Training goal")
    stimulus_duration: int = Field(default=48, ge=MIN_STIMULUS_DURATION, le=MAX_STIMULUS_DURATION, description="Hours of elevated MPS")
    maintenance_volume: int = Field(default=4, ge=MIN_MAINTENANCE_VOLUME, le=MAX_MAINTENANCE_VOLUME, description="Maintenance sets")
    dataset: str = Field(default="schoenfeld", pattern="^(schoenfeld|pelland|average)$")

class ProgramUpdate(BaseModel):
    """Request to update a program"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    goal: Optional[str] = Field(None, max_length=500)
    status: Optional[str] = Field(None, pattern="^(draft|active|completed|archived)$")
    stimulus_duration: Optional[int] = Field(None, ge=MIN_STIMULUS_DURATION, le=MAX_STIMULUS_DURATION)
    maintenance_volume: Optional[int] = Field(None, ge=MIN_MAINTENANCE_VOLUME, le=MAX_MAINTENANCE_VOLUME)
    dataset: Optional[str] = Field(None, pattern="^(schoenfeld|pelland|average)$")

class ProgramResponse(BaseModel):
    """Program response"""
    id: str
    user_id: str
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    goal: Optional[str] = None
    status: str = "draft"
    stimulus_duration: int = 48
    maintenance_volume: int = 4
    dataset: str = "schoenfeld"
    session_count: int = Field(default=0, description="Number of scheduled sessions")
    created_at: datetime
    updated_at: datetime

class ProgramListResponse(BaseModel):
    programs: List[ProgramResponse] = Field(default=[])
    total: int

class ProgramDetailResponse(BaseModel):
    """Program detail with sessions"""
    id: str
    user_id: str
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    goal: Optional[str] = None
    status: str = "draft"
    stimulus_duration: int = 48
    maintenance_volume: int = 4
    dataset: str = "schoenfeld"
    sessions: List["ProgramSessionResponse"] = Field(default=[])
    created_at: datetime
    updated_at: datetime


# ============================================================================
# Program Session Schemas
# ============================================================================

class ProgramSessionExerciseResponse(BaseModel):
    """Exercise override on a program session"""
    id: str
    program_session_id: str
    exercise_name: str
    sets: int
    order_index: int
    unilateral: bool = False
    resistance_profile: Optional[str] = None
    created_at: datetime

class ProgramSessionCreate(BaseModel):
    """Schedule a session on a program calendar"""
    date: Annotated[date, Field(..., description="Calendar date")]
    template_id: Optional[str] = Field(default=None, description="Session template to use")
    custom_name: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=1000)

class ProgramSessionUpdate(BaseModel):
    """Update a scheduled session"""
    date: Annotated[Optional[date], Field(default=None)]
    template_id: Optional[str] = None
    custom_name: Optional[str] = Field(None, max_length=200)
    status: Optional[str] = Field(None, pattern="^(planned|completed|skipped)$")
    notes: Optional[str] = Field(None, max_length=1000)

class ProgramSessionResponse(BaseModel):
    """Scheduled session response"""
    id: str
    program_id: str
    micro_id: Optional[str] = None
    date: Annotated[date, Field()]
    template_id: Optional[str] = None
    template_name: Optional[str] = None
    custom_name: Optional[str] = None
    status: str = "planned"
    notes: Optional[str] = None
    workout_log_id: Optional[str] = None
    exercises: List[ProgramSessionExerciseResponse] = Field(default=[])
    created_at: datetime
    updated_at: datetime

class ProgramSessionListResponse(BaseModel):
    sessions: List[ProgramSessionResponse] = Field(default=[])
    total: int

class ProgramSessionBatchCreate(BaseModel):
    """Schedule multiple sessions at once"""
    sessions: List[ProgramSessionCreate] = Field(..., min_items=1)


# ============================================================================
# Program Session From Split
# ============================================================================

class CreateTemplateFromSession(BaseModel):
    """Create a template from a saved split session"""
    session_id: str = Field(..., description="ID of the split session to clone")
    name: Optional[str] = Field(default=None, description="Override template name")


# ============================================================================
# Resolved Exercise / Today Sessions
# ============================================================================

class ResolvedExercise(BaseModel):
    """Exercise resolved from template or session overrides"""
    exercise_name: str
    sets: int
    order_index: int
    unilateral: bool = False
    resistance_profile: Optional[str] = None

class ResolvedExerciseList(BaseModel):
    exercises: List[ResolvedExercise] = Field(default=[])

class TodaySessionItem(BaseModel):
    """A program session scheduled for today"""
    id: str
    program_id: str
    program_name: str
    date: date
    display_name: str
    status: str
    template_id: Optional[str] = None

class TodaySessionsResponse(BaseModel):
    sessions: List[TodaySessionItem] = Field(default=[])


# ============================================================================
# Diagnostics Schemas
# ============================================================================

class DiagnosticsRequest(BaseModel):
    """Request diagnostics for a program"""
    level: str = Field(default="session", pattern="^(session|micro|meso|macro)$")
    target_id: Optional[str] = Field(default=None, description="Session/micro/meso ID to analyze")


# Forward ref update
ProgramDetailResponse.model_rebuild()
