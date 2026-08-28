"""App factory and ASGI entrypoint."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import auth, engines, health, jobs
from app.core.config import get_settings
from app.core.db import SessionLocal, upgrade_db
from app.services import jobs as jobs_svc
from app.services.users import bootstrap_admin

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    upgrade_db()
    with SessionLocal() as db:
        bootstrap_admin(db)
    jobs_svc.start_dispatcher()
    try:
        yield
    finally:
        jobs_svc.shutdown()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(engines.router)
    app.include_router(jobs.router)
    # Serve the built SPA in production. The Vite dev server handles this in dev mode.
    if FRONTEND_DIST.is_dir():
        app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="spa")
    return app


app = create_app()
