"""Process-wide per-host request pacing (FR-SET-02).

Engines that talk to the network call `wait_for_host()` immediately before
issuing a request. The gate deliberately lives here rather than on the engine
instance, because the runner drives `max_parallel_targets_per_job` targets
concurrently through a *shared* engine object:

  - A per-instance `dict` of timestamps is raced. Several coroutines read
    "no previous fetch" before any of them writes, then all fire at once —
    exactly the burst the per-domain interval exists to prevent, and the
    pattern bot-protection edges (Cloudflare, Akamai) score as abuse.
  - State is keyed by the running event loop, so tests that call
    `asyncio.run()` repeatedly (a fresh loop each time) never inherit locks
    bound to a closed loop.

The sleep happens while holding the per-host lock on purpose: consecutive
requests to one host are strictly serialized, while unrelated hosts stay free
to run in parallel.
"""

from __future__ import annotations

import asyncio
import time
import weakref
from dataclasses import dataclass, field


@dataclass
class _LoopState:
    """Per-event-loop pacing state: last request time and gate per host."""

    last_fetch: dict[str, float] = field(default_factory=dict)
    locks: dict[str, asyncio.Lock] = field(default_factory=dict)


_STATES: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, _LoopState] = (
    weakref.WeakKeyDictionary()
)


def _state_for_running_loop() -> _LoopState:
    loop = asyncio.get_running_loop()
    state = _STATES.get(loop)
    if state is None:
        state = _LoopState()
        _STATES[loop] = state
    return state


async def wait_for_host(host: str, interval_s: float) -> None:
    """Block until `interval_s` has elapsed since the last request to `host`.

    A non-positive interval disables pacing. Concurrent callers for the same
    host queue behind a per-host lock and are therefore spaced out; callers
    for different hosts are unaffected.
    """
    if not host or interval_s <= 0:
        return
    state = _state_for_running_loop()
    lock = state.locks.get(host)
    if lock is None:
        lock = state.locks.setdefault(host, asyncio.Lock())
    async with lock:
        last = state.last_fetch.get(host)
        if last is not None:
            remaining = interval_s - (time.monotonic() - last)
            if remaining > 0:
                await asyncio.sleep(remaining)
        state.last_fetch[host] = time.monotonic()


def reset_pacing() -> None:
    """Drop the current loop's pacing state (test helper)."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    _STATES.pop(loop, None)
