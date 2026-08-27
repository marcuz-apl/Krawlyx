"""Application settings (pydantic-settings, env prefix ZENCRAWL_)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# repo root (backend/app/core/config.py -> parents[3]); ./data lives there per PRD §4.2
ROOT_DIR = Path(__file__).resolve().parents[3]
VERSION_FILE = ROOT_DIR / "VERSION"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ZENCRAWL_", env_file=".env", extra="ignore")

    app_name: str = "zenCrawl"
    # Required for any real deployment; the default keeps local dev frictionless.
    secret_key: str = "dev-insecure-secret-key"
    db_path: Path = ROOT_DIR / "data" / "zencrawl.db"
    session_ttl_s: int = 60 * 60 * 12
    cookie_secure: bool = False
    admin_user: str | None = None
    admin_password: str | None = None

    @property
    def db_url(self) -> str:
        return f"sqlite:///{self.db_path.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def read_version() -> str:
    """Return the alfazen identifier from the tracked root VERSION file."""
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip() or "unknown"
    except OSError:
        return "unknown"
