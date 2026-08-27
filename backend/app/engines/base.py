"""Engine adapter contract (PRD §7.1, AGENTS.md invariant #1).

Every engine module implements `CrawlEngine` and emits `CrawlRecord`s. The
service layer and the worker pool depend on these types only — never on a
concrete engine module. This isolation keeps the registry type-extensible
(Firecrawl deferred post-v1, see PRD §4.7) and makes contract tests
trivially fixture-driven.
"""

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


@runtime_checkable
class CrawlEngine(Protocol):
    """Adapter contract for any concrete engine implementation."""

    type: str
    capabilities: Capabilities

    def health(self) -> HealthReport: ...

    def fetch(self, target: Target, options: JobOptions) -> AsyncIterator[CrawlRecord]: ...
