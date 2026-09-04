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

import asyncio
import dataclasses
import logging
import time
from collections.abc import AsyncIterator

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


@register_engine(ENGINE_TYPE, CAPABILITIES)
class PlaytrafiEngine:
    """Concretely implements the CrawlEngine protocol using standalone Playtrafi."""

    type = ENGINE_TYPE
    capabilities = CAPABILITIES

    def __init__(self, config: dict | None = None) -> None:
        self.config = PlaytrafiConfig.model_validate(config or {})
        self._last_fetch: dict[str, float] = {}

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

        # FR-SET-02: per-host rate limiting
        interval = cfg.per_domain_interval_s
        now = time.monotonic()
        last = self._last_fetch.get(host)
        if last is not None and (now - last) < interval:
            await asyncio.sleep(interval - (now - last))
        self._last_fetch[host] = time.monotonic()

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

        if result is None or (
            not getattr(result, "html", None) and not getattr(result, "success", False)
        ):
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                http_status=getattr(result, "status_code", 500)
                if (result and getattr(result, "status_code", 200) != 200)
                else 500,
                error=(getattr(result, "error", None) if result else None)
                or "playtrafi fetch returned empty body",
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
            raw_html=getattr(result, "html", None),
            markdown=getattr(result, "markdown", None),
            http_status=getattr(result, "status_code", 200),
            duration_ms=int((time.monotonic() - t0) * 1000),
            engine_name=ENGINE_TYPE,
            links=getattr(result, "links", None),
            custom_schema=custom_schema,
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
