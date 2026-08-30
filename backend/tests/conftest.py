"""Test isolation: clean tables between tests, single shared DB.

A single SQLite database file is shared across the test session (it is
created once at import time and lives under a tempdir). Before every test,
all application tables are truncated. This is fast, robust, and avoids the
tricky problem of rebinding module-level references that other modules
captured at import time.
"""

import os
import tempfile
from pathlib import Path

# Establish the test DB path before any app module imports settings.
_DATA_DIR = Path(tempfile.mkdtemp(prefix="mykrawl-test-"))
os.environ.setdefault("MYKRAWL_DB_PATH", str(_DATA_DIR / "test.db"))
os.environ.setdefault("MYKRAWL_SECRET_KEY", "test-secret-key-do-not-use-in-prod")

import pytest
from sqlalchemy import text

from app.core.db import SessionLocal, engine
from app.models import Base


@pytest.fixture(autouse=True)
def _clean_db() -> None:
    """Truncate all app tables between tests, then re-run Alembic up to head.

    This is the same approach the production startup uses, so we exercise
    the migration path in tests too.
    """
    from app.core.db import upgrade_db

    upgrade_db()
    with engine.begin() as conn:
        # Get all app table names from metadata, then delete in FK-safe order.
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(text(f"DELETE FROM {table.name}"))


@pytest.fixture()
def db():
    """Per-test session that auto-rolls-back on teardown."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def isolated_engine_registry():
    """Snapshot the engine registry and restore it after the test.

    Lets job tests register fake adapters (`fake-ok`, `fake-slow`,
    `fake-error`) without leaking them into other tests. The default
    `crawl4ai` / `scrapy` types are preserved.
    """
    from app.engines import registry as _reg

    saved = set(_reg.available_types())
    yield _reg
    for t in list(_reg.available_types()):
        if t not in saved:
            _reg._REGISTRY.pop(t, None)
            _reg._CAPABILITIES.pop(t, None)
