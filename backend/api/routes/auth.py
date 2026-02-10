"""
Authentication routes
Handles user signup, login, and user info retrieval
"""

from fastapi import APIRouter, HTTPException, Depends, status, Response
from db.supabase import get_supabase_client, get_supabase_client_with_token
from schemas.auth import (
    SignUpRequest,
    LoginRequest,
    AuthResponse,
    UserInfo,
    ErrorResponse,
)
from api.dependencies import get_current_user, AuthUser
from api.security import (
    AUTH_EXPOSE_ACCESS_TOKEN,
    clear_auth_cookies,
    set_auth_cookies,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/signup",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        400: {"model": ErrorResponse, "description": "Invalid request or user already exists"},
        500: {"model": ErrorResponse, "description": "Server error"},
    },
    summary="Sign up a new user",
    description="Create a new user account with email and password",
)
async def signup(request: SignUpRequest, http_response: Response):
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
        supabase = get_supabase_client()

        # Sign up the user using Supabase Auth
        sign_up_response = supabase.auth.sign_up(
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
        expires_in = sign_up_response.session.expires_in if sign_up_response.session else 3600
        if access_token:
            set_auth_cookies(http_response, access_token, expires_in)
        return AuthResponse(
            access_token=access_token if AUTH_EXPOSE_ACCESS_TOKEN else "",
            token_type="bearer",
            expires_in=expires_in,
            user=UserInfo(
                id=sign_up_response.user.id,
                email=sign_up_response.user.email,
            ),
        )

    except Exception as e:
        # Check for specific Supabase errors
        error_message = str(e)
        if "already registered" in error_message.lower() or "already exists" in error_message.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists",
            )
        elif "invalid" in error_message.lower():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid request: {error_message}",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create account: {error_message}",
            )


@router.post(
    "/login",
    response_model=AuthResponse,
    responses={
        401: {"model": ErrorResponse, "description": "Invalid credentials"},
        500: {"model": ErrorResponse, "description": "Server error"},
    },
    summary="Log in a user",
    description="Authenticate a user with email and password",
)
async def login(request: LoginRequest, http_response: Response):
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
        supabase = get_supabase_client()

        # Sign in the user using Supabase Auth
        login_response = supabase.auth.sign_in_with_password(
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
            login_response.session.expires_in,
        )
        return AuthResponse(
            access_token=login_response.session.access_token if AUTH_EXPOSE_ACCESS_TOKEN else "",
            token_type="bearer",
            expires_in=login_response.session.expires_in,
            user=UserInfo(
                id=login_response.user.id,
                email=login_response.user.email,
            ),
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        error_message = str(e)
        if "invalid" in error_message.lower() or "credentials" in error_message.lower():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Login failed: {error_message}",
            )


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
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"model": ErrorResponse, "description": "Not authenticated"},
    },
    summary="Log out the current user",
    description="Invalidate the current user's session",
)
async def logout(
    response: Response,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Log out the current user

    This endpoint signs out the user by invalidating their session on the server.
    The client should also clear any in-memory auth state.

    Args:
        current_user: The authenticated user (injected by dependency)

    Returns:
        204 No Content on success
    """
    try:
        # Use a token-scoped client so the caller's session is revoked.
        supabase = get_supabase_client_with_token(current_user.access_token)
        supabase.auth.sign_out()
    except Exception:
        # Even if sign out fails server-side, clear browser cookies.
        pass

    clear_auth_cookies(response)
    return None
