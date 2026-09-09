const PRIMARY_API = 'https://api.mail.tm';
const SECONDARY_API = 'https://api.mail.gw';
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
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
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    let domains = [];

    // Attempt Primary Provider (api.mail.tm)
    try {
        const primaryRes = await fetchWithTimeout(`${PRIMARY_API}/domains`, {
            headers: { 'Accept': 'application/json' }
        }, 4000);

        if (primaryRes.ok) {
            const data = await primaryRes.json();
            const rawList = data['hydra:member'] || (Array.isArray(data) ? data : (data.domains || []));
            if (Array.isArray(rawList) && rawList.length > 0) {
                domains = rawList
                    .filter(item => item && (item.isActive === undefined || item.isActive === true))
                    .map(item => (typeof item === 'string' ? item : item.domain))
                    .filter(Boolean);
            }
        }
    } catch (err) {
        console.warn('Primary domain fetch failed/timed out:', err.message);
    }

    // Attempt Secondary Provider (api.mail.gw) if primary returned no domains
    if (!domains || domains.length === 0) {
        try {
            const secondaryRes = await fetchWithTimeout(`${SECONDARY_API}/domains`, {
                headers: { 'Accept': 'application/json' }
            }, 4000);

            if (secondaryRes.ok) {
                const data = await secondaryRes.json();
                const rawList = data['hydra:member'] || (Array.isArray(data) ? data : (data.domains || []));
                if (Array.isArray(rawList) && rawList.length > 0) {
                    domains = rawList
                        .filter(item => item && (item.isActive === undefined || item.isActive === true))
                        .map(item => (typeof item === 'string' ? item : item.domain))
                        .filter(Boolean);
                }
            }
        } catch (err) {
            console.warn('Secondary domain fetch failed/timed out:', err.message);
        }
    }

    // Filter out blacklisted/heavily blocked domains and prioritize clean domains
    let cleanDomains = domains.filter(isCleanDomain);
    if (cleanDomains.length > 0) {
        domains = cleanDomains;
    } else {
        domains = FALLBACK_DOMAINS;
    }

    return res.status(200).json({ domains });
}
