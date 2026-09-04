import sys
from pathlib import Path

_venv_site = Path(__file__).resolve().parents[1] / ".venv" / "Lib" / "site-packages"
if _venv_site.is_dir() and str(_venv_site) not in sys.path:
    sys.path.insert(0, str(_venv_site))

if sys.platform == "win32":
    import asyncio

    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    auth,
    database,
    datasets,
    engines,
    export_targets,
    health,
    jobs,
    schedules,
    users,
)
from app.api import settings as settings_api
from app.core.config import get_settings
from app.core.db import SessionLocal, upgrade_db
from app.core.logging_config import configure_logging
from app.services import jobs as jobs_svc
from app.services import scheduler as scheduler_svc
from app.services.users import bootstrap_admin

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    cfg = get_settings()
    cfg.db_path.parent.mkdir(parents=True, exist_ok=True)
    upgrade_db()
    with SessionLocal() as db:
        bootstrap_admin(db)
        from app.services.engines import bootstrap_default_engines

        bootstrap_default_engines(db)
    jobs_svc.start_dispatcher()
    scheduler_svc.start_scheduler()
    try:
        yield
    finally:
        scheduler_svc.shutdown_scheduler()
        jobs_svc.shutdown()


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(title=cfg.app_name, lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://.*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router, prefix="/api")
    app.include_router(auth.router, prefix="/api/auth")
    app.include_router(engines.router)
    app.include_router(jobs.router)
    app.include_router(datasets.router)
    app.include_router(export_targets.router)
    app.include_router(schedules.router)
    app.include_router(users.router)
    app.include_router(database.router)
    app.include_router(settings_api.router)
    # Serve the built SPA in production. The Vite dev server handles this in dev mode.
    if FRONTEND_DIST.is_dir() and (FRONTEND_DIST / "index.html").is_file():
        # Serve static hashed assets (JS/CSS) directly.
        if (FRONTEND_DIST / "assets").is_dir():
            app.mount(
                "/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets"
            )

        # SPA fallback: any non-API, non-asset path serves index.html with strict no-cache.
        @app.get("/{full_path:path}")
        async def spa_fallback(full_path: str):
            from starlette.responses import FileResponse

            target_file = FRONTEND_DIST / full_path
            if (
                full_path
                and target_file.is_file()
                and target_file.resolve().is_relative_to(FRONTEND_DIST)
            ):
                return FileResponse(str(target_file))

            return FileResponse(
                str(FRONTEND_DIST / "index.html"),
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )

    return app


app = create_app()
