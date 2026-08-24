/**
 * Nixinbox - Disposable Temporary Email Web App
 * Interacts with Mail.tm API
 */

const API_BASE = 'https://api.mail.tm';
const STORAGE_KEY = 'nixinbox_account';
const REFRESH_INTERVAL_SECONDS = 10;

// Application State
let currentAccount = null; // { address, password, token }
let pollInterval = null;
let timerInterval = null;
let secondsRemaining = REFRESH_INTERVAL_SECONDS;
let isFetchingInbox = false;

// DOM Elements
const emailInput = document.getElementById('email-address');
const btnCopy = document.getElementById('btn-copy');
const btnNewEmail = document.getElementById('btn-new-email');
const btnRefresh = document.getElementById('btn-refresh');
const refreshIcon = document.getElementById('refresh-icon');
const timerCountdown = document.getElementById('timer-countdown');
const messageCountBadge = document.getElementById('message-count-badge');
const inboxEmpty = document.getElementById('inbox-empty');
const inboxList = document.getElementById('inbox-list');
const loadingSpinner = document.getElementById('loading-spinner');

// Modal Elements
const messageModal = document.getElementById('message-modal');
const modalSubject = document.getElementById('modal-subject');
const modalFrom = document.getElementById('modal-from');
const modalTo = document.getElementById('modal-to');
const modalDate = document.getElementById('modal-date');
const modalContent = document.getElementById('modal-content');
const modalLoading = document.getElementById('modal-loading');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnModalCloseFooter = document.getElementById('btn-modal-close-footer');

// Set current year in footer
document.getElementById('year').textContent = new Date().getFullYear();

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initAccount();
});

/**
 * Setup Event Listeners
 */
function setupEventListeners() {
  btnCopy.addEventListener('click', handleCopyEmail);
  btnNewEmail.addEventListener('click', handleGenerateNewEmail);
  btnRefresh.addEventListener('click', () => {
    fetchInbox();
    resetTimer();
  });

  btnCloseModal.addEventListener('click', closeModal);
  btnModalCloseFooter.addEventListener('click', closeModal);

  // Close modal on backdrop click
  messageModal.addEventListener('click', (e) => {
    if (e.target === messageModal) {
      closeModal();
    }
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !messageModal.classList.contains('hidden')) {
      closeModal();
    }
  });
}

/**
 * Initialize or restore account
 */
async function initAccount() {
  setLoadingState(true);
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.address && parsed.password && parsed.token) {
          // Verify stored token is valid
          const isValid = await verifyToken(parsed.token);
          if (isValid) {
            currentAccount = parsed;
            emailInput.value = currentAccount.address;
            setLoadingState(false);
            startPolling();
            fetchInbox();
            return;
          }
        }
      } catch (e) {
        console.warn('Failed to parse saved credentials, creating new account...');
      }
    }

    // Create a new account if no valid saved account exists
    await createNewAccount();
  } catch (err) {
    console.error('Account init failed:', err);
    showToast('Failed to initialize account. Retrying...', 'error');
    setLoadingState(false);
  }
}

/**
 * Create a brand new temp account
 */
async function createNewAccount() {
  setLoadingState(true);
  try {
    // 1. Get available domains
    const domainRes = await fetch(`${API_BASE}/domains`);
    if (!domainRes.ok) throw new Error('Failed to fetch domains from Mail.tm');
    const domainData = await domainRes.json();
    const domains = domainData['hydra:member'] || [];

    if (!domains.length) {
      throw new Error('No available domains found.');
    }

    const domain = domains[0].domain;
    const randomUsername = 'nix_' + Math.random().toString(36).substring(2, 10);
    const address = `${randomUsername}@${domain}`;
    const password = 'P' + Math.random().toString(36).substring(2, 12) + '!9X';

    // 2. Register account
    const createRes = await fetch(`${API_BASE}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password })
    });

    if (!createRes.ok) {
      throw new Error('Failed to create Mail.tm account.');
    }

    // 3. Get JWT token
    const tokenRes = await fetch(`${API_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, password })
    });

    if (!tokenRes.ok) {
      throw new Error('Failed to retrieve authentication token.');
    }

    const tokenData = await tokenRes.json();
    const token = tokenData.token;

    currentAccount = { address, password, token };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentAccount));

    emailInput.value = address;
    showToast('New temporary email generated!', 'success');

    // Reset inbox list & UI
    inboxList.innerHTML = '';
    inboxList.classList.add('hidden');
    inboxEmpty.classList.remove('hidden');
    messageCountBadge.textContent = '0 messages';

    startPolling();
    fetchInbox();
  } catch (err) {
    console.error('Error creating account:', err);
    showToast(err.message || 'Error generating email. Please try again.', 'error');
  } finally {
    setLoadingState(false);
  }
}

/**
 * Verify if JWT token is still active
 */
async function verifyToken(token) {
  try {
    const res = await fetch(`${API_BASE}/messages`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Handle Generate New Email button
 */
async function handleGenerateNewEmail() {
  btnNewEmail.disabled = true;
  await createNewAccount();
  btnNewEmail.disabled = false;
}

/**
 * Copy current email to clipboard
 */
async function handleCopyEmail() {
  if (!currentAccount || !currentAccount.address) return;
  try {
    await navigator.clipboard.writeText(currentAccount.address);
    showToast('Copied email address to clipboard!', 'info');
  } catch (err) {
    // Fallback selection
    emailInput.select();
    document.execCommand('copy');
    showToast('Copied email address to clipboard!', 'info');
  }
}

/**
 * Start 10s auto-polling loop and countdown timer
 */
function startPolling() {
  if (pollInterval) clearInterval(pollInterval);
  if (timerInterval) clearInterval(timerInterval);

  resetTimer();

  timerInterval = setInterval(() => {
    secondsRemaining--;
    if (secondsRemaining <= 0) {
      secondsRemaining = REFRESH_INTERVAL_SECONDS;
      fetchInbox();
    }
    timerCountdown.textContent = secondsRemaining;
  }, 1000);
}

function resetTimer() {
  secondsRemaining = REFRESH_INTERVAL_SECONDS;
  timerCountdown.textContent = secondsRemaining;
}

/**
 * Fetch inbox messages for active account
 */
async function fetchInbox() {
  if (!currentAccount || !currentAccount.token || isFetchingInbox) return;

  isFetchingInbox = true;
  refreshIcon.classList.add('fa-spin');

  try {
    const res = await fetch(`${API_BASE}/messages`, {
      headers: { 'Authorization': `Bearer ${currentAccount.token}` }
    });

    if (!res.ok) {
      if (res.status === 401) {
        // Token expired, attempt re-login or create new
        const reAuthOk = await reAuthenticate();
        if (reAuthOk) {
          fetchInbox();
        }
      }
      return;
    }

    const data = await res.json();
    const messages = data['hydra:member'] || [];

    renderInbox(messages);
  } catch (err) {
    console.error('Failed to fetch messages:', err);
  } finally {
    isFetchingInbox = false;
    refreshIcon.classList.remove('fa-spin');
  }
}

/**
 * Attempt re-authenticating with current account password
 */
async function reAuthenticate() {
  if (!currentAccount || !currentAccount.address || !currentAccount.password) return false;
  try {
    const res = await fetch(`${API_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: currentAccount.address,
        password: currentAccount.password
      })
    });
    if (res.ok) {
      const data = await res.json();
      currentAccount.token = data.token;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentAccount));
      return true;
    }
  } catch (err) {
    console.error('Re-authentication failed', err);
  }
  return false;
}

/**
 * Render message list into inbox UI
 */
function renderInbox(messages) {
  messageCountBadge.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'}`;

  if (!messages || messages.length === 0) {
    inboxList.classList.add('hidden');
    inboxEmpty.classList.remove('hidden');
    inboxList.innerHTML = '';
    return;
  }

  inboxEmpty.classList.add('hidden');
  inboxList.classList.remove('hidden');

  inboxList.innerHTML = messages.map(msg => {
    const sender = escapeHtml(msg.from?.name || msg.from?.address || 'Unknown Sender');
    const senderAddr = escapeHtml(msg.from?.address || '');
    const subject = escapeHtml(msg.subject || '(No Subject)');
    const dateStr = formatDate(msg.createdAt);
    const snippet = escapeHtml(msg.intro || '');
    const isUnread = !msg.seen;

    return `
      <div
        class="message-item p-4 hover:bg-slate-800/50 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${isUnread ? 'bg-indigo-950/20' : ''}"
        onclick="openMessageModal('${msg.id}')"
      >
        <div class="flex items-start space-x-3 overflow-hidden">
          <div class="mt-1 flex-shrink-0">
            ${isUnread
              ? '<span class="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block"></span>'
              : '<span class="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block"></span>'}
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-slate-200 text-sm truncate">${sender}</span>
              ${senderAddr ? `<span class="text-xs text-slate-500 truncate hidden md:inline">&lt;${senderAddr}&gt;</span>` : ''}
            </div>
            <p class="text-sm font-medium ${isUnread ? 'text-indigo-200' : 'text-slate-300'} truncate">${subject}</p>
            <p class="text-xs text-slate-400 truncate mt-0.5">${snippet}</p>
          </div>
        </div>
        <div class="text-xs text-slate-500 flex-shrink-0 self-start sm:self-center">
          ${dateStr}
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Fetch and display single message in modal
 */
async function openMessageModal(messageId) {
  if (!currentAccount || !currentAccount.token) return;

  messageModal.classList.remove('hidden');
  modalLoading.classList.remove('hidden');
  modalContent.innerHTML = '';
  modalSubject.textContent = 'Loading...';
  modalFrom.textContent = '';
  modalTo.textContent = '';
  modalDate.textContent = '';

  try {
    const res = await fetch(`${API_BASE}/messages/${messageId}`, {
      headers: { 'Authorization': `Bearer ${currentAccount.token}` }
    });

    if (!res.ok) throw new Error('Failed to load email details.');

    const msg = await res.json();

    modalSubject.textContent = msg.subject || '(No Subject)';
    modalFrom.textContent = `${msg.from?.name || ''} <${msg.from?.address || ''}>`.trim();
    modalTo.textContent = (msg.to || []).map(t => t.address).join(', ') || currentAccount.address;
    modalDate.textContent = formatDate(msg.createdAt);

    modalLoading.classList.add('hidden');

    if (msg.html && msg.html.length > 0) {
      // Create a sandboxed iframe to render HTML safely or render text
      const iframe = document.createElement('iframe');
      iframe.className = 'w-full min-h-[300px] rounded border-0 bg-white';
      iframe.sandbox = 'allow-same-origin';
      modalContent.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(msg.html[0]);
      doc.close();
    } else if (msg.text) {
      modalContent.innerHTML = `<pre class="font-sans whitespace-pre-wrap text-slate-300">${escapeHtml(msg.text)}</pre>`;
    } else {
      modalContent.innerHTML = `<p class="text-slate-500 italic">No content available for this email.</p>`;
    }

    // Trigger an inbox refresh to update read/unread state indicator
    fetchInbox();

  } catch (err) {
    console.error('Modal error:', err);
    modalLoading.classList.add('hidden');
    modalContent.innerHTML = `<div class="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-xs">Failed to load message content.</div>`;
  }
}

/**
 * Close modal
 */
function closeModal() {
  messageModal.classList.add('hidden');
  modalContent.innerHTML = '';
}

/**
 * Set loading UI state for email address box
 */
function setLoadingState(loading) {
  if (loading) {
    loadingSpinner.classList.remove('hidden');
    emailInput.value = 'Generating temporary address...';
    btnCopy.disabled = true;
    btnNewEmail.disabled = true;
  } else {
    loadingSpinner.classList.add('hidden');
    btnCopy.disabled = false;
    btnNewEmail.disabled = false;
  }
}

/**
 * Toast notification helper
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');

  const bgColors = {
    info: 'bg-indigo-600 border-indigo-500 text-white',
    success: 'bg-emerald-600 border-emerald-500 text-white',
    error: 'bg-rose-600 border-rose-500 text-white'
  };

  const icons = {
    info: 'fa-circle-info',
    success: 'fa-circle-check',
    error: 'fa-triangle-exclamation'
  };

  toast.className = `pointer-events-auto flex items-center space-x-2.5 px-4 py-3 rounded-xl border shadow-lg text-xs font-medium transform transition-all duration-300 translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Helper to escape HTML to prevent XSS
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format ISO date string nicely
 */
function formatDate(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return isoStr;

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Make openMessageModal globally accessible for inline onclick handlers
window.openMessageModal = openMessageModal;
