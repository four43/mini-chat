"""Pydantic schemas for rooms."""
from pydantic import BaseModel
from typing import List


class RoomListResponse(BaseModel):
    rooms: List[str]


class CreateRoomRequest(BaseModel):
    room_id: str


class CreateRoomResponse(BaseModel):
    status: str
    room_id: str


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
