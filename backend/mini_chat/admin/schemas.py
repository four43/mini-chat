"""Pydantic schemas for admin operations."""
from pydantic import BaseModel
from typing import List


class PendingUser(BaseModel):
    username: str
    approval_code: str
    registered_at: str


class PendingUsersResponse(BaseModel):
    pending: List[PendingUser]


class ApproveUserRequest(BaseModel):
    approval_code: str


class RejectUserRequest(BaseModel):
    approval_code: str


class UserInfo(BaseModel):
    username: str
    role: str
    approved: bool
    approved_at: str | None
    approved_by: str | None


class UsersListResponse(BaseModel):
    users: List[UserInfo]


class SetRoleRequest(BaseModel):
    username: str
    role: str


class ToggleRegistrationRequest(BaseModel):
    enabled: bool


class ToggleRegistrationResponse(BaseModel):
    enabled: bool


class AdminSettingsResponse(BaseModel):
    registration_enabled: bool


class StatusResponse(BaseModel):
    users_count: int
    pending_count: int
    rooms_count: int
    messages_count: int
    registration_enabled: bool
