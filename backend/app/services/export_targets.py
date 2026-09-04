"""Export target services and bootstrap logic."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import ExportTarget

logger = logging.getLogger("mykrawl.services.export_targets")


def bootstrap_default_export_target(db: Session) -> None:
    """Ensure a default Server Folder Target exists pointing to data/exports."""
    target = db.scalar(
        select(ExportTarget).where(ExportTarget.name == "Server Exports (data/exports)")
    )
    if not target:
        target = db.scalar(select(ExportTarget).where(ExportTarget.path == "data/exports"))
    if not target:
        target = ExportTarget(
            name="Server Exports (data/exports)",
            mode="folder",
            path="data/exports",
            file_format="csv",
            split_size_mb=40,
            runner_selectable=True,
            enabled=True,
        )
        db.add(target)
        try:
            db.commit()
            logger.info("bootstrapped default export target: Server Exports (data/exports)")
        except IntegrityError:
            db.rollback()
