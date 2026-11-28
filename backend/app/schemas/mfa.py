"""Authenticator-app (TOTP) MFA schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class MfaLoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mfa_token: str = Field(min_length=1, max_length=500)
    code: str = Field(min_length=6, max_length=6)


class MfaSetupOut(BaseModel):
    secret: str
    otpauth_uri: str


class MfaVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=6, max_length=6)


class MfaDisableRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=6, max_length=6)


class MfaPolicyOut(BaseModel):
    required: bool


class MfaPolicyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    required: bool
