"""Authenticator-app (TOTP) MFA tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.security import generate_totp_secret, totp_now, verify_totp
from app.main import create_app
from tests._helpers import auth_as


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


def test_totp_helpers() -> None:
    secret = generate_totp_secret()
    code = totp_now(secret)
    assert len(code) == 6 and code.isdigit()
    assert verify_totp(secret, code)
    assert not verify_totp(secret, "")
    assert not verify_totp(secret, "abcdef")


def test_enroll_and_login_with_mfa(client: TestClient) -> None:
    csrf = auth_as(client, "mfa-user", "runner")

    setup = client.post("/api/auth/mfa/setup", headers={"X-CSRF-Token": csrf})
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]
    assert setup.json()["otpauth_uri"].startswith("otpauth://totp/")

    good = totp_now(secret)
    wrong = "000000" if good != "000000" else "111111"
    assert (
        client.post(
            "/api/auth/mfa/verify", json={"code": wrong}, headers={"X-CSRF-Token": csrf}
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/auth/mfa/verify", json={"code": good}, headers={"X-CSRF-Token": csrf}
        ).status_code
        == 204
    )
    assert client.get("/api/auth/me").json()["mfa_enabled"] is True
    assert client.post("/api/auth/mfa/setup", headers={"X-CSRF-Token": csrf}).status_code == 400

    client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf})
    login = client.post("/api/auth/login", json={"username": "mfa-user", "password": "pw"})
    assert login.status_code == 200
    body = login.json()
    assert body["mfa_required"] is True
    assert body["mfa_token"]
    assert not body.get("csrf_token")
    assert client.cookies.get("zc_session") is None

    wrong = client.post("/api/auth/login/mfa", json={"mfa_token": body["mfa_token"], "code": wrong})
    assert wrong.status_code == 401
    mfa = client.post(
        "/api/auth/login/mfa",
        json={"mfa_token": body["mfa_token"], "code": totp_now(secret)},
    )
    assert mfa.status_code == 200
    assert mfa.json()["csrf_token"]
    assert client.get("/api/auth/me").json()["username"] == "mfa-user"


def test_self_service_disable_requires_password_and_code(client: TestClient) -> None:
    csrf = auth_as(client, "unmfa-user", "runner")
    assert (
        client.post(
            "/api/auth/mfa/disable",
            json={"password": "pw", "code": "123456"},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 400
    )

    secret = client.post("/api/auth/mfa/setup", headers={"X-CSRF-Token": csrf}).json()["secret"]
    assert (
        client.post(
            "/api/auth/mfa/verify",
            json={"code": totp_now(secret)},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 204
    )

    assert (
        client.post(
            "/api/auth/mfa/disable",
            json={"password": "wrong", "code": totp_now(secret)},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 400
    )
    bad_code = "000000" if totp_now(secret) != "000000" else "111111"
    assert (
        client.post(
            "/api/auth/mfa/disable",
            json={"password": "pw", "code": bad_code},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 400
    )

    assert (
        client.post(
            "/api/auth/mfa/disable",
            json={"password": "pw", "code": totp_now(secret)},
            headers={"X-CSRF-Token": csrf},
        ).status_code
        == 204
    )
    assert client.get("/api/auth/me").json()["mfa_enabled"] is False


def test_disable_blocked_while_mfa_required(client: TestClient) -> None:
    csrf = auth_as(client, "kept-mfa", "runner")
    user_id = client.get("/api/auth/me").json()["id"]
    secret = client.post("/api/auth/mfa/setup", headers={"X-CSRF-Token": csrf}).json()["secret"]
    client.post(
        "/api/auth/mfa/verify", json={"code": totp_now(secret)}, headers={"X-CSRF-Token": csrf}
    )

    admin_csrf = auth_as(client, "keep-admin", "admin")
    client.patch(
        f"/api/users/{user_id}",
        json={"mfa_required": True},
        headers={"X-CSRF-Token": admin_csrf},
    )

    relogin = client.post("/api/auth/login", json={"username": "kept-mfa", "password": "pw"})
    mfa = client.post(
        "/api/auth/login/mfa",
        json={"mfa_token": relogin.json()["mfa_token"], "code": totp_now(secret)},
    )
    csrf = mfa.json()["csrf_token"]
    r = client.post(
        "/api/auth/mfa/disable",
        json={"password": "pw", "code": totp_now(secret)},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 400
    assert "required" in r.json()["detail"]


def test_per_user_mfa_enforcement(client: TestClient) -> None:
    runner_csrf = auth_as(client, "force-target", "runner")
    runner_id = client.get("/api/auth/me").json()["id"]

    r = client.patch(
        f"/api/users/{runner_id}",
        json={"mfa_required": True},
        headers={"X-CSRF-Token": runner_csrf},
    )
    assert r.status_code == 403

    admin_csrf = auth_as(client, "force-admin", "admin")
    r = client.patch(
        f"/api/users/{runner_id}",
        json={"mfa_required": True},
        headers={"X-CSRF-Token": admin_csrf},
    )
    assert r.status_code == 200, r.text
    assert r.json()["mfa_required"] is True

    # Requirement alone does not challenge login until the user enrolls.
    login = client.post("/api/auth/login", json={"username": "force-target", "password": "pw"})
    assert login.status_code == 200
    assert login.json()["mfa_required"] is False
    me = client.get("/api/auth/me").json()
    assert me["mfa_required"] is True and me["mfa_enabled"] is False

    relogin = client.post("/api/auth/login", json={"username": "force-admin", "password": "pw"})
    admin_csrf = relogin.json()["csrf_token"]
    r = client.patch(
        f"/api/users/{runner_id}",
        json={"mfa_required": False},
        headers={"X-CSRF-Token": admin_csrf},
    )
    assert r.json()["mfa_required"] is False


def test_admin_reset_user_mfa_requires_own_password(client: TestClient) -> None:
    csrf = auth_as(client, "reset-target", "runner")
    target_id = client.get("/api/auth/me").json()["id"]
    secret = client.post("/api/auth/mfa/setup", headers={"X-CSRF-Token": csrf}).json()["secret"]
    client.post(
        "/api/auth/mfa/verify", json={"code": totp_now(secret)}, headers={"X-CSRF-Token": csrf}
    )

    admin_csrf = auth_as(client, "reset-admin", "admin")
    wrong = client.post(
        f"/api/users/{target_id}/reset-mfa",
        json={"password": "wrong"},
        headers={"X-CSRF-Token": admin_csrf},
    )
    assert wrong.status_code == 400
    assert client.get("/api/users").json()

    ok = client.post(
        f"/api/users/{target_id}/reset-mfa",
        json={"password": "pw"},
        headers={"X-CSRF-Token": admin_csrf},
    )
    assert ok.status_code == 204, ok.text

    login = client.post("/api/auth/login", json={"username": "reset-target", "password": "pw"})
    assert login.status_code == 200
    assert login.json()["mfa_required"] is False
    assert client.get("/api/auth/me").json()["mfa_enabled"] is False


def test_admin_reset_mfa_self_and_hierarchy(client: TestClient) -> None:
    admin_csrf = auth_as(client, "hier-admin", "admin")
    my_id = client.get("/api/auth/me").json()["id"]
    r = client.post(
        f"/api/users/{my_id}/reset-mfa",
        json={"password": "pw"},
        headers={"X-CSRF-Token": admin_csrf},
    )
    assert r.status_code == 400

    admin2_csrf = auth_as(client, "hier-admin2", "admin")
    admin2_id = client.get("/api/auth/me").json()["id"]
    secret = client.post("/api/auth/mfa/setup", headers={"X-CSRF-Token": admin2_csrf}).json()[
        "secret"
    ]
    client.post(
        "/api/auth/mfa/verify",
        json={"code": totp_now(secret)},
        headers={"X-CSRF-Token": admin2_csrf},
    )

    relogin = client.post("/api/auth/login", json={"username": "hier-admin", "password": "pw"})
    admin_csrf = relogin.json()["csrf_token"]
    r = client.post(
        f"/api/users/{admin2_id}/reset-mfa",
        json={"password": "pw"},
        headers={"X-CSRF-Token": admin_csrf},
    )
    assert r.status_code == 403

    runner_csrf = auth_as(client, "hier-runner", "runner")
    r = client.post(
        f"/api/users/{admin2_id}/reset-mfa",
        json={"password": "pw"},
        headers={"X-CSRF-Token": runner_csrf},
    )
    assert r.status_code == 403

    super_csrf = auth_as(client, "hier-super", "superadmin")
    r = client.post(
        f"/api/users/{admin2_id}/reset-mfa",
        json={"password": "pw"},
        headers={"X-CSRF-Token": super_csrf},
    )
    assert r.status_code == 204, r.text


def test_mfa_login_rejects_bad_token(client: TestClient) -> None:
    r = client.post("/api/auth/login/mfa", json={"mfa_token": "bogus", "code": "123456"})
    assert r.status_code == 401
