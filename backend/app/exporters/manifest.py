"""Incremental manifest writer (PRD §6.4 FR-EXP-07).

One `_manifest.json` beside the parts. The file is rewritten on every
part rollover so a crash mid-job leaves a partial manifest that
reflects what's on disk. The schema mirrors the PRD's required fields.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path


class ManifestWriter:
    def __init__(
        self,
        path: Path,
        *,
        job_id: int,
        job_slug: str,
        fmt: str,
    ) -> None:
        self._path = path
        self._payload: dict = {
            "job_id": job_id,
            "job_slug": job_slug,
            "format": fmt,
            "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "parts": [],
        }

    @property
    def path(self) -> Path:
        return self._path

    def add_part(self, *, index: int, filename: str, bytes: int, rows: int) -> None:
        self._payload["parts"].append(
            {"index": index, "filename": filename, "bytes": bytes, "rows": rows}
        )
        # Refresh the timestamp on every update so a stale manifest is
        # easy to spot.
        self._payload["generated_at"] = datetime.now(UTC).isoformat(timespec="seconds")
        self._write()

    def _write(self) -> None:
        # atomic-ish: write to .tmp then rename. On Windows, os.replace
        # is atomic on the same volume.
        tmp = self._path.with_suffix(self._path.suffix + ".tmp")
        tmp.write_text(json.dumps(self._payload, indent=2), encoding="utf-8")
        tmp.replace(self._path)
