"""CSV writer (PRD §6.4 FR-EXP-05).

Pure streaming write with `utf-8-sig` (BOM) encoding so Excel opens
the parts cleanly. Each part repeats the header row. Byte-based
rollover: when the open file's `tell()` reaches `split_size_bytes`,
the part is closed and a new one opens. The writer flushes after every
row so a crash mid-job leaves a valid partial file on disk.
"""

from __future__ import annotations

import csv
from collections.abc import Sequence
from pathlib import Path


class CsvWriter:
    def __init__(self) -> None:
        self._fh = None
        self._writer: csv.DictWriter | None = None
        self._bytes: int = 0

    @property
    def bytes_written(self) -> int:
        return self._bytes

    def open(self, path: Path, columns: Sequence[str]) -> None:
        self._fh = open(path, "w", encoding="utf-8-sig", newline="")  # noqa: SIM115 — held open across many write_row calls
        self._writer = csv.DictWriter(self._fh, fieldnames=list(columns))
        self._writer.writeheader()
        self._fh.flush()
        # `tell()` on a text file returns the character count, not bytes;
        # for `utf-8-sig` the BOM is 3 bytes and ASCII characters are 1.
        # We approximate byte size as `len(file_contents)` of the actual
        # text we wrote. The orchestrator uses the *file size on disk*
        # to decide rollover (via Path.stat().st_size), so this byte
        # counter is informational.
        self._bytes = path.stat().st_size

    def write_row(self, row: dict[str, object]) -> None:
        if self._writer is None or self._fh is None:
            raise RuntimeError("CsvWriter.open() must be called first")
        self._writer.writerow(row)
        self._fh.flush()  # FR-EXP-04: partial files survive crashes
        self._bytes = self._fh.tell()  # characters written

    def close(self) -> None:
        if self._fh is not None:
            self._fh.flush()
            self._fh.close()
            self._fh = None
            self._writer = None
