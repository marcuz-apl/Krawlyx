"""Settings read-only API (PRD §6.5).

The admin views the current global settings here. M5 ships a
read-only endpoint; the SPA tells the admin to edit `.env` and
restart. M6 (or a follow-up) can add a PATCH path.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.models import User
from app.schemas import SettingsOut

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=SettingsOut)
def get_settings_route(
    _user: Annotated[User, Depends(get_current_user)],
) -> SettingsOut:
    s = get_settings()
    return SettingsOut(
        max_concurrent_jobs=s.max_concurrent_jobs,
        max_parallel_targets_per_job=s.max_parallel_targets_per_job,
        default_split_size_mb=s.default_split_size_mb,
        robots_txt_enabled=s.robots_txt_enabled,
        per_domain_interval_s=s.per_domain_interval_s,
        ssrf_guard_enabled=s.ssrf_guard_enabled,
        content_size_cap_bytes=s.content_size_cap_bytes,
    )
