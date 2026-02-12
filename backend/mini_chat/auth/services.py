"""Business logic for authentication."""
import secrets
import hashlib
import base64
from datetime import datetime
from typing import Optional, Tuple

from ..database import get_db, get_setting


def generate_challenge() -> str:
    """Generate a WebAuthn challenge."""
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')


def store_challenge(challenge: str, challenge_type: str, username: Optional[str] = None):
    """Store a challenge in the database."""
    with get_db() as conn:
        conn.execute('''
            INSERT INTO challenges (challenge, type, username, timestamp)
            VALUES (?, ?, ?, ?)
        ''', (challenge, challenge_type, username, datetime.now().isoformat()))
        conn.commit()


def verify_challenge(challenge: str, challenge_type: str, username: Optional[str] = None) -> bool:
    """Verify and consume a challenge."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT * FROM challenges
            WHERE challenge = ? AND type = ?
        ''', (challenge, challenge_type))
        row = cursor.fetchone()

        if not row:
            return False

        if username and row['username'] and row['username'] != username:
            return False

        # Delete used challenge
        conn.execute('DELETE FROM challenges WHERE challenge = ?', (challenge,))
        conn.commit()

        return True


def is_registration_enabled() -> bool:
    """Check if registration is enabled."""
    return get_setting('registration_enabled', 'false') == 'true'


def generate_approval_code() -> str:
    """Generate a unique approval code."""
    return secrets.token_hex(6).upper()


def create_pending_user(username: str, credential_id: str, public_key: str) -> tuple[str, bool]:
    """Create a pending user and return approval code and whether auto-approved.

    Returns:
        tuple: (approval_code, is_first_user_auto_approved)
    """
    approval_code = generate_approval_code()

    with get_db() as conn:
        # Check if this is the first user
        cursor = conn.execute('SELECT COUNT(*) as count FROM users')
        user_count = cursor.fetchone()['count']

        if user_count == 0:
            # First user - auto-approve as admin
            conn.execute('''
                INSERT INTO users (username, credential_id, public_key, role, approved, approved_at, approved_by)
                VALUES (?, ?, ?, 'admin', 1, ?, 'system')
            ''', (username, credential_id, public_key, datetime.now().isoformat()))
            conn.commit()
            return (approval_code, True)
        else:
            # Subsequent users - require approval
            conn.execute('''
                INSERT INTO pending_users (username, credential_id, public_key, approval_code, registered_at)
                VALUES (?, ?, ?, ?, ?)
            ''', (username, credential_id, public_key, approval_code, datetime.now().isoformat()))
            conn.commit()
            return (approval_code, False)


def get_user_credentials(username: str) -> Optional[dict]:
    """Get user credentials for login."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT credential_id, public_key, role
            FROM users
            WHERE username = ? AND approved = 1
        ''', (username,))
        row = cursor.fetchone()

        if row:
            return {
                'credential_id': row['credential_id'],
                'public_key': row['public_key'],
                'role': row['role']
            }
        return None


def get_user_by_credential(credential_id: str) -> Optional[dict]:
    """Get user by credential ID."""
    with get_db() as conn:
        cursor = conn.execute('''
            SELECT username, role
            FROM users
            WHERE credential_id = ? AND approved = 1
        ''', (credential_id,))
        row = cursor.fetchone()

        if row:
            return {
                'username': row['username'],
                'role': row['role']
            }
        return None


def create_session_token(username: str) -> str:
    """Create a session token for a user."""
    token_data = f"{username}:{secrets.token_hex(32)}"
    return base64.urlsafe_b64encode(token_data.encode()).decode()


def get_user_from_session(token: str) -> Optional[Tuple[str, str]]:
    """Get username and role from session token."""
    try:
        decoded = base64.urlsafe_b64decode(token).decode('utf-8')
        username = decoded.split(':')[0]

        with get_db() as conn:
            cursor = conn.execute('''
                SELECT username, role
                FROM users
                WHERE username = ? AND approved = 1
            ''', (username,))
            row = cursor.fetchone()

            if row:
                return (row['username'], row['role'])
    except:
        pass

    return None
