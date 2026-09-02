"""Exporter orchestrator (PRD §6.4).

The single entry point the job worker uses. Owns the part counter,
filename pattern, manifest, and the per-format writer. Degrades
gracefully (FR-EXP-08): if the target path is unwritable, the writer
becomes a no-op, the DB persists normally, and the job's final status
is flipped to `export_degraded`.
"""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.exporters.csv_writer import CsvWriter
from app.exporters.manifest import ManifestWriter
from app.exporters.xlsx_writer import XlsxWriter
from app.models import ExportTarget, Job, JobResult
from app.models import Target as TargetRow

logger = logging.getLogger("mykrawl.exporters")

_COLUMNS: list[str] = [
    "target_id",
    "source_url",
    "final_url",
    "http_status",
    "title",
    "status",  # "ok" | "error" | "skipped"
    "duration_ms",
    "error",
    "content_text",
    "fetched_at",
]


def _job_slug(job: Job) -> str:
    base = (job.notes or "crawl").lower()
    base = re.sub(r"[^a-z0-9]+", "-", base).strip("-")[:40] or "crawl"
    return f"job-{job.id}-{base}"


def _timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def _writer_for(fmt: str) -> Any:
    if fmt == "csv":
        return CsvWriter()
    if fmt == "xlsx":
        return XlsxWriter()
    raise ValueError(f"unsupported export format: {fmt!r}")


class Exporter:
    """Streaming CSV/XLSX writer with size-based part rollover and manifest.

    Lifecycle: `open()` once when the job starts, `write_result()` or
    `write_skipped()` per target as it settles, `close()` once when the
    job finishes (or is cancelled). All methods are safe to call on a
    broken exporter; they become no-ops after the first write failure.
    """

    def __init__(self, job: Job, target: ExportTarget) -> None:
        self._job = job
        self._target = target
        self._slug = _job_slug(job)
        self._ts = _timestamp()
        self._part_index: int = 0
        self._rows_in_part: int = 0
        self._columns = _COLUMNS
        self._writer: Any = None
        self._manifest: ManifestWriter | None = None
        self._current_path: Path | None = None
        self._opened: bool = False
        self._degraded: bool = False
        self._degrade_reason: str | None = None
        self._parts_written: list[Path] = []

        # Compute the directory; the orchestrator creates it on `open()`.
        assert target.path is not None  # validated at the API layer
        self._dir = Path(target.path).expanduser().resolve()
        # Per-format writer factory captured for the rollover path.
        self._writer_factory: Callable[[], Any] = lambda: _writer_for(target.file_format or "csv")
        # Split size in bytes; PRD requires min 1 MB.
        self._split_bytes: int = max(1, target.split_size_mb) * 1024 * 1024
        # Cached format string (ORM attribute is `file_format`, column is
        # "format"; the rest of the exporter reads this single field).
        self._fmt: str = target.file_format or "csv"

    # ---- introspection ----

    @property
    def is_degraded(self) -> bool:
        return self._degraded

    @property
    def degrade_reason(self) -> str | None:
        return self._degrade_reason

    @property
    def manifest_path(self) -> Path:
        return self._dir / f"Krawlyx_{self._slug}_{self._ts}_manifest.json"

    @property
    def parts(self) -> list[Path]:
        return list(self._parts_written)

    # ---- lifecycle ----

    def open(self) -> None:
        if self._opened:
            return
        try:
            self._dir.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            self._degrade(f"mkdir failed: {exc}")
            return
        self._manifest = ManifestWriter(
            self.manifest_path,
            job_id=self._job.id,
            job_slug=self._slug,
            fmt=self._fmt,
        )
        self._open_new_part()
        self._opened = True

    def close(self) -> None:
        if not self._opened:
            return
        # Persist the current part's bytes counter into the manifest
        # before closing the writer (writers compute their own final size).
        try:
            if self._writer is not None and self._current_path is not None:
                # Capture the row count BEFORE close, then close the
                # writer (which writes the workbook to disk and updates
                # its own bytes counter).
                rows_in_part = self._rows_in_part
                self._writer.close()
                final_bytes = self._current_path.stat().st_size
                # Feed back the actual bytes-per-row to refine the next
                # part's row budget (XLSX only).
                if self._fmt == "xlsx" and rows_in_part > 0:
                    self._writer.set_estimated_bytes_per_row(final_bytes / rows_in_part)
                assert self._manifest is not None
                self._manifest.add_part(
                    index=self._part_index,
                    filename=self._current_path.name,
                    bytes=final_bytes,
                    rows=rows_in_part,
                )
                self._parts_written.append(self._current_path)
        except OSError as exc:
            self._degrade(f"close failed: {exc}")
        finally:
            self._writer = None
            self._current_path = None
            self._rows_in_part = 0
            self._opened = False

    # ---- per-row ----

    def write_result(self, result: JobResult, *, source_url: str) -> None:
        if self._degraded or not self._opened:
            return
        try:
            row = {
                "target_id": result.target_id,
                "source_url": source_url,
                "final_url": result.final_url or "",
                "http_status": result.http_status if result.http_status is not None else "",
                "title": (result.title or "")[:500],
                "status": "error" if result.error else "ok",
                "duration_ms": result.duration_ms if result.duration_ms is not None else "",
                "error": (result.error or "")[:500],
                # Truncate to keep parts small; full content is in the DB.
                "content_text": (result.content_text or "")[:500],
                "fetched_at": result.fetched_at.isoformat(timespec="seconds"),
            }
            self._write_row(row)
        except OSError as exc:
            self._degrade(f"write failed: {exc}")

    def write_skipped(self, target_row: TargetRow) -> None:
        if self._degraded or not self._opened:
            return
        try:
            row = {
                "target_id": target_row.id,
                "source_url": target_row.url,
                "final_url": "",
                "http_status": "",
                "title": "",
                "status": "skipped" if target_row.status == "skipped" else "error",
                "duration_ms": "",
                "error": (target_row.error or "")[:500],
                "content_text": "",
                "fetched_at": "",
            }
            self._write_row(row)
        except OSError as exc:
            self._degrade(f"write failed: {exc}")

    # ---- internals ----

    def _write_row(self, row: dict[str, object]) -> None:
        if self._writer is None or self._current_path is None:
            return
        # Write first; rollover check happens AFTER so we never call
        # XlsxWriter.flush_to_disk() unless we're actually about to
        # close the part (openpyxl's write-only mode invalidates the
        # worksheet on save, so flushing mid-write would kill the
        # writer).
        self._writer.write_row(row)
        self._rows_in_part += 1
        self._maybe_rollover()

    def _maybe_rollover(self) -> None:
        if self._writer is None or self._current_path is None:
            return
        if self._fmt == "xlsx":
            # XLSX: rollover is row-count driven because we can't
            # measure byte size without saving (which would kill the
            # write-only worksheet). The budget targets 90% of the
            # split size, using the writer's per-row estimate.
            budget = int((self._split_bytes * 0.9) / max(self._writer.estimated_bytes_per_row, 1))
            if self._rows_in_part < budget:
                return
        else:
            # CSV: byte-size check on the open file (the writer flushes
            # after every row, so the file size on disk is the source
            # of truth).
            current_bytes = self._current_path.stat().st_size
            if current_bytes < self._split_bytes:
                return
        # Close the current part, append to the manifest, open the next.
        final_bytes = self._current_path.stat().st_size
        self._writer.close()
        # Feed the new measurement back to the XLSX writer's row estimate
        # so the next part's budget is accurate.
        if self._fmt == "xlsx" and self._rows_in_part > 0:
            actual = final_bytes / self._rows_in_part
            self._writer.set_estimated_bytes_per_row(actual)
        assert self._manifest is not None
        self._manifest.add_part(
            index=self._part_index,
            filename=self._current_path.name,
            bytes=final_bytes,
            rows=self._rows_in_part,
        )
        self._parts_written.append(self._current_path)
        self._open_new_part()

    def _open_new_part(self) -> None:
        self._part_index += 1
        ext = self._fmt
        filename = f"Krawlyx_{self._slug}_{self._ts}_part{self._part_index:03d}.{ext}"
        path = self._dir / filename
        try:
            self._writer = self._writer_factory()
            self._writer.open(path, self._columns)
            self._current_path = path
            self._rows_in_part = 0
        except OSError as exc:
            self._degrade(f"open part failed: {exc}")

    def _degrade(self, reason: str) -> None:
        if self._degraded:
            return
        logger.warning(
            "export degraded for job %d (target %s): %s",
            self._job.id,
            self._target.name,
            reason,
        )
        self._degraded = True
        self._degrade_reason = reason
