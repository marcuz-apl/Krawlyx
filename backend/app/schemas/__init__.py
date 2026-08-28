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
from app.schemas.jobs import (
    JobCounts,
    JobCreate,
    JobDetailOut,
    JobOut,
    JobResultOut,
    JobResultsPage,
    JobSubmitAck,
    TargetOut,
)

__all__ = [
    "CapabilityList",
    "EngineCapabilities",
    "EngineCreate",
    "EngineOut",
    "EngineTestResult",
    "EngineUpdate",
    "JobCounts",
    "JobCreate",
    "JobDetailOut",
    "JobOut",
    "JobResultOut",
    "JobResultsPage",
    "JobSubmitAck",
    "LoginRequest",
    "LoginResponse",
    "TargetOut",
    "UserOut",
]
