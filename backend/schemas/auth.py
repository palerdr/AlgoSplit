"""
Pydantic schemas for authentication
"""

from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class SignUpRequest(BaseModel):
    """Request body for user sign up"""

    email: EmailStr = Field(..., description="User's email address")
    password: str = Field(..., min_length=8, description="User's password (min 8 characters)")

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
    password: str = Field(..., description="User's password")

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


class AuthResponse(BaseModel):
    """Response for successful authentication"""

    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration time in seconds")
    user: "UserInfo" = Field(..., description="User information")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                    "token_type": "bearer",
                    "expires_in": 3600,
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


class ErrorResponse(BaseModel):
    """Error response"""

    detail: str = Field(..., description="Error message")

    model_config = {
        "json_schema_extra": {"examples": [{"detail": "Invalid credentials"}]}
    }
