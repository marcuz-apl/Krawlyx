"""User admin API tests (PRD §9)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
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
        json={
            "username": "new",
            "password": "newpass1",
            "role": "runner",
            "email": "new@example.com",
        },
        headers={"X-CSRF-Token": csrf_token_for_self},
    )
    assert r.status_code == 403


def test_admin_creates_user(client: TestClient) -> None:
    csrf = auth_as(client, "admin1", "admin")
    r = client.post(
        "/api/users",
        json={
            "username": "alice",
            "password": "alice-pw12",
            "role": "runner",
            "email": "alice@example.com",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 201, r.text
    assert r.json()["username"] == "alice"
    assert r.json()["role"] == "runner"
    assert r.json()["email"] == "alice@example.com"
    # No SMTP in tests -> credentials mail is reported as not sent.
    assert r.json()["welcome_email_sent"] is False
    # Admin-created accounts must change their password on first login.
    assert r.json()["must_change_password"] is True
    # Password is stored hashed, not plain text.
    with SessionLocal() as db:
        row = db.scalar(__import__("sqlalchemy").select(UserRow).where(UserRow.username == "alice"))
        assert row is not None
        assert row.password_hash != "alice-pw12"
        assert row.password_hash.startswith("$2")  # bcrypt


def test_admin_lists_and_patches_password(client: TestClient) -> None:
    csrf = auth_as(client, "admin2", "admin")
    r = client.post(
        "/api/users",
        json={
            "username": "bob",
            "password": "bob-password",
            "role": "runner",
            "email": "bob@example.com",
        },
        headers={"X-CSRF-Token": csrf},
    )
    uid = r.json()["id"]
    r = client.patch(
        f"/api/users/{uid}",
        json={"password": "new-password"},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 200
    # An admin password reset re-arms the first-login change requirement.
    assert r.json()["must_change_password"] is True
    # The new password works for login.
    r = client.post("/api/auth/login", json={"username": "bob", "password": "new-password"})
    assert r.status_code == 200


def test_duplicate_username_rejected(client: TestClient) -> None:
    csrf = auth_as(client, "admin3", "admin")
    body = {
        "username": "dup",
        "password": "dup-password",
        "role": "runner",
        "email": "dup@example.com",
    }
    r1 = client.post("/api/users", json=body, headers={"X-CSRF-Token": csrf})
    assert r1.status_code == 201
    r2 = client.post(
        "/api/users",
        json={**body, "email": "dup2@example.com"},
        headers={"X-CSRF-Token": csrf},
    )
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
                __import__("sqlalchemy")
                .select(UserRow)
                .where(UserRow.role.in_(["admin", "superadmin"]))
            )
        ]
    # Delete down to exactly one admin.
    for uid in admin_ids[:-1]:
        r = client.delete(f"/api/users/{uid}", headers={"X-CSRF-Token": cookie_csrf})
        assert r.status_code == 204
    # Now there's exactly one admin. Try to delete that one.
    with SessionLocal() as db:
        last_admin_id = db.scalar(
            __import__("sqlalchemy")
            .select(UserRow.id)
            .where(UserRow.role.in_(["admin", "superadmin"]))
        )
    r = client.delete(f"/api/users/{last_admin_id}", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400
    assert "last admin" in r.json()["detail"].lower()


def test_delete_non_admin_succeeds(client: TestClient) -> None:
    csrf = auth_as(client, "admin5", "admin")
    r = client.post(
        "/api/users",
        json={
            "username": "delme",
            "password": "delme-pw1",
            "role": "runner",
            "email": "delme@example.com",
        },
        headers={"X-CSRF-Token": csrf},
    )
    uid = r.json()["id"]
    r = client.delete(f"/api/users/{uid}", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 204


def test_user_email_create_update_and_duplicate(client: TestClient) -> None:
    csrf = auth_as(client, "admin6", "admin")
    r = client.post(
        "/api/users",
        json={
            "username": "jane",
            "password": "jane-pw12",
            "role": "runner",
            "email": "jane@example.com",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 201, r.text
    assert r.json()["email"] == "jane@example.com"
    uid = r.json()["id"]

    dup = client.post(
        "/api/users",
        json={
            "username": "jane2",
            "password": "jane-pw12",
            "role": "runner",
            "email": "jane@example.com",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert dup.status_code == 400
    assert "email" in dup.json()["detail"]

    patched = client.patch(
        f"/api/users/{uid}",
        json={"email": "jane.doe@example.org"},
        headers={"X-CSRF-Token": csrf},
    )
    assert patched.status_code == 200
    assert patched.json()["email"] == "jane.doe@example.org"

    cleared = client.patch(f"/api/users/{uid}", json={"email": ""}, headers={"X-CSRF-Token": csrf})
    assert cleared.status_code == 200
    assert cleared.json()["email"] is None


def test_user_email_must_be_valid(client: TestClient) -> None:
    csrf = auth_as(client, "admin7", "admin")
    r = client.post(
        "/api/users",
        json={"username": "badmail", "password": "badmail-pw", "email": "not-an-email"},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 422


def test_user_email_is_required(client: TestClient) -> None:
    csrf = auth_as(client, "admin8", "admin")
    r = client.post(
        "/api/users",
        json={"username": "nomail", "password": "nomail-pw"},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 422


def test_welcome_email_sends_credentials_when_smtp_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MYKRAWL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("MYKRAWL_SMTP_FROM", "noreply@example.com")
    csrf = auth_as(client, "admin9", "admin")
    with (
        patch("app.services.mailer.get_settings", return_value=Settings()),
        patch("smtplib.SMTP") as smtp,
    ):
        r = client.post(
            "/api/users",
            json={
                "username": "welcome",
                "password": "welcome-pw1",
                "role": "runner",
                "email": "welcome@example.com",
            },
            headers={"X-CSRF-Token": csrf},
        )
    assert r.status_code == 201, r.text
    assert r.json()["welcome_email_sent"] is True
    sent = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
    assert sent["To"] == "welcome@example.com"
    assert sent["From"] == "noreply@example.com"
    body = sent.get_content()
    assert "welcome" in body
    assert "welcome-pw1" in body


def test_must_change_password_flow(client: TestClient) -> None:
    csrf = auth_as(client, "admin10", "admin")
    created = client.post(
        "/api/users",
        json={
            "username": "changer",
            "password": "init-pass-1",
            "role": "runner",
            "email": "changer@example.com",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert created.status_code == 201
    assert created.json()["must_change_password"] is True

    login = client.post("/api/auth/login", json={"username": "changer", "password": "init-pass-1"})
    assert login.status_code == 200
    assert login.json()["user"]["must_change_password"] is True
    user_csrf = login.json()["csrf_token"]

    bad = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong-pass", "new_password": "new-pass-12"},
        headers={"X-CSRF-Token": user_csrf},
    )
    assert bad.status_code == 400

    no_csrf = client.post(
        "/api/auth/change-password",
        json={"current_password": "init-pass-1", "new_password": "new-pass-12"},
    )
    assert no_csrf.status_code == 403

    ok = client.post(
        "/api/auth/change-password",
        json={"current_password": "init-pass-1", "new_password": "new-pass-12"},
        headers={"X-CSRF-Token": user_csrf},
    )
    assert ok.status_code == 204
    assert client.get("/api/auth/me").json()["must_change_password"] is False

    assert (
        client.post(
            "/api/auth/login", json={"username": "changer", "password": "init-pass-1"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login", json={"username": "changer", "password": "new-pass-12"}
        ).status_code
        == 200
    )
