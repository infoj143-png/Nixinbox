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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const targetUrl = `${PRIMARY_API}/accounts`;
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

        const proxyRes = await fetchWithTimeout(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body
        }, 7000);

        const data = await proxyRes.json().catch(() => ({}));
        return res.status(proxyRes.status).json(data);
    } catch (err) {
        console.error('Account creation proxy error:', err.message);
        return res.status(500).json({ error: err.message || 'Failed to create account' });
    }
}
