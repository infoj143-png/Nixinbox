const PRIMARY_API = 'https://api.mail.tm';

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

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let { login, domain, email, id } = req.query || {};

    if ((!login || !domain) && email && typeof email === 'string' && email.includes('@')) {
        const parts = email.trim().toLowerCase().split('@');
        if (parts.length === 2 && parts[0] && parts[1]) {
            login = parts[0];
            domain = parts[1];
        }
    }

    // 1secmail proxy logic
    if (login && domain) {
        const cleanLogin = String(login).trim().toLowerCase();
        const cleanDomain = String(domain).trim().toLowerCase();

        if (!cleanLogin || !cleanDomain || cleanLogin.includes('@') || cleanDomain.includes('@')) {
            return res.status(400).json({ error: 'Invalid login or domain parameter' });
        }

        try {
            let targetUrl;
            if (id) {
                targetUrl = `https://www.1secmail.com/api/v1/?action=readMessage&login=${encodeURIComponent(cleanLogin)}&domain=${encodeURIComponent(cleanDomain)}&id=${encodeURIComponent(id)}`;
            } else {
                targetUrl = `https://www.1secmail.com/api/v1/?action=getMessages&login=${encodeURIComponent(cleanLogin)}&domain=${encodeURIComponent(cleanDomain)}`;
            }

            const proxyRes = await fetchWithTimeout(targetUrl, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }, 7000);

            const data = await proxyRes.json().catch(() => ({}));
            return res.status(proxyRes.status).json(data);
        } catch (err) {
            console.error('1secmail proxy error:', err.message);
            return res.status(500).json({ error: err.message || 'Failed to fetch 1secmail messages' });
        }
    }

    // Mail.tm proxy logic
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header missing or invalid query parameters' });
    }

    const targetUrl = id ? `${PRIMARY_API}/messages/${id}` : `${PRIMARY_API}/messages`;

    try {
        const proxyRes = await fetchWithTimeout(targetUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': authHeader
            }
        }, 7000);

        const data = await proxyRes.json().catch(() => ({}));
        return res.status(proxyRes.status).json(data);
    } catch (err) {
        console.error('Messages proxy error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to fetch messages' });
    }
}
