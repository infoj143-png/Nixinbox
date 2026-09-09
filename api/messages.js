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

    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'Authorization header missing' });
    }

    // Support query parameter ?id=... or route URL /api/messages?id=...
    const { id } = req.query || {};
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
