"""Service meta endpoints."""

from fastapi import APIRouter

from app.core.config import get_settings, read_version

router = APIRouter(tags=["meta"])


@router.get("/health")
def health() -> dict[str, str]:
    settings = get_settings()
    return {"status": "ok", "app": settings.app_name, "version": read_version()}
