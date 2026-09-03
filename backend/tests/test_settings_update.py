"""Tests for editable settings and .env synchronization."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.env_writer import format_env_value, update_env_file
from app.main import create_app
from tests._helpers import auth_as


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def test_format_env_value():
    assert format_env_value(True) == "true"
    assert format_env_value(False) == "false"
    assert format_env_value(4) == "4"
    assert format_env_value(1.5) == "1.5"
    assert format_env_value(["a.com", "b.com"]) == "a.com,b.com"
    assert format_env_value("hello world") == '"hello world"'


def test_update_env_file(tmp_path: Path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        "# Initial config\nMYKRAWL_MAX_CONCURRENT_JOBS=2\nMYKRAWL_APP_NAME=Krawlyx\n",
        encoding="utf-8",
    )

    update_env_file(
        env_file,
        {
            "MYKRAWL_MAX_CONCURRENT_JOBS": 6,
            "MYKRAWL_ROBOTS_TXT_ENABLED": False,
            "MYKRAWL_NEW_SETTING": "new_val",
        },
    )

    content = env_file.read_text(encoding="utf-8")
    assert "# Initial config" in content
    assert "MYKRAWL_MAX_CONCURRENT_JOBS=6" in content
    assert "MYKRAWL_APP_NAME=Krawlyx" in content
    assert "MYKRAWL_ROBOTS_TXT_ENABLED=false" in content
    assert "MYKRAWL_NEW_SETTING=new_val" in content


def test_update_settings_api(client: TestClient):
    auth_as(client, "admin_user", "admin")

    # 1. Get current settings
    get_res = client.get("/api/settings")
    assert get_res.status_code == 200
    orig_max = get_res.json()["max_concurrent_jobs"]

    # 2. Patch settings
    target_jobs = 5 if orig_max != 5 else 4
    patch_res = client.patch(
        "/api/settings",
        json={
            "max_concurrent_jobs": target_jobs,
            "per_domain_interval_s": 0.8,
        },
    )
    assert patch_res.status_code == 200
    body = patch_res.json()
    assert body["max_concurrent_jobs"] == target_jobs
    assert body["per_domain_interval_s"] == 0.8

    # 3. Confirm GET returns updated settings
    verify_res = client.get("/api/settings")
    assert verify_res.status_code == 200
    assert verify_res.json()["max_concurrent_jobs"] == target_jobs


def test_update_settings_requires_admin(client: TestClient):
    auth_as(client, "normie", "runner")
    res = client.patch("/api/settings", json={"max_concurrent_jobs": 4})
    assert res.status_code == 403
