"""Job runner service: queue, worker pool, cancellation, recovery (PRD §6.2).

This module owns the in-process job queue and worker pool. The state of a
job is in the `jobs` table; this module only keeps ephemeral runtime state
(`_active`, `_queue`, semaphores) that lives in the FastAPI process.

Architectural rules (AGENTS.md invariants):
  - No concrete engine imports — talk to the registry through
    `app.engines.registry.build()` and the `CrawlEngine` protocol.
  - Background work lives here, not in route handlers. Routes call
    `enqueue_job()` and return.
  - Engine config is decrypted via `app.services.engines.decrypt_config`
    so the encryption boundary stays in one place.

Process model: a single `asyncio` task per active job, gated by a
process-wide `asyncio.Semaphore(settings.max_concurrent_jobs)`. Jobs that
arrive while the pool is full wait in a FIFO `collections.deque`.

Crash recovery: on `start_dispatcher()` we sweep the DB for jobs left in
`queued` or `running` by a previous process and mark them `failed` with
`error='server restarted'`. Re-run is the user's recovery path.
"""

from __future__ import annotations

import asyncio
import collections
import logging
import time
from dataclasses import dataclass, field

from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.engines import registry
from app.engines.base import CrawlEngine, CrawlRecord, JobOptions, Target
from app.models import EngineInstance, Job
from app.models import Target as TargetRow
from app.services.engines import decrypt_config

logger = logging.getLogger("zencrawl.jobs")

# ---- in-memory runtime state (singleton per process) ----
_active: dict[int, JobHandle] = {}
_queue: collections.deque[int] = collections.deque()
_slots: asyncio.Semaphore | None = None
_started: bool = False


@dataclass
class JobHandle:
    """Per-job runtime handle held in `_active` while a job is being worked."""

    job_id: int
    cancel_event: asyncio.Event = field(default_factory=asyncio.Event)
    target_tasks: set[asyncio.Task] = field(default_factory=set)
    started_at: float = field(default_factory=time.monotonic)
    # Set by `_run_job` after the engine is validated. `_run_target`
    # uses it to stream rows; the worker closes it before releasing the
    # pool slot. `None` when the job has no folder export target.
    exporter: object = None


# ---- lifecycle ----


def _slots_semaphore() -> asyncio.Semaphore:
    global _slots
    if _slots is None:
        _slots = asyncio.Semaphore(get_settings().max_concurrent_jobs)
    return _slots


def start_dispatcher() -> None:
    """Idempotent: recover orphaned rows, then start the dispatcher loop.

    Safe to call from FastAPI's `lifespan` and from tests.
    """
    global _started
    _recover_orphaned_jobs()
    if _started:
        return
    _started = True
    # No top-level background task is needed: each `enqueue_job` either
    # acquires a slot immediately and spawns its worker, or pushes to the
    # queue. When a worker finishes, it pops the next queued id.
    logger.info("job dispatcher started (max_concurrent=%d)", get_settings().max_concurrent_jobs)


def recover_orphaned_jobs() -> None:
    """Public alias for `_recover_orphaned_jobs` so tests can trigger the
    sweep without re-running the full `start_dispatcher` (which is
    idempotent at the DB level too, but exposing this keeps the surface
    symmetric with the rest of the API)."""
    _recover_orphaned_jobs()


def shutdown() -> None:
    """Cancel all active jobs and clear the queue. Idempotent."""
    global _started
    for handle in list(_active.values()):
        handle.cancel_event.set()
    for task in [t for h in _active.values() for t in h.target_tasks]:
        task.cancel()
    _active.clear()
    _queue.clear()
    _started = False
    logger.info("job dispatcher shut down")


def is_active(job_id: int) -> bool:
    return job_id in _active or job_id in _queue


# ---- public API used by the routers ----


async def enqueue_job(job_id: int) -> None:
    """Try to start the job now; if the pool is full, queue it for FIFO pickup."""
    if not _started:
        # Tests that bypass the lifespan call start_dispatcher() themselves.
        start_dispatcher()
    queue = _queue
    sem = _slots_semaphore()

    # If we can grab a slot without waiting, start immediately; else queue.
    if sem.locked() or queue:
        queue.append(job_id)
        logger.info("job %d queued (pool full or backlog non-empty)", job_id)
        return

    # Acquire a slot and spawn the worker. The slot is released inside
    # `_run_job`'s finally block.
    await sem.acquire()
    asyncio.create_task(_run_job(job_id, sem))


def cancel_job(db: Session, job_id: int) -> bool:
    """Idempotent: mark the job cancelled, set the event, skip pending targets."""
    job = db.get(Job, job_id)
    if job is None:
        return False
    if job.status in {"completed", "failed", "cancelled"}:
        # Already terminal — nothing to do; idempotent.
        return True

    job.status = "cancelled"
    db.execute(
        update(TargetRow)
        .where(TargetRow.job_id == job_id, TargetRow.status.in_(("pending", "fetching")))
        .values(status="skipped", error="cancelled")
    )
    db.commit()

    handle = _active.get(job_id)
    if handle is not None:
        handle.cancel_event.set()

    return True


# ---- worker ----


async def _run_job(job_id: int, sem: asyncio.Semaphore) -> None:
    """Worker loop for one job. Releases its pool slot on exit."""
    from app.core.db import SessionLocal
    from app.core.logging_config import job_log_handler

    # M6: attach a per-job rotating file handler. Every log record from
    # the worker (and the engine adapters it calls into) flows into
    # data/logs/jobs/{id}.log. The handler is detached in `finally`
    # below so the file handle isn't leaked.
    job_logger = logging.getLogger(f"zencrawl.jobs.{job_id}")
    job_handler = job_log_handler(job_id)
    job_logger.addHandler(job_handler)
    job_logger.setLevel(logging.INFO)

    db = SessionLocal()
    try:
        job = db.get(Job, job_id)
        if job is None:
            job_logger.warning("_run_job: job %d vanished", job_id)
            return

        engine_row = db.get(EngineInstance, job.engine_id)
        if engine_row is None or not engine_row.pooled or engine_row.disabled_at is not None:
            job.status = "failed"
            from app.models.base import utcnow

            job.finished_at = utcnow()
            job.options = dict(job.options or {}) | {"_error": "engine unavailable"}
            db.commit()
            return

        job.status = "running"
        from app.models.base import utcnow

        job.started_at = utcnow()
        db.commit()

        handle = JobHandle(job_id=job_id)
        _active[job_id] = handle
        try:
            config = decrypt_config(engine_row.config_encrypted)
            try:
                engine = registry.build(engine_row.type, config)
            except (KeyError, ValidationError, ValueError) as exc:
                job_logger.warning("engine build failed for job %d: %s", job_id, exc)
                _mark_job_failed(db, job, str(exc))
                return

            assert isinstance(engine, CrawlEngine)  # for type-checkers

            # M4: if the job references a folder export target, build
            # the streaming Exporter now and put it on the handle. The
            # target must exist, be enabled, and have a path + format.
            exporter = _build_exporter(db, job)
            handle.exporter = exporter

            targets = list(
                db.scalars(
                    select(TargetRow).where(TargetRow.job_id == job_id).order_by(TargetRow.id)
                )
            )
            if not targets:
                _mark_job_complete(db, job, handle, exporter=exporter)
                return

            per_job_parallel = min(get_settings().max_parallel_targets_per_job, len(targets))
            target_sem = asyncio.Semaphore(per_job_parallel)

            # Skip targets that were already skipped (e.g. by a previous
            # partial run before a crash; recovery sweep handled this, but
            # the filter keeps the loop tidy).
            pending = [t for t in targets if t.status == "pending"]
            tasks = [
                asyncio.create_task(_run_target(handle, target_sem, engine, t, job.options or {}))
                for t in pending
            ]
            handle.target_tasks = set(tasks)
            await asyncio.gather(*tasks, return_exceptions=True)

            if handle.cancel_event.is_set():
                _mark_job_cancelled(db, job, exporter=exporter)
            else:
                _mark_job_complete(db, job, handle, exporter=exporter)
        finally:
            _active.pop(job_id, None)
    except Exception as exc:  # broad catch so the pool survives
        job_logger.exception("_run_job crashed for job %d", job_id)
        try:
            job = db.get(Job, job_id)
            if job is not None and job.status not in {"completed", "failed", "cancelled"}:
                _mark_job_failed(db, job, f"worker crash: {exc}")
        except Exception:  # final guard: never let recovery crash the pool
            job_logger.exception("failed to record job %d as failed", job_id)
    finally:
        db.close()
        # M6: detach the per-job log handler so the file is closed and
        # subsequent file handles aren't leaked. The handler's stream
        # is the rotating file; closing it flushes the final lines.
        try:
            job_logger.removeHandler(job_handler)
            job_handler.close()
        except Exception:  # noqa: BLE001 — cleanup, never let it crash the pool
            job_logger.warning("failed to close job log handler for %d", job_id)
        sem.release()
        _handoff_next(sem)


def _handoff_next(sem: asyncio.Semaphore) -> None:
    """Pull the next queued job (if any) and spawn it under the released slot.

    Pulled out of `_run_job`'s finally block so a `return` here can't
    swallow an in-flight exception (ruff B012). When a job finishes, we
    always want to start the next one waiting in the queue; this is the
    point that gates the concurrency cap.
    """
    while True:
        try:
            next_id = _queue.popleft()
        except IndexError:
            return
        # Spawn it under the slot we just released; this is a chained
        # handoff so we never exceed the configured cap.
        asyncio.create_task(_run_job(next_id, sem))
        return


async def _run_target(
    handle: JobHandle,
    sem: asyncio.Semaphore,
    engine: CrawlEngine,
    target_row: TargetRow,
    job_options: dict,
) -> None:
    """Fetch one target, persist the (first) CrawlRecord, update status."""
    from app.core.db import SessionLocal
    from app.models import JobResult
    from app.models.base import utcnow

    job_logger_local = logging.getLogger(f"zencrawl.jobs.{handle.job_id}")

    async with sem:
        if handle.cancel_event.is_set():
            return  # already skipped by cancel_job

        # Each target gets its own short-lived session; the worker session
        # shouldn't be held across an async yield.
        db = SessionLocal()
        try:
            row = db.get(TargetRow, target_row.id)
            if row is None or row.status != "pending":
                return
            row.status = "fetching"
            row.attempts = (row.attempts or 0) + 1
            db.commit()

            target = Target(target_id=str(row.id), url=row.url)
            options = JobOptions.model_validate(job_options) if job_options else JobOptions()

            started = time.monotonic()
            try:
                additional: list[dict] = []
                primary: CrawlRecord | None = None
                async for record in engine.fetch(target, options):
                    if primary is None:
                        primary = record
                    else:
                        additional.append(_record_to_dict(record))
                    # Stop after the first record — the schema's UNIQUE on
                    # `job_results.target_id` makes a target 1:1 with its
                    # primary record. Extra records are stashed in
                    # `metadata_json.additional_records`.
            except Exception as exc:  # noqa: BLE001 — engine boundary
                job_logger_local.warning("engine.fetch failed for target %d: %s", row.id, exc)
                row.status = "error"
                row.error = str(exc)[:1000]
                db.commit()
                _export_skipped(handle, row)
                return

            elapsed_ms = int((time.monotonic() - started) * 1000)

            if primary is None:
                row.status = "skipped"
                row.error = "no record yielded"
                db.commit()
                _export_skipped(handle, row)
                return

            if primary.status == "skipped":
                row.status = "skipped"
                row.error = primary.error
                db.commit()
                _export_skipped(handle, row)
                return

            metadata = dict(primary.metadata or {})
            if additional:
                metadata["additional_records"] = additional

            db.add(
                JobResult(
                    target_id=row.id,
                    final_url=primary.final_url,
                    http_status=primary.http_status,
                    title=primary.title,
                    content_markdown=primary.content_markdown,
                    content_text=primary.content_text,
                    links_json=list(primary.links or []),
                    metadata_json=metadata,
                    error=primary.error,
                    duration_ms=elapsed_ms,
                    fetched_at=utcnow(),
                )
            )
            row.status = "done" if primary.status == "ok" else "error"
            if primary.status == "error":
                row.error = primary.error
            db.commit()
            job_logger_local.info("target %d fetched (%s, %s ms)", row.id, primary.status, elapsed_ms)

            # M4: stream the just-persisted result to the export file
            # (no-op when the job has no folder target).
            _export_result(handle, row, db)
        finally:
            db.close()


# ---- status transitions ----


def _mark_job_complete(
    db: Session, job: Job, handle: JobHandle, *, exporter: object | None = None
) -> None:
    from app.models.base import utcnow

    has_error = db.scalar(
        select(TargetRow.id).where(TargetRow.job_id == job.id, TargetRow.status == "error").limit(1)
    )
    job.status = "failed" if has_error else "completed"
    job.finished_at = utcnow()
    _finalize_export(db, job, exporter)
    db.commit()


def _mark_job_cancelled(db: Session, job: Job, *, exporter: object | None = None) -> None:
    from app.models.base import utcnow

    job.status = "cancelled"
    job.finished_at = utcnow()
    _finalize_export(db, job, exporter)
    db.commit()


def _mark_job_failed(db: Session, job: Job, reason: str) -> None:
    from app.models.base import utcnow

    job.status = "failed"
    job.finished_at = utcnow()
    job.options = dict(job.options or {}) | {"_error": reason}
    db.commit()


# ---- M4: export hook helpers ----


def _build_exporter(db: Session, job: Job) -> object | None:
    """Construct an `Exporter` if the job has a folder export target.

    Returns `None` when the job has no `export_target_id`, when the
    target is missing, or when it's not a folder-mode target. Returning
    `None` is the M3 default — DB-only — and `_run_target` treats it
    as a no-op.
    """
    if job.export_target_id is None:
        return None
    from app.models import ExportTarget as ExportTargetRow

    target = db.get(ExportTargetRow, job.export_target_id)
    if (
        target is None
        or not target.enabled
        or target.mode != "folder"
        or target.path is None
        or target.format is None
    ):
        return None
    # Lazy import — `app.exporters` pulls in `openpyxl` which the tests
    # may not need for non-export code paths.
    from app.exporters import Exporter

    return Exporter(job, target)


def _export_result(handle: JobHandle, target_row: TargetRow, db: Session) -> None:
    """Stream a just-persisted `JobResult` to the export file."""
    exporter = handle.exporter
    if exporter is None:
        return
    from app.models import JobResult as JobResultRow

    result = db.scalar(select(JobResultRow).where(JobResultRow.target_id == target_row.id))
    if result is not None:
        exporter.write_result(result, source_url=target_row.url)


def _export_skipped(handle: JobHandle, target_row: TargetRow) -> None:
    """Stream an error/skipped target so the file reflects the real picture."""
    exporter = handle.exporter
    if exporter is None:
        return
    exporter.write_skipped(target_row)


def _finalize_export(db: Session, job: Job, exporter: object | None) -> None:
    """Close the exporter and, if it degraded, set the job's status accordingly.

    FR-EXP-08: an unwritable target flags the job `export_degraded` but
    the DB persists. The DB write has already happened upstream; we
    only adjust the job's final status now.
    """
    if exporter is None:
        return
    exporter.close()
    if getattr(exporter, "is_degraded", False):
        reason = getattr(exporter, "degrade_reason", "export failed")
        job.status = "export_degraded"
        job.options = dict(job.options or {}) | {"_export_error": reason}


# ---- recovery ----


def _recover_orphaned_jobs() -> None:
    """Mark any job left in queued/running by a previous process as failed.

    This is the simplest deterministic recovery: the user re-runs.
    A real restart-friendly queue is M5 territory (it'd need durable
    storage of in-flight state, which we don't have without a queue lib).
    """
    from app.core.db import SessionLocal
    from app.models.base import utcnow

    now = utcnow()
    with SessionLocal() as db:
        # Find the orphaned jobs first, then update them in Python so we
        # can merge into the `options` JSON without dialect-specific SQL.
        orphaned_ids = list(db.scalars(select(Job.id).where(Job.status.in_(("queued", "running")))))
        if not orphaned_ids:
            return
        for jid in orphaned_ids:
            row = db.get(Job, jid)
            if row is None:
                continue
            row.status = "failed"
            row.finished_at = now
            row.options = dict(row.options or {}) | {"_error": "server restarted"}
        db.execute(
            update(TargetRow)
            .where(
                TargetRow.job_id.in_(orphaned_ids),
                TargetRow.status.in_(("pending", "fetching")),
            )
            .values(status="skipped", error="server restarted")
        )
        db.commit()
        logger.warning("recovered %d orphaned job(s) from a previous process", len(orphaned_ids))


# ---- helpers ----


def _record_to_dict(record: CrawlRecord) -> dict:
    return {
        "source_url": record.source_url,
        "final_url": record.final_url,
        "status": record.status,
        "http_status": record.http_status,
        "title": record.title,
        "error": record.error,
        "duration_ms": record.duration_ms,
    }
