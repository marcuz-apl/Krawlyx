"""Settings API tests (PRD §6.5, §9)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests._helpers import auth_as


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def test_settings_returns_seven_fields(client: TestClient) -> None:
    auth_as(client, "s1", "admin")
    r = client.get("/api/settings")
    assert r.status_code == 200
    body = r.json()
    expected = {
        "max_concurrent_jobs",
        "max_parallel_targets_per_job",
        "default_split_size_mb",
        "robots_txt_enabled",
        "per_domain_interval_s",
        "ssrf_guard_enabled",
        "content_size_cap_bytes",
        # M6 additions
        "ssrf_allow_list",
        "admin_contact_email",
    }
    assert set(body.keys()) == expected
    # Sanity-check the defaults from Settings.
    assert body["max_concurrent_jobs"] >= 1
    assert body["content_size_cap_bytes"] > 0


def test_settings_requires_authentication(client: TestClient) -> None:
    r = client.get("/api/settings")
    assert r.status_code == 401


def test_db_stats_and_checkpoint_and_vacuum(client: TestClient) -> None:
    csrf = auth_as(client, "admin_db_user", "admin")
    headers = {"X-CSRF-Token": csrf}

    # 1. Get DB stats
    r = client.get("/api/settings/db/stats", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "db_path" in data
    assert "db_size_bytes" in data
    assert "journal_mode" in data
    assert data["page_size"] >= 512

    # 2. Run checkpoint
    r = client.post("/api/settings/db/checkpoint", headers=headers)
    assert r.status_code == 200
    res = r.json()
    assert res["success"] is True
    assert "before_size_formatted" in res
    assert "after_size_formatted" in res

    # 3. Run vacuum
    r = client.post("/api/settings/db/vacuum", headers=headers)
    assert r.status_code == 200
    res = r.json()
    assert res["success"] is True
    assert "before_size_formatted" in res
    assert "after_size_formatted" in res
