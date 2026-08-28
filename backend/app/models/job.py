"""Jobs, their URL targets, and normalized crawl results (PRD §§6.2, 7.1, 8)."""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, utcnow


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued','running','completed','failed','cancelled','export_degraded')",
            name="ck_jobs_status",
        ),
        Index("ix_jobs_status_created_at", "status", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    engine_id: Mapped[int] = mapped_column(ForeignKey("engines.id"), nullable=False)
    options: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False)
    schedule_id: Mapped[int | None] = mapped_column(ForeignKey("schedules.id"), nullable=True)
    export_target_id: Mapped[int | None] = mapped_column(
        ForeignKey("export_targets.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    targets: Mapped[list["Target"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )


class Target(Base):
    __tablename__ = "targets"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','fetching','done','error','skipped')",
            name="ck_targets_status",
        ),
        UniqueConstraint("job_id", "url", name="uq_targets_job_url"),
        Index("ix_targets_job_status", "job_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(12), default="pending", nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    job: Mapped[Job] = relationship(back_populates="targets")
    result: Mapped["JobResult | None"] = relationship(
        back_populates="target", cascade="all, delete-orphan", uselist=False
    )


class JobResult(Base):
    """Normalized record produced by an engine adapter (PRD §7.1)."""

    __tablename__ = "job_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    target_id: Mapped[int] = mapped_column(
        ForeignKey("targets.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    final_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    http_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    links_json: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)

    target: Mapped[Target] = relationship(back_populates="result")
