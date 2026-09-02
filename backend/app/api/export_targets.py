"""Export-target admin CRUD + health-test endpoint (PRD §6.4, §9).

All writes require the admin role + CSRF. The test endpoint is open
to any authenticated user so the runner can verify a target before
submitting. DELETE refuses to drop a target referenced by jobs
(referential safety, same pattern as engine delete).
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin, verify_csrf
from app.core.db import get_db
from app.models import ExportTarget, Job, User
from app.schemas import (
    ExportTargetCreate,
    ExportTargetOut,
    ExportTargetTestResult,
    ExportTargetUpdate,
)

logger = logging.getLogger("mykrawl.api.export_targets")

router = APIRouter(prefix="/api/export-targets", tags=["export-targets"])


def _to_out(row: ExportTarget) -> ExportTargetOut:
    return ExportTargetOut(
        id=row.id,
        name=row.name,
        mode=row.mode,
        path=row.path,
        format=row.file_format,
        split_size_mb=row.split_size_mb,
        runner_selectable=row.runner_selectable,
        enabled=row.enabled,
        created_at=row.created_at,
    )


def _validate_folder_target(body: ExportTargetCreate) -> None:
    """Apply PRD-mandated invariants before persisting a folder target."""
    if body.mode == "folder":
        if not body.path:
            raise ValueError("folder targets require a path")
        if body.format is None:
            raise ValueError("folder targets require a format (csv or xlsx)")


@router.get("", response_model=list[ExportTargetOut])
def list_targets(
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ExportTargetOut]:
    return [_to_out(t) for t in db.scalars(select(ExportTarget).order_by(ExportTarget.name)).all()]


@router.post(
    "",
    response_model=ExportTargetOut,
    status_code=201,
    dependencies=[Depends(verify_csrf)],
)
def create_target(
    body: ExportTargetCreate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> ExportTargetOut:
    try:
        _validate_folder_target(body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    row = ExportTarget(
        name=body.name,
        mode=body.mode,
        path=body.path,
        file_format=body.format,  # ORM attribute is file_format; column is "format"
        split_size_mb=body.split_size_mb,
        runner_selectable=body.runner_selectable,
        enabled=body.enabled,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400, detail=f"export target name {body.name!r} is already taken"
        ) from exc
    db.refresh(row)
    return _to_out(row)


@router.patch(
    "/{target_id}",
    response_model=ExportTargetOut,
    dependencies=[Depends(verify_csrf)],
)
def patch_target(
    target_id: int,
    body: ExportTargetUpdate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> ExportTargetOut:
    row = db.get(ExportTarget, target_id)
    if row is None:
        raise HTTPException(status_code=404, detail="export target not found")
    patch = body.model_dump(exclude_unset=True)
    # Re-validate the resulting state against the schema invariants.
    merged = ExportTargetCreate(
        name=patch.get("name", row.name),
        mode=row.mode,  # mode is immutable after creation (no field in Update)
        path=patch.get("path", row.path),
        format=patch.get("format", row.file_format),
        split_size_mb=patch.get("split_size_mb", row.split_size_mb),
        runner_selectable=patch.get("runner_selectable", row.runner_selectable),
        enabled=patch.get("enabled", row.enabled),
    )
    try:
        _validate_folder_target(merged)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    for field, value in patch.items():
        setattr(row, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="export target name conflict") from exc
    db.refresh(row)
    return _to_out(row)


@router.delete(
    "/{target_id}",
    status_code=204,
    dependencies=[Depends(verify_csrf)],
)
def delete_target(
    target_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    row = db.get(ExportTarget, target_id)
    if row is None:
        raise HTTPException(status_code=404, detail="export target not found")
    # Refuse to drop a target referenced by any job (FR-EXP-06 / general
    # referential safety; engine delete follows the same pattern).
    referenced = db.scalar(select(Job.id).where(Job.export_target_id == target_id).limit(1))
    if referenced is not None:
        raise HTTPException(
            status_code=400,
            detail="export target is referenced by a job; disable it instead",
        )
    db.delete(row)
    db.commit()


@router.post(
    "/{target_id}/test",
    response_model=ExportTargetTestResult,
    dependencies=[Depends(verify_csrf)],
)
def test_target(
    target_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ExportTargetTestResult:
    """FR-EXP-08: write a probe file, then delete it. Reports path/permission errors.

    The probe uses a UUID-named file so concurrent tests don't collide.
    """
    row = db.get(ExportTarget, target_id)
    if row is None:
        raise HTTPException(status_code=404, detail="export target not found")
    if row.mode != "folder" or not row.path:
        return ExportTargetTestResult(ok=True, detail="database target — nothing to test")
    try:
        directory = Path(row.path).expanduser().resolve()
        directory.mkdir(parents=True, exist_ok=True)
        probe = directory / f"Krawlyx_probe_{uuid.uuid4().hex[:8]}.txt"
        probe.write_text(
            f"Krawlyx probe at {datetime.now(UTC).isoformat(timespec='seconds')}\n",
            encoding="utf-8",
        )
        probe.unlink()
    except OSError as exc:
        return ExportTargetTestResult(ok=False, detail=f"{type(exc).__name__}: {exc}")
    return ExportTargetTestResult(ok=True, detail="probe written and removed")
