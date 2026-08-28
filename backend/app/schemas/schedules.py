"""Schedule Pydantic schemas (PRD §6.3, §9)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ScheduleCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    cron: str = Field(min_length=1, max_length=64)
    timezone: str = "UTC"
    enabled: bool = True
    urls: list[str] = Field(default_factory=list)
    engine_id: int
    export_target_id: int | None = None
    options: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=2000)


class ScheduleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    cron: str | None = Field(default=None, min_length=1, max_length=64)
    timezone: str | None = None
    enabled: bool | None = None
    urls: list[str] | None = None
    engine_id: int | None = None
    export_target_id: int | None = None
    options: dict[str, Any] | None = None
    notes: str | None = None


class ScheduleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    cron: str
    timezone: str
    enabled: bool
    running: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    created_at: datetime
    # Flattened payload fields for the SPA — keeps the JSON shape stable
    # while the underlying `Schedule.payload` column stays a free-form dict.
    engine_id: int
    export_target_id: int | None
    options: dict[str, Any]
    urls: list[str]
    notes: str | None
    human: str


class NextFiresOut(BaseModel):
    schedule_id: int
    cron: str
    timezone: str
    next_runs: list[datetime]
    human: str
