"""Auth request/response schemas."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


from datetime import datetime


class UserOut(BaseModel):
    id: int
    username: str
    email: str | None = None
    role: str
    must_change_password: bool = False
    mfa_enabled: bool = False
    mfa_required: bool = False
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=200)


class LoginResponse(BaseModel):
    user: UserOut
    csrf_token: str | None = None
    mfa_required: bool = False
    mfa_token: str | None = None
