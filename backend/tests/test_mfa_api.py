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


def test_mfa_policy_admin_only_and_reflected_in_settings(client: TestClient) -> None:
    auth_as(client, "mfa-runner", "runner")
    assert client.get("/api/settings/mfa-policy").status_code == 403

    csrf = auth_as(client, "mfa-admin", "admin")
    r = client.patch(
        "/api/settings/mfa-policy", json={"required": True}, headers={"X-CSRF-Token": csrf}
    )
    assert r.status_code == 200
    assert r.json()["required"] is True
    assert client.get("/api/settings").json()["mfa_required"] is True

    assert client.patch("/api/settings/mfa-policy", json={"required": False}).status_code == 403

    r = client.patch(
        "/api/settings/mfa-policy", json={"required": False}, headers={"X-CSRF-Token": csrf}
    )
    assert r.json()["required"] is False


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


def test_mfa_login_rejects_bad_token(client: TestClient) -> None:
    r = client.post("/api/auth/login/mfa", json={"mfa_token": "bogus", "code": "123456"})
    assert r.status_code == 401
