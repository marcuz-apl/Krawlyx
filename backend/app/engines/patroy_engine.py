"""Patroy adapter — high-speed Go-Rod & stealth engine (PRD §4.7, §6.1).

Integrates the standalone `patroy` (Go) engine into Krawlyx.
Patroy provides sub-50ms cold start times, low memory overhead (<50MB RAM),
and undetected stealth browsing via Go-Rod + Stealth.

The adapter:
  - validates config through PatroyConfig
  - supports both CLI execution (`patroy scrape <url> -o json`) and local daemon mode
  - applies the SSRF guard before touching the network (PRD §6.5)
  - applies per-host throttling (FR-SET-02) and identifiable User-Agent
  - normalizes output into CrawlRecord items
"""

import asyncio
import dataclasses
import json
import logging
import os
from pathlib import Path
import shutil
import sys
import time
from collections.abc import AsyncIterator
from typing import Any

import httpx

from app.engines.base import (
    Capabilities,
    CrawlRecord,
    HealthReport,
    JobOptions,
    Target,
    user_agent,
)
from app.engines.normalize import normalize_record
from app.engines.schemas import PatroyConfig
from app.engines.ssrf import resolve_safe

logger = logging.getLogger("mykrawl.engines.patroy")

ENGINE_TYPE = "patroy"

CAPABILITIES = Capabilities(
    deep_crawl=True,
    max_depth=5,
    max_pages_per_target=200,
    supports_render=True,
    supports_wait_for=True,
)


class PatroyEngine:
    """Concretely implements the CrawlEngine protocol for the Patroy Go engine."""

    type = ENGINE_TYPE
    capabilities = CAPABILITIES

    def __init__(self, config: dict | None = None) -> None:
        self.config = PatroyConfig.model_validate(config or {})
        self._last_fetch: dict[str, float] = {}

    def _get_binary_path(self, auto_download: bool = True) -> str | None:
        from app.engines.patroy_installer import find_or_install_patroy

        configured = self.config.binary_path
        if configured not in {"patroy", "patroy.exe"}:
            found = shutil.which(configured)
            if found:
                return found
            target = Path(configured)
            if target.is_file() and os.access(target, os.X_OK):
                return str(target)
            return None

        return find_or_install_patroy(configured_path=configured, auto_download=auto_download)

    def health(self) -> HealthReport:
        """Verify Patroy binary is found in PATH or daemon endpoint is reachable."""
        if self.config.mode == "daemon":
            try:
                with httpx.Client(timeout=3.0) as client:
                    resp = client.get(f"{self.config.daemon_url.rstrip('/')}/health")
                    if resp.status_code < 400:
                        return HealthReport(
                            ok=True,
                            detail=f"patroy daemon ready at {self.config.daemon_url}",
                        )
                    return HealthReport(
                        ok=False,
                        detail=f"patroy daemon returned HTTP {resp.status_code}",
                    )
            except Exception as exc:  # noqa: BLE001
                return HealthReport(
                    ok=False,
                    detail=f"patroy daemon unreachable at {self.config.daemon_url}: {exc}",
                )

        # CLI mode
        resolved = self._get_binary_path()
        if not resolved:
            return HealthReport(
                ok=False,
                detail=f"patroy binary '{self.config.binary_path}' not found in PATH",
            )
        return HealthReport(
            ok=True,
            detail=f"patroy CLI ready ({resolved})",
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
        ua = self.config.user_agent or user_agent("patroy")

        data: dict[str, Any] = {}
        error_msg: str | None = None

        if self.config.mode == "daemon":
            data, error_msg = await self._fetch_via_daemon(target.url, ua)
        else:
            data, error_msg = await self._fetch_via_cli(target.url, ua)

        if error_msg or not data:
            yield CrawlRecord(
                target_id=target.target_id,
                source_url=target.url,
                status="error",
                http_status=data.get("status_code", 500) if data else 500,
                error=error_msg or "patroy returned empty payload",
                duration_ms=int((time.monotonic() - t0) * 1000),
            )
            return

        html = data.get("raw_html") or data.get("clean_html") or data.get("html") or ""
        markdown = data.get("markdown")
        if html and not markdown:
            try:
                import trafilatura

                markdown = trafilatura.extract(html, output_format="markdown", include_links=True)
            except Exception as traf_exc:  # noqa: BLE001
                logger.debug("Trafilatura fallback extraction failed: %s", traf_exc)

        title = data.get("title", "")
        if html and not title:
            try:
                from bs4 import BeautifulSoup

                soup = BeautifulSoup(html[:50000], "html.parser")
                if soup.title and soup.title.string:
                    title = soup.title.string.strip()
            except Exception:  # noqa: BLE001, S110
                pass

        links: list[dict[str, str]] = []
        raw_links = data.get("links", [])
        if isinstance(raw_links, list):
            for item in raw_links:
                if isinstance(item, dict) and item.get("url"):
                    links.append({"url": str(item["url"]), "text": str(item.get("text", ""))})
                elif isinstance(item, str):
                    links.append({"url": item, "text": ""})

        options_dict = {}
        if dataclasses.is_dataclass(options):
            options_dict = dataclasses.asdict(options)
        elif hasattr(options, "model_dump"):
            options_dict = options.model_dump()
        elif isinstance(options, dict):
            options_dict = dict(options)

        rec = normalize_record(
            target_id=target.target_id,
            source_url=target.url,
            html=html,
            markdown=markdown,
            final_url=data.get("url") or target.url,
            http_status=int(data.get("status_code", 200)),
            links=links or None,
            options=options_dict,
        )
        rec.duration_ms = int((time.monotonic() - t0) * 1000)
        if title and not rec.title:
            rec.title = title

        if "structured_data" in data and isinstance(data["structured_data"], dict):
            rec.metadata["structured_data"] = data["structured_data"]

        if "csv" in data and data["csv"]:
            rec.metadata["patroy_csv"] = data["csv"]

        yield rec

    async def _fetch_via_cli(self, url: str, ua: str) -> tuple[dict[str, Any], str | None]:
        bin_path = self._get_binary_path()
        if not bin_path:
            return {}, f"patroy binary '{self.config.binary_path}' not found in PATH"

        cmd = [
            bin_path,
            url,
            "-f",
            "json",
            "--silent",
        ]
        if self.config.wait_for:
            cmd.extend(["--wait-for", self.config.wait_for])
        if self.config.timeout_s:
            cmd.extend(["--timeout", f"{int(self.config.timeout_s)}s"])

        timeout = min(self.config.timeout_s, 120)
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except FileNotFoundError:
            return {}, f"patroy binary '{self.config.binary_path}' not found in PATH"
        except TimeoutError:
            try:
                proc.kill()
            except Exception:  # noqa: BLE001, S110
                pass
            return {}, f"patroy process timed out after {timeout}s"
        except Exception as exc:  # noqa: BLE001
            return {}, f"patroy execution failed: {exc}"

        if proc.returncode != 0:
            err_text = stderr.decode("utf-8", errors="replace").strip()
            return {}, f"patroy exited with code {proc.returncode}: {err_text}"

        raw = stdout.decode("utf-8", errors="replace").strip()
        if not raw:
            return {}, "patroy returned empty stdout"

        try:
            data = json.loads(raw)
            if not isinstance(data, dict):
                return {}, "patroy output is not a valid JSON object"
            return data, None
        except json.JSONDecodeError as exc:
            return {}, f"failed to parse patroy JSON output: {exc}"

    async def _fetch_via_daemon(self, url: str, ua: str) -> tuple[dict[str, Any], str | None]:
        endpoint = f"{self.config.daemon_url.rstrip('/')}/scrape"
        payload = {
            "url": url,
            "user_agent": ua,
            "wait_for": self.config.wait_for,
            "timeout_s": self.config.timeout_s,
        }
        try:
            async with httpx.AsyncClient(timeout=float(self.config.timeout_s)) as client:
                resp = await client.post(endpoint, json=payload)
                if resp.status_code >= 400:
                    return {}, f"patroy daemon returned HTTP {resp.status_code}: {resp.text}"
                return resp.json(), None
        except Exception as exc:  # noqa: BLE001
            return {}, f"patroy daemon request failed: {exc}"


# Register the engine with the type-extensible registry.
from app.engines.registry import register_engine

register_engine(ENGINE_TYPE, CAPABILITIES)(PatroyEngine)

__all__ = ["PatroyEngine"]
