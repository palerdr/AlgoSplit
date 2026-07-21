import api.routes.auth as auth_routes


def test_social_auth_config_is_public_and_exposes_only_publishable_values(client, monkeypatch):
    monkeypatch.setattr(auth_routes, "SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setattr(auth_routes, "SUPABASE_PUBLISHABLE_KEY", "sb_publishable_public")

    response = client.get("/auth/social-config")

    assert response.status_code == 200
    assert response.json() == {
        "supabase_url": "https://project.supabase.co",
        "supabase_publishable_key": "sb_publishable_public",
    }
    serialized = response.text.lower()
    assert "secret" not in serialized
    assert "service_role" not in serialized
    assert "google" not in serialized
    assert "apple" not in serialized


def test_signup_sets_auth_and_csrf_cookies(client):
    response = client.post(
        "/auth/signup",
        json={"email": "new-user@example.com", "password": "StrongPass123!"},
        headers={"X-AlgoSplit-Client": "native"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "new-user@example.com"
    assert body["token_type"] == "bearer"
    assert body["access_token"].startswith("token-")
    assert body["email_confirmation_required"] is False
    assert "algosplit_access_token" in response.cookies
    assert "algosplit_refresh_token" in response.cookies
    assert "algosplit_csrf_token" in response.cookies
    cookie_headers = response.headers.get_list("set-cookie")
    access_cookie = next(value for value in cookie_headers if value.startswith("algosplit_access_token="))
    refresh_cookie = next(value for value in cookie_headers if value.startswith("algosplit_refresh_token="))
    csrf_cookie = next(value for value in cookie_headers if value.startswith("algosplit_csrf_token="))
    assert "Max-Age=3600" in access_cookie
    assert "HttpOnly" in access_cookie
    assert "Max-Age=2592000" in refresh_cookie
    assert "HttpOnly" in refresh_cookie
    assert "Max-Age=2592000" in csrf_cookie
    assert "HttpOnly" not in csrf_cookie
    assert all("Domain=" not in value for value in cookie_headers)


def test_signup_without_provider_session_requires_email_confirmation(client, fake_supabase):
    provider_response = type(
        "ProviderResponse",
        (),
        {
            "user": type(
                "User",
                (),
                {"id": "user-awaiting-confirmation", "email": "confirm@example.com"},
            )(),
            "session": None,
        },
    )()
    fake_supabase.auth.sign_up = lambda _payload: provider_response

    response = client.post(
        "/auth/signup",
        json={"email": "confirm@example.com", "password": "StrongPass123!"},
    )

    assert response.status_code == 201
    assert response.json()["email_confirmation_required"] is True
    assert response.json()["access_token"] == ""
    assert "algosplit_access_token" not in response.cookies


def test_signup_validation_does_not_echo_password(client):
    response = client.post(
        "/auth/signup",
        json={"email": "not-an-email", "password": "secret"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Enter a valid email and a password of at least 8 characters."
    }
    assert "secret" not in response.text


def test_reset_validation_does_not_echo_recovery_token(client):
    response = client.post(
        "/auth/reset-password",
        json={"access_token": "private-recovery-token", "new_password": "short"},
    )

    assert response.status_code == 422
    assert response.json() == {
        "detail": "Use a valid reset link and a password of at least 8 characters."
    }
    assert "private-recovery-token" not in response.text


def test_password_recovery_token_is_single_use(client, fake_supabase, monkeypatch):
    monkeypatch.setattr(auth_routes, "get_supabase_admin", lambda: fake_supabase)
    monkeypatch.setattr(
        auth_routes, "_decode_token",
        lambda _token: {"sub": "user-123", "type": "recovery", "exp": 2_000_000_000},
    )
    payload = {
        "access_token": "one-time-recovery-token-which-is-long-enough",
        "new_password": "NewStrongPass123!",
    }

    first = client.post("/auth/reset-password", json=payload)
    replay = client.post("/auth/reset-password", json=payload)

    assert first.status_code == 200
    assert replay.status_code == 400
    assert len(fake_supabase.auth.password_updates) == 1
    assert len(fake_supabase.tables["auth_recovery_token_uses"]) == 1


def test_password_recovery_token_fails_closed_after_indeterminate_auth_error(
    client, fake_supabase, monkeypatch
):
    monkeypatch.setattr(auth_routes, "get_supabase_admin", lambda: fake_supabase)
    monkeypatch.setattr(
        auth_routes, "_decode_token",
        lambda _token: {"sub": "user-123", "type": "recovery", "exp": 2_000_000_000},
    )
    monkeypatch.setattr(
        fake_supabase.auth, "update_user_by_id",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(TimeoutError("Auth timed out")),
    )
    payload = {
        "access_token": "indeterminate-recovery-token-long-enough",
        "new_password": "NewStrongPass123!",
    }

    first = client.post("/auth/reset-password", json=payload)
    replay = client.post("/auth/reset-password", json=payload)

    assert first.status_code == 503
    assert replay.status_code == 400
    assert len(fake_supabase.tables["auth_recovery_token_uses"]) == 1


def test_password_recovery_token_releases_after_determinate_auth_rejection(
    client, fake_supabase, monkeypatch
):
    class RejectedPassword(Exception):
        status_code = 422

    monkeypatch.setattr(auth_routes, "get_supabase_admin", lambda: fake_supabase)
    monkeypatch.setattr(
        auth_routes, "_decode_token",
        lambda _token: {"sub": "user-123", "type": "recovery", "exp": 2_000_000_000},
    )
    monkeypatch.setattr(
        fake_supabase.auth, "update_user_by_id",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RejectedPassword("weak password")),
    )

    response = client.post(
        "/auth/reset-password",
        json={
            "access_token": "rejected-recovery-token-long-enough",
            "new_password": "NewStrongPass123!",
        },
    )

    assert response.status_code == 503
    assert fake_supabase.tables["auth_recovery_token_uses"] == []


def test_signup_provider_errors_do_not_leak_details(client, fake_supabase):
    fake_supabase.auth.raise_on_signup = Exception(
        "upstream failure using service_role=do-not-return-this"
    )

    response = client.post(
        "/auth/signup",
        json={"email": "new-user@example.com", "password": "StrongPass123!"},
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Account service is temporarily unavailable. Please try again later."
    }
    assert "service_role" not in response.text


def test_signup_provider_validation_uses_public_messages(client, fake_supabase):
    fake_supabase.auth.raise_on_signup = Exception("Password is too weak: internal policy v3")

    response = client.post(
        "/auth/signup",
        json={"email": "new-user@example.com", "password": "StrongPass123!"},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Password does not meet security requirements"}
    assert "internal policy" not in response.text


def test_login_with_invalid_credentials_returns_401(client, fake_supabase):
    fake_supabase.auth.raise_on_login = Exception("invalid credentials")

    response = client.post(
        "/auth/login",
        json={"email": "bad@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_login_provider_errors_do_not_leak_details(client, fake_supabase):
    fake_supabase.auth.raise_on_login = Exception("database key abc123 was rejected")

    response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "StrongPass123!"},
    )

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Account service is temporarily unavailable. Please try again later."
    }
    assert "abc123" not in response.text


def test_browser_login_keeps_tokens_out_of_json(client):
    client.post(
        "/auth/signup",
        json={"email": "user@example.com", "password": "StrongPass123!"},
    )
    response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "StrongPass123!"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"] == ""
    assert response.json()["refresh_token"] == ""
    assert "algosplit_access_token" in response.cookies


def test_native_login_returns_tokens_without_relying_on_cookies(client):
    client.post(
        "/auth/signup",
        json={"email": "user@example.com", "password": "StrongPass123!"},
    )
    response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "StrongPass123!"},
        headers={"X-AlgoSplit-Client": "native"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"].startswith("token-")
    assert response.json()["refresh_token"].startswith("refresh-")


def test_get_current_user_returns_dependency_user(client):
    response = client.get("/auth/user")
    assert response.status_code == 200
    assert response.json() == {
        "id": "user-123",
        "email": "tester@example.com",
    }


def test_logout_returns_204_revokes_locally_and_clears_cookies(client, fake_supabase):
    response = client.post("/auth/logout")

    assert response.status_code == 204
    assert fake_supabase.auth.sign_out_calls == [("token-user-123", "local")]
    set_cookie = response.headers.get("set-cookie", "")
    assert "algosplit_access_token" in set_cookie
    assert "algosplit_refresh_token" in set_cookie
    assert "algosplit_csrf_token" in set_cookie


def test_logout_all_revokes_every_session(client, fake_supabase):
    response = client.post("/auth/logout-all")

    assert response.status_code == 204
    assert fake_supabase.auth.sign_out_calls == [("token-user-123", "global")]


def test_logout_revocation_failure_still_clears_local_cookies(client, fake_supabase):
    fake_supabase.auth.raise_on_sign_out = Exception("provider unavailable")

    response = client.post("/auth/logout")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Signed out locally, but server revocation could not be confirmed."
    )
    set_cookie = response.headers.get("set-cookie", "")
    assert "algosplit_access_token" in set_cookie
    assert "algosplit_refresh_token" in set_cookie
    assert "algosplit_csrf_token" in set_cookie


def test_csrf_bootstrap_is_anonymous_persistent_and_non_cacheable(client):
    response = client.get("/auth/csrf")

    assert response.status_code == 204
    cookie = response.headers.get("set-cookie", "")
    assert "algosplit_csrf_token=" in cookie
    assert "Max-Age=2592000" in cookie
    assert "SameSite=lax" in cookie
    assert response.headers["cache-control"] == "private, no-store"


def test_cookie_refresh_requires_csrf_and_rotates_session(client):
    cookies = {
        "algosplit_refresh_token": "refresh-token",
        "algosplit_csrf_token": "csrf-token",
    }

    rejected = client.post("/auth/refresh", json={}, cookies=cookies)
    assert rejected.status_code == 403
    assert rejected.json()["detail"] == "Invalid CSRF token"

    response = client.post(
        "/auth/refresh",
        json={},
        cookies=cookies,
        headers={"X-CSRF-Token": "csrf-token"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"] == ""
    set_cookie = response.headers.get("set-cookie", "")
    assert "algosplit_access_token" in set_cookie
    assert "algosplit_refresh_token" in set_cookie
    assert "algosplit_csrf_token" in set_cookie
    assert "Max-Age=2592000" in set_cookie

    native_spoof = client.post(
        "/auth/refresh",
        json={},
        cookies=cookies,
        headers={
            "X-CSRF-Token": "csrf-token",
            "X-AlgoSplit-Client": "native",
        },
    )
    assert native_spoof.status_code == 200
    assert native_spoof.json()["access_token"] == ""


def test_native_refresh_returns_rotated_tokens_from_body(client):
    response = client.post(
        "/auth/refresh",
        json={"refresh_token": "native-refresh-token"},
        headers={"X-AlgoSplit-Client": "native"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"] == "token-refreshed"
    assert response.json()["refresh_token"] == "refresh-token-refreshed"


def test_invalid_refresh_clears_browser_cookies(client, fake_supabase):
    fake_supabase.auth.raise_on_refresh = Exception("refresh_token_not_found")
    response = client.post(
        "/auth/refresh",
        json={},
        cookies={
            "algosplit_refresh_token": "invalid",
            "algosplit_csrf_token": "csrf-token",
        },
        headers={"X-CSRF-Token": "csrf-token"},
    )

    assert response.status_code == 401
    set_cookie = response.headers.get("set-cookie", "")
    assert "algosplit_access_token" in set_cookie
    assert "algosplit_refresh_token" in set_cookie
    assert "algosplit_csrf_token" in set_cookie


def test_refresh_provider_outage_does_not_clear_session_cookies(client, fake_supabase):
    fake_supabase.auth.raise_on_refresh = Exception("upstream connection timed out")
    response = client.post(
        "/auth/refresh",
        json={},
        cookies={
            "algosplit_refresh_token": "still-valid",
            "algosplit_csrf_token": "csrf-token",
        },
        headers={"X-CSRF-Token": "csrf-token"},
    )

    assert response.status_code == 503
    assert "set-cookie" not in response.headers


def test_browser_origin_cannot_spoof_native_token_response(client):
    client.post(
        "/auth/signup",
        json={"email": "user@example.com", "password": "StrongPass123!"},
    )
    response = client.post(
        "/auth/login",
        json={"email": "user@example.com", "password": "StrongPass123!"},
        headers={
            "X-AlgoSplit-Client": "native",
            "Origin": "https://algo-split.vercel.app",
        },
    )

    assert response.status_code == 200
    assert response.json()["access_token"] == ""
    assert response.json()["refresh_token"] == ""


def test_oauth_complete_adopts_social_session_as_browser_cookies(client, fake_supabase, monkeypatch):
    monkeypatch.setattr(
        auth_routes,
        "_decode_token",
        lambda _token: {
            "sub": "user-123",
            "role": "authenticated",
            "exp": int(__import__("time").time()) + 1800,
        },
    )

    response = client.post(
        "/auth/oauth/complete",
        json={
            "access_token": "social-access-token-which-is-long-enough",
            "refresh_token": "social-refresh-token-which-is-long-enough",
        },
    )

    assert response.status_code == 200
    assert response.json()["user"] == {"id": "user-123", "email": "tester@example.com"}
    assert response.json()["access_token"] == ""
    assert response.json()["refresh_token"] == ""
    assert "algosplit_access_token" in response.cookies
    assert "algosplit_refresh_token" in response.cookies
    assert response.cookies.get("algosplit_access_token") == "token-social-rotated"
    assert response.cookies.get("algosplit_refresh_token") == "refresh-token-social-rotated"
    assert fake_supabase.auth.get_user("anything").user.id == "user-123"


def test_oauth_complete_returns_native_session_credentials(client, monkeypatch):
    monkeypatch.setattr(
        auth_routes,
        "_decode_token",
        lambda _token: {
            "sub": "user-123",
            "role": "authenticated",
            "exp": int(__import__("time").time()) + 1800,
        },
    )
    payload = {
        "access_token": "social-access-token-which-is-long-enough",
        "refresh_token": "social-refresh-token-which-is-long-enough",
    }

    response = client.post(
        "/auth/oauth/complete",
        json=payload,
        headers={"X-AlgoSplit-Client": "native"},
    )

    assert response.status_code == 200
    assert response.json()["access_token"] == "token-social-rotated"
    assert response.json()["refresh_token"] == "refresh-token-social-rotated"


def test_oauth_complete_rejects_invalid_social_session_without_echoing_tokens(client, monkeypatch):
    monkeypatch.setattr(auth_routes, "_decode_token", lambda _token: {"sub": "user-123"})
    response = client.post(
        "/auth/oauth/complete",
        json={
            "access_token": "social-access-token-which-is-long-enough",
            "refresh_token": "social-refresh-token-which-is-long-enough",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Could not validate social sign-in. Try again."}
    assert "social-access-token" not in response.text


def test_oauth_complete_rejects_refresh_token_for_a_different_account(
    client, fake_supabase, monkeypatch
):
    monkeypatch.setattr(
        auth_routes,
        "_decode_token",
        lambda _token: {
            "sub": "user-123",
            "role": "authenticated",
            "exp": int(__import__("time").time()) + 1800,
        },
    )
    fake_supabase.auth.refresh_session = lambda _token: type(
        "ProviderResponse",
        (),
        {
            "user": type("User", (), {"id": "other-user", "email": "other@example.com"})(),
            "session": type(
                "Session",
                (),
                {
                    "access_token": "rotated-access-token",
                    "refresh_token": "rotated-refresh-token",
                    "expires_in": 3600,
                },
            )(),
        },
    )()

    response = client.post(
        "/auth/oauth/complete",
        json={
            "access_token": "social-access-token-which-is-long-enough",
            "refresh_token": "social-refresh-token-which-is-long-enough",
        },
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Could not validate social sign-in. Try again."}


def _fake_identity(provider: str, email: str | None = None):
    from datetime import datetime, timezone

    return type(
        "Identity",
        (),
        {
            "provider": provider,
            "identity_data": {"email": email} if email else {},
            "created_at": datetime.now(timezone.utc),
            "identity_id": f"identity-{provider}",
        },
    )()


def test_connected_identities_lists_methods_and_brokers_trusted_link_url(client, fake_supabase):
    listed = client.get("/auth/identities")
    assert listed.status_code == 200
    assert listed.json()["identities"] == [
        {
            "provider": "email",
            "email": "tester@example.com",
            "created_at": listed.json()["identities"][0]["created_at"],
            "can_disconnect": False,
        }
    ]

    linked = client.post("/auth/identities/google/link", json={"platform": "web"})

    assert linked.status_code == 200
    assert linked.json()["url"].startswith("http://localhost:54321/auth/v1/authorize")
    assert fake_supabase.auth.link_identity_calls == [
        {
            "provider": "google",
            "options": {"redirect_to": "http://localhost:8081/identity/callback"},
        }
    ]
    assert fake_supabase.auth.set_session_calls == [("token-user-123", "")]


def test_identity_link_accepts_exact_google_and_apple_authorization_urls(
    client, fake_supabase
):
    urls = {
        "google": "https://accounts.google.com/o/oauth2/v2/auth?client_id=test",
        "apple": "https://appleid.apple.com/auth/authorize?client_id=test",
    }

    def direct_provider_url(payload):
        return type("OAuthResponse", (), {"url": urls[payload["provider"]]})()

    fake_supabase.auth.link_identity = direct_provider_url

    google = client.post("/auth/identities/google/link", json={"platform": "web"})
    apple = client.post("/auth/identities/apple/link", json={"platform": "web"})

    assert google.status_code == 200
    assert google.json()["url"] == urls["google"]
    assert apple.status_code == 200
    assert apple.json()["url"] == urls["apple"]


def test_identity_link_derives_production_web_callback_from_single_frontend_origin(
    monkeypatch,
):
    monkeypatch.setattr(auth_routes, "IS_PRODUCTION", True)
    monkeypatch.delenv("AUTH_IDENTITY_WEB_CALLBACK_URL", raising=False)
    monkeypatch.setenv("FRONTEND_URL", "https://algo-split.vercel.app")

    callback = auth_routes._server_controlled_identity_callback(
        auth_routes.AuthClientPlatform.WEB
    )

    assert callback == "https://algo-split.vercel.app/identity/callback"


def test_identity_link_rejects_mismatched_or_lookalike_provider_url(client, fake_supabase):
    fake_supabase.auth.link_identity = lambda _payload: type(
        "OAuthResponse",
        (),
        {"url": "https://accounts.google.com.evil.example/o/oauth2/v2/auth"},
    )()

    response = client.post("/auth/identities/google/link", json={"platform": "web"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Account service is temporarily unavailable. Please try again later."


def test_identity_link_rejects_existing_provider_and_untrusted_callback(client, fake_supabase, monkeypatch):
    fake_supabase.auth.current_user.identities.append(_fake_identity("google", "tester@example.com"))
    existing = client.post("/auth/identities/google/link", json={"platform": "native"})
    assert existing.status_code == 409
    assert existing.json()["detail"] == "Google is already connected to this account."

    fake_supabase.auth.current_user.identities.pop()
    monkeypatch.setenv(
        "AUTH_IDENTITY_WEB_CALLBACK_URL",
        "https://untrusted.example/identity/callback",
    )
    untrusted = client.post("/auth/identities/google/link", json={"platform": "web"})
    assert untrusted.status_code == 503
    assert untrusted.json()["detail"] == "Account service is temporarily unavailable. Please try again later."


def test_identity_unlink_requires_another_method_and_removes_link(client, fake_supabase):
    fake_supabase.auth.current_user.identities = [_fake_identity("google", "relay@privaterelay.appleid.com")]
    rejected = client.delete("/auth/identities/google")
    assert rejected.status_code == 400
    assert rejected.json()["detail"] == "Connect another sign-in method before disconnecting this one."

    google = _fake_identity("google", "tester@example.com")
    fake_supabase.auth.current_user.identities = [_fake_identity("email", "tester@example.com"), google]
    removed = client.delete("/auth/identities/google")
    assert removed.status_code == 204
    assert fake_supabase.auth.unlink_identity_calls == [google]


def test_identity_routes_reject_unsupported_provider(client):
    response = client.post("/auth/identities/email/link", json={"platform": "web"})
    assert response.status_code == 422
    assert response.json() == {"detail": "Choose a supported account connection."}


def test_api_responses_include_baseline_security_headers(client):
    response = client.get("/auth/user")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "private, no-store"
