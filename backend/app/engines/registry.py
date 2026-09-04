"""Type-extensible engine registry (PRD §4.7, AGENTS.md invariant #1).

The registry is keyed by the same `type` strings the database CHECK-constraint
permits in the engines table. Adding a new engine = one entry here + one
module implementing the CrawlEngine protocol; the service layer never imports
concrete engine modules.
"""

from collections.abc import Callable

from app.engines.base import Capabilities, CrawlEngine

EngineFactory = Callable[[dict], CrawlEngine]

_REGISTRY: dict[str, EngineFactory] = {}
_CAPABILITIES: dict[str, Capabilities] = {}


def register_engine(
    type_id: str, capabilities: Capabilities
) -> Callable[[EngineFactory], EngineFactory]:
    """Class decorator / function decorator: @register_engine("playtrafi", Capabilities(...))"""

    def decorator(factory: EngineFactory) -> EngineFactory:
        if type_id in _REGISTRY:
            raise ValueError(f"engine type '{type_id}' is already registered")
        _REGISTRY[type_id] = factory
        _CAPABILITIES[type_id] = capabilities
        return factory

    return decorator


def available_types() -> list[str]:
    order = {"patroy": 0, "playtrafi": 1, "patchtroy": 2, "scrapy": 3}
    return sorted(_REGISTRY, key=lambda t: (order.get(t, 99), t))


def capabilities_for(type_id: str) -> Capabilities | None:
    return _CAPABILITIES.get(type_id)


def build(type_id: str, config: dict | None = None) -> CrawlEngine:
    if type_id not in _REGISTRY:
        raise KeyError(f"unknown engine type '{type_id}'; available: {available_types()}")
    return _REGISTRY[type_id](config or {})


# Default capabilities per engine type — these mirror PRD §7.2 and are loaded
# even if a concrete adapter is not yet implemented (e.g. the v1 Firecrawl
# deferral, PRD §4.7). The UI reads capabilities_for() to render form fields.
_DEFAULT_CAPABILITIES: dict[str, Capabilities] = {
    "patroy": Capabilities(
        deep_crawl=True,
        max_depth=5,
        max_pages_per_target=200,
        supports_wait_for=True,
        supports_render=True,
    ),
    "patchtroy": Capabilities(
        deep_crawl=True,
        max_depth=5,
        max_pages_per_target=200,
        supports_wait_for=True,
        supports_render=True,
    ),
    "playtrafi": Capabilities(
        deep_crawl=True,
        max_depth=5,
        max_pages_per_target=200,
        supports_wait_for=True,
        supports_render=True,
    ),
    "scrapy": Capabilities(deep_crawl=True, max_depth=10, max_pages_per_target=1000),
}
for _type_id, _caps in _DEFAULT_CAPABILITIES.items():
    _CAPABILITIES.setdefault(_type_id, _caps)
