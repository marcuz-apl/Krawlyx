# M4 Export — Implementation Notes

Version: `v1.1.4` (`845edfa`)

- Export targets (`app/exporters/`): CSV (`csv_writer.py`) and XLSX (`xlsx_writer.py`) streaming writers.
- Size-based splitting (`FR-EXP-05`, `FR-EXP-06`): CSV splits at byte limit; XLSX uses adaptive row budget (90% clamp).
- Manifest file (`manifest.json`) tracks parts + sizes.
- Folder mode (`mode=folder`) writes to admin-defined `path`; `database` mode stays SQLite-only.
- Tests (`tests/test_exporters.py`): rollover at boundary, header repetition, manifest correctness.
