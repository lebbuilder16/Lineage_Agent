// Tests for OpenClaw-related Zustand stores:
//   - useOpenClawStore
//   - useAlertPrefsStore
//   - useAlertsStore (updateEnrichment, markDelivered)

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
}));

import { useOpenClawStore } from '../store/openclaw';
import { useAlertPrefsStore } from '../store/alert-prefs';
import { useAlertsStore } from '../store/alerts';
import type { AlertItem } from '../types/api';

// ─── useOpenClawStore ─────────────────────────────────────────────────────────

describe('useOpenClawStore', () => {
  beforeEach(() => {
    useOpenClawStore.setState({
      host: null,
      deviceToken: null,
      connected: false,
      status: 'unconfigured',
      paired: false,
    });
  });

  it('has correct initial state', () => {
    const s = useOpenClawStore.getState();
    expect(s.host).toBeNull();
    expect(s.deviceToken).toBeNull();
    expect(s.connected).toBe(false);
    expect(s.status).toBe('unconfigured');
    expect(s.paired).toBe(false);
  });

  it('setHost updates host', () => {
    useOpenClawStore.getState().setHost('192.168.1.50:18789');
    expect(useOpenClawStore.getState().host).toBe('192.168.1.50:18789');
  });

  it('setDeviceToken updates deviceToken', () => {
    useOpenClawStore.getState().setDeviceToken('tok-abc123');
    expect(useOpenClawStore.getState().deviceToken).toBe('tok-abc123');
  });

  it('setConnected updates connected', () => {
    useOpenClawStore.getState().setConnected(true);
    expect(useOpenClawStore.getState().connected).toBe(true);
    useOpenClawStore.getState().setConnected(false);
    expect(useOpenClawStore.getState().connected).toBe(false);
  });

  it('setStatus updates status', () => {
    useOpenClawStore.getState().setStatus('connected');
    expect(useOpenClawStore.getState().status).toBe('connected');

    useOpenClawStore.getState().setStatus('reconnecting');
    expect(useOpenClawStore.getState().status).toBe('reconnecting');

    useOpenClawStore.getState().setStatus('offline');
    expect(useOpenClawStore.getState().status).toBe('offline');
  });

  it('setPaired updates paired', () => {
    useOpenClawStore.getState().setPaired(true);
    expect(useOpenClawStore.getState().paired).toBe(true);
  });

  it('reset() restores all state to initial values', () => {
    useOpenClawStore.setState({
      host: 'host:1234',
      deviceToken: 'tok',
      connected: true,
      status: 'connected',
      paired: true,
    });

    useOpenClawStore.getState().reset();

    const s = useOpenClawStore.getState();
    expect(s.host).toBeNull();
    expect(s.deviceToken).toBeNull();
    expect(s.connected).toBe(false);
    expect(s.status).toBe('unconfigured');
    expect(s.paired).toBe(false);
  });

  it('setHost(null) clears host', () => {
    useOpenClawStore.setState({ host: 'something' });
    useOpenClawStore.getState().setHost(null);
    expect(useOpenClawStore.getState().host).toBeNull();
  });
});

// ─── useAlertPrefsStore ───────────────────────────────────────────────────────

describe('useAlertPrefsStore', () => {
  beforeEach(() => {
    // Reset to defaults
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

  it('has push enabled and external channels disabled by default', () => {
    const { channels } = useAlertPrefsStore.getState();
    expect(channels.push).toBe(true);
    expect(channels.telegram).toBe(false);
    expect(channels.whatsapp).toBe(false);
    expect(channels.discord).toBe(false);
  });

  it('has 7 default escalation rules', () => {
    expect(useAlertPrefsStore.getState().escalationRules).toHaveLength(7);
  });

  it('enrichmentEnabled is true by default', () => {
    expect(useAlertPrefsStore.getState().enrichmentEnabled).toBe(true);
  });

  it('setChannelEnabled toggles a channel', () => {
    useAlertPrefsStore.getState().setChannelEnabled('telegram', true);
    expect(useAlertPrefsStore.getState().channels.telegram).toBe(true);

    useAlertPrefsStore.getState().setChannelEnabled('telegram', false);
    expect(useAlertPrefsStore.getState().channels.telegram).toBe(false);
  });

  it('setChannelEnabled does not affect other channels', () => {
    useAlertPrefsStore.getState().setChannelEnabled('discord', true);
    const { channels } = useAlertPrefsStore.getState();
    expect(channels.telegram).toBe(false);
    expect(channels.whatsapp).toBe(false);
    expect(channels.push).toBe(true);
    expect(channels.discord).toBe(true);
  });

  it('setEscalationRules replaces all rules', () => {
    const newRules = [{ alertType: '*', channels: ['telegram' as const] }];
    useAlertPrefsStore.getState().setEscalationRules(newRules);
    expect(useAlertPrefsStore.getState().escalationRules).toEqual(newRules);
  });

  it('setEnrichmentEnabled toggles enrichment', () => {
    useAlertPrefsStore.getState().setEnrichmentEnabled(false);
    expect(useAlertPrefsStore.getState().enrichmentEnabled).toBe(false);

    useAlertPrefsStore.getState().setEnrichmentEnabled(true);
    expect(useAlertPrefsStore.getState().enrichmentEnabled).toBe(true);
  });

  it('rug rule targets whatsapp and push', () => {
    const rugRule = useAlertPrefsStore.getState().escalationRules.find((r) => r.alertType === 'rug');
    expect(rugRule?.channels).toContain('whatsapp');
    expect(rugRule?.channels).toContain('push');
  });

  it('death_clock rule targets telegram and push', () => {
    const rule = useAlertPrefsStore.getState().escalationRules.find((r) => r.alertType === 'death_clock');
    expect(rule?.channels).toContain('telegram');
    expect(rule?.channels).toContain('push');
  });
});

// ─── useAlertsStore — updateEnrichment / markDelivered ───────────────────────

const makeAlert = (id: string): AlertItem => ({
  id,
  type: 'rug',
  message: 'Rug pull detected',
  timestamp: new Date().toISOString(),
  read: false,
});

describe('useAlertsStore', () => {
  beforeEach(() => {
    useAlertsStore.setState({ alerts: [], wsConnected: false });
  });

  describe('addAlert', () => {
    it('prepends alert to list', () => {
      useAlertsStore.getState().addAlert(makeAlert('a1'));
      useAlertsStore.getState().addAlert(makeAlert('a2'));
      const { alerts } = useAlertsStore.getState();
      expect(alerts[0].id).toBe('a2');
      expect(alerts[1].id).toBe('a1');
    });

    it('caps list at 500 alerts', () => {
      for (let i = 0; i < 505; i++) {
        useAlertsStore.getState().addAlert(makeAlert(`a${i}`));
      }
      expect(useAlertsStore.getState().alerts).toHaveLength(500);
    });
  });

  describe('updateEnrichment', () => {
    it('sets enrichedData on the matching alert', () => {
      useAlertsStore.getState().addAlert(makeAlert('x1'));
      const enrichment = {
        summary: 'Deployer has 15 prior rugs',
        relatedTokens: ['mint1', 'mint2'],
        riskDelta: 25,
        recommendedAction: 'Avoid',
      };
      useAlertsStore.getState().updateEnrichment('x1', enrichment);

      const alert = useAlertsStore.getState().alerts.find((a) => a.id === 'x1');
      expect(alert?.enrichedData).toEqual(enrichment);
    });

    it('does not affect other alerts', () => {
      useAlertsStore.getState().addAlert(makeAlert('x1'));
      useAlertsStore.getState().addAlert(makeAlert('x2'));
      useAlertsStore.getState().updateEnrichment('x1', {
        summary: 'enriched',
        relatedTokens: [],
        riskDelta: 0,
      });

      const x2 = useAlertsStore.getState().alerts.find((a) => a.id === 'x2');
      expect(x2?.enrichedData).toBeUndefined();
    });

    it('is a no-op for non-existent id', () => {
      useAlertsStore.getState().addAlert(makeAlert('x1'));
      useAlertsStore.getState().updateEnrichment('ghost', {
        summary: 'ghost',
        relatedTokens: [],
        riskDelta: 0,
      });
      // x1 should be unaffected
      const x1 = useAlertsStore.getState().alerts.find((a) => a.id === 'x1');
      expect(x1?.enrichedData).toBeUndefined();
    });
  });

  describe('markDelivered', () => {
    it('sets deliveredChannels on the matching alert', () => {
      useAlertsStore.getState().addAlert(makeAlert('d1'));
      useAlertsStore.getState().markDelivered('d1', ['telegram', 'push']);

      const alert = useAlertsStore.getState().alerts.find((a) => a.id === 'd1');
      expect(alert?.deliveredChannels).toEqual(['telegram', 'push']);
    });

    it('overwrites existing deliveredChannels', () => {
      useAlertsStore.getState().addAlert({ ...makeAlert('d2'), deliveredChannels: ['discord'] });
      useAlertsStore.getState().markDelivered('d2', ['whatsapp']);

      const alert = useAlertsStore.getState().alerts.find((a) => a.id === 'd2');
      expect(alert?.deliveredChannels).toEqual(['whatsapp']);
    });
  });

  describe('unreadCount', () => {
    it('returns number of unread alerts', () => {
      useAlertsStore.getState().addAlert({ ...makeAlert('u1'), read: false });
      useAlertsStore.getState().addAlert({ ...makeAlert('u2'), read: true });
      useAlertsStore.getState().addAlert({ ...makeAlert('u3'), read: false });

      expect(useAlertsStore.getState().unreadCount()).toBe(2);
    });
  });

  describe('markAllRead', () => {
    it('marks all alerts as read', () => {
      useAlertsStore.getState().addAlert(makeAlert('r1'));
      useAlertsStore.getState().addAlert(makeAlert('r2'));
      useAlertsStore.getState().markAllRead();

      const { alerts } = useAlertsStore.getState();
      expect(alerts.every((a) => a.read)).toBe(true);
    });
  });

  describe('deleteAlert', () => {
    it('removes the alert with the given id', () => {
      useAlertsStore.getState().addAlert(makeAlert('del1'));
      useAlertsStore.getState().addAlert(makeAlert('del2'));
      useAlertsStore.getState().deleteAlert('del1');

      const { alerts } = useAlertsStore.getState();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('del2');
    });
  });
});
