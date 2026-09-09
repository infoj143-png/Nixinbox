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

    const { login, domain, id } = req.query || {};

    // 1secmail proxy logic
    if (login && domain) {
        try {
            let targetUrl;
            if (id) {
                targetUrl = `https://www.1secmail.com/api/v1/?action=readMessage&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}&id=${encodeURIComponent(id)}`;
            } else {
                targetUrl = `https://www.1secmail.com/api/v1/?action=getMessages&login=${encodeURIComponent(login)}&domain=${encodeURIComponent(domain)}`;
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
        return res.status(401).json({ error: 'Authorization header missing' });
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
