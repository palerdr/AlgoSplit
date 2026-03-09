def test_signup_sets_auth_and_csrf_cookies(client):
    response = client.post(
        "/auth/signup",
        json={"email": "new-user@example.com", "password": "StrongPass123!"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "new-user@example.com"
    assert body["token_type"] == "bearer"
    assert body["access_token"].startswith("token-")
    assert "algosplit_access_token" in response.cookies
    assert "algosplit_csrf_token" in response.cookies


def test_login_with_invalid_credentials_returns_401(client, fake_supabase):
    fake_supabase.auth.raise_on_login = Exception("invalid credentials")

    response = client.post(
        "/auth/login",
        json={"email": "bad@example.com", "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


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
    assert "algosplit_csrf_token" in set_cookie
