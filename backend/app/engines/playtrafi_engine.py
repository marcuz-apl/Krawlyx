"""Playtrafi adapter — standalone Playtrafi browser engine with Trafilatura extraction.

Wraps the standalone `playtrafi` package (pairing headless Chromium
with Trafilatura and schema graph extraction, context pooling, and fast HTTP fallback)
while maintaining Krawlyx's perimeter controls:
  - validates config through PlaytrafiConfig
  - delegates browser lifecycle, masking, and extraction to playtrafi.AsyncPlaytrafi
  - applies the SSRF guard before touching the network (PRD §6.5)
  - applies per-host throttling (FR-SET-02) and identifiable User-Agent (NFR-05)
  - yields normalized CrawlRecord items (including structured data graphs)
"""

from __future__ import annotations

import dataclasses
import logging
import re
import subprocess
import sys
import time
from collections.abc import AsyncIterator
from functools import lru_cache
from pathlib import Path

from app.engines.base import (
    Capabilities,
    CrawlRecord,
    HealthReport,
    JobOptions,
    Target,
    user_agent,
)
from app.engines.normalize import normalize_record
from app.engines.registry import register_engine
from app.engines.schemas import PlaytrafiConfig
from app.engines.ssrf import resolve_safe
from app.engines.throttle import wait_for_host

logger = logging.getLogger("mykrawl.engines.playtrafi")

ENGINE_TYPE = "playtrafi"

CAPABILITIES = Capabilities(
    deep_crawl=True,
    max_depth=5,
    max_pages_per_target=200,
    supports_render=True,
    supports_wait_for=True,
)


def _load_playtrafi_module():
    """Import official playtrafi library."""
    try:
        import playtrafi

        return playtrafi
    except ImportError:
        return None


def _get_crawler_instance(client_config: dict):
    mod = _load_playtrafi_module()
    if mod is None:
        raise ImportError("'playtrafi' package is not installed.")
    cls = getattr(mod, "AsyncPlaytrafi", None)
    if cls is None:
        raise AttributeError(f"Module {mod.__name__} has no AsyncPlaytrafi crawler class")
    return cls(client_config)


BROWSER_INSTALL_HINT = (
    "install it with `patchright install chromium` (or point "
    "PLAYWRIGHT_BROWSERS_PATH at an existing browser bundle)"
)


@lru_cache(maxsize=1)
def _patchright_browser_dirs() -> dict[str, Path]:
    """Map browser kind ('chromium' | 'chromium-headless-shell') to its install dir.

    Parsed from `python -m patchright install --dry-run chromium` so we depend
    on the CLI surface, not on patchright internals. Cached because the install
    layout cannot change while the server process is alive.
    """
    dirs: dict[str, Path] = {}
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "patchright", "install", "--dry-run", "chromium"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=60,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return dirs
    for block in (proc.stdout or "").split("\n\n"):
        match = re.search(r"Install location:\s*(.+)", block)
        if not match:
            continue
        path = Path(match.group(1).strip())
        key = "chromium-headless-shell" if "headless_shell" in path.name else "chromium"
        dirs[key] = path
    return dirs


def _dir_has_binary(root: Path, filename_prefix: str) -> bool:
    """True when `root` contains an executable-ish file named `filename_prefix*`."""
    if not root.is_dir():
        return False
    try:
        return any(
            entry.is_file() and entry.name.lower().startswith(filename_prefix)
            for entry in root.rglob("*")
        )
    except OSError:
        return False


def missing_browser_detail(headless: bool = True) -> str | None:
    """Reason why Patchright's Chromium cannot be launched, or None when it can.

    Importing `patchright` proves nothing: the Python package is tiny and the
    browser bundle is a separate download, so a host with the wheel but no
    browser reports healthy while *every* browser scrape fails silently and
    degrades to the library's bare-HTTP fallback. This check makes that state
    visible in `health()` and in the doctor report.
    """
    dirs = _patchright_browser_dirs()
    if not dirs:
        return None  # layout undeterminable — "unknown" is not "broken"
    # headless=True is served by chrome-headless-shell; headed needs full chromium.
    key, prefix = (
        ("chromium-headless-shell", "chrome-headless-shell") if headless else ("chromium", "chrome")
    )
    root = dirs.get(key)
    if root is None:
        return None
    if _dir_has_binary(root, prefix):
        return None
    return f"Chromium is missing at {root}; {BROWSER_INSTALL_HINT}"


def _coerce_links(raw: object) -> list[dict[str, str]] | None:
    """Coerce the library's `LinkItem` models to the contract's plain dicts.

    `CrawlRecord.links` is `list[dict[str, str]]` and lands in the
    `job_results.links_json` JSON column, so passing pydantic models through
    makes the insert fail with "Object of type LinkItem is not JSON
    serializable" — i.e. every *successful* scrape that found links was being
    written back as an error row.
    """
    if not raw:
        return None
    links: list[dict[str, str]] = []
    for item in raw:  # type: ignore[union-attr]
        if isinstance(item, dict):
            url = item.get("url") or item.get("href")
            text = item.get("text", "")
        else:
            url = getattr(item, "href", None) or getattr(item, "url", None)
            text = getattr(item, "text", "")
        if not url:
            continue
        links.append({"url": str(url), "text": str(text or "")})
    return links or None


@register_engine(ENGINE_TYPE, CAPABILITIES)
class PlaytrafiEngine:
    """Concretely implements the CrawlEngine protocol using standalone Playtrafi."""

    type = ENGINE_TYPE
    capabilities = CAPABILITIES

    def __init__(self, config: dict | None = None) -> None:
        self.config = PlaytrafiConfig.model_validate(config or {})

    def health(self) -> HealthReport:
        """Verify the official playtrafi library is available and operational."""
        try:
            import patchright  # noqa: F401
            import trafilatura  # noqa: F401

            mod = _load_playtrafi_module()
            if mod is None:
                raise ImportError("'playtrafi' package not found.")
        except (ImportError, OSError):
            # Attempt automated installation from PyPI if not present
            try:
                import subprocess
                import sys

                subprocess.run(
                    [
                        sys.executable,
                        "-m",
                        "pip",
                        "install",
                        "playtrafi>=0.6.0",
                    ],
                    check=True,
                    capture_output=True,
                    timeout=120,
                )
                mod = _load_playtrafi_module()
                if mod is None:
                    raise ImportError("Installation of playtrafi succeeded but import failed.")
            except Exception as install_exc:  # noqa: BLE001
                return HealthReport(
                    ok=False, detail=f"playtrafi dependencies not importable: {install_exc}"
                )

        pkg_name = mod.__name__
        pkg_version = getattr(mod, "__version__", "0.6.0")
        # NFR-03: report the browser state too — the wheel alone proves nothing.
        browser_issue = missing_browser_detail(self.config.headless)
        if browser_issue:
            return HealthReport(
                ok=False,
                detail=f"playtrafi v{pkg_version} imports OK but {browser_issue}",
            )
        return HealthReport(
            ok=True,
            detail=f"playtrafi v{pkg_version} ready via {pkg_name} ({self.config.user_agent})",
        )

    async def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]:
        from app.core.config import get_settings

        cfg = get_settings()

        # SSRF guard runs first, before the engine touches the network.
        try:
            host, _ = resolve_safe(target, cfg)
        except ValueError as exc:
            logger.warning("target rejected by SSRF guard: %s (%s)", target.url, exc)
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="blocked",
                error=f"SSRF guard: {exc}",
            )
            return

        # FR-SET-02: process-wide per-host pacing (see app/engines/throttle.py).
        await wait_for_host(host, cfg.per_domain_interval_s)

        t0 = time.monotonic()

        mod = _load_playtrafi_module()
        if mod is None:
            logger.error("playtrafi import failed")
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                error="playtrafi import failed",
            )
            return

        ua = self.config.user_agent or user_agent("playtrafi")

        # NFR-03: a broken browser is the difference between stealth rendering
        # and a bare httpx GET, but the library swallows the launch error and
        # silently falls back — say it out loud in the job log.
        browser_issue = missing_browser_detail(self.config.headless)
        if browser_issue:
            logger.warning(
                "Browser unavailable for %s — scraping degrades to the bare HTTP "
                "fallback (bot-protected sites will answer 403). %s",
                target.url,
                browser_issue,
            )

        # Map Krawlyx config to standalone playtrafi config
        client_config = {
            "headless": self.config.headless,
            "browser_timeout_s": min(self.config.browser_timeout_s, 60),
            "wait_for": self.config.wait_for,
            "user_agent": ua,
            "http_fallback": True,
            "extract_schema": True,
            "extract_links": True,
        }

        try:
            crawler = _get_crawler_instance(client_config)
            result = await crawler.scrape(
                url=target.url,
                wait_for=self.config.wait_for,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Playtrafi scrape exception (%s) for %s", exc, target.url)
            result = None

        if result is None:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                http_status=500,
                error="playtrafi fetch returned no result",
                duration_ms=int((time.monotonic() - t0) * 1000),
            )
            return

        raw_status = getattr(result, "status_code", None)
        http_status = raw_status if isinstance(raw_status, int) else None
        html = getattr(result, "html", None) or ""
        markdown = getattr(result, "markdown", None) or ""
        succeeded = bool(getattr(result, "success", False))

        # A bot-protection edge answers with a *page*, not an error: Cloudflare's
        # managed challenge is HTTP 403 with a few KB of challenge HTML and
        # `success=False`. The previous "no html and not success" test therefore
        # let it through and the challenge body was persisted as a successful
        # record (status='ok', http_status=403), which reads in the UI as a
        # silent fake success. Classify on the status code instead.
        if not succeeded or (http_status is not None and http_status >= 400):
            logger.warning(
                "playtrafi reported HTTP %s for %s (%s)",
                http_status,
                target.url,
                getattr(result, "error", None) or "no detail",
            )
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                http_status=http_status,
                error=getattr(result, "error", None) or f"target returned HTTP {http_status}",
                duration_ms=int((time.monotonic() - t0) * 1000),
            )
            return

        if not html and not markdown:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                http_status=http_status or 200,
                error="playtrafi fetch returned empty body",
                duration_ms=int((time.monotonic() - t0) * 1000),
            )
            return

        options_dict = {}
        if dataclasses.is_dataclass(options):
            options_dict = dataclasses.asdict(options)
        elif hasattr(options, "model_dump"):
            options_dict = options.model_dump()
        elif isinstance(options, dict):
            options_dict = dict(options)

        custom_schema = options_dict.get("custom_schema")

        record = normalize_record(
            target_id=target.target_id,
            source_url=target.url,
            html=getattr(result, "html", None),
            markdown=getattr(result, "markdown", None),
            final_url=getattr(result, "url", None) or target.url,
            http_status=http_status if http_status is not None else 200,
            duration_ms=int((time.monotonic() - t0) * 1000),
            engine_name=ENGINE_TYPE,
            links=_coerce_links(getattr(result, "links", None)),
            custom_schema=custom_schema,
            options=options_dict,
        )

        metadata_dict = record.metadata or {}
        extracted_data = getattr(result, "extracted_data", None)
        if extracted_data:
            metadata_dict["extracted_data"] = extracted_data
            if isinstance(extracted_data, dict):
                for k in ("schema_org", "products", "articles", "tables"):
                    if k in extracted_data:
                        metadata_dict[k] = extracted_data[k]
        record.metadata = metadata_dict

        yield record
