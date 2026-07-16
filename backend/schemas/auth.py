"""
Pydantic schemas for authentication
"""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class SocialProvider(str, Enum):
    """Social providers supported by AlgoSplit account sign-in and linking."""

    GOOGLE = "google"
    APPLE = "apple"


class SignInProvider(str, Enum):
    """All sign-in methods that can be displayed in connected accounts."""

    EMAIL = "email"
    GOOGLE = "google"
    APPLE = "apple"


class AuthClientPlatform(str, Enum):
    """Client family used to choose a server-controlled callback URL."""

    WEB = "web"
    NATIVE = "native"


class SignUpRequest(BaseModel):
    """Request body for user sign up"""

    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=8, max_length=256, description="User's password (min 8 characters)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "user@example.com",
                    "password": "SecurePassword123!",
                }
            ]
        }
    }


class LoginRequest(BaseModel):
    """Request body for user login"""

    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=1, max_length=256, description="User's password")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "email": "user@example.com",
                    "password": "SecurePassword123!",
                }
            ]
        }
    }


class RefreshRequest(BaseModel):
    """Optional request body for native-client token refresh."""

    refresh_token: Optional[str] = Field(None, description="Supabase refresh token")


class OAuthSessionCompleteRequest(BaseModel):
    """Short-lived Supabase session handed to the API after a social OAuth flow."""

    access_token: str = Field(..., min_length=20, max_length=8192)
    refresh_token: str = Field(..., min_length=10, max_length=8192)


class IdentityLinkRequest(BaseModel):
    """Request a server-brokered social identity linking URL."""

    platform: AuthClientPlatform


class IdentitySummary(BaseModel):
    """A safe, display-oriented view of one Supabase Auth identity."""

    provider: SignInProvider
    email: Optional[str] = None
    created_at: Optional[datetime] = None
    can_disconnect: bool = False


class IdentityListResponse(BaseModel):
    """Connected sign-in methods for the current account."""

    identities: list[IdentitySummary]


class IdentityLinkResponse(BaseModel):
    """A trusted Supabase or provider authorization URL for an identity link."""

    url: str


class AuthResponse(BaseModel):
    """Response for successful authentication"""

    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(default="", description="Refresh token for obtaining new access tokens")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration time in seconds")
    user: "UserInfo" = Field(..., description="User information")
    email_confirmation_required: bool = Field(
        default=False,
        description="Whether signup succeeded but requires email confirmation before login",
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                    "refresh_token": "v1.refresh-token-string...",
                    "token_type": "bearer",
                    "expires_in": 3600,
                    "email_confirmation_required": False,
                    "user": {
                        "id": "123e4567-e89b-12d3-a456-426614174000",
                        "email": "user@example.com",
                    },
                }
            ]
        }
    }


class UserInfo(BaseModel):
    """User information"""

    id: str = Field(..., description="User ID (UUID)")
    email: Optional[str] = Field(None, description="User's email address")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "id": "123e4567-e89b-12d3-a456-426614174000",
                    "email": "user@example.com",
                }
            ]
        }
    }


class ForgotPasswordRequest(BaseModel):
    """Request body for forgot password"""

    email: EmailStr = Field(..., description="User's email address")


class ResetPasswordRequest(BaseModel):
    """Request body for resetting password with a new one"""

    access_token: str = Field(..., description="Access token from Supabase reset link")
    new_password: str = Field(..., min_length=8, max_length=256, description="New password (min 8 characters)")


class ErrorResponse(BaseModel):
    """Error response"""

    detail: str = Field(..., description="Error message")

    model_config = {
        "json_schema_extra": {"examples": [{"detail": "Invalid credentials"}]}
    }
