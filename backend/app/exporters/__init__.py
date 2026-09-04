"""Streaming export writers and the Exporter orchestrator (PRD §6.4).

Two file formats: CSV (FR-EXP-05) and XLSX (FR-EXP-06). Both writers
implement the same `ExportWriter` protocol so the orchestrator can swap
them transparently. Manifests live next to the parts (FR-EXP-07) and
are written incrementally so a crash mid-job leaves a valid partial
manifest (FR-EXP-04).

The orchestrator (`Exporter`) is the only entry point used by the job
worker. The worker never imports a writer directly.
"""

from app.exporters.exporter import Exporter, normalize_target_path

__all__ = ["Exporter", "normalize_target_path"]
