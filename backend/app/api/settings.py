"""Settings read-only API and SQLite Maintenance (PRD §6.5)."""

from __future__ import annotations

import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db, require_admin
from app.core.config import get_env_file_path, get_settings, reload_settings
from app.core.env_writer import update_env_file
from app.models import Dataset, DatasetRow, Job, JobResult, User
from app.schemas import SettingsOut, SettingsUpdateBody
from app.services import jobs as jobs_svc

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _format_size(b: int) -> str:
    if b < 1024:
        return f"{b} B"
    elif b < 1024 * 1024:
        return f"{b / 1024:.2f} KB"
    elif b < 1024 * 1024 * 1024:
        return f"{b / (1024 * 1024):.2f} MB"
    return f"{b / (1024 * 1024 * 1024):.2f} GB"


class DbStatsOut(BaseModel):
    db_path: str
    db_size_bytes: int
    db_size_formatted: str
    wal_size_bytes: int
    wal_size_formatted: str
    journal_mode: str
    page_count: int
    page_size: int
    total_datasets: int
    total_dataset_rows: int
    total_jobs: int
    total_job_results: int


class DbMaintenanceResult(BaseModel):
    action: str
    success: bool
    message: str
    before_size_bytes: int
    after_size_bytes: int
    before_size_formatted: str
    after_size_formatted: str
    bytes_freed: int


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
        ssrf_allow_list=list(s.ssrf_allow_list),
        admin_contact_email=s.admin_contact_email,
    )


@router.patch("", response_model=SettingsOut)
def update_settings_route(
    body: SettingsUpdateBody,
    _admin: Annotated[User, Depends(require_admin)],
) -> SettingsOut:
    """Update runtime settings, resize dispatcher concurrency, and persist to .env."""
    env_path = get_env_file_path()
    updates: dict[str, object] = {}

    if body.max_concurrent_jobs is not None:
        updates["MYKRAWL_MAX_CONCURRENT_JOBS"] = body.max_concurrent_jobs
    if body.max_parallel_targets_per_job is not None:
        updates["MYKRAWL_MAX_PARALLEL_TARGETS_PER_JOB"] = body.max_parallel_targets_per_job
    if body.default_split_size_mb is not None:
        updates["MYKRAWL_DEFAULT_SPLIT_SIZE_MB"] = body.default_split_size_mb
    if body.robots_txt_enabled is not None:
        updates["MYKRAWL_ROBOTS_TXT_ENABLED"] = body.robots_txt_enabled
    if body.per_domain_interval_s is not None:
        updates["MYKRAWL_PER_DOMAIN_INTERVAL_S"] = body.per_domain_interval_s
    if body.ssrf_guard_enabled is not None:
        updates["MYKRAWL_SSRF_GUARD_ENABLED"] = body.ssrf_guard_enabled
    if body.content_size_cap_bytes is not None:
        updates["MYKRAWL_CONTENT_SIZE_CAP_BYTES"] = body.content_size_cap_bytes
    if body.ssrf_allow_list is not None:
        updates["MYKRAWL_SSRF_ALLOW_LIST"] = ",".join(body.ssrf_allow_list)
    if body.admin_contact_email is not None:
        updates["MYKRAWL_ADMIN_CONTACT_EMAIL"] = body.admin_contact_email

    if updates:
        for k, v in updates.items():
            os.environ[k] = str(v).lower() if isinstance(v, bool) else str(v)

        update_env_file(env_path, updates)
        reloaded = reload_settings()

        if body.max_concurrent_jobs is not None:
            jobs_svc.update_concurrency_slots(body.max_concurrent_jobs)
    else:
        reloaded = get_settings()

    return SettingsOut(
        max_concurrent_jobs=reloaded.max_concurrent_jobs,
        max_parallel_targets_per_job=reloaded.max_parallel_targets_per_job,
        default_split_size_mb=reloaded.default_split_size_mb,
        robots_txt_enabled=reloaded.robots_txt_enabled,
        per_domain_interval_s=reloaded.per_domain_interval_s,
        ssrf_guard_enabled=reloaded.ssrf_guard_enabled,
        content_size_cap_bytes=reloaded.content_size_cap_bytes,
        ssrf_allow_list=list(reloaded.ssrf_allow_list),
        admin_contact_email=reloaded.admin_contact_email,
    )


@router.get("/db/stats", response_model=DbStatsOut)
def get_db_stats(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> DbStatsOut:
    """Get live storage metrics and page allocation stats for the SQLite database."""
    s = get_settings()
    db_path = str(s.db_path)

    db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
    wal_path = f"{db_path}-wal"
    wal_size = os.path.getsize(wal_path) if os.path.exists(wal_path) else 0

    journal_mode = db.execute(text("PRAGMA journal_mode")).scalar() or "wal"
    page_count = db.execute(text("PRAGMA page_count")).scalar() or 0
    page_size = db.execute(text("PRAGMA page_size")).scalar() or 4096

    total_datasets = db.scalar(select(func.count(Dataset.id))) or 0
    total_dataset_rows = db.scalar(select(func.count(DatasetRow.id))) or 0
    total_jobs = db.scalar(select(func.count(Job.id))) or 0
    total_job_results = db.scalar(select(func.count(JobResult.id))) or 0

    return DbStatsOut(
        db_path=db_path,
        db_size_bytes=db_size,
        db_size_formatted=_format_size(db_size),
        wal_size_bytes=wal_size,
        wal_size_formatted=_format_size(wal_size),
        journal_mode=str(journal_mode),
        page_count=int(page_count),
        page_size=int(page_size),
        total_datasets=int(total_datasets),
        total_dataset_rows=int(total_dataset_rows),
        total_jobs=int(total_jobs),
        total_job_results=int(total_job_results),
    )


@router.post("/db/checkpoint", response_model=DbMaintenanceResult)
def run_db_checkpoint(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> DbMaintenanceResult:
    """Flush the Write-Ahead Log (WAL) into the main database file and truncate WAL size."""
    s = get_settings()
    db_path = str(s.db_path)
    wal_path = f"{db_path}-wal"

    before_total = (os.path.getsize(db_path) if os.path.exists(db_path) else 0) + (
        os.path.getsize(wal_path) if os.path.exists(wal_path) else 0
    )

    try:
        db.execute(text("PRAGMA wal_checkpoint(TRUNCATE)"))
        db.commit()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Checkpoint failed: {e}",
        )

    after_total = (os.path.getsize(db_path) if os.path.exists(db_path) else 0) + (
        os.path.getsize(wal_path) if os.path.exists(wal_path) else 0
    )
    freed = max(0, before_total - after_total)

    return DbMaintenanceResult(
        action="WAL Checkpoint (TRUNCATE)",
        success=True,
        message="WAL log successfully flushed to main database and truncated.",
        before_size_bytes=before_total,
        after_size_bytes=after_total,
        before_size_formatted=_format_size(before_total),
        after_size_formatted=_format_size(after_total),
        bytes_freed=freed,
    )


@router.post("/db/vacuum", response_model=DbMaintenanceResult)
def run_db_vacuum(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> DbMaintenanceResult:
    """Rebuild and defragment the SQLite database file to reclaim unused pages."""
    s = get_settings()
    db_path = str(s.db_path)
    wal_path = f"{db_path}-wal"

    before_total = (os.path.getsize(db_path) if os.path.exists(db_path) else 0) + (
        os.path.getsize(wal_path) if os.path.exists(wal_path) else 0
    )

    try:
        db.execute(text("VACUUM"))
        db.commit()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"VACUUM failed: {e}",
        )

    after_total = (os.path.getsize(db_path) if os.path.exists(db_path) else 0) + (
        os.path.getsize(wal_path) if os.path.exists(wal_path) else 0
    )
    freed = max(0, before_total - after_total)

    return DbMaintenanceResult(
        action="Database VACUUM",
        success=True,
        message="Database successfully vacuumed, defragmented, and compacted.",
        before_size_bytes=before_total,
        after_size_bytes=after_total,
        before_size_formatted=_format_size(before_total),
        after_size_formatted=_format_size(after_total),
        bytes_freed=freed,
    )
