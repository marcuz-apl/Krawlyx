"""Admin notifications and requester emails for account access requests."""

import logging
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import ContactMessage
from app.models.base import utcnow
from app.schemas.contact_messages import ContactMessageOut
from app.services import email_templates, mailer

ACCOUNT_ACCESS_SUBJECT = "Krawlyx account access"
logger = logging.getLogger(__name__)


def list_access_requests(db: Session) -> Sequence[ContactMessage]:
    return db.scalars(
        select(ContactMessage)
        .where(ContactMessage.subject == ACCOUNT_ACCESS_SUBJECT)
        .order_by(
            ContactMessage.status != "pending",
            ContactMessage.created_at.desc(),
            ContactMessage.id.desc(),
        )
    ).all()


def set_status(
    db: Session, request_id: int, status: str, note: str | None = None
) -> tuple[ContactMessage, bool] | None:
    request = db.scalar(
        select(ContactMessage).where(
            ContactMessage.id == request_id,
            ContactMessage.subject == ACCOUNT_ACCESS_SUBJECT,
        )
    )
    if request is None:
        return None
    changed = status != request.status
    if status == "pending":
        request.reviewed_at = None
    elif changed or request.reviewed_at is None:
        request.reviewed_at = utcnow()
    request.status = status
    db.commit()
    db.refresh(request)
    notified = _notify_status_change(db, request, status, note) if changed else False
    return request, notified


def _admin_reply_to() -> str | None:
    return get_settings().access_request_email or None


def _notify_status_change(
    db: Session, request: ContactMessage, status: str, note: str | None
) -> bool:
    subject, body = email_templates.render_template(
        db,
        f"access_{status}",
        name=request.name,
        request_id=request.id,
        note_block=email_templates.note_block(note),
        note=note or "",
    )
    return mailer.send_email(request.email, subject, body, reply_to=_admin_reply_to())


def notify_requester_received(db: Session, request: ContactMessageOut) -> bool:
    """Acknowledge a newly submitted request; the pending follow-up invites more detail."""
    subject, body = email_templates.render_template(
        db, "access_received", name=request.name, request_id=request.id
    )
    return mailer.send_email(request.email, subject, body, reply_to=_admin_reply_to())


def notify_admin(db: Session, request: ContactMessageOut) -> None:
    settings = get_settings()
    if not (settings.smtp_host and settings.access_request_email):
        logger.warning("Account request %s saved without configured email delivery", request.id)
        return
    subject, body = email_templates.render_template(
        db,
        "new_request_admin",
        name=request.name,
        email=request.email,
        request_id=request.id,
        message=request.message,
    )
    if not mailer.send_email(settings.access_request_email, subject, body):
        logger.warning("Account request %s saved, but email delivery failed", request.id)
