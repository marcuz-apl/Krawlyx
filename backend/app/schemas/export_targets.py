"""Export-target Pydantic schemas (PRD §6.4, §9)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ExportTargetCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    mode: Literal["database", "folder"]
    path: str | None = None
    format: Literal["csv", "xlsx"] | None = None
    split_size_mb: int = Field(default=40, ge=1, le=2048)
    runner_selectable: bool = False
    enabled: bool = True


class ExportTargetUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    path: str | None = None
    format: Literal["csv", "xlsx"] | None = None
    split_size_mb: int | None = Field(default=None, ge=1, le=2048)
    runner_selectable: bool | None = None
    enabled: bool | None = None


class ExportTargetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    mode: str
    path: str | None
    format: str | None
    split_size_mb: int
    runner_selectable: bool
    enabled: bool
    created_at: datetime


class ExportTargetTestResult(BaseModel):
    ok: bool
    detail: str
