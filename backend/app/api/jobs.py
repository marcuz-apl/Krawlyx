"""Job runner API (PRD §6.2, §9 — FR-JOB-01..08).

All read endpoints require an authenticated user; mutating endpoints
require CSRF. The job's owner (any role) and any admin can cancel or
re-run a job; non-owner non-admins get 403.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, verify_csrf
from app.core.db import get_db
from app.models import EngineInstance, Job, JobResult, Target
from app.models.user import User
from app.schemas import (
    JobCounts,
    JobCreate,
    JobDetailOut,
    JobOut,
    JobResultOut,
    JobResultsPage,
    JobSubmitAck,
    TargetOut,
)
from app.services import jobs as jobs_svc
from app.services.urls import parse as parse_urls

logger = logging.getLogger("zencrawl.api.jobs")

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


# ---- helpers ----


def _elapsed_s(job: Job, now: datetime) -> int:
    if job.started_at is None:
        return 0
    end = job.finished_at or now
    return max(0, int((end - job.started_at).total_seconds()))


def _counts(db: Session, job_id: int) -> JobCounts:
    rows = db.execute(
        select(Target.status, func.count()).where(Target.job_id == job_id).group_by(Target.status)
    ).all()
    by_status = {s: c for s, c in rows}
    return JobCounts(
        pending=by_status.get("pending", 0),
        fetching=by_status.get("fetching", 0),
        done=by_status.get("done", 0),
        error=by_status.get("error", 0),
        skipped=by_status.get("skipped", 0),
    )


def _job_to_out(db: Session, job: Job) -> JobOut:
    return JobOut(
        id=job.id,
        engine_id=job.engine_id,
        status=job.status,
        counts=_counts(db, job.id),
        started_at=job.started_at,
        finished_at=job.finished_at,
        elapsed_s=_elapsed_s(job, datetime.now(UTC)),
        notes=job.notes,
        options=dict(job.options or {}),
        created_at=job.created_at,
    )


def _targets_for(db: Session, job_id: int) -> list[TargetOut]:
    return [
        TargetOut(
            id=t.id,
            url=t.url,
            status=t.status,
            attempts=t.attempts,
            error=t.error,
        )
        for t in db.scalars(select(Target).where(Target.job_id == job_id).order_by(Target.id))
    ]


def _ensure_can_act(user: User, job: Job) -> None:
    """The job's owner and any admin can cancel/re-run; everyone else → 403."""
    if user.role == "admin":
        return
    if job.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="not your job")


# ---- routes ----


@router.get("", response_model=list[JobOut])
def list_jobs(
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    status: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[JobOut]:
    stmt = select(Job).order_by(Job.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(Job.status == status)
    return [_job_to_out(db, j) for j in db.scalars(stmt).all()]


@router.post("", response_model=JobSubmitAck, status_code=201, dependencies=[Depends(verify_csrf)])
async def create_job(
    body: JobCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> JobSubmitAck:
    """Submit a new job. Validates URLs (FR-JOB-07), inserts the job +
    targets in one transaction, then hands the id to the dispatcher.
    """
    parsed = parse_urls(body.urls)
    if not parsed.urls:
        raise HTTPException(
            status_code=400,
            detail={
                "errors": [
                    {"line": e.line, "text": e.text, "reason": e.reason} for e in parsed.errors
                ]
            },
        )

    engine = db.get(EngineInstance, body.engine_id)
    if engine is None:
        raise HTTPException(status_code=400, detail="unknown engine")
    if not engine.pooled:
        raise HTTPException(status_code=400, detail="engine not available to runners")
    if engine.disabled_at is not None:
        raise HTTPException(status_code=400, detail="engine is disabled")

    job = Job(
        created_by_id=user.id,
        engine_id=engine.id,
        options=dict(body.options or {}),
        notes=body.notes,
        status="queued",
    )
    db.add(job)
    db.flush()  # assigns job.id
    for url in parsed.urls:
        db.add(Target(job_id=job.id, url=url, status="pending", attempts=0))
    db.commit()

    # Hand off to the dispatcher (creates an asyncio.Task on the running
    # loop). Tests bypass the lifespan; routes always rely on the live loop.
    await jobs_svc.enqueue_job(job.id)

    return JobSubmitAck(
        job_id=job.id,
        accepted=parsed.accepted,
        duplicates=parsed.duplicates,
        errors=parsed.errors,
    )


@router.get("/{job_id}", response_model=JobDetailOut)
def get_job(
    job_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> JobDetailOut:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    out = _job_to_out(db, job)
    return JobDetailOut(**out.model_dump(), targets=_targets_for(db, job_id))


@router.post("/{job_id}/cancel", status_code=204, dependencies=[Depends(verify_csrf)])
def cancel_job(
    job_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    _ensure_can_act(user, job)
    jobs_svc.cancel_job(db, job_id)
    return Response(status_code=204)


@router.get("/{job_id}/results", response_model=JobResultsPage)
def list_results(
    job_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> JobResultsPage:
    if db.get(Job, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    total = (
        db.scalar(
            select(func.count())
            .select_from(JobResult)
            .join(Target, Target.id == JobResult.target_id)
            .where(Target.job_id == job_id)
        )
        or 0
    )
    rows = db.execute(
        select(JobResult, Target.url)
        .join(Target, Target.id == JobResult.target_id)
        .where(Target.job_id == job_id)
        .order_by(JobResult.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        JobResultOut(
            id=r.id,
            target_id=r.target_id,
            source_url=url,
            final_url=r.final_url,
            http_status=r.http_status,
            title=r.title,
            content_markdown=r.content_markdown,
            content_text=r.content_text,
            links=list(r.links_json or []),
            metadata=dict(r.metadata_json or {}),
            error=r.error,
            duration_ms=r.duration_ms,
            fetched_at=r.fetched_at,
        )
        for r, url in rows
    ]
    return JobResultsPage(
        job_id=job_id, page=page, page_size=page_size, total=int(total), items=items
    )


@router.get("/{job_id}/results/{result_id}", response_model=JobResultOut)
def get_result(
    job_id: int,
    result_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> JobResultOut:
    r = db.get(JobResult, result_id)
    if r is None:
        raise HTTPException(status_code=404, detail="result not found")
    target = db.get(Target, r.target_id)
    if target is None or target.job_id != job_id:
        raise HTTPException(status_code=404, detail="result not found")
    return JobResultOut(
        id=r.id,
        target_id=r.target_id,
        source_url=target.url,
        final_url=r.final_url,
        http_status=r.http_status,
        title=r.title,
        content_markdown=r.content_markdown,
        content_text=r.content_text,
        links=list(r.links_json or []),
        metadata=dict(r.metadata_json or {}),
        error=r.error,
        duration_ms=r.duration_ms,
        fetched_at=r.fetched_at,
    )


def _safe_filename_part(s: str) -> str:
    return "".join(c for c in s if c.isalnum() or c in "-_.")[:80] or "result"


@router.get("/{job_id}/results/{result_id}/download.md", response_class=Response)
def get_result_markdown(
    job_id: int,
    result_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    r = db.get(JobResult, result_id)
    if r is None:
        raise HTTPException(status_code=404, detail="result not found")
    target = db.get(Target, r.target_id)
    if target is None or target.job_id != job_id:
        raise HTTPException(status_code=404, detail="result not found")
    body = r.content_markdown or ""
    fname = f"{_safe_filename_part(target.url)}.md"
    return Response(
        content=body,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{job_id}/results/{result_id}/download.json", response_class=Response)
def get_result_json(
    job_id: int,
    result_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    r = db.get(JobResult, result_id)
    if r is None:
        raise HTTPException(status_code=404, detail="result not found")
    target = db.get(Target, r.target_id)
    if target is None or target.job_id != job_id:
        raise HTTPException(status_code=404, detail="result not found")
    body = json.dumps(
        {
            "id": r.id,
            "target_id": r.target_id,
            "source_url": target.url,
            "final_url": r.final_url,
            "http_status": r.http_status,
            "title": r.title,
            "content_markdown": r.content_markdown,
            "content_text": r.content_text,
            "links": list(r.links_json or []),
            "metadata": dict(r.metadata_json or {}),
            "error": r.error,
            "duration_ms": r.duration_ms,
            "fetched_at": r.fetched_at.isoformat(),
        },
        ensure_ascii=False,
        indent=2,
    )
    fname = f"{_safe_filename_part(target.url)}.json"
    return Response(
        content=body,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{job_id}/export.json", response_class=Response)
def get_all_results_export(
    job_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    if db.get(Job, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    rows: Iterable[tuple[Any, Any]] = db.execute(
        select(JobResult, Target.url)
        .join(Target, Target.id == JobResult.target_id)
        .where(Target.job_id == job_id)
        .order_by(JobResult.id)
    ).all()
    payload = [
        {
            "id": r.id,
            "target_id": r.target_id,
            "source_url": url,
            "final_url": r.final_url,
            "http_status": r.http_status,
            "title": r.title,
            "content_markdown": r.content_markdown,
            "content_text": r.content_text,
            "links": list(r.links_json or []),
            "metadata": dict(r.metadata_json or {}),
            "error": r.error,
            "duration_ms": r.duration_ms,
            "fetched_at": r.fetched_at.isoformat(),
        }
        for r, url in rows
    ]
    body = json.dumps({"job_id": job_id, "results": payload}, ensure_ascii=False, indent=2)
    return Response(
        content=body,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="job-{job_id}-results.json"'},
    )


@router.post(
    "/{job_id}/rerun", response_model=JobOut, status_code=201, dependencies=[Depends(verify_csrf)]
)
async def rerun_job(
    job_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> JobOut:
    """Clone a job's configuration into a new queued job (FR-JOB-08).

    The original job is left intact; the clone gets new `Job` + `Target`
    rows, `schedule_id=NULL`, and a fresh `status='queued'`. The current
    user becomes the owner of the new job.
    """
    src = db.get(Job, job_id)
    if src is None:
        raise HTTPException(status_code=404, detail="job not found")
    _ensure_can_act(user, src)

    engine = db.get(EngineInstance, src.engine_id)
    if engine is None or not engine.pooled or engine.disabled_at is not None:
        raise HTTPException(status_code=400, detail="original engine no longer available")

    # Re-validate the URLs from the original targets (defence in depth).
    urls = [t.url for t in db.scalars(select(Target).where(Target.job_id == src.id))]
    parsed = parse_urls(urls)
    if not parsed.urls:
        raise HTTPException(status_code=400, detail="original job has no valid URLs to re-run")

    new_job = Job(
        created_by_id=user.id,
        engine_id=src.engine_id,
        options=dict(src.options or {}),
        notes=src.notes,
        status="queued",
        schedule_id=None,
    )
    db.add(new_job)
    db.flush()
    for url in parsed.urls:
        db.add(Target(job_id=new_job.id, url=url, status="pending", attempts=0))
    db.commit()

    await jobs_svc.enqueue_job(new_job.id)
    return _job_to_out(db, new_job)


@router.get("/{job_id}/events")
def job_events(
    job_id: int,
    _user: Annotated[User, Depends(get_current_user)],
) -> Response:
    """SSE event stream — stubbed in M3. The SPA polls per FR-JOB-04.

    Returns 501 so the route is documented and the SPA can detect the
    non-supporting environment cleanly. A future implementation will
    yield per-target state updates over an `asyncio.Queue`.
    """
    return Response(
        status_code=501,
        content="SSE not implemented in M3; the SPA polls GET /api/jobs/{id}.",
        media_type="text/plain",
    )
