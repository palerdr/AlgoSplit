"""Privacy-first social routes.

All database access uses the caller's JWT, so the route checks below are
defense in depth on top of PostgreSQL RLS.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.dependencies import AuthUser, get_current_user
from db.supabase import get_supabase_client_with_token
from schemas.social import (
    FriendListResponse,
    FriendRequestCreate,
    FriendshipResponse,
    FriendVisibilityResponse,
    FriendVisibilityUpdate,
    LiftTrendResponse,
    ProfileResponse,
    ProfileUpsert,
    RegionDifference,
    SharedSplitListResponse,
    SocialCompareResponse,
    SocialPublishRequest,
    SplitShareCreate,
    SplitShareResponse,
    StimulusSnapshotResponse,
    WeeklyActivityResponse,
)
from schemas.splits import SplitCreate, SplitResponse


router = APIRouter(tags=["Social"])
logger = logging.getLogger("algosplit.social")


def _client(user: AuthUser):
    return get_supabase_client_with_token(user.access_token)


def _canonical_pair(first: str, second: str) -> tuple[str, str]:
    if first == second:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot add yourself as a friend.",
        )
    return tuple(sorted((first, second)))


def _relationship_with(supabase, user_id: str, other_id: str) -> Optional[dict[str, Any]]:
    low, high = _canonical_pair(user_id, other_id)
    result = (
        supabase.table("friendships")
        .select("*")
        .eq("user_low", low)
        .eq("user_high", high)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def _require_accepted(supabase, user_id: str, friend_id: str) -> dict[str, Any]:
    relationship = _relationship_with(supabase, user_id, friend_id)
    if not relationship or relationship["status"] != "accepted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend not found")
    return relationship


def _profile_response(row: dict[str, Any], *, include_private: bool = False) -> ProfileResponse:
    return ProfileResponse(
        user_id=row["user_id"],
        handle=row["handle"],
        display_name=row["display_name"],
        avatar_url=row.get("avatar_url"),
        discoverable=row.get("discoverable") if include_private else None,
        created_at=row.get("created_at") if include_private else None,
        updated_at=row.get("updated_at") if include_private else None,
    )


def _friendship_response(
    row: dict[str, Any],
    profile: dict[str, Any],
    current_user_id: str,
) -> FriendshipResponse:
    friend_id = row["user_high"] if row["user_low"] == current_user_id else row["user_low"]
    if row["status"] == "accepted":
        direction = "friend"
    else:
        direction = "outgoing" if row["requester_id"] == current_user_id else "incoming"
    return FriendshipResponse(
        id=row["id"],
        friend_id=friend_id,
        state=row["status"],
        direction=direction,
        profile=_profile_response(profile),
        requested_at=row["requested_at"],
        responded_at=row.get("responded_at"),
    )


@router.get("/api/profile", response_model=ProfileResponse)
def get_profile(current_user: AuthUser = Depends(get_current_user)):
    result = (
        _client(current_user).table("profiles").select("*")
        .eq("user_id", current_user.id).limit(1).execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not created")
    return _profile_response(result.data[0], include_private=True)


@router.put("/api/profile", response_model=ProfileResponse)
def put_profile(
    payload: ProfileUpsert,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    row = {"user_id": current_user.id, **payload.model_dump(mode="json")}
    try:
        result = supabase.table("profiles").upsert(row, on_conflict="user_id").execute()
        supabase.table("friend_visibility_settings").upsert(
            {"owner_id": current_user.id},
            on_conflict="owner_id",
        ).execute()
    except Exception as exc:
        if str(getattr(exc, "code", "")) == "23505" or "duplicate" in str(exc).lower():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="That username is already taken.",
            ) from exc
        logger.exception("Failed to save social profile for user %s", current_user.id)
        raise
    if not result.data:
        raise HTTPException(status_code=500, detail="Profile could not be saved")
    return _profile_response(result.data[0], include_private=True)


@router.get("/api/profiles/lookup", response_model=ProfileResponse)
def lookup_profile(
    handle: str = Query(..., min_length=3, max_length=24, pattern=r"^[A-Za-z0-9_]+$"),
    current_user: AuthUser = Depends(get_current_user),
):
    result = _client(current_user).rpc(
        "lookup_profile_by_handle",
        {"p_handle": handle.strip().lower()},
    ).execute()
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Username not found")
    row = result.data[0] if isinstance(result.data, list) else result.data
    return _profile_response(row)


@router.get("/api/profile/visibility", response_model=FriendVisibilityResponse)
def get_visibility(current_user: AuthUser = Depends(get_current_user)):
    result = (
        _client(current_user).table("friend_visibility_settings").select("*")
        .eq("owner_id", current_user.id).limit(1).execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not created")
    return FriendVisibilityResponse.model_validate(result.data[0])


@router.put("/api/profile/visibility", response_model=FriendVisibilityResponse)
def put_visibility(
    payload: FriendVisibilityUpdate,
    current_user: AuthUser = Depends(get_current_user),
):
    result = _client(current_user).table("friend_visibility_settings").upsert(
        {"owner_id": current_user.id, **payload.model_dump(mode="json")},
        on_conflict="owner_id",
    ).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Visibility settings could not be saved")
    return FriendVisibilityResponse.model_validate(result.data[0])


@router.post(
    "/api/friends/requests",
    response_model=FriendshipResponse,
    status_code=status.HTTP_201_CREATED,
)
def request_friend(
    payload: FriendRequestCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    lookup = supabase.rpc(
        "lookup_profile_by_handle",
        {"p_handle": payload.handle},
    ).execute()
    if not lookup.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Username not found")
    profile = lookup.data[0] if isinstance(lookup.data, list) else lookup.data
    target_id = profile["user_id"]
    low, high = _canonical_pair(current_user.id, target_id)
    existing = _relationship_with(supabase, current_user.id, target_id)
    if existing:
        if existing["status"] == "declined":
            supabase.table("friendships").delete().eq("id", existing["id"]).execute()
        elif existing["status"] == "blocked":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Username not found")
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A friendship or request already exists.",
            )
    result = supabase.table("friendships").insert({
        "user_low": low,
        "user_high": high,
        "requester_id": current_user.id,
        "status": "pending",
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Friend request could not be sent")
    return _friendship_response(result.data[0], profile, current_user.id)


@router.get("/api/friends", response_model=FriendListResponse)
def list_friends(current_user: AuthUser = Depends(get_current_user)):
    supabase = _client(current_user)
    rows = (
        supabase.table("friendships").select("*")
        .in_("status", ["pending", "accepted"])
        .order("updated_at", desc=True)
        .execute()
    ).data or []
    friend_ids = [
        row["user_high"] if row["user_low"] == current_user.id else row["user_low"]
        for row in rows
    ]
    profiles: dict[str, dict[str, Any]] = {}
    if friend_ids:
        profile_rows = (
            supabase.table("profiles").select("*").in_("user_id", friend_ids).execute()
        ).data or []
        profiles = {row["user_id"]: row for row in profile_rows}

    response = FriendListResponse()
    for row, friend_id in zip(rows, friend_ids):
        profile = profiles.get(friend_id)
        if not profile:
            continue
        item = _friendship_response(row, profile, current_user.id)
        if item.direction == "friend":
            response.friends.append(item)
        elif item.direction == "incoming":
            response.incoming.append(item)
        else:
            response.outgoing.append(item)
    return response


def _respond_to_request(
    request_id: str,
    next_state: str,
    current_user: AuthUser,
) -> FriendshipResponse:
    supabase = _client(current_user)
    existing = (
        supabase.table("friendships").select("*")
        .eq("id", request_id).limit(1).execute()
    )
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    row = existing.data[0]
    if row["status"] != "pending" or row["requester_id"] == current_user.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Request cannot be updated")
    friend_id = row["requester_id"]
    profile_result = (
        supabase.table("profiles").select("*").eq("user_id", friend_id).limit(1).execute()
    )
    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    updated = supabase.table("friendships").update({
        "status": next_state,
        "responded_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()
    if not updated.data:
        raise HTTPException(status_code=404, detail="Request not found")
    return _friendship_response(updated.data[0], profile_result.data[0], current_user.id)


@router.post("/api/friends/requests/{request_id}/accept", response_model=FriendshipResponse)
def accept_friend_request(
    request_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    return _respond_to_request(request_id, "accepted", current_user)


@router.post("/api/friends/requests/{request_id}/decline", response_model=FriendshipResponse)
def decline_friend_request(
    request_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    return _respond_to_request(request_id, "declined", current_user)


@router.delete("/api/friends/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(
    friend_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    relationship = _relationship_with(supabase, current_user.id, friend_id)
    if not relationship or relationship["status"] != "accepted":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend not found")
    supabase.table("friendships").delete().eq("id", relationship["id"]).execute()
    return None


@router.post("/api/friends/{friend_id}/block", status_code=status.HTTP_204_NO_CONTENT)
def block_user(
    friend_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    low, high = _canonical_pair(current_user.id, friend_id)
    relationship = _relationship_with(supabase, current_user.id, friend_id)
    values = {
        "status": "blocked",
        "blocked_by": current_user.id,
        "responded_at": datetime.now(timezone.utc).isoformat(),
    }
    if relationship:
        if relationship["status"] == "blocked" and relationship.get("blocked_by") != current_user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Friend not found")
        supabase.table("friendships").update(values).eq("id", relationship["id"]).execute()
    else:
        supabase.table("friendships").insert({
            "user_low": low,
            "user_high": high,
            "requester_id": current_user.id,
            **values,
        }).execute()
    return None


def _snapshot_response(
    row: dict[str, Any],
    activity: Optional[dict[str, Any]],
    lifts: list[dict[str, Any]],
) -> StimulusSnapshotResponse:
    return StimulusSnapshotResponse(
        **row,
        weekly_activity=WeeklyActivityResponse.model_validate(activity) if activity else None,
        lift_trends=[LiftTrendResponse.model_validate(lift) for lift in lifts],
    )


def _latest_snapshot(supabase, owner_id: str) -> StimulusSnapshotResponse:
    snapshot_result = (
        supabase.table("social_stimulus_snapshots").select("*")
        .eq("owner_id", owner_id).order("published_at", desc=True).limit(1).execute()
    )
    if not snapshot_result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared snapshot unavailable")
    activity_result = (
        supabase.table("social_weekly_activity_cards").select("*")
        .eq("owner_id", owner_id).order("published_at", desc=True).limit(1).execute()
    )
    lifts_result = (
        supabase.table("social_lift_trends").select("*")
        .eq("owner_id", owner_id).order("published_at", desc=True).limit(5).execute()
    )
    return _snapshot_response(
        snapshot_result.data[0],
        activity_result.data[0] if activity_result.data else None,
        lifts_result.data or [],
    )


@router.post(
    "/api/social/snapshots/publish",
    response_model=StimulusSnapshotResponse,
    status_code=status.HTTP_201_CREATED,
)
def publish_snapshot(
    payload: SocialPublishRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    snapshot_row = {
        "owner_id": current_user.id,
        **payload.model_dump(
            mode="json",
            exclude={"weekly_activity", "lift_trends"},
        ),
    }
    snapshot = supabase.table("social_stimulus_snapshots").insert(snapshot_row).execute()
    if not snapshot.data:
        raise HTTPException(status_code=500, detail="Snapshot could not be published")

    activity = None
    if payload.weekly_activity:
        activity_result = supabase.table("social_weekly_activity_cards").insert({
            "owner_id": current_user.id,
            **payload.weekly_activity.model_dump(mode="json"),
        }).execute()
        activity = activity_result.data[0] if activity_result.data else None

    lifts: list[dict[str, Any]] = []
    if payload.lift_trends:
        lift_result = supabase.table("social_lift_trends").insert([
            {"owner_id": current_user.id, **trend.model_dump(mode="json")}
            for trend in payload.lift_trends
        ]).execute()
        lifts = lift_result.data or []
    return _snapshot_response(snapshot.data[0], activity, lifts)


@router.get(
    "/api/friends/{friend_id}/snapshot",
    response_model=StimulusSnapshotResponse,
)
def get_friend_snapshot(
    friend_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    _require_accepted(supabase, current_user.id, friend_id)
    return _latest_snapshot(supabase, friend_id)


@router.get(
    "/api/friends/{friend_id}/compare",
    response_model=SocialCompareResponse,
)
def compare_friend(
    friend_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    _require_accepted(supabase, current_user.id, friend_id)
    mine = _latest_snapshot(supabase, current_user.id)
    theirs = _latest_snapshot(supabase, friend_id)
    regions: list[RegionDifference] = []
    for region_id in sorted(mine.region_stimulus):
        my_score = float(mine.region_stimulus[region_id])
        friend_score = float(theirs.region_stimulus.get(region_id, 0))
        delta = my_score - friend_score
        threshold = max(0.5, 0.10 * max(abs(my_score), abs(friend_score)))
        state_name = "similar" if abs(delta) <= threshold else ("ahead" if delta > 0 else "behind")
        regions.append(RegionDifference(
            region_id=region_id,
            me=round(my_score, 3),
            friend=round(friend_score, 3),
            delta=round(delta, 3),
            state=state_name,
        ))
    ahead = sum(item.state == "ahead" for item in regions)
    behind = sum(item.state == "behind" for item in regions)
    similar = len(regions) - ahead - behind
    if ahead == behind:
        explanation = (
            f"Your stimulus is broadly balanced: {similar} regions are meaningfully similar, "
            f"with {ahead} ahead and {behind} behind."
        )
    elif ahead > behind:
        explanation = (
            f"Your current window is ahead in {ahead} regions and behind in {behind}; "
            f"{similar} are meaningfully similar."
        )
    else:
        explanation = (
            f"Your friend is ahead in {behind} regions while you lead in {ahead}; "
            f"{similar} are meaningfully similar."
        )
    return SocialCompareResponse(
        me=mine,
        friend=theirs,
        regions=regions,
        ahead_count=ahead,
        behind_count=behind,
        similar_count=similar,
        explanation=explanation,
    )


def _serialize_split(split: SplitResponse) -> dict[str, Any]:
    return {
        "name": split.name,
        "cycle_length": split.cycle_length,
        "stimulus_duration": split.stimulus_duration,
        "maintenance_volume": split.maintenance_volume,
        "dataset": split.dataset,
        "sessions": [
            {
                "name": session.name,
                "day_number": session.day_number,
                "exercises": [
                    {
                        "name": exercise.exercise_name,
                        "sets": exercise.sets,
                        "unilateral": exercise.unilateral,
                        "resistance_profile": exercise.resistance_profile,
                    }
                    for exercise in session.exercises
                ],
            }
            for session in split.sessions
        ],
    }


@router.post(
    "/api/splits/{split_id}/share",
    response_model=SplitShareResponse,
    status_code=status.HTTP_201_CREATED,
)
def share_split(
    split_id: str,
    payload: SplitShareCreate,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    if payload.recipient_id:
        _require_accepted(supabase, current_user.id, payload.recipient_id)

    from api.routes.splits import analyze_split, get_split

    split = get_split(split_id, current_user)
    analysis = analyze_split(split_id, include_breakdowns=False, current_user=current_user)
    analysis_payload = (
        analysis.model_dump(mode="json") if hasattr(analysis, "model_dump") else analysis
    )
    result = supabase.table("social_split_shares").insert({
        "owner_id": current_user.id,
        "source_split_id": split_id,
        "recipient_id": payload.recipient_id,
        "split_name": split.name,
        "split_version": _serialize_split(split),
        "analysis_version": analysis_payload,
    }).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Split could not be shared")
    return SplitShareResponse.model_validate(result.data[0])


@router.get(
    "/api/friends/{friend_id}/shared-splits",
    response_model=SharedSplitListResponse,
)
def list_shared_splits(
    friend_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    _require_accepted(supabase, current_user.id, friend_id)
    result = (
        supabase.table("social_split_shares").select("*")
        .eq("owner_id", friend_id)
        .is_("revoked_at", "null")
        .order("published_at", desc=True)
        .execute()
    )
    return SharedSplitListResponse(
        shares=[SplitShareResponse.model_validate(row) for row in (result.data or [])]
    )


@router.post("/api/shared-splits/{share_id}/copy", response_model=SplitResponse)
def copy_shared_split(
    share_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    result = (
        supabase.table("social_split_shares").select("*")
        .eq("id", share_id).is_("revoked_at", "null").limit(1).execute()
    )
    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared split not found")
    share = result.data[0]
    payload = dict(share["split_version"])
    payload["name"] = f"{payload['name']} (copy)"
    from api.routes.splits import create_split
    return create_split(SplitCreate.model_validate(payload), current_user)


@router.delete("/api/split-shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_split_share(
    share_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    supabase = _client(current_user)
    existing = (
        supabase.table("social_split_shares").select("id")
        .eq("id", share_id).eq("owner_id", current_user.id).limit(1).execute()
    )
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")
    supabase.table("social_split_shares").update({
        "revoked_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", share_id).execute()
    return None
