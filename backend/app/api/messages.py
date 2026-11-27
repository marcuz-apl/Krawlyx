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

from app.api.deps import require_admin
from app.core.db import get_db
from app.models import ContactMessage, User
from app.schemas.contact_messages import ContactMessageCreate, ContactMessageOut

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
    return ContactMessageOut.model_validate(row)


@router.get("", response_model=list[ContactMessageOut])
def list_messages(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ContactMessageOut]:
    return [
        ContactMessageOut.model_validate(m)
        for m in db.scalars(select(ContactMessage).order_by(ContactMessage.created_at.desc()))
    ]


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
