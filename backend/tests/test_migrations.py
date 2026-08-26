"""Migration smoke tests — startup must produce the full core schema."""

from sqlalchemy import inspect

from app.core.db import engine, upgrade_db


def test_upgrade_creates_core_schema() -> None:
    upgrade_db()

    names = set(inspect(engine).get_table_names())
    expected = {
        "users",
        "engines",
        "jobs",
        "targets",
        "job_results",
        "schedules",
        "export_targets",
        "settings",
    }
    missing = expected - names
    assert not missing, f"tables missing after upgrade: {missing}"
    assert "alembic_version" in names


def test_upgrade_is_idempotent() -> None:
    upgrade_db()  # second run must be a no-op, not an error
