"""Best-effort SMTP delivery shared by notifications and account emails."""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import get_settings
from app.services import email_render

logger = logging.getLogger("mykrawl.mailer")


def smtp_configured() -> bool:
    return bool(get_settings().smtp_host)


def send_email(to: str, subject: str, body: str, reply_to: str | None = None) -> bool:
    """Send a plain-text email; True on delivery, False when skipped or failed."""
    settings = get_settings()
    if not (settings.smtp_host and to):
        logger.warning("email skipped: SMTP not configured")
        return False
    try:
        message = EmailMessage()
        message["From"] = settings.smtp_from or settings.access_request_email or to
        message["To"] = to
        message["Subject"] = subject
        if reply_to:
            message["Reply-To"] = reply_to
        message.set_content(email_render.plain_with_signature(body))
        message.add_alternative(email_render.html_email(body), subtype="html")
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as relay:
            relay.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                relay.login(settings.smtp_username, settings.smtp_password.get_secret_value())
            relay.send_message(message)
    except (OSError, ValueError, smtplib.SMTPException) as exc:
        logger.warning("email delivery failed (%s)", type(exc).__name__)
        return False
    logger.info("email sent")
    return True
