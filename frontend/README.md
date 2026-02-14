# Frontend - Mini Chat

Vanilla JavaScript (ES modules) + HTML + CSS, built with Vite.

## Directory Structure

```
frontend/
├── src/
│   ├── chat.js        # Main chat logic (WebSocket, rooms, messages)
│   ├── login.js       # Login page (WebAuthn assertion)
│   ├── register.js    # Registration page (WebAuthn credential creation)
│   ├── utils.js       # Shared utilities (escapeHtml, API helpers)
│   └── style.css      # All styles (desktop + mobile)
├── index.html         # Login page
├── login.html         # Login page (alternate entry)
├── register.html      # Registration page
└── chat.html          # Main chat interface
```

## Page Flow

1. `index.html` / `login.html` - User logs in with passkey
2. `register.html` - New users register (receive approval code to give admin)
3. `chat.html` - Main chat interface (requires authentication)

## State Management (chat.js)

```javascript
let sessionToken = null;        // Auth token (Base64)
let currentUsername = null;      // Logged-in username
let currentRole = null;          // 'user' or 'admin'
let currentRoom = null;          // Selected room ID
let lastMessageId = 0;           // Last seen message ID (for dedup)
let websocket = null;            // WebSocket connection
let reconnectAttempts = 0;       // Reconnection counter
let maxReconnectAttempts = 5;    // Max reconnect tries
```

## WebSocket Message Protocol

```javascript
// Client -> Server
{ type: "message", message: "Hello!" }

// Server -> Client
{ type: "connected", room: "general", username: "alice" }
{ type: "message", data: { id: 42, username: "bob", message: "Hi!", timestamp: "..." } }
{ type: "error", message: "Invalid JSON" }
```

## Key Behaviors

- **Session Check**: Auto-redirects to login if not authenticated
- **Room Selection**: Clears messages, loads history via HTTP, connects WebSocket
- **Message Display**: Unified `displayMessage()` for both history and real-time
- **Reconnection**: Exponential backoff (1s, 2s, 4s, 8s, 10s max), up to 5 attempts
- **Message Deduplication**: Tracks `lastMessageId`; HTTP uses `?since={lastMessageId}` (exclusive)
- **Mobile Sidebar**: Slide-out room list, auto-hides after room selection, hamburger toggle

## Mobile Support

- Responsive layout, breakpoint at 768px
- Sidebar hidden by default on mobile, shown when no room selected
- Hides on room select or overlay tap

## Environment Variables

- `VITE_API_URL` - API base URL (default: `/api`)

## Running

```bash
npm install
npm run dev  # Vite dev server on port 5173
```

## Adding Features

- Update `chat.js` and expose functions via `window.{funcName}`
- Styles go in `style.css`
- New pages need corresponding HTML files
