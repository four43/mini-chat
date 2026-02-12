# syntax=docker/dockerfile:1

# Stage 1: Build frontend with Node.js and Vite
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install

COPY frontend/ ./

RUN npm run build

# Stage 2: Build Python backend
FROM python:3.13-slim

WORKDIR /app

ARG INSTALL_DEV_DEPS=1

# Copy backend files
COPY backend/util ./util
COPY backend/pyproject.toml backend/requirements.lock.* ./

# Install Python dependencies
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ "$INSTALL_DEV_DEPS" = "1" ]; then \
        INSTALL_TYPE="dev"; \
    else \
        INSTALL_TYPE=""; \
    fi && \
        ./util/install-dependencies "$INSTALL_TYPE"

# Copy backend source
COPY backend/ ./

# Copy built frontend from previous stage
COPY --from=frontend-builder /frontend/dist ./frontend/dist

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "-m", "uvicorn", "mini_chat.chat_server_webauthn:app", "--host", "0.0.0.0", "--port", "8000"]
