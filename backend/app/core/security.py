"""Password hashing (bcrypt), signed session tokens with embedded CSRF (PRD §10 NFR-04),
and TOTP helpers for authenticator-app MFA."""

import base64
import hashlib
import hmac
import logging
import secrets
import time
from dataclasses import dataclass

import bcrypt
from cryptography.fernet import Fernet, InvalidToken
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from app.core.config import get_settings

logger = logging.getLogger("mykrawl.security")

SESSION_COOKIE = "zc_session"
CSRF_COOKIE = "zc_csrf"
_CSRF_SALT = "mykrawl.session.v1"
_MFA_SALT = "mykrawl.mfa.v1"
MFA_TOKEN_TTL_S = 300


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


# ---- MFA challenge tokens (between password and TOTP code) ----


def _mfa_serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().secret_key, salt=_MFA_SALT)


def issue_mfa_token(user_id: int) -> str:
    return _mfa_serializer().dumps({"uid": user_id, "purpose": "mfa"})


def read_mfa_token(token: str | None) -> int | None:
    if not token:
        return None
    try:
        payload = _mfa_serializer().loads(token, max_age=MFA_TOKEN_TTL_S)
        if payload.get("purpose") != "mfa":
            return None
        return int(payload["uid"])
    except (BadSignature, SignatureExpired, KeyError, TypeError, ValueError, AttributeError):
        return None


# ---- TOTP secret storage and code helpers ----

_TOTP_PERIOD_S = 30
_TOTP_DIGITS = 6


def _mfa_fernet() -> Fernet:
    digest = hashlib.sha256(f"{get_settings().secret_key}|mfa".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_mfa_secret(secret: str) -> str:
    return _mfa_fernet().encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_mfa_secret(blob: str | None) -> str | None:
    if not blob:
        return None
    try:
        return _mfa_fernet().decrypt(blob.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        logger.warning("failed to decrypt MFA secret (key mismatch or malformed)")
        return None


def generate_totp_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _totp_code(secret: str, counter: int) -> str:
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded)
    digest = hmac.new(key, counter.to_bytes(8, "big"), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = int.from_bytes(digest[offset : offset + 4], "big") & 0x7FFFFFFF
    return str(value % (10**_TOTP_DIGITS)).zfill(_TOTP_DIGITS)


def totp_now(secret: str, at: float | None = None) -> str:
    moment = time.time() if at is None else at
    return _totp_code(secret, int(moment // _TOTP_PERIOD_S))


def verify_totp(secret: str, code: str | None, window: int = 1) -> bool:
    if not code or not code.isdigit() or len(code) != _TOTP_DIGITS:
        return False
    counter = int(time.time() // _TOTP_PERIOD_S)
    for offset in range(-window, window + 1):
        if hmac.compare_digest(_totp_code(secret, counter + offset), code):
            return True
    return False


def otpauth_uri(secret: str, username: str, issuer: str = "Krawlyx") -> str:
    from urllib.parse import quote, urlencode

    params = urlencode(
        {
            "secret": secret,
            "issuer": issuer,
            "algorithm": "SHA1",
            "digits": _TOTP_DIGITS,
            "period": _TOTP_PERIOD_S,
        }
    )
    return f"otpauth://totp/{quote(f'{issuer}:{username}')}?{params}"
