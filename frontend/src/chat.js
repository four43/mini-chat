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
let userColors = {};  // Cache of username -> color mappings

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
            await loadUserColors();
            await loadUserSettings();
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

async function initializeChatView() {
    document.getElementById('currentUser').textContent = `👤 ${currentUsername}`;

    if (currentRole === 'admin') {
        document.getElementById('adminBadge').classList.remove('hidden');
        document.getElementById('adminPanelBtn').classList.remove('hidden');
        loadAdminSettings();
        adminPollInterval = setInterval(loadPendingUsers, 5000);
    }

    await loadRooms();

    // Navigate to room from hash if present
    const roomFromHash = getRoomFromHash();
    if (roomFromHash) {
        selectRoom(roomFromHash);
    }

    // Listen for hash changes (back/forward navigation, clicking room links)
    window.addEventListener('hashchange', () => {
        const room = getRoomFromHash();
        if (room) {
            selectRoom(room);
        }
    });

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

    history.replaceState(null, '', window.location.pathname);
    window.location.href = '/login.html';
}

function toggleAdminPanel() {
    document.getElementById('adminPanel').classList.toggle('open');
}

async function loadAdminSettings() {
    try {
        const resp = await fetch(`${API_URL}/server`, {
            headers: { 'Authorization': `Bearer ${sessionToken}` }
        });
        const data = await resp.json();

        updateRegistrationToggle(data.registration_enabled);
        loadPendingUsers();
        loadAllUsers();
        loadUserPreferences();
    } catch (error) {
        console.error('Failed to load admin settings:', error);
    }
}

async function loadUserColors() {
    try {
        const response = await fetch(`${API_URL}/users/preferences/colors`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });
        if (response.ok) {
            userColors = await response.json();
        }
    } catch (error) {
        console.error('[HTTP] Error loading user colors:', error);
    }
}

function toggleSettingsPanel() {
    const panel = document.getElementById('settingsPanel');
    panel.classList.toggle('open');
}

async function loadUserSettings() {
    try {
        const response = await fetch(`${API_URL}/users/${currentUsername}/preferences`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            const colorInput = document.getElementById('userColor');
            if (colorInput) {
                colorInput.value = data.color;
            }
        }
    } catch (error) {
        console.error('[HTTP] Error loading settings:', error);
    }
}

async function updateUserColor() {
    const color = document.getElementById('userColor').value;
    try {
        const response = await fetch(`${API_URL}/users/${currentUsername}/preferences`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ color })
        });
        if (response.ok) {
            // Update local cache
            userColors[currentUsername] = color;
            // Refresh messages to show new color
            if (currentRoom) {
                await loadMessages();
            }
        }
    } catch (error) {
        console.error('[HTTP] Error updating color:', error);
        alert('Failed to update color preference');
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
        const resp = await fetch(`${API_URL}/server/registration`, {
            method: 'PUT',
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
        const resp = await fetch(`${API_URL}/users/pending`, {
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
        const resp = await fetch(`${API_URL}/users/pending/approve`, {
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
        const resp = await fetch(`${API_URL}/users/pending/reject`, {
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
        const resp = await fetch(`${API_URL}/users`, {
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
        const resp = await fetch(`${API_URL}/users/${encodeURIComponent(username)}/role`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${sessionToken}`
            },
            body: JSON.stringify({ role })
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
        const resp = await fetch(`${API_URL}/users/${encodeURIComponent(username)}`, {
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

async function loadUserPreferences() {
    try {
        const response = await fetch(`${API_URL}/users`, {
            headers: {
                'Authorization': `Bearer ${sessionToken}`
            }
        });
        if (!response.ok) return;

        const data = await response.json();
        const preferencesList = document.getElementById('userPreferencesList');

        // Fetch preferences for each user
        const prefsPromises = data.users.map(async (user) => {
            const prefsResponse = await fetch(`${API_URL}/users/${user.username}/preferences`, {
                headers: {
                    'Authorization': `Bearer ${sessionToken}`
                }
            });
            if (prefsResponse.ok) {
                const prefs = await prefsResponse.json();
                return { ...user, color: prefs.color };
            }
            return { ...user, color: '#1976d2' };
        });

        const usersWithPrefs = await Promise.all(prefsPromises);

        preferencesList.innerHTML = usersWithPrefs.map(user => `
            <div class="preference-item">
                <span class="user-name" style="color: ${user.color};">${user.username}</span>
                <input type="color"
                       id="color-${user.username}"
                       value="${user.color}"
                       onchange="updateUserColorAdmin('${user.username}')">
            </div>
        `).join('');

    } catch (error) {
        console.error('[HTTP] Error loading user preferences:', error);
    }
}

async function updateUserColorAdmin(username) {
    const color = document.getElementById(`color-${username}`).value;
    try {
        const response = await fetch(`${API_URL}/users/${username}/preferences`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${sessionToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ color })
        });
        if (response.ok) {
            userColors[username] = color;
            // Refresh messages if this user has messages in current room
            if (currentRoom) {
                await loadMessages();
            }
        }
    } catch (error) {
        console.error('[HTTP] Error updating user color:', error);
        alert('Failed to update user color');
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

            const nameSpan = document.createElement('span');
            nameSpan.className = 'room-name';
            nameSpan.textContent = room;
            nameSpan.onclick = () => selectRoom(room);

            item.appendChild(nameSpan);

            if (currentRole === 'admin') {
                const settingsBtn = document.createElement('button');
                settingsBtn.className = 'room-settings-btn';
                settingsBtn.textContent = '\u2699';
                settingsBtn.title = 'Room settings';
                settingsBtn.onclick = (e) => {
                    e.stopPropagation();
                    openRoomSettings(room);
                };
                item.appendChild(settingsBtn);
            }

            roomList.appendChild(item);
        });
    } catch (error) {
        console.error('Error loading rooms:', error);
    }
}

function openCreateRoomModal() {
    const modal = document.getElementById('createRoomModal');
    const input = document.getElementById('newRoomInput');
    input.value = '';
    modal.classList.add('open');
    setTimeout(() => input.focus(), 100);
}

function closeCreateRoomModal() {
    const modal = document.getElementById('createRoomModal');
    modal.classList.remove('open');
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
            closeCreateRoomModal();
            loadRooms();
            selectRoom(roomId);
        }
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Failed to create room');
    }
}

function getRoomFromHash() {
    const match = window.location.hash.match(/^#\/r\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
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

    // Update URL hash
    window.location.hash = `#/r/${encodeURIComponent(roomId)}`;

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

function linkifyRoomRefs(text) {
    return text.replace(/#\/r\/(\S+)/g, (match, room) => {
        return `<a href="#/r/${room}" class="room-link">#/r/${room}</a>`;
    });
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

    // Get user's color preference, default to blue
    const userColor = userColors[msg.username] || '#1976d2';

    const messageBody = linkifyRoomRefs(escapeHtml(msg.message));

    messageDiv.innerHTML = `
        <div class="message-header">
            <span class="username" style="color: ${userColor};">${escapeHtml(msg.username)}</span>
            <span class="timestamp">${timeStr}</span>
        </div>
        <div class="message-text">${messageBody}</div>
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

function openRoomSettings(roomId) {
    const modal = document.getElementById('roomSettingsModal');
    const roomName = document.getElementById('roomSettingsName');
    modal.dataset.roomId = roomId;
    roomName.textContent = roomId;
    modal.classList.add('open');
}

function closeRoomSettings() {
    const modal = document.getElementById('roomSettingsModal');
    modal.classList.remove('open');
}

async function deleteRoomAction() {
    const modal = document.getElementById('roomSettingsModal');
    const roomId = modal.dataset.roomId;

    if (!confirm(`Are you sure you want to delete room "${roomId}"? The room will be hidden but messages are preserved.`)) {
        return;
    }

    try {
        const resp = await fetch(`${API_URL}/rooms/${encodeURIComponent(roomId)}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${sessionToken}` }
        });

        if (resp.ok) {
            closeRoomSettings();
            // If we were in the deleted room, clear the chat area
            if (currentRoom === roomId) {
                if (websocket) {
                    websocket.close();
                    websocket = null;
                }
                currentRoom = null;
                lastMessageId = 0;
                history.replaceState(null, '', window.location.pathname);
                document.getElementById('chatHeader').textContent = '[No room selected]';
                document.getElementById('messages').innerHTML = '<div class="empty-state"><p>Select a chat room to start</p></div>';
            }
            loadRooms();
        } else {
            const data = await resp.json();
            alert(`Failed: ${data.detail || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Failed to delete room:', error);
        alert('Failed to delete room');
    }
}

// Expose functions to window for inline event handlers
window.logout = logout;
window.toggleAdminPanel = toggleAdminPanel;
window.toggleSettingsPanel = toggleSettingsPanel;
window.toggleRegistration = toggleRegistration;
window.approveUser = approveUser;
window.rejectUser = rejectUser;
window.setUserRole = setUserRole;
window.deleteUser = deleteUser;
window.updateUserColor = updateUserColor;
window.updateUserColorAdmin = updateUserColorAdmin;
window.openCreateRoomModal = openCreateRoomModal;
window.closeCreateRoomModal = closeCreateRoomModal;
window.createRoom = createRoom;
window.sendMessage = sendMessage;
window.toggleSidebar = toggleSidebar;
window.closeRoomSettings = closeRoomSettings;
window.deleteRoomAction = deleteRoomAction;

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
