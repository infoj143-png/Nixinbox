const API_BASE = 'https://api.mail.tm';
let currentEmail = localStorage.getItem('nixinbox_email') || '';
let currentPassword = localStorage.getItem('nixinbox_pass') || '';
let currentToken = localStorage.getItem('nixinbox_token') || '';

document.addEventListener('DOMContentLoaded', async () => {
    if (!currentEmail || !currentToken) {
        await generateNewEmail();
    } else {
        document.getElementById('emailDisplay').value = currentEmail;
        fetchMessages();
        setInterval(fetchMessages, 10000); // Auto check inbox every 10 seconds
    }
});

async function generateNewEmail() {
    try {
        document.getElementById('emailDisplay').value = "Connecting to API...";
        const domainRes = await fetch(`${API_BASE}/domains`);
        if (!domainRes.ok) throw new Error("Domain fetch failed (" + domainRes.status + ")");
        
        const domains = await domainRes.json();
        const domainList = domains['hydra:member'] || domains;
        if (!domainList || domainList.length === 0) throw new Error("No domains available");
        
        const domain = domainList[0].domain;
        const username = 'user_' + Math.random().toString(36).substring(2, 10);
        const email = `${username}@${domain}`;
        const password = Math.random().toString(36).substring(2, 12);

        document.getElementById('emailDisplay').value = "Creating account...";
        const res = await fetch(`${API_BASE}/accounts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: email, password: password })
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || "Account creation failed (" + res.status + ")");
        }

        currentEmail = email;
        currentPassword = password;
        localStorage.setItem('nixinbox_email', email);
        localStorage.setItem('nixinbox_pass', password);
        
        await getToken(email, password);
    } catch (err) {
        console.error(err);
        document.getElementById('emailDisplay').value = "Error: " + err.message;
    }
}

async function getToken(address, password) {
    try {
        document.getElementById('emailDisplay').value = "Authenticating...";
        const res = await fetch(`${API_BASE}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address, password })
        });
        const data = await res.json();
        if (data.token) {
            currentToken = data.token;
            localStorage.setItem('nixinbox_token', data.token);
            document.getElementById('emailDisplay').value = address;
            fetchMessages();
            setInterval(fetchMessages, 10000);
        } else {
            throw new Error("Token not received");
        }
    } catch (err) {
        console.error(err);
        document.getElementById('emailDisplay').value = "Auth Error: " + err.message;
    }
}

async function fetchMessages() {
    if (!currentToken) return;
    try {
        const res = await fetch(`${API_BASE}/messages`, {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        const messages = data['hydra:member'] || [];
        renderInbox(messages);
    } catch (err) {
        console.error(err);
    }
}

function renderInbox(messages) {
    const inboxList = document.getElementById('inboxList');
    if (messages.length === 0) {
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
            headers: { 'Authorization': `Bearer ${currentToken}` }
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
                                                         
