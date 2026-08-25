(function() {
    // Inject Theme CSS Rules for both Dark mode fallback and Light mode
    const css = `
/* Default Dark Mode fixes for Tailwind v2 (slate-950 fallback) */
html:not(.light-mode), html:not(.light-mode) body {
    background-color: #020617 !important;
    color: #f8fafc !important;
}

html:not(.light-mode) header {
    background-color: rgba(2, 6, 23, 0.8) !important;
    border-color: #0f172a !important;
}

html:not(.light-mode) #mobileMenu {
    background-color: #020617 !important;
    border-color: #0f172a !important;
}

html:not(.light-mode) .bg-slate-950,
html:not(.light-mode) .bg-slate-950\\/60,
html:not(.light-mode) .bg-slate-950\\/80,
html:not(.light-mode) #emailDisplay,
html:not(.light-mode) #modalBody,
html:not(.light-mode) input[type="text"],
html:not(.light-mode) input[type="email"],
html:not(.light-mode) textarea {
    background-color: #020617 !important;
    border-color: #1e293b !important;
    color: #f8fafc !important;
}

html:not(.light-mode) footer {
    background-color: #020617 !important;
    border-color: #0f172a !important;
}

/* Light Mode Theme Styles */
html.light-mode, html.light-mode body {
    background-color: #f8fafc !important;
    color: #0f172a !important;
}

html.light-mode header {
    background-color: rgba(255, 255, 255, 0.9) !important;
    border-color: #e2e8f0 !important;
}

html.light-mode header a:not(.text-blue-500):not(.text-blue-400) {
    color: #334155 !important;
}
html.light-mode header a:not(.text-blue-500):not(.text-blue-400):hover {
    color: #2563eb !important;
}
html.light-mode header a.text-white {
    color: #0f172a !important;
}

html.light-mode #mobileMenu {
    background-color: #ffffff !important;
    border-color: #e2e8f0 !important;
    color: #334155 !important;
}

html.light-mode #themeToggleBtn {
    background-color: #f1f5f9 !important;
    border-color: #cbd5e1 !important;
    color: #334155 !important;
}
html.light-mode #themeToggleBtn:hover {
    background-color: #e2e8f0 !important;
    color: #0f172a !important;
}
html.light-mode #mobileMenuBtn {
    color: #334155 !important;
}
html.light-mode #mobileMenuBtn:hover {
    color: #0f172a !important;
}

html.light-mode main section,
html.light-mode main article,
html.light-mode .bg-slate-900\\/80,
html.light-mode .bg-slate-900\\/60,
html.light-mode .bg-slate-900\\/40,
html.light-mode .bg-slate-900,
html.light-mode .ad-container,
html.light-mode #messageModal > div {
    background-color: #ffffff !important;
    border-color: #e2e8f0 !important;
    box-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.05) !important;
}

html.light-mode h1,
html.light-mode h2,
html.light-mode h3,
html.light-mode .text-white {
    color: #0f172a !important;
}

html.light-mode .text-slate-100,
html.light-mode .text-slate-200,
html.light-mode .text-slate-300 {
    color: #1e293b !important;
}

html.light-mode .text-slate-400 {
    color: #475569 !important;
}

html.light-mode .text-slate-500 {
    color: #64748b !important;
}

html.light-mode .bg-slate-950,
html.light-mode .bg-slate-950\\/60,
html.light-mode .bg-slate-950\\/80,
html.light-mode #emailDisplay,
html.light-mode #modalBody,
html.light-mode input[type="text"],
html.light-mode input[type="email"],
html.light-mode textarea {
    background-color: #f1f5f9 !important;
    border-color: #cbd5e1 !important;
    color: #0f172a !important;
}

html.light-mode #emailDisplay {
    color: #2563eb !important;
}

html.light-mode button.bg-slate-800,
html.light-mode button[onclick="generateNewEmail()"],
html.light-mode button[onclick="closeModal()"] {
    background-color: #e2e8f0 !important;
    border-color: #cbd5e1 !important;
    color: #1e293b !important;
}
html.light-mode button.bg-slate-800:hover,
html.light-mode button[onclick="generateNewEmail()"]:hover,
html.light-mode button[onclick="closeModal()"]:hover {
    background-color: #cbd5e1 !important;
    color: #0f172a !important;
}

html.light-mode #inboxList > div:hover {
    background-color: #f1f5f9 !important;
}

html.light-mode .divide-slate-800\\/60 > * + * {
    border-color: #e2e8f0 !important;
}

html.light-mode .border-slate-800,
html.light-mode .border-slate-800\\/80,
html.light-mode .border-slate-800\\/60,
html.light-mode .border-slate-900,
html.light-mode .border-slate-700\\/80,
html.light-mode .border-slate-700 {
    border-color: #e2e8f0 !important;
}

html.light-mode #messageModal {
    background-color: rgba(15, 23, 42, 0.65) !important;
}

html.light-mode footer {
    background-color: #f8fafc !important;
    border-color: #e2e8f0 !important;
    color: #64748b !important;
}
html.light-mode footer a {
    color: #475569 !important;
}
html.light-mode footer a:hover {
    color: #2563eb !important;
}
`;

    const styleEl = document.createElement('style');
    styleEl.id = 'theme-style-overrides';
    styleEl.textContent = css;
    if (document.head) {
        document.head.appendChild(styleEl);
    } else if (document.documentElement) {
        document.documentElement.appendChild(styleEl);
    }

    function getStoredTheme() {
        return localStorage.getItem('nixinbox_theme') || 'dark';
    }

    function applyTheme(theme) {
        if (theme === 'light') {
            document.documentElement.classList.add('light-mode');
        } else {
            document.documentElement.classList.remove('light-mode');
        }
        updateIcons(theme);
    }

    function updateIcons(theme) {
        const sunIcon = document.getElementById('sunIcon');
        const moonIcon = document.getElementById('moonIcon');
        if (sunIcon && moonIcon) {
            if (theme === 'light') {
                sunIcon.classList.add('hidden');
                moonIcon.classList.remove('hidden');
            } else {
                sunIcon.classList.remove('hidden');
                moonIcon.classList.add('hidden');
            }
        }
    }

    // Apply immediately to prevent FOUC
    applyTheme(getStoredTheme());

    window.toggleTheme = function() {
        const currentTheme = getStoredTheme();
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('nixinbox_theme', newTheme);
        applyTheme(newTheme);
    };

    document.addEventListener('DOMContentLoaded', function() {
        updateIcons(getStoredTheme());
    });
})();
