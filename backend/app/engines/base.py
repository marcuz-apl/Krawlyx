"""Engine adapter contract (PRD §7.1, AGENTS.md invariant #1).

Every engine module implements `CrawlEngine` and emits `CrawlRecord`s. The
service layer and the worker pool depend on these types only — never on a
concrete engine module. This isolation keeps the registry type-extensible
(Firecrawl deferred post-v1, see PRD §4.7) and makes contract tests
trivially fixture-driven.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class Capabilities:
    """What a particular engine can do — drives the UI form (PRD §6.2)."""

    deep_crawl: bool = False
    max_depth: int = 0
    max_pages_per_target: int = 1
    supports_wait_for: bool = False
    supports_render: bool = False


def user_agent(template: str | None = None) -> str:
    """Build the identifiable User-Agent (NFR-05).

    `template` is the engine's per-adapter UA prefix (e.g. ``"patchtroy"``).
    The admin contact from ``Settings.admin_contact_email`` is appended
    when set, e.g. ``"MyKrawl/0.1 (+ops@example.com) via patchtroy"``.
    An empty contact degrades to ``"MyKrawl/0.1 via patchtroy"``.
    """
    from app.core.config import get_settings

    contact = get_settings().admin_contact_email.strip()
    base = "MyKrawl/0.1"
    if contact:
        base = f"{base} (+{contact})"
    if template:
        base = f"{base} via {template}"
    return base


@dataclass
class CrawlRecord:
    """Normalized record written to job_results and exported to files (PRD §7.1)."""

    target_id: str
    source_url: str
    final_url: str | None = None
    status: str = "ok"  # ok | error | skipped
    http_status: int | None = None
    title: str | None = None
    content_markdown: str | None = None
    content_text: str | None = None
    links: list[dict[str, str]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    duration_ms: int = 0


@dataclass
class HealthReport:
    ok: bool
    detail: str
    latency_ms: int = 0


@dataclass
class Target:
    """One URL selected by the runner, addressed to a job."""

    target_id: str
    url: str


@dataclass
class JobOptions:
    """Per-job options the engine can interpret; validated against capabilities."""

    follow_links: bool = False
    max_depth: int = 1
    max_pages_per_target: int = 1
    custom_schema: dict[str, Any] | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> JobOptions:
        if not data:
            return cls()
        known = {"follow_links", "max_depth", "max_pages_per_target", "custom_schema"}
        kwargs = {k: v for k, v in data.items() if k in known}
        extra = {k: v for k, v in data.items() if k not in known}
        return cls(**kwargs, extra=extra)


@runtime_checkable
class CrawlEngine(Protocol):
    """Adapter contract for any concrete engine implementation."""

    type: str
    capabilities: Capabilities

    def health(self) -> HealthReport: ...

    def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]: ...
