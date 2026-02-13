from ..database import get_db
from typing import Dict, Optional

def get_user_preferences(username: str) -> Optional[Dict]:
    """Get preferences for a user. Returns None if not found."""
    with get_db() as conn:
        cursor = conn.execute(
            'SELECT username, color FROM user_preferences WHERE username = ?',
            (username,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None

def create_default_preferences(username: str) -> Dict:
    """Create default preferences for a user."""
    with get_db() as conn:
        conn.execute(
            'INSERT INTO user_preferences (username, color) VALUES (?, ?)',
            (username, '#1976d2')
        )
        conn.commit()
        return {'username': username, 'color': '#1976d2'}

def update_user_preferences(username: str, color: str) -> bool:
    """Update user preferences. Creates default if doesn't exist."""
    with get_db() as conn:
        # Check if preferences exist
        cursor = conn.execute(
            'SELECT username FROM user_preferences WHERE username = ?',
            (username,)
        )
        if cursor.fetchone():
            # Update existing
            conn.execute(
                'UPDATE user_preferences SET color = ? WHERE username = ?',
                (color, username)
            )
        else:
            # Insert new
            conn.execute(
                'INSERT INTO user_preferences (username, color) VALUES (?, ?)',
                (username, color)
            )
        conn.commit()
        return True

def get_all_user_preferences() -> Dict[str, str]:
    """Get all user preferences as a dict mapping username -> color."""
    with get_db() as conn:
        cursor = conn.execute('SELECT username, color FROM user_preferences')
        return {row['username']: row['color'] for row in cursor}
