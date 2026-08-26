"""ORM models mirroring PRD §8.

Every model module must be imported here so that mapper metadata is registered
before `init_db()` / Alembic autogenerate run.
"""

from app.models.base import Base

__all__ = ["Base"]
