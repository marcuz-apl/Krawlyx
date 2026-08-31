"""User-management Pydantic schemas (PRD §9)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=200)
    role: Literal["runner", "admin", "superadmin"] = "runner"


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str | None = Field(default=None, min_length=8, max_length=200)
    role: Literal["runner", "admin", "superadmin"] | None = None
