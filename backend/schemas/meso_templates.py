"""Meso template schemas"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class MesoTemplateCreate(BaseModel):
    name: str
    source_meso_id: str
    notes: Optional[str] = None


class MesoTemplateExercise(BaseModel):
    exercise_name: str
    sets: int
    order_index: int
    unilateral: bool = False
    resistance_profile: Optional[str] = None


class MesoTemplateSession(BaseModel):
    name: str
    day_of_week: int  # 0=Mon, 6=Sun
    order_index: int
    exercises: list[MesoTemplateExercise]


class MesoTemplateWeek(BaseModel):
    week_index: int
    deload: bool = False
    sessions: list[MesoTemplateSession]


class MesoTemplateResponse(BaseModel):
    id: str
    user_id: str
    name: str
    focus: Optional[str] = None
    progression_type: Optional[str] = None
    notes: Optional[str] = None
    weeks: list[MesoTemplateWeek]
    created_at: str


class MesoTemplateListResponse(BaseModel):
    id: str
    name: str
    focus: Optional[str] = None
    week_count: int
    created_at: str


class ApplyMesoTemplateRequest(BaseModel):
    macro_id: str
    start_date: str  # yyyy-MM-dd
    name: Optional[str] = None
