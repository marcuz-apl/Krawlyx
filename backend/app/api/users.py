"""User admin API (PRD §9 — user management).

Writes require admin + CSRF. Reads are admin-only (the SPA's
`/api/auth/me` is the per-user self-read path).

The admin is the only path to create accounts in v1; there's no
public signup. We refuse to delete the last admin so a typo can't
lock the operator out.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import require_admin, verify_csrf
from app.core.db import get_db
from app.core.security import hash_password
from app.models import User
from app.models.user import User as UserRow
from app.schemas import UserCreate, UserOut, UserUpdate
from app.services.users import create_user

logger = logging.getLogger("mykrawl.api.users")

router = APIRouter(prefix="/api/users", tags=["users"])


def _count_admins(db: Session) -> int:
    return len(list(db.scalars(select(UserRow).where(UserRow.role == "admin"))))


@router.get("", response_model=list[UserOut])
def list_users(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[UserOut]:
    return [
        UserOut.model_validate(u) for u in db.scalars(select(UserRow).order_by(UserRow.username))
    ]


@router.post(
    "",
    response_model=UserOut,
    status_code=201,
    dependencies=[Depends(verify_csrf)],
)
def create_user_route(
    body: UserCreate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    try:
        row = create_user(db, body.username, body.password, body.role)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=400, detail=f"username {body.username!r} is already taken"
        ) from exc
    return UserOut.model_validate(row)


@router.patch(
    "/{user_id}",
    response_model=UserOut,
    dependencies=[Depends(verify_csrf)],
)
def patch_user_route(
    user_id: int,
    body: UserUpdate,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> UserOut:
    row = db.get(UserRow, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user not found")
    if body.password is not None:
        row.password_hash = hash_password(body.password)
    if body.role is not None and body.role != row.role:
        if row.role == "admin" and _count_admins(db) <= 1:
            raise HTTPException(status_code=400, detail="cannot demote the last admin")
        row.role = body.role
    db.commit()
    db.refresh(row)
    return UserOut.model_validate(row)


@router.delete(
    "/{user_id}",
    status_code=204,
    dependencies=[Depends(verify_csrf)],
)
def delete_user_route(
    user_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> None:
    row = db.get(UserRow, user_id)
    if row is None:
        raise HTTPException(status_code=404, detail="user not found")
    if row.role == "admin" and _count_admins(db) <= 1:
        raise HTTPException(status_code=400, detail="cannot delete the last admin")
    db.delete(row)
    db.commit()
