"""Admin-editable transactional email templates.

Overrides live as one JSON row in the settings table; missing entries fall back
to DEFAULTS. Templates are plain text with {placeholder} tokens.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from sqlalchemy.orm import Session

from app.models import Setting

SETTINGS_KEY = "email_templates"

DEFAULTS: dict[str, dict[str, str]] = {
    "access_received": {
        "subject": "Krawlyx access request received",
        "body": (
            "Hello {name},\n\n"
            "We received your request for access to Krawlyx. "
            "It is pending review by an administrator.\n\n"
            "To help us decide, reply to this message with a short note on what you "
            "need access for.\n\n"
            "Request #{request_id}\n"
        ),
    },
    "access_granted": {
        "subject": "Krawlyx access granted",
        "body": (
            "Hello {name},\n\n"
            "Your request for access to Krawlyx has been granted. "
            "An administrator will create your account and email your sign-in "
            "credentials.\n\n"
            "{note_block}Request #{request_id}\n"
        ),
    },
    "access_rejected": {
        "subject": "Krawlyx access request declined",
        "body": (
            "Hello {name},\n\n"
            "Your request for access to Krawlyx has been declined.\n\n"
            "{note_block}Request #{request_id}\n"
        ),
    },
    "access_pending": {
        "subject": "Krawlyx access request needs more detail",
        "body": (
            "Hello {name},\n\n"
            "Your request for access to Krawlyx is pending. "
            "We may need a little more detail to proceed — reply to this message "
            "if you can share more about what you need access for.\n\n"
            "{note_block}Request #{request_id}\n"
        ),
    },
    "welcome": {
        "subject": "Your Krawlyx account",
        "body": (
            "An account has been created for you on Krawlyx.\n\n"
            "Username: {username}\n"
            "Password: {password}\n\n"
            "You will be asked to set a new password on your first sign-in."
        ),
    },
    "new_request_admin": {
        "subject": "Krawlyx account access",
        "body": (
            "Request #{request_id}\nName: {name}\nEmail: {email}\n\n"
            "{message}\n\n"
            "To approve this request, create a user in the Krawlyx admin panel."
        ),
    },
}

TEMPLATE_KEYS = tuple(DEFAULTS)


def _overrides(db: Session) -> dict[str, Any]:
    row = db.get(Setting, SETTINGS_KEY)
    return dict(row.value) if row is not None and isinstance(row.value, dict) else {}


def get_templates(db: Session) -> dict[str, dict[str, str]]:
    merged = deepcopy(DEFAULTS)
    for key, value in _overrides(db).items():
        if key in merged and isinstance(value, dict):
            merged[key].update({k: v for k, v in value.items() if k in ("subject", "body")})
    return merged


def save_templates(
    db: Session, payload: dict[str, dict[str, str]] | None
) -> dict[str, dict[str, str]]:
    """Replace overrides; None clears them and restores the defaults."""
    unknown = sorted(set(payload) - set(TEMPLATE_KEYS)) if payload else []
    if unknown:
        raise ValueError(f"unknown template key(s): {', '.join(unknown)}")
    row = db.get(Setting, SETTINGS_KEY)
    if not payload:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(Setting(key=SETTINGS_KEY, value=payload))
    else:
        row.value = payload
    db.commit()
    return get_templates(db)


def note_block(note: str | None) -> str:
    return f"Message from the administrator:\n{note}\n\n" if note else ""


def render(text: str, values: dict[str, Any]) -> str:
    for key, value in values.items():
        text = text.replace("{" + key + "}", str(value))
    return text


def render_template(db: Session, key: str, **values: Any) -> tuple[str, str]:
    template = get_templates(db)[key]
    return render(template["subject"], values), render(template["body"], values)
