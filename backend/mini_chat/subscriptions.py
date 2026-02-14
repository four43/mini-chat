"""Generic WebSocket subscription manager for list endpoints.

Allows clients to subscribe to updates on any list resource (rooms, users, etc.).
When the resource changes for a specific user, all their subscribed connections
receive an update event.
"""
from typing import Dict, Set
from fastapi import WebSocket


class ListSubscriptionManager:
    """Manages per-user WebSocket subscriptions for a list resource."""

    def __init__(self, name: str):
        self.name = name
        # username -> set of WebSocket connections
        self.subscribers: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, username: str):
        """Accept and register a subscription."""
        await websocket.accept()

        if username not in self.subscribers:
            self.subscribers[username] = set()

        self.subscribers[username].add(websocket)
        print(f"[WS:{self.name}] {username} subscribed. "
              f"Total: {len(self.subscribers[username])}")

    def disconnect(self, websocket: WebSocket, username: str):
        """Remove a subscription."""
        if username in self.subscribers:
            self.subscribers[username].discard(websocket)
            if not self.subscribers[username]:
                del self.subscribers[username]
            print(f"[WS:{self.name}] {username} unsubscribed.")

    async def notify(self, username: str, event: dict = None):
        """Push an update event to all of a user's subscriptions."""
        if username not in self.subscribers:
            return

        if event is None:
            event = {"type": "update"}

        connections = self.subscribers[username].copy()
        disconnected = []

        for ws in connections:
            try:
                await ws.send_json(event)
            except Exception:
                disconnected.append(ws)

        for ws in disconnected:
            self.disconnect(ws, username)

    async def notify_all(self, event: dict = None):
        """Push an update event to all subscribers."""
        for username in list(self.subscribers.keys()):
            await self.notify(username, event)
