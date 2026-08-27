"""Shared API dependencies: current-user resolution and CSRF enforcement."""

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import CSRF_COOKIE, SESSION_COOKIE, read_session, tokens_match
from app.models import User


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    session = read_session(request.cookies.get(SESSION_COOKIE))
    if session is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = db.get(User, session.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    request.state.session_data = session
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    return user


def verify_csrf(request: Request, _user: User = Depends(get_current_user)) -> None:
    """Double-submit check: X-CSRF-Token header must match the signed session payload."""
    session = getattr(request.state, "session_data", None)
    header = request.headers.get("x-csrf-token")
    cookie = request.cookies.get(CSRF_COOKIE)
    if (
        session is None
        or not tokens_match(header, session.csrf_token)
        or not tokens_match(cookie, session.csrf_token)
    ):
        raise HTTPException(status_code=403, detail="CSRF token missing or invalid")
