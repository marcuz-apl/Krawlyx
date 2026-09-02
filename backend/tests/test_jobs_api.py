"""Job API tests (PRD §6.2, §9 — FR-JOB-01..08).

These cover the route layer; the worker pool is tested separately in
`test_jobs_service.py`. Fake engines are registered with shadowed
production type ids so the `engines.type` CHECK constraint accepts the
test rows.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

import pytest
from fastapi.testclient import TestClient

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
from app.models import EngineInstance
from app.services import jobs as jobs_svc
from tests._helpers import make_user

# ---- fake adapter ----


def _shadow_with_fake(type_id: str, sleep_s: float, fail: bool = False) -> None:
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
                    error="fake failure",
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

    registry._REGISTRY[type_id] = lambda config=None: _Fake(config)


# ---- fixtures ----


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _dispatcher(isolated_engine_registry):
    jobs_svc.start_dispatcher()
    yield
    jobs_svc.shutdown()


def _auth(client: TestClient, username: str, role: str = "runner") -> str:
    make_user(username, role)
    r = client.post("/api/auth/login", json={"username": username, "password": "pw"})
    assert r.status_code == 200
    return r.json()["csrf_token"]


def _make_engine(db, name: str, type_id: str, *, pooled: bool = True) -> int:
    row = EngineInstance(name=name, type=type_id, config_encrypted="", pooled=pooled)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row.id


# ---- tests ----


def test_create_job_requires_auth(client: TestClient) -> None:
    r = client.post(
        "/api/jobs",
        json={"engine_id": 1, "urls": ["https://example.com/"]},
    )
    assert r.status_code == 401


def test_create_job_validates_urls_and_returns_line_numbers(client: TestClient, db) -> None:
    _shadow_with_fake("playtrafi", sleep_s=0.05)
    eid = _make_engine(db, "e1", "playtrafi")
    csrf = _auth(client, "u1", "admin")

    r = client.post(
        "/api/jobs",
        json={
            "engine_id": eid,
            "urls": [
                "https://example.com/a",  # 1 ok
                "",  # 2 empty
                "ftp://example.com",  # 3 bad scheme
                "https://example.com/a",  # 4 dup
                "https://example.com/b",  # 5 ok
            ],
            "notes": "first job",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["accepted"] == 2
    assert [d[0] for d in body["duplicates"]] == [4]
    assert {(e["line"], e["reason"]) for e in body["errors"]} == {
        (2, "empty"),
        (3, "scheme not http(s)"),
    }
    assert body["job_id"] > 0


def test_create_job_rejects_engine_not_pooled(client: TestClient, db) -> None:
    _shadow_with_fake("playtrafi", sleep_s=0.05)
    eid = _make_engine(db, "e2", "playtrafi", pooled=False)
    csrf = _auth(client, "u2", "admin")
    r = client.post(
        "/api/jobs",
        json={"engine_id": eid, "urls": ["https://example.com/"]},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 400
    assert "not available" in r.json()["detail"].lower()


def test_create_job_rejects_when_all_urls_invalid(client: TestClient, db) -> None:
    _shadow_with_fake("playtrafi", sleep_s=0.05)
    eid = _make_engine(db, "e3", "playtrafi")
    csrf = _auth(client, "u3", "admin")
    r = client.post(
        "/api/jobs",
        json={"engine_id": eid, "urls": ["", "ftp://x"]},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 400
    assert "errors" in r.json()["detail"]


def _wait_for_terminal(jid: int, timeout_s: float = 5.0) -> None:
    import time

    from app.models import Job as _Job

    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        with SessionLocal() as s:
            if s.get(_Job, jid).status in {"completed", "failed", "cancelled"}:
                return
        time.sleep(0.05)
    raise AssertionError(f"job {jid} did not reach terminal state")


def test_get_job_returns_counts_and_targets_after_run(client: TestClient, db) -> None:
    _shadow_with_fake("playtrafi", sleep_s=0.05)
    eid = _make_engine(db, "e4", "playtrafi")
    csrf = _auth(client, "u4", "admin")
    r = client.post(
        "/api/jobs",
        json={"engine_id": eid, "urls": ["https://example.com/a", "https://example.com/b"]},
        headers={"X-CSRF-Token": csrf},
    )
    jid = r.json()["job_id"]
    _wait_for_terminal(jid)

    r = client.get(f"/api/jobs/{jid}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == jid
    assert body["counts"]["done"] == 2
    assert body["status"] in {"completed", "failed"}
    assert len(body["targets"]) == 2


def test_cancel_job_is_owner_or_admin_only(client: TestClient, db) -> None:
    _shadow_with_fake("playtrafi", sleep_s=0.5)
    eid = _make_engine(db, "e5", "playtrafi")

    # Owner logs in.
    csrf = _auth(client, "owner", "runner")
    r = client.post(
        "/api/jobs",
        json={"engine_id": eid, "urls": ["https://example.com/"]},
        headers={"X-CSRF-Token": csrf},
    )
    jid = r.json()["job_id"]

    # A different runner logs in and cannot cancel someone else's job.
    csrf2 = _auth(client, "intruder", "runner")
    r = client.post(f"/api/jobs/{jid}/cancel", headers={"X-CSRF-Token": csrf2})
    assert r.status_code == 403

    # Admin can.
    csrf3 = _auth(client, "adm", "admin")
    r = client.post(f"/api/jobs/{jid}/cancel", headers={"X-CSRF-Token": csrf3})
    assert r.status_code == 204

    # Idempotent: cancelling again is 204 too.
    r = client.post(f"/api/jobs/{jid}/cancel", headers={"X-CSRF-Token": csrf3})
    assert r.status_code == 204


def test_results_paginate_and_downloads_work(client: TestClient, db) -> None:
    _shadow_with_fake("playtrafi", sleep_s=0.05)
    eid = _make_engine(db, "e6", "playtrafi")
    csrf = _auth(client, "u6", "admin")
    r = client.post(
        "/api/jobs",
        json={"engine_id": eid, "urls": ["https://example.com/a", "https://example.com/b"]},
        headers={"X-CSRF-Token": csrf},
    )
    jid = r.json()["job_id"]

    # Wait for completion.
    _wait_for_terminal(jid)

    # Page 1 size 1 → 1 item, total 2.
    r = client.get(f"/api/jobs/{jid}/results?page=1&page_size=1")
    assert r.status_code == 200
    page1 = r.json()
    assert page1["total"] == 2
    assert len(page1["items"]) == 1

    # Markdown download.
    rid = page1["items"][0]["id"]
    r = client.get(f"/api/jobs/{jid}/results/{rid}/download.md")
    assert r.status_code == 200
    assert "attachment" in r.headers["content-disposition"]
    assert "fake" in r.text

    # JSON download.
    r = client.get(f"/api/jobs/{jid}/results/{rid}/download.json")
    assert r.status_code == 200
    import json as _json

    payload = _json.loads(r.text)
    assert payload["id"] == rid

    # Whole-job export.
    r = client.get(f"/api/jobs/{jid}/export.json")
    assert r.status_code == 200
    blob = _json.loads(r.text)
    assert blob["job_id"] == jid
    assert len(blob["results"]) == 2


def test_rerun_clones_into_new_job(client: TestClient, db) -> None:
    _shadow_with_fake("playtrafi", sleep_s=0.05)
    eid = _make_engine(db, "e7", "playtrafi")
    csrf = _auth(client, "u7", "admin")
    r = client.post(
        "/api/jobs",
        json={"engine_id": eid, "urls": ["https://example.com/a"]},
        headers={"X-CSRF-Token": csrf},
    )
    jid = r.json()["job_id"]
    _wait_for_terminal(jid)

    r = client.post(f"/api/jobs/{jid}/rerun", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 201
    body = r.json()
    assert body["id"] != jid
    assert body["engine_id"] == eid
    assert body["status"] == "queued"


def test_events_endpoint_returns_501(client: TestClient) -> None:
    _auth(client, "u8", "admin")
    r = client.get("/api/jobs/1/events")
    assert r.status_code == 501


def test_404s_on_unknown_job_and_result(client: TestClient) -> None:
    _auth(client, "u9", "admin")
    r = client.get("/api/jobs/9999")
    assert r.status_code == 404
    r = client.get("/api/jobs/1/results/9999")
    assert r.status_code == 404
