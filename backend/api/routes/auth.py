"""
Authentication routes
Handles user signup, login, and user info retrieval
"""

from fastapi import APIRouter, HTTPException, Depends, status
from db.supabase import get_supabase_client
from schemas.auth import (
    SignUpRequest,
    LoginRequest,
    AuthResponse,
    UserInfo,
    ErrorResponse,
)
from api.dependencies import get_current_user, AuthUser

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
async def signup(request: SignUpRequest):
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
        response = supabase.auth.sign_up(
            {
                "email": request.email,
                "password": request.password,
            }
        )

        if not response.user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to create user account",
            )

        # Return authentication response
        return AuthResponse(
            access_token=response.session.access_token if response.session else "",
            token_type="bearer",
            expires_in=response.session.expires_in if response.session else 3600,
            user=UserInfo(
                id=response.user.id,
                email=response.user.email,
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
async def login(request: LoginRequest):
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
        response = supabase.auth.sign_in_with_password(
            {
                "email": request.email,
                "password": request.password,
            }
        )

        if not response.user or not response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        # Return authentication response
        return AuthResponse(
            access_token=response.session.access_token,
            token_type="bearer",
            expires_in=response.session.expires_in,
            user=UserInfo(
                id=response.user.id,
                email=response.user.email,
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
async def logout(current_user: AuthUser = Depends(get_current_user)):
    """
    Log out the current user

    This endpoint signs out the user by invalidating their session on the server.
    The client should also remove the access token from storage.

    Args:
        current_user: The authenticated user (injected by dependency)

    Returns:
        204 No Content on success
    """
    try:
        supabase = get_supabase_client()
        supabase.auth.sign_out()
        return None
    except Exception as e:
        # Even if sign out fails on the server, we still return success
        # because the client will remove the token anyway
        return None
