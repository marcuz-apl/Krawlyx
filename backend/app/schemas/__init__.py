"""Pydantic API schemas — the contract source of truth (see AGENTS.md)."""

from app.schemas.auth import LoginRequest, LoginResponse, UserOut
from app.schemas.engines import (
    CapabilityList,
    EngineCapabilities,
    EngineCreate,
    EngineOut,
    EngineTestResult,
    EngineUpdate,
)

__all__ = [
    "CapabilityList",
    "EngineCapabilities",
    "EngineCreate",
    "EngineOut",
    "EngineTestResult",
    "EngineUpdate",
    "LoginRequest",
    "LoginResponse",
    "UserOut",
]
