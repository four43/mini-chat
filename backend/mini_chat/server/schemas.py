"""Pydantic schemas for server info."""
from pydantic import BaseModel


class ServerInfoResponse(BaseModel):
    registration_enabled: bool
    users_count: int
    pending_count: int
    rooms_count: int
    messages_count: int


class UpdateRegistrationRequest(BaseModel):
    enabled: bool


class UpdateRegistrationResponse(BaseModel):
    enabled: bool
