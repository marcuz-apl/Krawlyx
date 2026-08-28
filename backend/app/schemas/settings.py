"""Settings read-only schema (PRD §6.5)."""

from __future__ import annotations

from pydantic import BaseModel


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
