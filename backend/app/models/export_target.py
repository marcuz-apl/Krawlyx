"""Export destinations: SQLite-only or auto-splitting CSV/XLSX folders (PRD §6.4)."""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, utcnow


class ExportTarget(Base):
    __tablename__ = "export_targets"
    __table_args__ = (
        CheckConstraint("mode IN ('database','folder')", name="ck_export_targets_mode"),
        CheckConstraint(
            "format IS NULL OR format IN ('csv','xlsx')", name="ck_export_targets_format"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    mode: Mapped[str] = mapped_column(String(12), default="database", nullable=False)
    path: Mapped[str | None] = mapped_column(Text, nullable=True)  # UNC supported (Windows)
    file_format: Mapped[str | None] = mapped_column("format", String(8), nullable=True)
    split_size_mb: Mapped[int] = mapped_column(Integer, default=40, nullable=False)
    runner_selectable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, nullable=False)
