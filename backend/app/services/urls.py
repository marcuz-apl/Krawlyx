"""URL parsing + dedup for the runner form (PRD §6.2 FR-JOB-01, FR-JOB-07).

Pure functions; no DB or asyncio. The runner form sends a multiline textarea
which this module splits, validates, and deduplicates before the service
layer writes a `targets` row per accepted URL.

The validator accepts internal IPs at submit time — the engine's
`ssrf.resolve_safe` is the enforcement point so admins can disable the
guard for intranet crawling (PRD §6.5 FR-SET-03). Submit-time rejection
would be a worse UX for that use case.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from urllib.parse import urlsplit


@dataclass(frozen=True)
class UrlError:
    line: int
    text: str
    reason: str


@dataclass(frozen=True)
class UrlParseResult:
    urls: list[str]
    duplicates: list[tuple[int, str]]
    errors: list[UrlError]

    @property
    def accepted(self) -> int:
        return len(self.urls)


def _normalize_for_dedup(url: str) -> str:
    """Lowercase scheme + host, keep path/query verbatim. Used to detect dupes."""
    parts = urlsplit(url)
    query_str = f"?{parts.query}" if parts.query else ""
    return f"{parts.scheme.lower()}://{parts.netloc.lower()}{parts.path}{query_str}"


def parse(lines: Iterable[str]) -> UrlParseResult:
    """Validate, dedup, and bucket URL lines from the runner form.

    Each line is validated against the rules:
      - non-empty after stripping
      - scheme ∈ {http, https}
      - non-empty host

    Valid lines are normalized for dedup; the first occurrence wins. The
    original (preserved-case) string is what gets written to the `targets`
    table so the user sees what they typed.
    """
    urls: list[str] = []
    seen: set[str] = set()
    duplicates: list[tuple[int, str]] = []
    errors: list[UrlError] = []

    for line_no, raw in enumerate(lines, start=1):
        text = raw.strip()
        if not text:
            errors.append(UrlError(line=line_no, text=raw, reason="empty"))
            continue

        parts = urlsplit(text)
        if not parts.scheme:
            errors.append(UrlError(line=line_no, text=text, reason="missing scheme"))
            continue
        if parts.scheme.lower() not in {"http", "https"}:
            errors.append(UrlError(line=line_no, text=text, reason="scheme not http(s)"))
            continue
        if not parts.netloc:
            errors.append(UrlError(line=line_no, text=text, reason="no host"))
            continue

        key = _normalize_for_dedup(text)
        if key in seen:
            duplicates.append((line_no, text))
            continue
        seen.add(key)
        urls.append(text)

    return UrlParseResult(urls=urls, duplicates=duplicates, errors=errors)
