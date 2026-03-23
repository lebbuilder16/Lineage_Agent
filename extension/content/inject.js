/**
 * Lineage Agent — Content Script
 *
 * Detects Solana token pages on DexScreener, Birdeye, and Photon.
 * Extracts the mint address, fetches forensic data from the Lineage Agent API,
 * and injects a risk overlay badge.
 */

(function () {
  'use strict';

  // Prevent double injection
  if (document.getElementById('lineage-agent-overlay')) return;

  const APP_URL = 'https://lineage-agent.fly.dev';
  let currentMint = null;
  let overlayEl = null;
  let collapsed = false;

  // ── Mint extraction per site ───────────────────────────────────────────────

  function extractMint() {
    const url = window.location.href;

    // DexScreener: /solana/<pair_address> — mint is in page DOM, not URL
    if (url.includes('dexscreener.com/solana/')) {
      // Try to find mint from page elements
      const tokenLink = document.querySelector('a[href*="/solana/"][class*="token"]');
      if (tokenLink) {
        const match = tokenLink.href.match(/\/solana\/([A-HJ-NP-Za-km-z1-9]{32,44})/);
        if (match) return match[1];
      }
      // Fallback: extract from URL (pair address, not mint — but we try)
      const urlMatch = url.match(/\/solana\/([A-HJ-NP-Za-km-z1-9]{32,44})/);
      if (urlMatch) return urlMatch[1];
    }

    // Birdeye: /token/<mint>
    if (url.includes('birdeye.so/token/')) {
      const match = url.match(/\/token\/([A-HJ-NP-Za-km-z1-9]{32,44})/);
      if (match) return match[1];
    }

    // Photon: /en/lp/<pair>
    if (url.includes('photon-sol.tinyastro.io')) {
      const match = url.match(/\/lp\/([A-HJ-NP-Za-km-z1-9]{32,44})/);
      if (match) return match[1];
    }

    return null;
  }

  // ── Risk level helpers ─────────────────────────────────────────────────────

  function computeRiskLevel(data) {
    const dc = data.death_clock;
    if (dc?.risk_level && dc.risk_level !== 'insufficient_data') return dc.risk_level;

    const ins = data.insider_sell;
    if (ins?.deployer_exited) return 'critical';

    const sf = data.sol_flow;
    if (sf?.total_extracted_sol > 50) return 'critical';
    if (sf?.total_extracted_sol > 10) return 'high';

    const dp = data.deployer_profile;
    const rugRate = dp?.confirmed_rug_rate_pct ?? dp?.rug_rate_pct;
    if (rugRate > 70) return 'critical';
    if (rugRate > 40) return 'high';
    if (rugRate > 15) return 'medium';

    if (sf?.total_extracted_sol > 0) return 'medium';

    return 'low';
  }

  function riskScore(level) {
    return { critical: 90, high: 70, medium: 45, low: 15 }[level] ?? 0;
  }

  // ── Build signals array ────────────────────────────────────────────────────

  function buildSignals(data) {
    const signals = [];
    const dp = data.deployer_profile;
    const sf = data.sol_flow;
    const dc = data.death_clock;
    const br = data.bundle_report;

    if (dp) {
      const rugRate = dp.confirmed_rug_rate_pct ?? dp.rug_rate_pct ?? 0;
      const rugs = dp.confirmed_rug_count ?? dp.rug_count ?? 0;
      const total = dp.total_tokens_launched ?? 0;
      if (total > 0) {
        signals.push({
          icon: rugs > 0 ? '💀' : '👤',
          text: `Deployer: ${rugs}/${total} rugs (${rugRate.toFixed(0)}%)`,
        });
      }
    }

    if (dc?.risk_level && dc.risk_level !== 'insufficient_data') {
      const window = dc.predicted_window_end;
      signals.push({
        icon: '⏰',
        text: window ? `Death Clock: ${window}` : `Death Clock: ${dc.risk_level}`,
      });
    }

    if (sf?.total_extracted_sol > 0) {
      signals.push({
        icon: '💸',
        text: `${sf.total_extracted_sol.toFixed(1)} SOL extracted (${sf.extraction_context})`,
      });
    }

    if (br?.overall_verdict) {
      signals.push({
        icon: '🔗',
        text: `Bundle: ${br.overall_verdict.replace(/_/g, ' ')}`,
      });
    }

    return signals.slice(0, 3);
  }

  // ── Render overlay ─────────────────────────────────────────────────────────

  function createOverlay() {
    const el = document.createElement('div');
    el.id = 'lineage-agent-overlay';
    document.body.appendChild(el);
    return el;
  }

  function renderLoading(el) {
    el.innerHTML = `
      <div class="la-card">
        <div class="la-header">
          <div class="la-brand">
            <div class="la-brand-icon">L</div>
            <span class="la-brand-name">Lineage Agent</span>
          </div>
        </div>
        <div class="la-loading">
          <div class="la-spinner"></div>
          <div>Scanning token...</div>
        </div>
      </div>
    `;
  }

  function renderResult(el, data, mint) {
    const level = computeRiskLevel(data);
    const score = riskScore(level);
    const signals = buildSignals(data);
    const tokenName = data.query_token?.name || data.root?.name || mint.slice(0, 8);

    const signalsHtml = signals.map(s => `
      <div class="la-signal">
        <span class="la-signal-icon">${s.icon}</span>
        <span>${s.text}</span>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="la-card">
        <div class="la-header">
          <div class="la-brand">
            <div class="la-brand-icon">L</div>
            <span class="la-brand-name">Lineage Agent</span>
          </div>
          <button class="la-close" id="la-collapse-btn" title="Minimize">&minus;</button>
        </div>

        <div class="la-risk-section">
          <div class="la-score-ring la-ring-${level}">
            <span class="la-score-number la-risk-${level}">${score}</span>
          </div>
          <div class="la-risk-info">
            <div class="la-risk-badge la-bg-${level} la-risk-${level}">${level.toUpperCase()}</div>
            <div class="la-risk-hint">${tokenName}</div>
          </div>
        </div>

        ${signalsHtml ? `<div class="la-signals">${signalsHtml}</div>` : ''}

        <div class="la-footer">
          <a class="la-btn la-btn-primary" href="${APP_URL}/token/${mint}" target="_blank" rel="noopener">
            Full Report
          </a>
          <button class="la-btn" id="la-refresh-btn">Refresh</button>
        </div>
      </div>
    `;

    el.querySelector('#la-collapse-btn')?.addEventListener('click', () => toggleCollapse(el, data, mint));
    el.querySelector('#la-refresh-btn')?.addEventListener('click', () => scanToken(mint, true));
  }

  function renderCollapsed(el, data, mint) {
    const level = computeRiskLevel(data);
    const score = riskScore(level);

    el.innerHTML = `
      <div class="la-card la-collapsed" id="la-expand-btn">
        <div class="la-brand-icon">L</div>
        <span class="la-score-mini la-risk-${level}">${score}</span>
        <span class="la-risk-mini la-risk-${level}">${level.toUpperCase()}</span>
      </div>
    `;

    el.querySelector('#la-expand-btn')?.addEventListener('click', () => {
      collapsed = false;
      renderResult(el, data, mint);
    });
  }

  function toggleCollapse(el, data, mint) {
    collapsed = !collapsed;
    if (collapsed) {
      renderCollapsed(el, data, mint);
    } else {
      renderResult(el, data, mint);
    }
  }

  function renderError(el) {
    el.innerHTML = `
      <div class="la-card la-collapsed" style="cursor: pointer;" id="la-retry-btn">
        <div class="la-brand-icon">L</div>
        <span style="font-size: 11px; color: rgba(255,255,255,0.5);">Scan failed — tap to retry</span>
      </div>
    `;
    el.querySelector('#la-retry-btn')?.addEventListener('click', () => {
      const mint = extractMint();
      if (mint) scanToken(mint, true);
    });
  }

  // ── Scan logic ─────────────────────────────────────────────────────────────

  let lastScanData = null;

  async function scanToken(mint, force = false) {
    if (!mint) return;
    if (mint === currentMint && lastScanData && !force) return;

    currentMint = mint;
    if (!overlayEl) overlayEl = createOverlay();

    renderLoading(overlayEl);

    chrome.runtime.sendMessage({ type: 'SCAN_TOKEN', mint }, (response) => {
      if (chrome.runtime.lastError || !response?.data) {
        renderError(overlayEl);
        return;
      }
      lastScanData = response.data;
      if (collapsed) {
        renderCollapsed(overlayEl, response.data, mint);
      } else {
        renderResult(overlayEl, response.data, mint);
      }
    });
  }

  // ── URL observer (SPA navigation detection) ────────────────────────────────

  let lastUrl = window.location.href;

  function checkForMintChange() {
    const url = window.location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      const mint = extractMint();
      if (mint && mint !== currentMint) {
        scanToken(mint);
      }
    }
  }

  // MutationObserver for SPA route changes
  const observer = new MutationObserver(checkForMintChange);
  observer.observe(document.body, { childList: true, subtree: true });

  // Also check on popstate (back/forward)
  window.addEventListener('popstate', () => setTimeout(checkForMintChange, 500));

  // ── Initial scan ───────────────────────────────────────────────────────────

  // DexScreener loads data dynamically — wait a bit for the page to populate
  setTimeout(() => {
    const mint = extractMint();
    if (mint) scanToken(mint);
  }, 1500);
})();
