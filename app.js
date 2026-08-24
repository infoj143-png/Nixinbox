const API_BASE = 'https://api.mail.tm';

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    const emailDisplay = document.getElementById('emailDisplay');
    try {
        emailDisplay.value = "Initializing...";
        
        // Purana data clear karein taake koi conflict na ho
        localStorage.removeItem('nixinbox_email');
        localStorage.removeItem('nixinbox_pass');
        localStorage.removeItem('nixinbox_token');

        emailDisplay.value = "Fetching domains...";
        const domainRes = await fetch(`${API_BASE}/domains`);
        if (!domainRes.ok) throw new Error("Domains API failed (" + domainRes.status + ")");
        
        const domainData = await domainRes.json();
        const domains = domainData['hydra:member'] || domainData;
        if (!domains || domains.length === 0) throw new Error("No domains available");
        
        const domain = domains[0].domain;
        const username = 'nix_' + Math.random().toString(36).substring(2, 8);
        const address = `${username}@${domain}`;
        const password = Math.random().toString(36).substring(2, 12);

        emailDisplay.value = "Creating account...";
        const accRes = await fetch(`${API_BASE}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });

        if (!accRes.ok) {
            const errJson = await accRes.json().catch(() => ({}));
            throw new Error(errJson.message || "Account creation failed (" + accRes.status + ")");
        }

        emailDisplay.value = "Authenticating...";
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
        
        // Success: Email screen par show kar dein
        emailDisplay.value = address;

        fetchMessages();
        setInterval(fetchMessages, 10000);

    } catch (err) {
        console.error(err);
        emailDisplay.value = "ERROR: " + err.message;
    }
}

async function fetchMessages() {
    if (!window.currentToken) return;
    try {
        const res = await fetch(`${API_BASE}/messages`, {
            headers: { 'Authorization': `Bearer ${window.currentToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        renderInbox(data['hydra:member'] || []);
    } catch (err) {
        console.error(err);
    }
}

function renderInbox(messages) {
    const inboxList = document.getElementById('inboxList');
    if (!messages || messages.length === 0) {
        inboxList.innerHTML = `<div class="text-center py-8 text-gray-500 text-sm">No messages yet. Waiting...</div>`;
        return;
    }

    inboxList.innerHTML = messages.map(msg => `
        <div onclick="readMessage('${msg.id}')" class="py-3 px-2 hover:bg-gray-800/50 cursor-pointer transition flex justify-between items-center rounded">
            <div>
                <div class="text-sm font-medium text-white">${msg.from.name || msg.from.address}</div>
                <div class="text-xs text-gray-400 truncate max-w-xs">${msg.subject || '(No Subject)'}</div>
            </div>
            <div class="text-xs text-gray-500">${new Date(msg.createdAt).toLocaleTimeString()}</div>
        </div>
    `).join('');
}

async function readMessage(id) {
    try {
        const res = await fetch(`${API_BASE}/messages/${id}`, {
            headers: { 'Authorization': `Bearer ${window.currentToken}` }
        });
        const msg = await res.json();
        
        document.getElementById('modalSubject').innerText = msg.subject || 'No Subject';
        document.getElementById('modalSender').innerText = `From: ${msg.from.address}`;
        
        const bodyContainer = document.getElementById('modalBody');
        if (msg.html && msg.html.length > 0) {
            bodyContainer.innerHTML = `<iframe srcdoc="${msg.html.replace(/"/g, '&quot;')}" class="w-full h-64 bg-white rounded border-0"></iframe>`;
        } else {
            bodyContainer.innerText = msg.text || 'Empty message';
        }

        document.getElementById('messageModal').classList.remove('hidden');
    } catch (err) {
        console.error(err);
    }
}

function closeModal() {
    document.getElementById('messageModal').classList.add('hidden');
}

function copyEmail() {
    const emailInput = document.getElementById('emailDisplay');
    emailInput.select();
    document.execCommand('copy');
    const btn = document.getElementById('copyBtn');
    btn.innerText = 'Copied!';
    setTimeout(() => btn.innerText = 'Copy', 2000);
}

function generateNewEmail() {
    initApp();
            }
            
