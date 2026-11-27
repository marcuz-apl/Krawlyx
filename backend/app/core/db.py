"""SQLAlchemy engine/session wiring for SQLite (WAL mode, FK enforcement)."""

import logging
from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

logger = logging.getLogger(__name__)
ALEMBIC_TMP_PREFIX = "_alembic_tmp_"


def build_engine(db_url: str) -> Engine:
    engine = create_engine(db_url, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_connection, _record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()

    return engine


_settings = get_settings()
engine = build_engine(_settings.db_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    """Create tables directly from metadata (dev/test fallback; startup uses Alembic)."""
    # Importing app.models pulls in every model module (see app/models/__init__.py),
    # which is what populates Base.metadata.
    from app.models import Base

    Base.metadata.create_all(engine)


def drop_stale_alembic_temp_tables(engine: Engine) -> None:
    """Remove SQLite batch-mode scratch tables left by an interrupted migration.

    A killed or concurrently started process can leave ``_alembic_tmp_<table>``
    behind. Alembic then fails on every retry when it tries to create it again,
    which turns a one-off interruption into a permanent startup crash loop.
    """
    with engine.begin() as conn:
        stale_tables = [
            name for name in inspect(conn).get_table_names() if name.startswith(ALEMBIC_TMP_PREFIX)
        ]
        for name in stale_tables:
            logger.warning("Dropping stale Alembic temp table %s", name)
            conn.exec_driver_sql(f'DROP TABLE IF EXISTS "{name}"')


def upgrade_db() -> None:
    """Apply Alembic migrations programmatically (startup and test path)."""
    from alembic.config import Config

    from alembic import command

    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    drop_stale_alembic_temp_tables(engine)
    command.upgrade(cfg, "head")


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
