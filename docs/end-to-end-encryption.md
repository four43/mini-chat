# End-to-End Encryption for Chat Rooms

Good news: You can implement E2EE for both DMs and chat rooms using the WebAuthn keys you already have! Here's how it works:

## Core Concept

WebAuthn keys can be used for both authentication AND encryption/decryption. The private key stays in the user's device hardware (TPM/secure enclave), and you can use it to:

1. **Derive encryption keys** for encrypting/decrypting messages
2. **Sign messages** to prove authenticity

## Architecture Overview

**For DMs:**

- Use recipient's public key to encrypt
- Only recipient can decrypt with their private key

**For Chat Rooms:**

- Generate a shared room key
- Encrypt room key individually for each member using their public keys
- Members decrypt the room key with their private key, then use it for messages

## Implementation Approach

### 1. Key Derivation from WebAuthn

JavaScript can't directly access the WebAuthn private key (it's in hardware), but you can:

```javascript
// Use the WebAuthn credential to sign a known value
// This creates a deterministic "encryption key"
async function deriveEncryptionKey(credentialId) {
    const challenge = new TextEncoder().encode("encryption-key-derivation");

    const assertion = await navigator.credentials.get({
        publicKey: {
            challenge: challenge,
            allowCredentials: [{
                id: credentialId,
                type: "public-key"
            }],
            userVerification: "preferred"
        }
    });

    // Use the signature as key material
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        assertion.response.signature,
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );

    // Derive an AES key
    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: new TextEncoder().encode("room-encryption"),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}
```

### 2. Better Approach: Hybrid Encryption

Use standard Web Crypto API with WebAuthn for key exchange:

```javascript
// Generate a key pair for each user (stored in browser)
async function generateUserKeyPair() {
    return await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
        },
        true,  // extractable
        ["encrypt", "decrypt"]
    );
}

// For chat rooms: symmetric key encryption
async function generateRoomKey() {
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

// Encrypt a message with room key
async function encryptMessage(roomKey, message) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(message);

    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        roomKey,
        encoded
    );

    return {
        iv: Array.from(iv),
        ciphertext: Array.from(new Uint8Array(encrypted))
    };
}

// Decrypt a message
async function decryptMessage(roomKey, encryptedData) {
    const decrypted = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: new Uint8Array(encryptedData.iv)
        },
        roomKey,
        new Uint8Array(encryptedData.ciphertext)
    );

    return new TextDecoder().decode(decrypted);
}
```

### 3. Room Key Distribution

```python
# Backend: Store encrypted room keys (Python)
# Each user gets the room key encrypted with their public key

import json
from base64 import b64encode, b64decode

# When user joins room:
# 1. Generate room key (done in JS, sent encrypted)
# 2. For each member, encrypt room key with their public key
# 3. Store encrypted keys in DB

# Database schema addition:
"""
CREATE TABLE room_keys (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,  -- Room key encrypted with user's public key
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id)
);

CREATE TABLE user_public_keys (
    user_id TEXT PRIMARY KEY,
    public_key TEXT NOT NULL,  -- PEM or JWK format
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""
```

### 4. Client-Side Flow

```javascript
// When joining a room:
async function joinRoom(roomId) {
    // 1. Fetch your encrypted room key from server
    const response = await fetch(`/api/rooms/${roomId}/key`);
    const { encrypted_key } = await response.json();

    // 2. Decrypt with your private key
    const roomKey = await decryptRoomKey(encrypted_key);

    // 3. Store in memory (never localStorage!)
    roomKeys[roomId] = roomKey;

    // 4. Now you can decrypt messages
    socket.on('message', async (data) => {
        const decrypted = await decryptMessage(roomKey, data.encrypted);
        displayMessage(decrypted);
    });
}

// When sending a message:
async function sendMessage(roomId, message) {
    const roomKey = roomKeys[roomId];
    const encrypted = await encryptMessage(roomKey, message);

    // Server only sees encrypted data
    await fetch(`/api/rooms/${roomId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ encrypted })
    });
}
```

## Simple Implementation Strategy

**Phase 1: Public Key Storage**

1. When user registers, generate RSA key pair in browser
2. Export public key, send to server
3. Store private key in IndexedDB (encrypted with WebAuthn-derived key)

**Phase 2: Room Keys**

1. First user in room generates AES room key
2. For each member, encrypt room key with their public key
3. Server stores encrypted keys (can't decrypt them)

**Phase 3: Message Encryption**

1. Client encrypts with room key before sending
2. Server stores encrypted blobs
3. Clients decrypt locally when receiving

## Trade-offs

**Pros:**

- True E2EE: Server never sees plaintext
- Perfect forward secrecy possible
- Works with your WebAuthn setup

**Cons:**

- Can't search messages on server
- Key management complexity
- Users lose messages if they lose keys
- Can't decrypt on new devices without key sharing
