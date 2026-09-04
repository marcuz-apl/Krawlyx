"""Patchtroy backward-compatibility adapter (aliased to PlaytrafiEngine)."""

from app.engines.base import Capabilities
from app.engines.playtrafi_engine import PlaytrafiEngine
from app.engines.registry import register_engine

ENGINE_TYPE = "patchtroy"

CAPABILITIES = Capabilities(
    deep_crawl=True,
    max_depth=5,
    max_pages_per_target=200,
    supports_render=True,
    supports_wait_for=True,
)


@register_engine(ENGINE_TYPE, CAPABILITIES)
class PatchtroyEngine(PlaytrafiEngine):
    """Backward-compatible subclass for legacy patchtroy engine configurations."""

    type = ENGINE_TYPE
    capabilities = CAPABILITIES
