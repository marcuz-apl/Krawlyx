"""Settings read-only schema (PRD §6.5)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SettingsOut(BaseModel):
    # FR-SET-01
    max_concurrent_jobs: int
    max_parallel_targets_per_job: int
    default_split_size_mb: int
    # FR-SET-02..04
    robots_txt_enabled: bool
    per_domain_interval_s: float
    ssrf_guard_enabled: bool
    content_size_cap_bytes: int
    # M6 additions
    ssrf_allow_list: list[str]
    admin_contact_email: str


class SettingsUpdateBody(BaseModel):
    max_concurrent_jobs: int | None = Field(default=None, ge=1, le=64)
    max_parallel_targets_per_job: int | None = Field(default=None, ge=1, le=100)
    default_split_size_mb: int | None = Field(default=None, ge=1, le=1000)
    robots_txt_enabled: bool | None = None
    per_domain_interval_s: float | None = Field(default=None, ge=0.0, le=60.0)
    ssrf_guard_enabled: bool | None = None
    content_size_cap_bytes: int | None = Field(default=None, ge=1024 * 100)
    ssrf_allow_list: list[str] | None = None
    admin_contact_email: str | None = None
