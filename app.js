const API_BASE = '/api';
const FALLBACK_DOMAINS = ['1secmail.com', '1secmail.org', '1secmail.net'];

const BLACKLISTED_KEYWORDS = [
    'guerrillamail',
    'mailinator',
    'sharklasers',
    'grr',
    'pokemail',
    'spam4',
    'guerrillamailblock',
    'trashmail',
    'dispostable',
    '10minutemail',
    'yopmail',
    'maildrop',
    'tempmail'
];

function isCleanDomain(domain) {
    if (!domain || typeof domain !== 'string') return false;
    const lower = domain.toLowerCase();
    return !BLACKLISTED_KEYWORDS.some(kw => lower.includes(kw));
}

let isGenerating = false;
let availableDomainsList = [];

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (err) {
        clearTimeout(id);
        throw err;
    }
}

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

function generateCleanUsername() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'nix' + result;
}

function generateCleanPassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return 'Nix' + result + '1!';
}

async function populateDomainDropdown() {
    const select = document.getElementById('domainSelect');
    if (!select) return;

    try {
        const domains = await fetchDomains();
        availableDomainsList = domains && domains.length > 0 ? domains : FALLBACK_DOMAINS;

        select.innerHTML = availableDomainsList.map(d => `<option value="${escapeHtml(d)}">@${escapeHtml(d)}</option>`).join('');

        if (window.currentEmail && window.currentEmail.includes('@')) {
            const currentDomain = window.currentEmail.split('@')[1];
            if (availableDomainsList.includes(currentDomain)) {
                select.value = currentDomain;
            }
        }
    } catch (e) {
        console.warn("Failed to populate domain dropdown:", e);
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
        const savedProvider = getItemSafe('nixinbox_provider');

        await populateDomainDropdown();

        if (savedEmail && savedToken) {
            const savedDomain = savedEmail.includes('@') ? savedEmail.split('@')[1] : null;
            if (savedDomain && !isCleanDomain(savedDomain)) {
                console.warn("Saved email domain is blacklisted. Purging saved session...");
                clearSession();
            } else {
                window.currentToken = savedToken;
                window.currentEmail = savedEmail;
                window.currentProvider = savedProvider || 'primary';
                emailDisplay.value = savedEmail;

                const select = document.getElementById('domainSelect');
                if (select && savedDomain) {
                    if ([...select.options].some(opt => opt.value === savedDomain)) {
                        select.value = savedDomain;
                    }
                }

                const messagesOk = await fetchMessages();
                if (messagesOk) {
                    startPolling();
                    return;
                } else {
                    console.warn("Saved session invalid or network fetch error. Resetting session...");
                    clearSession();
                }
            }
        }

        await generateWithRetry();

    } catch (err) {
        console.error("Init Error:", err);
        clearSession();
        await generateWithRetry();
    }
}

async function generateWithRetry(maxRetries = 3) {
    const emailDisplay = document.getElementById('emailDisplay');
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        if (emailDisplay) emailDisplay.value = "Generating inbox...";
        try {
            await generateNewEmail();
            if (window.currentEmail && window.currentToken) {
                return;
            }
        } catch (err) {
            console.warn(`Email generation attempt ${attempt} failed:`, err);
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
    }
}

function clearSession() {
    window.currentToken = null;
    window.currentEmail = null;
    window.currentProvider = null;
    removeItemSafe('nixinbox_email');
    removeItemSafe('nixinbox_token');
    removeItemSafe('nixinbox_provider');
}

async function fetchDomains() {
    let retries = 2;

    while (retries > 0) {
        try {
            const res = await fetchWithTimeout(`${API_BASE}/domains`, {
                headers: { 'Accept': 'application/json' }
            }, 5000);

            if (res.ok) {
                const data = await res.json();
                const rawList = data.domains || data['hydra:member'] || (Array.isArray(data) ? data : []);

                if (Array.isArray(rawList) && rawList.length > 0) {
                    const domainNames = rawList
                        .filter(item => item && (item.isActive === undefined || item.isActive === true))
                        .map(item => (typeof item === 'string' ? item : item.domain))
                        .filter(Boolean);

                    const cleanNames = domainNames.filter(isCleanDomain);
                    if (cleanNames.length > 0) {
                        return cleanNames;
                    }
                }
            }
        } catch (e) {
            console.warn(`Fetch domains attempt failed (${retries - 1} retries remaining):`, e);
        }
        retries--;
        if (retries > 0) await new Promise(res => setTimeout(res, 800));
    }

    console.warn("Using fallback domains list...");
    return FALLBACK_DOMAINS;
}

async function generateNewEmail(preferredDomain = null) {
    if (isGenerating) return;
    isGenerating = true;

    const emailDisplay = document.getElementById('emailDisplay');
    if (emailDisplay) emailDisplay.value = "Fetching domains...";

    clearSession();

    try {
        let domainList = await fetchDomains();

        if (!domainList || domainList.length === 0) {
            domainList = FALLBACK_DOMAINS;
        }

        availableDomainsList = domainList;

        // Build candidate list prioritizing preferredDomain if provided
        let candidateDomains = [];
        if (preferredDomain && domainList.includes(preferredDomain)) {
            const others = domainList.filter(d => d !== preferredDomain).sort(() => Math.random() - 0.5);
            candidateDomains = [preferredDomain, ...others];
        } else {
            candidateDomains = [...domainList].sort(() => Math.random() - 0.5);
        }

        let createdAccount = null;
        let lastError = null;

        const is1secmail = (dom) => dom.includes('1secmail');

        for (const domain of candidateDomains) {
            try {
                const username = generateCleanUsername();
                const address = `${username}@${domain}`;

                if (is1secmail(domain)) {
                    if (emailDisplay) emailDisplay.value = "Creating inbox...";
                    createdAccount = {
                        email: address,
                        token: `1secmail_${username}_${domain}`,
                        provider: '1secmail'
                    };
                    break;
                } else {
                    const password = generateCleanPassword();

                    if (emailDisplay) emailDisplay.value = "Creating account...";

                    const accRes = await fetchWithTimeout(`${API_BASE}/accounts`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ address, password })
                    }, 7000);

                    if (!accRes.ok) {
                        const errJson = await accRes.json().catch(() => ({}));
                        throw new Error(errJson.message || errJson.error || `Account creation failed (${accRes.status})`);
                    }

                    if (emailDisplay) emailDisplay.value = "Authenticating...";

                    const tokenRes = await fetchWithTimeout(`${API_BASE}/token`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({ address, password })
                    }, 7000);

                    if (!tokenRes.ok) throw new Error(`Token failed (${tokenRes.status})`);
                    const tokenData = await tokenRes.json();

                    if (!tokenData.token) throw new Error("Token missing in response");

                    createdAccount = {
                        email: address,
                        token: tokenData.token,
                        provider: 'primary'
                    };
                    break;
                }
            } catch (err) {
                console.warn(`Failed creating email on domain ${domain}:`, err);
                lastError = err;
            }
        }

        if (!createdAccount) {
            throw lastError || new Error("Failed to create temporary inbox on available domains");
        }

        window.currentToken = createdAccount.token;
        window.currentEmail = createdAccount.email;
        window.currentProvider = createdAccount.provider || 'primary';

        setItemSafe('nixinbox_email', createdAccount.email);
        setItemSafe('nixinbox_token', createdAccount.token);
        setItemSafe('nixinbox_provider', window.currentProvider);

        if (emailDisplay) emailDisplay.value = createdAccount.email;

        // Sync dropdown selection with created domain
        const select = document.getElementById('domainSelect');
        if (select) {
            if (availableDomainsList && availableDomainsList.length > 0) {
                select.innerHTML = availableDomainsList.map(d => `<option value="${escapeHtml(d)}">@${escapeHtml(d)}</option>`).join('');
            }
            if (createdAccount.email.includes('@')) {
                const activeDom = createdAccount.email.split('@')[1];
                if ([...select.options].some(opt => opt.value === activeDom)) {
                    select.value = activeDom;
                }
            }
        }

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
        clearSession();
        if (emailDisplay) emailDisplay.value = "Error: " + err.message + ". Click New.";
    } finally {
        isGenerating = false;
    }
}

let pollInterval = null;
let readMessageIds = new Set();

function is1secmailProvider() {
    if (window.currentProvider === '1secmail') return true;
    if (window.currentEmail && window.currentEmail.includes('@')) {
        const domain = window.currentEmail.split('@')[1].toLowerCase();
        return domain.includes('1secmail');
    }
    return false;
}

function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchMessages, 4000);
}

async function refreshInbox() {
    startPolling();
    return await fetchMessages();
}

function parseMessageDate(dateStr) {
    if (!dateStr) return new Date().toISOString();
    if (typeof dateStr !== 'string') return new Date(dateStr).toISOString();
    const formatted = dateStr.replace(' ', 'T') + (dateStr.includes('Z') ? '' : 'Z');
    const d = new Date(formatted);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function loadReadState() {
    if (!window.currentEmail) return;
    try {
        const saved = getItemSafe(`nixinbox_read_${window.currentEmail}`);
        if (saved) {
            readMessageIds = new Set(JSON.parse(saved));
        } else {
            readMessageIds = new Set();
        }
    } catch (e) {
        readMessageIds = new Set();
    }
}

function markMessageRead(id) {
    if (!id) return;
    readMessageIds.add(String(id));
    if (window.currentEmail) {
        try {
            setItemSafe(`nixinbox_read_${window.currentEmail}`, JSON.stringify([...readMessageIds]));
        } catch (e) {}
    }
}

async function fetchMessages() {
    if (!window.currentEmail) return false;
    loadReadState();

    if (is1secmailProvider()) {
        try {
            const parts = window.currentEmail.split('@');
            const login = parts[0];
            const domain = parts[1];

            const res = await fetch(`${API_BASE}/messages?login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}`);
            if (!res.ok) return false;
            const data = await res.json();
            const rawList = Array.isArray(data) ? data : [];
            const messages = rawList.map(item => ({
                id: item.id,
                from: { name: item.from, address: item.from },
                subject: item.subject,
                intro: '',
                createdAt: parseMessageDate(item.date)
            }));
            renderInbox(messages);
            return true;
        } catch (err) {
            console.error("Fetch 1secmail Messages Error:", err);
            return false;
        }
    }

    if (!window.currentToken) return false;

    try {
        const res = await fetch(`${API_BASE}/messages`, {
            headers: { 'Authorization': `Bearer ${window.currentToken}` }
        });
        if (res.status === 401 || res.status === 403) {
            console.warn("Token expired or unauthorized");
            clearSession();
            return false;
        }
        if (!res.ok) return false;
        const data = await res.json();
        const rawList = data['hydra:member'] || (Array.isArray(data) ? data : (data.messages || []));
        const messages = rawList.map(item => ({
            id: item.id,
            from: item.from || { name: 'Unknown', address: 'Unknown' },
            subject: item.subject || '(No Subject)',
            intro: item.intro || '',
            createdAt: parseMessageDate(item.createdAt || item.date)
        }));
        renderInbox(messages);
        return true;
    } catch (err) {
        console.error("Fetch Messages Error:", err);
        clearSession();
        return false;
    }
}

function renderInbox(messages) {
    const inboxList = document.getElementById('inboxList');
    const msgCount = document.getElementById('msgCount');

    if (!inboxList) return;

    const totalCount = messages ? messages.length : 0;
    const unreadCount = messages ? messages.filter(m => !readMessageIds.has(String(m.id))).length : 0;

    if (msgCount) {
        if (unreadCount > 0) {
            msgCount.innerText = `${unreadCount} new (${totalCount})`;
            msgCount.className = "bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30 animate-pulse";
        } else {
            msgCount.innerText = `${totalCount}`;
            msgCount.className = "bg-blue-500/10 text-blue-400 text-xs font-semibold px-2.5 py-0.5 rounded-full border border-blue-500/20";
        }
    }

    if (!messages || messages.length === 0) {
        inboxList.innerHTML = `<div class="text-center py-12 text-slate-500 text-sm"><div class="text-3xl mb-2">📭</div>Waiting for incoming messages...</div>`;
        return;
    }

    inboxList.innerHTML = messages.map(msg => {
        const isRead = readMessageIds.has(String(msg.id));
        const unreadDot = isRead ? '' : `<span class="w-2 h-2 rounded-full bg-blue-500 inline-block mr-2 shadow-sm shadow-blue-500/50 flex-shrink-0" title="Unread"></span>`;
        const bgClass = isRead ? 'bg-slate-900/40 hover:bg-slate-800/50' : 'bg-slate-800/80 hover:bg-slate-800 border-l-2 border-blue-500';

        return `
            <div onclick="readMessage('${msg.id}')" class="py-3 px-3.5 ${bgClass} cursor-pointer transition flex justify-between items-center rounded-xl my-1.5 group shadow-sm">
                <div class="pr-2 min-w-0 flex-1">
                    <div class="flex items-center text-sm font-semibold text-white group-hover:text-blue-400 transition truncate">
                        ${unreadDot}${escapeHtml(msg.from?.name || msg.from?.address || 'Unknown')}
                    </div>
                    <div class="text-xs text-slate-300 font-medium truncate mt-0.5">${escapeHtml(msg.subject || '(No Subject)')}</div>
                    ${msg.intro ? `<div class="text-xs text-slate-400 truncate mt-0.5">${escapeHtml(msg.intro)}</div>` : ''}
                </div>
                <div class="text-xs text-slate-500 whitespace-nowrap ml-2">${new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            </div>
        `;
    }).join('');
}

async function readMessage(id) {
    markMessageRead(id);
    fetchMessages();

    const modal = document.getElementById('messageModal');
    const modalSubject = document.getElementById('modalSubject');
    const modalSender = document.getElementById('modalSender');
    const modalBody = document.getElementById('modalBody');

    if (!modal) return;

    if (modalSubject) modalSubject.innerText = "Loading message...";
    if (modalSender) modalSender.innerText = "";
    if (modalBody) modalBody.innerText = "Fetching full email content...";

    modal.classList.remove('hidden');

    if (is1secmailProvider()) {
        try {
            const parts = window.currentEmail.split('@');
            const login = parts[0];
            const domain = parts[1];

            const res = await fetch(`${API_BASE}/messages?login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}&id=${encodeURIComponent(id)}`);
            if (!res.ok) throw new Error("Failed to load message content");

            const msg = await res.json();

            if (modalSubject) modalSubject.innerText = msg.subject || 'No Subject';
            if (modalSender) modalSender.innerText = `From: ${msg.from || 'Unknown'}`;

            if (modalBody) {
                if (msg.htmlBody) {
                    let fixedHtml = msg.htmlBody.replace(/<a\s+([^>]*\s+)?href=/gi, '<a target="_blank" rel="noopener" $1 href=');
                    modalBody.innerHTML = `<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" srcdoc="${fixedHtml.replace(/"/g, '&quot;')}" class="w-full h-72 bg-white rounded-lg border-0"></iframe>`;
                } else if (msg.textBody || msg.body) {
                    let text = escapeHtml(msg.textBody || msg.body);
                    let linkedText = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-blue-400 underline font-semibold">$1</a>');
                    modalBody.innerHTML = `<div class="whitespace-pre-wrap text-sm text-slate-200 font-mono select-all">${linkedText}</div>`;
                } else {
                    modalBody.innerText = "No readable content found in message.";
                }
            }
            return;
        } catch (err) {
            console.error("Read 1secmail Message Error:", err);
            if (modalBody) modalBody.innerText = "Error loading message body. Please try again.";
            return;
        }
    }

    try {
        const res = await fetch(`${API_BASE}/messages?id=${encodeURIComponent(id)}`, {
            headers: { 'Authorization': `Bearer ${window.currentToken}` }
        });

        if (!res.ok) throw new Error("Failed to load message content");

        const msg = await res.json();

        if (modalSubject) modalSubject.innerText = msg.subject || 'No Subject';
        if (modalSender) modalSender.innerText = `From: ${msg.from?.address || 'Unknown'}`;

        if (modalBody) {
            if (msg.html && (Array.isArray(msg.html) ? msg.html.length > 0 : true)) {
                let htmlContent = Array.isArray(msg.html) ? msg.html[0] : msg.html;
                let fixedHtml = htmlContent.replace(/<a\s+([^>]*\s+)?href=/gi, '<a target="_blank" rel="noopener" $1 href=');
                modalBody.innerHTML = `<iframe sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" srcdoc="${fixedHtml.replace(/"/g, '&quot;')}" class="w-full h-72 bg-white rounded-lg border-0"></iframe>`;
            } else if (msg.text) {
                let text = escapeHtml(msg.text);
                let linkedText = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-blue-400 underline font-semibold">$1</a>');
                modalBody.innerHTML = `<div class="whitespace-pre-wrap text-sm text-slate-200 font-mono select-all">${linkedText}</div>`;
            } else {
                modalBody.innerText = "No readable content found in message.";
            }
        }
    } catch (err) {
        console.error("Read Message Error:", err);
        if (modalBody) modalBody.innerText = "Error loading message body. Please try again.";
    }
}

function onDomainChange() {
    const select = document.getElementById('domainSelect');
    if (!select || !select.value) return;

    if (window.currentEmail && window.currentEmail.endsWith('@' + select.value)) {
        return;
    }

    generateNewEmail(select.value);
}

function switchDomain() {
    const select = document.getElementById('domainSelect');
    let domains = availableDomainsList.length > 0 ? availableDomainsList : FALLBACK_DOMAINS;

    if (select && select.options && select.options.length > 0) {
        const opts = [...select.options].map(opt => opt.value).filter(Boolean);
        if (opts.length > 0) {
            domains = opts;
        }
    }

    if (domains.length === 0) {
        generateNewEmail();
        return;
    }

    let currentDomain = null;
    if (window.currentEmail && window.currentEmail.includes('@')) {
        currentDomain = window.currentEmail.split('@')[1];
    } else if (select && select.value) {
        currentDomain = select.value;
    }

    let currentIndex = domains.indexOf(currentDomain);
    let nextIndex = currentIndex >= 0 ? (currentIndex + 1) % domains.length : 0;
    let nextDomain = domains[nextIndex];

    if (select) {
        select.value = nextDomain;
    }
    generateNewEmail(nextDomain);
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
