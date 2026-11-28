"""Migration smoke tests — startup must produce the full core schema."""

from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from alembic import command
from app.core import db
from app.core.config import get_settings
from app.core.db import engine, upgrade_db
from app.services.engines import bootstrap_default_engines


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


def test_upgrade_clears_stale_alembic_temp_table() -> None:
    """A killed batch migration must not trap container restarts in a loop."""
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE _alembic_tmp_engines (id INTEGER)")

    upgrade_db()

    assert "_alembic_tmp_engines" not in set(inspect(engine).get_table_names())


@pytest.mark.parametrize(
    ("revision", "legacy_types"),
    [
        ("e5f6a7b8c9d0", "'patchtroy','scrapy'"),
        ("f6a7b8c9d0e1", "'patchtroy','scrapy','patroy'"),
        ("a9b8c7d6e5f4", "'patchtroy','playtrafi','scrapy','patroy'"),
    ],
)
def test_upgrade_preserves_legacy_engine(
    revision: str, legacy_types: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "db_path", tmp_path / "legacy.db")
    legacy_engine = db.build_engine(get_settings().db_url)
    monkeypatch.setattr(db, "engine", legacy_engine)
    backend = Path(__file__).resolve().parents[1]
    cfg = Config(str(backend / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend / "alembic"))
    try:
        command.upgrade(cfg, revision)
        # Recreate the released CHECK constraint for this revision.
        with legacy_engine.begin() as conn:
            conn.exec_driver_sql("DROP TABLE engines")
            conn.exec_driver_sql(
                "CREATE TABLE engines (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, "
                "type TEXT NOT NULL, config_encrypted TEXT, pooled BOOLEAN NOT NULL, "
                "created_at DATETIME NOT NULL, disabled_at DATETIME, "
                f"CONSTRAINT ck_engines_type CHECK (type IN ({legacy_types})))"
            )
            conn.exec_driver_sql(
                "INSERT INTO engines VALUES "
                "(1, 'Custom browser', 'patchtroy', 'stored-config', 1, CURRENT_TIMESTAMP, NULL)"
            )
            conn.exec_driver_sql(
                "INSERT INTO users (id, username, password_hash, role, created_at) "
                "VALUES (1, 'legacy-user', 'stored-hash', 'admin', CURRENT_TIMESTAMP)"
            )
            conn.exec_driver_sql(
                "INSERT INTO jobs (id, created_by_id, engine_id, options, status, created_at) "
                "VALUES (1, 1, 1, '{}', 'completed', CURRENT_TIMESTAMP)"
            )
        upgrade_db()
        upgrade_db()
        with Session(legacy_engine, autoflush=False) as session:
            bootstrap_default_engines(session)
        with legacy_engine.connect() as conn:
            assert conn.exec_driver_sql(
                "SELECT id, name, type, config_encrypted FROM engines WHERE id = 1"
            ).one() == (1, "Custom browser", "playtrafi", "stored-config")
            assert conn.exec_driver_sql("SELECT engine_id FROM jobs WHERE id = 1").scalar_one() == 1
            assert set(conn.exec_driver_sql("SELECT type FROM engines").scalars()) == {
                "playtrafi",
                "scrapy",
                "patroy",
            }
            assert conn.exec_driver_sql("PRAGMA foreign_key_check").all() == []
    finally:
        legacy_engine.dispose()
