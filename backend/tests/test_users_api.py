"""User admin API tests (PRD §9)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.db import SessionLocal
from app.main import create_app
from app.models import User as UserRow
from tests._helpers import auth_as


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


# ---- tests ----


def test_runner_cannot_list_or_create_users(client: TestClient) -> None:
    auth_as(client, "r1", "runner")
    csrf_token_for_self = client.cookies.get("zc_csrf")
    # listing
    r = client.get("/api/users")
    assert r.status_code == 403
    # creating
    r = client.post(
        "/api/users",
        json={"username": "new", "password": "newpass1", "role": "runner"},
        headers={"X-CSRF-Token": csrf_token_for_self},
    )
    assert r.status_code == 403


def test_admin_creates_user(client: TestClient) -> None:
    csrf = auth_as(client, "admin1", "admin")
    r = client.post(
        "/api/users",
        json={"username": "alice", "password": "alice-pw", "role": "runner"},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 201, r.text
    assert r.json()["username"] == "alice"
    assert r.json()["role"] == "runner"
    # Password is stored hashed, not plain text.
    with SessionLocal() as db:
        row = db.scalar(__import__("sqlalchemy").select(UserRow).where(UserRow.username == "alice"))
        assert row is not None
        assert row.password_hash != "alice-pw"
        assert row.password_hash.startswith("$2")  # bcrypt


def test_admin_lists_and_patches_password(client: TestClient) -> None:
    csrf = auth_as(client, "admin2", "admin")
    r = client.post(
        "/api/users",
        json={"username": "bob", "password": "bob-password", "role": "runner"},
        headers={"X-CSRF-Token": csrf},
    )
    uid = r.json()["id"]
    r = client.patch(
        f"/api/users/{uid}",
        json={"password": "new-password"},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 200
    # The new password works for login.
    r = client.post("/api/auth/login", json={"username": "bob", "password": "new-password"})
    assert r.status_code == 200


def test_duplicate_username_rejected(client: TestClient) -> None:
    csrf = auth_as(client, "admin3", "admin")
    body = {"username": "dup", "password": "dup-password", "role": "runner"}
    r1 = client.post("/api/users", json=body, headers={"X-CSRF-Token": csrf})
    assert r1.status_code == 201
    r2 = client.post("/api/users", json=body, headers={"X-CSRF-Token": csrf})
    assert r2.status_code == 400


def test_cannot_delete_last_admin(client: TestClient) -> None:
    """The last admin cannot be deleted. We delete down to one and
    confirm the next delete is refused. (The dev DB may already have
    an extra admin; the test is robust to that.)"""
    csrf = auth_as(client, "admin4", "superadmin")
    cookie_csrf = client.cookies.get("zc_csrf")
    with SessionLocal() as db:
        admin_ids = [
            u.id
            for u in db.scalars(
                __import__("sqlalchemy").select(UserRow).where(UserRow.role.in_(["admin", "superadmin"]))
            )
        ]
    # Delete down to exactly one admin.
    for uid in admin_ids[:-1]:
        r = client.delete(f"/api/users/{uid}", headers={"X-CSRF-Token": cookie_csrf})
        assert r.status_code == 204
    # Now there's exactly one admin. Try to delete that one.
    with SessionLocal() as db:
        last_admin_id = db.scalar(
            __import__("sqlalchemy").select(UserRow.id).where(UserRow.role.in_(["admin", "superadmin"]))
        )
    r = client.delete(f"/api/users/{last_admin_id}", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400
    assert "last admin" in r.json()["detail"].lower()


def test_delete_non_admin_succeeds(client: TestClient) -> None:
    csrf = auth_as(client, "admin5", "admin")
    r = client.post(
        "/api/users",
        json={"username": "delme", "password": "delme-pw1", "role": "runner"},
        headers={"X-CSRF-Token": csrf},
    )
    uid = r.json()["id"]
    r = client.delete(f"/api/users/{uid}", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 204
