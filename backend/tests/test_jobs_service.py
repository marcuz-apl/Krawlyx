"""Service-layer tests for the job dispatcher (PRD §6.2, FR-JOB-03/05).

We use real engine instances (the registry is module-level) and register
fake adapters per-test. The dispatcher is started and stopped explicitly;
the FastAPI lifespan is not in the picture for these tests.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator

import pytest
from sqlalchemy import select

from app.core.db import SessionLocal
from app.engines import registry
from app.engines.base import (
    Capabilities,
    CrawlEngine,
    CrawlRecord,
    HealthReport,
    JobOptions,
    Target,
)
from app.models import EngineInstance, Job, User
from app.models import Target as TargetRow
from app.services import jobs as jobs_svc
from app.services.engines import encrypt_config
from tests._helpers import make_user

# ---- fake adapters ----


def _register_fake(type_id: str, sleep_s: float, fail: bool = False) -> None:
    class _Fake(CrawlEngine):
        type = type_id
        capabilities = Capabilities(deep_crawl=False)

        def __init__(self, config: dict | None = None) -> None:
            pass

        def health(self) -> HealthReport:
            return HealthReport(ok=True, detail="fake")

        async def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]:
            await asyncio.sleep(sleep_s)
            if fail:
                yield CrawlRecord(
                    target_id=target.target_id,
                    source_url=target.url,
                    status="error",
                    error="fake engine failure",
                )
            else:
                yield CrawlRecord(
                    target_id=target.target_id,
                    source_url=target.url,
                    final_url=target.url,
                    status="ok",
                    http_status=200,
                    title=f"fake {target.url}",
                    content_markdown=f"# fake\n{target.url}",
                    content_text=f"fake {target.url}",
                    duration_ms=int(sleep_s * 1000),
                )

    # Shadow the real registered factory for the duration of this test.
    # The `isolated_engine_registry` fixture in conftest snapshots the
    # production factories on entry and restores them on exit. We swap
    # in the fake under the canonical type id (crawl4ai or scrapy) and
    # write the engine row with that same id so the schema's CHECK
    # constraint accepts it.
    registry._REGISTRY[type_id] = lambda config=None: _Fake(config)


# ---- helpers ----


def _bootstrap_engine(name: str, type_id: str, *, pooled: bool = True) -> int:
    """Insert an engine row whose `type` matches a real production type
    (the schema's CHECK constraint requires it). The actual fetch uses the
    fake adapter that `_register_fake` shimmed into the registry under
    the same type id.
    """
    with SessionLocal() as db:
        make_user("u", "admin")
        row = EngineInstance(
            name=name,
            type=type_id,
            config_encrypted=encrypt_config({}),
            pooled=pooled,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id


def _make_job(engine_id: int, urls: list[str], *, user_id: int) -> int:
    with SessionLocal() as db:
        job = Job(created_by_id=user_id, engine_id=engine_id, options={}, status="queued")
        db.add(job)
        db.commit()
        db.refresh(job)
        for u in urls:
            db.add(TargetRow(job_id=job.id, url=u, status="pending", attempts=0))
        db.commit()
        return job.id


def _wait_for_terminal(job_id: int, timeout_s: float = 5.0) -> str:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        with SessionLocal() as db:
            row = db.get(Job, job_id)
            if row and row.status in {"completed", "failed", "cancelled"}:
                return row.status
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not reach terminal state within {timeout_s}s")


async def _await_terminal_async(job_id: int, timeout_s: float = 5.0) -> str:
    """Async variant: yields to the loop while polling the DB."""
    loop = asyncio.get_event_loop()
    deadline = loop.time() + timeout_s
    while loop.time() < deadline:
        with SessionLocal() as db:
            row = db.get(Job, job_id)
            if row and row.status in {"completed", "failed", "cancelled"}:
                return row.status
        await asyncio.sleep(0.05)
    raise AssertionError(f"job {job_id} did not reach terminal state within {timeout_s}s")


# ---- fixture: dispatcher lifecycle ----


@pytest.fixture(autouse=True)
def _dispatcher_lifecycle(isolated_engine_registry):
    jobs_svc.start_dispatcher()
    yield
    jobs_svc.shutdown()


# ---- tests ----


def test_recover_orphaned_jobs_marks_running_and_queued_as_failed() -> None:
    """M3 restart policy: queued + running jobs from a previous process are
    marked failed with a clear reason so the user knows what happened."""
    with SessionLocal() as db:
        user = User(username="orphan", password_hash="x", role="admin")
        db.add(user)
        db.commit()
        db.refresh(user)
        uid = user.id
    eid = _bootstrap_engine("e1", "crawl4ai")

    j1 = _make_job(eid, ["https://example.com/a"], user_id=uid)
    j2 = _make_job(eid, ["https://example.com/b"], user_id=uid)
    with SessionLocal() as db:
        for jid, st in ((j1, "running"), (j2, "queued")):
            row = db.get(Job, jid)
            row.status = st
        db.commit()

    jobs_svc.recover_orphaned_jobs()  # re-run the sweep explicitly

    with SessionLocal() as db:
        for jid in (j1, j2):
            row = db.get(Job, jid)
            assert row.status == "failed"
            assert row.finished_at is not None
            assert (row.options or {}).get("_error") == "server restarted"
        skipped = db.scalars(select(TargetRow).where(TargetRow.status == "skipped")).all()
        assert {t.job_id for t in skipped} == {j1, j2}


def test_cancel_job_marks_pending_targets_skipped_and_is_idempotent() -> None:
    _register_fake("crawl4ai", sleep_s=0.2)
    with SessionLocal() as db:
        make_user("c", "runner")
        eid = _bootstrap_engine("c1", "crawl4ai")
        user = db.scalar(select(User).where(User.username == "c"))

    # 5 targets; cancel after the worker has started processing.
    jid = _make_job(eid, [f"https://example.com/{i}" for i in range(5)], user_id=user.id)

    async def _lifecycle() -> None:
        await jobs_svc.enqueue_job(jid)
        # Let the worker flip the first target to fetching.
        await asyncio.sleep(0.1)
        # Cancel via a fresh session.
        with SessionLocal() as db2:
            assert jobs_svc.cancel_job(db2, jid) is True
            # Idempotent: second call still returns True.
            assert jobs_svc.cancel_job(db2, jid) is True
        # Wait for the worker to finish the in-flight target and clean up.
        await _await_terminal_async(jid, timeout_s=3.0)

    asyncio.run(_lifecycle())

    with SessionLocal() as db:
        row = db.get(Job, jid)
        assert row.status == "cancelled"
        rows = db.scalars(select(TargetRow).where(TargetRow.job_id == jid)).all()
        # All targets settle to either done (in-flight at cancel time) or
        # skipped (pending). Nothing left in pending/fetching.
        assert {r.status for r in rows} <= {"done", "skipped"}
        assert len(rows) == 5


def test_enqueue_runs_two_jobs_under_default_concurrency() -> None:
    """Default max_concurrent_jobs=2 → two jobs run in parallel, both finish."""
    _register_fake("crawl4ai", sleep_s=0.2)
    with SessionLocal() as db:
        make_user("f", "runner")
        eid = _bootstrap_engine("f1", "crawl4ai")
        user = db.scalar(select(User).where(User.username == "f"))

    j1 = _make_job(eid, ["https://example.com/1"], user_id=user.id)
    j2 = _make_job(eid, ["https://example.com/2"], user_id=user.id)

    async def _both() -> None:
        await jobs_svc.enqueue_job(j1)
        await jobs_svc.enqueue_job(j2)
        await _await_terminal_async(j1, timeout_s=5.0)
        await _await_terminal_async(j2, timeout_s=5.0)

    asyncio.run(_both())

    with SessionLocal() as db:
        for jid in (j1, j2):
            assert db.get(Job, jid).status in {"completed", "failed"}


def test_engine_error_marks_target_error_and_job_failed() -> None:
    _register_fake("scrapy", sleep_s=0.05, fail=True)
    with SessionLocal() as db:
        make_user("e", "runner")
        eid = _bootstrap_engine("e1", "scrapy")
        user = db.scalar(select(User).where(User.username == "e"))

    jid = _make_job(eid, ["https://example.com/"], user_id=user.id)

    async def _lifecycle() -> None:
        await jobs_svc.enqueue_job(jid)
        await _await_terminal_async(jid, timeout_s=3.0)

    asyncio.run(_lifecycle())

    with SessionLocal() as db:
        row = db.get(Job, jid)
        assert row.status == "failed"
        rows = db.scalars(select(TargetRow).where(TargetRow.job_id == jid)).all()
        assert all(r.status == "error" for r in rows)
        assert all(r.error for r in rows)
