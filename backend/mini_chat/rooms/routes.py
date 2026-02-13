"""Rooms API routes."""
from fastapi import APIRouter, HTTPException, Depends, WebSocket, WebSocketDisconnect
from typing import Optional
import json

from .schemas import (
    RoomListResponse,
    CreateRoomRequest,
    CreateRoomResponse,
    SendMessageRequest,
    SendMessageResponse,
    MessagesResponse,
    DeleteRoomResponse,
)
from .services import (
    get_all_rooms,
    create_room,
    delete_room,
    ensure_room_exists,
    ChatRoom,
)
from .websocket import manager
from ..dependencies import require_auth, require_admin, verify_token

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=RoomListResponse)
async def list_rooms():
    """Get list of all chat rooms."""
    return RoomListResponse(rooms=get_all_rooms())


@router.post("", response_model=CreateRoomResponse)
async def create_new_room(
    request: CreateRoomRequest,
    username: str = Depends(require_auth)
):
    """Create a new chat room."""
    if not create_room(request.room_id):
        raise HTTPException(status_code=400, detail="Room already exists")

    return CreateRoomResponse(status="ok", room_id=request.room_id)


@router.get("/{room_id}/messages", response_model=MessagesResponse)
async def get_room_messages(room_id: str, since: int = 0):
    """Get messages from a specific room."""
    # Ensure room exists
    ensure_room_exists(room_id)

    # Get messages directly using ChatRoom
    room = ChatRoom(room_id)
    messages = room.get_messages(since)

    return MessagesResponse(status="ok", messages=messages)


@router.post("/{room_id}/messages", response_model=SendMessageResponse)
async def send_room_message(
    room_id: str,
    request: SendMessageRequest,
    username: str = Depends(require_auth)
):
    """Send a message to a specific room."""
    # Ensure room exists
    ensure_room_exists(room_id)

    # Send message directly using ChatRoom
    room = ChatRoom(room_id)
    message = room.add_message(username, request.message)

    # Broadcast to WebSocket clients
    await manager.broadcast_to_room(room_id, {
        "type": "message",
        "data": message
    })

    return SendMessageResponse(status="ok", message=message)


@router.delete("/{room_id}", response_model=DeleteRoomResponse)
async def delete_room_endpoint(
    room_id: str,
    username: str = Depends(require_admin)
):
    """Soft-delete a chat room (admin only)."""
    if not delete_room(room_id, username):
        raise HTTPException(status_code=404, detail="Room not found")

    return DeleteRoomResponse(status="ok", room_id=room_id)


@router.websocket("/{room_id}/ws")
async def websocket_endpoint(websocket: WebSocket, room_id: str, token: Optional[str] = None):
    """WebSocket endpoint for real-time chat in a room."""
    # Verify authentication
    if not token:
        await websocket.close(code=1008, reason="Authentication required")
        return

    username = verify_token(token)
    if not username:
        await websocket.close(code=1008, reason="Invalid token")
        return

    # Ensure room exists
    ensure_room_exists(room_id)

    # Accept connection
    await manager.connect(websocket, room_id)

    try:
        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "room": room_id,
            "username": username
        })

        # Listen for messages from client
        while True:
            data = await websocket.receive_text()

            try:
                payload = json.loads(data)

                if payload.get("type") == "message":
                    # Save message to database
                    room = ChatRoom(room_id)
                    message = room.add_message(username, payload.get("message", ""))

                    # Broadcast to all clients in the room
                    await manager.broadcast_to_room(room_id, {
                        "type": "message",
                        "data": message
                    })

            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON"
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
        print(f"[WS] User {username} disconnected from room {room_id}")
    except Exception as e:
        print(f"[WS] Error in WebSocket connection: {e}")
        manager.disconnect(websocket, room_id)
