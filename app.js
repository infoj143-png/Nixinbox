const API_BASE = 'https://api.mail.tm';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function isLocalStorageAvailable() {
    try {
        const testKey = '__nixinbox_test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
    } catch (e) {
        return false;
    }
}

function getItemSafe(key) {
    if (!isLocalStorageAvailable()) return null;
    try {
        return localStorage.getItem(key);
    } catch (e) {
        return null;
    }
}

function setItemSafe(key, value) {
    if (!isLocalStorageAvailable()) return;
    try {
        localStorage.setItem(key, value);
    } catch (e) {
        console.warn("localStorage setItem failed:", e);
    }
}

function removeItemSafe(key) {
    if (!isLocalStorageAvailable()) return;
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn("localStorage removeItem failed:", e);
    }
}

async function initApp() {
    const emailDisplay = document.getElementById('emailDisplay');
    if (!emailDisplay) return;

    try {
        emailDisplay.value = "Initializing...";

        // Restore active session if present, else create new
        const savedEmail = getItemSafe('nixinbox_email');
        const savedToken = getItemSafe('nixinbox_token');

        if (savedEmail && savedToken) {
            window.currentToken = savedToken;
            window.currentEmail = savedEmail;
            emailDisplay.value = savedEmail;

            const messagesOk = await fetchMessages();
            if (messagesOk) {
                startPolling();
                return;
            } else {
                console.warn("Saved token invalid or expired. Resetting session...");
                clearSession();
            }
        }

        await generateNewEmail();

    } catch (err) {
        console.error("Init Error:", err);
        emailDisplay.value = "ERROR: " + err.message + ". Click New.";
    }
}

function clearSession() {
    window.currentToken = null;
    window.currentEmail = null;
    removeItemSafe('nixinbox_email');
    removeItemSafe('nixinbox_token');
}

async function generateNewEmail() {
    const emailDisplay = document.getElementById('emailDisplay');
    if (emailDisplay) emailDisplay.value = "Fetching domains...";

    clearSession();

    let domains = null;
    let retries = 3;
    while (retries > 0) {
        try {
            const domainRes = await fetch(`${API_BASE}/domains`);
            if (domainRes.ok) {
                const domainData = await domainRes.json();
                domains = domainData['hydra:member'] || domainData;
                if (domains && domains.length > 0) break;
            }
        } catch (e) {
            console.warn(`Fetch domains attempt failed (${retries} left):`, e);
        }
        retries--;
        if (retries > 0) await new Promise(res => setTimeout(res, 1000));
    }

    if (!domains || domains.length === 0) {
        if (emailDisplay) emailDisplay.value = "Error: Domains unavailable. Click New.";
        return;
    }

    try {
        const domainObj = domains[Math.floor(Math.random() * domains.length)];
        const domain = domainObj.domain;
        const username = 'nix_' + Math.random().toString(36).substring(2, 8);
        const address = `${username}@${domain}`;
        const password = 'NixPass@' + Math.random().toString(36).substring(2, 8);

        if (emailDisplay) emailDisplay.value = "Creating account...";
        const accRes = await fetch(`${API_BASE}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });

        if (!accRes.ok) {
            const errJson = await accRes.json().catch(() => ({}));
            throw new Error(errJson.message || "Account creation failed (" + accRes.status + ")");
        }

        if (emailDisplay) emailDisplay.value = "Authenticating...";
        const tokenRes = await fetch(`${API_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });

        if (!tokenRes.ok) throw new Error("Token failed (" + tokenRes.status + ")");
        const tokenData = await tokenRes.json();

        if (!tokenData.token) throw new Error("Token missing in response");

        window.currentToken = tokenData.token;
        window.currentEmail = address;

        setItemSafe('nixinbox_email', address);
        setItemSafe('nixinbox_token', tokenData.token);

        if (emailDisplay) emailDisplay.value = address;

        const inboxList = document.getElementById('inboxList');
        if (inboxList) {
            inboxList.innerHTML = `<div class="text-center py-12 text-slate-500 text-sm"><div class="text-3xl mb-2">📭</div>Inbox is empty. Waiting for incoming messages...</div>`;
        }
        const msgCount = document.getElementById('msgCount');
        if (msgCount) msgCount.innerText = "0";

        fetchMessages();
        startPolling();

    } catch (err) {
        console.error("Generator Error:", err);
        if (emailDisplay) emailDisplay.value = "Error: " + err.message + ". Click New.";
    }
}

let pollInterval = null;
function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchMessages, 10000);
}

async function fetchMessages() {
    if (!window.currentToken) return false;
    try {
        const res = await fetch(`${API_BASE}/messages`, {
            headers: { 'Authorization': `Bearer ${window.currentToken}` }
        });
        if (res.status === 401 || res.status === 403) {
            console.warn("Token expired or unauthorized");
            return false;
        }
        if (!res.ok) return false;
        const data = await res.json();
        const messages = data['hydra:member'] || data;
        renderInbox(messages);
        return true;
    } catch (err) {
        console.error("Fetch Messages Error:", err);
        return false;
    }
}

function renderInbox(messages) {
    const inboxList = document.getElementById('inboxList');
    const msgCount = document.getElementById('msgCount');

    if (!inboxList) return;

    if (msgCount) msgCount.innerText = messages ? messages.length : 0;

    if (!messages || messages.length === 0) {
        inboxList.innerHTML = `<div class="text-center py-12 text-slate-500 text-sm"><div class="text-3xl mb-2">📭</div>Waiting for incoming messages...</div>`;
        return;
    }

    inboxList.innerHTML = messages.map(msg => `
        <div onclick="readMessage('${msg.id}')" class="py-3 px-3 hover:bg-slate-800/50 cursor-pointer transition flex justify-between items-center rounded-xl my-1 group">
            <div class="pr-2">
                <div class="text-sm font-semibold text-white group-hover:text-blue-400 transition">${escapeHtml(msg.from?.name || msg.from?.address || 'Unknown')}</div>
                <div class="text-xs text-slate-400 truncate max-w-xs">${escapeHtml(msg.subject || '(No Subject)')} ${msg.intro ? '- ' + escapeHtml(msg.intro) : ''}</div>
            </div>
            <div class="text-xs text-slate-500 whitespace-nowrap">${new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        </div>
    `).join('');
}

async function readMessage(id) {
    const modal = document.getElementById('messageModal');
    const modalSubject = document.getElementById('modalSubject');
    const modalSender = document.getElementById('modalSender');
    const modalBody = document.getElementById('modalBody');

    if (!modal) return;

    if (modalSubject) modalSubject.innerText = "Loading message...";
    if (modalSender) modalSender.innerText = "";
    if (modalBody) modalBody.innerText = "Fetching full email content...";

    modal.classList.remove('hidden');

    try {
        const res = await fetch(`${API_BASE}/messages/${id}`, {
            headers: { 'Authorization': `Bearer ${window.currentToken}` }
        });

        if (!res.ok) throw new Error("Failed to load message content");

        const msg = await res.json();

        if (modalSubject) modalSubject.innerText = msg.subject || 'No Subject';
        if (modalSender) modalSender.innerText = `From: ${msg.from?.address || 'Unknown'}`;

        if (modalBody) {
            if (msg.html && (Array.isArray(msg.html) ? msg.html.length > 0 : true)) {
                let htmlContent = Array.isArray(msg.html) ? msg.html[0] : msg.html;
                let fixedHtml = htmlContent.replace(/<a\s+([^>]*\s+)?href=/gi, '<a target="_blank" $1 href=');
                modalBody.innerHTML = `<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" srcdoc="${fixedHtml.replace(/"/g, '&quot;')}" class="w-full h-72 bg-white rounded-lg border-0"></iframe>`;
            } else if (msg.text) {
                let text = escapeHtml(msg.text);
                let linkedText = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-blue-400 underline font-semibold">$1</a>');
                modalBody.innerHTML = `<div class="whitespace-pre-wrap text-sm text-slate-200">${linkedText}</div>`;
            } else {
                modalBody.innerText = "No readable content found in message.";
            }
        }
    } catch (err) {
        console.error("Read Message Error:", err);
        if (modalBody) modalBody.innerText = "Error loading message body. Please try again.";
    }
}

function closeModal() {
    const modal = document.getElementById('messageModal');
    if (modal) modal.classList.add('hidden');
}

function copyEmail() {
    const emailInput = document.getElementById('emailDisplay');
    if (!emailInput || !window.currentEmail) return;

    emailInput.select();
    navigator.clipboard.writeText(window.currentEmail).then(() => {
        const btn = document.getElementById('copyBtn');
        if (!btn) return;
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `✓ Copied!`;
        btn.classList.add('bg-emerald-600');
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('bg-emerald-600');
        }, 2000);
    }).catch(err => {
        console.error("Copy failed:", err);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
