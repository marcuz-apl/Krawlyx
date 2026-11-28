"""User-management Pydantic schemas (PRD §9)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.auth import UserOut

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=200)
    role: Literal["runner", "admin", "superadmin"] = "runner"
    email: str = Field(max_length=200, pattern=EMAIL_PATTERN)


class UserCreateOut(UserOut):
    welcome_email_sent: bool = False


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str | None = Field(default=None, min_length=8, max_length=200)
    role: Literal["runner", "admin", "superadmin"] | None = None
    # Empty string clears the email; None leaves it unchanged.
    email: str | None = Field(
        default=None, max_length=200, pattern=r"^(?:[^@\s]+@[^@\s]+\.[^@\s]+)?$"
    )
