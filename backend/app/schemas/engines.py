"""Engine API schemas (PRD §6.1, §9)."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.engines.base import Capabilities


class EngineCapabilities(BaseModel):
    """Per-type capabilities surface (drives the UI form rendering)."""

    type: str
    capabilities: Capabilities


class EngineCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    type: str
    config: dict[str, Any] = Field(default_factory=dict)
    pooled: bool = False


class EngineUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=120)
    config: dict[str, Any] | None = None
    pooled: bool | None = None
    disabled: bool | None = None


class EngineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    pooled: bool
    config_redacted: dict[str, Any]
    has_secret: bool
    disabled_at: str | None


class EngineTestResult(BaseModel):
    ok: bool
    detail: str
    latency_ms: int = 0


class CapabilityList(BaseModel):
    types: list[EngineCapabilities]
