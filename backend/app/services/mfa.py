"""Authenticator-app (TOTP) MFA: admin policy and per-user enrollment."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.security import (
    decrypt_mfa_secret,
    encrypt_mfa_secret,
    generate_totp_secret,
    otpauth_uri,
    verify_totp,
)
from app.models import User


def begin_setup(db: Session, user: User) -> tuple[str, str] | None:
    """Generate a fresh secret for enrollment; None when MFA is already enabled."""
    if user.mfa_enabled:
        return None
    secret = generate_totp_secret()
    user.mfa_secret_enc = encrypt_mfa_secret(secret)
    db.commit()
    return secret, otpauth_uri(secret, user.username)


def confirm_setup(db: Session, user: User, code: str) -> bool:
    secret = decrypt_mfa_secret(user.mfa_secret_enc)
    if not secret or not verify_totp(secret, code):
        return False
    user.mfa_enabled = True
    db.commit()
    return True


def verify_code(user: User, code: str) -> bool:
    secret = decrypt_mfa_secret(user.mfa_secret_enc)
    return bool(secret and user.mfa_enabled and verify_totp(secret, code))


def disable(db: Session, user: User) -> None:
    """Remove enrollment after the caller has re-authenticated password + code."""
    user.mfa_secret_enc = None
    user.mfa_enabled = False
    db.commit()
