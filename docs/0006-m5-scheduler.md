# M5 Scheduler + Admin — Implementation Notes

Version: `v1.1.5` (`675a220`)

- APScheduler (`AsyncIOScheduler`) in-process (`app/services/scheduler.py`): cron schedules (`FR-SCH-01`), timezone, enabled flag.
- Schedule UI: human-readable preview (`FR-SCH-02`), next 3 run times; run history (`FR-SCH-04`).
- Overlapping run prevention (`FR-SCH-03`): previous run must finish before new spawn.
- Admin panel: engine instance CRUD (`FR-ENG-01..06`), settings (`FR-SET-02..04`), users.
- Engine pool toggle (`FR-ENG-04`): disabled instances finish running but reject new jobs.
- Global settings (`ZENCRAWL_ROBOTS_TXT_ENABLED`, `PER_DOMAIN_INTERVAL_S`, `SSRF_GUARD_ENABLED`, `CONTENT_SIZE_CAP_BYTES`) consumed by M6 adapters.
