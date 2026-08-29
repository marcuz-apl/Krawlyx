"""Application settings (pydantic-settings, env prefix ZENCRAWL_)."""

from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# repo root (backend/app/core/config.py -> parents[3]); ./data lives there per PRD §4.2
ROOT_DIR = Path(__file__).resolve().parents[3]
VERSION_FILE = ROOT_DIR / "VERSION"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ZENCRAWL_",
        env_file=(str(ROOT_DIR / ".env"), ".env"),
        extra="ignore",
    )

    app_name: str = "zenCrawl"
    # Required for any real deployment; the default keeps local dev frictionless.
    secret_key: str = "dev-insecure-secret-key"
    db_path: Path = ROOT_DIR / "data" / "zencrawl.db"
    session_ttl_s: int = 60 * 60 * 12
    cookie_secure: bool = False
    admin_user: str | None = None
    admin_password: str | None = None

    # M3 worker pool (NFR-01: ≥ 2 concurrent jobs, ≥ 10 concurrent targets).
    max_concurrent_jobs: int = 2
    max_parallel_targets_per_job: int = 10
    # FR-EXP-05 default; consumed by the M4 export pipeline.
    default_split_size_mb: int = 40
    # FR-SET-02..04: read-only in M5; consumed by the M6 engine adapters
    # (robots.txt compliance, per-domain interval, SSRF guard, content cap).
    robots_txt_enabled: bool = True
    per_domain_interval_s: float = 1.0
    ssrf_guard_enabled: bool = True
    content_size_cap_bytes: int = 5 * 1024 * 1024
    # M6 additions.
    # SSRF allow-list (FR-SET-03): when the guard is on and this list
    # is non-empty, only targets whose host matches an entry (suffix
    # match) are accepted. Empty list = block-by-default.
    ssrf_allow_list: list[str] = []
    # NFR-05: identifiable User-Agent `zenCrawl/0.1 (+{admin_contact_email})`.
    # Empty contact is allowed — the UA degrades to `zenCrawl/0.1`.
    admin_contact_email: str = ""

    @field_validator("ssrf_allow_list", mode="before")
    @classmethod
    def _parse_allow_list(cls, v: object) -> object:
        # Accept either a real list (programmatic callers) or a
        # comma-separated string (env var, e.g.
        # ZENCRAWL_SSRF_ALLOW_LIST=internal.example.com,other.internal).
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

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
