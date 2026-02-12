"""Business logic for rooms."""
from datetime import datetime
from typing import List, Dict
import threading

from ..database import get_db

# Simple in-memory room registry
ROOMS = set()
ROOMS_LOCK = threading.Lock()


class ChatRoom:
    """Chat room that uses SQLite for message storage."""

    def __init__(self, room_id: str):
        self.room_id = room_id

    def add_message(self, username: str, message: str) -> Dict:
        """Add a message to the room."""
        timestamp = datetime.now().isoformat()

        with get_db() as conn:
            conn.execute('''
                INSERT INTO messages (room_id, username, message, timestamp)
                VALUES (?, ?, ?, ?)
            ''', (self.room_id, username, message, timestamp))
            conn.commit()

        return {
            'username': username,
            'message': message,
            'timestamp': timestamp
        }

    def get_messages(self, since: int = 0) -> List[Dict]:
        """Get messages since a certain ID."""
        with get_db() as conn:
            cursor = conn.execute('''
                SELECT id, username, message, timestamp
                FROM messages
                WHERE room_id = ? AND id > ?
                ORDER BY id
            ''', (self.room_id, since))

            messages = []
            for row in cursor:
                messages.append({
                    'id': row['id'],
                    'username': row['username'],
                    'message': row['message'],
                    'timestamp': row['timestamp']
                })

            print(f"[DEBUG] get_messages(room={self.room_id}, since={since}) -> {len(messages)} messages, IDs: {[m['id'] for m in messages]}")
            return messages


def load_rooms_from_db():
    """Load existing rooms from database."""
    with get_db() as conn:
        cursor = conn.execute('SELECT DISTINCT room_id FROM messages')
        with ROOMS_LOCK:
            for row in cursor:
                ROOMS.add(row['room_id'])


def get_all_rooms() -> List[str]:
    """Get list of all rooms."""
    with ROOMS_LOCK:
        return list(ROOMS)


def create_room(room_id: str) -> bool:
    """Create a new room."""
    with ROOMS_LOCK:
        if room_id in ROOMS:
            return False
        ROOMS.add(room_id)
        return True


def room_exists(room_id: str) -> bool:
    """Check if a room exists."""
    with ROOMS_LOCK:
        return room_id in ROOMS


def ensure_room_exists(room_id: str):
    """Ensure a room exists, create if it doesn't."""
    with ROOMS_LOCK:
        if room_id not in ROOMS:
            ROOMS.add(room_id)
