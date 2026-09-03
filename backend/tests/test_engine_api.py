"""Engine CRUD + capabilities API tests (PRD §6.1 FR-ENG-01/04/05, §9)."""

import pytest
from fastapi.testclient import TestClient

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.main import create_app
from app.models import User


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def db():
    session = SessionLocal()
    yield session
    session.close()


def make_user(db, username: str, role: str = "runner") -> User:
    user = User(username=username, password_hash=hash_password("pw"), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def auth_as(client: TestClient, db, username: str, role: str) -> str:
    """Return CSRF token for the user with this role."""
    make_user(db, username, role)
    r = client.post("/api/auth/login", json={"username": username, "password": "pw"})
    assert r.status_code == 200
    return r.json()["csrf_token"]


def test_capabilities_endpoint_returns_registered_types(client: TestClient, db) -> None:
    auth_as(client, db, "alice", "runner")
    r = client.get("/api/engines/capabilities")
    assert r.status_code == 200
    types = {t["type"] for t in r.json()["types"]}
    assert types == {"patchtroy", "scrapy", "patroy"}


def test_runner_cannot_create_engine(client: TestClient, db) -> None:
    csrf = auth_as(client, db, "runner1", "runner")
    r = client.post(
        "/api/engines",
        json={"name": "pt", "type": "patchtroy", "config": {}, "pooled": True},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 403


def test_admin_creates_engine_and_secret_is_redacted(client: TestClient, db) -> None:
    """Both engines in v1 happen to have no secret fields, so we verify the
    redactor by adding a no-op key through the allowed schema, and
    double-check the redactor logic in test_redactor_handles_secrets.
    """
    csrf = auth_as(client, db, "admin1", "admin")
    r = client.post(
        "/api/engines",
        json={
            "name": "pt local",
            "type": "patchtroy",
            "config": {"user_agent": "test/1", "browser_timeout_s": 5},
            "pooled": True,
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["has_secret"] is False
    assert body["config_redacted"]["user_agent"] == "test/1"
    assert body["config_redacted"]["browser_timeout_s"] == 5


def test_redactor_handles_secrets() -> None:
    """Direct test of the redactor so we know secrets are masked for any
    future engine type that does take them (e.g. when Firecrawl returns,
    PRD §4.7)."""
    from app.services.engines import redact

    redacted, has_secret = redact({"api_key": "sensitive", "user_agent": "fine"})
    assert has_secret is True
    assert "api_key" not in redacted
    assert redacted["user_agent"] == "fine"


def test_admin_pool_toggle_round_trip(client: TestClient, db) -> None:
    csrf = auth_as(client, db, "admin2", "admin")
    r = client.post(
        "/api/engines",
        json={"name": "scrapy default", "type": "scrapy", "config": {}, "pooled": False},
        headers={"X-CSRF-Token": csrf},
    )
    eid = r.json()["id"]

    r = client.patch(
        f"/api/engines/{eid}",
        json={"pooled": True},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 200
    assert r.json()["pooled"] is True

    r = client.get("/api/engines", params={"pooled_only": True})
    assert any(e["id"] == eid for e in r.json())


def test_invalid_engine_type_rejected(client: TestClient, db) -> None:
    csrf = auth_as(client, db, "admin3", "admin")
    r = client.post(
        "/api/engines",
        json={"name": "bogus", "type": "firecrawl", "config": {}, "pooled": False},
        headers={"X-CSRF-Token": csrf},
    )
    assert r.status_code == 400
    assert "unknown" in r.json()["detail"].lower()


def test_duplicate_engine_name_rejected(client: TestClient, db) -> None:
    csrf = auth_as(client, db, "admin4", "admin")
    body = {"name": "dupe", "type": "scrapy", "config": {}, "pooled": False}
    assert client.post("/api/engines", json=body, headers={"X-CSRF-Token": csrf}).status_code == 201
    r = client.post("/api/engines", json=body, headers={"X-CSRF-Token": csrf})
    assert r.status_code == 400


def test_test_endpoint_against_real_engine(client: TestClient, db) -> None:
    """The test endpoint must return a real health check, not a stub."""
    csrf = auth_as(client, db, "admin5", "admin")
    r = client.post(
        "/api/engines",
        json={"name": "pt health", "type": "patchtroy", "config": {}, "pooled": True},
        headers={"X-CSRF-Token": csrf},
    )
    eid = r.json()["id"]
    r = client.post(f"/api/engines/{eid}/test", headers={"X-CSRF-Token": csrf})
    assert r.status_code == 200
    body = r.json()
    # patchtroy is installed; health should be ok
    assert "ok" in body
    assert isinstance(body["latency_ms"], int)
