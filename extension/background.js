/**
 * Lineage Agent — Chrome Extension Background Service Worker
 *
 * Handles API calls to the Lineage Agent backend, caches results (5 min TTL),
 * and relays data to content scripts.
 */

const API_BASE = 'https://lineage-agent.fly.dev';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache: mint → { data, timestamp }
const cache = new Map();

// ── API calls ────────────────────────────────────────────────────────────────

async function fetchLineage(mint, apiKey) {
  const cached = cache.get(mint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const headers = { Accept: 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  try {
    const res = await fetch(`${API_BASE}/lineage?mint=${mint}`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    cache.set(mint, { data, timestamp: Date.now() });
    return data;
  } catch (e) {
    console.error('[lineage-ext] API error:', e);
    return null;
  }
}

async function fetchDeployerProfile(address, apiKey) {
  const headers = { Accept: 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  try {
    const res = await fetch(`${API_BASE}/deployer/${address}`, { headers });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SCAN_TOKEN') {
    chrome.storage.sync.get(['apiKey'], async (settings) => {
      const data = await fetchLineage(msg.mint, settings.apiKey);
      sendResponse({ data });
    });
    return true; // async response
  }

  if (msg.type === 'GET_DEPLOYER') {
    chrome.storage.sync.get(['apiKey'], async (settings) => {
      const data = await fetchDeployerProfile(msg.address, settings.apiKey);
      sendResponse({ data });
    });
    return true;
  }
});

// ── Cache cleanup (every 10 min) ─────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of cache) {
    if (now - val.timestamp > CACHE_TTL_MS) cache.delete(key);
  }
}, 10 * 60 * 1000);
