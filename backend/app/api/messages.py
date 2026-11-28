"""Contact form API (public contact page — sister-project parity with DiaBit).

POST /api/messages is open (no auth, no CSRF — the form is public-facing,
mirroring DiaBit's POST handler). GET /api/messages lists submissions and
contains PII, so it is admin-only, also matching DiaBit.
"""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_admin, require_superadmin_role, verify_csrf
from app.core.db import get_db
from app.models import ContactMessage, User
from app.schemas.contact_messages import (
    AccessRequestDecision,
    AccessRequestDecisionOut,
    AccessRequestOut,
    ContactMessageCreate,
    ContactMessageOut,
)
from app.services import access_requests

logger = logging.getLogger("mykrawl.api.messages")

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.post("", response_model=ContactMessageOut, status_code=201)
def submit_message(
    body: ContactMessageCreate,
    db: Annotated[Session, Depends(get_db)],
) -> ContactMessageOut:
    row = ContactMessage(
        name=body.name.strip(),
        email=body.email.strip(),
        subject=body.subject.strip(),
        message=body.message.strip(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info("contact message submitted (id=%s)", row.id)
    saved = ContactMessageOut.model_validate(row)
    if saved.subject == access_requests.ACCOUNT_ACCESS_SUBJECT:
        access_requests.notify_admin(saved)
        access_requests.notify_requester_received(saved)
    return saved


@router.get("", response_model=list[ContactMessageOut])
def list_messages(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ContactMessageOut]:
    return [
        ContactMessageOut.model_validate(m)
        for m in db.scalars(select(ContactMessage).order_by(ContactMessage.created_at.desc()))
    ]


@router.get("/access-requests", response_model=list[AccessRequestOut])
def list_access_requests(
    _reviewer: Annotated[User, Depends(require_superadmin_role)],
    db: Annotated[Session, Depends(get_db)],
) -> list[AccessRequestOut]:
    return [
        AccessRequestOut.model_validate(row) for row in access_requests.list_access_requests(db)
    ]


@router.patch(
    "/access-requests/{request_id}/review",
    response_model=AccessRequestDecisionOut,
    dependencies=[Depends(verify_csrf)],
)
def review_access_request(
    request_id: int,
    body: AccessRequestDecision,
    _reviewer: Annotated[User, Depends(require_superadmin_role)],
    db: Annotated[Session, Depends(get_db)],
) -> AccessRequestDecisionOut:
    result = access_requests.set_status(db, request_id, body.status, note=body.note)
    if result is None:
        raise HTTPException(status_code=404, detail="access request not found")
    row, notified = result
    return AccessRequestDecisionOut(
        **AccessRequestOut.model_validate(row).model_dump(), requester_notified=notified
    )


@router.get("/{message_id}", response_model=ContactMessageOut)
def get_message(
    message_id: int,
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> ContactMessageOut:
    row = db.get(ContactMessage, message_id)
    if row is None:
        raise HTTPException(status_code=404, detail="message not found")
    return ContactMessageOut.model_validate(row)
