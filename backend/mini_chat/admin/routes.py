"""Admin API routes."""
from fastapi import APIRouter, HTTPException, Depends

from .schemas import (
    PendingUsersResponse,
    ApproveUserRequest,
    RejectUserRequest,
    UsersListResponse,
    SetRoleRequest,
    ToggleRegistrationRequest,
    ToggleRegistrationResponse,
    AdminSettingsResponse,
    StatusResponse,
)
from .services import (
    get_pending_users,
    approve_user,
    reject_user,
    get_all_users,
    set_user_role,
    revoke_user_access,
    toggle_registration,
    get_admin_settings,
    get_system_status,
)
from ..dependencies import require_admin

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/pending", response_model=PendingUsersResponse)
async def list_pending_users(admin: str = Depends(require_admin)):
    """Get list of pending user approvals."""
    pending = get_pending_users()
    return PendingUsersResponse(pending=pending)


@router.post("/approve")
async def approve_pending_user(
    request: ApproveUserRequest,
    admin: str = Depends(require_admin)
):
    """Approve a pending user."""
    if not approve_user(request.approval_code, admin):
        raise HTTPException(status_code=404, detail="Pending user not found")

    return {"status": "ok"}


@router.post("/reject")
async def reject_pending_user(
    request: RejectUserRequest,
    _: str = Depends(require_admin)
):
    """Reject a pending user."""
    if not reject_user(request.approval_code):
        raise HTTPException(status_code=404, detail="Pending user not found")

    return {"status": "ok"}


@router.get("/users", response_model=UsersListResponse)
async def list_all_users(_: str = Depends(require_admin)):
    """Get list of all users."""
    users = get_all_users()
    return UsersListResponse(users=users)


@router.post("/set-role")
async def change_user_role(
    request: SetRoleRequest,
    _: str = Depends(require_admin)
):
    """Set user role."""
    if request.role not in ['admin', 'user']:
        raise HTTPException(status_code=400, detail="Invalid role")

    if not set_user_role(request.username, request.role):
        raise HTTPException(status_code=404, detail="User not found")

    return {"status": "ok"}


@router.delete("/revoke/{username}")
async def revoke_access(username: str, _: str = Depends(require_admin)):
    """Revoke user access."""
    if not revoke_user_access(username):
        raise HTTPException(
            status_code=400,
            detail="Cannot revoke access (user not found or last admin)"
        )

    return {"status": "ok"}


@router.post("/toggle-registration", response_model=ToggleRegistrationResponse)
async def toggle_reg(
    request: ToggleRegistrationRequest,
    _: str = Depends(require_admin)
):
    """Toggle registration enabled/disabled."""
    enabled = toggle_registration(request.enabled)
    return ToggleRegistrationResponse(enabled=enabled)


@router.get("/settings", response_model=AdminSettingsResponse)
async def get_settings(_: str = Depends(require_admin)):
    """Get admin settings."""
    settings = get_admin_settings()
    return AdminSettingsResponse(**settings)


@router.get("/status", response_model=StatusResponse)
async def get_status(_: str = Depends(require_admin)):
    """Get system status."""
    status = get_system_status()
    return StatusResponse(**status)
