"""SuperAdmin SQLite Database Browser API.

Provides real-time table inspection, paginated row browsing, arbitrary SQL query execution,
and SQLite database maintenance tools exclusively for SuperAdmin ("admin").
"""

from __future__ import annotations

import logging
import sqlite3
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.api.deps import require_superadmin, verify_csrf
from app.core.config import get_settings
from app.core.db import get_db
from app.models import User

logger = logging.getLogger("mykrawl.api.database")

router = APIRouter(prefix="/api/database", tags=["database"])


class SqlQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sql: str = Field(min_length=1, max_length=50000)


class MaintenanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: str = Field(pattern="^(vacuum|checkpoint|optimize|integrity_check)$")


def _get_sqlite_connection() -> sqlite3.Connection:
    cfg = get_settings()
    conn = sqlite3.connect(cfg.db_path.as_posix(), timeout=30.0)
    conn.row_factory = sqlite3.Row
    return conn


@router.get("/tables")
def get_tables(
    _superadmin: Annotated[User, Depends(require_superadmin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[dict[str, Any]]:
    """Return all tables with column definitions, row counts, and creation SQL."""
    with _get_sqlite_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(
            """SELECT name, type, sql FROM sqlite_master 
               WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_stat%' 
               ORDER BY name"""
        )
        tables_meta = cursor.fetchall()

        result = []
        for row in tables_meta:
            tname = row["name"]
            ttype = row["type"]
            tsql = row["sql"] or ""

            cursor.execute(f'PRAGMA table_info("{tname}")')
            col_rows = cursor.fetchall()
            columns = [
                {
                    "cid": c["cid"],
                    "name": c["name"],
                    "type": c["type"],
                    "notnull": bool(c["notnull"]),
                    "dflt_value": c["dflt_value"],
                    "pk": bool(c["pk"]),
                }
                for c in col_rows
            ]

            try:
                cursor.execute(f'SELECT COUNT(*) FROM "{tname}"')
                row_count = cursor.fetchone()[0]
            except Exception:
                row_count = 0

            result.append(
                {
                    "name": tname,
                    "type": ttype,
                    "row_count": row_count,
                    "column_count": len(columns),
                    "columns": columns,
                    "sql": tsql,
                }
            )
        return result


@router.get("/tables/{table_name}/rows")
def get_table_rows(
    table_name: str,
    _superadmin: Annotated[User, Depends(require_superadmin)],
    page: int = 1,
    page_size: int = 50,
    sort_col: str | None = None,
    sort_dir: str = "asc",
    search: str | None = None,
) -> dict[str, Any]:
    """Return paginated rows with column filtering and sorting."""
    page = max(1, page)
    page_size = max(1, min(500, page_size))
    offset = (page - 1) * page_size
    sort_dir = "desc" if sort_dir.lower() == "desc" else "asc"

    with _get_sqlite_connection() as conn:
        cursor = conn.cursor()

        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?",
            (table_name,),
        )
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail=f"Table {table_name!r} not found")

        cursor.execute(f'PRAGMA table_info("{table_name}")')
        col_rows = cursor.fetchall()
        columns = [{"name": c["name"], "type": c["type"], "pk": bool(c["pk"])} for c in col_rows]
        col_names = [c["name"] for c in col_rows]

        cursor.execute(f'SELECT COUNT(*) FROM "{table_name}"')
        total_rows = cursor.fetchone()[0]

        where_sql = ""
        params: list[Any] = []
        if search and search.strip() and col_names:
            search_clause = " OR ".join([f'CAST("{c}" AS TEXT) LIKE ?' for c in col_names])
            where_sql = f"WHERE ({search_clause})"
            search_param = f"%{search.strip()}%"
            params.extend([search_param] * len(col_names))

        if where_sql:
            cursor.execute(f'SELECT COUNT(*) FROM "{table_name}" {where_sql}', params)
            filtered_rows = cursor.fetchone()[0]
        else:
            filtered_rows = total_rows

        order_sql = ""
        if sort_col and sort_col in col_names:
            order_sql = f'ORDER BY "{sort_col}" {sort_dir.upper()}'
        elif "id" in col_names:
            order_sql = 'ORDER BY "id" DESC'

        query_sql = f'SELECT * FROM "{table_name}" {where_sql} {order_sql} LIMIT ? OFFSET ?'
        cursor.execute(query_sql, params + [page_size, offset])
        data_rows = cursor.fetchall()

        rows = []
        for r in data_rows:
            row_dict = {}
            for col in col_names:
                val = r[col]
                if isinstance(val, (bytes, bytearray)):
                    row_dict[col] = f"<BLOB {len(val)} bytes>"
                else:
                    row_dict[col] = val
            rows.append(row_dict)

        return {
            "table_name": table_name,
            "total_rows": total_rows,
            "filtered_rows": filtered_rows,
            "page": page,
            "page_size": page_size,
            "total_pages": max(1, (filtered_rows + page_size - 1) // page_size),
            "columns": columns,
            "rows": rows,
        }


@router.post(
    "/query",
    dependencies=[Depends(verify_csrf)],
)
def execute_query(
    body: SqlQueryRequest,
    _superadmin: Annotated[User, Depends(require_superadmin)],
) -> dict[str, Any]:
    """Execute arbitrary SQL query with timing and structured results."""
    sql_text = body.sql.strip()
    if not sql_text:
        raise HTTPException(status_code=400, detail="SQL query cannot be empty")

    start_time = time.perf_counter()
    with _get_sqlite_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(sql_text)
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

            if cursor.description:
                col_names = [col[0] for col in cursor.description]
                raw_rows = cursor.fetchmany(1000)
                rows = []
                for r in raw_rows:
                    row_dict = {}
                    for idx, cname in enumerate(col_names):
                        val = r[idx]
                        if isinstance(val, (bytes, bytearray)):
                            row_dict[cname] = f"<BLOB {len(val)} bytes>"
                        else:
                            row_dict[cname] = val
                    rows.append(row_dict)

                return {
                    "success": True,
                    "columns": col_names,
                    "rows": rows,
                    "row_count": len(rows),
                    "duration_ms": elapsed_ms,
                    "is_read_only": True,
                }
            else:
                conn.commit()
                return {
                    "success": True,
                    "columns": [],
                    "rows": [],
                    "rows_affected": cursor.rowcount,
                    "duration_ms": elapsed_ms,
                    "is_read_only": False,
                }
        except Exception as exc:
            elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return {
                "success": False,
                "error": str(exc),
                "duration_ms": elapsed_ms,
            }


@router.get("/stats")
def get_database_stats(
    _superadmin: Annotated[User, Depends(require_superadmin)],
) -> dict[str, Any]:
    """Return database storage size, WAL stats, page allocation, and integrity check."""
    cfg = get_settings()
    db_path = cfg.db_path

    file_size_bytes = db_path.stat().st_size if db_path.exists() else 0
    wal_path = db_path.with_name(f"{db_path.name}-wal")
    wal_size_bytes = wal_path.stat().st_size if wal_path.exists() else 0

    with _get_sqlite_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("PRAGMA page_size")
        page_size = cursor.fetchone()[0]
        cursor.execute("PRAGMA page_count")
        page_count = cursor.fetchone()[0]
        cursor.execute("PRAGMA freelist_count")
        freelist_count = cursor.fetchone()[0]
        cursor.execute("PRAGMA schema_version")
        schema_version = cursor.fetchone()[0]
        cursor.execute("PRAGMA integrity_check(5)")
        integrity_rows = [r[0] for r in cursor.fetchall()]

    return {
        "db_path": str(db_path),
        "file_size_bytes": file_size_bytes,
        "file_size_formatted": f"{file_size_bytes / (1024 * 1024):.2f} MB",
        "wal_size_bytes": wal_size_bytes,
        "wal_size_formatted": f"{wal_size_bytes / (1024 * 1024):.2f} MB",
        "page_size": page_size,
        "page_count": page_count,
        "freelist_count": freelist_count,
        "schema_version": schema_version,
        "integrity_status": integrity_rows[0] if integrity_rows else "unknown",
        "integrity_ok": integrity_rows == ["ok"],
    }


@router.post(
    "/maintenance",
    dependencies=[Depends(verify_csrf)],
)
def run_maintenance(
    body: MaintenanceRequest,
    _superadmin: Annotated[User, Depends(require_superadmin)],
) -> dict[str, Any]:
    """Execute SQLite vacuum, WAL checkpoint, or pragma optimize."""
    action = body.action.lower()
    with _get_sqlite_connection() as conn:
        cursor = conn.cursor()
        if action == "vacuum":
            cursor.execute("VACUUM")
            msg = "VACUUM completed successfully. Database defragmented and storage reclaimed."
        elif action == "checkpoint":
            cursor.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            msg = "WAL checkpoint (TRUNCATE) completed successfully. WAL log committed to main database file."
        elif action == "optimize":
            cursor.execute("PRAGMA optimize")
            msg = (
                "PRAGMA optimize completed successfully. SQLite query planner statistics refreshed."
            )
        elif action == "integrity_check":
            cursor.execute("PRAGMA integrity_check(10)")
            checks = [r[0] for r in cursor.fetchall()]
            msg = f"Integrity check completed: {', '.join(checks)}"
        else:
            raise HTTPException(status_code=400, detail=f"Unknown maintenance action: {action}")

    stats = get_database_stats(_superadmin)
    return {"success": True, "action": action, "message": msg, "stats": stats}
