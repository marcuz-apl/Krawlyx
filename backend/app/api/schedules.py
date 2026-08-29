"""Schedule admin API (PRD §6.3, §9 — FR-SCH-01..04).

All writes require admin + CSRF. Reads are open to any authenticated
user. `run-now` returns a Job response (not a Schedule) so the SPA
can route the user directly to the job progress page.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin, verify_csrf
from app.core.db import get_db
from app.models import EngineInstance, ExportTarget, Job, Schedule, User
from app.schemas import (
    JobOut,
    NextFiresOut,
    ScheduleCreate,
    ScheduleOut,
    ScheduleUpdate,
)
from app.services import scheduler as scheduler_svc

logger = logging.getLogger("zencrawl.api.schedules")

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


# ---- helpers ----


def _template_of(schedule: Schedule) -> dict[str, Any]:
    payload = schedule.payload or {}
    return {
        "engine_id": int(payload.get("engine_id", 0)),
        "export_target_id": payload.get("export_target_id"),
        "options": dict(payload.get("options") or {}),
        "urls": list(payload.get("urls", [])),
        "notes": payload.get("notes"),
    }


def _to_out(schedule: Schedule) -> ScheduleOut:
    template = _template_of(schedule)
    return ScheduleOut(
        id=schedule.id,
        name=schedule.name,
        cron=schedule.cron,
        timezone=schedule.timezone,
        enabled=schedule.enabled,
        running=schedule.running,
        last_run_at=schedule.last_run_at,
        next_run_at=schedule.next_run_at,
        created_at=schedule.created_at,
        engine_id=template["engine_id"],
        export_target_id=template["export_target_id"],
        options=template["options"],
        urls=template["urls"],
        notes=template["notes"],
        human=scheduler_svc.humanize_cron(schedule.cron, schedule.timezone),
    )


def _validate_template(db: Session, *, engine_id: int, export_target_id: int | None) -> None:
    if engine_id <= 0:
        raise ValueError("engine_id is required")
    engine = db.get(EngineInstance, engine_id)
    if engine is None:
        raise ValueError("unknown engine")
    if not engine.pooled:
        raise ValueError("engine not available to runners")
    if engine.disabled_at is not None:
        raise ValueError("engine is disabled")
    if export_target_id is not None:
        target = db.get(ExportTarget, int(export_target_id))
        if target is None:
            raise ValueError("unknown export target")
        if not target.enabled or target.mode != "folder":
            raise ValueError("export target not available for scheduled jobs")


def _payload_from(
    *,
    engine_id: int,
    export_target_id: int | None,
    options: dict[str, Any],
    urls: list[str],
    notes: str | None,
) -> dict[str, Any]:
    return {
        "engine_id": int(engine_id),
        "export_target_id": int(export_target_id) if export_target_id is not None else None,
        "options": dict(options or {}),
        "urls": list(urls or []),
        "notes": notes,
    }


def _job_to_out(db: Session, job: Job) -> JobOut:
    # Mirror `_job_to_out` in api/jobs.py; we keep a private copy to
    # avoid coupling the schedules router to private helpers there.
    from app.api.jobs import _job_to_out as _jobs_to_out  # local import to dodge cycles

    return _jobs_to_out(db, job)


# ---- routes ----


@router.get("", response_model=list[ScheduleOut])
def list_schedules(
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ScheduleOut]:
    return [_to_out(s) for s in db.scalars(select(Schedule).order_by(Schedule.name)).all()]


@router.post(
    "",
    response_model=ScheduleOut,
    status_code=201,
    dependencies=[Depends(verify_csrf)],
)
def create_schedule(
    body: ScheduleCreate,
    _admin: Annotated[User, Depends(require_admin)],
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ScheduleOut:
    try:
        _validate_template(
            db,
            engine_id=body.engine_id,
            export_target_id=body.export_target_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    # Cron must be parseable up-front so the user sees a 400 before
    # the row is written.
    try:
        scheduler_svc._make_trigger(body.cron, body.timezone)
    except (ValueError, Exception) as exc:
        raise HTTPException(status_code=400, detail=f"invalid cron/timezone: {exc}") from exc

    row = Schedule(
        name=body.name,
        cron=body.cron,
        timezone=body.timezone,
        payload=_payload_from(
            engine_id=body.engine_id,
            export_target_id=body.export_target_id,
            options=body.options,
            urls=body.urls,
            notes=body.notes,
        ),
        enabled=body.enabled,
        created_by_id=user.id,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400, detail=f"schedule name {body.name!r} is already taken"
        ) from exc
    db.refresh(row)
    scheduler_svc.add_or_replace_job(row)
    # Refresh again — `add_or_replace_job` updated `next_run_at` in its
    # own session. We need to read the fresh value here.
    db.refresh(row)
    return _to_out(row)


@router.get("/{schedule_id}", response_model=ScheduleOut)
def get_schedule(
    schedule_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ScheduleOut:
    row = db.get(Schedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="schedule not found")
    return _to_out(row)


@router.patch(
    "/{schedule_id}",
    response_model=ScheduleOut,
    dependencies=[Depends(verify_csrf)],
)
def patch_schedule(
    schedule_id: int,
    body: ScheduleUpdate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> ScheduleOut:
    row = db.get(Schedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="schedule not found")
    patch = body.model_dump(exclude_unset=True)

    # Re-validate against the merged state.
    template = _template_of(row)
    merged_engine_id = patch.get("engine_id", template["engine_id"])
    merged_export_id = patch.get("export_target_id", template["export_target_id"])
    if "urls" in patch:
        template["urls"] = patch["urls"]
    if "options" in patch:
        template["options"] = patch["options"]
    if "notes" in patch:
        template["notes"] = patch["notes"]
    try:
        _validate_template(db, engine_id=int(merged_engine_id), export_target_id=merged_export_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    new_cron = patch.get("cron", row.cron)
    new_tz = patch.get("timezone", row.timezone)
    try:
        scheduler_svc._make_trigger(new_cron, new_tz)
    except (ValueError, Exception) as exc:
        raise HTTPException(status_code=400, detail=f"invalid cron/timezone: {exc}") from exc

    for field in ("name", "cron", "timezone", "enabled"):
        if field in patch:
            setattr(row, field, patch[field])

    # Rebuild the payload from the merged template + incoming fields.
    row.payload = _payload_from(
        engine_id=int(merged_engine_id),
        export_target_id=merged_export_id,
        options=template["options"],
        urls=template["urls"],
        notes=template["notes"],
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="schedule name conflict") from exc
    db.refresh(row)
    scheduler_svc.add_or_replace_job(row)
    db.refresh(row)
    return _to_out(row)


@router.delete(
    "/{schedule_id}",
    status_code=204,
    dependencies=[Depends(verify_csrf)],
)
def delete_schedule(
    schedule_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    row = db.get(Schedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="schedule not found")
    # Refuse to drop a schedule referenced by a non-terminal job.
    referenced = db.scalar(
        select(Job.id)
        .where(Job.schedule_id == schedule_id)
        .where(Job.status.in_(("queued", "running")))
        .limit(1)
    )
    if referenced is not None:
        raise HTTPException(
            status_code=400,
            detail="schedule is referenced by an in-flight job; disable it instead",
        )
    scheduler_svc.remove_job(schedule_id)
    db.delete(row)
    db.commit()


@router.post(
    "/{schedule_id}/run-now",
    response_model=JobOut,
    status_code=201,
    dependencies=[Depends(verify_csrf)],
)
async def run_now(
    schedule_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> JobOut:
    row = db.get(Schedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="schedule not found")
    if not row.enabled:
        raise HTTPException(status_code=400, detail="schedule is disabled")
    if row.running:
        raise HTTPException(
            status_code=409, detail="a previous fire of this schedule is still in flight"
        )
    new_job_id = await scheduler_svc.run_now(schedule_id)
    if new_job_id is None:
        # Race: lock was acquired between our check and the fire.
        raise HTTPException(status_code=409, detail="schedule is already firing")
    new_job = db.get(Job, new_job_id)
    if new_job is None:
        raise HTTPException(status_code=500, detail="run-now produced no job")
    return _job_to_out(db, new_job)


@router.get("/{schedule_id}/next-fires", response_model=NextFiresOut)
def next_fires(
    schedule_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> NextFiresOut:
    row = db.get(Schedule, schedule_id)
    if row is None:
        raise HTTPException(status_code=404, detail="schedule not found")
    base = row.last_run_at or datetime.now(UTC)
    fires = scheduler_svc.compute_next_fires(row.cron, row.timezone, n=3, after=base)
    return NextFiresOut(
        schedule_id=schedule_id,
        cron=row.cron,
        timezone=row.timezone,
        next_runs=fires,
        human=scheduler_svc.humanize_cron(row.cron, row.timezone),
    )
