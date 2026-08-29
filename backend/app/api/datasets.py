"""Endpoints for saved datasets and multi-job merge workflows."""

from __future__ import annotations

import csv
import io
import json
from typing import Annotated, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
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
        "year", "make", "model", "trim", "drivetrain", "mileage", "price",
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
