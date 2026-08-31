"""Tests for SuperAdmin role classification and SQLite Database Browser API."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.security import CSRF_COOKIE, SESSION_COOKIE, hash_password, issue_session
from app.main import app
from app.models.user import User


@pytest.fixture
def auth_users(db):
    """Seed superadmin, general admin, and runner accounts."""
    superadmin = User(
        username="superadmin_test",
        password_hash=hash_password("SuperSecret123!"),
        role="superadmin",
    )
    admin = User(
        username="admin_test",
        password_hash=hash_password("AdminSecret123!"),
        role="admin",
    )
    runner = User(
        username="runner_test",
        password_hash=hash_password("RunnerSecret123!"),
        role="runner",
    )
    db.add_all([superadmin, admin, runner])
    db.commit()
    db.refresh(superadmin)
    db.refresh(admin)
    db.refresh(runner)
    return {"superadmin": superadmin, "admin": admin, "runner": runner}


@pytest.mark.asyncio
async def test_database_api_requires_superadmin(auth_users):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Runner receives 403
        runner_sess, runner_csrf = issue_session(auth_users["runner"].id)
        res_runner = await client.get("/api/database/tables", cookies={SESSION_COOKIE: runner_sess})
        assert res_runner.status_code == 403

        # General Admin receives 403
        admin_sess, admin_csrf = issue_session(auth_users["admin"].id)
        res_admin = await client.get("/api/database/tables", cookies={SESSION_COOKIE: admin_sess})
        assert res_admin.status_code == 403

        # SuperAdmin succeeds (200)
        super_sess, super_csrf = issue_session(auth_users["superadmin"].id)
        res_super = await client.get("/api/database/tables", cookies={SESSION_COOKIE: super_sess})
        assert res_super.status_code == 200
        tables = res_super.json()
        assert isinstance(tables, list)
        table_names = [t["name"] for t in tables]
        assert "users" in table_names
        assert "jobs" in table_names


@pytest.mark.asyncio
async def test_database_table_rows_and_search(auth_users):
    transport = ASGITransport(app=app)
    super_sess, super_csrf = issue_session(auth_users["superadmin"].id)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get(
            "/api/database/tables/users/rows?page=1&page_size=10",
            cookies={SESSION_COOKIE: super_sess},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["table_name"] == "users"
        assert data["total_rows"] >= 3
        assert len(data["rows"]) >= 3

        # Test search filter
        res_search = await client.get(
            "/api/database/tables/users/rows?search=superadmin_test",
            cookies={SESSION_COOKIE: super_sess},
        )
        assert res_search.status_code == 200
        search_data = res_search.json()
        assert search_data["filtered_rows"] == 1
        assert search_data["rows"][0]["username"] == "superadmin_test"


@pytest.mark.asyncio
async def test_database_sql_query_execution(auth_users):
    transport = ASGITransport(app=app)
    super_sess, super_csrf = issue_session(auth_users["superadmin"].id)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # SELECT Query
        res_select = await client.post(
            "/api/database/query",
            json={"sql": "SELECT id, username, role FROM users WHERE username = 'superadmin_test'"},
            cookies={SESSION_COOKIE: super_sess, CSRF_COOKIE: super_csrf},
            headers={"X-CSRF-Token": super_csrf},
        )
        assert res_select.status_code == 200
        data = res_select.json()
        assert data["success"] is True
        assert data["columns"] == ["id", "username", "role"]
        assert len(data["rows"]) == 1
        assert data["rows"][0]["username"] == "superadmin_test"
        assert data["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_database_stats_and_maintenance(auth_users):
    transport = ASGITransport(app=app)
    super_sess, super_csrf = issue_session(auth_users["superadmin"].id)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Stats
        res_stats = await client.get(
            "/api/database/stats",
            cookies={SESSION_COOKIE: super_sess},
        )
        assert res_stats.status_code == 200
        stats = res_stats.json()
        assert "file_size_formatted" in stats
        assert "integrity_status" in stats

        # Maintenance (Checkpoint)
        res_maint = await client.post(
            "/api/database/maintenance",
            json={"action": "checkpoint"},
            cookies={SESSION_COOKIE: super_sess, CSRF_COOKIE: super_csrf},
            headers={"X-CSRF-Token": super_csrf},
        )
        assert res_maint.status_code == 200
        maint_data = res_maint.json()
        assert maint_data["success"] is True
