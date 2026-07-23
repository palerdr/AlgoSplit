import hashlib
import json
import re
from datetime import datetime, timedelta, timezone

from main import RATE_LIMIT_RULES


def _split_payload(name: str = "Shareable PPL") -> dict:
    return {
        "name": name,
        "cycle_length": 7,
        "stimulus_duration": 48,
        "maintenance_volume": 4,
        "dataset": "average",
        "sessions": [
            {
                "name": "Push",
                "day_number": 1,
                "exercises": [
                    {
                        "name": "Bench Press",
                        "sets": 4,
                        "unilateral": False,
                        "resistance_profile": "mid",
                    }
                ],
            },
            {
                "name": "Pull",
                "day_number": 3,
                "exercises": [{"name": "Barbell Row", "sets": 3}],
            },
        ],
    }


def _create_split(client, name: str = "Shareable PPL") -> dict:
    response = client.post("/api/splits", json=_split_payload(name))
    assert response.status_code == 201
    return response.json()


def _assert_no_private_fields(value) -> None:
    forbidden = {
        "id",
        "user_id",
        "split_id",
        "session_id",
        "source_split_id",
        "created_at",
        "updated_at",
    }
    if isinstance(value, dict):
        assert forbidden.isdisjoint(value)
        for child in value.values():
            _assert_no_private_fields(child)
    elif isinstance(value, list):
        for child in value:
            _assert_no_private_fields(child)


def test_create_and_resolve_share_stores_only_hash_and_sanitized_snapshot(
    client,
    fake_supabase,
):
    split = _create_split(client)

    response = client.post(f"/api/splits/{split['id']}/shares")

    assert response.status_code == 201
    body = response.json()
    token = body["token"]
    assert re.fullmatch(r"[A-Za-z0-9_-]{43}", token)
    assert body["active_count"] == 1
    assert body["review_exercises"] == []

    expires_at = datetime.fromisoformat(body["expires_at"].replace("Z", "+00:00"))
    expected_expiry = datetime.now(timezone.utc) + timedelta(days=30)
    assert abs((expires_at - expected_expiry).total_seconds()) < 5

    assert len(fake_supabase.tables["split_shares"]) == 1
    stored = fake_supabase.tables["split_shares"][0]
    assert stored["token_hash"] == hashlib.sha256(token.encode("ascii")).hexdigest()
    assert token not in json.dumps(stored)
    assert set(stored["snapshot"]) == {
        "name",
        "cycle_length",
        "stimulus_duration",
        "maintenance_volume",
        "dataset",
        "sessions",
    }
    _assert_no_private_fields(stored["snapshot"])

    # The snapshot is independent of later changes to the source split.
    fake_supabase.tables["splits"][0]["name"] = "Changed after sharing"
    stored["snapshot"]["user_id"] = "legacy-extra-field"
    stored["snapshot"]["sessions"][0]["id"] = "legacy-session-id"

    public_response = client.get(f"/api/split-shares/{token}")

    assert public_response.status_code == 200
    assert "no-store" in public_response.headers["cache-control"]
    public_body = public_response.json()
    assert public_body["review_exercises"] == []
    assert public_body["split"]["name"] == "Shareable PPL"
    assert public_body["split"]["sessions"][0]["exercises"][0] == {
        "name": "Bench Press",
        "sets": 4,
        "unilateral": False,
        "resistance_profile": "mid",
    }
    _assert_no_private_fields(public_body["split"])


def test_owner_scoped_exercises_are_frozen_and_block_copy(
    client,
    fake_supabase,
):
    split = _create_split(client)
    fake_supabase.tables["custom_exercises"].append(
        {"user_id": "user-123", "exercise_name": "  bench PRESS "}
    )
    fake_supabase.tables["exercise_overrides"].append(
        {"user_id": "user-123", "exercise_name": "barbell row"}
    )

    created = client.post(f"/api/splits/{split['id']}/shares")

    assert created.status_code == 201
    share = created.json()
    assert share["review_exercises"] == ["Barbell Row", "Bench Press"]
    stored = fake_supabase.tables["split_shares"][0]
    assert stored["nonportable_exercises"] == ["Barbell Row", "Bench Press"]

    # Review metadata is immutable even if the owner later removes definitions.
    fake_supabase.tables["custom_exercises"] = []
    fake_supabase.tables["exercise_overrides"] = []
    public = client.get(f"/api/split-shares/{share['token']}")
    assert public.status_code == 200
    assert public.json()["review_exercises"] == ["Barbell Row", "Bench Press"]

    copied = client.post(f"/api/split-shares/{share['token']}/copy")
    assert copied.status_code == 409
    assert copied.json() == {
        "detail": {
            "message": "Review these exercises before copying the shared split",
            "review_exercises": ["Barbell Row", "Bench Press"],
        }
    }
    assert len(fake_supabase.tables["splits"]) == 1
    assert fake_supabase.tables["split_share_copies"] == []


def test_recipient_normalized_name_conflicts_block_copy(client, fake_supabase):
    split = _create_split(client)
    share = client.post(f"/api/splits/{split['id']}/shares").json()
    assert share["review_exercises"] == []

    fake_supabase.tables["custom_exercises"].append(
        {"user_id": "user-123", "exercise_name": "  barbell row "}
    )
    fake_supabase.tables["exercise_overrides"].append(
        {"user_id": "user-123", "exercise_name": "bench PRESS"}
    )
    # Unrelated definitions remain safe even when normalization is applied.
    fake_supabase.tables["custom_exercises"].append(
        {"user_id": "user-123", "exercise_name": "Incline Bench Press"}
    )

    response = client.post(f"/api/split-shares/{share['token']}/copy")

    assert response.status_code == 409
    assert response.json()["detail"]["review_exercises"] == [
        "Barbell Row",
        "Bench Press",
    ]
    assert len(fake_supabase.tables["splits"]) == 1


def test_copy_is_atomic_and_idempotent_for_recipient(client, fake_supabase):
    source = _create_split(client)
    share = client.post(f"/api/splits/{source['id']}/shares").json()
    fake_supabase.tables["splits"][0]["name"] = "Edited source"

    first = client.post(f"/api/split-shares/{share['token']}/copy")
    assert first.status_code == 200
    copied = first.json()
    assert copied["id"] != source["id"]
    assert copied["user_id"] == "user-123"
    assert copied["name"] == "Shareable PPL"

    # A later recipient conflict must not break response-loss retry behavior.
    fake_supabase.tables["custom_exercises"].append(
        {"user_id": "user-123", "exercise_name": "Bench Press"}
    )
    retry = client.post(f"/api/split-shares/{share['token']}/copy")
    assert retry.status_code == 200
    assert retry.json()["id"] == copied["id"]
    assert len(fake_supabase.tables["splits"]) == 2
    assert len(fake_supabase.tables["split_share_copies"]) == 1

    revoke = client.delete(f"/api/splits/{source['id']}/shares")
    assert revoke.status_code == 200
    assert fake_supabase.tables["split_share_copies"] == []
    assert len(fake_supabase.tables["splits"]) == 2
    assert client.post(
        f"/api/split-shares/{share['token']}/copy"
    ).status_code == 404


def test_copy_invalid_expired_and_revoked_tokens_share_generic_404(
    client,
    fake_supabase,
):
    split = _create_split(client)
    expected = {"detail": "Shared split not found"}

    invalid = client.post("/api/split-shares/not-a-valid-token/copy")
    assert invalid.status_code == 404
    assert invalid.json() == expected

    expired_share = client.post(f"/api/splits/{split['id']}/shares").json()
    fake_supabase.tables["split_shares"][0]["expires_at"] = (
        datetime.now(timezone.utc) - timedelta(seconds=1)
    ).isoformat()
    expired = client.post(
        f"/api/split-shares/{expired_share['token']}/copy"
    )
    assert expired.status_code == 404
    assert expired.json() == expected

    live_share = client.post(f"/api/splits/{split['id']}/shares").json()
    revoked = client.delete(f"/api/splits/{split['id']}/shares")
    assert revoked.status_code == 200
    revoked_copy = client.post(
        f"/api/split-shares/{live_share['token']}/copy"
    )
    assert revoked_copy.status_code == 404
    assert revoked_copy.json() == expected


def test_status_and_revoke_all_cover_every_link(client):
    split = _create_split(client)
    first = client.post(f"/api/splits/{split['id']}/shares").json()
    second = client.post(f"/api/splits/{split['id']}/shares").json()

    status_response = client.get(f"/api/splits/{split['id']}/shares/status")
    assert status_response.status_code == 200
    assert status_response.json() == {"active_count": 2}

    revoke_response = client.delete(f"/api/splits/{split['id']}/shares")
    assert revoke_response.status_code == 200
    assert revoke_response.json() == {"revoked_count": 2}

    assert client.get(
        f"/api/splits/{split['id']}/shares/status"
    ).json() == {"active_count": 0}
    for token in (first["token"], second["token"]):
        missing = client.get(f"/api/split-shares/{token}")
        assert missing.status_code == 404
        assert missing.json() == {"detail": "Shared split not found"}


def test_invalid_expired_and_revoked_tokens_have_identical_not_found_response(
    client,
    fake_supabase,
):
    split = _create_split(client)
    share = client.post(f"/api/splits/{split['id']}/shares").json()
    expected = {"detail": "Shared split not found"}

    invalid = client.get("/api/split-shares/not-a-valid-token")
    assert invalid.status_code == 404
    assert "no-store" in invalid.headers["cache-control"]
    assert invalid.json() == expected

    fake_supabase.tables["split_shares"][0]["expires_at"] = (
        datetime.now(timezone.utc) - timedelta(seconds=1)
    ).isoformat()
    expired = client.get(f"/api/split-shares/{share['token']}")
    assert expired.status_code == 404
    assert expired.json() == expected

    # Expired rows do not count as active, while revoke-all still removes them.
    status_response = client.get(f"/api/splits/{split['id']}/shares/status")
    assert status_response.json() == {"active_count": 0}
    revoke_response = client.delete(f"/api/splits/{split['id']}/shares")
    assert revoke_response.json() == {"revoked_count": 1}
    revoked = client.get(f"/api/split-shares/{share['token']}")
    assert revoked.status_code == 404
    assert revoked.json() == expected


def test_share_operations_hide_non_owned_or_missing_splits(client):
    for method, path in [
        ("post", "/api/splits/not-owned/shares"),
        ("get", "/api/splits/not-owned/shares/status"),
        ("delete", "/api/splits/not-owned/shares"),
    ]:
        response = getattr(client, method)(path)
        assert response.status_code == 404
        assert response.json() == {"detail": "Split not found"}


def test_oversized_snapshot_is_rejected_before_storage(client, fake_supabase):
    split = _create_split(client)
    session_id = fake_supabase.tables["sessions"][0]["id"]
    for index in range(700):
        fake_supabase.tables["exercises"].append(
            {
                "id": fake_supabase.next_id("exercises"),
                "session_id": session_id,
                "exercise_name": f"Exercise {index} " + ("x" * 100),
                "sets": 1,
                "order_index": index + 1,
                "unilateral": False,
                "resistance_profile": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    response = client.post(f"/api/splits/{split['id']}/shares")

    assert response.status_code == 413
    assert response.json() == {"detail": "Split is too large to share"}
    assert fake_supabase.tables["split_shares"] == []


def test_legacy_split_outside_current_contract_is_rejected_before_link_creation(
    client,
    fake_supabase,
):
    split = _create_split(client)
    fake_supabase.tables["splits"][0]["maintenance_volume"] = 0

    response = client.post(f"/api/splits/{split['id']}/shares")

    assert response.status_code == 409
    assert response.json() == {"detail": "Update this split before sharing it"}
    assert fake_supabase.tables["split_shares"] == []


def test_share_storage_is_capped_and_expired_rows_are_pruned(client, fake_supabase):
    split = _create_split(client)
    now = datetime.now(timezone.utc)
    for index in range(20):
        fake_supabase.tables["split_shares"].append(
            {
                "id": fake_supabase.next_id("split_shares"),
                "user_id": "user-123",
                "source_split_id": f"other-split-{index}",
                "token_hash": hashlib.sha256(f"existing-{index}".encode()).hexdigest(),
                "snapshot": _split_payload(f"Existing {index}"),
                "created_at": now.isoformat(),
                "expires_at": (now + timedelta(days=1)).isoformat(),
            }
        )

    blocked = client.post(f"/api/splits/{split['id']}/shares")
    assert blocked.status_code == 409
    assert blocked.json() == {
        "detail": "Revoke an existing share link before creating another"
    }

    fake_supabase.tables["split_shares"][0]["expires_at"] = (
        now - timedelta(seconds=1)
    ).isoformat()
    created = client.post(f"/api/splits/{split['id']}/shares")
    assert created.status_code == 201
    assert len(fake_supabase.tables["split_shares"]) == 20
    assert all(
        datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
        > datetime.now(timezone.utc)
        for row in fake_supabase.tables["split_shares"]
    )


def test_public_lookup_has_a_stricter_ip_rate_limit_than_general_api():
    public_rule_index = next(
        index
        for index, rule in enumerate(RATE_LIMIT_RULES)
        if "/api/split-shares/" in rule.prefixes
    )
    general_rule_index = next(
        index
        for index, rule in enumerate(RATE_LIMIT_RULES)
        if "/api/" in rule.prefixes
    )
    public_rule = RATE_LIMIT_RULES[public_rule_index]
    general_rule = RATE_LIMIT_RULES[general_rule_index]

    assert public_rule_index < general_rule_index
    assert public_rule.scope == "ip"
    assert public_rule.limit < general_rule.limit
