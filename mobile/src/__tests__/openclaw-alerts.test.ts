// Tests for alert routing and enrichment
// routeAlertToChannels is now a no-op (routing migrated to backend).
// enrichAlert calls the backend API directly via fetch.

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { routeAlertToChannels, enrichAlert } from '../lib/openclaw-alerts';
import type { AlertItem } from '../types/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeAlert = (overrides: Partial<AlertItem> = {}): AlertItem => ({
  id: 'alert-1',
  type: 'rug',
  message: 'Token rugged',
  timestamp: new Date().toISOString(),
  read: false,
  title: 'Rug detected',
  token_name: 'SCAM',
  mint: 'abc123',
  risk_score: 95,
  ...overrides,
});

// ─── routeAlertToChannels (no-op) ───────────────────────────────────────────

describe('routeAlertToChannels', () => {
  it('is a no-op that does not throw', () => {
    expect(() => routeAlertToChannels(makeAlert())).not.toThrow();
  });

  it('accepts any alert type', () => {
    expect(() => routeAlertToChannels(makeAlert({ type: 'insider' }))).not.toThrow();
    expect(() => routeAlertToChannels(makeAlert({ type: 'rug' }))).not.toThrow();
    expect(() => routeAlertToChannels(makeAlert({ type: 'narrative' }))).not.toThrow();
  });
});

// ─── enrichAlert ─────────────────────────────────────────────────────────────

describe('enrichAlert', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('POSTs to /alerts/enrich endpoint', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: 'enriched', relatedTokens: [], riskDelta: 10 }),
    });

    const result = await enrichAlert(makeAlert());

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/alerts/enrich'),
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    expect(result).toEqual({ summary: 'enriched', relatedTokens: [], riskDelta: 10 });
  });

  it('returns null when fetch fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network error'));

    const result = await enrichAlert(makeAlert());
    expect(result).toBeNull();
  });

  it('returns null when response is not ok', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false });

    const result = await enrichAlert(makeAlert());
    expect(result).toBeNull();
  });

  it('sends the alert as JSON body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ summary: 'test' }),
    });

    const alert = makeAlert({ mint: 'xyz789', risk_score: 80 });
    await enrichAlert(alert);

    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(body.mint).toBe('xyz789');
    expect(body.risk_score).toBe(80);
  });
});
