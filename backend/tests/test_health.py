"""Smoke tests for the service meta endpoints."""

from fastapi.testclient import TestClient

from app.main import create_app


def test_health_reports_status_and_version() -> None:
    # Context manager form so lifespan runs (storage mkdir + Alembic upgrade).
    with TestClient(create_app()) as client:
        resp = client.get("/api/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["app"] == "MyKrawl"
    assert body["version"].startswith("v")
