"""Schedule API tests (PRD §6.3, §9 — FR-SCH-01..04)."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

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
from app.services import jobs as jobs_svc
from app.services.engines import encrypt_config
from tests._helpers import make_user

# ---- fake engine (shadowed on the real `crawl4ai` slot) ----


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
                title=f"fake {target.url}",
                content_markdown=f"# fake\n{target.url}",
                content_text=f"fake {target.url}",
                duration_ms=50,
            )

    registry._REGISTRY[type_id] = lambda config=None: _Fake(config)


def _make_engine(name: str = "sched-eng", type_id: str = "crawl4ai") -> int:
    with SessionLocal() as db:
        make_user("u", "admin")
        row = EngineInstance(
            name=name, type=type_id, config_encrypted=encrypt_config({}), pooled=True
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id


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


def _auth(client: TestClient, username: str, role: str = "runner") -> str:
    make_user(username, role)
    r = client.post("/api/auth/login", json={"username": username, "password": "pw"})
    assert r.status_code == 200, r.text
    return r.json()["csrf_token"]


# ---- tests ----


def test_runner_cannot_create_schedule(client: TestClient) -> None:
    eid = _make_engine()
    csrf = _auth(client, "rt", "runner")
    r = client.post(
        "/api/schedules",
        json={
            "name": "x",
            "cron": "0 2 * * *",
            "engine_id": eid,
            "urls": ["https://example.com/"],
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 403


def test_admin_creates_schedule_with_payload(client: TestClient) -> None:
    _shadow_with_fake()
    eid = _make_engine()
    csrf = _auth(client, "admin1", "admin")
    r = client.post(
        "/api/schedules",
        json={
            "name": "nightly",
            "cron": "0 2 * * *",
            "timezone": "UTC",
            "enabled": True,
            "engine_id": eid,
            "urls": ["https://example.com/a", "https://example.com/b"],
            "notes": "nightly crawl",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "nightly"
    assert body["engine_id"] == eid
    assert body["urls"] == ["https://example.com/a", "https://example.com/b"]
    assert body["human"] == "Every day at 02:00 (UTC)"
    assert body["next_run_at"] is not None


def test_invalid_cron_rejected(client: TestClient) -> None:
    eid = _make_engine()
    csrf = _auth(client, "admin2", "admin")
    r = client.post(
        "/api/schedules",
        json={"name": "bad", "cron": "not a cron", "engine_id": eid, "urls": []},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 400


def test_unknown_engine_rejected(client: TestClient) -> None:
    csrf = _auth(client, "admin3", "admin")
    r = client.post(
        "/api/schedules",
        json={"name": "noeng", "cron": "0 2 * * *", "engine_id": 99999, "urls": []},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 400


def test_next_fires_returns_three_dates(client: TestClient) -> None:
    _shadow_with_fake()
    eid = _make_engine()
    csrf = _auth(client, "admin4", "admin")
    r = client.post(
        "/api/schedules",
        json={
            "name": "every-2h",
            "cron": "0 */2 * * *",
            "engine_id": eid,
            "urls": ["https://example.com/"],
        },
        headers={"X-CSRF-Token": csrf},
    )
    sid = r.json()["id"]
    r = client.get(f"/api/schedules/{sid}/next-fires")
    assert r.status_code == 200
    body = r.json()
    assert len(body["next_runs"]) == 3


def test_run_now_creates_a_scheduled_job(client: TestClient) -> None:
    _shadow_with_fake()
    eid = _make_engine()
    csrf = _auth(client, "admin5", "admin")
    r = client.post(
        "/api/schedules",
        json={
            "name": "manual",
            "cron": "0 0 * * *",
            "engine_id": eid,
            "urls": ["https://example.com/"],
        },
        headers={"X-CSRF-Token": csrf},
    )
    sid = r.json()["id"]
    r = client.post(f"/api/schedules/{sid}/run-now", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201, r.text
    job_id = r.json()["id"]
    # Wait for the job to reach a terminal status.
    deadline = 30
    for _ in range(deadline * 10):
        with SessionLocal() as db:
            row = db.get(Job, job_id)
            if row and row.status in {"completed", "failed", "cancelled"}:
                break
        import time as _t

        _t.sleep(0.1)
    # Confirm the job is tagged with the schedule.
    with SessionLocal() as db:
        row = db.get(Job, job_id)
        assert row is not None
        assert row.schedule_id == sid


def test_delete_unreferenced_schedule_succeeds(client: TestClient) -> None:
    _shadow_with_fake()
    eid = _make_engine()
    csrf = _auth(client, "admin6", "admin")
    r = client.post(
        "/api/schedules",
        json={
            "name": "doomed",
            "cron": "0 0 * * *",
            "engine_id": eid,
            "urls": ["https://example.com/"],
        },
        headers={"X-CSRF-Token": csrf},
    )
    sid = r.json()["id"]
    r = client.delete(f"/api/schedules/{sid}", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 204
    assert client.get("/api/schedules").json() == []


def test_running_lock_blocks_concurrent_run_now(client: TestClient) -> None:
    """FR-SCH-03: a still-running schedule rejects the next run-now."""
    _shadow_with_fake()
    eid = _make_engine()
    csrf = _auth(client, "admin7", "admin")
    r = client.post(
        "/api/schedules",
        json={
            "name": "locky",
            "cron": "0 0 * * *",
            "engine_id": eid,
            "urls": ["https://example.com/"],
        },
        headers={"X-CSRF-Token": csrf},
    )
    sid = r.json()["id"]
    # Force the running flag to True so the next run-now is blocked.
    with SessionLocal() as db:
        db.execute(text("UPDATE schedules SET running=1 WHERE id=:i"), {"i": sid})
        db.commit()
    r = client.post(f"/api/schedules/{sid}/run-now", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 409
