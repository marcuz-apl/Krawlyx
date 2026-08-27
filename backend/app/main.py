"""App factory and ASGI entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import auth, health
from app.core.config import get_settings
from app.core.db import SessionLocal, upgrade_db
from app.services.users import bootstrap_admin


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    upgrade_db()
    with SessionLocal() as db:
        bootstrap_admin(db)
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api/auth")
    return app


app = create_app()
