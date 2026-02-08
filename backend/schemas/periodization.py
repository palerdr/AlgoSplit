"""
Pydantic schemas for periodization (macro/meso/micro cycles)
"""

from typing import Annotated, List, Optional
from datetime import datetime, date
from pydantic import BaseModel, Field


# ============================================================================
# Microcycle Schemas
# ============================================================================

class MicroCycleCreate(BaseModel):
    """Create a microcycle (training week)"""
    week_index: int = Field(..., ge=0, description="Week number within mesocycle")
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    deload: bool = Field(default=False, description="Whether this is a deload week")
    notes: Optional[str] = Field(default=None, max_length=1000)

class MicroCycleUpdate(BaseModel):
    week_index: Optional[int] = Field(None, ge=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    deload: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=1000)

class MicroCycleResponse(BaseModel):
    id: str
    meso_id: str
    week_index: int
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    deload: bool = False
    notes: Optional[str] = None
    session_ids: List[str] = Field(default=[])
    created_at: datetime
    updated_at: datetime

class MicroCycleListResponse(BaseModel):
    micros: List[MicroCycleResponse] = Field(default=[])
    total: int


# ============================================================================
# Mesocycle Schemas
# ============================================================================

class MesoCycleCreate(BaseModel):
    """Create a mesocycle (training block)"""
    name: str = Field(..., min_length=1, max_length=200)
    focus: Optional[str] = Field(default=None, max_length=200)
    order_index: int = Field(default=0, ge=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    progression_type: str = Field(default="linear", pattern="^(linear|undulating|block|custom)$")
    notes: Optional[str] = Field(default=None, max_length=1000)

class MesoCycleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    focus: Optional[str] = Field(None, max_length=200)
    order_index: Optional[int] = Field(None, ge=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    progression_type: Optional[str] = Field(None, pattern="^(linear|undulating|block|custom)$")
    notes: Optional[str] = Field(None, max_length=1000)

class MesoCycleResponse(BaseModel):
    id: str
    macro_id: str
    name: str
    focus: Optional[str] = None
    order_index: int = 0
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    progression_type: str = "linear"
    notes: Optional[str] = None
    micros: List[MicroCycleResponse] = Field(default=[])
    created_at: datetime
    updated_at: datetime

class MesoCycleListResponse(BaseModel):
    mesos: List[MesoCycleResponse] = Field(default=[])
    total: int


# ============================================================================
# Macrocycle Schemas
# ============================================================================

class MacroCycleCreate(BaseModel):
    """Create a macrocycle (training phase)"""
    name: str = Field(..., min_length=1, max_length=200)
    order_index: int = Field(default=0, ge=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=1000)

class MacroCycleUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    order_index: Optional[int] = Field(None, ge=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=1000)

class MacroCycleResponse(BaseModel):
    id: str
    program_id: str
    name: str
    order_index: int = 0
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    notes: Optional[str] = None
    mesos: List[MesoCycleResponse] = Field(default=[])
    created_at: datetime
    updated_at: datetime

class MacroCycleListResponse(BaseModel):
    macros: List[MacroCycleResponse] = Field(default=[])
    total: int


# ============================================================================
# Session Assignment
# ============================================================================

class AssignSessionsRequest(BaseModel):
    """Assign program sessions to a microcycle"""
    session_ids: List[str] = Field(..., min_length=1)
