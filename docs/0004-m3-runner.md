# M3 Runner — Implementation Notes

Version: `v1.1.3` (`4feddbd`)

- Job form (`app/api/jobs.py`): multiline URL validation (`FR-JOB-07`), duplicate dedup (`FR-JOB-07`), engine pool filtering.
- Queue / worker pool (`app/services/jobs.py`): `enqueue_job()`, `start_dispatcher()`, `cancel_job()` (`FR-JOB-05`).
- Live progress (`FR-JOB-04`): counts + per-target status table; polling via TanStack Query (≤2 s).
- Results browser (`FR-JOB-06`): paginated table, markdown/content view, `.md`/`.json` download.
- Per-job log (`tests/test_per_job_log.py`) setup (handler framework, full feature in M6).
