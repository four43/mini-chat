"""Business logic for admin operations."""
from datetime import datetime
from typing import List, Dict, Optional

from ..database import get_db, get_setting, set_setting


def get_pending_users() -> List[Dict]:
    """Get all pending users."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT username, approval_code, registered_at
            FROM pending_users
            WHERE approved = 0
            ORDER BY registered_at DESC
        ''')

        return [dict(row) for row in cursor]


def approve_user(approval_code: str, admin_username: str) -> bool:
    """Approve a pending user."""
    with get_db() as conn:
        # Get pending user
        cursor = conn.execute('''
            SELECT username, credential_id, public_key
            FROM pending_users
            WHERE approval_code = ? AND approved = 0
        ''', (approval_code,))
        pending = cursor.fetchone()

        if not pending:
            return False

        # Check if this is the first user - make them admin automatically
        cursor = conn.execute('SELECT COUNT(*) as count FROM users')
        user_count = cursor.fetchone()['count']
        role = 'admin' if user_count == 0 else 'user'

        # Move to users table
        conn.execute('''
            INSERT INTO users (username, credential_id, public_key, role, approved, approved_at, approved_by)
            VALUES (?, ?, ?, ?, 1, ?, ?)
        ''', (pending['username'], pending['credential_id'], pending['public_key'], role,
              datetime.now().isoformat(), admin_username))

        # Mark as approved in pending_users
        conn.execute('''
            UPDATE pending_users
            SET approved = 1
            WHERE approval_code = ?
        ''', (approval_code,))

        conn.commit()
        return True


def reject_user(approval_code: str) -> bool:
    """Reject a pending user."""
    with get_db() as conn:
        cursor = conn.execute('''
            DELETE FROM pending_users
            WHERE approval_code = ? AND approved = 0
        ''', (approval_code,))
        conn.commit()
        return cursor.rowcount > 0


def get_all_users() -> List[Dict]:
    """Get all approved users."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT username, role, approved, approved_at, approved_by
            FROM users
            ORDER BY username
        ''')

        return [dict(row) for row in cursor]


def set_user_role(username: str, role: str) -> bool:
    """Set user role."""
    with get_db() as conn:
        cursor = conn.execute('''
            UPDATE users
            SET role = ?
            WHERE username = ?
        ''', (role, username))
        conn.commit()
        return cursor.rowcount > 0


def revoke_user_access(username: str) -> bool:
    """Revoke user access."""
    with get_db() as conn:
        # Check if this is the last admin
        if _is_last_admin(conn, username):
            return False

        cursor = conn.execute('DELETE FROM users WHERE username = ?', (username,))
        conn.commit()
        return cursor.rowcount > 0


def toggle_registration(enabled: bool) -> bool:
    """Toggle registration enabled/disabled."""
    set_setting('registration_enabled', 'true' if enabled else 'false')
    return enabled


def get_admin_settings() -> Dict:
    """Get admin settings."""
    return {
        'registration_enabled': get_setting('registration_enabled', 'false') == 'true'
    }


def get_system_status() -> Dict:
    """Get system status."""
    with get_db() as conn:
        users_count = conn.execute('SELECT COUNT(*) as count FROM users').fetchone()['count']
        pending_count = conn.execute('SELECT COUNT(*) as count FROM pending_users WHERE approved = 0').fetchone()['count']
        rooms_count = conn.execute('SELECT COUNT(DISTINCT room_id) as count FROM messages').fetchone()['count']
        messages_count = conn.execute('SELECT COUNT(*) as count FROM messages').fetchone()['count']

    return {
        'users_count': users_count,
        'pending_count': pending_count,
        'rooms_count': rooms_count,
        'messages_count': messages_count,
        'registration_enabled': get_setting('registration_enabled', 'false') == 'true'
    }


def _is_last_admin(conn, username: str) -> bool:
    """Check if user is the last admin."""
    cursor = conn.execute('''
        SELECT COUNT(*) as count
        FROM users
        WHERE role = 'admin'
    ''')
    admin_count = cursor.fetchone()['count']

    if admin_count <= 1:
        cursor = conn.execute('''
            SELECT role FROM users WHERE username = ?
        ''', (username,))
        row = cursor.fetchone()
        if row and row['role'] == 'admin':
            return True

    return False
