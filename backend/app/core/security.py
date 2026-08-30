"""Password hashing (bcrypt) and signed session tokens with embedded CSRF (PRD §10 NFR-04)."""

import hmac
import logging
import secrets
from dataclasses import dataclass

import bcrypt
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.core.config import get_settings

logger = logging.getLogger("mykrawl.security")

SESSION_COOKIE = "zc_session"
CSRF_COOKIE = "zc_csrf"
_CSRF_SALT = "mykrawl.session.v1"


@dataclass(frozen=True)
class SessionData:
    user_id: int
    csrf_token: str


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().secret_key, salt=_CSRF_SALT)


def issue_session(user_id: int) -> tuple[str, str]:
    """Return (session_token, csrf_token)."""
    csrf_token = secrets.token_urlsafe(32)
    token = _serializer().dumps({"uid": user_id, "csrf": csrf_token})
    return token, csrf_token


def read_session(token: str | None) -> SessionData | None:
    """Validate a session token; None when absent, expired, tampered, or malformed."""
    if not token:
        return None
    try:
        payload = _serializer().loads(token, max_age=get_settings().session_ttl_s)
        return SessionData(user_id=int(payload["uid"]), csrf_token=str(payload["csrf"]))
    except (BadSignature, SignatureExpired, KeyError, TypeError, ValueError):
        return None


def tokens_match(a: str | None, b: str | None) -> bool:
    return bool(a and b and hmac.compare_digest(a, b))
