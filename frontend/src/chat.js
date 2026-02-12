import './style.css';
import { API_URL, escapeHtml } from './utils.js';

let sessionToken = null;
let currentUsername = null;
let currentRole = null;
let currentRoom = null;
let lastMessageId = 0;
let websocket = null;
let adminPollInterval = null;
let isLoadingMessages = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;
let reconnectTimeout = null;

// Check session and redirect if not authenticated
checkSession();

async function checkSession() {
    const token = localStorage.getItem('session_token');
    const username = localStorage.getItem('username');
    const role = localStorage.getItem('role');

    if (!token || !username) {
        // Not logged in, redirect to login
        window.location.href = '/login.html';
        return;
    }

    try {
        const resp = await fetch(`${API_URL}/auth/session`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await resp.json();

        if (data.authenticated) {
            sessionToken = token;
            currentUsername = username;
            currentRole = data.role;
            localStorage.setItem('role', data.role);
            initializeChatView();
        } else {
            // Session invalid, clear and redirect
            localStorage.removeItem('session_token');
            localStorage.removeItem('username');
            localStorage.removeItem('role');
            window.location.href = '/login.html';
        }
    } catch (error) {
        console.error('Session check failed:', error);
        window.location.href = '/login.html';
    }
}

function initializeChatView() {
    document.getElementById('currentUser').textContent = `👤 ${currentUsername}`;

    if (currentRole === 'admin') {
        document.getElementById('adminBadge').classList.remove('hidden');
        document.getElementById('adminPanelBtn').classList.remove('hidden');
        loadAdminSettings();
        adminPollInterval = setInterval(loadPendingUsers, 5000);
    }

    loadRooms();

    // Show sidebar on mobile if no room is selected
    if (window.innerWidth <= 768 && !currentRoom) {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        sidebar.classList.add('show');
        overlay.classList.add('show');
    }
}

function logout() {
    sessionToken = null;
    currentUsername = null;
    currentRole = null;
    localStorage.removeItem('session_token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');

    if (websocket) {
        websocket.close();
        websocket = null;
    }
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (adminPollInterval) clearInterval(adminPollInterval);

    window.location.href = '/login.html';
}

function toggleAdminPanel() {
    document.getElementById('adminPanel').classList.toggle('open');
}

async function loadAdminSettings() {
    try {
        const resp = await fetch(`${API_URL}/admin/settings`, {
            headers: { 'Authorization': `Bearer ${sessionToken}` }
        });
        const data = await resp.json();

        updateRegistrationToggle(data.registration_enabled);
        loadPendingUsers();
        loadAllUsers();
    } catch (error) {
        console.error('Failed to load admin settings:', error);
    }
}

function updateRegistrationToggle(enabled) {
    const toggle = document.getElementById('regToggle');
    const status = document.getElementById('regStatus');

    if (enabled) {
        toggle.classList.add('active');
        status.textContent = 'Registration Enabled';
    } else {
        toggle.classList.remove('active');
        status.textContent = 'Registration Disabled';
    }
}

async function toggleRegistration() {
    const toggle = document.getElementById('regToggle');
    const enabled = !toggle.classList.contains('active');

    try {
        const resp = await fetch(`${API_URL}/admin/toggle-registration`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ enabled })
        });
        const data = await resp.json();

        updateRegistrationToggle(data.enabled);
    } catch (error) {
        console.error('Failed to toggle registration:', error);
    }
}

async function loadPendingUsers() {
    try {
        const resp = await fetch(`${API_URL}/admin/pending`, {
            headers: { 'Authorization': `Bearer ${sessionToken}` }
        });
        const data = await resp.json();

        const pendingList = document.getElementById('pendingList');
        const pendingCount = document.getElementById('pendingCount');

        pendingCount.textContent = data.pending.length;

        if (data.pending.length === 0) {
            pendingList.innerHTML = '<p style="color: #999;">No pending approvals</p>';
        } else {
            pendingList.innerHTML = data.pending.map(user => `
                <div class="pending-user">
                    <h4>👤 ${user.username}</h4>
                    <div class="code">Code: ${user.approval_code}</div>
                    <div style="font-size: 12px; color: #666;">${new Date(user.registered_at).toLocaleString()}</div>
                    <div class="pending-user-actions">
                        <button class="approve-btn" onclick="window.approveUser('${user.approval_code}')">✓ Approve</button>
                        <button class="reject-btn" onclick="window.rejectUser('${user.approval_code}')">✕ Reject</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load pending users:', error);
    }
}

async function approveUser(code) {
    try {
        const resp = await fetch(`${API_URL}/admin/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ approval_code: code })
        });

        if (resp.ok) {
            loadPendingUsers();
            loadAllUsers();
        }
    } catch (error) {
        console.error('Failed to approve user:', error);
    }
}

async function rejectUser(code) {
    try {
        const resp = await fetch(`${API_URL}/admin/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ approval_code: code })
        });

        if (resp.ok) {
            loadPendingUsers();
        }
    } catch (error) {
        console.error('Failed to reject user:', error);
    }
}

async function loadAllUsers() {
    try {
        const resp = await fetch(`${API_URL}/admin/users`, {
            headers: { 'Authorization': `Bearer ${sessionToken}` }
        });
        const data = await resp.json();

        const usersList = document.getElementById('usersList');
        const userCount = document.getElementById('userCount');

        userCount.textContent = data.users.length;

        if (data.users.length === 0) {
            usersList.innerHTML = '<p style="color: #999;">No users</p>';
        } else {
            usersList.innerHTML = data.users.map(user => `
                <div class="user-item">
                    <div class="user-info">
                        <span class="user-name">${user.username}</span>
                        <span class="user-role ${user.role}">${user.role.toUpperCase()}</span>
                    </div>
                    <div class="user-actions">
                        ${user.role === 'user'
                            ? `<button class="promote-btn" onclick="window.setUserRole('${user.username}', 'admin')">Make Admin</button>`
                            : `<button class="demote-btn" onclick="window.setUserRole('${user.username}', 'user')">Remove Admin</button>`
                        }
                        ${user.username !== currentUsername
                            ? `<button class="delete-btn" onclick="window.deleteUser('${user.username}')">Delete</button>`
                            : ''
                        }
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

async function setUserRole(username, role) {
    if (!confirm(`Are you sure you want to ${role === 'admin' ? 'promote' : 'demote'} ${username}?`)) {
        return;
    }

    try {
        const resp = await fetch(`${API_URL}/admin/set-role`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ username, role })
        });

        if (resp.ok) {
            loadAllUsers();
        } else {
            const data = await resp.json();
            alert(`Failed: ${data.detail || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Failed to set user role:', error);
        alert('Failed to change user role');
    }
}

async function deleteUser(username) {
    if (!confirm(`Are you sure you want to delete user "${username}"? This cannot be undone.`)) {
        return;
    }

    try {
        const resp = await fetch(`${API_URL}/admin/revoke/${encodeURIComponent(username)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${sessionToken}` }
        });

        if (resp.ok) {
            loadAllUsers();
        } else {
            const data = await resp.json();
            alert(`Failed: ${data.detail || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Failed to delete user:', error);
        alert('Failed to delete user');
    }
}

async function loadRooms() {
    try {
        const response = await fetch(`${API_URL}/rooms`);
        const data = await response.json();

        const roomList = document.getElementById('roomList');
        roomList.innerHTML = '';

        data.rooms.forEach(room => {
            const item = document.createElement('div');
            item.className = 'room-item';
            item.textContent = room;
            item.onclick = () => selectRoom(room);
            roomList.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading rooms:', error);
    }
}

async function createRoom() {
    const input = document.getElementById('newRoomInput');
    const roomId = input.value.trim();

    if (!roomId) {
        alert('Please enter a room name');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/rooms`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ room_id: roomId })
        });

        const data = await response.json();

        if (data.detail) {
            alert(data.detail);
        } else {
            input.value = '';
            loadRooms();
            selectRoom(roomId);
        }
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Failed to create room');
    }
}

function selectRoom(roomId) {
    // Don't do anything if already in this room
    if (currentRoom === roomId) {
        // Just hide sidebar on mobile if clicking the same room
        if (window.innerWidth <= 768) {
            hideSidebar();
        }
        return;
    }

    // Close existing WebSocket if any
    if (websocket) {
        websocket.close();
        websocket = null;
    }
    if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
    }

    // Switching to a different room
    currentRoom = roomId;
    lastMessageId = 0;
    reconnectAttempts = 0;

    document.getElementById('chatHeader').textContent = roomId;
    document.querySelectorAll('.room-item').forEach(item => {
        item.classList.toggle('active', item.textContent === roomId);
    });

    // Clear messages div when switching rooms
    document.getElementById('messages').innerHTML = '';

    // Load message history first
    loadMessages();

    // Then connect to WebSocket for real-time updates
    connectWebSocket(roomId);

    // Auto-hide sidebar on mobile after selecting a room
    if (window.innerWidth <= 768) {
        hideSidebar();
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
}

function hideSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    sidebar.classList.remove('show');
    overlay.classList.remove('show');
}

function connectWebSocket(roomId) {
    // Get WebSocket URL
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/api/rooms/${encodeURIComponent(roomId)}/ws?token=${encodeURIComponent(sessionToken)}`;

    console.log(`[WS] Connecting to room ${roomId}...`);

    websocket = new WebSocket(wsUrl);

    websocket.onopen = () => {
        console.log(`[WS] Connected to room ${roomId}`);
        reconnectAttempts = 0;
    };

    websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
        } catch (error) {
            console.error('[WS] Error parsing message:', error);
        }
    };

    websocket.onerror = (error) => {
        console.error('[WS] WebSocket error:', error);
    };

    websocket.onclose = (event) => {
        console.log('[WS] WebSocket closed:', event.code, event.reason);
        websocket = null;

        // Attempt to reconnect if the room is still active
        if (currentRoom === roomId && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
            console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})...`);

            reconnectTimeout = setTimeout(() => {
                if (currentRoom === roomId) {
                    connectWebSocket(roomId);
                }
            }, delay);
        }
    };
}

function handleWebSocketMessage(data) {
    console.log('[WS] Received:', data);

    switch (data.type) {
        case 'connected':
            console.log(`[WS] Connection confirmed for room ${data.room}`);
            break;

        case 'message':
            displayMessage(data.data);
            break;

        case 'error':
            console.error('[WS] Server error:', data.message);
            break;

        default:
            console.warn('[WS] Unknown message type:', data.type);
    }
}

function displayMessage(msg) {
    const messagesDiv = document.getElementById('messages');

    // Clear empty state if present
    if (messagesDiv.querySelector('.empty-state')) {
        messagesDiv.innerHTML = '';
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';

    const date = new Date(msg.timestamp);
    const timeStr = date.toLocaleTimeString();

    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="username">${escapeHtml(msg.username)}</span>
            <span class="timestamp">${timeStr}</span>
        </div>
        <div class="message-text">${escapeHtml(msg.message)}</div>
    `;

    messagesDiv.appendChild(messageDiv);

    // Update lastMessageId
    if (msg.id > lastMessageId) {
        lastMessageId = msg.id;
    }

    // Scroll to bottom
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function loadMessages() {
    if (!currentRoom || isLoadingMessages) return;

    isLoadingMessages = true;

    try {
        console.log(`[HTTP] Loading message history since=${lastMessageId}`);
        const response = await fetch(`${API_URL}/rooms/${encodeURIComponent(currentRoom)}/messages?since=${lastMessageId}`);
        const data = await response.json();

        if (data.messages && data.messages.length > 0) {
            console.log(`[HTTP] Loaded ${data.messages.length} messages from history`);

            // Use displayMessage for each message
            data.messages.forEach(msg => displayMessage(msg));
        } else {
            console.log(`[HTTP] No message history`);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    } finally {
        isLoadingMessages = false;
    }
}

function sendMessage() {
    const message = document.getElementById('messageInput').value.trim();

    if (!currentRoom) {
        alert('Please select a room first');
        return;
    }

    if (!message) return;

    // Check if WebSocket is connected
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        alert('Not connected to chat. Reconnecting...');
        connectWebSocket(currentRoom);
        return;
    }

    try {
        // Send message via WebSocket
        websocket.send(JSON.stringify({
            type: 'message',
            message: message
        }));

        // Clear input
        document.getElementById('messageInput').value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message');
    }
}

// Expose functions to window for inline event handlers
window.logout = logout;
window.toggleAdminPanel = toggleAdminPanel;
window.toggleRegistration = toggleRegistration;
window.approveUser = approveUser;
window.rejectUser = rejectUser;
window.setUserRole = setUserRole;
window.deleteUser = deleteUser;
window.createRoom = createRoom;
window.sendMessage = sendMessage;
window.toggleSidebar = toggleSidebar;

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }

    const newRoomInput = document.getElementById('newRoomInput');
    if (newRoomInput) {
        newRoomInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') createRoom();
        });
    }
});
