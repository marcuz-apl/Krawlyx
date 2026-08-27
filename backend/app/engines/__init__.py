"""Crawl engine adapters — all engines implement the Protocol in base.py.

Importing this package registers every concrete engine with the type-extensible
registry. Application code should `from app.engines import registry` (or any
submodule) — never import a concrete engine module directly, per AGENTS.md
invariant #1.

Concrete engine modules register themselves on import via the
`@register_engine` decorator. We discover them here so the registry is fully
populated the moment anything imports this package.
"""

import importlib
import pkgutil

from app.engines import normalize, registry, schemas, ssrf
from app.engines.base import (
    Capabilities,
    CrawlEngine,
    CrawlRecord,
    HealthReport,
    JobOptions,
    Target,
)


def _load_concrete_engines() -> None:
    """Import every `app.engines.*_engine` module to trigger its registration."""
    import app.engines as _pkg

    for mod_info in pkgutil.iter_modules(_pkg.__path__):
        name = mod_info.name
        if name == "_adapters" or not name.endswith("_engine"):
            continue
        importlib.import_module(f"app.engines.{name}")


_load_concrete_engines()


__all__ = [
    "Capabilities",
    "CrawlEngine",
    "CrawlRecord",
    "HealthReport",
    "JobOptions",
    "Target",
    "normalize",
    "registry",
    "schemas",
    "ssrf",
]
