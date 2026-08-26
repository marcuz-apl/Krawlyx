"""App factory and ASGI entrypoint."""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import health
from app.core.config import get_settings
from app.core.db import upgrade_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    upgrade_db()
    # TODO(M1-auth): bootstrap admin from ZENCRAWL_ADMIN_USER/PASSWORD here.
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.include_router(health.router, prefix="/api")
    return app


app = create_app()
