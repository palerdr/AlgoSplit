"""
Authentication routes
Handles user signup, login, and user info retrieval
"""

import logging
from time import perf_counter
from fastapi import APIRouter, HTTPException, Depends, status, Request, Response
from fastapi.responses import JSONResponse

logger = logging.getLogger("algosplit.auth")
from db.supabase import get_supabase_auth_client, get_supabase_admin
from schemas.auth import (
    SignUpRequest,
    LoginRequest,
    RefreshRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    AuthResponse,
    UserInfo,
    ErrorResponse,
)
from api.dependencies import _decode_token, get_current_user, AuthUser
from api.security import (
    AUTH_REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    set_auth_cookies,
    set_csrf_cookie,
    should_expose_auth_tokens,
    validate_csrf_request,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


AUTH_SERVICE_UNAVAILABLE = "Account service is temporarily unavailable. Please try again later."
AUTH_RATE_LIMITED = "Too many authentication attempts. Wait a minute and try again."


def _provider_error_text(error: Exception) -> str:
    """Normalize provider errors for classification only; never return this text to clients."""
    parts = [str(error), str(getattr(error, "code", "")), str(getattr(error, "message", ""))]
    return " ".join(parts).lower()


def _is_rate_limited(error_text: str) -> bool:
    return any(
        marker in error_text
        for marker in ("rate limit", "too many requests", "over_email_send_rate_limit")
    )


def _provider_failure_status(error_text: str) -> tuple[int, str]:
    if _is_rate_limited(error_text):
        return status.HTTP_429_TOO_MANY_REQUESTS, AUTH_RATE_LIMITED
    return status.HTTP_503_SERVICE_UNAVAILABLE, AUTH_SERVICE_UNAVAILABLE


def _client_kind(request: Request) -> str:
    return "native" if should_expose_auth_tokens(request) else "web"


def _invalid_refresh_response() -> JSONResponse:
    response = JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={"detail": "Invalid or expired refresh token"},
    )
    clear_auth_cookies(response)
    return response


def _is_invalid_refresh_error(error_text: str) -> bool:
    return any(
        marker in error_text
        for marker in (
            "invalid refresh token",
            "refresh_token_not_found",
            "refresh token not found",
            "refresh_token_already_used",
            "session_not_found",
            "session_expired",
            "invalid grant",
        )
    )


def _logout_response(current_user: AuthUser, scope: str) -> Response:
    started = perf_counter()
    try:
        get_supabase_auth_client().admin.sign_out(current_user.access_token, scope=scope)
    except Exception as error:
        logger.warning(
            "auth_event=logout scope=%s result=provider_error provider_error_type=%s",
            scope,
            type(error).__name__,
        )
        response = JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"detail": "Signed out locally, but server revocation could not be confirmed."},
        )
        clear_auth_cookies(response)
        logger.info(
            "auth_event=logout scope=%s result=provider_error latency_ms=%.1f",
            scope,
            (perf_counter() - started) * 1000,
        )
        return response

    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_auth_cookies(response)
    logger.info(
        "auth_event=logout scope=%s result=success latency_ms=%.1f",
        scope,
        (perf_counter() - started) * 1000,
    )
    return response


@router.get(
    "/csrf",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Bootstrap a browser CSRF token",
)
def bootstrap_csrf(response: Response):
    set_csrf_cookie(response)
    logger.info("auth_event=csrf_bootstrap result=success")
    return None


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request or user already exists"},
        429: {"model": ErrorResponse, "description": "Too many attempts"},
        503: {"model": ErrorResponse, "description": "Authentication provider unavailable"},
    },
    summary="Sign up a new user",
    description="Create a new user account with email and password",
)
def signup(request: SignUpRequest, http_request: Request, http_response: Response):
    """
    Create a new user account

    Args:
        request: Sign up request with email and password

    Returns:
        AuthResponse with access token and user info

    Raises:
        HTTPException: If sign up fails
    """
    try:
        auth_client = get_supabase_auth_client()

        # Sign up the user using Supabase Auth
        sign_up_response = auth_client.sign_up(
            {
                "email": request.email,
                "password": request.password,
            }
        )

        if not sign_up_response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user account",
            )

        # Return authentication response
        access_token = sign_up_response.session.access_token if sign_up_response.session else ""
        refresh_token = sign_up_response.session.refresh_token if sign_up_response.session else ""
        expires_in = sign_up_response.session.expires_in if sign_up_response.session else 3600
        if access_token:
            set_auth_cookies(http_response, access_token, refresh_token, expires_in)
        expose_tokens = should_expose_auth_tokens(http_request)
        return AuthResponse(
            access_token=access_token if expose_tokens else "",
            refresh_token=refresh_token if expose_tokens else "",
            token_type="bearer",
            expires_in=expires_in,
            email_confirmation_required=not bool(access_token),
            user=UserInfo(
                id=sign_up_response.user.id,
                email=sign_up_response.user.email,
            ),
        )

    except HTTPException:
        raise
    except Exception as error:
        # Provider exception text is useful for classification and server logs,
        # but can contain implementation details and must never reach clients.
        error_message = _provider_error_text(error)
        if "already registered" in error_message or "already exists" in error_message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not create account with those details",
            )
        if "signups not allowed" in error_message or "signup is disabled" in error_message:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=AUTH_SERVICE_UNAVAILABLE,
            )
        if "invalid email" in error_message or "email address is invalid" in error_message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Enter a valid email address",
            )
        if any(
            marker in error_message
            for marker in (
                "weak password",
                "password is too",
                "password should",
                "password must",
                "password not strong",
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password does not meet security requirements",
            )
        provider_status, public_message = _provider_failure_status(error_message)
        logger.warning(
            "auth_event=signup result=provider_error provider_error_type=%s",
            type(error).__name__,
        )
        raise HTTPException(status_code=provider_status, detail=public_message)


@router.post(
    "/login",
    response_model=AuthResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid credentials"},
        429: {"model": ErrorResponse, "description": "Too many attempts"},
        503: {"model": ErrorResponse, "description": "Authentication provider unavailable"},
    },
    summary="Log in a user",
    description="Authenticate a user with email and password",
)
def login(request: LoginRequest, http_request: Request, http_response: Response):
    """
    Log in a user

    Args:
        request: Login request with email and password

    Returns:
        AuthResponse with access token and user info

    Raises:
        HTTPException: If login fails
    """
    try:
        auth_client = get_supabase_auth_client()

        # Sign in the user using Supabase Auth
        login_response = auth_client.sign_in_with_password(
            {
                "email": request.email,
                "password": request.password,
            }
        )

        if not login_response.user or not login_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        # Return authentication response
        set_auth_cookies(
            http_response,
            login_response.session.access_token,
            login_response.session.refresh_token,
            login_response.session.expires_in,
        )
        expose_tokens = should_expose_auth_tokens(http_request)
        return AuthResponse(
            access_token=login_response.session.access_token if expose_tokens else "",
            refresh_token=login_response.session.refresh_token if expose_tokens else "",
            token_type="bearer",
            expires_in=login_response.session.expires_in,
            user=UserInfo(
                id=login_response.user.id,
                email=login_response.user.email,
            ),
        )

    except HTTPException:
        raise
    except Exception as error:
        error_message = _provider_error_text(error)
        if "invalid login credentials" in error_message or "invalid credentials" in error_message:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        if "email not confirmed" in error_message:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please check your email and confirm your account before signing in",
            )
        provider_status, public_message = _provider_failure_status(error_message)
        logger.warning(
            "auth_event=login result=provider_error provider_error_type=%s",
            type(error).__name__,
        )
        raise HTTPException(status_code=provider_status, detail=public_message)


@router.get(
    "/user",
    response_model=UserInfo,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
    summary="Get current user info",
    description="Get information about the currently authenticated user",
)
async def get_user(current_user: AuthUser = Depends(get_current_user)):
    """
    Get current user information

    Args:
        current_user: The authenticated user (injected by dependency)

    Returns:
        UserInfo with user details
    """
    return UserInfo(
        id=current_user.id,
        email=current_user.email,
    )


@router.post(
    "/refresh",
    response_model=AuthResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid or expired refresh token"},
    },
    summary="Refresh access token",
    description="Exchange a refresh token for a new access token",
)
def refresh(
    http_request: Request,
    http_response: Response,
    request: RefreshRequest | None = None,
):
    """
    Refresh an expired access token using a Supabase refresh token.
    """
    started = perf_counter()
    refresh_token = request.refresh_token if request else None
    refresh_cookie = http_request.cookies.get(AUTH_REFRESH_COOKIE_NAME)
    if refresh_cookie:
        # Refresh rotates credentials, so it is a state-changing operation
        # when performed with browser cookies and must be CSRF protected.
        validate_csrf_request(http_request)
        refresh_token = refresh_cookie
    if not refresh_token:
        logger.info("auth_event=refresh result=invalid client=%s", _client_kind(http_request))
        return _invalid_refresh_response()

    try:
        session_response = get_supabase_auth_client().refresh_session(refresh_token)
    except Exception as error:
        error_message = _provider_error_text(error)
        if _is_invalid_refresh_error(error_message):
            logger.info(
                "auth_event=refresh result=invalid client=%s latency_ms=%.1f",
                _client_kind(http_request),
                (perf_counter() - started) * 1000,
            )
            return _invalid_refresh_response()
        logger.warning(
            "auth_event=refresh result=provider_error client=%s provider_error_type=%s latency_ms=%.1f",
            _client_kind(http_request),
            type(error).__name__,
            (perf_counter() - started) * 1000,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=AUTH_SERVICE_UNAVAILABLE,
        )

    if not session_response.user or not session_response.session:
        return _invalid_refresh_response()

    set_auth_cookies(
        http_response,
        session_response.session.access_token,
        session_response.session.refresh_token,
        session_response.session.expires_in,
    )
    expose_tokens = should_expose_auth_tokens(http_request) and not refresh_cookie
    logger.info(
        "auth_event=refresh result=success client=%s latency_ms=%.1f",
        _client_kind(http_request),
        (perf_counter() - started) * 1000,
    )
    return AuthResponse(
        access_token=session_response.session.access_token if expose_tokens else "",
        refresh_token=session_response.session.refresh_token if expose_tokens else "",
        token_type="bearer",
        expires_in=session_response.session.expires_in,
        user=UserInfo(
            id=session_response.user.id,
            email=session_response.user.email,
        ),
    )


@router.post(
    "/forgot-password",
    status_code=status.HTTP_200_OK,
    responses={
        500: {"model": ErrorResponse, "description": "Server error"},
    },
    summary="Request a password reset email",
    description="Send a password reset link to the user's email address",
)
def forgot_password(request: ForgotPasswordRequest):
    """
    Request a password reset email.

    Always returns 200 regardless of whether the email exists,
    to prevent email enumeration attacks.
    """
    try:
        auth_client = get_supabase_auth_client()
        auth_client.reset_password_email(request.email)
    except Exception:
        # Swallow the error AND do not log the email — logging it would create a
        # PII trail in production logs, and the failure itself is not
        # actionable (Supabase enumerates internally).
        logger.debug("Password reset request failed for unknown account")

    return {"message": "If an account with that email exists, a reset link has been sent."}


@router.post(
    "/reset-password",
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid or expired token"},
        429: {"model": ErrorResponse, "description": "Too many attempts"},
        503: {"model": ErrorResponse, "description": "Authentication provider unavailable"},
    },
    summary="Reset password with token",
    description="Set a new password using the access token from the reset email link",
)
def reset_password(request: ResetPasswordRequest):
    """
    Reset a user's password using the access token from the Supabase reset link.

    The frontend extracts the access_token from the URL fragment after the user
    clicks the reset link in their email.
    """
    try:
        admin = get_supabase_admin()
        # Verify a recovery token using the same validated JWT configuration
        # as every authenticated route. A normal access token must never be
        # accepted as a password-reset credential.
        try:
            payload = _decode_token(request.access_token)
            user_id = payload.get("sub")
            if not user_id or payload.get("type") != "recovery":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid reset token",
                )
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token",
            )

        admin.auth.admin.update_user_by_id(
            user_id,
            {"password": request.new_password},
        )

        return {"message": "Password has been reset successfully."}

    except HTTPException:
        raise
    except Exception as error:
        error_message = _provider_error_text(error)
        logger.warning(
            "auth_event=password_reset result=provider_error provider_error_type=%s",
            type(error).__name__,
        )
        if any(marker in error_message for marker in ("invalid", "expired", "jwt")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to reset password. Request a new link and try again.",
            )
        provider_status, public_message = _provider_failure_status(error_message)
        raise HTTPException(status_code=provider_status, detail=public_message)


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
    summary="Log out the current user",
    description="Invalidate the current user's session",
)
def logout(current_user: AuthUser = Depends(get_current_user)):
    """
    Log out the current user

    This endpoint signs out the user by invalidating their session on the server.
    The client should also clear any in-memory auth state.

    Args:
        current_user: The authenticated user (injected by dependency)

    Returns:
        204 No Content on success
    """
    return _logout_response(current_user, "local")


@router.post(
    "/logout-all",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        503: {"model": ErrorResponse, "description": "Session revocation unavailable"},
    },
    summary="Log out all sessions",
    description="Invalidate all sessions belonging to the current user",
)
def logout_all(current_user: AuthUser = Depends(get_current_user)):
    return _logout_response(current_user, "global")


@router.delete(
    "/account",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
        500: {"model": ErrorResponse, "description": "Server error"},
    },
    summary="Delete the current user's account",
    description="Permanently delete the authenticated user and all associated data",
)
def delete_account(
    response: Response,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Permanently delete the current user's account and all associated data.

    Uses the Supabase admin client to remove the user from auth.users.
    All user-owned rows (splits, workouts, bodyweight, etc.) are cascade-deleted
    by the database foreign-key constraints.
    """
    try:
        admin = get_supabase_admin()
        admin.auth.admin.delete_user(current_user.id)
    except Exception as error:
        logger.warning(
            "auth_event=account_delete result=provider_error provider_error_type=%s",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account",
        )

    clear_auth_cookies(response)
    return None
