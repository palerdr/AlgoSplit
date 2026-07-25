from datetime import date

import pytest
from pydantic import ValidationError

from api.dependencies import AuthUser
from api.routes import social as social_routes
from api.routes.social import _canonical_pair
from core.muscle_regions import get_all_muscle_regions
from schemas.social import FriendRequestCreate, ProfileUpsert, SocialPublishRequest


def _all_regions(value: float = 2.0) -> dict[str, float]:
    return {region_id: value for region_id in get_all_muscle_regions()}


def test_social_snapshot_requires_the_complete_sanitized_region_model():
    payload = SocialPublishRequest(
        region_stimulus=_all_regions(),
        calculation_window_start=date(2026, 7, 17),
        calculation_window_end=date(2026, 7, 23),
    )
    assert len(payload.region_stimulus) == 29

    incomplete = _all_regions()
    incomplete.pop(next(iter(incomplete)))
    with pytest.raises(ValidationError, match="all 29 regions"):
        SocialPublishRequest(
            region_stimulus=incomplete,
            calculation_window_start=date(2026, 7, 17),
            calculation_window_end=date(2026, 7, 23),
        )


def test_social_snapshot_rejects_reversed_calculation_window():
    with pytest.raises(ValidationError, match="window start"):
        SocialPublishRequest(
            region_stimulus=_all_regions(),
            calculation_window_start=date(2026, 7, 24),
            calculation_window_end=date(2026, 7, 23),
        )


def test_friendship_pair_is_canonical_and_rejects_self_friendship():
    first = "00000000-0000-0000-0000-000000000002"
    second = "00000000-0000-0000-0000-000000000001"
    assert _canonical_pair(first, second) == (second, first)

    with pytest.raises(Exception) as exc_info:
        _canonical_pair(first, first)
    assert getattr(exc_info.value, "status_code", None) == 400


def test_profile_creation_uses_one_normalized_username(monkeypatch, fake_supabase):
    user = AuthUser(
        user_id="00000000-0000-0000-0000-000000000123",
        email="profile@example.test",
        access_token="profile-token",
    )
    monkeypatch.setattr(social_routes, "_client", lambda _user: fake_supabase)

    saved = social_routes.put_profile(ProfileUpsert(handle="Lift_Buddy"), user)

    assert saved.handle == "lift_buddy"
    assert saved.display_name == "lift_buddy"
    assert fake_supabase.tables["profiles"] == [
        {
            "id": "profile-1",
            "user_id": user.id,
            "handle": "lift_buddy",
            "display_name": "lift_buddy",
            "avatar_url": None,
            "discoverable": True,
        }
    ]
    assert fake_supabase.tables["friend_visibility_settings"][0]["owner_id"] == user.id


def test_profile_creation_contract_requires_only_a_username():
    schema = ProfileUpsert.model_json_schema()

    assert schema["required"] == ["handle"]
    assert "display_name" not in schema["properties"]


def test_friend_request_by_exact_username_creates_a_real_pending_relationship(
    monkeypatch,
    fake_supabase,
):
    user = AuthUser(
        user_id="user-123",
        email="requester@example.test",
        access_token="requester-token",
    )
    fake_supabase.tables["profiles"] = [
        {
            "id": "profile-owner",
            "user_id": user.id,
            "handle": "requester",
            "display_name": "requester",
            "avatar_url": None,
            "discoverable": True,
        },
        {
            "id": "profile-friend",
            "user_id": "user-456",
            "handle": "lift_buddy",
            "display_name": "lift_buddy",
            "avatar_url": None,
            "discoverable": True,
        },
    ]
    monkeypatch.setattr(social_routes, "_client", lambda _user: fake_supabase)

    response = social_routes.request_friend(FriendRequestCreate(handle="lift_buddy"), user)

    assert response.profile.handle == "lift_buddy"
    assert response.direction == "outgoing"
    assert response.state == "pending"
    assert fake_supabase.tables["friendships"][0]["requester_id"] == user.id
    assert {
        fake_supabase.tables["friendships"][0]["user_low"],
        fake_supabase.tables["friendships"][0]["user_high"],
    } == {user.id, "user-456"}


def test_snapshot_publication_is_readable_as_current_and_exposes_independent_activity(
    monkeypatch,
    fake_supabase,
):
    user = AuthUser(
        user_id="user-123",
        email="publisher@example.test",
        access_token="publisher-token",
    )
    friend_id = "user-456"
    fake_supabase.tables["friendships"] = [
        {
            "id": "friendship-1",
            "user_low": min(user.id, friend_id),
            "user_high": max(user.id, friend_id),
            "requester_id": friend_id,
            "status": "accepted",
            "requested_at": "2026-07-20T12:00:00Z",
            "responded_at": "2026-07-20T13:00:00Z",
            "blocked_by": None,
            "updated_at": "2026-07-20T13:00:00Z",
        }
    ]
    monkeypatch.setattr(social_routes, "_client", lambda _user: fake_supabase)
    payload = SocialPublishRequest(
        region_stimulus=_all_regions(3.0),
        calculation_window_start=date(2026, 7, 18),
        calculation_window_end=date(2026, 7, 24),
        weekly_activity={
            "week_start": date(2026, 7, 18),
            "week_end": date(2026, 7, 24),
            "workouts_completed": 3,
            "planned_workouts": None,
            "consistency_percent": 43,
            "snapshot_date": date(2026, 7, 24),
        },
        lift_trends=[
            {
                "exercise_name": "Bench Press",
                "change_percent": 8.5,
                "period_label": "4 weeks",
            }
        ],
    )

    published = social_routes.publish_snapshot(payload, user)
    current = social_routes.get_current_snapshot(user)
    # Simulate the accepted friend querying independently visible activity.
    friend_user = AuthUser(
        user_id=friend_id,
        email="friend@example.test",
        access_token="friend-token",
    )
    activity = social_routes.get_friend_activity(user.id, friend_user)

    assert published.id == current.id
    assert current.region_stimulus == _all_regions(3.0)
    assert activity.weekly_activity is not None
    assert activity.weekly_activity.workouts_completed == 3
    assert [trend.exercise_name for trend in activity.lift_trends] == ["Bench Press"]

    social_routes.publish_snapshot(
        payload.model_copy(update={"lift_trends": []}),
        user,
    )
    cleared_activity = social_routes.get_friend_activity(user.id, friend_user)
    assert cleared_activity.lift_trends == []
