"""Tests for the M6 per-job log file + GET /api/jobs/{id}/log endpoint."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
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
from app.main import create_app
from app.models import EngineInstance, Job
from app.models import Target as TargetRow
from app.services import jobs as jobs_svc
from app.services.engines import encrypt_config
from tests._helpers import auth_as, make_user

# ---- fake adapter ----


def _shadow_with_fake(type_id: str = "crawl4ai") -> None:
    class _Fake(CrawlEngine):
        type = type_id
        capabilities = Capabilities(deep_crawl=False)

        def __init__(self, config: dict | None = None) -> None:
            pass

        def health(self) -> HealthReport:
            return HealthReport(ok=True, detail="fake")

        async def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]:
            await asyncio.sleep(0.05)
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                final_url=target.url,
                status="ok",
                http_status=200,
                title="fake",
                content_markdown="# fake",
                content_text="fake",
                duration_ms=50,
            )

    registry._REGISTRY[type_id] = lambda config=None: _Fake(config)


# ---- fixtures ----


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture(autouse=True)
def _dispatcher(isolated_engine_registry):
    jobs_svc.start_dispatcher()
    yield
    jobs_svc.shutdown()


# ---- tests ----


def test_per_job_log_file_is_created_and_populated(client: TestClient) -> None:
    _shadow_with_fake("crawl4ai")
    with SessionLocal() as db:
        make_user("u", "admin")
        eid_row = EngineInstance(
            name="e1",
            type="crawl4ai",
            config_encrypted=encrypt_config({}),
            pooled=True,
        )
        db.add(eid_row)
        db.commit()
        db.refresh(eid_row)
        eid = eid_row.id
        from app.models import User as UserModel

        u = db.scalar(__import__("sqlalchemy").select(UserModel).where(UserModel.username == "u"))
        assert u is not None
        job = Job(created_by_id=u.id, engine_id=eid, options={}, status="queued")
        db.add(job)
        db.commit()
        db.refresh(job)
        db.add(TargetRow(job_id=job.id, url="https://example.com/a", status="pending", attempts=0))
        db.commit()
        jid = job.id

    async def _lifecycle() -> None:
        await jobs_svc.enqueue_job(jid)
        # Wait for terminal.
        import time

        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline:
            with SessionLocal() as db:
                if db.get(Job, jid).status in {"completed", "failed", "cancelled"}:
                    return
            await asyncio.sleep(0.05)
        raise AssertionError("job did not terminate")

    asyncio.run(_lifecycle())

    log_path = get_settings().db_path.parent / "logs" / "jobs" / f"{jid}.log"
    assert log_path.is_file(), f"per-job log not at {log_path}"
    text = log_path.read_text(encoding="utf-8")
    assert "zencrawl.jobs" in text


def test_job_log_endpoint_returns_tail(client: TestClient) -> None:
    # auth_as creates the user; the endpoint only requires authentication.
    auth_as(client, "u2", "admin")
    log_path = get_settings().db_path.parent / "logs" / "jobs" / "999999.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text("line1\nline2\nline3\nline4\nline5\n", encoding="utf-8")
    r = client.get("/api/jobs/999999/log?tail=2")
    assert r.status_code == 200
    body = r.text
    assert "line4" in body and "line5" in body
    assert "line1" not in body


def test_job_log_endpoint_404_when_missing(client: TestClient) -> None:
    auth_as(client, "u3", "admin")
    r = client.get("/api/jobs/888888/log")
    assert r.status_code == 404
