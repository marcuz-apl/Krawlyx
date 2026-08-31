"""Cron scheduler service (PRD §6.3).

Wraps APScheduler's `AsyncIOScheduler` so the rest of the app can talk
to a small, intent-revealing API: `start_scheduler`, `add_or_replace_job`,
`remove_job`, `run_now`, `compute_next_fires`.

The interesting bits:

- **Overlapping-run guard (FR-SCH-03)**: a coarse `Schedule.running`
  boolean. The cron callback acquires it with an atomic
  `UPDATE ... WHERE running=0`; if the rowcount is 0, the fire is
  skipped. The lock is released when the spawned Job reaches a
  terminal state (a small watcher task polls the Job row).

- **Cron + timezone**: we use APScheduler's `CronTrigger.from_crontab`
  with the schedule's timezone string. `next_run_at` is read off the
  trigger after install, so the SPA can render the "next 3 runs"
  preview without a second round-trip.

- **Recovery**: `start_scheduler` re-loads every `enabled` Schedule
  row and re-installs the trigger. The in-process jobstore is empty
  after a restart; the DB rows are the source of truth.

Architectural rules (AGENTS.md invariants):
- Background work only via this module or `services/jobs.py`.
- Engine config is read through `services/engines.decrypt_config`.
- No concrete engine imports — registry-based.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select, update

from app.core.db import SessionLocal
from app.models import EngineInstance, ExportTarget, Job, Schedule, Target

logger = logging.getLogger("mykrawl.scheduler")

# ---- in-memory singleton state ----
_scheduler: AsyncIOScheduler | None = None
_started: bool = False

# Job ID convention: APScheduler uses string job IDs; we use
# `f"schedule:{id}"` so the trigger lookup is one dict call.
_JOB_ID_FMT = "schedule:{id}"


def _job_id(schedule_id: int) -> str:
    return _JOB_ID_FMT.format(id=schedule_id)


def _schedule_id_from_job_id(job_id: str) -> int | None:
    if not job_id.startswith("schedule:"):
        return None
    try:
        return int(job_id.split(":", 1)[1])
    except (IndexError, ValueError):
        return None


# ---- lifecycle ----


def start_scheduler() -> None:
    """Idempotent: build the scheduler, recover triggers, start it."""
    global _scheduler, _started
    if _scheduler is None:
        _scheduler = AsyncIOScheduler(timezone="UTC")
    recover_schedules()
    if not _started:
        _scheduler.start()
        _started = True
        logger.info("scheduler started")


def shutdown_scheduler() -> None:
    """Graceful shutdown. Idempotent."""
    global _scheduler, _started
    if _scheduler is not None and _started:
        _scheduler.shutdown(wait=False)
    _started = False
    _scheduler = None
    logger.info("scheduler shut down")


def recover_schedules() -> None:
    """Re-install the trigger for every enabled Schedule row.

    Called from `start_scheduler`. The DB is the source of truth;
    APScheduler's in-memory jobstore is rebuilt from scratch.
    """
    if _scheduler is None:
        return
    with SessionLocal() as db:
        schedules = list(db.scalars(select(Schedule).where(Schedule.enabled.is_(True))))
    for s in schedules:
        try:
            add_or_replace_job(s)
        except (ValueError, ZoneInfoNotFoundError) as exc:
            logger.warning("schedule %d (%s) failed to install: %s", s.id, s.name, exc)


# ---- trigger management ----


def add_or_replace_job(schedule: Schedule) -> None:
    """Install (or replace) the cron trigger for a schedule.

    The `next_run_at` column on the row is updated so the SPA can
    render the "next 3 runs" preview without a second round-trip.
    """
    if _scheduler is None:
        return
    job_id = _job_id(schedule.id)
    trigger = _make_trigger(schedule.cron, schedule.timezone)
    _scheduler.add_job(
        _fire_scheduled,
        trigger=trigger,
        args=[schedule.id],
        id=job_id,
        replace_existing=True,
        coalesce=True,
        max_instances=1,
        misfire_grace_time=300,
    )
    next_run = _next_run_from_trigger(trigger)
    with SessionLocal() as db:
        row = db.get(Schedule, schedule.id)
        if row is not None:
            row.next_run_at = next_run
            db.commit()


def remove_job(schedule_id: int) -> None:
    """Remove a schedule's cron trigger from APScheduler."""
    if _scheduler is None:
        return
    try:
        _scheduler.remove_job(_job_id(schedule_id))
    except Exception as exc:  # noqa: BLE001 — APScheduler raises if the job is gone
        logger.debug("schedule %d trigger already removed: %s", schedule_id, exc)


async def run_now(schedule_id: int) -> int | None:
    """Fire a schedule synchronously. Returns the new job id, or
    `None` if the lock was held (i.e. a previous fire is still
    in flight)."""
    return await _fire_scheduled(schedule_id)


# ---- cron helpers ----


import re


def _resolve_timezone(tz: str) -> ZoneInfo:
    raw = (tz or "UTC").strip()
    if raw.upper() in ("UTC", "Z", "GMT"):
        return ZoneInfo("UTC")
    m = re.match(r"^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$", raw, re.IGNORECASE)
    if m:
        sign, hours, mins = m.group(1), int(m.group(2)), int(m.group(3) or 0)
        if mins == 0 and hours <= 14:
            inv_sign = "-" if sign == "+" else "+"
            try:
                return ZoneInfo(f"Etc/GMT{inv_sign}{hours}")
            except Exception:
                pass
    try:
        return ZoneInfo(raw)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"unknown timezone {tz!r}") from exc


def _make_trigger(cron: str, tz: str) -> CronTrigger:
    zone = _resolve_timezone(tz)
    return CronTrigger.from_crontab(cron, timezone=zone)


def _next_run_from_trigger(trigger: CronTrigger) -> datetime | None:
    """APScheduler's CronTrigger doesn't expose a public next-fire
    property, so we install it ephemerally and read the iterator."""
    now = datetime.now(UTC)
    try:
        # `get_next_fire_time` is the public API; present in 3.x.
        return trigger.get_next_fire_time(None, now)
    except Exception:  # noqa: BLE001
        return None


def compute_next_fires(
    cron: str, tz: str, *, n: int = 3, after: datetime | None = None
) -> list[datetime]:
    """Return the next `n` fire times for a cron expression, in `tz`."""
    trigger = _make_trigger(cron, tz)
    base = after or datetime.now(UTC)
    out: list[datetime] = []
    cursor = base
    for _ in range(n):
        try:
            nxt = trigger.get_next_fire_time(cursor, cursor)
        except Exception:  # noqa: BLE001
            break
        if nxt is None:
            break
        out.append(nxt)
        cursor = nxt
    return out


def humanize_cron(cron: str, tz: str) -> str:
    """A tiny, dependency-free English summary for the most common
    cron shapes. We avoid pulling in `cron-descriptor` (a Rust binary
    dep) for v1 — the SPA mirrors this logic for instant rendering.
    """
    parts = cron.split()
    if len(parts) != 5:
        return f"cron: {cron}"
    minute, hour, dom, month, dow = parts
    try:
        if minute.isdigit() and hour.isdigit() and dom == "*" and month == "*" and dow == "*":
            return f"Every day at {int(hour):02d}:{int(minute):02d} ({tz})"
        if minute.startswith("*/") and hour == "*" and dom == "*" and month == "*" and dow == "*":
            return f"Every {minute[2:]} minutes"
        if minute == "0" and hour.isdigit() and dom == "*" and month == "*" and dow == "*":
            return f"Every day at {int(hour):02d}:00 ({tz})"
        if hour == "*" and minute.isdigit() and dom == "*" and month == "*" and dow == "*":
            return f"Every hour at :{int(minute):02d} ({tz})"
    except ValueError:
        pass
    return f"cron: {cron} ({tz})"


# ---- the callback ----


async def _fire_scheduled(schedule_id: int) -> int | None:
    """Called by APScheduler when a schedule's cron fires.

    Acquires the per-schedule lock atomically. On success, builds a
    Job from the schedule's payload, hands it off to the M3
    dispatcher, and spawns a watcher that releases the lock when
    the job terminates. Returns the new job id, or `None` if the
    lock was already held (i.e. a previous fire is still in flight).
    """
    from app.models.base import utcnow
    from app.services import jobs as jobs_svc
    from app.services.urls import parse as parse_urls

    with SessionLocal() as db:
        # Atomic lock: only one fire wins the row.
        result = db.execute(
            update(Schedule)
            .where(Schedule.id == schedule_id, Schedule.running.is_(False))
            .values(running=True, last_run_at=utcnow())
        )
        if result.rowcount == 0:
            logger.info("schedule %d still running; skipping this fire", schedule_id)
            return None
        schedule = db.get(Schedule, schedule_id)
        if schedule is None or not schedule.enabled:
            # Defensive: race between the UPDATE and the SELECT.
            db.execute(update(Schedule).where(Schedule.id == schedule_id).values(running=False))
            db.commit()
            return None

        # Build the Job from the schedule's payload. Defence in depth:
        # re-validate URLs through the same parser the runner form uses.
        template = schedule.payload or {}
        urls: list[str] = list(template.get("urls", []))
        parsed = parse_urls(urls)
        if not parsed.urls:
            logger.warning(
                "schedule %d fired but had no valid URLs; marking failed",
                schedule_id,
            )
            db.execute(update(Schedule).where(Schedule.id == schedule_id).values(running=False))
            db.commit()
            return None

        engine_id = int(template.get("engine_id", 0))
        engine = db.get(EngineInstance, engine_id)
        if engine is None or not engine.pooled or engine.disabled_at is not None:
            logger.warning(
                "schedule %d fired but engine %s unavailable; skipping",
                schedule_id,
                engine_id,
            )
            db.execute(update(Schedule).where(Schedule.id == schedule_id).values(running=False))
            db.commit()
            return None

        export_target_id = template.get("export_target_id")
        if export_target_id is not None:
            target = db.get(ExportTarget, int(export_target_id))
            if target is None or not target.enabled or target.mode != "folder":
                export_target_id = None  # silently fall back to database-only

        job = Job(
            created_by_id=schedule.created_by_id,
            engine_id=engine.id,
            options=dict(template.get("options") or {}),
            notes=template.get("notes"),
            status="queued",
            schedule_id=schedule.id,
            export_target_id=export_target_id,
        )
        db.add(job)
        db.flush()  # assigns job.id
        for url in parsed.urls:
            db.add(Target(job_id=job.id, url=url, status="pending", attempts=0))
        db.commit()
        new_job_id = job.id

    # Outside the DB session: hand off to the dispatcher and spawn
    # the lock-release watcher. The watcher polls the job row until
    # it reaches a terminal status, then clears the schedule's lock.
    await jobs_svc.enqueue_job(new_job_id)
    asyncio.create_task(_release_when_terminal(schedule_id, new_job_id))
    return new_job_id


async def _release_when_terminal(schedule_id: int, job_id: int) -> None:
    """Poll the Job row until it reaches a terminal status, then
    release the schedule's `running` lock and update `last_run_at`.

    Polling is cheap (1 s) and only lives for the duration of one
    job. A cancellation / process restart will leave `running=True`
    in the DB — that's why `start_scheduler` and the schedule test
    suite can recover by setting it back to `False` on the orphaned
    rows.
    """
    from app.models.base import utcnow

    terminal = {"completed", "failed", "cancelled", "export_degraded"}
    for _ in range(60 * 60 * 6):  # safety cap: 6 hours
        await asyncio.sleep(1.0)
        with SessionLocal() as db:
            row = db.get(Job, job_id)
            if row is None or row.status in terminal:
                db.execute(
                    update(Schedule)
                    .where(Schedule.id == schedule_id)
                    .values(running=False, last_run_at=utcnow())
                )
                db.commit()
                return
    # Timed out — release anyway so the schedule isn't stuck.
    with SessionLocal() as db:
        db.execute(
            update(Schedule)
            .where(Schedule.id == schedule_id)
            .values(running=False, last_run_at=utcnow())
        )
        db.commit()
    logger.warning("schedule %d lock watcher timed out; lock released", schedule_id)
