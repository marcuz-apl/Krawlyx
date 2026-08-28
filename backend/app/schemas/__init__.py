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
from app.schemas.export_targets import (
    ExportTargetCreate,
    ExportTargetOut,
    ExportTargetTestResult,
    ExportTargetUpdate,
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
    "ExportTargetCreate",
    "ExportTargetOut",
    "ExportTargetTestResult",
    "ExportTargetUpdate",
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
