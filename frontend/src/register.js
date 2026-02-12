import './style.css';
import { API_URL, showStatus, arrayBufferToBase64, base64ToArrayBuffer } from './utils.js';

async function register() {
    const username = document.getElementById('registerUsername').value.trim();

    if (!username) {
        showStatus('registerStatus', '❌ Please enter a username', 'error');
        return;
    }

    try {
        showStatus('registerStatus', 'Starting registration...', 'info');

        const beginResp = await fetch(`${API_URL}/auth/register/begin`);
        const beginData = await beginResp.json();

        if (beginData.detail) {
            showStatus('registerStatus', `❌ ${beginData.detail}`, 'error');
            return;
        }

        const challenge = base64ToArrayBuffer(beginData.challenge);
        const userId = new TextEncoder().encode(username);

        showStatus('registerStatus', '🔐 Please authenticate with your device...', 'info');

        const credential = await navigator.credentials.create({
            publicKey: {
                challenge: challenge,
                rp: {
                    name: beginData.rp.name,
                    id: beginData.rp.id
                },
                user: {
                    id: userId,
                    name: username,
                    displayName: username
                },
                pubKeyCredParams: [
                    { type: "public-key", alg: -7 },
                    { type: "public-key", alg: -257 }
                ],
                authenticatorSelection: {
                    authenticatorAttachment: "platform",
                    requireResidentKey: true,
                    residentKey: "required",
                    userVerification: "preferred"
                },
                timeout: 60000,
                attestation: "none"
            }
        });

        const completeResp = await fetch(`${API_URL}/auth/register/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: username,
                credentialId: arrayBufferToBase64(credential.rawId),
                publicKey: arrayBufferToBase64(credential.response.getPublicKey()),
                challenge: beginData.challenge
            })
        });

        const completeData = await completeResp.json();

        if (completeData.detail) {
            showStatus('registerStatus', `❌ ${completeData.detail}`, 'error');
        } else if (completeData.status === 'approved') {
            showStatus('registerStatus',
                `<div class="approval-code">
                    <h3>✅ Registration Complete!</h3>
                    <p>You are the first user and have been automatically approved as an admin.</p>
                    <p style="margin-top: 10px; font-size: 12px;">Redirecting to login...</p>
                </div>`,
                'success'
            );
            // Auto-redirect to login after 2 seconds
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } else {
            showStatus('registerStatus',
                `<div class="approval-code">
                    <h3>⏳ Registration Pending Approval</h3>
                    <p>Please provide this code to the administrator:</p>
                    <div class="code">${completeData.approval_code}</div>
                    <p style="margin-top: 10px; font-size: 12px;">You'll be able to login once approved.</p>
                </div>`,
                'success'
            );
        }

    } catch (error) {
        console.error(error);
        showStatus('registerStatus', `❌ Registration failed: ${error.message}`, 'error');
    }
}

function goToLogin() {
    window.location.href = '/login.html';
}

// Expose functions to window for inline event handlers
window.register = register;
window.goToLogin = goToLogin;

// Event listener for Enter key
document.addEventListener('DOMContentLoaded', () => {
    const usernameInput = document.getElementById('registerUsername');
    if (usernameInput) {
        usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') register();
        });
    }
});
