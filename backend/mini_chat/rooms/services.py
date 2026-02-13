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

            return messages


def load_rooms_from_db():
    """Load existing rooms from database."""
    with get_db() as conn:
        # Load rooms from the rooms table (non-deleted only)
        cursor = conn.execute('SELECT room_id FROM rooms WHERE deleted = 0')
        with ROOMS_LOCK:
            for row in cursor:
                ROOMS.add(row['room_id'])

        # Also pick up any rooms that exist in messages but not in the rooms table
        cursor = conn.execute('''
            SELECT DISTINCT m.room_id FROM messages m
            LEFT JOIN rooms r ON m.room_id = r.room_id
            WHERE r.room_id IS NULL
        ''')
        now = datetime.now().isoformat()
        for row in cursor:
            room_id = row['room_id']
            conn.execute(
                'INSERT INTO rooms (room_id, created_at) VALUES (?, ?)',
                (room_id, now)
            )
            with ROOMS_LOCK:
                ROOMS.add(room_id)
        conn.commit()


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

    now = datetime.now().isoformat()
    with get_db() as conn:
        conn.execute(
            'INSERT OR IGNORE INTO rooms (room_id, created_at) VALUES (?, ?)',
            (room_id, now)
        )
        conn.commit()
    return True


def delete_room(room_id: str, deleted_by: str) -> bool:
    """Soft-delete a room."""
    with ROOMS_LOCK:
        if room_id not in ROOMS:
            return False
        ROOMS.discard(room_id)

    now = datetime.now().isoformat()
    with get_db() as conn:
        conn.execute(
            'UPDATE rooms SET deleted = 1, deleted_at = ?, deleted_by = ? WHERE room_id = ?',
            (now, deleted_by, room_id)
        )
        conn.commit()
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
