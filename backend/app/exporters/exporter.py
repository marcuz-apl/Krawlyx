"""Exporter orchestrator (PRD §6.4).

The single entry point the job worker uses. Owns the part counter,
filename pattern, manifest, and the per-format writer. Degrades
gracefully (FR-EXP-08): if the target path is unwritable, the writer
becomes a no-op, the DB persists normally, and the job's final status
is flipped to `export_degraded`.
"""

from __future__ import annotations

import logging
import os
import re
import sys
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

_STRUCTURED_COLUMNS: list[str] = [
    "year",
    "make",
    "model",
    "trim",
    "price",
    "mileage",
    "mileage_km",
    "drivetrain",
    "transmission",
    "fuel",
    "seller_type",
    "city",
    "province",
    "dealer_name",
    "date_observed",
    "listing_url",
    "name",
    "brand",
    "currency",
]


def find_windows_user_dir(folder_name: str) -> Path | None:
    users_roots = [
        Path("/mnt/c/Users"),
        Path("/mnt/host/c/Users"),
        Path("/host_mnt/c/Users"),
    ]
    for users_dir in users_roots:
        if users_dir.exists():
            for candidate in ["MZou", "user"]:
                target = users_dir / candidate / folder_name
                if target.exists():
                    return target
            try:
                for p in users_dir.iterdir():
                    if p.is_dir() and p.name not in (
                        "Public",
                        "Default",
                        "Default User",
                        "All Users",
                        "DefaultAppPool",
                    ):
                        target = p / folder_name
                        if target.exists():
                            return target
            except OSError:
                pass
    return None


def normalize_target_path(raw_path: str | Path | None) -> Path:
    """Normalize local folder paths across OS environments, including Docker, WSL, and Windows.

    - Resolves 'Downloads', 'Documents', '~/Downloads', '~/Documents'
    - Translates Windows drive paths like 'E:\\projects\\storage' or 'C:\\...' to:
      1. Explicit env var mapping (e.g. MYKRAWL_DRIVE_E=/exports or MYKRAWL_DRIVE_E=/mnt/e)
      2. /mnt/{drive}/{rest} (standard WSL & Docker bind mount: -v E:\\projects\\storage:/mnt/e/projects/storage)
      3. /mnt/host/{drive}/{rest} (Docker Desktop WSL2 backend)
      4. /host_mnt/{drive}/{rest} (Docker Desktop Hyper-V filesystem share)
      5. /exports or /app/exports (if running inside Docker with generic export volume)
    - Expands user home '~'
    """
    if not raw_path:
        return Path(".")
    path_str = str(raw_path).strip()
    lower = path_str.lower().strip("\"'").replace("\\", "/")
    if lower in ("downloads", "~/downloads", "documents", "~/documents"):
        name = "Downloads" if "download" in lower else "Documents"
        win_dir = find_windows_user_dir(name)
        if win_dir is not None:
            return win_dir
        # Docker fallback if /downloads or /app/data/downloads exists
        for doc_candidate in [Path(f"/{name.lower()}"), Path(f"/app/data/{name.lower()}")]:
            if doc_candidate.exists():
                return doc_candidate.resolve()
        return (Path.home() / name).resolve()

    from app.core.config import ROOT_DIR

    # Canonical server exports directory
    clean_slash = path_str.replace("\\", "/").strip("./")
    if clean_slash in ("data/exports", "exports", "app/data/exports", "app/exports"):
        target_dir = ROOT_DIR / "data" / "exports"
        target_dir.mkdir(parents=True, exist_ok=True)
        return target_dir.resolve()

    if path_str.startswith("~"):
        return Path(path_str).expanduser().resolve()

    if sys.platform != "win32":
        m = re.match(r"^([a-zA-Z]):[\\/](.*)$", path_str)
        if m:
            drive = m.group(1).lower()
            rest = m.group(2).replace("\\", "/")

            # 1. Check explicit drive env var: e.g. MYKRAWL_DRIVE_E=/exports or /mnt/e
            env_drive = os.environ.get(f"MYKRAWL_DRIVE_{drive.upper()}")
            if env_drive:
                return (Path(env_drive) / rest).expanduser().resolve()

            # 2. Check mount prefixes in order of standard Docker & WSL patterns
            candidate_mounts = [
                Path(f"/mnt/{drive}"),
                Path(f"/mnt/host/{drive}"),
                Path(f"/host_mnt/{drive}"),
                Path(f"/media/{drive}"),
            ]
            for mount in candidate_mounts:
                if mount.exists():
                    return (mount / rest).expanduser().resolve()

            # 3. Check generic Docker exports bind mount if running inside container
            is_docker = Path("/.dockerenv").exists() or bool(os.environ.get("KRAWLYX_IN_DOCKER"))
            if is_docker:
                for export_mount in [Path("/exports"), Path("/app/exports"), Path("/storage")]:
                    if export_mount.exists():
                        return (export_mount / rest).expanduser().resolve()

            # 4. Standard default for Linux/WSL/Docker container
            return Path(f"/mnt/{drive}/{rest}").expanduser().resolve()

        cleaned = path_str.replace("\\", "/")
        return Path(cleaned).expanduser().resolve()

    return Path(path_str).expanduser().resolve()


def _job_slug(job: Job) -> str:
    custom_name = (job.options or {}).get("export_filename")
    if custom_name and isinstance(custom_name, str) and custom_name.strip():
        base = custom_name.strip().lower()
        base = re.sub(r"[^a-z0-9_-]+", "-", base).strip("-")[:60] or "crawl"
        return f"job-{job.id}-{base}"
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

        # Compute column list including custom schema or structured dataset fields
        columns = list(_COLUMNS)
        custom_schema = (job.options or {}).get("custom_schema") or {}
        custom_fields = [
            f["name"]
            for f in (custom_schema.get("fields") or [])
            if isinstance(f, dict) and f.get("name")
        ]
        extra_cols = custom_fields + [c for c in _STRUCTURED_COLUMNS if c not in custom_fields]
        for col in extra_cols:
            if col not in columns:
                idx = columns.index("content_text") if "content_text" in columns else len(columns)
                columns.insert(idx, col)
        self._columns = columns

        self._writer: Any = None
        self._manifest: ManifestWriter | None = None
        self._current_path: Path | None = None
        self._opened: bool = False
        self._degraded: bool = False
        self._degrade_reason: str | None = None
        self._parts_written: list[Path] = []

        # Compute the directory; the orchestrator creates it on `open()`.
        assert target.path is not None  # validated at the API layer
        self._dir = normalize_target_path(target.path)
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
            items: list[dict[str, Any]] = []
            if result.metadata_json and isinstance(result.metadata_json, dict):
                raw_items = result.metadata_json.get("items")
                if isinstance(raw_items, list):
                    items = [it for it in raw_items if isinstance(it, dict)]

            if items:
                for it in items:
                    item_row: dict[str, object] = {
                        "target_id": result.target_id,
                        "source_url": source_url,
                        "final_url": result.final_url or "",
                        "http_status": result.http_status if result.http_status is not None else "",
                        "title": (result.title or "")[:500],
                        "status": "error" if result.error else "ok",
                        "duration_ms": result.duration_ms if result.duration_ms is not None else "",
                        "error": (result.error or "")[:500],
                        "fetched_at": result.fetched_at.isoformat(timespec="seconds"),
                    }
                    for k, v in it.items():
                        if k != "type":
                            item_row[k] = v
                    self._write_row(item_row)
            else:
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
