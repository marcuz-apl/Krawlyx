"""Session auth endpoints: login / logout / me (PRD §9)."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, verify_csrf
from app.core.config import get_settings
from app.core.db import get_db
from app.core.security import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    hash_password,
    issue_mfa_token,
    issue_session,
    read_mfa_token,
    verify_password,
)
from app.models import User
from app.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MfaDisableRequest,
    MfaLoginRequest,
    MfaSetupOut,
    MfaVerifyRequest,
    UserOut,
)
from app.services import mfa as mfa_svc
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
    if user.mfa_enabled:
        return LoginResponse(
            user=UserOut.model_validate(user),
            mfa_required=True,
            mfa_token=issue_mfa_token(user.id),
        )
    token, csrf_token = issue_session(user.id)
    _set_session_cookies(response, token, csrf_token)
    return LoginResponse(user=UserOut.model_validate(user), csrf_token=csrf_token)


@router.post("/login/mfa", response_model=LoginResponse)
def login_mfa(
    payload: MfaLoginRequest, response: Response, db: Session = Depends(get_db)
) -> LoginResponse:
    user_id = read_mfa_token(payload.mfa_token)
    if user_id is None:
        raise HTTPException(status_code=401, detail="MFA challenge expired; sign in again")
    user = db.get(User, user_id)
    if user is None or not mfa_svc.verify_code(user, payload.code):
        raise HTTPException(status_code=401, detail="Invalid authentication code")
    token, csrf_token = issue_session(user.id)
    _set_session_cookies(response, token, csrf_token)
    return LoginResponse(user=UserOut.model_validate(user), csrf_token=csrf_token)


@router.post("/mfa/setup", response_model=MfaSetupOut, dependencies=[Depends(verify_csrf)])
def mfa_setup(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MfaSetupOut:
    result = mfa_svc.begin_setup(db, user)
    if result is None:
        raise HTTPException(status_code=400, detail="MFA is already enabled for this account")
    secret, uri = result
    return MfaSetupOut(secret=secret, otpauth_uri=uri)


@router.post("/mfa/verify", status_code=204, dependencies=[Depends(verify_csrf)])
def mfa_verify(
    payload: MfaVerifyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not mfa_svc.confirm_setup(db, user, payload.code):
        raise HTTPException(status_code=400, detail="Invalid authentication code")


@router.post("/mfa/disable", status_code=204, dependencies=[Depends(verify_csrf)])
def mfa_disable(
    payload: MfaDisableRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is not enabled for this account")
    if user.mfa_required:
        raise HTTPException(
            status_code=400,
            detail="MFA is required for this account; ask an administrator to clear the requirement",
        )
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if not mfa_svc.verify_code(user, payload.code):
        raise HTTPException(status_code=400, detail="Invalid authentication code")
    mfa_svc.disable(db, user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)


@router.post("/change-password", status_code=204, dependencies=[Depends(verify_csrf)])
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    db.commit()


@router.post("/logout", status_code=204, dependencies=[Depends(verify_csrf)])
def logout(response: Response, _user: User = Depends(get_current_user)) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
