"""Auth flow tests — login/logout/me, CSRF enforcement, admin bootstrap (PRD §5, NFR-04)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine as sa_create_engine
from sqlalchemy.orm import sessionmaker

from app.core.db import SessionLocal
from app.core.security import CSRF_COOKIE, SESSION_COOKIE, hash_password
from app.main import create_app
from app.models import Base, User


@pytest.fixture()
def client():
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def db():
    session = SessionLocal()
    yield session
    session.close()


def make_user(db, username: str, password: str = "pw", role: str = "runner") -> User:
    user = User(username=username, password_hash=hash_password(password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_login_me_logout_flow(client: TestClient, db) -> None:
    make_user(db, "alice")

    r = client.post("/api/auth/login", json={"username": "alice", "password": "pw"})
    assert r.status_code == 200
    body = r.json()
    assert body["user"]["role"] == "runner"
    csrf = body["csrf_token"]
    assert client.cookies.get(SESSION_COOKIE)
    assert client.cookies.get(CSRF_COOKIE) == csrf

    r = client.get("/api/auth/me")
    assert r.status_code == 200
    assert r.json()["username"] == "alice"

    # Mutations require the double-submit CSRF header.
    assert client.post("/api/auth/logout").status_code == 403
    assert client.post("/api/auth/logout", headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204

    # Cookies cleared → session gone.
    assert client.get("/api/auth/me").status_code == 401


def test_login_bad_password_401(client: TestClient, db) -> None:
    make_user(db, "bob")
    r = client.post("/api/auth/login", json={"username": "bob", "password": "nope"})
    assert r.status_code == 401
    assert SESSION_COOKIE not in client.cookies


def test_me_unauthenticated_401(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_bootstrap_admin_creates_admin_when_empty(monkeypatch) -> None:
    from app.core.config import get_settings
    from app.services.users import bootstrap_admin, count_users

    monkeypatch.setenv("MYKRAWL_ADMIN_USER", "root")
    monkeypatch.setenv("MYKRAWL_ADMIN_PASSWORD", "secret123")
    monkeypatch.setattr("app.core.config.get_settings", get_settings)  # keep cache_clear effective
    get_settings.cache_clear()

    engine = sa_create_engine("sqlite://")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    with factory() as fresh_db:
        assert bootstrap_admin(fresh_db) is True
        users = count_users(fresh_db)
        assert users == 1
        # Second call must not duplicate the bootstrap admin.
        assert bootstrap_admin(fresh_db) is False
