from datetime import date

import pytest
from pydantic import ValidationError

from api.dependencies import AuthUser
from api.routes import social as social_routes
from api.routes.social import _canonical_pair
from core.muscle_regions import get_all_muscle_regions
from schemas.social import ProfileUpsert, SocialPublishRequest


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
