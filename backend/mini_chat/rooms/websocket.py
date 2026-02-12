"""WebSocket connection manager for real-time chat."""
import json
from typing import Dict, Set
from fastapi import WebSocket
import asyncio


class ConnectionManager:
    """Manages WebSocket connections for chat rooms."""

    def __init__(self):
        # room_id -> set of WebSocket connections
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        """Accept a new WebSocket connection for a room."""
        await websocket.accept()

        if room_id not in self.active_connections:
            self.active_connections[room_id] = set()

        self.active_connections[room_id].add(websocket)
        print(f"[WS] Client connected to room '{room_id}'. Total connections: {len(self.active_connections[room_id])}")

    def disconnect(self, websocket: WebSocket, room_id: str):
        """Remove a WebSocket connection from a room."""
        if room_id in self.active_connections:
            self.active_connections[room_id].discard(websocket)
            print(f"[WS] Client disconnected from room '{room_id}'. Remaining connections: {len(self.active_connections[room_id])}")

            # Clean up empty rooms
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]
                print(f"[WS] Room '{room_id}' is now empty, removed from active connections")

    async def broadcast_to_room(self, room_id: str, message: dict):
        """Broadcast a message to all connections in a room."""
        if room_id not in self.active_connections:
            return

        # Create a copy of the set to avoid modification during iteration
        connections = self.active_connections[room_id].copy()

        disconnected = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                print(f"[WS] Error sending to connection: {e}")
                disconnected.append(connection)

        # Remove disconnected clients
        for connection in disconnected:
            self.disconnect(connection, room_id)

    def get_room_connection_count(self, room_id: str) -> int:
        """Get the number of active connections in a room."""
        return len(self.active_connections.get(room_id, set()))


# Global connection manager instance
manager = ConnectionManager()
