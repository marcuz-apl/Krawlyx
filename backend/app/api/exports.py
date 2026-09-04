"""Exported files file manager API.

Provides listing, direct download, and deletion of crawl export files
generated into the persistent server exports storage (e.g. data/exports).
Allows users on any OS (Windows, macOS, Linux) to download overnight
crawl outputs through the browser with 1 click.
"""

from __future__ import annotations

import logging
import mimetypes
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin, verify_csrf
from app.core.config import ROOT_DIR
from app.core.db import get_db
from app.exporters.exporter import normalize_target_path
from app.models import ExportTarget, User

logger = logging.getLogger("mykrawl.api.exports")

router = APIRouter(prefix="/api/exports", tags=["exports"])

DEFAULT_EXPORTS_DIR = ROOT_DIR / "data" / "exports"


class ExportFileInfo(BaseModel):
    filename: str
    size_bytes: int
    size_human: str
    modified_at: str
    format: str
    job_id: int | None = None
    row_count: int | None = None


def _format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    if size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    if size_bytes < 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    return f"{size_bytes / (1024 * 1024 * 1024):.2f} GB"


def _get_export_directories(db: Session) -> list[Path]:
    """Collect all existing directories where exports might be saved."""
    dirs: list[Path] = [DEFAULT_EXPORTS_DIR]
    try:
        targets = db.scalars(select(ExportTarget).where(ExportTarget.mode == "folder")).all()
        for t in targets:
            if t.path:
                try:
                    norm = normalize_target_path(t.path)
                    if norm.exists() and norm.is_dir() and norm not in dirs:
                        dirs.append(norm)
                except OSError as exc:
                    logger.debug("Skipping unresolvable target path %s: %s", t.path, exc)
    except SQLAlchemyError as exc:
        logger.warning("Error fetching export targets: %s", exc)
    return dirs


def _find_file(filename: str, directories: list[Path]) -> Path | None:
    safe_name = Path(filename).name
    if safe_name != filename or ".." in filename:
        return None
    for d in directories:
        candidate = d / safe_name
        if candidate.is_file():
            return candidate
    return None


@router.get("", response_model=list[ExportFileInfo])
def list_export_files(
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ExportFileInfo]:
    """List all exported CSV/XLSX/JSON files saved across export folders."""
    DEFAULT_EXPORTS_DIR.mkdir(parents=True, exist_ok=True)
    dirs = _get_export_directories(db)
    results: list[ExportFileInfo] = []
    seen_names: set[str] = set()

    for d in dirs:
        if not d.exists() or not d.is_dir():
            continue
        try:
            for p in d.iterdir():
                if not p.is_file():
                    continue
                if p.name.startswith(".") or p.name.endswith(".tmp"):
                    continue
                ext = p.suffix.lower().lstrip(".")
                if ext not in ("csv", "xlsx", "json"):
                    continue
                if p.name in seen_names:
                    continue
                seen_names.add(p.name)

                stat = p.stat()
                mod_iso = datetime.fromtimestamp(stat.st_mtime, UTC).isoformat(timespec="seconds")

                # Extract job ID if filename follows pattern job-123 or job_123
                job_id = None
                m = re.search(r"job[-_](\d+)", p.name, re.IGNORECASE)
                if m:
                    try:
                        job_id = int(m.group(1))
                    except ValueError:
                        pass

                # Quick row count estimation for CSV files
                row_count = None
                if ext == "csv" and stat.st_size < 10 * 1024 * 1024:
                    try:
                        with p.open(encoding="utf-8-sig", errors="ignore") as f:
                            row_count = max(0, sum(1 for _ in f) - 1)
                    except OSError:
                        row_count = None

                results.append(
                    ExportFileInfo(
                        filename=p.name,
                        size_bytes=stat.st_size,
                        size_human=_format_size(stat.st_size),
                        modified_at=mod_iso,
                        format=ext,
                        job_id=job_id,
                        row_count=row_count,
                    )
                )
        except OSError as exc:
            logger.warning("failed to scan export directory %s: %s", d, exc)

    # Newest files first
    results.sort(key=lambda x: x.modified_at, reverse=True)
    return results


@router.get("/{filename}")
def download_export_file(
    filename: str,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> FileResponse:
    """Download an exported file directly to client computer (Windows, macOS, Linux)."""
    dirs = _get_export_directories(db)
    file_path = _find_file(filename, dirs)
    if file_path is None or not file_path.is_file():
        raise HTTPException(status_code=404, detail="export file not found")

    mime_type, _ = mimetypes.guess_type(filename)
    if mime_type is None:
        if filename.endswith(".csv"):
            mime_type = "text/csv; charset=utf-8"
        elif filename.endswith(".xlsx"):
            mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        else:
            mime_type = "application/octet-stream"

    return FileResponse(
        path=str(file_path),
        filename=file_path.name,
        media_type=mime_type,
    )


@router.delete("/{filename}", status_code=204, dependencies=[Depends(verify_csrf)])
def delete_export_file(
    filename: str,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Delete an export file from the server storage (Admin only)."""
    dirs = _get_export_directories(db)
    file_path = _find_file(filename, dirs)
    if file_path is None or not file_path.is_file():
        raise HTTPException(status_code=404, detail="export file not found")

    try:
        file_path.unlink()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"failed to delete file: {exc}") from exc
