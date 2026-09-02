"""Admin CRUD tests for `/api/export-targets` (PRD §6.4, §9)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.db import SessionLocal
from app.main import create_app
from app.models import EngineInstance, Job, User
from app.services.engines import encrypt_config
from tests._helpers import auth_as


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


# ---- CRUD ----


def test_runner_cannot_create_export_target(client: TestClient) -> None:
    csrf = auth_as(client, "rt1", "runner")
    r = client.post(
        "/api/export-targets",
        json={"name": "x", "mode": "folder", "path": "/tmp", "format": "csv"},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 403


def test_admin_creates_folder_target(client: TestClient) -> None:
    csrf = auth_as(client, "at1", "admin")
    r = client.post(
        "/api/export-targets",
        json={
            "name": "scratch",
            "mode": "folder",
            "path": "/tmp/zen-export",
            "format": "csv",
            "split_size_mb": 5,
            "runner_selectable": True,
            "enabled": True,
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "scratch"
    assert body["runner_selectable"] is True


def test_folder_target_requires_path_and_format(client: TestClient) -> None:
    csrf = auth_as(client, "at2", "admin")
    r = client.post(
        "/api/export-targets",
        json={"name": "bad", "mode": "folder"},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 400
    assert "path" in r.json()["detail"].lower()


def test_admin_lists_and_patches_target(client: TestClient) -> None:
    csrf = auth_as(client, "at3", "admin")
    r = client.post(
        "/api/export-targets",
        json={"name": "patch-me", "mode": "folder", "path": "/tmp/x", "format": "xlsx"},
        headers={"X-CSRF-Token": csrf},
    )
    tid = r.json()["id"]
    r = client.patch(
        f"/api/export-targets/{tid}",
        json={"split_size_mb": 25, "runner_selectable": False},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["split_size_mb"] == 25
    assert body["runner_selectable"] is False


def test_duplicate_target_name_rejected(client: TestClient) -> None:
    csrf = auth_as(client, "at4", "admin")
    body = {"name": "dupe", "mode": "folder", "path": "/tmp", "format": "csv"}
    r1 = client.post("/api/export-targets", json=body, headers={"X-CSRF-Token": csrf})
    assert r1.status_code == 201
    r2 = client.post("/api/export-targets", json=body, headers={"X-CSRF-Token": csrf})
    assert r2.status_code == 400


def test_delete_unreferenced_target_succeeds(client: TestClient) -> None:
    csrf = auth_as(client, "at5", "admin")
    r = client.post(
        "/api/export-targets",
        json={"name": "del", "mode": "folder", "path": "/tmp", "format": "csv"},
        headers={"X-CSRF-Token": csrf},
    )
    tid = r.json()["id"]
    r = client.delete(f"/api/export-targets/{tid}", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 204
    assert client.get("/api/export-targets").json() == []


def test_delete_referenced_target_refused(client: TestClient) -> None:
    """A target used by a job cannot be dropped — only disabled."""
    # auth_as creates the user once; use the returned CSRF + reuse the user
    # row to attach a job to the target.
    csrf = auth_as(client, "at6", "admin")
    r = client.post(
        "/api/export-targets",
        json={"name": "ref", "mode": "folder", "path": "/tmp", "format": "csv"},
        headers={"X-CSRF-Token": csrf},
    )
    tid = r.json()["id"]
    with SessionLocal() as db:
        user = db.scalar(__import__("sqlalchemy").select(User).where(User.username == "at6"))
        eid = EngineInstance(
            name="dummy",
            type="playtrafi",
            config_encrypted=encrypt_config({}),
            pooled=True,
        )
        db.add(eid)
        db.commit()
        db.refresh(eid)
        job = Job(
            created_by_id=user.id,
            engine_id=eid.id,
            options={},
            status="completed",
            export_target_id=tid,
        )
        db.add(job)
        db.commit()

    r = client.delete(f"/api/export-targets/{tid}", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400
    assert "referenced" in r.json()["detail"].lower()
