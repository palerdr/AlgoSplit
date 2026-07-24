"""Request and response contracts for the privacy-first social MVP."""

from datetime import date, datetime
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

from core.muscle_regions import get_all_muscle_regions


class ProfileUpsert(BaseModel):
    handle: str = Field(..., min_length=3, max_length=24, pattern=r"^[A-Za-z0-9_]+$")
    display_name: str = Field(..., min_length=1, max_length=60)
    avatar_url: Optional[str] = Field(default=None, max_length=2048)
    discoverable: bool = True

    @field_validator("handle")
    @classmethod
    def normalize_handle(cls, value: str) -> str:
        return value.strip().lower()

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        return value.strip()


class ProfileResponse(BaseModel):
    user_id: str
    handle: str
    display_name: str
    avatar_url: Optional[str] = None
    discoverable: Optional[bool] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FriendVisibilityUpdate(BaseModel):
    stimulus_body: bool = True
    weekly_activity: bool = False
    lift_progress: bool = False
    shared_splits: bool = True


class FriendVisibilityResponse(FriendVisibilityUpdate):
    owner_id: str
    updated_at: datetime


class FriendRequestCreate(BaseModel):
    handle: str = Field(..., min_length=3, max_length=24, pattern=r"^[A-Za-z0-9_]+$")

    @field_validator("handle")
    @classmethod
    def normalize_handle(cls, value: str) -> str:
        return value.strip().lower()


FriendshipState = Literal["pending", "accepted", "declined", "blocked"]
RequestDirection = Literal["incoming", "outgoing", "friend"]


class FriendshipResponse(BaseModel):
    id: str
    friend_id: str
    state: FriendshipState
    direction: RequestDirection
    profile: ProfileResponse
    requested_at: datetime
    responded_at: Optional[datetime] = None


class FriendListResponse(BaseModel):
    friends: List[FriendshipResponse] = Field(default_factory=list)
    incoming: List[FriendshipResponse] = Field(default_factory=list)
    outgoing: List[FriendshipResponse] = Field(default_factory=list)


class StimulusSnapshotPublish(BaseModel):
    region_stimulus: Dict[str, float]
    calculation_window_start: date
    calculation_window_end: date
    calculation_settings: Dict[str, object] = Field(default_factory=dict)
    source_analysis_updated_at: Optional[datetime] = None

    @field_validator("region_stimulus")
    @classmethod
    def validate_regions(cls, value: Dict[str, float]) -> Dict[str, float]:
        expected = set(get_all_muscle_regions())
        supplied = set(value)
        if supplied != expected:
            missing = sorted(expected - supplied)
            extra = sorted(supplied - expected)
            raise ValueError(
                f"region_stimulus must contain all 29 regions; missing={missing}, extra={extra}"
            )
        if any(not -1000 <= score <= 1000 for score in value.values()):
            raise ValueError("region stimulus values must be between -1000 and 1000")
        return value

    @model_validator(mode="after")
    def validate_window(self):
        if self.calculation_window_start > self.calculation_window_end:
            raise ValueError("calculation window start must not be after its end")
        return self


class WeeklyActivityPublish(BaseModel):
    week_start: date
    week_end: date
    workouts_completed: int = Field(..., ge=0, le=21)
    planned_workouts: Optional[int] = Field(default=None, ge=0, le=21)
    consistency_percent: int = Field(..., ge=0, le=100)
    snapshot_date: Optional[date] = None

    @model_validator(mode="after")
    def validate_window(self):
        if self.week_start > self.week_end:
            raise ValueError("week start must not be after week end")
        return self


class LiftTrendPublish(BaseModel):
    exercise_name: str = Field(..., min_length=1, max_length=120)
    change_percent: float = Field(..., ge=-999.99, le=999.99)
    period_label: str = Field(..., min_length=1, max_length=40)


class SocialPublishRequest(StimulusSnapshotPublish):
    weekly_activity: Optional[WeeklyActivityPublish] = None
    lift_trends: List[LiftTrendPublish] = Field(default_factory=list, max_length=5)


class WeeklyActivityResponse(WeeklyActivityPublish):
    id: str
    published_at: datetime


class LiftTrendResponse(LiftTrendPublish):
    id: str
    published_at: datetime


class StimulusSnapshotResponse(StimulusSnapshotPublish):
    id: str
    owner_id: str
    published_at: datetime
    weekly_activity: Optional[WeeklyActivityResponse] = None
    lift_trends: List[LiftTrendResponse] = Field(default_factory=list)


DifferenceState = Literal["ahead", "behind", "similar"]


class RegionDifference(BaseModel):
    region_id: str
    me: float
    friend: float
    delta: float
    state: DifferenceState


class SocialCompareResponse(BaseModel):
    me: StimulusSnapshotResponse
    friend: StimulusSnapshotResponse
    regions: List[RegionDifference]
    ahead_count: int
    behind_count: int
    similar_count: int
    explanation: str


class SplitShareCreate(BaseModel):
    recipient_id: Optional[str] = None


class SplitShareResponse(BaseModel):
    id: str
    owner_id: str
    recipient_id: Optional[str] = None
    split_name: str
    split_version: Dict[str, object]
    analysis_version: Optional[Dict[str, object]] = None
    published_at: datetime
    revoked_at: Optional[datetime] = None


class SharedSplitListResponse(BaseModel):
    shares: List[SplitShareResponse] = Field(default_factory=list)
