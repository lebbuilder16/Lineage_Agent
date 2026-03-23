/**
 * Lineage Agent — Extension Popup
 * Settings management + quick scan.
 */

const statusEl = document.getElementById('status');
const apiKeyInput = document.getElementById('apiKey');
const mintInput = document.getElementById('mintInput');

// Load saved settings
chrome.storage.sync.get(['apiKey'], (data) => {
  if (data.apiKey) apiKeyInput.value = data.apiKey;
});

// Save settings
document.getElementById('saveBtn').addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  chrome.storage.sync.set({ apiKey }, () => {
    statusEl.textContent = 'Settings saved';
    statusEl.className = 'status success';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);
  });
});

// Quick scan
document.getElementById('scanBtn').addEventListener('click', () => {
  const mint = mintInput.value.trim();
  if (!mint || mint.length < 32) {
    statusEl.textContent = 'Enter a valid Solana address';
    statusEl.className = 'status error';
    return;
  }
  // Open the full report in a new tab
  chrome.tabs.create({
    url: `https://lineage-agent.fly.dev/token/${mint}`,
  });
});

// Enter key on mint input triggers scan
mintInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('scanBtn').click();
});
