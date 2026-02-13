# Mini Chat - Real-time Chat Application

## Overview

Mini Chat is a secure, real-time chat application with WebAuthn/Passkey authentication. Users authenticate using hardware security keys or biometrics (fingerprint, Face ID, etc.) instead of passwords.

## Architecture

### Tech Stack

- **Backend**: FastAPI (Python) with WebSockets
- **Frontend**: Vanilla JavaScript (ES modules), HTML, CSS
- **Database**: SQLite with WAL mode
- **Authentication**: WebAuthn (Passkeys)
- **Real-time**: WebSocket connections for instant messaging

### Project Structure

```
/workspace
├── backend/
│   └── mini_chat/
│       ├── auth/          # WebAuthn authentication
│       ├── rooms/         # Chat rooms & WebSocket
│       ├── messages/      # Message search
│       ├── admin/         # Admin panel functionality
│       ├── database.py    # SQLite connection & schema
│       ├── dependencies.py # Auth middleware
│       └── main.py        # FastAPI app entry
├── frontend/
│   ├── src/
│   │   ├── chat.js        # Main chat logic (WebSocket)
│   │   ├── login.js       # Login page
│   │   ├── register.js    # Registration page
│   │   ├── utils.js       # Shared utilities
│   │   └── style.css      # All styles (desktop + mobile)
│   ├── index.html         # Login page
│   ├── login.html         # Login page (duplicate)
│   ├── register.html      # Registration page
│   └── chat.html          # Main chat interface
└── docker-compose.yml     # Container orchestration
```

## Key Features

### Authentication

>[!Note]
> WebAuthn/Passkeys in Playright require a virtual authenticator setup. See [Testing WebAuthn with Playwright](./docs/playwright-webauthn-testing.md) for details.

- **WebAuthn/Passkey**: Passwordless authentication using hardware keys or biometrics
- **Admin Approval**: First user auto-approved as admin, others require approval
- **Approval Codes**: 6-character codes for verifying new user registrations
- **Session Tokens**: Base64-encoded tokens for HTTP/WebSocket auth

### Chat Features

- **Multi-room**: Create and switch between chat rooms
- **Real-time**: WebSocket connections for instant message delivery
- **Message History**: HTTP endpoint loads past messages when joining rooms
- **Auto-reconnect**: Exponential backoff reconnection on disconnect (up to 5 attempts)

### Admin Features

- **User Management**: Approve/reject pending users, promote/demote admins, delete users
- **Registration Control**: Toggle registration on/off (enable when friends are nearby)
- **Pending Approvals**: Real-time list of users awaiting approval

### Mobile Support

- **Responsive Design**: Mobile-first responsive layout (breakpoint: 768px)
- **Slide-out Sidebar**: Room list slides from left on mobile
- **Auto-hide**: Sidebar auto-hides after selecting room
- **Touch-friendly**: Large tap targets, proper input sizing

## Database Schema

### users

- `username` (TEXT, PRIMARY KEY)
- `credential_id` (TEXT) - WebAuthn credential ID
- `public_key` (TEXT) - WebAuthn public key
- `role` (TEXT) - 'user' or 'admin'
- `approved` (BOOLEAN)
- `approved_at` (TEXT)
- `approved_by` (TEXT)

### pending_users

- `username` (TEXT, PRIMARY KEY)
- `credential_id` (TEXT)
- `public_key` (TEXT)
- `approval_code` (TEXT, UNIQUE) - 6-character code
- `registered_at` (TEXT)
- `approved` (BOOLEAN)

### rooms

- `room_id` (TEXT, PRIMARY KEY)
- `created_at` (TEXT)
- `deleted` (BOOLEAN, DEFAULT 0) - Soft-delete flag
- `deleted_at` (TEXT)
- `deleted_by` (TEXT)

### messages

- `id` (INTEGER, PRIMARY KEY AUTOINCREMENT)
- `room_id` (TEXT)
- `username` (TEXT)
- `message` (TEXT)
- `timestamp` (TEXT)

### settings

- `key` (TEXT, PRIMARY KEY)
- `value` (TEXT)

### challenges

- `challenge` (TEXT, PRIMARY KEY)
- `type` (TEXT) - 'register' or 'login'
- `username` (TEXT)
- `timestamp` (TEXT)

## API Endpoints

### Authentication

- `POST /api/auth/register/begin` - Start registration
- `POST /api/auth/register/complete` - Finish registration
- `POST /api/auth/login/begin` - Start login
- `POST /api/auth/login/complete` - Finish login
- `GET /api/auth/session` - Check session validity

### Rooms

- `GET /api/rooms` - List all rooms
- `POST /api/rooms` - Create room (auth required)
- `DELETE /api/rooms/{room_id}` - Soft-delete room (admin only)
- `GET /api/rooms/{room_id}/messages?since={id}` - Get messages (id > since)
- `POST /api/rooms/{room_id}/messages` - Send message (auth required)
- `WS /api/rooms/{room_id}/ws?token={token}` - WebSocket connection

### Users

- `GET /api/users` - List all users (admin only)
- `GET /api/users/pending` - List pending approvals (admin only)
- `POST /api/users/pending/approve` - Approve user (admin only)
- `POST /api/users/pending/reject` - Reject user (admin only)
- `PUT /api/users/{username}/role` - Change user role (admin only)
- `DELETE /api/users/{username}` - Delete user (admin only)
- `GET /api/users/preferences/colors` - Get all users' color preferences (auth required)
- `GET /api/users/{username}/preferences` - Get user preferences (own or admin)
- `PUT /api/users/{username}/preferences` - Update user preferences (own or admin)

### Server

- `GET /api/server` - Get server info & settings (admin only)
- `PUT /api/server/registration` - Update registration enabled/disabled (admin only)

### Messages

- `GET /api/messages` - Search messages across rooms (auth required)

## Frontend Architecture

### Page Flow

1. **index.html/login.html** → User logs in with passkey
2. **register.html** → New users register (get approval code)
3. **chat.html** → Main chat interface (after authentication)

### Chat Logic (chat.js)

- **Session Check**: Auto-redirects to login if not authenticated
- **Room Selection**: Clears messages, loads history (HTTP), connects WebSocket
- **Message Display**: Unified `displayMessage()` for history + real-time
- **WebSocket**: Handles connect, message, error, disconnect events
- **Reconnection**: Exponential backoff (1s, 2s, 4s, 8s, 10s max)

### State Management

```javascript
let sessionToken = null;        // Auth token (Base64)
let currentUsername = null;     // Logged-in username
let currentRole = null;         // 'user' or 'admin'
let currentRoom = null;         // Selected room ID
let lastMessageId = 0;          // Last seen message ID
let websocket = null;           // WebSocket connection
let reconnectAttempts = 0;      // Reconnection counter
let maxReconnectAttempts = 5;   // Max reconnect tries
```

### WebSocket Message Protocol

```javascript
// Client → Server
{ type: "message", message: "Hello!" }

// Server → Client
{ type: "connected", room: "general", username: "alice" }
{ type: "message", data: { id: 42, username: "bob", message: "Hi!", timestamp: "..." } }
{ type: "error", message: "Invalid JSON" }
```

## How to Run

### Development

```bash
# Backend
cd backend
pip install -e .
uvicorn mini_chat.main:app --reload --host 0.0.0.0 --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev  # Vite dev server on port 5173
```

### Docker Compose

```bash
docker-compose up --build
# Backend: http://localhost:8000
# Frontend: http://localhost:5173
```

### Environment Variables

- `VITE_API_URL` - API base URL (default: '/api')
- Frontend `.env` example:

  ```
  VITE_API_URL=http://localhost:8000/api
  ```

## Important Notes

### Authentication Flow

1. **Register**: User provides username → WebAuthn creates credential → Server stores public key
2. **Approval**: Admin sees approval code → Approves user → User can login
3. **Login**: WebAuthn asserts identity → Server verifies signature → Returns session token
4. **Session**: Token sent in `Authorization: Bearer {token}` header

### WebSocket Authentication

- Token passed as query parameter: `?token={sessionToken}`
- Backend calls `verify_token(token)` to validate
- Connection rejected if token invalid

### Message Deduplication

- Frontend tracks `lastMessageId` (highest ID seen)
- HTTP requests use `?since={lastMessageId}` (exclusive, returns id > since)
- WebSocket messages update `lastMessageId` on arrival
- No duplicate messages even with concurrent HTTP/WS

### Mobile Behavior

- Sidebar hidden by default on mobile (< 768px width)
- Shows automatically when no room selected
- Hides when room selected or overlay tapped
- Hamburger menu (☰) toggles sidebar

## Recent Improvements

1. **WebSocket Migration**: Replaced 2-second polling with real-time WebSocket connections
2. **Message ID Tracking**: Fixed duplicate messages by using actual message IDs instead of counting
3. **Mobile UX**: Added slide-out sidebar with auto-hide behavior
4. **Multi-page Structure**: Separated login, register, and chat into distinct pages
5. **Room Switching**: Fixed bug where messages weren't cleared when switching rooms

## Development Tips

### Adding New Features

- Backend routes: Add to `/backend/mini_chat/{module}/routes.py`
- Schemas: Define Pydantic models in `schemas.py`
- Frontend: Update `chat.js` and expose functions via `window.{funcName}`

### Debugging

- Backend logs: Check console for `[WS]`, `[HTTP]`, `[DEBUG]` prefixes
- Frontend logs: Open browser console, look for `[WS]`, `[HTTP]` logs
- WebSocket: Use browser DevTools → Network → WS to inspect frames

### Common Issues

- **WebSocket fails**: Check token is passed correctly in URL
- **Messages duplicated**: Ensure `lastMessageId` is properly tracked
- **Mobile sidebar stuck**: Check that `hideSidebar()` is called after room selection
- **Auth fails**: Verify WebAuthn is supported (requires HTTPS or localhost)

## Security Considerations

- **WebAuthn**: Cryptographically secure, phishing-resistant
- **No passwords**: Eliminates password-related vulnerabilities
- **Session tokens**: Short-lived, single-purpose (not JWTs)
- **Admin approval**: Prevents unauthorized registrations
- **SQLite WAL**: Concurrent reads/writes without locking issues
- **Input sanitization**: `escapeHtml()` prevents XSS attacks

## Future Enhancements (Ideas)

- [ ] Direct messages / private rooms
- [ ] File/image sharing
- [ ] Message reactions (emoji)
- [ ] Typing indicators
- [ ] Read receipts
- [ ] User presence (online/offline)
- [ ] Message search
- [ ] Notification system
- [ ] Dark mode toggle
- [ ] User avatars
- [ ] Message editing/deletion
- [ ] Room permissions/roles
