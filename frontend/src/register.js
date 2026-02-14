import './style.css';
import { API_URL, showStatus, arrayBufferToBase64, base64ToArrayBuffer, friendlyError, loadAndApplyTheme } from './utils.js';

// Get invite token from URL if present
const urlParams = new URLSearchParams(window.location.search);
const inviteToken = urlParams.get('invite');

// Load theme and check if registration is allowed
loadAndApplyTheme();
checkRegistrationAccess();

async function checkRegistrationAccess() {
    try {
        const resp = await fetch(`${API_URL}/server/registration-status`);
        const data = await resp.json();

        if (data.mode === 'closed') {
            showStatus('registerStatus', '❌ Registration is currently closed', 'error');
            disableRegistration();
        } else if (data.mode === 'invite_only' && !inviteToken) {
            showStatus('registerStatus', '❌ Registration requires an invite link', 'error');
            disableRegistration();
        }
    } catch (error) {
        console.error('Failed to check registration status:', error);
    }
}

function disableRegistration() {
    const registerBtn = document.querySelector('#registerForm button[onclick="register()"]');
    const usernameInput = document.getElementById('registerUsername');
    if (registerBtn) registerBtn.disabled = true;
    if (usernameInput) usernameInput.disabled = true;
}

async function register() {
    const username = document.getElementById('registerUsername').value.trim();

    if (!username) {
        showStatus('registerStatus', '❌ Please enter a username', 'error');
        return;
    }

    try {
        showStatus('registerStatus', 'Starting registration...', 'info');

        // Pass invite token as query param if present
        const beginUrl = inviteToken
            ? `${API_URL}/auth/register/begin?invite=${encodeURIComponent(inviteToken)}`
            : `${API_URL}/auth/register/begin`;
        const beginResp = await fetch(beginUrl);
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

        const completeBody = {
            username: username,
            credentialId: arrayBufferToBase64(credential.rawId),
            publicKey: arrayBufferToBase64(credential.response.getPublicKey()),
            challenge: beginData.challenge
        };

        // Include invite token in complete request if present
        if (inviteToken) {
            completeBody.invite_token = inviteToken;
        }

        const completeResp = await fetch(`${API_URL}/auth/register/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(completeBody)
        });

        const completeData = await completeResp.json();

        if (completeData.detail) {
            showStatus('registerStatus', `❌ ${completeData.detail}`, 'error');
        } else if (completeData.status === 'approved') {
            showStatus('registerStatus',
                `<div class="approval-code">
                    <h3>✅ Registration Complete!</h3>
                    <p>Your account has been approved. Redirecting to login...</p>
                </div>`,
                'success'
            );
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
        showStatus('registerStatus', `❌ ${friendlyError(error)}`, 'error');
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
