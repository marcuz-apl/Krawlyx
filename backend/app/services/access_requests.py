"""Admin notifications and requester emails for account access requests."""

import logging
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import ContactMessage
from app.models.base import utcnow
from app.schemas.contact_messages import ContactMessageOut
from app.services import mailer

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
    notified = _notify_status_change(request, status, note) if changed else False
    return request, notified


def _admin_reply_to() -> str | None:
    return get_settings().access_request_email or None


def _status_message(request: ContactMessage, status: str, note: str | None) -> tuple[str, str]:
    if status == "granted":
        subject = "Krawlyx access granted"
        intro = (
            "Your request for access to Krawlyx has been granted. "
            "An administrator will create your account and email your sign-in credentials."
        )
    elif status == "rejected":
        subject = "Krawlyx access request declined"
        intro = "Your request for access to Krawlyx has been declined."
    else:
        subject = "Krawlyx access request needs more detail"
        intro = (
            "Your request for access to Krawlyx is pending. "
            "We may need a little more detail to proceed — reply to this message "
            "if you can share more about what you need access for."
        )
    body = f"Hello {request.name},\n\n{intro}\n"
    if note:
        body += f"\nMessage from the administrator:\n{note}\n"
    body += f"\nRequest #{request.id}\n"
    return subject, body


def _notify_status_change(request: ContactMessage, status: str, note: str | None) -> bool:
    subject, body = _status_message(request, status, note)
    return mailer.send_email(request.email, subject, body, reply_to=_admin_reply_to())


def notify_requester_received(request: ContactMessageOut) -> bool:
    """Acknowledge a newly submitted request; the pending follow-up invites more detail."""
    body = (
        f"Hello {request.name},\n\n"
        "We received your request for access to Krawlyx. "
        "It is pending review by an administrator.\n\n"
        "To help us decide, reply to this message with a short note on what you "
        "need access for.\n\n"
        f"Request #{request.id}\n"
    )
    return mailer.send_email(
        request.email,
        "Krawlyx access request received",
        body,
        reply_to=_admin_reply_to(),
    )


def notify_admin(request: ContactMessageOut) -> None:
    settings = get_settings()
    if not (settings.smtp_host and settings.access_request_email):
        logger.warning("Account request %s saved without configured email delivery", request.id)
        return
    body = (
        f"Request #{request.id}\nName: {request.name}\nEmail: {request.email}\n\n"
        f"{request.message}\n\n"
        "To approve this request, create a user in the Krawlyx admin panel."
    )
    if not mailer.send_email(settings.access_request_email, ACCOUNT_ACCESS_SUBJECT, body):
        logger.warning("Account request %s saved, but email delivery failed", request.id)
