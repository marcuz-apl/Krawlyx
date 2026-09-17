"""Per-host request pacing (FR-SET-02).

The runner drives every target of a job through one shared engine instance, so
the per-domain interval has to be enforced by process-level state and has to
actually serialize concurrent callers. The previous per-instance timestamp
dict let a burst of workers through: several coroutines read "no previous
fetch" before any of them wrote, then all fired at once — the exact traffic
shape bot-protection edges (Cloudflare, Akamai) score as abuse.
"""

import asyncio
import time
from itertools import pairwise

from app.engines.throttle import wait_for_host


def test_concurrent_callers_are_spaced_by_the_interval() -> None:
    """FR-SET-02: four simultaneous workers on one host start an interval apart."""
    interval = 0.05
    stamps: list[float] = []

    async def worker() -> None:
        await wait_for_host("example.test", interval)
        stamps.append(time.monotonic())

    async def main() -> None:
        await asyncio.gather(*(worker() for _ in range(4)))

    asyncio.run(main())
    assert len(stamps) == 4
    ordered = sorted(stamps)
    gaps = [later - earlier for earlier, later in pairwise(ordered)]
    assert all(gap >= interval * 0.8 for gap in gaps), gaps


def test_zero_interval_is_a_no_op() -> None:
    """An admin can switch the gate off; five callers must not queue."""
    interval = 0.2

    async def main() -> float:
        started = time.monotonic()
        await asyncio.gather(*(wait_for_host("example.test", 0.0) for _ in range(5)))
        return time.monotonic() - started

    assert asyncio.run(main()) < interval


def test_unrelated_hosts_do_not_block_each_other() -> None:
    """Pacing is per host — two hosts must not serialize against each other."""
    interval = 0.2

    async def main() -> float:
        started = time.monotonic()
        await asyncio.gather(
            wait_for_host("a.test", interval),
            wait_for_host("b.test", interval),
        )
        return time.monotonic() - started

    assert asyncio.run(main()) < interval


def test_state_does_not_leak_across_event_loops() -> None:
    """A second `asyncio.run()` (fresh loop) must not inherit a stale gate."""
    interval = 0.2

    async def one_request() -> float:
        started = time.monotonic()
        await wait_for_host("example.test", interval)
        return time.monotonic() - started

    assert asyncio.run(one_request()) < interval  # first call: never waits
    assert asyncio.run(one_request()) < interval  # new loop: still no stale wait
