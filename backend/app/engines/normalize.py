"""Cross-engine normalization helpers (PRD §7.1).

Each concrete engine produces records in a slightly different shape. The
service layer that runs jobs and writes to `job_results` and the export
pipeline must not care which engine produced the data. `normalize_record`
takes the engine-specific output and re-keys it to the canonical record.

The pure function here is also the right place to clamp values to the
size cap (FR-SET-04) and to drop content that fails validation.
"""

from collections.abc import Iterable
from html.parser import HTMLParser
from typing import Any

from app.engines.base import CrawlRecord


def _strip_tags(html: str) -> str:
    """Reduce HTML to text-only (no markdown, no links)."""
    if not html:
        return ""
    out: list[str] = []
    skip_depth = 0

    class _Parser(HTMLParser):
        def handle_starttag(self, tag, attrs):
            nonlocal skip_depth
            if tag in ("script", "style", "noscript"):
                skip_depth += 1

        def handle_endtag(self, tag):
            nonlocal skip_depth
            if tag in ("script", "style", "noscript") and skip_depth > 0:
                skip_depth -= 1

        def handle_data(self, data):
            if skip_depth == 0:
                out.append(data)

    _Parser().feed(html)
    text = " ".join("".join(out).split())
    return text


def _extract_title(html: str) -> str | None:
    if not html:
        return None
    out: list[str] = []

    class _TitleParser(HTMLParser):
        def __init__(self) -> None:
            super().__init__()
            self._in = False

        def handle_starttag(self, tag, attrs):
            if tag.lower() == "title":
                self._in = True

        def handle_endtag(self, tag):
            if tag.lower() == "title":
                self._in = False

        def handle_data(self, data):
            if self._in:
                out.append(data)

    _TitleParser().feed(html)
    text = "".join(out).strip()
    return text or None


def _extract_links(html: str, source_url: str) -> list[dict[str, str]]:
    """Best-effort link extraction — both engines surface this, the contract
    is that the link set is non-empty when the fixture contains anchors."""
    if not html:
        return []
    links: list[dict[str, str]] = []
    current: dict[str, str] | None = None

    class _LinkParser(HTMLParser):
        def handle_starttag(self, tag, attrs):
            nonlocal current
            if tag.lower() == "a":
                href = dict(attrs).get("href", "").strip()
                if href:
                    current = {"url": href, "text": ""}

        def handle_endtag(self, tag):
            nonlocal current
            if tag.lower() == "a" and current is not None:
                links.append(current)
                current = None

        def handle_data(self, data):
            if current is not None:
                current["text"] += data

    _LinkParser().feed(html)
    return links


def clamp_text(value: str | None, max_bytes: int) -> str | None:
    """Cap content at max_bytes to protect the DB (FR-SET-04 default 5MB)."""
    if value is None:
        return None
    data = value.encode("utf-8")
    if len(data) <= max_bytes:
        return value
    return data[:max_bytes].decode("utf-8", errors="ignore")


def normalize_record(
    target_id: str,
    source_url: str,
    *,
    html: str | None = None,
    text: str | None = None,
    markdown: str | None = None,
    final_url: str | None = None,
    http_status: int | None = None,
    links: list[dict[str, str]] | None = None,
    metadata: dict[str, Any] | None = None,
    options: dict[str, Any] | None = None,
    content_size_cap: int = 5 * 1024 * 1024,
) -> CrawlRecord:
    """Re-key engine-specific output to the canonical record (PRD §7.1)."""
    if html is None and text is None and markdown is None:
        raise ValueError("normalize_record requires either html or text")
    title = _extract_title(html) if html is not None else None
    content_text = (text if text is not None else _strip_tags(html or "")) or ""
    content_md = markdown if markdown is not None else content_text
    if links is None and html is not None:
        links = _extract_links(html, source_url)

    meta = dict(metadata or {})
    meta.setdefault("engine", "normalized")

    # Extract structured dataset items if HTML is available
    if html:
        try:
            from app.engines.extractors import extract_structured_data

            items = extract_structured_data(html, source_url, options)
            if items:
                meta["items"] = items
                meta["item_count"] = len(items)
                meta["schema"] = items[0].get("type", "dataset")
        except Exception:
            pass

    return CrawlRecord(
        target_id=target_id,
        source_url=source_url,
        final_url=final_url or source_url,
        status="ok",
        http_status=http_status,
        title=title,
        content_markdown=clamp_text(content_md, content_size_cap),
        content_text=clamp_text(content_text, content_size_cap),
        links=list(links or []),
        metadata=meta,
    )


def normalize_many(records: Iterable[dict[str, Any]]) -> list[CrawlRecord]:
    """Adapter-friendly entry point: each dict carries the engine-specific
    payload already extracted by the concrete adapter (HTML/text/links)."""
    out: list[CrawlRecord] = []
    for raw in records:
        out.append(
            normalize_record(
                target_id=raw["target_id"],
                source_url=raw["source_url"],
                html=raw.get("html"),
                text=raw.get("text"),
                final_url=raw.get("final_url"),
                http_status=raw.get("http_status"),
                links=raw.get("links"),
            )
        )
    return out
