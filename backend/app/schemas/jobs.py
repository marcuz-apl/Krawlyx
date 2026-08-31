"""Job API schemas (PRD §6.2, §9)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.services.urls import UrlError


class JobCreate(BaseModel):
    """Runner form submission. URLs are pre-split from the textarea."""

    model_config = ConfigDict(extra="forbid")

    engine_id: int
    urls: list[str] = Field(default_factory=list)
    options: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = Field(default=None, max_length=2000)
    # M4: when set, results are streamed to a folder export target in
    # addition to the DB. Must be a runner-selectable folder target.
    export_target_id: int | None = None


class JobSubmitAck(BaseModel):
    """What `POST /api/jobs` returns on 201 — tells the UI which lines were
    accepted, deduped, or rejected so the form can highlight problems."""

    job_id: int
    accepted: int
    duplicates: list[tuple[int, str]]
    errors: list[UrlError]


class JobCounts(BaseModel):
    pending: int = 0
    fetching: int = 0
    done: int = 0
    error: int = 0
    skipped: int = 0


class JobOut(BaseModel):
    id: int
    engine_id: int
    status: str
    counts: JobCounts
    started_at: datetime | None
    finished_at: datetime | None
    elapsed_s: int
    notes: str | None
    options: dict[str, Any]
    created_at: datetime


class JobDetailOut(JobOut):
    """Same as `JobOut` plus the per-target status table the live-progress
    page renders."""

    targets: list[TargetOut] = Field(default_factory=list)


class TargetOut(BaseModel):
    id: int
    url: str
    status: str
    attempts: int
    error: str | None
    session_num: int | None = None
    stagger_gap_s: float | None = None
    stagger_gap_min: float | None = None
    stagger_delay_s: float | None = None
    stagger_gap_display: str | None = None
    countdown_s: int | None = None


class JobResultOut(BaseModel):
    id: int
    target_id: int
    source_url: str
    final_url: str | None
    http_status: int | None
    title: str | None
    content_markdown: str | None
    content_text: str | None
    links: list[dict[str, str]]
    metadata: dict[str, Any]
    error: str | None
    duration_ms: int | None
    fetched_at: datetime


class JobResultsPage(BaseModel):
    job_id: int
    page: int
    page_size: int
    total: int
    items: list[JobResultOut]
