"""Auth request/response schemas."""

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


from datetime import datetime

class UserOut(BaseModel):
    id: int
    username: str
    role: str
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class LoginResponse(BaseModel):
    user: UserOut
    csrf_token: str
