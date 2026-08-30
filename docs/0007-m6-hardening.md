# M6 Hardening — Implementation Notes

Version: `v1.1.6-2608291` through `v1.1.8-2608293`
Date: 2026-08-29

## 1. SSRF Allow-List (`FR-SET-03`)

- `backend/app/engines/ssrf.py`: `_matches_allow_list()` performs suffix matching (case-insensitive, strips trailing dots). When `ssrf_guard_enabled` is on and `ssrf_allow_list` is non-empty, only hosts matching an entry pass. Empty list = block-by-default (standard loopback/private/link-local/metadata ranges blocked).
- `backend/app/core/config.py`: `ssrf_allow_list: list[str]` parsed from comma-separated env string (`MYKRAWL_SSRF_ALLOW_LIST`).
- Tests: `tests/test_ssrf_allow_list.py` (new).

## 2. Per-Host Throttle (`FR-SET-02`)

- `crawl4ai_engine.py`: `time.monotonic()` throttle applied before fetch; `self._last_fetch` records last fetch per host.
- `scrapy_engine.py`: `effective_delay = max(config.download_delay_s, settings.per_domain_interval_s)` — admin floor wins (no faster than asked).

## 3. Per-Job Rotating Logs

- `backend/app/core/logging_config.py`: `job_log_handler(job_id)` creates `RotatingFileHandler` at `data/logs/jobs/{id}.log` (1 MB × 5 backups, UTF-8, `JobLogFilter` scrub).
- `backend/app/services/jobs.py`: `job_logger` (`mykrawl.jobs.{id}`) gets handler attached in `_run_job`, detached and closed in `finally`.
- `backend/app/api/jobs.py`: `GET /api/jobs/{id}/log` returns last `tail` lines (default 200, max 5000) as `text/plain`.
- Tests: `tests/test_per_job_log.py` (new).

## 4. Identifiable User-Agent (`NFR-05`)

- `backend/app/engines/base.py`: `user_agent(template)` builds `MyKrawl/0.1 (+{contact}) via {template}`. Empty contact degrades to `MyKrawl/0.1 via {template}`.
- Applied in both `crawl4ai_engine.py` (`user_agent("crawl4ai")`) and `scrapy_engine.py` (`user_agent("scrapy")`).
- Admin contact: `MYKRAWL_ADMIN_CONTACT_EMAIL` (new in `Settings`).

## 5. Security & Quality Pass

- `SSRF` guard default-on; `robots_txt_enabled` true; `content_size_cap_bytes` 5 MB.
- `doctor` command (`python -m app.core.doctor`) verifies: Python ≥3.11, SQLite, DB writable, log dir writable, engine registry, settings summary, admin bootstrap.
- Logging: idempotent `configure_logging()` (stdout + rotating file + secret scrubber); called once from FastAPI lifespan (`main.py`).

## 6. Export & Schema Changes

No new Pydantic schemas for M6; `settings` schema (`app/schemas/settings.py`) extended with `ssrf_allow_list` and `admin_contact_email`. `API /settings` returns both.

## 7. Testing Rules Applied

- No live network: `test_scrapy_engine.py` uses `sys.modules` monkeypatch for `scrapy` import; `test_per_job_log.py` uses fake engine (`_shadow_with_fake`).
- Requirement traceability: test names reference FR (e.g., `test_per_job_log_file_is_created_and_populated` relates to M6 logging).
- `.env.example` updated with M6 keys (`MYKRAWL_SSRF_ALLOW_LIST`, `MYKRAWL_ADMIN_CONTACT_EMAIL`).

## 8. Known Limitations / Deferred

- `Dockerfile`: deferred per PRD §4.7 / M6 scope (not required for v0.1 release).
- `docs/`: M6 docs present (`0001-nicegui-vs-flet.md`); no additional architecture decision records required.
- `test_scrapy_engine.py`: health/template tests monkeypatched (`sys.modules["scrapy"]`) because Scrapy is not installed in this test environment; this is environment-dependent, not a code defect.
