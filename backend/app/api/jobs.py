"""Job runner API (PRD §6.2, §9 — FR-JOB-01..08).

All read endpoints require an authenticated user; mutating endpoints
require CSRF. The job's owner (any role) and any admin can cancel or
re-run a job; non-owner non-admins get 403.
"""

from __future__ import annotations

import csv
import io
import json
import logging
import time
import zipfile
from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, verify_csrf
from app.core.db import get_db
from app.models import EngineInstance, ExportTarget, Job, JobResult, Target
from app.models.user import User
from app.schemas import (
    JobCounts,
    JobCreate,
    JobDetailOut,
    JobOut,
    JobRecordsOut,
    JobResultOut,
    JobResultsPage,
    JobSubmitAck,
    TargetOut,
)
from app.services import jobs as jobs_svc
from app.services.urls import parse as parse_urls

logger = logging.getLogger("mykrawl.api.jobs")

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


# ---- helpers ----


def _elapsed_s(job: Job, now: datetime) -> int:
    if job.started_at is None:
        return 0
    end = job.finished_at or now
    start = job.started_at
    if start.tzinfo is None and end.tzinfo is not None:
        end = end.replace(tzinfo=None)
    elif start.tzinfo is not None and end.tzinfo is None:
        start = start.replace(tzinfo=None)
    return max(0, int((end - start).total_seconds()))


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
    job = db.get(Job, job_id)
    opts = job.options or {} if job else {}
    stagger_sched = opts.get("_stagger_schedule") or {}
    handle = jobs_svc.get_job_handle(job_id)
    now_mono = time.monotonic()

    result = []
    for t in db.scalars(select(Target).where(Target.job_id == job_id).order_by(Target.id)):
        sched = stagger_sched.get(str(t.id))
        session_num = None
        stagger_gap_s = None
        stagger_gap_min = None
        stagger_delay_s = None
        stagger_gap_display = None
        countdown_s = None

        if sched:
            session_num = sched.get("session_num")
            stagger_gap_s = sched.get("gap_s")
            stagger_gap_min = sched.get("gap_min")
            stagger_delay_s = sched.get("delay_s")
            stagger_gap_display = sched.get("gap_display")

            if handle and t.id in handle.target_delays and t.status in ("pending", "fetching"):
                target_mono = handle.target_delays[t.id].get("start_mono", 0)
                remaining = int(target_mono - now_mono)
                countdown_s = max(0, remaining) if remaining > 0 else 0

        result.append(
            TargetOut(
                id=t.id,
                url=t.url,
                status=t.status,
                attempts=t.attempts,
                error=t.error,
                session_num=session_num,
                stagger_gap_s=stagger_gap_s,
                stagger_gap_min=stagger_gap_min,
                stagger_delay_s=stagger_delay_s,
                stagger_gap_display=stagger_gap_display,
                countdown_s=countdown_s,
            )
        )
    return result


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

    # M4: optional folder export target. The target must be enabled,
    # folder-mode, and marked runner-selectable so admins control what
    # runners can see (FR-EXP-03). database-only jobs skip this branch.
    export_target_id: int | None = None
    if body.export_target_id is not None:
        target = db.get(ExportTarget, body.export_target_id)
        if target is None:
            raise HTTPException(status_code=400, detail="unknown export target")
        if not target.enabled:
            raise HTTPException(status_code=400, detail="export target is disabled")
        if target.mode != "folder":
            raise HTTPException(status_code=400, detail="export target is not a folder target")
        if not target.runner_selectable:
            raise HTTPException(
                status_code=403,
                detail="export target is not available to runners",
            )
        export_target_id = target.id

    job = Job(
        created_by_id=user.id,
        engine_id=engine.id,
        options=dict(body.options or {}),
        notes=body.notes,
        status="queued",
        export_target_id=export_target_id,
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


@router.get("/{job_id}/records", response_model=JobRecordsOut)
def get_job_records(
    job_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> JobRecordsOut:
    """Return all extracted structured records for the entire job without outer target pagination."""
    if db.get(Job, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")

    rows: Iterable[tuple[Any, Any]] = db.execute(
        select(JobResult, Target.url)
        .join(Target, Target.id == JobResult.target_id)
        .where(Target.job_id == job_id)
        .order_by(JobResult.id)
    ).all()

    all_records = []
    all_columns = set()
    total_targets = 0

    for r, url in rows:
        total_targets += 1
        meta = r.metadata_json or {}
        items = meta.get("items") or []
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict):
                    row_data = dict(it)
                    if "source_url" not in row_data:
                        row_data["source_url"] = url
                    all_records.append(row_data)
                    all_columns.update(k for k in row_data if k != "type")

    preferred_order = [
        "year",
        "make",
        "model",
        "trim",
        "drivetrain",
        "mileage_km",
        "mileage",
        "price",
        "seller_type",
        "city",
        "province",
        "dealer_name",
        "date_observed",
        "listing_url",
        "source_url",
        "name",
        "brand",
        "currency",
        "transmission",
        "fuel",
    ]
    sorted_cols = [c for c in preferred_order if c in all_columns] + sorted(
        c for c in all_columns if c not in preferred_order
    )

    return JobRecordsOut(
        job_id=job_id,
        total_records=len(all_records),
        total_targets=total_targets,
        columns=sorted_cols,
        records=all_records,
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


@router.get("/{job_id}/export.csv", response_class=Response)
def get_all_results_export_csv(
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
    output = io.StringIO()
    output.write("\ufeff")  # UTF-8 BOM for Excel
    writer = csv.writer(output)

    # Check if any structured dataset items exist
    all_structured_items = []
    for r, url in rows:
        meta = r.metadata_json or {}
        items = meta.get("items") or []
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict):
                    all_structured_items.append((it, url))

    if all_structured_items:
        preferred_order = [
            "year",
            "make",
            "model",
            "trim",
            "drivetrain",
            "mileage_km",
            "mileage",
            "price",
            "seller_type",
            "city",
            "province",
            "dealer_name",
            "date_observed",
            "listing_url",
            "transmission",
            "fuel",
            "name",
            "brand",
            "currency",
        ]
        all_keys = set()
        for it, _ in all_structured_items:
            all_keys.update(k for k in it.keys() if k != "type")
        headers = [k for k in preferred_order if k in all_keys] + sorted(
            k for k in all_keys if k not in preferred_order
        )

        writer.writerow(headers)
        for it, _ in all_structured_items:
            writer.writerow([it.get(h, "") for h in headers])
        filename = f"job-{job_id}-dataset.csv"
    else:
        writer.writerow(
            [
                "id",
                "target_id",
                "source_url",
                "final_url",
                "http_status",
                "title",
                "duration_ms",
                "fetched_at",
                "content_markdown",
                "content_text",
                "error",
            ]
        )
        for r, url in rows:
            writer.writerow(
                [
                    r.id,
                    r.target_id,
                    url,
                    r.final_url or "",
                    r.http_status or "",
                    r.title or "",
                    r.duration_ms or "",
                    r.fetched_at.isoformat() if r.fetched_at else "",
                    r.content_markdown or "",
                    r.content_text or "",
                    r.error or "",
                ]
            )
        filename = f"job-{job_id}-results.csv"

    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{job_id}/export.zip", response_class=Response)
def get_all_results_export_zip(
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
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for idx, (r, url) in enumerate(rows, 1):
            safe_name = _safe_filename_part(url)
            fname = f"{idx:03d}_{safe_name}.md"
            content = (
                f"---\n"
                f"title: {r.title or ''}\n"
                f"url: {url}\n"
                f"final_url: {r.final_url or url}\n"
                f"http_status: {r.http_status or ''}\n"
                f"fetched_at: {r.fetched_at.isoformat() if r.fetched_at else ''}\n"
                f"---\n\n"
                f"{r.content_markdown or r.content_text or ''}"
            )
            zf.writestr(fname, content.encode("utf-8"))
    buf.seek(0)
    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="job-{job_id}-markdown.zip"'},
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


@router.get("/{job_id}/log", response_class=Response)
def job_log(
    job_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    tail: int = Query(default=200, ge=1, le=5000),
) -> Response:
    """M6: tail the per-job rotating log file.

    Returns plain text (`text/plain; charset=utf-8`) of the last
    `tail` lines (default 200, max 5000). 404 when the log file
    doesn't exist (the job never ran or its log was rotated out).
    Open to any authenticated user — per-job logs are operational,
    not sensitive.
    """
    from app.core.config import get_settings

    log_path = get_settings().db_path.parent / "logs" / "jobs" / f"{job_id}.log"
    if not log_path.is_file():
        raise HTTPException(status_code=404, detail="log not found")
    try:
        # Read everything, then trim. Per-job logs are small (1 MB
        # cap × 5 rotations = ≤ 5 MB worst case); the per-request
        # cost is fine.
        text = log_path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    lines = text.splitlines()[-tail:]
    return Response(
        content="\n".join(lines) + ("\n" if lines else ""),
        media_type="text/plain; charset=utf-8",
    )


class MergeJobsIn(BaseModel):
    job_ids: list[int] = Field(..., min_length=1)


class MergeJobsOut(BaseModel):
    columns: list[str]
    total_rows: int
    rows: list[dict[str, Any]]
    source_job_ids: list[int]


@router.post("/merge", response_model=MergeJobsOut)
def merge_jobs(
    payload: MergeJobsIn,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> MergeJobsOut:
    """Merge structured dataset results across multiple jobs."""
    all_rows: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    all_columns: set[str] = set()

    for jid in payload.job_ids:
        results = db.execute(
            select(JobResult, Target.url)
            .join(Target, Target.id == JobResult.target_id)
            .where(Target.job_id == jid)
            .order_by(JobResult.id)
        ).all()

        for r, url in results:
            meta = r.metadata_json or {}
            items = meta.get("items") or []
            if isinstance(items, list) and items:
                for it in items:
                    if isinstance(it, dict):
                        link = it.get("listing_url") or it.get("url") or f"{jid}_{len(all_rows)}"
                        if link in seen_urls:
                            continue
                        seen_urls.add(link)
                        row_copy = dict(it)
                        row_copy["_job_id"] = jid
                        all_rows.append(row_copy)
                        all_columns.update(k for k in it.keys() if k != "type")
            else:
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                row_data = {
                    "title": r.title,
                    "url": url,
                    "http_status": r.http_status,
                    "duration_ms": r.duration_ms,
                    "date_observed": r.fetched_at.isoformat() if r.fetched_at else "",
                    "_job_id": jid,
                }
                all_rows.append(row_data)
                all_columns.update(row_data.keys())

    preferred_order = [
        "year",
        "make",
        "model",
        "trim",
        "drivetrain",
        "mileage_km",
        "mileage",
        "price",
        "seller_type",
        "city",
        "province",
        "dealer_name",
        "date_observed",
        "listing_url",
        "_job_id",
        "title",
        "url",
    ]
    sorted_cols = [c for c in preferred_order if c in all_columns] + sorted(
        c for c in all_columns if c not in preferred_order
    )

    return MergeJobsOut(
        columns=sorted_cols,
        total_rows=len(all_rows),
        rows=all_rows,
        source_job_ids=payload.job_ids,
    )


@router.post("/merge/export.csv", response_class=Response)
def export_merged_jobs_csv(
    payload: MergeJobsIn,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """Download merged jobs data directly as Excel-compatible CSV."""
    merged = merge_jobs(payload, _user, db)
    output = io.StringIO()
    output.write("\ufeff")  # UTF-8 BOM
    writer = csv.writer(output)

    headers = merged.columns
    writer.writerow(headers)
    for r in merged.rows:
        writer.writerow([r.get(h, "") for h in headers])

    job_str = "_".join(str(j) for j in payload.job_ids[:5])
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="merged-jobs-{job_str}.csv"'},
    )


class BulkDeleteJobsIn(BaseModel):
    job_ids: list[int] = Field(..., min_length=1)


@router.delete("/{job_id}", status_code=204)
def delete_job(
    job_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Delete a single job and its targets and results."""
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if user.role != "admin" and job.created_by_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")

    # Clear references from dataset rows
    from app.models.dataset import DatasetRow

    db.query(DatasetRow).filter(DatasetRow.source_job_id == job_id).update(
        {"source_job_id": None}, synchronize_session=False
    )

    # Delete results and targets explicitly
    target_ids = [t[0] for t in db.query(Target.id).filter(Target.job_id == job_id).all()]
    if target_ids:
        db.query(JobResult).filter(JobResult.target_id.in_(target_ids)).delete(
            synchronize_session=False
        )
        db.query(Target).filter(Target.job_id == job_id).delete(synchronize_session=False)

    db.delete(job)
    db.commit()


@router.post("/bulk-delete", status_code=204)
def bulk_delete_jobs(
    payload: BulkDeleteJobsIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Delete multiple jobs and their associated targets and results."""
    from app.models.dataset import DatasetRow

    for jid in payload.job_ids:
        job = db.get(Job, jid)
        if job and (user.role == "admin" or job.created_by_id == user.id):
            db.query(DatasetRow).filter(DatasetRow.source_job_id == jid).update(
                {"source_job_id": None}, synchronize_session=False
            )
            target_ids = [t[0] for t in db.query(Target.id).filter(Target.job_id == jid).all()]
            if target_ids:
                db.query(JobResult).filter(JobResult.target_id.in_(target_ids)).delete(
                    synchronize_session=False
                )
                db.query(Target).filter(Target.job_id == jid).delete(synchronize_session=False)
            db.delete(job)
    db.commit()
