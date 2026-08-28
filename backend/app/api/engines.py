"""Engine CRUD + capabilities endpoints (PRD §6.1, §9).

All write endpoints require the admin role; read access is open to any
authenticated user (the runner needs to see pooled engines).
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_admin, verify_csrf
from app.core.db import get_db
from app.engines import registry
from app.models import User
from app.schemas import (
    CapabilityList,
    EngineCapabilities,
    EngineCreate,
    EngineOut,
    EngineTestResult,
    EngineUpdate,
)
from app.services import engines as engines_svc

logger = logging.getLogger("zencrawl.api.engines")

router = APIRouter(tags=["engines"])


def _to_out(row) -> EngineOut:
    config = engines_svc.decrypt_config(row.config_encrypted)
    redacted, has_secret = engines_svc.redact(config)
    return EngineOut(
        id=row.id,
        name=row.name,
        type=row.type,
        pooled=row.pooled,
        config_redacted=redacted,
        has_secret=has_secret,
        disabled_at=row.disabled_at.isoformat() if row.disabled_at else None,
    )


@router.get("/api/engines/capabilities", response_model=CapabilityList)
def list_capabilities(_user: Annotated[User, Depends(get_current_user)]) -> CapabilityList:
    """UI uses this to render per-engine-type form fields."""
    types = [
        EngineCapabilities(type=t, capabilities=registry.capabilities_for(t))
        for t in registry.available_types()
        if registry.capabilities_for(t) is not None
    ]
    return CapabilityList(types=types)


@router.get("/api/engines", response_model=list[EngineOut])
def list_engines(
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    pooled_only: bool = False,
) -> list[EngineOut]:
    rows = engines_svc.list_pooled(db) if pooled_only else engines_svc.list_engines(db)
    return [_to_out(r) for r in rows]


@router.post(
    "/api/engines",
    response_model=EngineOut,
    status_code=201,
    dependencies=[Depends(verify_csrf)],
)
def create_engine(
    body: EngineCreate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> EngineOut:
    try:
        row = engines_svc.create(
            db, name=body.name, type=body.type, config=body.config, pooled=body.pooled
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _to_out(row)


@router.patch(
    "/api/engines/{engine_id}",
    response_model=EngineOut,
    dependencies=[Depends(verify_csrf)],
)
def patch_engine(
    engine_id: int,
    body: EngineUpdate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> EngineOut:
    row = engines_svc.get(db, engine_id)
    if row is None:
        raise HTTPException(status_code=404, detail="engine not found")
    try:
        row = engines_svc.update(
            db,
            row,
            patch=body.model_dump(exclude_unset=True),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except IntegrityError as exc:
        raise HTTPException(status_code=400, detail=str(exc.orig)) from exc
    return _to_out(row)


@router.delete(
    "/api/engines/{engine_id}",
    status_code=204,
    dependencies=[Depends(verify_csrf)],
)
def delete_engine(
    engine_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    row = engines_svc.get(db, engine_id)
    if row is None:
        raise HTTPException(status_code=404, detail="engine not found")
    try:
        engines_svc.delete(db, row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/api/engines/{engine_id}/test",
    response_model=EngineTestResult,
    dependencies=[Depends(verify_csrf)],
)
def test_engine(
    engine_id: int,
    _user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> EngineTestResult:
    row = engines_svc.get(db, engine_id)
    if row is None:
        raise HTTPException(status_code=404, detail="engine not found")
    ok, detail, latency = engines_svc.test_engine(row)
    return EngineTestResult(ok=ok, detail=detail, latency_ms=latency)
