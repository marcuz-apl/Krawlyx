"""Endpoints for saved datasets and multi-job merge workflows."""

from __future__ import annotations

import csv
import io
import json
from typing import Annotated, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_db
from app.models import Dataset, DatasetRow, Job, JobResult, Target, User

router = APIRouter(prefix="/api/datasets", tags=["datasets"])


class CreateDatasetIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    columns: list[str] = Field(default_factory=list)
    source_job_ids: list[int] = Field(default_factory=list)


class AppendJobIn(BaseModel):
    job_ids: list[int] = Field(..., min_length=1)


class DatasetOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    columns: list[str]
    row_count: int
    created_at: str
    updated_at: str


class DatasetDetailOut(DatasetOut):
    rows: list[dict[str, Any]]


@router.get("", response_model=list[DatasetOut])
def list_datasets(
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[DatasetOut]:
    """List all saved datasets with row counts."""
    datasets = db.scalars(select(Dataset).order_by(Dataset.created_at.desc())).all()
    results = []
    for d in datasets:
        count = db.scalar(
            select(func.count(DatasetRow.id)).where(DatasetRow.dataset_id == d.id)
        ) or 0
        results.append(
            DatasetOut(
                id=d.id,
                name=d.name,
                description=d.description,
                columns=d.columns or [],
                row_count=count,
                created_at=d.created_at.isoformat(),
                updated_at=d.updated_at.isoformat(),
            )
        )
    return results


@router.post("", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
def create_dataset(
    payload: CreateDatasetIn,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DatasetOut:
    """Create a new dataset, optionally populating it from one or more job results."""
    dataset = Dataset(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        columns=payload.columns,
    )
    db.add(dataset)
    db.flush()

    # If source job IDs are provided, extract and save rows
    all_columns = set(payload.columns)
    if payload.source_job_ids:
        for jid in payload.source_job_ids:
            results = db.execute(
                select(JobResult, Target.url)
                .join(Target, Target.id == JobResult.target_id)
                .where(Target.job_id == jid)
            ).all()

            for r, url in results:
                meta = r.metadata_json or {}
                items = meta.get("items") or []
                if isinstance(items, list) and items:
                    for it in items:
                        if isinstance(it, dict):
                            all_columns.update(k for k in it.keys() if k != "type")
                            row = DatasetRow(
                                dataset_id=dataset.id,
                                source_job_id=jid,
                                source_url=it.get("listing_url") or it.get("url") or url,
                                data=it,
                            )
                            db.add(row)
                else:
                    # Generic page row
                    data = {
                        "title": r.title,
                        "url": url,
                        "http_status": r.http_status,
                        "content_text": r.content_text[:500] if r.content_text else "",
                    }
                    all_columns.update(data.keys())
                    row = DatasetRow(
                        dataset_id=dataset.id,
                        source_job_id=jid,
                        source_url=url,
                        data=data,
                    )
                    db.add(row)

    # Sort columns cleanly
    preferred_order = [
        "year", "make", "model", "trim", "drivetrain", "mileage_km", "mileage", "price",
        "seller_type", "city", "province", "dealer_name", "date_observed",
        "listing_url", "title", "url"
    ]
    dataset.columns = [c for c in preferred_order if c in all_columns] + sorted(
        c for c in all_columns if c not in preferred_order
    )

    db.commit()
    db.refresh(dataset)

    count = db.scalar(
        select(func.count(DatasetRow.id)).where(DatasetRow.dataset_id == dataset.id)
    ) or 0

    return DatasetOut(
        id=dataset.id,
        name=dataset.name,
        description=dataset.description,
        columns=dataset.columns,
        row_count=count,
        created_at=dataset.created_at.isoformat(),
        updated_at=dataset.updated_at.isoformat(),
    )


class UpdateDatasetIn(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


@router.patch("/{dataset_id}", response_model=DatasetOut)
def patch_dataset(
    dataset_id: int,
    payload: UpdateDatasetIn,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DatasetOut:
    """Rename or update description of a dataset."""
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="dataset not found")

    if payload.name is not None:
        dataset.name = payload.name.strip()
    if payload.description is not None:
        dataset.description = payload.description.strip() or None

    db.commit()
    db.refresh(dataset)

    count = db.scalar(
        select(func.count(DatasetRow.id)).where(DatasetRow.dataset_id == dataset.id)
    ) or 0

    return DatasetOut(
        id=dataset.id,
        name=dataset.name,
        description=dataset.description,
        columns=dataset.columns or [],
        row_count=count,
        created_at=dataset.created_at.isoformat(),
        updated_at=dataset.updated_at.isoformat(),
    )


class MergeDatasetsIn(BaseModel):
    dataset_ids: list[int] = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None


@router.post("/merge", response_model=DatasetOut, status_code=status.HTTP_201_CREATED)
def merge_datasets(
    payload: MergeDatasetsIn,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> DatasetOut:
    """Merge multiple existing saved datasets into a new combined dataset."""
    datasets = db.scalars(
        select(Dataset).where(Dataset.id.in_(payload.dataset_ids))
    ).all()
    if not datasets:
        raise HTTPException(status_code=404, detail="no matching datasets found")

    # Combine columns
    combined_columns = set()
    for d in datasets:
        combined_columns.update(d.columns or [])

    new_dataset = Dataset(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        columns=list(combined_columns),
    )
    db.add(new_dataset)
    db.flush()

    # Copy rows across all selected datasets
    seen_urls = set()
    for d in datasets:
        rows = db.scalars(
            select(DatasetRow)
            .where(DatasetRow.dataset_id == d.id)
            .order_by(DatasetRow.id)
        ).all()
        for r in rows:
            url_key = r.source_url or f"{d.id}_{r.id}"
            if url_key in seen_urls:
                continue
            seen_urls.add(url_key)
            new_row = DatasetRow(
                dataset_id=new_dataset.id,
                source_job_id=r.source_job_id,
                source_url=r.source_url,
                data=r.data,
            )
            db.add(new_row)

    preferred_order = [
        "year", "make", "model", "trim", "drivetrain", "mileage_km", "mileage", "price",
        "seller_type", "city", "province", "dealer_name", "date_observed",
        "listing_url", "title", "url"
    ]
    new_dataset.columns = [c for c in preferred_order if c in combined_columns] + sorted(
        c for c in combined_columns if c not in preferred_order
    )

    db.commit()
    db.refresh(new_dataset)

    count = db.scalar(
        select(func.count(DatasetRow.id)).where(DatasetRow.dataset_id == new_dataset.id)
    ) or 0

    return DatasetOut(
        id=new_dataset.id,
        name=new_dataset.name,
        description=new_dataset.description,
        columns=new_dataset.columns,
        row_count=count,
        created_at=new_dataset.created_at.isoformat(),
        updated_at=new_dataset.updated_at.isoformat(),
    )


@router.get("/{dataset_id}", response_model=DatasetDetailOut)
def get_dataset(
    dataset_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(500, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> DatasetDetailOut:
    """Get dataset schema, metadata, and rows."""
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="dataset not found")

    count = db.scalar(
        select(func.count(DatasetRow.id)).where(DatasetRow.dataset_id == dataset.id)
    ) or 0

    rows = db.scalars(
        select(DatasetRow)
        .where(DatasetRow.dataset_id == dataset.id)
        .order_by(DatasetRow.id.asc())
        .offset(offset)
        .limit(limit)
    ).all()

    formatted_rows = [r.data for r in rows]

    return DatasetDetailOut(
        id=dataset.id,
        name=dataset.name,
        description=dataset.description,
        columns=dataset.columns or [],
        row_count=count,
        created_at=dataset.created_at.isoformat(),
        updated_at=dataset.updated_at.isoformat(),
        rows=formatted_rows,
    )


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    """Delete a saved dataset."""
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="dataset not found")
    db.delete(dataset)
    db.commit()


@router.get("/{dataset_id}/export.csv", response_class=Response)
def export_dataset_csv(
    dataset_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> Response:
    """Download full dataset as Excel-compatible UTF-8 CSV."""
    dataset = db.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="dataset not found")

    rows = db.scalars(
        select(DatasetRow)
        .where(DatasetRow.dataset_id == dataset.id)
        .order_by(DatasetRow.id.asc())
    ).all()

    output = io.StringIO()
    output.write("\ufeff")  # UTF-8 BOM
    writer = csv.writer(output)

    headers = dataset.columns or []
    if not headers and rows:
        all_keys = set()
        for r in rows:
            all_keys.update(r.data.keys())
        headers = sorted(k for k in all_keys if k != "type")

    writer.writerow(headers)
    for r in rows:
        writer.writerow([r.data.get(h, "") for h in headers])

    safe_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in dataset.name)
    return Response(
        content=output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.csv"'},
    )


@router.post("/{dataset_id}/deduplicate")
def deduplicate_dataset(
    dataset_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Scan the dataset for duplicate records and delete duplicates from the database."""
    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="dataset not found")

    rows = db.scalars(
        select(DatasetRow)
        .where(DatasetRow.dataset_id == dataset.id)
        .order_by(DatasetRow.id)
    ).all()

    seen = set()
    to_delete = []

    for r in rows:
        row_dict = r.data or {}
        # Composite fingerprint for vehicles
        if "make" in row_dict and "year" in row_dict:
            fp = (
                str(row_dict.get("year", "")).strip().lower(),
                str(row_dict.get("make", "")).strip().lower(),
                str(row_dict.get("model", "")).strip().lower(),
                str(row_dict.get("trim", "")).strip().lower(),
                str(row_dict.get("mileage_km", row_dict.get("mileage", ""))).strip(),
                str(row_dict.get("price", "")).strip(),
                str(row_dict.get("listing_url", "")).strip(),
            )
        else:
            # Generic fingerprint
            fp = tuple(
                sorted(
                    (k, str(v).strip().lower())
                    for k, v in row_dict.items()
                    if not k.startswith("_") and k not in {"date_observed", "source_url"}
                )
            )

        if fp in seen:
            to_delete.append(r.id)
        else:
            seen.add(fp)

    if to_delete:
        db.execute(delete(DatasetRow).where(DatasetRow.id.in_(to_delete)))
        db.commit()

    count = db.scalar(
        select(func.count(DatasetRow.id)).where(DatasetRow.dataset_id == dataset.id)
    ) or 0

    return {
        "dataset_id": dataset.id,
        "removed_count": len(to_delete),
        "remaining_count": count,
    }


class SqlQueryIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=10000)


@router.post("/{dataset_id}/sql")
def execute_dataset_sql(
    dataset_id: int,
    payload: SqlQueryIn,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Execute arbitrary SQL queries (SELECT, UPDATE, DELETE, ALTER) against a dynamic table representing the dataset."""
    import sqlite3

    dataset = db.get(Dataset, dataset_id)
    if dataset is None:
        raise HTTPException(status_code=404, detail="dataset not found")

    rows = db.scalars(
        select(DatasetRow)
        .where(DatasetRow.dataset_id == dataset.id)
        .order_by(DatasetRow.id)
    ).all()

    # Discover all column names across all rows
    all_keys = set(dataset.columns or [])
    for r in rows:
        if r.data:
            all_keys.update(r.data.keys())

    # Build ordered column list
    cols = sorted(list(all_keys))

    # Create temporary in-memory database
    mem_conn = sqlite3.connect(":memory:")
    mem_conn.row_factory = sqlite3.Row

    # Define dynamic table
    col_defs = ", ".join([f'"{c}" TEXT' for c in cols])
    mem_conn.execute(f'CREATE TABLE dataset (_row_id INTEGER PRIMARY KEY, {col_defs})')

    row_id_map = {}
    for idx, r in enumerate(rows, start=1):
        row_id_map[idx] = r
        col_names = ", ".join([f'"{c}"' for c in cols])
        placeholders = ", ".join(["?"] * len(cols))
        vals = [(r.data or {}).get(c) for c in cols]
        mem_conn.execute(
            f'INSERT INTO dataset (_row_id, {col_names}) VALUES (?, {placeholders})',
            [idx] + vals,
        )

    clean_sql = payload.query.strip().rstrip(";")
    first_word = clean_sql.split()[0].upper() if clean_sql else ""

    try:
        cur = mem_conn.cursor()
        cur.execute(clean_sql)

        if first_word in {"SELECT", "PRAGMA", "EXPLAIN"}:
            col_names = [d[0] for d in cur.description] if cur.description else []
            fetched = cur.fetchmany(1000)
            result_rows = [dict(zip(col_names, row)) for row in fetched]
            return {
                "type": "select",
                "columns": col_names,
                "rows": result_rows,
                "total_returned": len(result_rows),
            }
        else:
            # Mutation (UPDATE, DELETE, ALTER, etc.)
            rows_affected = cur.rowcount

            # Read back dataset table structure and all remaining rows
            cur2 = mem_conn.execute("SELECT * FROM dataset")
            new_cols = [d[0] for d in cur2.description if d[0] != "_row_id"]
            remaining_data = cur2.fetchall()

            remaining_row_ids = set()
            for r_row in remaining_data:
                _rid = r_row["_row_id"]
                remaining_row_ids.add(_rid)
                orig_target_row = row_id_map.get(_rid)
                if orig_target_row:
                    new_data_dict = {}
                    for col_name in new_cols:
                        val = r_row[col_name]
                        if val is not None:
                            new_data_dict[col_name] = val
                    orig_target_row.data = new_data_dict

            # Delete rows dropped by a DELETE query
            deleted_ids = [r.id for _rid, r in row_id_map.items() if _rid not in remaining_row_ids]
            if deleted_ids:
                db.execute(delete(DatasetRow).where(DatasetRow.id.in_(deleted_ids)))

            dataset.columns = new_cols
            db.commit()

            count = db.scalar(
                select(func.count(DatasetRow.id)).where(DatasetRow.dataset_id == dataset.id)
            ) or 0

            return {
                "type": "mutation",
                "rows_affected": max(rows_affected, 0),
                "remaining_count": count,
                "columns": new_cols,
            }

    except Exception as exc:
        raise HTTPException(status_code=404, detail=f"SQL Error: {exc}")
    finally:
        mem_conn.close()


class SqlRawExecIn(BaseModel):
    query: str = Field(..., min_length=1, max_length=10000)
    rows: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/sql-exec")
def execute_raw_sql(
    payload: SqlRawExecIn,
    _user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Execute SQL queries against arbitrary in-memory rows without requiring a pre-saved dataset."""
    import sqlite3

    rows = payload.rows or []
    all_keys = set()
    for r in rows:
        if isinstance(r, dict):
            all_keys.update(r.keys())

    cols = sorted(list(all_keys)) if all_keys else ["val"]

    mem_conn = sqlite3.connect(":memory:")
    mem_conn.row_factory = sqlite3.Row

    col_defs = ", ".join([f'"{c}" TEXT' for c in cols])
    mem_conn.execute(f'CREATE TABLE dataset (_row_id INTEGER PRIMARY KEY, {col_defs})')

    for idx, r in enumerate(rows, start=1):
        col_names = ", ".join([f'"{c}"' for c in cols])
        placeholders = ", ".join(["?"] * len(cols))
        vals = [(r or {}).get(c) for c in cols]
        mem_conn.execute(
            f'INSERT INTO dataset (_row_id, {col_names}) VALUES (?, {placeholders})',
            [idx] + vals,
        )

    clean_sql = payload.query.strip().rstrip(";")
    first_word = clean_sql.split()[0].upper() if clean_sql else ""

    try:
        cur = mem_conn.cursor()
        cur.execute(clean_sql)

        if first_word in {"SELECT", "PRAGMA", "EXPLAIN"}:
            col_names = [d[0] for d in cur.description] if cur.description else []
            fetched = cur.fetchmany(1000)
            result_rows = [dict(zip(col_names, row)) for row in fetched]
            return {
                "type": "select",
                "columns": col_names,
                "rows": result_rows,
                "total_returned": len(result_rows),
            }
        else:
            rows_affected = cur.rowcount
            cur2 = mem_conn.execute("SELECT * FROM dataset")
            new_cols = [d[0] for d in cur2.description if d[0] != "_row_id"]
            remaining_data = cur2.fetchall()

            updated_rows = []
            for r_row in remaining_data:
                item_dict = {col: r_row[col] for col in new_cols if r_row[col] is not None}
                updated_rows.append(item_dict)

            return {
                "type": "mutation",
                "rows_affected": max(rows_affected, 0),
                "remaining_count": len(updated_rows),
                "columns": new_cols,
                "rows": updated_rows,
            }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SQL Error: {exc}")
    finally:
        mem_conn.close()

