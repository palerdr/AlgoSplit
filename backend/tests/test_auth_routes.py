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
    assert "algosplit_access_token" in response.cookies
    assert "algosplit_refresh_token" in response.cookies
    assert "algosplit_csrf_token" in response.cookies


def test_login_with_invalid_credentials_returns_401(client, fake_supabase):
    fake_supabase.auth.raise_on_login = Exception("invalid credentials")

    response = client.post(
        "/auth/login",
        json={"email": "bad@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


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


def test_logout_returns_204_and_clears_cookies(client):
    response = client.post("/auth/logout")

    assert response.status_code == 204
    set_cookie = response.headers.get("set-cookie", "")
    assert "algosplit_access_token" in set_cookie
    assert "algosplit_refresh_token" in set_cookie
    assert "algosplit_csrf_token" in set_cookie


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
    assert "algosplit_refresh_token" in response.headers.get("set-cookie", "")

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


def test_api_responses_include_baseline_security_headers(client):
    response = client.get("/auth/user")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"
