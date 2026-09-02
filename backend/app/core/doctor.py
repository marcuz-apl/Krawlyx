"""Environment diagnostic for self-hosters (`python -m app.core.doctor`).

Runs a short list of read-only checks and prints a one-screen report.
Exits 0 when everything passes, 1 otherwise. The check list is
intentionally small — this is a quality-of-life tool, not a
monitoring system.
"""

from __future__ import annotations

import importlib
import sys
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings


@dataclass
class Check:
    name: str
    ok: bool
    detail: str


def _check_python() -> Check:
    v = sys.version_info
    ok = (v.major, v.minor) >= (3, 11)
    return Check(
        name="Python >= 3.11",
        ok=ok,
        detail=f"running {v.major}.{v.minor}.{v.micro}",
    )


def _check_sqlite() -> Check:
    import sqlite3

    v = sqlite3.sqlite_version
    return Check(
        name="SQLite available",
        ok=True,
        detail=f"version {v}",
    )


def _check_db_path() -> Check:
    s = get_settings()
    p: Path = s.db_path
    parent = p.parent
    parent_ok = parent.is_dir() or _try_mkdir(parent)
    if not parent_ok:
        return Check(
            name=f"DB path writable ({p})",
            ok=False,
            detail=f"parent {parent} not creatable",
        )
    try:
        # Touch the file if missing.
        if not p.exists():
            p.touch()
        # Check writability by appending a byte and reading it back.
        with p.open("ab") as f:
            f.write(b"")
        with p.open("rb") as f:
            f.read()
        return Check(name=f"DB path writable ({p})", ok=True, detail="ok")
    except OSError as exc:
        return Check(name=f"DB path writable ({p})", ok=False, detail=str(exc))


def _try_mkdir(p: Path) -> bool:
    try:
        p.mkdir(parents=True, exist_ok=True)
        return True
    except OSError:
        return False


def _check_log_dir() -> Check:
    log_dir = get_settings().db_path.parent / "logs"
    if not log_dir.exists():
        _try_mkdir(log_dir)
    writable = log_dir.is_dir() and _try_write(log_dir / ".doctor-probe")
    if writable:
        try:
            (log_dir / ".doctor-probe").unlink()
        except OSError:
            pass
    return Check(
        name=f"Log dir writable ({log_dir})",
        ok=bool(writable),
        detail="ok" if writable else "cannot write",
    )


def _try_write(p: Path) -> bool:
    try:
        p.write_text("ok", encoding="utf-8")
        return True
    except OSError:
        return False


def _check_engines() -> Check:
    from app.engines import registry

    types = registry.available_types()
    if not types:
        return Check(name="Engine registry", ok=False, detail="no engines registered")
    details: list[str] = []
    all_ok = True
    for t in types:
        try:
            importlib.import_module(f"app.engines.{t}_engine")
            details.append(f"{t} ok")
        except Exception as exc:  # noqa: BLE001
            details.append(f"{t} FAILED: {exc}")
            all_ok = False
    return Check(
        name="Engine registry",
        ok=all_ok,
        detail="; ".join(details),
    )


def _check_settings_summary() -> Check:
    s = get_settings()
    return Check(
        name="Settings",
        ok=True,
        detail=(
            f"max_jobs={s.max_concurrent_jobs} "
            f"max_parallel={s.max_parallel_targets_per_job} "
            f"robots={'on' if s.robots_txt_enabled else 'off'} "
            f"ssrf={'on' if s.ssrf_guard_enabled else 'off'} "
            f"interval={s.per_domain_interval_s}s "
            f"cap={s.content_size_cap_bytes}B "
            f"ssrf_allow_list={s.ssrf_allow_list!r} "
            f"contact={s.admin_contact_email!r}"
        ),
    )


def _check_admin_exists() -> Check:
    from app.core.db import SessionLocal
    from app.models import User
    from app.services.users import count_users

    with SessionLocal() as db:
        if count_users(db) == 0:
            return Check(
                name="Bootstrap admin",
                ok=False,
                detail="no users; set MYKRAWL_ADMIN_USER + MYKRAWL_ADMIN_PASSWORD",
            )
        admin = db.query(User).filter(User.role == "admin").first()
        if admin is None:
            return Check(name="Bootstrap admin", ok=False, detail="no admin user")
        return Check(
            name="Bootstrap admin",
            ok=True,
            detail=f"{admin.username} (id={admin.id})",
        )


_CHECKS = [
    _check_python,
    _check_sqlite,
    _check_db_path,
    _check_log_dir,
    _check_engines,
    _check_settings_summary,
    _check_admin_exists,
]


def run() -> int:
    print("Krawlyx doctor")
    print("=" * 40)
    failed = 0
    for fn in _CHECKS:
        c = fn()
        marker = "OK  " if c.ok else "FAIL"
        print(f"[{marker}] {c.name}: {c.detail}")
        if not c.ok:
            failed += 1
    print("=" * 40)
    if failed:
        print(f"{failed} check(s) failed")
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
