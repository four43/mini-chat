"""Server info API routes."""
from fastapi import APIRouter, Depends

from .schemas import (
    ServerInfoResponse,
    UpdateRegistrationRequest,
    UpdateRegistrationResponse,
)
from ..admin.services import get_system_status, toggle_registration
from ..dependencies import require_admin

router = APIRouter(prefix="/server", tags=["server"])


@router.get("", response_model=ServerInfoResponse)
async def get_server_info(_: str = Depends(require_admin)):
    """Get server info including settings and status."""
    status = get_system_status()
    return ServerInfoResponse(**status)


@router.put("/registration", response_model=UpdateRegistrationResponse)
async def update_registration(
    request: UpdateRegistrationRequest,
    _: str = Depends(require_admin)
):
    """Update registration enabled/disabled."""
    enabled = toggle_registration(request.enabled)
    return UpdateRegistrationResponse(enabled=enabled)
