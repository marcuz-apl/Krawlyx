"""Contact message schemas (public contact form)."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AccessRequestStatus = Literal["pending", "granted", "rejected"]


class ContactMessageCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=120)
    email: str = Field(min_length=3, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    subject: str = Field(min_length=1, max_length=255)
    message: str = Field(min_length=1, max_length=5000)


class ContactMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    subject: str
    message: str
    created_at: datetime


class AccessRequestOut(ContactMessageOut):
    status: AccessRequestStatus
    reviewed_at: datetime | None


class AccessRequestDecisionOut(AccessRequestOut):
    requester_notified: bool = False


class AccessRequestDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: AccessRequestStatus
    note: str | None = Field(default=None, max_length=2000)
