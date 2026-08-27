"""Session auth endpoints: login / logout / me (PRD §9)."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, verify_csrf
from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import CSRF_COOKIE, SESSION_COOKIE, issue_session
from app.models import User
from app.schemas import LoginRequest, LoginResponse, UserOut
from app.services import users as users_svc

router = APIRouter(tags=["auth"])


def _set_session_cookies(response: Response, token: str, csrf_token: str) -> None:
    settings = get_settings()
    common = {
        "max_age": settings.session_ttl_s,
        "samesite": "lax",
        "secure": settings.cookie_secure,
        "path": "/",
    }
    response.set_cookie(SESSION_COOKIE, token, httponly=True, **common)
    response.set_cookie(CSRF_COOKIE, csrf_token, httponly=False, **common)


@router.post("/login", response_model=LoginResponse)
def login(
    payload: LoginRequest, response: Response, db: Session = Depends(get_db)
) -> LoginResponse:
    user = users_svc.authenticate(db, payload.username, payload.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token, csrf_token = issue_session(user.id)
    _set_session_cookies(response, token, csrf_token)
    return LoginResponse(user=UserOut.model_validate(user), csrf_token=csrf_token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/logout", status_code=204, dependencies=[Depends(verify_csrf)])
def logout(response: Response, _user: User = Depends(get_current_user)) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
