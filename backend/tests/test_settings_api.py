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
