"""User management: creation, authentication, and admin bootstrap."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password, verify_password
from app.models import User
from app.services import mailer

logger = logging.getLogger("mykrawl.users")


def get_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def count_users(db: Session) -> int:
    return len(db.scalars(select(User)).all())


def create_user(
    db: Session,
    username: str,
    password: str,
    role: str,
    email: str | None = None,
    must_change_password: bool = False,
) -> User:
    user = User(
        username=username,
        password_hash=hash_password(password),
        role=role,
        email=email,
        must_change_password=must_change_password,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("created %s '%s'", role, username)
    return user


def authenticate(db: Session, username: str, password: str) -> User | None:
    user = get_by_username(db, username)
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def send_welcome_email(email: str, username: str, password: str) -> bool:
    """Best-effort delivery of initial credentials; False when skipped or failed."""
    return mailer.send_email(
        to=email,
        subject="Your Krawlyx account",
        body=(
            "An account has been created for you on Krawlyx.\n\n"
            f"Username: {username}\n"
            f"Password: {password}\n\n"
            "You will be asked to set a new password on your first sign-in."
        ),
    )


def bootstrap_admin(db: Session) -> bool:
    """Create or ensure the bootstrap superadmin user; True when created or upgraded."""
    settings = get_settings()
    if not settings.admin_user or not settings.admin_password:
        logger.warning("MYKRAWL_ADMIN_USER/MYKRAWL_ADMIN_PASSWORD not set; skipping bootstrap")
        return False
    existing = get_by_username(db, settings.admin_user)
    if existing:
        if existing.role != "superadmin":
            existing.role = "superadmin"
            db.commit()
            logger.info("promoted existing bootstrap admin %r to superadmin", existing.username)
        return False
    if count_users(db) > 0:
        return False
    create_user(db, settings.admin_user, settings.admin_password, role="superadmin")
    return True
