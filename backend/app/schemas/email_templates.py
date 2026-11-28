"""Admin-editable email template schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class EmailTemplate(BaseModel):
    subject: str = Field(max_length=200)
    body: str = Field(max_length=5000)


class EmailTemplatesOut(BaseModel):
    templates: dict[str, EmailTemplate]
    defaults: dict[str, EmailTemplate]


class EmailTemplatesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # None restores all bundled defaults.
    templates: dict[str, EmailTemplate] | None = None
