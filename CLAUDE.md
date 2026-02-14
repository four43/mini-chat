# Mini Chat

Real-time chat app with WebAuthn/Passkey auth. FastAPI backend, vanilla JS frontend, SQLite DB, WebSocket messaging.

## Detailed Documentation

Read these files on demand when working on specific areas:

- **Backend API & structure**: `backend/README.md`
- **Frontend architecture**: `frontend/README.md`
- **WebAuthn testing**: `docs/playwright-webauthn-testing.md`
- **Feature planning**: `docs/planning-feature-list.md`
- **E2E encryption design**: `docs/end-to-end-encryption.md`

## Project Structure

```
backend/mini_chat/       # FastAPI app
  auth/                  # WebAuthn registration/login
  rooms/                 # Chat rooms & WebSocket
  messages/              # Message search
  admin/                 # User management, settings
  database.py            # SQLite + WAL mode
  dependencies.py        # Auth middleware
  main.py                # App entry & router registration

frontend/src/            # Vanilla JS (Vite build)
  chat.js                # Main chat (WebSocket, rooms, messages)
  login.js / register.js # Auth pages
  utils.js               # Shared utilities
  style.css              # All styles
```

## Key Conventions

- Backend modules follow: `routes.py` (endpoints), `schemas.py` (Pydantic), `services.py` (logic)
- Frontend exposes functions via `window.{funcName}`
- Auth: WebAuthn credentials, session tokens in `Authorization: Bearer {token}`
- WebSocket auth via query param: `?token={sessionToken}`
- Messages use `?since={lastMessageId}` for deduplication (exclusive, returns id > since)
- Rooms use soft-delete (`deleted` flag)
- First registered user is auto-approved as admin

## Running

```bash
# Backend
cd backend && pip install -e . && uvicorn mini_chat.main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm install && npm run dev  # port 5173

# Docker
docker-compose up --build
```

## Debugging

- Backend logs: `[WS]`, `[HTTP]`, `[DEBUG]` prefixes in console
- Frontend logs: `[WS]`, `[HTTP]` in browser console
- WebSocket frames: browser DevTools > Network > WS
