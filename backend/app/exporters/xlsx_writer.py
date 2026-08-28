"""XLSX writer (PRD §6.4 FR-EXP-06).

Uses openpyxl's `write_only` mode so we can stream row-by-row without
holding the whole workbook in memory. **The workbook is saved only at
part close** — openpyxl's write-only mode invalidates the worksheet
on save, so we cannot flush mid-write without breaking the append
chain. The orchestrator uses a row-count budget for XLSX rollover
(see `Exporter._maybe_rollover`), not byte size, because we cannot
measure byte size without saving.

The row budget is `0.9 × split_size_bytes ÷ initial_estimate_per_row`
(the PRD's "≈ 90 % of limit" target). After every close, the
orchestrator can update the estimate from the actual part size.

Note: `ws.append(row)` takes a single iterable of values per call —
calling it once per cell (one column at a time) exhausts openpyxl's
internal write generator on the second call.
"""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

from openpyxl import Workbook

# A reasonable starting estimate for a crawled row's XLSX size; gets
# updated by the orchestrator after each part closes.
_INITIAL_BYTES_PER_ROW = 1024


class XlsxWriter:
    def __init__(self) -> None:
        self._wb: Workbook | None = None
        self._ws = None
        self._fh = None
        self._bytes: int = 0
        self._rows_in_part: int = 0
        self._bytes_per_row: float = _INITIAL_BYTES_PER_ROW
        self._columns: list[str] = []

    @property
    def bytes_written(self) -> int:
        return self._bytes

    @property
    def rows_in_current_part(self) -> int:
        return self._rows_in_part

    @property
    def estimated_bytes_per_row(self) -> float:
        return self._bytes_per_row

    def set_estimated_bytes_per_row(self, value: float) -> None:
        """Allow the orchestrator to refine the row estimate after each
        part close. The XLSX file is only saved at close, so live
        size measurement is not possible — instead we use the
        just-finished part's actual size ÷ its row count."""
        self._bytes_per_row = max(value, 64)

    def open(self, path: Path, columns: Sequence[str]) -> None:
        self._columns = list(columns)
        self._wb = Workbook(write_only=True)
        self._ws = self._wb.create_sheet()
        # Header row — one append call per row, not per cell.
        self._ws.append(self._columns)
        self._fh = open(path, "wb")  # noqa: SIM115 — held open across many write_row calls
        self._bytes = 0
        self._rows_in_part = 0

    def write_row(self, row: dict[str, object]) -> None:
        if self._ws is None or self._fh is None:
            raise RuntimeError("XlsxWriter.open() must be called first")
        values = [row.get(col, "") for col in self._columns]
        self._ws.append(values)
        self._rows_in_part += 1

    def close(self) -> None:
        if self._wb is not None and self._fh is not None:
            self._wb.save(self._fh)
            self._fh.flush()
            self._bytes = self._fh.tell()
            self._fh.close()
        self._wb = None
        self._ws = None
        self._fh = None

    def reset_for_new_part(self) -> None:
        """Drop the in-memory workbook so a fresh `open()` can start clean."""
        self._wb = None
        self._ws = None
        self._fh = None
        self._bytes = 0
        self._rows_in_part = 0
        self._columns = []
