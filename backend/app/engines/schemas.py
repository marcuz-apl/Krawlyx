"""Per-engine configuration schemas (PRD §6.1 FR-ENG-02).

The schema is type-dispatched by the engine `type` string so the same API surface
serves every engine kind. New engine types just add a new branch — no admin
schema change required.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

EngineType = Literal["crawl4ai", "scrapy"]


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Crawl4AIConfig(_StrictModel):
    headless: bool = True
    browser_timeout_s: int = Field(default=30, ge=1, le=300)
    text_mode: bool = False
    user_agent: str = "zenCrawl/0.1 (+local)"
    wait_for: str | None = None
    follow_links: bool = False
    max_depth: int = Field(default=1, ge=1, le=5)
    max_pages_per_target: int = Field(default=50, ge=1, le=200)


class ScrapyConfig(_StrictModel):
    concurrency: int = Field(default=8, ge=1, le=64)
    download_delay_s: float = Field(default=0.0, ge=0.0, le=60.0)
    autothrottle: bool = True
    user_agent: str = "zenCrawl/0.1 (+local)"
    follow_links: bool = True
    max_depth: int = Field(default=2, ge=1, le=10)
    max_pages_per_target: int = Field(default=100, ge=1, le=10_000)
    allowed_domains: list[str] = Field(default_factory=list)

    @field_validator("allowed_domains", mode="before")
    @classmethod
    def _strip(cls, v: object) -> object:
        if isinstance(v, str):
            return [d.strip() for d in v.split(",") if d.strip()]
        return v


def config_model_for(engine_type: str) -> type[BaseModel]:
    return {"crawl4ai": Crawl4AIConfig, "scrapy": ScrapyConfig}[engine_type]


__all__ = [
    "Crawl4AIConfig",
    "EngineType",
    "ScrapyConfig",
    "config_model_for",
]


# Re-export HttpUrl so other modules can import it from one place.
_ = HttpUrl
