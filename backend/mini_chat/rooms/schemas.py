"""Pydantic schemas for rooms."""
from pydantic import BaseModel
from typing import List, Optional


class RoomInfo(BaseModel):
    room_id: str
    room_type: str  # "channel" or "dm"
    display_name: str  # "#general" or "alice"
    members: List[str] = []


class RoomListResponse(BaseModel):
    rooms: List[RoomInfo]


class CreateRoomRequest(BaseModel):
    room_id: str


class CreateRoomResponse(BaseModel):
    status: str
    room_id: str


class CreateDMRequest(BaseModel):
    username: str


class CreateDMResponse(BaseModel):
    status: str
    room: RoomInfo


class MessageResponse(BaseModel):
    id: int
    username: str
    message: str
    timestamp: str


class SendMessageRequest(BaseModel):
    message: str


class SendMessageResponse(BaseModel):
    status: str
    message: MessageResponse


class MessagesResponse(BaseModel):
    status: str
    messages: List[MessageResponse]


class DeleteRoomResponse(BaseModel):
    status: str
    room_id: str
