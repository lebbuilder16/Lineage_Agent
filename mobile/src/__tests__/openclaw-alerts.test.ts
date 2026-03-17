// Tests for OpenClaw alert routing and enrichment

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// ─── Mocks (factories must not reference outer variables — hoisting) ──────────

jest.mock('../lib/openclaw', () => ({
  isOpenClawAvailable: jest.fn(),
  sendRequest: jest.fn(),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import * as OpenClaw from '../lib/openclaw';
import { useAlertPrefsStore } from '../store/alert-prefs';
import { routeAlertToChannels, enrichAlert } from '../lib/openclaw-alerts';
import type { AlertItem } from '../types/api';

const mockIsAvailable = jest.mocked(OpenClaw.isOpenClawAvailable);
const mockSendRequest = jest.mocked(OpenClaw.sendRequest);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeAlert = (overrides: Partial<AlertItem> = {}): AlertItem => ({
  id: 'alert-1',
  type: 'rug',
  message: 'Rug pull detected on TokenXYZ',
  timestamp: "2023-11-14T22:13:20.000Z",
  read: false,
  risk_score: 95,
  token_name: 'TokenXYZ',
  mint: 'mint123abc',
  ...overrides,
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockIsAvailable.mockReturnValue(false);
  mockSendRequest.mockResolvedValue({});
  // Reset alert prefs to defaults
  useAlertPrefsStore.setState({
    channels: { telegram: false, whatsapp: false, discord: false, push: true },
    escalationRules: [
      { alertType: 'narrative', channels: ['discord'] },
      { alertType: 'zombie', channels: ['discord'] },
      { alertType: 'bundle', channels: ['telegram'] },
      { alertType: 'insider', channels: ['telegram'] },
      { alertType: 'deployer', channels: ['telegram'] },
      { alertType: 'death_clock', channels: ['telegram', 'push'] },
      { alertType: 'rug', channels: ['whatsapp', 'push'] },
    ],
    enrichmentEnabled: true,
  });
});

// ─── routeAlertToChannels ─────────────────────────────────────────────────────

describe('routeAlertToChannels', () => {
  it('does nothing when OpenClaw is unavailable', () => {
    mockIsAvailable.mockReturnValue(false);
    routeAlertToChannels(makeAlert());
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('does nothing when no channels are enabled for the alert type', () => {
    mockIsAvailable.mockReturnValue(true);
    // All channels disabled
    useAlertPrefsStore.setState({
      channels: { telegram: false, whatsapp: false, discord: false, push: false },
      escalationRules: [{ alertType: 'rug', channels: ['whatsapp'] }],
      enrichmentEnabled: true,
    });

    routeAlertToChannels(makeAlert({ type: 'rug' }));
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('sends to whatsapp for rug alert when whatsapp channel is enabled', () => {
    mockIsAvailable.mockReturnValue(true);
    useAlertPrefsStore.setState({
      channels: { telegram: false, whatsapp: true, discord: false, push: false },
      escalationRules: [{ alertType: 'rug', channels: ['whatsapp'] }],
      enrichmentEnabled: true,
    });

    routeAlertToChannels(makeAlert({ type: 'rug' }));

    expect(mockSendRequest).toHaveBeenCalledWith('send', expect.objectContaining({
      sessionKey: 'lineage:alerts',
      deliver: expect.arrayContaining([{ channel: 'whatsapp' }]),
    }));
  });

  it('sends to telegram for insider alert when telegram is enabled', () => {
    mockIsAvailable.mockReturnValue(true);
    useAlertPrefsStore.setState({
      channels: { telegram: true, whatsapp: false, discord: false, push: false },
      escalationRules: [{ alertType: 'insider', channels: ['telegram'] }],
      enrichmentEnabled: true,
    });

    routeAlertToChannels(makeAlert({ type: 'insider' }));

    expect(mockSendRequest).toHaveBeenCalledWith('send', expect.objectContaining({
      deliver: expect.arrayContaining([{ channel: 'telegram' }]),
    }));
  });

  it('deduplicates channels when multiple rules match', () => {
    mockIsAvailable.mockReturnValue(true);
    useAlertPrefsStore.setState({
      channels: { telegram: true, whatsapp: false, discord: false, push: false },
      escalationRules: [
        { alertType: 'rug', channels: ['telegram'] },
        { alertType: '*', channels: ['telegram'] },
      ],
      enrichmentEnabled: true,
    });

    routeAlertToChannels(makeAlert({ type: 'rug' }));

    const call = mockSendRequest.mock.calls[0][1] as { deliver: { channel: string }[] };
    const telegramEntries = call.deliver.filter((d) => d.channel === 'telegram');
    expect(telegramEntries).toHaveLength(1);
  });

  it('matches wildcard rules (*)', () => {
    mockIsAvailable.mockReturnValue(true);
    useAlertPrefsStore.setState({
      channels: { telegram: true, whatsapp: false, discord: false, push: false },
      escalationRules: [{ alertType: '*', channels: ['telegram'] }],
      enrichmentEnabled: true,
    });

    routeAlertToChannels(makeAlert({ type: 'narrative' }));

    expect(mockSendRequest).toHaveBeenCalledWith('send', expect.objectContaining({
      deliver: expect.arrayContaining([{ channel: 'telegram' }]),
    }));
  });

  it('respects minRiskScore filter — does not send when score too low', () => {
    mockIsAvailable.mockReturnValue(true);
    useAlertPrefsStore.setState({
      channels: { telegram: true, whatsapp: false, discord: false, push: false },
      escalationRules: [{ alertType: '*', minRiskScore: 80, channels: ['telegram'] }],
      enrichmentEnabled: true,
    });

    routeAlertToChannels(makeAlert({ risk_score: 50 }));
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('sends when risk score meets minRiskScore threshold', () => {
    mockIsAvailable.mockReturnValue(true);
    useAlertPrefsStore.setState({
      channels: { telegram: true, whatsapp: false, discord: false, push: false },
      escalationRules: [{ alertType: '*', minRiskScore: 80, channels: ['telegram'] }],
      enrichmentEnabled: true,
    });

    routeAlertToChannels(makeAlert({ risk_score: 85 }));
    expect(mockSendRequest).toHaveBeenCalled();
  });

  it('includes formatted message in the send request', () => {
    mockIsAvailable.mockReturnValue(true);
    useAlertPrefsStore.setState({
      channels: { telegram: true, whatsapp: false, discord: false, push: false },
      escalationRules: [{ alertType: 'rug', channels: ['telegram'] }],
      enrichmentEnabled: true,
    });

    routeAlertToChannels(makeAlert({
      type: 'rug',
      token_name: 'ScamToken',
      mint: 'scam-mint-111',
      message: 'LP drained',
      risk_score: 99,
    }));

    const msg = (mockSendRequest.mock.calls[0][1] as { message: string }).message;
    expect(msg).toContain('CRITICAL');
    expect(msg).toContain('RUG');
    expect(msg).toContain('ScamToken');
    expect(msg).toContain('scam-mint-111');
    expect(msg).toContain('LP drained');
    expect(msg).toContain('99/100');
  });

  it('does not throw when sendRequest rejects (fire-and-forget)', async () => {
    mockIsAvailable.mockReturnValue(true);
    useAlertPrefsStore.setState({
      channels: { telegram: true, whatsapp: false, discord: false, push: false },
      escalationRules: [{ alertType: 'rug', channels: ['telegram'] }],
      enrichmentEnabled: true,
    });
    mockSendRequest.mockRejectedValueOnce(new Error('Network error'));

    expect(() => routeAlertToChannels(makeAlert())).not.toThrow();
    await Promise.resolve();
  });
});

// ─── enrichAlert ─────────────────────────────────────────────────────────────

describe('enrichAlert', () => {
  it('returns null when OpenClaw is unavailable', async () => {
    mockIsAvailable.mockReturnValue(false);
    const result = await enrichAlert(makeAlert());
    expect(result).toBeNull();
    expect(mockSendRequest).not.toHaveBeenCalled();
  });

  it('sends chat.send request with alert details', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({
      summary: 'Deployer scam',
      relatedTokens: ['m1'],
      riskDelta: 20,
      recommendedAction: 'Avoid',
    });

    await enrichAlert(makeAlert({ type: 'rug', token_name: 'FooToken', mint: 'foo123' }));

    expect(mockSendRequest).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      sessionKey: 'lineage:alert-enrichment',
      responseFormat: 'json',
    }));

    const msg = (mockSendRequest.mock.calls[0][1] as { message: string }).message;
    expect(msg).toContain('rug');
    expect(msg).toContain('FooToken');
    expect(msg).toContain('foo123');
  });

  it('returns enrichment data when response has summary field', async () => {
    mockIsAvailable.mockReturnValue(true);
    const enriched = {
      summary: 'Deployer has 15 prior rugs',
      relatedTokens: ['mint1', 'mint2'],
      riskDelta: 30,
      recommendedAction: 'Sell immediately',
    };
    mockSendRequest.mockResolvedValueOnce(enriched);

    const result = await enrichAlert(makeAlert());
    expect(result).toEqual(enriched);
  });

  it('parses JSON string response', async () => {
    mockIsAvailable.mockReturnValue(true);
    const enriched = { summary: 'Parsed from string', relatedTokens: [], riskDelta: 5 };
    mockSendRequest.mockResolvedValueOnce(JSON.stringify(enriched));

    const result = await enrichAlert(makeAlert());
    expect(result).toEqual(enriched);
  });

  it('returns null when response does not have a summary field', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce({ unexpected: 'field' });

    const result = await enrichAlert(makeAlert());
    expect(result).toBeNull();
  });

  it('returns null when sendRequest throws', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockRejectedValueOnce(new Error('Timeout'));

    const result = await enrichAlert(makeAlert());
    expect(result).toBeNull();
  });

  it('returns null when response is an invalid JSON string', async () => {
    mockIsAvailable.mockReturnValue(true);
    mockSendRequest.mockResolvedValueOnce('not json {{{');

    const result = await enrichAlert(makeAlert());
    expect(result).toBeNull();
  });
});

// ─── Message formatting ───────────────────────────────────────────────────────

describe('formatAlertMessage (via routeAlertToChannels)', () => {
  beforeEach(() => {
    mockIsAvailable.mockReturnValue(true);
    useAlertPrefsStore.setState({
      channels: { telegram: true, whatsapp: false, discord: false, push: false },
      escalationRules: [{ alertType: '*', channels: ['telegram'] }],
      enrichmentEnabled: true,
    });
  });

  it('uses 🚨 emoji and CRITICAL for rug alerts', () => {
    routeAlertToChannels(makeAlert({ type: 'rug' }));
    const msg = (mockSendRequest.mock.calls[0][1] as { message: string }).message;
    expect(msg).toContain('🚨');
    expect(msg).toContain('CRITICAL');
  });

  it('uses ⚠️ emoji and WARNING for insider alerts', () => {
    routeAlertToChannels(makeAlert({ type: 'insider' }));
    const msg = (mockSendRequest.mock.calls[0][1] as { message: string }).message;
    expect(msg).toContain('⚠️');
    expect(msg).toContain('WARNING');
  });

  it('uses ℹ️ emoji and INFO for narrative alerts', () => {
    routeAlertToChannels(makeAlert({ type: 'narrative' }));
    const msg = (mockSendRequest.mock.calls[0][1] as { message: string }).message;
    expect(msg).toContain('ℹ️');
    expect(msg).toContain('INFO');
  });

  it('omits mint line when mint is not present', () => {
    routeAlertToChannels(makeAlert({ mint: undefined }));
    const msg = (mockSendRequest.mock.calls[0][1] as { message: string }).message;
    expect(msg).not.toContain('**Mint:**');
  });

  it('omits token_name line when not present', () => {
    routeAlertToChannels(makeAlert({ token_name: undefined }));
    const msg = (mockSendRequest.mock.calls[0][1] as { message: string }).message;
    expect(msg).not.toContain('**Token:**');
  });
});
