"""Engine instances curated into the user-facing pool (PRD §6.1).

Firecrawl is deferred post-v1 (PRD §4.7) and therefore absent from the type
CHECK; the registry stays extensible without a schema change until then.
"""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class EngineInstance(Base):
    __tablename__ = "engines"
    __table_args__ = (
        CheckConstraint(
            "type IN ('playtrafi','patchtroy','scrapy','patroy')", name="ck_engines_type"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    type: Mapped[str] = mapped_column(String(24))
    # Fernet-encrypted JSON blob; secrets are write-only (FR-ENG-03).
    config_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    pooled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
