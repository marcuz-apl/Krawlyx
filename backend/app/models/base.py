"""Declarative base shared by all ORM models."""

from datetime import UTC, datetime

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp used as the default for created/run timestamps."""
    return datetime.now(UTC)
