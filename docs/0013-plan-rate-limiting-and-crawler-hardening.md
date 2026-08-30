# Plan 03: Multi-Worker Rate Limiting & Crawl Engine Hardening

## 1. Goal & Requirements
Prevent anti-bot IP bans during multi-page crawls by introducing an optional randomized worker start gap (1–4 minutes), bounded execution timeouts (25s), and automatic high-speed HTTP fallback so crawling never hangs indefinitely.

---

## 2. Technical Architecture

### A. Worker Stagger Delay (`services/jobs.py`)
- In `_run_job`:
  - If `stagger_workers` is enabled in `job_options`:
    - Target 0 starts immediately (`delay = 0`).
    - Target $i \ge 1$ sleeps for a randomized interval between `stagger_min_seconds` (default 60s) and `stagger_max_seconds` (default 240s) before executing `_run_target`.
    - Handles cancellation interrupts cleanly during `asyncio.sleep`.

### B. Engine Execution Timeout & HTTP Fallback (`engines/crawl4ai_engine.py`)
- Wraps Playwright browser execution in a strict 25.0s `asyncio.wait_for(...)`.
- If browser execution times out, fails, or returns an empty HTML string:
  - Automatically triggers the high-speed `httpx` HTTP fallback with browser headers.
  - Fetches the raw HTML in < 1s, parses `__NEXT_DATA__` and Schema.org JSON-LD.

### C. Bulletproof State Machine
- `_run_target` guarantees target rows transition from `pending` / `fetching` to either `done` or `error`.
- `_mark_job_complete` sweeps any interrupted rows and marks them with the appropriate status.
- Real-time `⏹ Stop Crawl` cancels active jobs in the DB and stops all background workers immediately.

### D. SPA & AutoTrader URL Pagination
- Updated URL generator preserving critical query parameters (`size=20`, `search_id`, `sort=standard`, `atype=C`) while cleanly appending `page=1..N`.
