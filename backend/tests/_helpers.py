"""Shared test helpers for HTTP-level tests (auth + CSRF + fixtures)."""

from fastapi.testclient import TestClient

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import User


def make_user(username: str, role: str = "runner") -> User:
    session = SessionLocal()
    try:
        user = User(username=username, password_hash=hash_password("pw"), role=role)
        session.add(user)
        session.commit()
        session.refresh(user)
        return user
    finally:
        session.close()


def auth_as(client: TestClient, username: str, role: str = "runner") -> str:
    """Log the test user in and return the CSRF token to send as X-CSRF-Token."""
    make_user(username, role)
    r = client.post("/api/auth/login", json={"username": username, "password": "pw"})
    assert r.status_code == 200, r.text
    return r.json()["csrf_token"]
