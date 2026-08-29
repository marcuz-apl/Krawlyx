"""Scrapy adapter — runs the generic spider as a subprocess and streams JSONL back.

Per AGENTS.md invariant #2, Scrapy **must** run as a subprocess: Twisted's
reactor conflicts with the asyncio loop in the FastAPI process. The parent
shells out to `python -m app.engines.templates.zen_spider`, captures stdout
line by line, and converts each line to a normalized `CrawlRecord`.

The subprocess approach also gives us a hard memory cap and a clean crash
boundary: a runaway spider cannot take down the API.
"""

import asyncio
import json
import logging
import os
import sys
import time
from collections.abc import AsyncIterator
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
from app.engines.schemas import ScrapyConfig
from app.engines.ssrf import resolve_safe

logger = logging.getLogger("zencrawl.engines.scrapy")

ENGINE_TYPE = "scrapy"

CAPABILITIES = Capabilities(
    deep_crawl=True,
    max_depth=10,
    max_pages_per_target=1000,
)

TEMPLATE_PATH = Path(__file__).parent / "templates" / "zen_spider.py"

# Hard cap so a slow/dead subprocess cannot wedge a job forever.
SUBPROCESS_TIMEOUT_S = 600


class ScrapyEngine:
    """Concretely implements the CrawlEngine protocol for Scrapy."""

    type = ENGINE_TYPE
    capabilities = CAPABILITIES

    def __init__(self, config: dict | None = None) -> None:
        self.config = ScrapyConfig.model_validate(config or {})

    def health(self) -> HealthReport:
        # Scrapy is a pure-Python install; if we can import scrapy the binary
        # path is fine. The actual spider is shipped as part of this repo.
        try:
            import scrapy  # noqa: F401
        except ImportError as exc:
            return HealthReport(ok=False, detail=f"scrapy not importable: {exc}")
        if not TEMPLATE_PATH.is_file():
            return HealthReport(ok=False, detail=f"spider template missing: {TEMPLATE_PATH}")
        return HealthReport(ok=True, detail=f"scrapy ready ({self.config.user_agent})")

    async def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]:
        from app.core.config import get_settings

        cfg = get_settings()
        # SSRF guard first.
        try:
            resolve_safe(target, cfg)
        except ValueError as exc:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="skipped",
                error=str(exc),
            )
            return

        started = time.monotonic()  # noqa: F841 — kept for future duration tracking
        env = self._build_env(target, options, cfg)
        cmd = [sys.executable, "-u", str(TEMPLATE_PATH)]

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                env=env,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                limit=10 * 1024 * 1024,
            )
        except OSError as exc:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                error=f"failed to start scrapy: {exc}",
            )
            return

        try:
            async for line in proc.stdout:  # type: ignore[union-attr]
                line = line.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("scrapy emitted non-JSON: %s", line)
                    continue
                import dataclasses

                options_dict = {}
                if dataclasses.is_dataclass(options):
                    options_dict = dataclasses.asdict(options)
                elif hasattr(options, "model_dump"):
                    options_dict = options.model_dump()
                elif isinstance(options, dict):
                    options_dict = dict(options)

                yield normalize_record(
                    target_id=target.target_id,
                    source_url=item.get("source_url", target.url),
                    html=item.get("html"),
                    text=item.get("content_text"),
                    final_url=item.get("final_url"),
                    http_status=item.get("http_status"),
                    links=item.get("links"),
                    options=options_dict,
                )
        finally:
            try:
                await asyncio.wait_for(proc.wait(), timeout=SUBPROCESS_TIMEOUT_S)
            except TimeoutError:
                proc.kill()
                await proc.wait()
                yield CrawlRecord(
                    target_id=target.target_id,
                    source_url=target.url,
                    status="error",
                    error=f"scrapy timeout after {SUBPROCESS_TIMEOUT_S}s",
                )
            if proc.returncode not in (0, None):
                stderr = (await proc.stderr.read()).decode("utf-8", errors="replace")[:500]
                yield CrawlRecord(
                    target_id=target.target_id,
                    source_url=target.url,
                    status="error",
                    error=f"scrapy exited {proc.returncode}: {stderr.strip()}",
                )

    def _build_env(self, target: Target, options: JobOptions, cfg=None) -> dict[str, str]:
        """Construct the subprocess env, inheriting PATH so `python` works.

        M6: the per-domain interval is now sourced from
        `Settings.per_domain_interval_s` (FR-SET-02). The engine's
        own `download_delay_s` is the *minimum* between the two, so
        the admin's global setting doesn't get overridden by a
        looser engine config.
        """
        from app.core.config import get_settings

        cfg = cfg or get_settings()
        # FR-SET-02: take the larger of the two (admin floor wins).
        # This is "no faster than the admin asked" — the engine can
        # be slower but not faster.
        effective_delay = max(self.config.download_delay_s, float(cfg.per_domain_interval_s))
        env = {k: v for k, v in os.environ.items() if k != "ZENCRAWL_TARGET_URL"}
        backend_dir = str(Path(__file__).resolve().parents[2])
        pythonpath = os.environ.get("PYTHONPATH", "")
        env["PYTHONPATH"] = f"{backend_dir}{os.pathsep}{pythonpath}" if pythonpath else backend_dir
        env.update(
            {
                "ZENCRAWL_TARGET_URL": target.url,
                "ZENCRAWL_USER_AGENT": user_agent("scrapy"),
                "ZENCRAWL_CONCURRENCY": str(self.config.concurrency),
                "ZENCRAWL_DOWNLOAD_DELAY": str(effective_delay),
                "ZENCRAWL_AUTOTHROTTLE": "1" if self.config.autothrottle else "0",
                "ZENCRAWL_MAX_PAGES": str(
                    min(self.config.max_pages_per_target, options.max_pages_per_target)
                ),
                "ZENCRAWL_FOLLOW_LINKS": "1" if self.config.follow_links else "0",
                "PYTHONUNBUFFERED": "1",
                "PYTHONIOENCODING": "utf-8",
            }
        )
        return env


# Register the engine with the type-extensible registry.
from app.engines.registry import register_engine

register_engine(ENGINE_TYPE, CAPABILITIES)(ScrapyEngine)


__all__ = ["ScrapyEngine"]
