"""Server info API routes."""
from fastapi import APIRouter, Depends, HTTPException, Request

from .schemas import (
    ServerInfoResponse,
    UpdateRegistrationModeRequest,
    UpdateRegistrationModeResponse,
    InviteTokenListResponse,
    InviteTokenResponse,
    CreateInviteResponse,
    RegistrationStatusResponse,
    ServerThemeResponse,
    UpdateServerColorRequest,
    UpdateServerColorResponse,
)
from .services import (
    get_system_status,
    set_registration_mode,
    create_invite_token,
    get_invite_tokens,
    delete_invite_token,
)
from ..database import get_setting, set_setting
from ..dependencies import require_admin

router = APIRouter(prefix="/server", tags=["server"])


@router.get("", response_model=ServerInfoResponse)
async def get_server_info(_: str = Depends(require_admin)):
    """Get server info including settings and status."""
    status = get_system_status()
    return ServerInfoResponse(**status)


@router.get("/registration-status", response_model=RegistrationStatusResponse)
async def get_registration_status():
    """Get registration mode (public, no auth required)."""
    from ..auth.services import get_registration_mode
    mode = get_registration_mode()
    return RegistrationStatusResponse(mode=mode)


@router.put("/registration", response_model=UpdateRegistrationModeResponse)
async def update_registration_mode(
    request: UpdateRegistrationModeRequest,
    _: str = Depends(require_admin)
):
    """Update registration mode."""
    mode = set_registration_mode(request.mode)
    return UpdateRegistrationModeResponse(mode=mode)


@router.post("/invites", response_model=CreateInviteResponse)
async def create_invite(
    request: Request,
    admin_username: str = Depends(require_admin)
):
    """Create a new invite token (admin only)."""
    token = create_invite_token(admin_username)
    base_url = str(request.base_url).rstrip('/')
    invite_url = f"{base_url}/register.html?invite={token}"
    return CreateInviteResponse(token=token, invite_url=invite_url)


@router.get("/invites", response_model=InviteTokenListResponse)
async def list_invites(_: str = Depends(require_admin)):
    """List all invite tokens (admin only)."""
    tokens = get_invite_tokens()
    return InviteTokenListResponse(
        invites=[InviteTokenResponse(**t) for t in tokens]
    )


@router.delete("/invites/{token}")
async def remove_invite(token: str, _: str = Depends(require_admin)):
    """Delete an invite token (admin only)."""
    if not delete_invite_token(token):
        raise HTTPException(status_code=404, detail="Invite token not found")
    return {"status": "deleted"}


@router.get("/theme", response_model=ServerThemeResponse)
async def get_server_theme():
    """Get server theme color (public, no auth required)."""
    color = get_setting('server_color', '#6366f1') or '#6366f1'
    return ServerThemeResponse(server_color=color)


@router.put("/color", response_model=UpdateServerColorResponse)
async def update_server_color(
    request: UpdateServerColorRequest,
    _: str = Depends(require_admin)
):
    """Update server theme color (admin only)."""
    set_setting('server_color', request.server_color)
    return UpdateServerColorResponse(server_color=request.server_color)
