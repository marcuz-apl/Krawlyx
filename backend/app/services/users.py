"""User management: creation, authentication, and admin bootstrap."""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models import User

logger = logging.getLogger("zencrawl.users")


def get_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def count_users(db: Session) -> int:
    return len(db.scalars(select(User)).all())


def create_user(db: Session, username: str, password: str, role: str) -> User:
    user = User(username=username, password_hash=hash_password(password), role=role)
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


def bootstrap_admin(db: Session) -> bool:
    """Create the bootstrap admin when the users table is empty; True when created."""
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.admin_user or not settings.admin_password:
        logger.warning("ZENCRAWL_ADMIN_USER/ZENCRAWL_ADMIN_PASSWORD not set; skipping bootstrap")
        return False
    if count_users(db) > 0:
        return False
    create_user(db, settings.admin_user, settings.admin_password, role="admin")
    return True
