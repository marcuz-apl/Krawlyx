"""Patchtroy adapter — standalone Patchtroy browser engine with Trafilatura extraction.

Wraps the standalone `patchtroy` package (pairing undetected headless Chromium via Patchright
with Trafilatura and schema graph extraction, context pooling, and fast HTTP fallback)
while maintaining Krawlyx's perimeter controls:
  - validates config through PatchtroyConfig
  - delegates browser lifecycle, stealth masking, and extraction to patchtroy.AsyncPatchtroy
  - applies the SSRF guard before touching the network (PRD §6.5)
  - applies per-host throttling (FR-SET-02) and identifiable User-Agent (NFR-05)
  - yields normalized CrawlRecord items (including structured data graphs)
"""

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
from app.engines.schemas import PatchtroyConfig
from app.engines.ssrf import resolve_safe

logger = logging.getLogger("mykrawl.engines.patchtroy")

ENGINE_TYPE = "patchtroy"

CAPABILITIES = Capabilities(
    deep_crawl=True,
    max_depth=5,
    max_pages_per_target=200,
    supports_render=True,
    supports_wait_for=True,
)


class PatchtroyEngine:
    """Concretely implements the CrawlEngine protocol using standalone Patchtroy."""

    type = ENGINE_TYPE
    capabilities = CAPABILITIES

    def __init__(self, config: dict | None = None) -> None:
        self.config = PatchtroyConfig.model_validate(config or {})
        self._last_fetch: dict[str, float] = {}

    def health(self) -> HealthReport:
        """Verify the official patchtroy library is available and operational."""
        try:
            import patchright  # noqa: F401
            import patchtroy  # noqa: F401
            import trafilatura  # noqa: F401
        except (ImportError, OSError):
            # Attempt automated installation from official repository if not present
            try:
                import subprocess
                import sys

                subprocess.run(
                    [
                        sys.executable,
                        "-m",
                        "pip",
                        "install",
                        "git+https://github.com/marcuz-apl/patchtroy.git",
                    ],
                    check=True,
                    capture_output=True,
                    timeout=120,
                )
                import patchtroy  # noqa: F401
            except Exception as install_exc:  # noqa: BLE001
                return HealthReport(
                    ok=False, detail=f"patchtroy dependencies not importable: {install_exc}"
                )

        return HealthReport(
            ok=True,
            detail=f"patchtroy ready via standalone library ({self.config.user_agent})",
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

        try:
            import patchtroy
        except (ImportError, OSError) as exc:
            logger.error("patchtroy import failed: %s", exc)
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                error=f"patchtroy import failed: {exc}",
            )
            return

        ua = self.config.user_agent or user_agent("patchtroy")

        # Map Krawlyx config to standalone patchtroy config
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
            crawler = patchtroy.AsyncPatchtroy(client_config)
            result = await crawler.scrape(
                url=target.url,
                wait_for=self.config.wait_for,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Patchtroy scrape exception (%s) for %s", exc, target.url)
            result = None

        if result is None or (not result.html and not result.success):
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                http_status=result.status_code if (result and result.status_code != 200) else 500,
                error=(result.error if result else None) or "patchtroy fetch returned empty body",
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

        links: list[dict[str, str]] = []
        if result.links:
            for item in result.links:
                if isinstance(item, dict):
                    links.append({"url": item.get("url", ""), "text": item.get("text", "")})
                elif hasattr(item, "url"):
                    links.append(
                        {"url": getattr(item, "url", ""), "text": getattr(item, "text", "")}
                    )

        rec = normalize_record(
            target_id=target.target_id,
            source_url=target.url,
            html=result.html or "",
            markdown=result.markdown,
            final_url=result.url or target.url,
            http_status=result.status_code or 200,
            links=links,
            options=options_dict,
        )
        rec.duration_ms = int((time.monotonic() - t0) * 1000)
        if result.title and not rec.title:
            rec.title = result.title

        # Preserve structured data graph extracted by standalone patchtroy
        if result.structured_data:
            rec.metadata["structured_data"] = result.structured_data

        yield rec


# Register the engine with the type-extensible registry.
from app.engines.registry import register_engine

register_engine(ENGINE_TYPE, CAPABILITIES)(PatchtroyEngine)

__all__ = ["PatchtroyEngine"]
